import { recordAuditEvent } from '@/modules/audit';
import type { ListingClosureEffect } from '@/modules/listing';

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
