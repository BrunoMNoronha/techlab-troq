// Codigos de falha da imagem (media-pipeline-contract.md, secao 8.4). Lista
// fechada, espelhada pelo CHECK `listing_images_failure_code_check` da
// migration 20260929191607_media_pipeline. Modulo puro: o formulario de
// gestao de imagens o importa para traduzir o codigo em mensagem.

export const PERMANENT_FAILURE_CODES = [
  'unsupported_format',
  'animated',
  'too_small',
  'too_large_pixels',
  'too_large_bytes',
  'corrupt',
  'empty',
  'source_replaced',
  'source_missing',
  'expired',
  'transient_exhausted',
] as const;

export const TRANSIENT_FAILURE_CODES = [
  'r2_throttled',
  'r2_unavailable',
  'timeout',
  'network',
  'interrupted',
] as const;

export type PermanentFailureCode = (typeof PERMANENT_FAILURE_CODES)[number];
export type TransientFailureCode = (typeof TRANSIENT_FAILURE_CODES)[number];
export type FailureCode = PermanentFailureCode | TransientFailureCode | 'legacy_unknown';

/** Mensagem ao dono do anuncio. Nunca repassa mensagem crua de SDK ou biblioteca. */
const MESSAGES: Record<FailureCode, string> = {
  unsupported_format: 'Formato não suportado. Envie JPEG, PNG ou WebP sem animação.',
  animated: 'Imagens animadas ou com várias páginas não são aceitas.',
  too_small: 'A imagem precisa ter pelo menos 320 × 320 pixels.',
  too_large_pixels: 'A imagem tem resolução acima de 50 megapixels.',
  too_large_bytes: 'O arquivo passa de 10 MB.',
  corrupt: 'Não foi possível ler a imagem. O arquivo pode estar corrompido ou incompleto.',
  empty: 'O arquivo enviado está vazio.',
  source_replaced: 'O arquivo foi alterado depois do envio. Envie a imagem novamente.',
  source_missing: 'O arquivo enviado não foi encontrado. Envie a imagem novamente.',
  expired: 'O processamento não terminou a tempo. Envie a imagem novamente.',
  transient_exhausted: 'Não foi possível processar a imagem agora. Envie novamente.',
  r2_throttled: 'Processamento adiado por instabilidade temporária.',
  r2_unavailable: 'Processamento adiado por instabilidade temporária.',
  timeout: 'Processamento adiado por instabilidade temporária.',
  network: 'Processamento adiado por instabilidade temporária.',
  interrupted: 'Processamento adiado por instabilidade temporária.',
  legacy_unknown: 'Não foi possível processar a imagem. Envie novamente.',
};

export function failureMessage(code: string | null | undefined): string {
  if (code && code in MESSAGES) return MESSAGES[code as FailureCode];
  return MESSAGES.legacy_unknown;
}

export function isTransientFailure(code: string): code is TransientFailureCode {
  return (TRANSIENT_FAILURE_CODES as readonly string[]).includes(code);
}
