// @vitest-environment node
import { S3ServiceException } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as identityModule from '@/modules/identity';
import { failureMessage, isTransientFailure, PERMANENT_FAILURE_CODES } from './failure-codes';
import { processImageBuffer } from './image-processing';
import { derivativeKey, derivativeKeys, originalKey, PROCESSING_VERSION } from './keys';
import { classifyR2Error, getR2Config, R2ConfigError } from './s3';
import {
  confirmImageUpload,
  deleteListingImage,
  reorderListingImages,
  requestImageReupload,
  requestImageUpload,
} from './upload';

// Unitarios do modulo media (F2-008, #46). Processamento com imagens
// sinteticas geradas aqui; banco e R2 reais estao nas suites de integracao.

async function image(
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'webp',
  orientation?: number,
): Promise<Buffer> {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 60, b: 20 } },
  });
  pipeline =
    format === 'jpeg' ? pipeline.jpeg() : format === 'png' ? pipeline.png() : pipeline.webp();
  if (orientation) pipeline = pipeline.withMetadata({ orientation });
  return pipeline.toBuffer();
}

describe('processImageBuffer', () => {
  it.each(['jpeg', 'png', 'webp'] as const)(
    'gera thumb/medium/large em WebP para %s valido, sem ampliar',
    async (format) => {
      const result = await processImageBuffer(await image(1200, 900, format));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.format).toBe(format);
      expect(result.derivatives.map((d) => [d.kind, d.width, d.height])).toEqual([
        ['thumb', 320, 240],
        ['medium', 768, 576],
        ['large', 1200, 900],
      ]);
      for (const d of result.derivatives) {
        const meta = await sharp(d.data).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.exif).toBeUndefined();
        expect(meta.orientation).toBeUndefined();
      }
    },
  );

  it('auto-orienta pela orientacao EXIF antes de medir e gerar (6 = 90 graus)', async () => {
    // 800 x 400 armazenado; com orientacao 6 a imagem visivel e 400 x 800.
    const result = await processImageBuffer(await image(800, 400, 'jpeg', 6));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([result.width, result.height]).toEqual([400, 800]);
    const large = result.derivatives.find((d) => d.kind === 'large')!;
    expect([large.width, large.height]).toEqual([400, 800]);
  });

  it('dimensao minima vale depois da orientacao', async () => {
    // 1000 x 319 com orientacao 6 vira 319 x 1000: lado menor abaixo de 320.
    const result = await processImageBuffer(await image(1000, 319, 'jpeg', 6));
    expect(result).toEqual({ ok: false, code: 'too_small' });
  });

  it('remove EXIF e GPS dos derivados', async () => {
    const withExif = await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'sintetico' }, IFD3: { GPSLatitudeRef: 'S' } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const result = await processImageBuffer(withExif);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const d of result.derivatives) {
      expect((await sharp(d.data).metadata()).exif).toBeUndefined();
    }
  });

  it.each([
    ['vazio', async () => Buffer.alloc(0), 'empty'],
    ['acima de 10 MB', async () => Buffer.alloc(10 * 1024 * 1024 + 1, 1), 'too_large_bytes'],
    [
      'texto com extensao de imagem',
      async () => Buffer.from('nao e imagem'.repeat(50)),
      'unsupported_format',
    ],
    [
      'SVG',
      async () =>
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"></svg>'),
      'unsupported_format',
    ],
    [
      'GIF',
      async () =>
        sharp({ create: { width: 400, height: 400, channels: 3, background: 'red' } })
          .gif()
          .toBuffer(),
      'unsupported_format',
    ],
    [
      'TIFF',
      async () =>
        sharp({ create: { width: 400, height: 400, channels: 3, background: 'red' } })
          .tiff()
          .toBuffer(),
      'unsupported_format',
    ],
    [
      'WebP animado',
      async () => {
        // Quadros DIFERENTES: com quadros iguais o encoder grava WebP estatico.
        const frame = (background: string) =>
          sharp({ create: { width: 400, height: 400, channels: 3, background } })
            .png()
            .toBuffer();
        const animated = await sharp([await frame('red'), await frame('blue')], {
          join: { animated: true },
        })
          .webp()
          .toBuffer();
        expect((await sharp(animated).metadata()).pages).toBe(2);
        return animated;
      },
      'animated',
    ],
    ['menor que 320 px', async () => image(319, 800, 'png'), 'too_small'],
    [
      'PNG truncado',
      async () => {
        const full = await sharp({
          create: {
            width: 800,
            height: 800,
            channels: 3,
            background: 'red',
            noise: { type: 'gaussian', mean: 128, sigma: 40 },
          },
        })
          .png()
          .toBuffer();
        return full.subarray(0, Math.floor(full.length / 2));
      },
      'corrupt',
    ],
  ])('recusa %s', async (_label, build, code) => {
    expect(await processImageBuffer(await build())).toEqual({ ok: false, code });
  });

  it('recusa acima de 50 MP antes de decodificar', async () => {
    // 7072 x 7072 = 50.013.184 px. PNG liso comprime a poucos KB.
    const big = await sharp({
      create: { width: 7072, height: 7072, channels: 3, background: 'black' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(await processImageBuffer(big)).toEqual({ ok: false, code: 'too_large_pixels' });
  });
});

describe('chaves e codigos', () => {
  it('chaves por geracao e versao, sem nome de arquivo', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(originalKey(id, 1)).toBe(`originals/${id}/1`);
    expect(derivativeKey(id, 2, 'large')).toBe(
      `derivatives/${id}/2/${PROCESSING_VERSION}/large.webp`,
    );
    expect(derivativeKeys(id, 3)).toEqual([
      `derivatives/${id}/3/v1/thumb.webp`,
      `derivatives/${id}/3/v1/medium.webp`,
      `derivatives/${id}/3/v1/large.webp`,
    ]);
    // Limpeza da geracao 2 nunca alcanca a 3.
    expect(derivativeKeys(id, 2).some((k) => derivativeKeys(id, 3).includes(k))).toBe(false);
  });

  it('toda falha tem mensagem propria e nenhuma repassa texto de biblioteca', () => {
    for (const code of PERMANENT_FAILURE_CODES) {
      expect(failureMessage(code)).not.toMatch(/sharp|vips|aws|s3|r2|etag/i);
      expect(isTransientFailure(code)).toBe(false);
    }
    expect(failureMessage('desconhecido')).toBe(failureMessage('legacy_unknown'));
    expect(isTransientFailure('r2_throttled')).toBe(true);
  });
});

