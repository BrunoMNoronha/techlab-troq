import { describe, expect, it } from 'vitest';
import {
  contactFieldErrors,
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
      data: {
        title: 'Bicicleta aro 29',
        description: 'Em bom estado.',
        city: 'Recife',
        uf: 'PE',
        category: null,
      },
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
    expect(res.ok && Object.keys(res.data).sort()).toEqual([
      'category',
      'city',
      'description',
      'title',
      'uf',
    ]);
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

// Contato e endereco no texto livre (#86, DEC-049; listing-contract.md, 10.1).
// O corpus completo do detector esta em contact-detection.test.ts.
describe('contato e endereco no texto livre', () => {
  const CONTACT = 'Não inclua telefone, WhatsApp, e-mail ou endereço neste campo.';

  it.each([
    ['telefone', 'Bike (11) 98765-4321', 'Ligue 11 98765-4321 para combinar'],
    ['WhatsApp', 'Bike wa.me/5511987654321', 'Chama em api.whatsapp.com/send'],
    ['e-mail', 'Bike fulano@exemplo.com', 'Escreva para fulano arroba exemplo ponto com'],
    ['endereco', 'Bike Rua Augusta, 500', 'Retirar no CEP 01310-100'],
  ])(
    '%s: titulo e descricao recebem, cada um, o erro do proprio campo',
    (_c, title, description) => {
      const res = validateListingContent({ ...valid, title, description });
      expect(res).toEqual({ ok: false, fieldErrors: { title: CONTACT, description: CONTACT } });
    },
  );

  it('so o campo com contato recebe erro', () => {
    expect(validateListingContent({ ...valid, description: 'tel:+5511' })).toEqual({
      ok: false,
      fieldErrors: { description: CONTACT },
    });
  });

  it('edicao parcial aplica a mesma regra ao campo informado', () => {
    expect(validateListingPatch({ description: 'fulano@exemplo.com' })).toEqual({
      ok: false,
      fieldErrors: { description: CONTACT },
    });
  });

  it('cidade/UF e casos validos com medidas, capacidade, ano e modelo sao aceitos', () => {
    for (const [title, description] of [
      ['TV 55 polegadas', 'TV 55 polegadas 4K, ano 2022, modelo UN55TU8000.'],
      ['iPhone 15 128 GB', 'iPhone 15 128 GB, bateria 92%, com caixa.'],
      ['Mesa 120 x 80 cm', 'Mesa 120 x 80 cm, madeira maciça, 6 lugares.'],
    ]) {
      expect(validateListingContent({ ...valid, title, description }).ok).toBe(true);
    }
  });

  it('o erro nunca reproduz o dado detectado', () => {
    const res = validateListingContent({ ...valid, description: 'Chama 11 98765-4321' });
    expect(JSON.stringify(res)).not.toContain('98765');
  });

  it('alternativa de troca com contato e erro do proprio campo, em qualquer estado', () => {
    for (const requireComplete of [false, true]) {
      expect(
        validateTradeOptions(['Um notebook', 'Um videogame', 'wa.me/5511'], requireComplete),
      ).toEqual({ ok: false, fieldErrors: { tradeOption3: CONTACT } });
    }
  });

  it('contactFieldErrors so aponta contato no conteudo gravado', () => {
    expect(
      contactFieldErrors({
        title: 'Bicicleta aro 29',
        description: 'Rua Augusta, 500',
        tradeOptions: ['', 'fulano@exemplo.com', 'Um videogame'],
      }),
    ).toEqual({ description: CONTACT, tradeOption2: CONTACT });
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
