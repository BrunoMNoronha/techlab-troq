import { recordAuditEvent } from '@/modules/audit';
import type { ListingClosureEffect } from '@/modules/listing';
import {
  cancelUnaccreditedCharge,
  type CancelOutcome,
  type ConfirmationDeps,
} from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';
import { confirmPaymentFlow } from './payment-confirmation';

// Efeito de T5/T6 sobre as solicitacoes do anuncio (data-model.md, DM-6.10;
// listing-lifecycle.md, secao 5): roda DENTRO da transacao do encerramento,
// sob a trava de linha do anuncio, com o mesmo `now()`.
//
// - `reserved` -> `failed`: encerrada sem cobranca, vaga liberada. `failed` e
//   o estado de DM-6.1 para "cancelamento"; `expired` fica reservado ao fim da
//   janela. A tentativa nao terminal dessa reserva e o que identifica a order a
//   cancelar por PD-8.10 (solicitacao `failed` + tentativa nao terminal), sem
//   coluna nova; o cancelamento em si e de F3-007/F3-008 (#97, #98).
// - `paid` fica intacta: a cobranca e definitiva e a vaga continua consumida
//   (RB-004, DM-6.7; o gatilho do banco tambem impede a saida de `paid`).
// - `expired`/`failed` ja terminaram e nao mudam.
export const endOpenReservationsOnListingClosure: ListingClosureEffect = async (
  tx,
  { listingId, actorId, at, transition },
) => {
  const ended = await tx.$queryRaw<{ id: string; slotIndex: number }[]>`
    UPDATE "contact_requests"
    SET "status" = 'failed', "updated_at" = ${at}
    WHERE "listing_id" = ${listingId}::uuid AND "status" = 'reserved'
    RETURNING "id"::text AS "id", "slot_index" AS "slotIndex"`;
  for (const row of ended) {
    await recordAuditEvent(tx, {
      eventType: 'request.reservation_ended',
      actorId,
      targetType: 'contact_request',
      targetId: row.id,
      result: 'success',
      occurredAt: at,
      details: { listingId, slotIndex: row.slotIndex, reason: 'listing_closed', transition },
    });
  }
};

/**
 * Depois do COMMIT de T5/T6, e fora da trava: cancela a cobranca sem acreditacao
 * de cada reserva que o encerramento terminou, para que ela nao sobreviva a
 * reserva (PD-8.10, PE-4.5). Cancelamento nao e reembolso (PE-7.4). Se a order
 * ja acreditou, a confirmacao classifica RT-3 e devolve o valor. Falha aqui nao
 * desfaz o encerramento: a tentativa continua aberta para a reconciliacao.
 */
export async function cancelChargesOfClosedListing(
  listingId: string,
  deps: ConfirmationDeps = {},
): Promise<CancelOutcome[]> {
  const ended = await getPrismaClient().$queryRaw<{ id: string }[]>`
    SELECT "id"::text AS "id" FROM "contact_requests"
    WHERE "listing_id" = ${listingId}::uuid AND "status" = 'failed'
    ORDER BY "id"`;
  const outcomes: CancelOutcome[] = [];
  for (const request of ended) {
    const { attemptId, outcome } = await cancelUnaccreditedCharge(request.id, deps);
    if (outcome === 'accredited' && attemptId) {
      await confirmPaymentFlow(attemptId, { origin: 'reconciliacao', deps });
    }
    outcomes.push(outcome);
  }
  return outcomes;
}
