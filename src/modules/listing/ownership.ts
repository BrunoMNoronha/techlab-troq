// Consulta server-only de propriedade. Fica fora de actions.ts ('use server')
// de proposito: la toda funcao exportada vira endpoint chamavel pelo cliente, e
// esta consulta nao deve servir de oraculo sobre quem e dono de qual anuncio.
import { getPrismaClient } from '@/persistence/prisma';
import { isUuid } from './ids';

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
