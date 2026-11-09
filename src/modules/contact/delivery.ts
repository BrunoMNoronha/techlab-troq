import type { Prisma } from '@/generated/prisma/client';
import { recordAuditEvent } from '@/modules/audit';
import { validateSession } from '@/modules/identity';
import { getPrismaClient } from '@/persistence/prisma';

// Segunda operacao de CR-2.2: obter o contato autorizado (F3-010, #100;
// contact-release.md, CR-5 a CR-7). Server-only e fora de actions.ts de
// proposito: a Server Action que expoe a entrega fica em `src/app/contatos`,
// onde a porta da cadeia e composta.
//
// A pergunta e sempre "dado este ator autenticado, quais autorizacoes sao
// dele?" (CR-5.3): a autorizacao e buscada pelo id E pelo destinatario = ator,
// nunca so pelo id vindo do cliente. A cada leitura, no instante dela:
//   A1 sessao valida e email verificado; A6 conta ativa (`validateSession`);
//   A2 + A3 existe `ContactRelease` cujo destinatario e o ator;
//   A4 + A5 a cadeia negociacao -> escolha -> solicitacao -> anuncio e a mesma
//   e a solicitacao esta `paid` -- conferidas pela porta `ContactChainCheck`,
//   que `negotiation` implementa: `request` depende de `contact` (DEC-040), e
//   `contact` -> `request` seria ciclo (conventions.md, secao 2.2).
//
// Entrega: `ContactAccessEvent` + `contact.delivered` na MESMA transacao da
// leitura (CR-5.5). Negativa: `contact.access_denied` so na trilha (nota de
// CR-5.5, DM-11.3), com o motivo codificado e sem dado do titular, e a mesma
// resposta para qualquer motivo (CR-5.4). O numero nunca vai a log, auditoria
// nem mensagem de erro (CR-6.1). A reversao do pagamento nao bloqueia a
// releitura (CR-4.3): A5 olha a solicitacao, nao a tentativa.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O que a porta recebe: a autorizacao ja amarrada ao ator, sem o numero. */
export interface AuthorizedRelease {
  id: string;
  negotiationId: string;
  listingId: string;
  contactRequestId: string;
  ownerId: string;
  recipientId: string;
}

/**
 * A4 e A5 (CR-5.2): a correlacao da autorizacao com a negociacao, a escolha, a
 * solicitacao e o anuncio, e a solicitacao em `paid` AGORA. Roda dentro da
 * transacao da leitura. Devolve `true` so se tudo confere.
 */
export type ContactChainCheck = (
  tx: Prisma.TransactionClient,
  release: AuthorizedRelease,
) => Promise<boolean>;

/** Motivos codificados da negativa, so para a trilha. Nunca saem na resposta. */
export type ContactDenialReason =
  | 'no_session'
  | 'unverified'
  | 'account_restricted'
  | 'not_recipient'
  | 'chain_mismatch'
  | 'no_contact'
  | 'error';

export type ContactDeliveryResult =
  | { success: true; phone: string }
  | { success: false; reason: 'login_required' | 'unavailable'; error: string };

const UNAVAILABLE: ContactDeliveryResult = {
  success: false,
  reason: 'unavailable',
  error: 'Contato indisponível.',
};
const LOGIN_REQUIRED: ContactDeliveryResult = {
  success: false,
  reason: 'login_required',
  error: 'Entre na sua conta para ver o contato.',
};

class DeliveryDenied extends Error {
  constructor(readonly code: ContactDenialReason) {
    super(code);
  }
}

