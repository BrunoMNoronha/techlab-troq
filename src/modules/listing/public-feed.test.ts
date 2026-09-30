import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicFeed } from './actions';
import {
  normalizeCity,
  normalizeLimit,
  normalizePage,
  normalizePublicFeedQuery,
  normalizeState,
} from './public-query';
import * as prismaModule from '@/persistence/prisma';

// Unitarios da consulta publica (listing-contract.md, secoes 9.1 a 9.3; D-10 e
// D-11). A ordenacao e a paginacao contra banco real estao em
// public-listing.integration.test.ts.

describe('normalizacao dos parametros do feed publico (9.1)', () => {
  it.each([
    [undefined, 1],
    [null, 1],
    [1, 1],
    [7, 7],
    ['3', 3],
    [0, 1],
    [-2, 1],
    [1.5, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [2 ** 60, 1],
    ['abc', 1],
    ['2.0', 1],
    ['1e3', 1],
    [' 2', 1],
    ['-1', 1],
    [{}, 1],
    [1e9, 1e9],
  ])('page %s vira %s', (input, expected) => {
    expect(normalizePage(input)).toBe(expected);
  });

  it.each([
    [undefined, 20],
    [1, 1],
    [20, 20],
    [50, 50],
    [51, 50],
    [1e9, 50],
    [0, 20],
    [-5, 20],
    [2.5, 20],
    ['10', 10],
    ['99', 50],
    ['x', 20],
    [true, 20],
  ])('limit %s vira %s', (input, expected) => {
    expect(normalizeLimit(input)).toBe(expected);
  });

  it('cidade: trim, vazio ignorado, nao texto ignorado', () => {
    expect(normalizeCity('  Campinas  ')).toBe('Campinas');
    expect(normalizeCity('   ')).toBeUndefined();
    expect(normalizeCity('')).toBeUndefined();
    expect(normalizeCity(42)).toBeUndefined();
  });

  it('UF: trim + maiusculas; vazio ignorado; fora do formato nao corresponde a nada', () => {
    expect(normalizeState(' sp ')).toBe('SP');
    expect(normalizeState('  ')).toBeUndefined();
    expect(normalizeState(undefined)).toBeUndefined();
    expect(normalizeState('S')).toBeNull();
    expect(normalizeState('SPX')).toBeNull();
    expect(normalizeState('S1')).toBeNull();
    expect(normalizeState('ÇA')).toBeNull();
  });

  it('opcoes que nao sao objeto viram os padroes', () => {
    for (const options of [undefined, null, 'x', 3, []]) {
      expect(normalizePublicFeedQuery(options)).toEqual({
        page: 1,
        limit: 20,
        city: undefined,
        state: undefined,
      });
    }
  });
});

describe('getPublicFeed (D-10, D-11)', () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const transaction = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    findMany.mockReset().mockReturnValue('findMany');
    count.mockReset().mockReturnValue('count');
    transaction.mockReset().mockResolvedValue([[], 0]);
    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      listing: { findMany, count },
      $transaction: transaction,
    } as unknown as prismaModule.PrismaClient);
  });

  it('ordena por createdAt e desempata por id, ambos decrescentes', async () => {
    await getPublicFeed();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 20,
      }),
    );
  });

  it('filtra so published de dono active e devolve page/limit aplicados', async () => {
    transaction.mockResolvedValueOnce([[], 41]);
    const result = await getPublicFeed({ page: 3, limit: 10 });
    expect(result).toEqual({ listings: [], total: 41, page: 3, limit: 10 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'published', owner: { status: 'active' } },
        skip: 20,
        take: 10,
      }),
    );
  });

  it('chamada como Server Action com valores arbitrarios nao escapa dos limites', async () => {
    const callAsAction = getPublicFeed as unknown as (
      arg: unknown,
    ) => ReturnType<typeof getPublicFeed>;
    const cases: [unknown, number, number][] = [
      [{ page: -1, limit: 0 }, 1, 20],
      [{ page: 1.5, limit: 51 }, 1, 50],
      [{ page: '2', limit: '1e9' }, 2, 20],
      [{ page: 'drop', limit: 1e9 }, 1, 50],
      ['nao-objeto', 1, 20],
    ];
    for (const [arg, page, limit] of cases) {
      findMany.mockClear();
      const result = await callAsAction(arg);
      expect(result).toMatchObject({ page, limit });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: (page - 1) * limit, take: limit }),
      );
    }
  });

  it('cidade so com espacos e ignorada; UF normalizada em maiusculas', async () => {
    await getPublicFeed({ city: '   ', state: ' pe ' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'published',
          owner: { status: 'active' },
          uf: { equals: 'PE', mode: 'insensitive' },
        },
      }),
    );
  });

  it('UF fora do formato nao corresponde a nenhum anuncio, sem consultar o banco', async () => {
    const result = await getPublicFeed({ state: 'XYZ', page: 2 });
    expect(result).toEqual({ listings: [], total: 0, page: 2, limit: 20 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('pagina com deslocamento acima de int32 so conta, e devolve lista vazia', async () => {
    count.mockReset().mockResolvedValueOnce(5);
    const result = await getPublicFeed({ page: 1e9, limit: 50 });
    expect(result).toEqual({ listings: [], total: 5, page: 1e9, limit: 50 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('projeta so a allowlist e monta URLs de /media', async () => {
    const createdAt = new Date('2026-09-29T12:00:00.000Z');
    transaction.mockResolvedValueOnce([
      [
        {
          id: 'l1',
          title: 'Bicicleta',
          description: 'd',
          city: 'Recife',
          uf: 'PE',
          createdAt,
          images: [
            {
              id: 'i1',
              position: 1,
              derivatives: [{ kind: 'thumb', width: 320, height: 240 }],
            },
          ],
        },
      ],
      1,
    ]);
    const { listings } = await getPublicFeed();
    expect(listings).toEqual([
      {
        id: 'l1',
        title: 'Bicicleta',
        description: 'd',
        city: 'Recife',
        state: 'PE',
        createdAt,
        images: [
          {
            id: 'i1',
            position: 1,
            derivatives: [{ kind: 'thumb', url: '/media/i1/thumb', width: 320, height: 240 }],
          },
        ],
      },
    ]);
    const select = findMany.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(
      ['city', 'createdAt', 'description', 'id', 'images', 'title', 'uf'].sort(),
    );
  });
});
