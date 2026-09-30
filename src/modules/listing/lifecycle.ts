import type { ListingStatus, Prisma } from '@/generated/prisma/client';
import { recordAuditEvent } from '@/modules/audit';
import { validateSession } from '@/modules/identity';
import { getPrismaClient } from '@/persistence/prisma';
import { LISTING_COMPLIANCE_TERMS_VERSION } from './compliance';
import { isUuid } from './ids';
import { validateListingContent, type ListingFieldErrors } from './validation';

// Transicoes do anuncio pelo dono, T1 a T6 (listing-lifecycle.md, secao 4;
// listing-contract.md, secoes 4.3, 4.4 e 5). Tudo acontece numa UNICA transacao,
// sob a trava de LINHA do anuncio (`FOR UPDATE`) -- a mesma que a gestao de
// imagens usa (media/upload.ts) --, adquirida numa busca ja filtrada pelo dono:
// estado, conteudo e imagens prontas sao lidos depois da trava, e nenhuma
// remocao de imagem concorrente passa no meio. A transicao, o aceite de
// conformidade (T1) e a auditoria critica (T1, T5, T6; data-model.md, DM-11.1)
// entram na mesma transacao do efeito (AR-9.4): se qualquer um falhar, nada fica.
//
// Idempotencia: anuncio ja no estado de destino responde sucesso sem gravar
// nada. Transicao fora da matriz e recusada; `closed` e `removed` sao
// terminais. O dono nunca produz `removed` (T7 a T9 sao da moderacao). O
// gatilho `listings_guard_status` do banco e defesa adicional, nao o mecanismo.
//
// Estas funcoes leem a sessao; a camada 'use server' fica em actions.ts.

export type LifecycleAction = 'publish' | 'discard' | 'pause' | 'reactivate' | 'close';

export type LifecycleFailureReason =
  | 'unauthenticated'
  | 'not_found'
  | 'invalid_transition'
  | 'compliance_required'
  | 'validation'
  | 'no_ready_image'
  | 'error';

export type LifecycleResult =
  | { success: true; status: ListingStatus; changed: boolean }
  | {
      success: false;
      reason: LifecycleFailureReason;
      error: string;
      status?: ListingStatus;
      fieldErrors?: ListingFieldErrors;
    };

const MESSAGES: Record<LifecycleFailureReason, string> = {
  unauthenticated: 'É necessário estar autenticado e com e-mail verificado.',
  not_found: 'Anúncio não encontrado.',
  invalid_transition: 'Esta ação não é possível no estado atual do anúncio. Atualize a página.',
  compliance_required:
    'Para publicar, confirme que o item não pertence a nenhuma categoria proibida.',
  validation: 'Revise os campos do anúncio antes de publicar.',
  no_ready_image: 'O anúncio precisa de pelo menos uma imagem pronta para ficar público.',
  error: 'Não foi possível concluir a operação. Tente novamente.',
};

interface TransitionRule {
  from: readonly ListingStatus[];
  to: ListingStatus;
  /** Exige conteudo valido e ao menos uma imagem `ready` (listing-contract.md, 4.3 e 4.4). */
  goesPublic: boolean;
}

export const TRANSITION_RULES: Record<LifecycleAction, TransitionRule> = {
  publish: { from: ['draft'], to: 'published', goesPublic: true }, // T1
  discard: { from: ['draft'], to: 'closed', goesPublic: false }, // T2
  pause: { from: ['published'], to: 'paused', goesPublic: false }, // T3
  reactivate: { from: ['paused'], to: 'published', goesPublic: true }, // T4
  close: { from: ['published', 'paused'], to: 'closed', goesPublic: false }, // T5, T6
};

/** Identificador da transicao na matriz de DEC-027, para auditoria e historico. */
export function transitionCode(from: ListingStatus, to: ListingStatus): string | null {
  const codes: Record<string, string> = {
    'draft>published': 'T1',
    'draft>closed': 'T2',
    'published>paused': 'T3',
    'paused>published': 'T4',
    'published>closed': 'T5',
    'paused>closed': 'T6',
  };
  return codes[`${from}>${to}`] ?? null;
}

/**
 * Transicoes que geram evento na trilha unica (DM-11.1): publicacao com o
 * aceite de conformidade, T5 e T6. T2, T3 e T4 ficam so em `listing_transitions`.
 */
export function auditEventFor(code: string): string | null {
  if (code === 'T1') return 'listing.published';
  if (code === 'T5' || code === 'T6') return 'listing.closed';
  return null;
}

/** Falha de dominio lancada dentro da transacao para desfaze-la. */
class LifecycleAbort extends Error {
  constructor(
    readonly reason: LifecycleFailureReason,
    readonly status?: ListingStatus,
    readonly fieldErrors?: ListingFieldErrors,
  ) {
    super(reason);
  }
}

interface LockedListing {
  id: string;
  status: ListingStatus;
  title: string;
  description: string;
  city: string;
  uf: string;
}

async function lockOwnedListing(
  tx: Prisma.TransactionClient,
  listingId: string,
  ownerId: string,
): Promise<LockedListing | null> {
  const rows = await tx.$queryRaw<LockedListing[]>`
    SELECT "id", "status"::text AS "status", "title", "description", "city", "uf"
    FROM "listings"
    WHERE "id" = ${listingId}::uuid AND "owner_id" = ${ownerId}::uuid
    FOR UPDATE`;
  return rows[0] ?? null;
}

