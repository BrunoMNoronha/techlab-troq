import { getPrismaClient } from '@/persistence/prisma';
import { mediaPath, type MediaKind } from './media-path';

// Consulta publica das imagens de um anuncio. Cada derivado aponta para a rota
// autorizada `/media/{imageId}/{kind}` (media-pipeline-contract.md, secao 9):
// o DTO nunca carrega chave de objeto, bucket, host do R2 nem URL assinada, e
// a rota reconfere a autorizacao a cada requisicao — filtrar o DTO sozinho nao
// revogaria uma URL ja conhecida.

export interface ImageDerivativeDTO {
  kind: MediaKind;
  url: string;
  width: number;
  height: number;
}

export interface ListingImageDTO {
  id: string;
  position: number;
  status: string;
  derivatives: ImageDerivativeDTO[];
}

/**
 * Retorna derivados SOMENTE quando o anuncio estiver `published` e a conta do
 * proprietario estiver `active`.
 */
export async function getPublicListingImages(listingId: string): Promise<ListingImageDTO[]> {
  const prisma = getPrismaClient();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      status: true,
      owner: { select: { status: true } },
      images: {
        where: { status: 'ready' },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          position: true,
          status: true,
          derivatives: { select: { kind: true, width: true, height: true } },
        },
      },
    },
  });

  if (!listing || listing.status !== 'published' || listing.owner.status !== 'active') {
    return [];
  }

  return listing.images.map((img) => ({
    id: img.id,
    position: img.position,
    status: img.status,
    derivatives: img.derivatives.map((d) => ({
      kind: d.kind,
      url: mediaPath(img.id, d.kind),
      width: d.width,
      height: d.height,
    })),
  }));
}
