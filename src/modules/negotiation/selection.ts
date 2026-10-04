import { randomUUID } from 'node:crypto';
import type { ListingStatus } from '@/generated/prisma/client';
import { recordAuditEvent } from '@/modules/audit';
import { authorizeContactReleaseInTx } from '@/modules/contact';
import { validateSession, type SessionValidationResult } from '@/modules/identity';
import { getListingGate, lockListingForRequest } from '@/modules/listing';
import { listEligibleRequests, lockRequestForSelection } from '@/modules/request';
import { getPrismaClient } from '@/persistence/prisma';

// Escolha do solicitante, abertura da negociacao e autorizacao de liberacao
// (F3-009, #99; contact-release.md, CR-3.2 a CR-3.4; data-model.md, DM-8;
// reselection-policy.md, DEC-032; RF-013).
//
// Um UNICO ato atomico (CR-3.3), nesta ordem, numa transacao:
//   trava de linha do anuncio (DM-6.12, a mesma da alocacao, da confirmacao e
//   de T5/T6) -> P1 dono -> trava da linha da solicitacao, que precisa ser
//   daquele anuncio (P2) -> P5 anuncio nao `removed` -> P4 solicitacao ainda
//   nao escolhida -> P3 `paid` com pagamento confirmado -> trava das
//   negociacoes do anuncio -> P7 nenhuma `active` (e RS-2) -> sendo reselecao
//   (RS-1), P6/RS-3 anuncio `published` -> `Selection` + `Negotiation`
//   `active` + `ContactRelease` + auditoria -> COMMIT.
//
// A GARANTIA de C-9 e do banco: `negotiations_active_per_listing_key` (DM-8.5)
// e `selections_contact_request_id_key` (DM-8.3). A trava so serializa; uma
// colisao que escape vira recusa limpa, nunca segunda negociacao.
//
// Primeira escolha x reselecao (reselection-policy.md, secao 6.1): a primeira
// vale para anuncio `published`, `paused` ou `closed`; a reselecao exige
// `published`. `removed` bloqueia as duas (DEC-027, secao 6).
//
// Repetir a escolha de quem ja e o escolhido da negociacao viva e idempotente
// (reselection-policy.md, secao 8): sucesso sem gravar nada. Escolher de novo
// quem ja foi escolhido numa negociacao encerrada e RS-5: recusado.
//
// Fora daqui: entrega do contato (F3-010, #100), encerramento da negociacao
// (Fase 4, #55) e a tela (F3-012, #102).

export type SelectionFailureReason =
  | 'login_required'
  | 'email_unverified'
  | 'account_restricted'
  | 'confirmation_required'
  | 'not_found'
  | 'listing_removed'
  | 'already_selected'
  | 'not_eligible'
  | 'negotiation_active'
  | 'listing_not_published'
  | 'conflict'
  | 'error';

export type SelectionKind = 'selection' | 'reselection';

export type SelectionResult =
  | {
      success: true;
      negotiationId: string;
      kind: SelectionKind;
      /** `false` na repeticao idempotente: nada foi gravado. */
      changed: boolean;
    }
  | { success: false; reason: SelectionFailureReason; error: string };

const MESSAGES: Record<SelectionFailureReason, string> = {
  login_required: 'Entre na sua conta para escolher um solicitante.',
  email_unverified: 'Confirme seu e-mail para escolher um solicitante.',
  account_restricted: 'Sua conta não pode escolher um solicitante.',
  confirmation_required: 'Confirme a escolha para continuar.',
  // Anuncio inexistente ou alheio, solicitacao inexistente ou de outro anuncio,
  // ID malformado: a mesma resposta, sem revelar existencia (CR-5.4).
  not_found: 'Solicitação não encontrada.',
  listing_removed: 'Este anúncio foi removido e não admite nova escolha.',
  already_selected: 'Esta solicitação já foi escolhida antes e não pode ser escolhida de novo.',
  not_eligible: 'Esta solicitação não está disponível para escolha.',
  negotiation_active:
    'Já existe uma negociação em andamento neste anúncio. Encerre-a antes de escolher outra pessoa.',
  listing_not_published: 'Para escolher outra pessoa, o anúncio precisa estar publicado.',
  conflict: 'Outra escolha foi registrada neste anúncio ao mesmo tempo. Atualize a página.',
  error: 'Não foi possível registrar a escolha. Tente novamente.',
};

function failure(reason: SelectionFailureReason): Extract<SelectionResult, { success: false }> {
  return { success: false, reason, error: MESSAGES[reason] };
}

type SessionFailureReason = 'login_required' | 'email_unverified' | 'account_restricted';

