import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { recordAuditEvent } from '@/modules/audit';
import { validateSession, type SessionValidationResult } from '@/modules/identity';
import { lockListingForRequest } from '@/modules/listing';
import { createPaymentAttempt } from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';

// Solicitacao de desbloqueio com reserva atomica de vaga (F3-003, #93;
// payments-design.md, PD-4.1 passo 1; data-model.md, DM-6.2 a DM-6.12).
//
// Uma unica transacao, nesta ordem: trava de linha do anuncio (DM-6.12) ->
// anuncio `published` lido depois da trava (DM-6.9) -> o ator nao e o dono ->
// `now()` do banco -> expira as reservas vencidas do anuncio (DM-6.3, passo 2)
// -> menor `slotIndex` livre ou recusa (RB-003) -> `ContactRequest` em
// `reserved` por 30 minutos (PD-3.1) -> `PaymentAttempt` com a chave
// persistida (modulo `payments`, AR-3.5) -> auditoria -> COMMIT.
//
// A GARANTIA de no maximo tres e o indice unico parcial
// `contact_requests_listing_slot_occupied_key` (DM-6.2); a trava so serializa
// o comportamento (DM-6.4). Se uma colisao no indice escapar mesmo assim, ela
// vira recusa limpa, nunca quarta vaga nem erro cru.
//
// Nao chama o provedor: a cobranca e o passo 2 (F3-005, #95).

/** Janela de reserva: exatamente 30 minutos (PD-3.1). */
export const RESERVATION_WINDOW_MS = 30 * 60 * 1000;

/** Indices de vaga possiveis (DM-6.1; CHECK `slot_index BETWEEN 1 AND 3`). */
export const SLOT_INDEXES = [1, 2, 3] as const;

export type ContactRequestFailureReason =
  | 'login_required'
  | 'email_unverified'
  | 'account_restricted'
  | 'unavailable'
  | 'own_listing'
  | 'no_slots'
  | 'error';

export type ContactRequestResult =
  | { success: true; contactRequestId: string; reservedUntil: string }
  | { success: false; reason: ContactRequestFailureReason; error: string };

const MESSAGES: Record<ContactRequestFailureReason, string> = {
  login_required: 'Entre na sua conta para solicitar o desbloqueio do contato.',
  email_unverified: 'Confirme seu e-mail para solicitar o desbloqueio do contato.',
  account_restricted: 'Sua conta não pode solicitar o desbloqueio do contato.',
  // Inexistente, ID malformado, rascunho, pausado, encerrado ou removido: a
  // mesma resposta, sem revelar existencia nem estado (listing-lifecycle.md, 9).
  unavailable: 'Este anúncio não está disponível para solicitações.',
  own_listing: 'Você não pode solicitar o contato do próprio anúncio.',
  no_slots: 'As vagas de solicitação deste anúncio estão ocupadas no momento.',
  error: 'Não foi possível concluir a solicitação. Tente novamente.',
};

function failure(reason: ContactRequestFailureReason): ContactRequestResult {
  return { success: false, reason, error: MESSAGES[reason] };
}

function sessionFailure(reason: SessionValidationResult['reason']): ContactRequestResult {
  if (reason === 'unverified') return failure('email_unverified');
  if (reason === 'blocked' || reason === 'deletion_requested') {
    return failure('account_restricted');
  }
  return failure('login_required');
}

/** Falha de dominio lancada dentro da transacao para desfaze-la. */
class ReservationAbort extends Error {
  constructor(readonly reason: ContactRequestFailureReason) {
    super(reason);
  }
}

/** Menor indice livre entre 1, 2 e 3, ou `null` se as tres vagas estao ocupadas. */
export function lowestFreeSlot(occupied: readonly number[]): number | null {
  return SLOT_INDEXES.find((slot) => !occupied.includes(slot)) ?? null;
}

/** Violacao de unicidade (P2002), como identity/actions.ts: so o indice de vaga pode colidir aqui. */
function isSlotCollision(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'P2002';
}

/**
 * Expira as reservas vencidas do anuncio, no ato da alocacao (DM-6.3, passo 2;
 * AR-15.3: nenhum trabalho periodico e fonte desta regra).
 *
 * A condicao "sem pagamento acreditado tempestivo reconhecido" de DM-6.3 e
 * satisfeita por construcao: o reconhecimento de acreditacao tempestiva e
 * gravado na MESMA transacao que move a solicitacao para `paid` (PD-6.6, passo
 * 4), de modo que uma linha ainda `reserved` nunca tem esse reconhecimento.
 */
