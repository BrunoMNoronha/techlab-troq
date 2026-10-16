import type { NegotiationStatus, Prisma } from '@/generated/prisma/client';
import { recordAuditEvent } from '@/modules/audit';
import { validateSession, type SessionValidationResult } from '@/modules/identity';
import { lockListingForRequest } from '@/modules/listing';
import { getPrismaClient } from '@/persistence/prisma';

// DEC-029, DM-8.6: apenas as partes encerram, com confirmacao explicita.
// A ordem anuncio -> negociacao e a mesma da escolha/reselecao. O anuncio
// pode estar em qualquer estado: seu ciclo e independente da negociacao.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NegotiationReadFailureReason =
  'login_required' | 'email_unverified' | 'account_restricted' | 'not_found' | 'error';
export type ClosureFailureReason = NegotiationReadFailureReason | 'confirmation_required';

const MESSAGES: Record<ClosureFailureReason, string> = {
  login_required: 'Entre na sua conta para acessar a negociação.',
  email_unverified: 'Confirme seu e-mail para acessar a negociação.',
  account_restricted: 'Sua conta não pode acessar a negociação.',
  not_found: 'Negociação não encontrada.',
  confirmation_required: 'Confirme o encerramento da negociação para continuar.',
  error: 'Não foi possível acessar a negociação. Tente novamente.',
};

function failure<R extends ClosureFailureReason>(reason: R) {
  return { success: false, reason, error: MESSAGES[reason] } as const;
}

function sessionReason(reason: SessionValidationResult['reason']): NegotiationReadFailureReason {
  if (reason === 'unverified') return 'email_unverified';
  if (reason === 'blocked' || reason === 'deletion_requested') return 'account_restricted';
  return 'login_required';
}

export interface OwnNegotiationView {
  negotiationId: string;
  listingId: string;
  status: NegotiationStatus;
  /** ISO 8601; null enquanto active. */
  closedAt: string | null;
  role: 'owner' | 'chosen';
  counterpartDisplayName: string;
}

export type OwnNegotiationResult =
  | { success: true; negotiation: OwnNegotiationView }
  | { success: false; reason: NegotiationReadFailureReason; error: string };
export type OwnedListingNegotiationsResult =
  | { success: true; negotiations: OwnNegotiationView[] }
  | { success: false; reason: NegotiationReadFailureReason; error: string };

const PRIVATE_SELECT = {
  id: true,
  listingId: true,
  ownerId: true,
  status: true,
  closedAt: true,
  owner: { select: { displayName: true } },
  chosen: { select: { displayName: true } },
} as const satisfies Prisma.NegotiationSelect;

type PrivateNegotiation = Prisma.NegotiationGetPayload<{ select: typeof PRIVATE_SELECT }>;

function ownView(row: PrivateNegotiation, actorId: string): OwnNegotiationView {
  const owner = row.ownerId === actorId;
  return {
    negotiationId: row.id,
    listingId: row.listingId,
    status: row.status,
    closedAt: row.closedAt?.toISOString() ?? null,
    role: owner ? 'owner' : 'chosen',
    counterpartDisplayName: owner ? row.chosen.displayName : row.owner.displayName,
  };
}

/** Consulta privada do participante, incluindo historico depois de reselecao. */
export async function getOwnNegotiation(negotiationId: string): Promise<OwnNegotiationResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return failure(sessionReason(session.reason));
  if (typeof negotiationId !== 'string' || !UUID_PATTERN.test(negotiationId)) {
    return failure('not_found');
  }
  try {
    const row = await getPrismaClient().negotiation.findFirst({
      where: {
        id: negotiationId,
        OR: [{ ownerId: session.user.id }, { chosenId: session.user.id }],
      },
      select: PRIVATE_SELECT,
    });
    return row
      ? { success: true, negotiation: ownView(row, session.user.id) }
      : failure('not_found');
  } catch (err) {
    logError(err);
    return failure('error');
  }
}

/** So o dono lista as relacoes do seu anuncio; nao descarta as encerradas. */
export async function listOwnedListingNegotiations(
  listingId: string,
): Promise<OwnedListingNegotiationsResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return failure(sessionReason(session.reason));
  if (typeof listingId !== 'string' || !UUID_PATTERN.test(listingId)) return failure('not_found');
  try {
    const db = getPrismaClient();
    const listing = await db.listing.findFirst({
      where: { id: listingId, ownerId: session.user.id },
      select: { id: true },
    });
    if (!listing) return failure('not_found');
    const rows = await db.negotiation.findMany({
      where: { listingId, ownerId: session.user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: PRIVATE_SELECT,
    });
    return { success: true, negotiations: rows.map((row) => ownView(row, session.user!.id)) };
  } catch (err) {
    logError(err);
    return failure('error');
  }
}