function sessionReason(reason: SessionValidationResult['reason']): SessionFailureReason {
  if (reason === 'unverified') return 'email_unverified';
  if (reason === 'blocked' || reason === 'deletion_requested') return 'account_restricted';
  return 'login_required';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Falha de dominio lancada dentro da transacao para desfaze-la. */
class SelectionAbort extends Error {
  constructor(readonly reason: SelectionFailureReason) {
    super(reason);
  }
}

/** Violacao de unicidade (P2002): so os indices de DM-8.3 e DM-8.5 colidem aqui. */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'P2002';
}

export interface SelectRequesterInput {
  listingId: string;
  contactRequestId: string;
  /** Confirmacao explicita do anunciante (DEC-032, secao 2). Sem ela, nada acontece. */
  confirmed: boolean;
}

/**
 * Escolhe a solicitacao paga para o anunciante autenticado. Le a sessao; a
 * camada `'use server'` fica em actions.ts.
 */
export async function selectRequester(input: SelectRequesterInput): Promise<SelectionResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return failure(sessionReason(session.reason));
  if (input?.confirmed !== true) return failure('confirmation_required');
  return selectForOwner(session.user.id, input.listingId, input.contactRequestId);
}

/** O ato atomico da escolha, para quem ja validou a sessao do anunciante. */
export async function selectForOwner(
  actorId: string,
  listingId: string,
  contactRequestId: string,
): Promise<SelectionResult> {
  if (
    typeof listingId !== 'string' ||
    typeof contactRequestId !== 'string' ||
    !UUID_PATTERN.test(listingId) ||
    !UUID_PATTERN.test(contactRequestId)
  ) {
    return failure('not_found');
  }

  try {
    return await getPrismaClient().$transaction(async (tx) => {
      const listing = await lockListingForRequest(tx, listingId);
      // P1: anuncio alheio responde como inexistente.
      if (!listing || listing.ownerId !== actorId) throw new SelectionAbort('not_found');

      // P2: a solicitacao e daquele anuncio. A linha fica travada ate o COMMIT.
      const request = await lockRequestForSelection(tx, listing.id, contactRequestId);
      if (!request) throw new SelectionAbort('not_found');

      // P5 (DEC-027, secao 6): `removed` nao admite escolha nem liberacao.
      if (listing.status === 'removed') throw new SelectionAbort('listing_removed');

      // P4 (RS-5, DM-8.3) e a repeticao idempotente.
      const previous = await tx.selection.findUnique({
        where: { contactRequestId: request.id },
        select: { negotiation: { select: { id: true, status: true } } },
      });
      if (previous) {
        if (previous.negotiation?.status === 'active') {
          const earlier = await tx.selection.count({
            where: { listingId: listing.id, contactRequestId: { not: request.id } },
          });
          return {
            success: true,
            negotiationId: previous.negotiation.id,
            kind: earlier > 0 ? 'reselection' : 'selection',
            changed: false,
          } satisfies SelectionResult;
        }
        throw new SelectionAbort('already_selected');
      }

      // P3 (RB-001, CR-4.1; RS-4): `paid` com pagamento confirmado, sob a trava.
      if (!request.eligible || !request.paymentId) throw new SelectionAbort('not_eligible');

      // P7 (DM-8.5) e RS-2: nenhuma negociacao viva no anuncio. Travadas, para
      // serializar com o encerramento (Fase 4).
      const negotiations = await tx.$queryRaw<{ status: string }[]>`
        SELECT "status"::text AS "status" FROM "negotiations"
        WHERE "listing_id" = ${listing.id}::uuid
        FOR UPDATE`;
      if (negotiations.some((n) => n.status === 'active')) {
        throw new SelectionAbort('negotiation_active');
      }

      // P6: reselecao = ja houve escolha neste anuncio (RS-1). Exige `published` (RS-3).
      const priorSelections = await tx.selection.count({ where: { listingId: listing.id } });
      const kind: SelectionKind = priorSelections > 0 ? 'reselection' : 'selection';
      if (kind === 'reselection' && listing.status !== 'published') {
        throw new SelectionAbort('listing_not_published');
      }

      // Um unico instante para o ato e seus registros (DM-6.12, item 4).
      const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;

      const selectionId = randomUUID();
      const negotiationId = randomUUID();
      await tx.selection.create({
        data: {
          id: selectionId,
          listingId: listing.id,
          contactRequestId: request.id,
          actorId,
          selectedAt: at,
        },
        select: { id: true },
      });
      await tx.negotiation.create({
        data: {
          id: negotiationId,
          selectionId,
          listingId: listing.id,
          ownerId: actorId,
          chosenId: request.requesterId,
          status: 'active',
          createdAt: at,
          updatedAt: at,
        },
        select: { id: true },
      });
      const { contactReleaseId } = await authorizeContactReleaseInTx(tx, {
        negotiationId,
        listingId: listing.id,
        contactRequestId: request.id,
        ownerId: actorId,
        recipientId: request.requesterId,
        paymentId: request.paymentId,
        at,
      });

      // CR-3.4: cada escolha e cada reselecao, auditadas independentemente.
      await recordAuditEvent(tx, {
        eventType: kind === 'reselection' ? 'negotiation.reselected' : 'negotiation.selected',
        actorId,
        targetType: 'selection',
        targetId: selectionId,
        result: 'success',
        occurredAt: at,
        details: {
          listingId: listing.id,
          listingStatus: listing.status,
          contactRequestId: request.id,
          chosenId: request.requesterId,
          negotiationId,
          contactReleaseId,
          priorSelections,
        },
      });

      return { success: true, negotiationId, kind, changed: true } satisfies SelectionResult;
    });
  } catch (err) {
    if (err instanceof SelectionAbort) return failure(err.reason);
    if (isUniqueViolation(err)) return failure('conflict');
    console.error('[negotiation] falha ao registrar a escolha', {
      error: err instanceof Error ? err.name : 'unknown',
    });
    return failure('error');
  }
}

