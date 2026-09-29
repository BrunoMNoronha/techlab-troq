// Consulta server-only de propriedade. Fica fora de actions.ts ('use server')
// de proposito: la toda funcao exportada vira endpoint chamavel pelo cliente, e
// esta consulta nao deve servir de oraculo sobre quem e dono de qual anuncio.
import { getPrismaClient } from '@/persistence/prisma';
import { isUuid } from './ids';

export async function isListingOwnedBy(listingId: string, userId: string): Promise<boolean> {
  if (!isUuid(listingId) || !isUuid(userId)) {
    return false;
  }

  const count = await getPrismaClient().listing.count({
    where: { id: listingId, ownerId: userId },
  });
  return count > 0;
}
