-- DEC-041 (fecha OD-14; docs/product/reservation-limit.md) — no maximo uma
-- reserva viva (`reserved`) por conta em cada anuncio. A verificacao em
-- `src/modules/request/reservation.ts` roda sob a trava do anuncio e da a
-- recusa limpa; este indice e a GARANTIA de banco (DEC-038: trava e
-- comportamento, restricao de banco e garantia).
--
-- Reserva vencida ainda `reserved` (expiracao preguicosa, DM-6.3) continua no
-- indice ate ser expirada; a alocacao expira as vencidas do anuncio na mesma
-- transacao, antes de inserir, entao o indice nao bloqueia uma nova reserva
-- legitima. `paid`, `expired`, `failed` e demais estados saem do indice.
--
-- SQL customizado: indice unico parcial exige a Preview feature
-- `partialIndexes`, deliberadamente nao habilitada (database.md, secao 8).
CREATE UNIQUE INDEX "contact_requests_live_reservation_per_requester_key"
  ON "contact_requests"("listing_id", "requester_id")
  WHERE "status" = 'reserved';
