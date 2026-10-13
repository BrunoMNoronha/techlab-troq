// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { PRODUCT_CATEGORIES } from '@/modules/listing/categories';
import { validateListingContent, validateTradeOptions } from '@/modules/listing/validation';
import { processImageBuffer } from '@/modules/media/image-processing';
import { DEMO_DATASET_VERSION, DEMO_PRODUCTS } from './manifest';

const projectRoot = new URL('../../../', import.meta.url);
const sourceImages = new Map<string, Buffer>();

beforeAll(async () => {
  await Promise.all(
    DEMO_PRODUCTS.map(async (product) => {
      sourceImages.set(product.key, await readFile(new URL(product.assetPath, projectRoot)));
    }),
  );
});

describe('catálogo demonstrativo products-v1', () => {
  it('mantém 30 chaves estáveis e títulos únicos, com a distribuição acordada', () => {
    expect(DEMO_DATASET_VERSION).toBe('products-v1');
    expect(DEMO_PRODUCTS).toHaveLength(30);
    expect(new Set(DEMO_PRODUCTS.map((product) => product.title)).size).toBe(30);
    expect(DEMO_PRODUCTS.map((product) => product.key)).toEqual(
      Array.from({ length: 30 }, (_, index) => `product-${String(index + 1).padStart(2, '0')}`),
    );
    expect(new Set(DEMO_PRODUCTS.map((product) => product.uf)).size).toBe(27);

    const expectedCounts = Object.fromEntries(
      PRODUCT_CATEGORIES.map(({ code }) => [code, ['eletronicos', 'casa'].includes(code) ? 3 : 2]),
    );
    const actualCounts = DEMO_PRODUCTS.reduce<Record<string, number>>((counts, product) => {
      counts[product.category] = (counts[product.category] ?? 0) + 1;
      return counts;
    }, {});
    expect(actualCounts).toEqual(expectedCounts);
  });

  it.each(DEMO_PRODUCTS)(
    '$key segue os contratos de conteúdo e alternativas de publicação',
    (product) => {
      expect(validateListingContent({ ...product, state: product.uf }, true)).toEqual({
        ok: true,
        data: {
          title: product.title,
          description: product.description,
          city: product.city,
          uf: product.uf,
          category: product.category,
        },
      });
      expect(validateTradeOptions(product.tradeOptions, true)).toEqual({
        ok: true,
        data: product.tradeOptions,
      });
      expect(
        new Set(
          product.tradeOptions.map((option) => option.normalize('NFKC').toLocaleLowerCase('pt-BR')),
        ).size,
      ).toBe(3);
      expect(product.assetPath).toBe(`public/demo-products/${product.key}.png`);
    },
  );

  it('usa 30 arquivos locais próprios diferentes', () => {
    expect(sourceImages.size).toBe(30);
    const hashes = new Set(
      [...sourceImages.values()].map((buffer) => createHash('sha256').update(buffer).digest('hex')),
    );
    expect(hashes.size).toBe(30);
  });

  it.each(DEMO_PRODUCTS)(
    '$key tem PNG real e gera os três derivados entregáveis',
    async (product) => {
      const input = sourceImages.get(product.key)!;
      const metadata = await sharp(input).metadata();
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(960);
      expect(metadata.height).toBe(960);

      const result = await processImageBuffer(input);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.derivatives.map(({ kind, width, height }) => [kind, width, height])).toEqual([
        ['thumb', 320, 320],
        ['medium', 768, 768],
        ['large', 960, 960],
      ]);
      for (const derivative of result.derivatives) {
        expect(derivative.data.byteLength).toBeGreaterThan(1000);
        const output = await sharp(derivative.data).metadata();
        expect(output.format).toBe('webp');
        expect(output.width).toBe(derivative.width);
        expect(output.height).toBe(derivative.height);
        expect(output.exif).toBeUndefined();
      }
    },
  );
});
