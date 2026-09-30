import type { PublicListingFeedItem } from '@/modules/listing';

type Derivative = PublicListingFeedItem['images'][number]['derivatives'][number];
type DerivativeKind = Derivative['kind'];

// Apoio de renderizacao das imagens publicas (listing-contract.md, secao 11).
// As URLs sao sempre as da rota autorizada /media: sem Image Optimization,
// porque o cache transformado sobreviveria a revogacao
// (media-pipeline-contract.md, 9.2).

/** Texto alternativo derivado do titulo e da posicao: "Imagem 1 de 3: Bicicleta". */
export function listingImageAlt(title: string, index: number, total: number): string {
  return `Imagem ${index + 1} de ${total}: ${title}`;
}

/** Derivado preferido, com recuo para o primeiro disponivel. */
export function pickDerivative(
  derivatives: readonly Derivative[],
  preferred: DerivativeKind,
): Derivative | null {
  return derivatives.find((d) => d.kind === preferred) ?? derivatives[0] ?? null;
}

/** `srcset` por largura real de cada derivado, do menor para o maior. */
export function derivativeSrcSet(derivatives: readonly Derivative[]): string | undefined {
  if (derivatives.length === 0) return undefined;
  return [...derivatives]
    .sort((a, b) => a.width - b.width)
    .map((d) => `${d.url} ${d.width}w`)
    .join(', ');
}
