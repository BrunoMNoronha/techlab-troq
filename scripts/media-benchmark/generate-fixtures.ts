// Gera as fixtures SINTETICAS do benchmark de 50 MP (F2-008, #46;
// media-pipeline-contract.md, secao 16). Nenhuma foto real, nada baixado.
// Uso: node scripts/media-benchmark/generate-fixtures.ts <dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type Sharp } from 'sharp';

const out = process.argv[2] ?? 'fixtures';
mkdirSync(out, { recursive: true });

const SIDE = 7071; // 7071 x 7071 = 49.999.041 px, logo abaixo de 50 MP.
const MAX_BYTES = 10 * 1024 * 1024;

/** Gradiente suave: comprime bem, para caber no limite de 10 MB da entrada. */
async function gradient(width: number, height: number): Promise<Sharp> {
  const seed = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 30, g: 90, b: 160 } },
  })
    .composite([
      {
        input: Buffer.from([250, 200, 40]),
        raw: { width: 1, height: 1, channels: 3 },
        top: 0,
        left: 1,
      },
      {
        input: Buffer.from([40, 220, 120]),
        raw: { width: 1, height: 1, channels: 3 },
        top: 1,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
  return sharp(seed).resize(width, height, { kernel: 'linear' });
}

function save(name: string, data: Buffer, note: Record<string, unknown> = {}) {
  writeFileSync(join(out, name), data);
  console.log(
    JSON.stringify({
      fixture: name,
      bytes: data.length,
      withinLimit: data.length <= MAX_BYTES,
      ...note,
    }),
  );
}

// 1. PNG 16 bits perto de 50 MP, com orientacao EXIF 6 (exige rotacao de 90 graus).
{
  const img = await gradient(SIDE, SIDE);
  const data = await img
    .toColourspace('rgb16')
    .png({ compressionLevel: 9 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const meta = await sharp(data, { limitInputPixels: false }).metadata();
  save('png16-50mp-orient6.png', data, {
    width: meta.width,
    height: meta.height,
    depth: meta.depth,
    orientation: meta.orientation ?? null,
  });
}

// 2. JPEG perto de 50 MP.
{
  const img = await gradient(SIDE, SIDE);
  const data = await img.jpeg({ quality: 90 }).toBuffer();
  const meta = await sharp(data, { limitInputPixels: false }).metadata();
  save('jpeg-50mp.jpg', data, { width: meta.width, height: meta.height });
}

// 3. WebP animado (duas paginas).
{
  const frame = (r: number) =>
    sharp({ create: { width: 400, height: 400, channels: 3, background: { r, g: 10, b: 10 } } })
      .png()
      .toBuffer();
  const data = await sharp([await frame(200), await frame(20)], { join: { animated: true } })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  const meta = await sharp(data).metadata();
  save('animated.webp', data, { pages: meta.pages ?? null });
}

// 4. PNG truncado.
{
  const full = await (await gradient(1200, 900)).png().toBuffer();
  save('truncated.png', full.subarray(0, Math.floor(full.length / 2)));
}

// 5. Conteudo falso com extensao aceitavel.
save('fake.jpg', Buffer.from('isto nao e uma imagem, apenas texto com extensao .jpg\n'.repeat(20)));

// 6. Conteudo vazio.
save('empty.png', Buffer.alloc(0));

// 7. Ruido 1600 x 1600, pior caso de tamanho do derivado `large`.
{
  const data = await sharp({
    create: {
      width: 1600,
      height: 1600,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: 'gaussian', mean: 128, sigma: 80 },
    },
  })
    .png()
    .toBuffer();
  save('noise-1600.png', data);
}

// 8. Controles: formatos validos pequenos e formatos proibidos.
{
  const base = await gradient(1200, 900);
  save('valid.jpg', await base.clone().jpeg({ quality: 85 }).toBuffer());
  save('valid.png', await base.clone().png().toBuffer());
  save('valid.webp', await base.clone().webp({ quality: 85 }).toBuffer());
  save('small-300.png', await (await gradient(300, 1000)).png().toBuffer());
  save('gif.gif', await base.clone().gif().toBuffer());
  save('tiff.tiff', await base.clone().tiff().toBuffer());
  save(
    'svg.svg',
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="red"/></svg>',
    ),
  );
}
