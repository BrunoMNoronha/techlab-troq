// Consulta server-only de propriedade. Fica fora de actions.ts ('use server')
// de proposito: la toda funcao exportada vira endpoint chamavel pelo cliente, e
// esta consulta nao deve servir de oraculo sobre quem e dono de qual anuncio.
import { getPrismaClient } from '@/persistence/prisma';
import { isUuid } from './ids';
import type { ListingRequestGate } from './lifecycle';

/**
 * Dono do anuncio, ou `null` para identificador malformado ou inexistente.
 * `request` usa para recusar o proprio anuncio e para verificar, pela
 * fronteira de `contact`, se o anunciante tem contato (DEC-040).
 */
export async function getListingOwnerId(listingId: string): Promise<string | null> {
  if (!isUuid(listingId)) {
    return null;
  }

  const listing = await getPrismaClient().listing.findUnique({
    where: { id: listingId },
    select: { ownerId: true },
  });
  return listing?.ownerId ?? null;
}

/**
 * Estado e dono do anuncio, SEM trava, para telas que so orientam (F3-009,
 * #99: opcoes de escolha do dono). Quem decide relê sob `lockListingForRequest`.
 */
export async function getListingGate(listingId: string): Promise<ListingRequestGate | null> {
  if (!isUuid(listingId)) {
    return null;
  }

  return getPrismaClient().listing.findUnique({
    where: { id: listingId },
    select: { id: true, status: true, ownerId: true },
  });
}

/**
 * Titulos dos anuncios pedidos, para a tela de quem ja tem relacao com eles
 * (F3-010, #100: contatos liberados ao escolhido). Anuncio `removed` vem sem
 * titulo: o conteudo retirado pela moderacao nao volta a ser exibido. O
 * chamador decide quem pode pedir quais ids.
 */
export async function getListingTitles(
  listingIds: readonly string[],
): Promise<Map<string, string | null>> {
  const ids = listingIds.filter(isUuid);
  if (ids.length === 0) return new Map();
  const rows = await getPrismaClient().listing.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, status: true },
  });
  return new Map(rows.map((r) => [r.id, r.status === 'removed' ? null : r.title]));
}