describe('fronteira R2', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('falha fechada sem configuracao, sem credencial substituta', () => {
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    process.env.R2_BUCKET = 'troq-media-development';
    process.env.R2_REGION = 'auto';
    process.env.R2_S3_ENDPOINT = 'https://exemplo.invalid';
    expect(() => getR2Config()).toThrow(R2ConfigError);
    expect(() => getR2Config()).toThrow(/R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY/);
  });

  function s3Error(status: number, name = 'Erro') {
    return new S3ServiceException({
      name,
      $fault: 'server',
      $metadata: { httpStatusCode: status },
    });
  }

  it.each([
    [s3Error(412, 'PreconditionFailed'), 'source_replaced'],
    [s3Error(404, 'NoSuchKey'), 'source_missing'],
    [s3Error(429), 'r2_throttled'],
    [s3Error(503), 'r2_unavailable'],
    [Object.assign(new Error('x'), { name: 'TimeoutError' }), 'timeout'],
    [Object.assign(new Error('x'), { code: 'ECONNRESET' }), 'network'],
    [s3Error(403, 'AccessDenied'), 'r2_unavailable'],
  ])('classifica erro do R2 (%#)', (err, code) => {
    expect(classifyR2Error(err)).toBe(code);
  });
});

describe('validacao de entrada das operacoes, antes de banco e R2', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function asUser() {
    vi.spyOn(identityModule, 'validateSession').mockResolvedValue({
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'u@example.test',
        displayName: 'U',
        emailVerified: true,
        status: 'active',
      },
      isValid: true,
    });
  }

  it('sem sessao valida, nada acontece', async () => {
    vi.spyOn(identityModule, 'validateSession').mockResolvedValue({
      user: null,
      isValid: false,
      reason: 'no_session',
    });
    const id = '22222222-2222-4222-8222-222222222222';
    expect(await requestImageUpload(id, 'image/png', 4096)).toMatchObject({
      reason: 'unauthenticated',
    });
    expect(await confirmImageUpload(id)).toMatchObject({ reason: 'unauthenticated' });
    expect(await deleteListingImage(id)).toMatchObject({ reason: 'unauthenticated' });
  });

  it('ID malformado e not_found; tipo fora da lista e invalid_type', async () => {
    asUser();
    expect(await requestImageUpload('nao-uuid', 'image/png', 4096)).toMatchObject({
      reason: 'not_found',
    });
    expect(
      await requestImageUpload('22222222-2222-4222-8222-222222222222', 'image/gif', 4096),
    ).toMatchObject({ reason: 'invalid_type' });
    expect(
      await requestImageReupload('22222222-2222-4222-8222-222222222222', 'image/heic', 4096),
    ).toMatchObject({ reason: 'invalid_type' });
    for (const size of [0, -1, 1.5, 10 * 1024 * 1024 + 1, Number.NaN]) {
      expect(
        await requestImageUpload('22222222-2222-4222-8222-222222222222', 'image/png', size),
      ).toMatchObject({ reason: 'invalid_size' });
    }
    expect(await confirmImageUpload('x')).toMatchObject({ reason: 'not_found' });
    expect(await deleteListingImage('x')).toMatchObject({ reason: 'not_found' });
  });

  it('reordenacao exige lista de UUIDs distintos, de 1 a 6', async () => {
    asUser();
    const listing = '22222222-2222-4222-8222-222222222222';
    const a = '33333333-3333-4333-8333-333333333333';
    expect(await reorderListingImages(listing, [])).toMatchObject({ reason: 'invalid_order' });
    expect(await reorderListingImages(listing, [a, a])).toMatchObject({ reason: 'invalid_order' });
    expect(await reorderListingImages(listing, ['x'])).toMatchObject({ reason: 'invalid_order' });
    expect(await reorderListingImages(listing, 'nao-lista')).toMatchObject({
      reason: 'invalid_order',
    });
  });
});
