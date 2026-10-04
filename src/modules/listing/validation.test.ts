import { describe, expect, it } from 'vitest';
import {
  toTradeOptionSlots,
  validateListingContent,
  validateListingPatch,
  validateTradeOptions,
} from './validation';

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

// Alternativas de troca (DEC-046, #76; listing-contract.md, secao 3.1).
describe('validateTradeOptions', () => {
  const three = ['Um notebook', 'Um videogame', 'Uma câmera'];

  it('aceita tres textos, aparados, na ordem informada', () => {
    expect(validateTradeOptions([' Um notebook ', 'Um videogame', ' Uma câmera'], true)).toEqual({
      ok: true,
      data: three,
    });
  });

  it.each([
    ['nenhuma', []],
    ['duas', three.slice(0, 2)],
    ['quatro', [...three, 'Um tablet']],
    ['texto em vez de lista', 'Um notebook'],
    ['objeto', { 0: 'a', 1: 'b', 2: 'c', length: 3 }],
    ['nulo', null],
    ['ausente', undefined],
  ])('recusa a lista inteira com %s, mesmo sem exigir completude', (_c, input) => {
    for (const requireComplete of [true, false]) {
      expect(validateTradeOptions(input, requireComplete)).toEqual({
        ok: false,
        fieldErrors: { tradeOptions: 'Informe exatamente 3 alternativas de troca.' },
      });
    }
  });

  it('vazia ou so com espacos: aceita no rascunho, recusada quando a completude e exigida', () => {
    const input = ['Um notebook', '   ', '\t'];
    expect(validateTradeOptions(input, false)).toEqual({
      ok: true,
      data: ['Um notebook', '', ''],
    });
    const res = validateTradeOptions(input, true);
    expect(res.ok ? [] : Object.keys(res.fieldErrors)).toEqual(['tradeOption2', 'tradeOption3']);
  });

  it('limite de 60 caracteres apos o trim, em qualquer estado', () => {
    const at = 'x'.repeat(60);
    expect(validateTradeOptions([at, `  ${at}  `, 'a'], true).ok).toBe(true);
    for (const requireComplete of [true, false]) {
      const res = validateTradeOptions(['a', 'x'.repeat(61), 'c'], requireComplete);
      expect(res.ok ? {} : res.fieldErrors).toEqual({
        tradeOption2: 'Informe esta alternativa de troca, com até 60 caracteres.',
      });
    }
  });

  it('item que nao e texto e erro do proprio campo', () => {
    const res = validateTradeOptions(['a', 2, { label: 'c' }], false);
    expect(res.ok ? [] : Object.keys(res.fieldErrors)).toEqual(['tradeOption2', 'tradeOption3']);
  });
});

describe('toTradeOptionSlots', () => {
  it('devolve as tres posicoes, com vazio onde nada foi gravado', () => {
    expect(toTradeOptionSlots([])).toEqual(['', '', '']);
    expect(
      toTradeOptionSlots([
        { position: 3, label: 'Uma câmera' },
        { position: 1, label: 'Um notebook' },
      ]),
    ).toEqual(['Um notebook', '', 'Uma câmera']);
  });
});