// ---------------------------------------------------------------------------
// Dados para a interface do dono (PD-11.3)
// ---------------------------------------------------------------------------

export interface SelectionCandidate {
  contactRequestId: string;
  requesterDisplayName: string;
  /** ISO 8601. */
  paidAt: string;
}

export interface SelectionOptions {
  listingStatus: ListingStatus;
  /** A proxima escolha seria a primeira do anuncio ou uma reselecao. */
  mode: SelectionKind;
  /** Por que nenhuma escolha e possivel agora; `null` se ha como escolher. */
  blockedBy: 'listing_removed' | 'negotiation_active' | 'listing_not_published' | null;
  /** Negociacao viva do anuncio, se houver. */
  activeNegotiation: { negotiationId: string; chosenDisplayName: string } | null;
  /** Solicitacoes pagas elegiveis e ainda nao escolhidas (RS-4, RS-5). */
  candidates: SelectionCandidate[];
}

export type SelectionOptionsResult =
  | { success: true; options: SelectionOptions }
  | {
      success: false;
      reason: SessionFailureReason | 'not_found' | 'error';
      error: string;
    };

/**
 * O que o anunciante pode escolher agora, entregue pelo servidor. So o dono
 * recebe; qualquer outra pessoa recebe `not_found` (PD-11.3). Leitura sem
 * trava: orienta a tela, e `selectRequester` relê tudo sob a trava.
 */
export async function getSelectionOptions(listingId: string): Promise<SelectionOptionsResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    const reason = sessionReason(session.reason);
    return { success: false, reason, error: MESSAGES[reason] };
  }
  const notFound = { success: false, reason: 'not_found', error: MESSAGES.not_found } as const;

  try {
    const listing = await getListingGate(listingId);
    if (!listing || listing.ownerId !== session.user.id) return notFound;

    const db = getPrismaClient();
    const [selections, active, eligible] = await Promise.all([
      db.selection.findMany({
        where: { listingId: listing.id },
        select: { contactRequestId: true },
      }),
      db.negotiation.findFirst({
        where: { listingId: listing.id, status: 'active' },
        select: { id: true, chosen: { select: { displayName: true } } },
      }),
      listEligibleRequests(db, listing.id),
    ]);

    const selected = new Set(selections.map((s) => s.contactRequestId));
    const mode: SelectionKind = selections.length > 0 ? 'reselection' : 'selection';
    let blockedBy: SelectionOptions['blockedBy'] = null;
    if (listing.status === 'removed') blockedBy = 'listing_removed';
    else if (active) blockedBy = 'negotiation_active';
    else if (mode === 'reselection' && listing.status !== 'published') {
      blockedBy = 'listing_not_published';
    }

    return {
      success: true,
      options: {
        listingStatus: listing.status,
        mode,
        blockedBy,
        activeNegotiation: active
          ? { negotiationId: active.id, chosenDisplayName: active.chosen.displayName }
          : null,
        candidates: eligible
          .filter((r) => !selected.has(r.contactRequestId))
          .map((r) => ({
            contactRequestId: r.contactRequestId,
            requesterDisplayName: r.requesterDisplayName,
            paidAt: r.paidAt.toISOString(),
          })),
      },
    };
  } catch (err) {
    console.error('[negotiation] falha ao ler as opcoes de escolha', {
      error: err instanceof Error ? err.name : 'unknown',
    });
    return { success: false, reason: 'error', error: MESSAGES.error };
  }
}
