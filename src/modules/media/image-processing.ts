import sharp, { type Metadata, type OutputInfo } from 'sharp';
import type { PermanentFailureCode } from './failure-codes';

// Validacao e geracao de derivados de uma imagem NAO CONFIAVEL
// (image-policy.md, secoes 4, 6 e 7; media-pipeline-contract.md, secao 7).
//
// Funcao pura sobre bytes: nao le banco, sessao nem R2. O executor
// (processor.ts) so a chama com o conteudo lido do objeto confirmado no R2 via
// `If-Match`; testes e o benchmark de 50 MP a chamam com fixtures sinteticas.
// Nenhuma action ou rota recebe buffer do cliente para passar por aqui.
//
// Toda decisao vem do conteudo decodificado: nunca de extensao, nome ou tipo
// declarado.

export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const MIN_SIDE_PX = 320;
export const MAX_INPUT_PIXELS = 50_000_000;
export const WEBP_QUALITY = 80;

export const DERIVATIVE_SPECS = [
  { kind: 'thumb', maxSide: 320 },
  { kind: 'medium', maxSide: 768 },
  { kind: 'large', maxSide: 1600 },
] as const;

export type DerivativeKind = (typeof DERIVATIVE_SPECS)[number]['kind'];

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const LARGEST_SIDE = DERIVATIVE_SPECS[DERIVATIVE_SPECS.length - 1].maxSide;

const INPUT_OPTIONS = {
  limitInputPixels: MAX_INPUT_PIXELS,
  // Padrao recomendado pelo sharp para entrada nao confiavel: aviso de
  // decodificacao (arquivo truncado, dado invalido) aborta o processamento.
  failOn: 'warning',
  sequentialRead: true,
} as const;

export interface DerivativeOutput {
  kind: DerivativeKind;
  data: Buffer;
  width: number;
  height: number;
}

export type ImageProcessingResult =
  | {
      ok: true;
      format: string;
      /** Dimensoes da entrada depois de aplicar a orientacao. */
      width: number;
      height: number;
      derivatives: DerivativeOutput[];
    }
  | { ok: false; code: PermanentFailureCode };

function fail(code: PermanentFailureCode): ImageProcessingResult {
  return { ok: false, code };
}

/** Orientacoes EXIF 5 a 8 giram 90 graus: largura e altura trocam. */
function orientedSize(meta: Metadata): { width: number; height: number } {
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const rotates = typeof meta.orientation === 'number' && meta.orientation >= 5;
  return rotates ? { width: height, height: width } : { width, height };
}

function isPixelLimitError(err: unknown): boolean {
  return err instanceof Error && /pixel limit/i.test(err.message);
}

export async function processImageBuffer(input: Buffer): Promise<ImageProcessingResult> {
  if (input.length === 0) return fail('empty');
  if (input.length > MAX_SOURCE_BYTES) return fail('too_large_bytes');

  let meta: Metadata;
  try {
    meta = await sharp(input, INPUT_OPTIONS).metadata();
  } catch (err) {
    // Conteudo que nao e imagem reconhecivel (texto, extensao falsa).
    return fail(isPixelLimitError(err) ? 'too_large_pixels' : 'unsupported_format');
  }

  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) return fail('unsupported_format');
  if ((meta.pages ?? 1) > 1) return fail('animated');
  if (!meta.width || !meta.height) return fail('corrupt');
  if (meta.width * meta.height > MAX_INPUT_PIXELS) return fail('too_large_pixels');

  const oriented = orientedSize(meta);
  if (oriented.width < MIN_SIDE_PX || oriented.height < MIN_SIDE_PX) return fail('too_small');

  // Decodifica UMA vez: auto-orienta e reduz ao maior derivado, em pixels
  // brutos de 8 bits sRGB. Nada de metadado da entrada chega a esta etapa.
  let base: { data: Buffer; info: OutputInfo };
  try {
    base = await sharp(input, INPUT_OPTIONS)
      .rotate()
      .resize({
        width: LARGEST_SIDE,
        height: LARGEST_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (err) {
    return fail(isPixelLimitError(err) ? 'too_large_pixels' : 'corrupt');
  }

  const raw = {
    width: base.info.width,
    height: base.info.height,
    channels: base.info.channels as 1 | 2 | 3 | 4,
  };

  const derivatives: DerivativeOutput[] = [];
  for (const spec of DERIVATIVE_SPECS) {
    // Sem withMetadata/keepMetadata: a saida WebP nao carrega EXIF, GPS nem ICC.
    const { data, info } = await sharp(base.data, { raw })
      .resize({
        width: spec.maxSide,
        height: spec.maxSide,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    derivatives.push({ kind: spec.kind, data, width: info.width, height: info.height });
  }

  return {
    ok: true,
    format: meta.format,
    width: oriented.width,
    height: oriented.height,
    derivatives,
  };
}
