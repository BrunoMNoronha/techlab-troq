// Endereco publico de um derivado (media-pipeline-contract.md, secao 9.1). E a
// UNICA forma de apontar para uma imagem de anuncio: uma rota relativa do
// proprio TROQS, que reconfere a autorizacao a cada requisicao. Nunca chave de
// objeto, host do R2, bucket ou URL assinada. Sem dependencia de servidor: pode
// ser usada por componente cliente.

export const MEDIA_KINDS = ['thumb', 'medium', 'large'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === 'string' && (MEDIA_KINDS as readonly string[]).includes(value);
}

export function mediaPath(imageId: string, kind: MediaKind): string {
  return `/media/${imageId}/${kind}`;
}