/** Projecao interna entre modulos; nao e DTO de pagina nem Server Action. */
export interface NegotiationParticipantRecord {
  id: string;
  listingId: string;
  ownerId: string;
  chosenId: string;
  status: NegotiationStatus;
  closedAt: Date | null;
}

/**
 * Serializa avaliacao na mesma linha e autoriza o participante. Avaliacao nao
 * trava anuncio depois disto; encerramento adquire primeiro a trava do anuncio.
 */
export async function lockNegotiationForRating(
  tx: Prisma.TransactionClient,
  negotiationId: string,
  actorId: string,
): Promise<NegotiationParticipantRecord | null> {
  if (
    typeof negotiationId !== 'string' ||
    !UUID_PATTERN.test(negotiationId) ||
    typeof actorId !== 'string' ||
    !UUID_PATTERN.test(actorId)
  ) {
    return null;
  }
  const rows = await tx.$queryRaw<NegotiationParticipantRecord[]>`
    SELECT "id"::text AS "id", "listing_id"::text AS "listingId",
      "owner_id"::text AS "ownerId", "chosen_id"::text AS "chosenId",
      "status"::text AS "status", "closed_at" AS "closedAt"
    FROM "negotiations"
    WHERE "id" = ${negotiationId}::uuid
      AND ("owner_id" = ${actorId}::uuid OR "chosen_id" = ${actorId}::uuid)
    FOR UPDATE`;
  return rows[0] ?? null;
}

export interface CloseNegotiationInput {
  negotiationId: string;
  confirmed: boolean;
}

export type CloseNegotiationResult =
  | { success: true; negotiationId: string; closedAt: string; changed: boolean }
  | { success: false; reason: ClosureFailureReason; error: string };

/** Regra do comando; a fronteira chamavel pelo cliente fica em actions.ts. */
export async function closeNegotiationFlow(
  input: CloseNegotiationInput,
): Promise<CloseNegotiationResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return failure(sessionReason(session.reason));
  if (input?.confirmed !== true) return failure('confirmation_required');
  const negotiationId = input.negotiationId;
  if (typeof negotiationId !== 'string' || !UUID_PATTERN.test(negotiationId)) {
    return failure('not_found');
  }
  const actorId = session.user.id;
  try {
    return await getPrismaClient().$transaction(async (tx): Promise<CloseNegotiationResult> => {
      // Descobre a trava sem tocar em recurso de terceiro nem expor existencia.
      const reference = await tx.negotiation.findFirst({
        where: { id: negotiationId, OR: [{ ownerId: actorId }, { chosenId: actorId }] },
        select: { listingId: true },
      });
      if (!reference) return failure('not_found');
      const listing = await lockListingForRequest(tx, reference.listingId);
      if (!listing) return failure('not_found');
      const negotiation = await lockNegotiationForRating(tx, negotiationId, actorId);
      if (!negotiation || negotiation.listingId !== listing.id) return failure('not_found');

      if (negotiation.status === 'closed') {
        if (!negotiation.closedAt) throw new Error('negotiation_closed_without_timestamp');
        return {
          success: true,
          negotiationId,
          closedAt: negotiation.closedAt.toISOString(),
          changed: false,
        };
      }

      // Instante do ato depois da espera na trava, sem antecipar a janela de avaliacao.
      const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS "at"`;
      await tx.negotiation.update({
        where: { id: negotiation.id },
        data: { status: 'closed', closedAt: at, closedById: actorId, updatedAt: at },
        select: { id: true },
      });
      // Falha da trilha desfaz a transicao inteira. Retry ja fechado nao audita de novo.
      await recordAuditEvent(tx, {
        eventType: 'negotiation.closed',
        actorId,
        targetType: 'negotiation',
        targetId: negotiation.id,
        result: 'success',
        occurredAt: at,
        details: {
          listingId: negotiation.listingId,
          previousStatus: 'active',
          newStatus: 'closed',
          role: negotiation.ownerId === actorId ? 'owner' : 'chosen',
        },
      });
      return { success: true, negotiationId, closedAt: at.toISOString(), changed: true };
    });
  } catch (err) {
    logError(err);
    return failure('error');
  }
}

function logError(err: unknown): void {
  console.error('[negotiation] falha ao acessar a negociacao', {
    error: err instanceof Error ? err.name : 'unknown',
  });
}
