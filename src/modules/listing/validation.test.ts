import { describe, expect, it } from 'vitest';
import { validateListingContent, validateListingPatch } from './validation';

// Contrato tecnico do formulario (listing-contract.md, secao 3).
const valid = {
  title: 'Bicicleta aro 29',
  description: 'Em bom estado.',
  city: 'Recife',
  state: 'PE',
};

function errorsOf(input: unknown) {
  const res = validateListingContent(input);
  return res.ok ? [] : Object.keys(res.fieldErrors).sort();
}

describe('validateListingContent', () => {
  it('normaliza com trim e UF em maiusculas, gravando a UF como uf', () => {
    expect(
      validateListingContent({
        title: '  Bicicleta aro 29 ',
        description: ' Em bom estado. ',
        city: ' Recife ',
        state: ' pe ',
      }),
    ).toEqual({
      ok: true,
      data: { title: 'Bicicleta aro 29', description: 'Em bom estado.', city: 'Recife', uf: 'PE' },
    });
  });

  it.each([
    ['titulo com 4 caracteres apos trim', { title: '  Bike  ' }, ['title']],
    ['titulo com 61 caracteres', { title: 'a'.repeat(61) }, ['title']],
    ['descricao vazia', { description: '' }, ['description']],
    ['descricao so com espacos', { description: ' \n\t ' }, ['description']],
    ['descricao com 1001 caracteres', { description: 'a'.repeat(1001) }, ['description']],
    ['cidade vazia', { city: '' }, ['city']],
    ['cidade so com espacos', { city: '   ' }, ['city']],
    ['UF com uma letra', { state: 'P' }, ['state']],
    ['UF com tres letras', { state: 'PER' }, ['state']],
    ['UF com numero', { state: 'P3' }, ['state']],
    ['UF com simbolo', { state: 'P-' }, ['state']],
    ['UF com letra acentuada', { state: 'PÉ' }, ['state']],
    ['campo nao textual', { title: 12345 }, ['title']],
  ])('rejeita %s', (_label, patch, fields) => {
    expect(errorsOf({ ...valid, ...patch })).toEqual(fields);
  });

  it('aceita os limites exatos', () => {
    expect(errorsOf({ ...valid, title: 'a'.repeat(5) })).toEqual([]);
    expect(errorsOf({ ...valid, title: 'a'.repeat(60) })).toEqual([]);
    expect(errorsOf({ ...valid, description: 'a' })).toEqual([]);
    expect(errorsOf({ ...valid, description: 'a'.repeat(1000) })).toEqual([]);
  });

  it('exige os quatro campos na criacao', () => {
    expect(errorsOf({})).toEqual(['city', 'description', 'state', 'title']);
    expect(errorsOf(null)).toEqual(['city', 'description', 'state', 'title']);
  });

  it('ignora chaves fora do conteudo, como ownerId e status', () => {
    const res = validateListingContent({ ...valid, ownerId: 'x', status: 'published', id: 'y' });
    expect(res.ok && Object.keys(res.data).sort()).toEqual(['city', 'description', 'title', 'uf']);
  });
});

describe('validateListingPatch', () => {
  it('valida so os campos informados, com a mesma regra da criacao', () => {
    expect(validateListingPatch({ city: ' Olinda ' })).toEqual({
      ok: true,
      data: { city: 'Olinda' },
    });
    const res = validateListingPatch({ description: '   ', state: 'p1' });
    expect(res.ok ? [] : Object.keys(res.fieldErrors).sort()).toEqual(['description', 'state']);
  });

  it('campo presente e vazio nao e tratado como ausente', () => {
    expect(validateListingPatch({ city: '' }).ok).toBe(false);
  });
});
