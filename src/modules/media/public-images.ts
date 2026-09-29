import { getPrismaClient } from '@/persistence/prisma';

// Consulta publica das imagens de um anuncio. Fronteira de F2-009 (#47):
// esta entrega (F2-008) NAO a altera. A #47 troca a URL montada com
// NEXT_PUBLIC_MEDIA_BASE_URL pela rota autorizada `/media/{imageId}/{kind}`
// (media-pipeline-contract.md, secao 9). O bucket e privado: a URL abaixo nao
// da acesso a objeto nenhum.

export interface ImageDerivativeDTO {
  kind: 'thumb' | 'medium' | 'large';
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
  const mediaBaseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || 'https://media.example.invalid';

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      owner: { select: { status: true } },
      images: {
        where: { status: 'ready' },
        orderBy: { position: 'asc' },
        include: { derivatives: true },
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
      kind: d.kind as 'thumb' | 'medium' | 'large',
      url: `${mediaBaseUrl}/${d.objectKey}`,
      width: d.width,
      height: d.height,
    })),
  }));
}
