import { describe, expect, it } from 'vitest';
import { normalizeState } from './public-query';
import { BRAZILIAN_UFS, isBrazilianUf, ufOptionLabel } from './uf';
import { validateListingContent, validateListingPatch } from './validation';

// Lista de UFs (#90): fonte unica da validacao do servidor, do formulario e do
// filtro publico.
const valid = { title: 'Bicicleta aro 29', description: 'Em bom estado.', city: 'Recife' };

describe('BRAZILIAN_UFS', () => {
  it('tem as 27 UFs, sem sigla ou nome repetido', () => {
    expect(BRAZILIAN_UFS).toHaveLength(27);
    expect(new Set(BRAZILIAN_UFS.map((uf) => uf.code)).size).toBe(27);
    expect(new Set(BRAZILIAN_UFS.map((uf) => uf.name)).size).toBe(27);
    for (const uf of BRAZILIAN_UFS) expect(uf.code).toMatch(/^[A-Z]{2}$/);
  });

  it('esta em ordem alfabetica pelo nome', () => {
    const names = BRAZILIAN_UFS.map((uf) => uf.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });

  it('inclui o Distrito Federal e exibe nome e sigla', () => {
    expect(isBrazilianUf('DF')).toBe(true);
    expect(ufOptionLabel({ code: 'SP', name: 'São Paulo' })).toBe('São Paulo (SP)');
  });

  it('recusa siglas inexistentes e nao normalizadas', () => {
    for (const code of ['ZZ', 'XX', 'BR', 'sp', ' SP', '']) expect(isBrazilianUf(code)).toBe(false);
  });
});

describe('validacao de UF no servidor', () => {
  it.each(['SP', 'DF', ' pe ', 'rj'])('aceita %j e grava a sigla normalizada', (state) => {
    const res = validateListingContent({ ...valid, state });
    expect(res).toEqual({
      ok: true,
      data: { ...valid, uf: state.trim().toUpperCase(), category: null },
    });
  });

  it.each([
    ['sigla inexistente', 'ZZ'],
    ['vazia', ''],
    ['so espacos', '   '],
    ['nome por extenso', 'São Paulo'],
    ['numero', 35],
    ['nulo', null],
    ['lista', ['SP']],
  ])('recusa UF %s na criacao', (_label, state) => {
    const res = validateListingContent({ ...valid, state });
    expect(res).toEqual({ ok: false, fieldErrors: { state: 'Selecione o estado.' } });
  });

  it('recusa UF ausente na criacao', () => {
    expect(validateListingContent(valid)).toEqual({
      ok: false,
      fieldErrors: { state: 'Selecione o estado.' },
    });
  });

  it('na edicao, UF omitida mantem o valor gravado e UF inexistente e recusada', () => {
    expect(validateListingPatch({ title: 'Bicicleta aro 26' })).toEqual({
      ok: true,
      data: { title: 'Bicicleta aro 26' },
    });
    expect(validateListingPatch({ title: 'Bicicleta aro 26', state: 'ZZ' })).toEqual({
      ok: false,
      fieldErrors: { state: 'Selecione o estado.' },
    });
  });
});

describe('filtro publico por UF', () => {
  it('UF inexistente nao corresponde a nada, em vez de ser ignorada', () => {
    expect(normalizeState('ZZ')).toBeNull();
    expect(normalizeState('xx')).toBeNull();
    expect(normalizeState(' df ')).toBe('DF');
  });
});