/** Registra a negativa numa transacao propria: a da leitura ja foi desfeita. */
async function recordDenial(
  actorId: string | null,
  releaseId: string,
  code: ContactDenialReason,
): Promise<void> {
  try {
    await getPrismaClient().$transaction((tx) =>
      recordAuditEvent(tx, {
        eventType: 'contact.access_denied',
        actorId,
        targetType: 'contact_release',
        // O id pedido pelo cliente, so se tiver a forma de um id: nao revela
        // nada (nem existe FK) e permite ver uma sondagem num incidente.
        targetId: UUID_PATTERN.test(releaseId) ? releaseId : null,
        result: 'denied',
        details: { reason: code },
      }),
    );
  } catch (err) {
    console.error('[contact] falha ao registrar a negativa de acesso', {
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
}

/**
 * Entrega o contato do anunciante ao escolhido, se e somente se A1 a A6 valem
 * agora. `checkChain` e obrigatoria: sem ela nao ha como verificar A4 e A5, e a
 * entrega e negada (fail-closed).
 */
export async function deliverAuthorizedContact(
  releaseId: unknown,
  checkChain: ContactChainCheck,
): Promise<ContactDeliveryResult> {
  const requested = typeof releaseId === 'string' ? releaseId : '';
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    const code: ContactDenialReason =
      session.reason === 'unverified'
        ? 'unverified'
        : session.reason === 'blocked' || session.reason === 'deletion_requested'
          ? 'account_restricted'
          : 'no_session';
    await recordDenial(session.user?.id ?? null, requested, code);
    // A6: conta restrita recebe a mesma negativa do recurso; sem sessao, o login.
    return code === 'account_restricted' ? UNAVAILABLE : LOGIN_REQUIRED;
  }
  const actorId = session.user.id;

  try {
    if (!UUID_PATTERN.test(requested) || typeof checkChain !== 'function') {
      throw new DeliveryDenied('not_recipient');
    }
    const phone = await getPrismaClient().$transaction(async (tx) => {
      // A2 + A3: a autorizacao DESTE ator, nunca so a que o cliente nomeou.
      const release = await tx.contactRelease.findFirst({
        where: { id: requested, recipientId: actorId },
        select: {
          id: true,
          negotiationId: true,
          listingId: true,
          contactRequestId: true,
          ownerId: true,
          recipientId: true,
        },
      });
      if (!release) throw new DeliveryDenied('not_recipient');

      // A4 + A5, no estado atual.
      if (!(await checkChain(tx, release))) throw new DeliveryDenied('chain_mismatch');

      const contact = await tx.userContact.findUnique({
        where: { userId: release.ownerId },
        select: { phoneNumber: true },
      });
      if (!contact) throw new DeliveryDenied('no_contact');

      const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;
      const event = await tx.contactAccessEvent.create({
        data: { contactReleaseId: release.id, actorId, accessedAt: at },
        select: { id: true },
      });
      await recordAuditEvent(tx, {
        eventType: 'contact.delivered',
        actorId,
        targetType: 'contact_release',
        targetId: release.id,
        result: 'success',
        occurredAt: at,
        details: { negotiationId: release.negotiationId, contactAccessEventId: event.id },
      });
      return contact.phoneNumber;
    });
    return { success: true, phone };
  } catch (err) {
    const code = err instanceof DeliveryDenied ? err.code : 'error';
    if (code === 'error') {
      console.error('[contact] falha na entrega do contato', {
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
    await recordDenial(actorId, requested, code);
    return UNAVAILABLE;
  }
}

export interface OwnContactRelease {
  contactReleaseId: string;
  negotiationId: string;
  listingId: string;
  /** ISO 8601. */
  authorizedAt: string;
}

/**
 * Autorizacoes cujo destinatario e o ator autenticado, da mais recente para a
 * mais antiga, SEM o numero (CR-1.2: autorizar nao entrega). `null` sem
 * sessao valida. A lista orienta a tela; a entrega reverifica tudo.
 */
export async function listOwnContactReleases(): Promise<OwnContactRelease[] | null> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return null;
  const releases = await getPrismaClient().contactRelease.findMany({
    where: { recipientId: session.user.id },
    orderBy: { authorizedAt: 'desc' },
    select: { id: true, negotiationId: true, listingId: true, authorizedAt: true },
  });
  return releases.map((r) => ({
    contactReleaseId: r.id,
    negotiationId: r.negotiationId,
    listingId: r.listingId,
    authorizedAt: r.authorizedAt.toISOString(),
  }));
}
