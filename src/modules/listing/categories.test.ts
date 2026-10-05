import { describe, expect, it } from 'vitest';
import { PRODUCT_CATEGORIES, productCategoryLabel } from './categories';
import {
  validateListingCategory,
  validateListingContent,
  validateListingPatch,
} from './validation';

const content = {
  title: 'Bicicleta aro 29',
  description: 'Em bom estado.',
  city: 'Recife',
  state: 'PE',
};

describe('categoria comercial (#89)', () => {
  it.each(PRODUCT_CATEGORIES)('aceita $code e apresenta seu nome', ({ code, label }) => {
    expect(validateListingCategory(` ${code} `, true)).toEqual({ ok: true, data: code });
    expect(productCategoryLabel(code)).toBe(label);
  });

  it.each([undefined, null, '', '   '])('ausencia %s so e aceita sem completude', (value) => {
    expect(validateListingCategory(value)).toEqual({ ok: true, data: null });
    expect(validateListingCategory(value, true)).toMatchObject({
      ok: false,
      fieldErrors: { category: expect.any(String) },
    });
  });

  it.each(['qualquer', 'ESPORTES', 1, true, {}, [], ['esportes']])(
    'recusa valor arbitrario %s',
    (value) => {
      expect(validateListingContent({ ...content, category: value })).toMatchObject({
        ok: false,
        fieldErrors: { category: expect.any(String) },
      });
      expect(validateListingPatch({ category: value })).toMatchObject({
        ok: false,
        fieldErrors: { category: expect.any(String) },
      });
    },
  );

  it('patch omitido preserva; null/vazio explicitamente limpa', () => {
    expect(validateListingPatch({ title: 'Outro titulo' })).toEqual({
      ok: true,
      data: { title: 'Outro titulo' },
    });
    expect(validateListingPatch({ category: null })).toEqual({
      ok: true,
      data: { category: null },
    });
    expect(validateListingPatch({ category: ' ' })).toEqual({ ok: true, data: { category: null } });
    expect(validateListingContent(content, true)).toMatchObject({
      ok: false,
      fieldErrors: { category: expect.any(String) },
    });
  });

  it('legado nao recebe categoria ficticia', () => {
    expect(validateListingContent(content)).toMatchObject({ ok: true, data: { category: null } });
    expect(productCategoryLabel(null)).toBe('Categoria não informada');
  });
});
