import { getPrismaClient } from '@/persistence/prisma';
import { SLOT_INDEXES } from './reservation';

// Vagas livres por anuncio, para a tela (DEC-056). Leitura sem trava, so para
// orientar: a decisao real e da transacao da reserva (reservation.ts).
//
// Ocupada = `paid` ou `reserved` ainda dentro da janela, o mesmo criterio da
// reserva. A tela recebe apenas quantas vagas estao LIVRES: pagas e reservadas
// nunca saem separadas, e nenhuma solicitacao e identificada.

/** Total de vagas pagas por anuncio (RB-003). */
export const SLOTS_PER_LISTING = SLOT_INDEXES.length;

/**
 * Vagas livres de cada anuncio informado, numa unica consulta. Anuncio sem
 * nenhuma solicitacao ocupando vaga devolve o total (`SLOTS_PER_LISTING`).
 * Nao e Server Action: so a camada de app chama, com ids vindos do feed.
 */
export async function countFreeSlots(listingIds: readonly string[]): Promise<Map<string, number>> {
  const free = new Map<string, number>();
  if (listingIds.length === 0) return free;

  for (const id of listingIds) free.set(id, SLOTS_PER_LISTING);

  const rows = await getPrismaClient().$queryRaw<{ listingId: string; occupied: number }[]>`
    SELECT "listing_id"::text AS "listingId", count(*)::int AS "occupied"
    FROM "contact_requests"
    WHERE "listing_id" = ANY(${[...listingIds]}::uuid[])
      AND ("status" = 'paid' OR ("status" = 'reserved' AND "reserved_until" > now()))
    GROUP BY "listing_id"`;

  for (const { listingId, occupied } of rows) {
    free.set(listingId, Math.max(0, SLOTS_PER_LISTING - occupied));
  }
  return free;
}