async function countReadyImages(tx: Prisma.TransactionClient, listingId: string): Promise<number> {
  const [{ ready }] = await tx.$queryRaw<{ ready: number }[]>`
    SELECT count(*)::int AS "ready" FROM "listing_images"
    WHERE "listing_id" = ${listingId}::uuid AND "status" = 'ready'`;
  return ready;
}

/** Grava o novo estado com o `now()` da transacao, o mesmo dos registros. */
async function applyStatus(
  tx: Prisma.TransactionClient,
  listingId: string,
  to: ListingStatus,
  from: ListingStatus,
): Promise<void> {
  if (to === 'closed') {
    await tx.$executeRaw`
      UPDATE "listings" SET "status" = 'closed', "closed_at" = now(), "updated_at" = now()
      WHERE "id" = ${listingId}::uuid`;
  } else if (to === 'paused') {
    await tx.$executeRaw`
      UPDATE "listings" SET "status" = 'paused', "paused_at" = now(), "updated_at" = now()
      WHERE "id" = ${listingId}::uuid`;
  } else if (from === 'draft') {
    // T1: primeira publicacao.
    await tx.$executeRaw`
      UPDATE "listings" SET "status" = 'published', "published_at" = now(), "updated_at" = now()
      WHERE "id" = ${listingId}::uuid`;
  } else {
    // T4: `published_at` guarda a primeira publicacao e nao muda na reativacao.
    await tx.$executeRaw`
      UPDATE "listings" SET "status" = 'published', "updated_at" = now()
      WHERE "id" = ${listingId}::uuid`;
  }
}

function failure(
  reason: LifecycleFailureReason,
  extra?: { status?: ListingStatus; fieldErrors?: ListingFieldErrors },
): LifecycleResult {
  return { success: false, reason, error: MESSAGES[reason], ...extra };
}

export interface TransitionOptions {
  /** T1: aceite expresso da declaracao de conformidade (prohibited-items.md, secao 5). */
  complianceAccepted?: boolean;
}

/**
 * Aplica a acao do dono ao anuncio. Anuncio alheio, inexistente ou com ID
 * malformado recebem a mesma resposta `not_found` (listing-contract.md, secao 7).
 */
export async function transitionListing(
  listingId: string,
  action: LifecycleAction,
  options: TransitionOptions = {},
): Promise<LifecycleResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return failure('unauthenticated');
  const actorId = session.user.id;
  if (!isUuid(listingId)) return failure('not_found');

  const rule = TRANSITION_RULES[action];

  try {
    return await getPrismaClient().$transaction(async (tx) => {
      const listing = await lockOwnedListing(tx, listingId, actorId);
      if (!listing) throw new LifecycleAbort('not_found');

      if (listing.status === rule.to) {
        return { success: true, status: listing.status, changed: false } satisfies LifecycleResult;
      }
      if (!rule.from.includes(listing.status)) {
        throw new LifecycleAbort('invalid_transition', listing.status);
      }

      const from = listing.status;
      const code = transitionCode(from, rule.to);
      if (!code) throw new LifecycleAbort('invalid_transition', from);

      if (action === 'publish' && options.complianceAccepted !== true) {
        throw new LifecycleAbort('compliance_required', from);
      }

      if (rule.goesPublic) {
        const content = validateListingContent({
          title: listing.title,
          description: listing.description,
          city: listing.city,
          state: listing.uf,
        });
        if (!content.ok) throw new LifecycleAbort('validation', from, content.fieldErrors);
        if ((await countReadyImages(tx, listing.id)) < 1) {
          throw new LifecycleAbort('no_ready_image', from);
        }
      }

      // Um unico instante para o efeito e seus registros: o `now()` da transacao
      // (o `@default(now())` do Prisma e preenchido no cliente, consulta a consulta).
      const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;
      await applyStatus(tx, listing.id, rule.to, from);
      await tx.listingTransition.create({
        data: {
          listingId: listing.id,
          actorId,
          fromStatus: from,
          toStatus: rule.to,
          occurredAt: at,
        },
      });

      let acceptanceId: string | undefined;
      if (code === 'T1') {
        const acceptance = await tx.termsAcceptance.create({
          data: {
            userId: actorId,
            listingId: listing.id,
            type: 'listing_compliance',
            termsVersion: LISTING_COMPLIANCE_TERMS_VERSION,
            acceptedAt: at,
          },
          select: { id: true },
        });
        acceptanceId = acceptance.id;
      }

      const eventType = auditEventFor(code);
      if (eventType) {
        await recordAuditEvent(tx, {
          eventType,
          actorId,
          targetType: 'listing',
          targetId: listing.id,
          result: 'success',
          occurredAt: at,
          details: {
            transition: code,
            fromStatus: from,
            toStatus: rule.to,
            ...(acceptanceId
              ? { termsAcceptanceId: acceptanceId, termsVersion: LISTING_COMPLIANCE_TERMS_VERSION }
              : {}),
          },
        });
      }

      return { success: true, status: rule.to, changed: true } satisfies LifecycleResult;
    });
  } catch (err) {
    if (err instanceof LifecycleAbort) {
      return failure(err.reason, { status: err.status, fieldErrors: err.fieldErrors });
    }
    console.error('[listing] falha na transicao do anuncio', {
      listingId,
      action,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return failure('error');
  }
}
