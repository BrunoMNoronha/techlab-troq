import type { DerivativeKind } from './image-processing';
import { DERIVATIVE_SPECS } from './image-processing';

// Chaves de objeto, todas geradas pelo servidor e nenhuma com nome de arquivo
// (media-pipeline-contract.md, secao 3). A geracao do upload faz parte das duas
// chaves: a limpeza de uma geracao antiga nunca alcanca objetos da nova.

/** Versao do processamento; muda so se o resultado contratual mudar. */
export const PROCESSING_VERSION = 'v1';

export function originalKey(imageId: string, uploadGeneration: number): string {
  return `originals/${imageId}/${uploadGeneration}`;
}

export function derivativeKey(
  imageId: string,
  uploadGeneration: number,
  kind: DerivativeKind,
  processingVersion: string = PROCESSING_VERSION,
): string {
  return `derivatives/${imageId}/${uploadGeneration}/${processingVersion}/${kind}.webp`;
}

/** As tres chaves de derivado de uma geracao, sejam elas ja escritas ou nao. */
export function derivativeKeys(imageId: string, uploadGeneration: number): string[] {
  return DERIVATIVE_SPECS.map((spec) => derivativeKey(imageId, uploadGeneration, spec.kind));
}