async function expireOverdueReservations(
  tx: Prisma.TransactionClient,
  listingId: string,
  actorId: string,
  at: Date,
): Promise<void> {
  const expired = await tx.$queryRaw<{ id: string; slotIndex: number }[]>`
    UPDATE "contact_requests"
    SET "status" = 'expired', "updated_at" = ${at}
    WHERE "listing_id" = ${listingId}::uuid
      AND "status" = 'reserved'
      AND "reserved_until" <= ${at}
    RETURNING "id"::text AS "id", "slot_index" AS "slotIndex"`;
  for (const row of expired) {
    await recordAuditEvent(tx, {
      eventType: 'request.reservation_expired',
      // A expiracao e efeito do tempo; o ator registrado e quem disparou a alocacao.
      actorId,
      targetType: 'contact_request',
      targetId: row.id,
      result: 'success',
      occurredAt: at,
      details: { listingId, slotIndex: row.slotIndex, trigger: 'allocation' },
    });
  }
}

async function occupiedSlots(tx: Prisma.TransactionClient, listingId: string): Promise<number[]> {
  const rows = await tx.$queryRaw<{ slotIndex: number }[]>`
    SELECT "slot_index" AS "slotIndex" FROM "contact_requests"
    WHERE "listing_id" = ${listingId}::uuid AND "status" IN ('reserved', 'paid')`;
  return rows.map((r) => r.slotIndex);
}

/** Tentativas da transacao de alocacao diante de colisao no indice de vaga. */
const MAX_ALLOCATION_ATTEMPTS = 3;
const SLOT_COLLISION = Symbol('slot-collision');

/**
 * Cria a solicitacao de desbloqueio do anuncio para a pessoa autenticada,
 * reservando uma das tres vagas por 30 minutos. Le a sessao; a camada
 * `'use server'` fica em actions.ts.
 */
export async function createContactRequest(listingId: string): Promise<ContactRequestResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return sessionFailure(session.reason);
  return reserveForRequester(listingId, session.user.id);
}

/** Recusa de sessao no vocabulario da solicitacao (para quem ja validou a sessao). */
export function sessionFailureResult(
  reason: SessionValidationResult['reason'],
): Extract<ContactRequestResult, { success: false }> {
  return sessionFailure(reason) as Extract<ContactRequestResult, { success: false }>;
}

/** Passo 1 de PD-4.1 para quem ja teve a sessao validada pelo chamador. */
export async function reserveForRequester(
  listingId: string,
  requesterId: string,
): Promise<ContactRequestResult> {
  // Com a trava, duas alocacoes do mesmo anuncio nao colidem no indice. Se uma
  // colisao escapar mesmo assim (DM-6.4), a transacao inteira e refeita: a
  // releitura ve a vaga ja ocupada e escolhe outra ou recusa por falta de vaga.
  for (let attempt = 1; attempt <= MAX_ALLOCATION_ATTEMPTS; attempt++) {
    const result = await allocate(listingId, requesterId);
    if (result !== SLOT_COLLISION) return result;
  }
  return failure('no_slots');
}

async function allocate(
  listingId: string,
  requesterId: string,
): Promise<ContactRequestResult | typeof SLOT_COLLISION> {
  try {
    return await getPrismaClient().$transaction(async (tx) => {
      const listing = await lockListingForRequest(tx, listingId);
      if (!listing || listing.status !== 'published') throw new ReservationAbort('unavailable');
      if (listing.ownerId === requesterId) throw new ReservationAbort('own_listing');

      // Um unico instante para o efeito e seus registros: o `now()` da transacao
      // (DM-6.12, item 4). `@default(now())` do Prisma e preenchido no cliente.
      const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;

      await expireOverdueReservations(tx, listing.id, requesterId, at);

      // OD-14 (limite de reservas nao pagas por conta) esta aberta: DM-6.11 vale
      // como esta. Se for decidida, a regra entra AQUI, sob a trava do anuncio.
      const slotIndex = lowestFreeSlot(await occupiedSlots(tx, listing.id));
      if (slotIndex === null) throw new ReservationAbort('no_slots');

      const contactRequestId = randomUUID();
      const reservedUntil = new Date(at.getTime() + RESERVATION_WINDOW_MS);
      await tx.contactRequest.create({
        data: {
          id: contactRequestId,
          listingId: listing.id,
          requesterId,
          slotIndex,
          status: 'reserved',
          reservedFrom: at,
          reservedUntil,
          createdAt: at,
          updatedAt: at,
        },
      });

      const attempt = await createPaymentAttempt(tx, {
        contactRequestId,
        actorId: requesterId,
        at,
      });

      await recordAuditEvent(tx, {
        eventType: 'request.reservation_created',
        actorId: requesterId,
        targetType: 'contact_request',
        targetId: contactRequestId,
        result: 'success',
        occurredAt: at,
        details: {
          listingId: listing.id,
          slotIndex,
          reservedUntil: reservedUntil.toISOString(),
          paymentAttemptId: attempt.id,
        },
      });

      return {
        success: true,
        contactRequestId,
        reservedUntil: reservedUntil.toISOString(),
      } satisfies ContactRequestResult;
    });
  } catch (err) {
    if (err instanceof ReservationAbort) return failure(err.reason);
    if (isSlotCollision(err)) return SLOT_COLLISION;
    console.error('[request] falha ao criar a solicitacao', {
      error: err instanceof Error ? err.name : 'unknown',
    });
    return failure('error');
  }
}
