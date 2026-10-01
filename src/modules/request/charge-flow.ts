import { validateSession, type AuthenticatedUser } from '@/modules/identity';
import { lockListingForRequest } from '@/modules/listing';
import { chargeForReservation, type ChargeDeps, type ChargeOrigin } from '@/modules/payments';
import type { PixPaymentDetails } from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';
import {
  reserveForRequester,
  sessionFailureResult,
  type ContactRequestFailureReason,
} from './reservation';

// Jornada do solicitante ate o Pix (F3-005, #95; PD-4.1 passos 1 a 3).
//
// `request` e dono da vaga (AR-3.5): ANTES de cada cobranca, decide sob a trava
// do anuncio se a reserva ainda a admite — e do solicitante, esta `reserved`,
// dentro da janela pelo relogio do banco, e o anuncio esta `published`
// (PD-6.11, item 1: pausado nao cria cobranca nem reapresenta QR). Depois do
// COMMIT dessa verificacao, `payments` cobra fora de transacao. A trava nunca e
// segurada durante a chamada de rede.
//
// Toda recusa por falta de direito usa a MESMA resposta (`unavailable`): nada
// revela se a solicitacao existe, de quem e, ou em que estado esta (PD-11.3).

export type PixChargeFailureReason = ContactRequestFailureReason | 'charge_unavailable';

export type PixChargeResult =
  | {
      success: true;
      contactRequestId: string;
      reservedUntil: string;
      /** `null`: a reserva existe, mas a cobranca nao pode ser criada agora; tentar de novo. */
      pix: PixPaymentDetails | null;
    }
  | { success: false; reason: PixChargeFailureReason; error: string };

const UNAVAILABLE = 'Esta solicitação não está disponível.';
const CHARGE_UNAVAILABLE =
  'Não foi possível gerar o Pix agora. Sua vaga continua reservada até o fim do prazo; tente novamente.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unavailable(): PixChargeResult {
  return { success: false, reason: 'unavailable', error: UNAVAILABLE };
}

interface ChargeGate {
  reservedUntil: Date;
  now: Date;
}

/**
 * Decide, sob a trava de linha do anuncio (DM-6.12), se a reserva do
 * solicitante ainda admite cobranca. Devolve `null` para qualquer recusa.
 */
async function authorizeCharge(
  contactRequestId: string,
  requesterId: string,
): Promise<ChargeGate | null> {
  if (!UUID.test(contactRequestId)) return null;
  return getPrismaClient().$transaction(async (tx) => {
    const [owner] = await tx.$queryRaw<{ listingId: string; requesterId: string }[]>`
      SELECT "listing_id"::text AS "listingId", "requester_id"::text AS "requesterId"
      FROM "contact_requests" WHERE "id" = ${contactRequestId}::uuid`;
    if (!owner || owner.requesterId !== requesterId) return null;

    const listing = await lockListingForRequest(tx, owner.listingId);
    if (!listing || listing.status !== 'published') return null;

    // Releitura DEPOIS da trava: o estado pode ter mudado por T5/T6 ou expiracao.
    const [row] = await tx.$queryRaw<{ status: string; reservedUntil: Date; now: Date }[]>`
      SELECT "status"::text AS "status", "reserved_until" AS "reservedUntil", now() AS "now"
      FROM "contact_requests" WHERE "id" = ${contactRequestId}::uuid`;
    if (!row || row.status !== 'reserved' || row.reservedUntil <= row.now) return null;
    return { reservedUntil: row.reservedUntil, now: row.now };
  });
}

async function chargeIfAllowed(
  contactRequestId: string,
  user: AuthenticatedUser,
  origin: ChargeOrigin,
  deps: ChargeDeps,
): Promise<PixChargeResult> {
  const gate = await authorizeCharge(contactRequestId, user.id);
  if (!gate) return unavailable();
  const outcome = await chargeForReservation(
    {
      contactRequestId,
      actorId: user.id,
      payerEmail: user.email,
      reservedUntil: gate.reservedUntil,
      now: gate.now,
      origin,
    },
    deps,
  );
  if (!outcome.ok) {
    if (outcome.reason === 'attempt_not_chargeable') return unavailable();
    return { success: false, reason: 'charge_unavailable', error: CHARGE_UNAVAILABLE };
  }
  return {
    success: true,
    contactRequestId,
    reservedUntil: gate.reservedUntil.toISOString(),
    pix: outcome.pix,
  };
}

/**
 * Passo 1 e, depois do COMMIT dele, passos 2 e 3. Se a cobranca falhar, a vaga
 * continua reservada e o resultado traz `pix: null` para nova tentativa por
 * `getPixPaymentFlow`; nada e prorrogado (PD-4.4, PE-4.7).
 */
export async function requestContactUnlockFlow(
  listingId: string,
  deps: ChargeDeps = {},
): Promise<PixChargeResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return sessionFailureResult(session.reason);
  const reservation = await reserveForRequester(listingId, session.user.id);
  if (!reservation.success) return reservation;

  const charged = await chargeIfAllowed(
    reservation.contactRequestId,
    session.user,
    'initial',
    deps,
  );
  if (charged.success) return charged;
  return {
    success: true,
    contactRequestId: reservation.contactRequestId,
    reservedUntil: reservation.reservedUntil,
    pix: null,
  };
}

/**
 * Instrucoes Pix da reserva viva do proprio solicitante. Se a cobranca ainda
 * nao foi registrada (`tentativa_criada`), retoma o passo 2 com a MESMA chave e
 * conclui o passo 3 (PD-4.2, PD-6.8); senao, consulta a order existente.
 */
export async function getPixPaymentFlow(
  contactRequestId: string,
  deps: ChargeDeps = {},
): Promise<PixChargeResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return sessionFailureResult(session.reason);
  return chargeIfAllowed(contactRequestId, session.user, 'retry', deps);
}
