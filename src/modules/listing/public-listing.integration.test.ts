// @vitest-environment node
//
// Prova de F2-011 (#49) contra PostgreSQL REAL e descartavel: a consulta
// publica (listing-contract.md, secoes 6.1, 7 e 9) sem simular o Prisma.
//
// - somente `published` de dono `active` aparece; `total` conta so visiveis;
// - ordem total `createdAt desc, id desc`: paginar anuncios com o MESMO
//   createdAt nao repete nem omite nenhum;
// - `page`/`limit` normalizados no servidor, inclusive com deslocamento enorme;
// - filtros de cidade/UF conforme 9.1;
// - detalhe com todas as imagens `ready` em ordem, e indisponivel (null) para
//   todo estado nao publico e dono nao elegivel;
// - nenhum marcador de contato, email ou campo proibido no DTO.
//
// So roda com INTEGRATION_EPHEMERAL_DB=1 (DATABASE_URL em banco efemero
// proprio). Dados sinteticos, removidos ao final. Nao fala com o R2.
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ListingStatus, UserStatus } from '@/generated/prisma/client';
import { getPrismaClient } from '@/persistence/prisma';
import { getPublicFeed, getPublicListingDetail } from './actions';

const enabled = process.env.INTEGRATION_EPHEMERAL_DB === '1';

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
// Cidade exclusiva desta execucao: isola a contagem de dados de outras suites.
const CITY = `Cidade Sintetica ${RUN_ID}`;
const PHONE_MARKER = '+55 11 90000-0000';
const TIE = new Date('2026-09-20T12:00:00.000Z');

const PATH_TO: Record<ListingStatus, ListingStatus[]> = {
  draft: [],
  published: ['published'],
  paused: ['published', 'paused'],
  closed: ['closed'],
  removed: ['removed'],
};

const userIds: string[] = [];

async function createOwner(status: UserStatus): Promise<string> {
  const prisma = getPrismaClient();
  const { id } = await prisma.user.create({
    data: {
      displayName: `Dono ${status}`,
      email: `sintetico-${status}-${RUN_ID}@example.test`,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
    select: { id: true },
  });
  userIds.push(id);
  await prisma.userContact.create({ data: { userId: id, phoneNumber: PHONE_MARKER } });
  if (status !== 'active') {
    await prisma.user.update({ where: { id }, data: { status } });
  }
  return id;
}

async function createListing(
  ownerId: string,
  status: ListingStatus,
  opts: { createdAt?: Date; city?: string; uf?: string; title?: string } = {},
): Promise<string> {
  const prisma = getPrismaClient();
  const { id } = await prisma.listing.create({
    data: {
      ownerId,
      title: opts.title ?? `Anuncio ${status}`,
      description: 'Descricao sintetica.',
      city: opts.city ?? CITY,
      uf: opts.uf ?? 'PE',
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
    select: { id: true },
  });
  for (const step of PATH_TO[status]) {
    await prisma.listing.update({ where: { id }, data: { status: step } });
  }
  return id;
}

async function addImage(listingId: string, position: number, status: 'ready' | 'uploaded') {
  const prisma = getPrismaClient();
  const id = randomUUID();
  await prisma.listingImage.create({
    data: {
      id,
      listingId,
      position,
      status,
      objectKey: `originals/${id}/sintetico`,
      ...(status === 'ready'
        ? {
            width: 400,
            height: 300,
            sourceEtag: '"sintetico"',
            sourceConfirmedAt: new Date(),
            processedAt: new Date(),
          }
        : {}),
    },
  });
  if (status === 'ready') {
    for (const [kind, width, height] of [
      ['thumb', 320, 240],
      ['medium', 768, 576],
      ['large', 1600, 1200],
    ] as const) {
      await prisma.imageDerivative.create({
        data: { imageId: id, kind, objectKey: `derivatives/${id}/${kind}`, width, height },
      });
    }
  }
  return id;
}

describe.skipIf(!enabled)('consulta publica contra banco real (#49)', () => {
  let active: string;
  const hidden: Record<string, string> = {};
  let visibleWithImages: string;
  let readyImages: string[];
  let pendingImage: string;
  const tied: string[] = [];

  beforeAll(async () => {
    active = await createOwner('active');
    const blockedAge = await createOwner('blocked_age');
    const blockedAdmin = await createOwner('blocked_admin');
    const deleting = await createOwner('deletion_requested');

    // 25 anuncios publicados com o MESMO createdAt: a ordem so e total pelo id.
    for (let i = 0; i < 25; i++) {
      tied.push(await createListing(active, 'published', { createdAt: TIE }));
    }
    // Um publicado mais recente, com imagens fora de ordem de criacao.
    visibleWithImages = await createListing(active, 'published', {
      createdAt: new Date(TIE.getTime() + 60_000),
      title: 'Bicicleta aro 29',
    });
    const second = await addImage(visibleWithImages, 2, 'ready');
    pendingImage = await addImage(visibleWithImages, 3, 'uploaded');
    const first = await addImage(visibleWithImages, 1, 'ready');
    readyImages = [first, second];

    for (const status of ['draft', 'paused', 'closed', 'removed'] as const) {
      hidden[status] = await createListing(active, status);
    }
    hidden.blocked_age = await createListing(blockedAge, 'published');
    hidden.blocked_admin = await createListing(blockedAdmin, 'published');
    hidden.deletion_requested = await createListing(deleting, 'published');
  }, 120_000);

  afterAll(async () => {
    const prisma = getPrismaClient();
    await prisma.imageDerivative.deleteMany({
      where: { image: { listing: { ownerId: { in: userIds } } } },
    });
    await prisma.listingImage.deleteMany({ where: { listing: { ownerId: { in: userIds } } } });
    await prisma.listing.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.userContact.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('so published de dono active aparece, e total conta so os visiveis', async () => {
    const feed = await getPublicFeed({ city: CITY, limit: 50 });
    expect(feed.total).toBe(26);
    const ids = feed.listings.map((l) => l.id);
    expect(ids).toHaveLength(26);
    for (const id of Object.values(hidden)) {
      expect(ids).not.toContain(id);
    }
  });

  it('empate de createdAt: paginas de 10 cobrem os 25 uma unica vez, em id decrescente', async () => {
    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const feed = await getPublicFeed({ city: CITY, page, limit: 10 });
      expect(feed).toMatchObject({ page, limit: 10, total: 26 });
      seen.push(...feed.listings.map((l) => l.id));
    }
    expect(seen[0]).toBe(visibleWithImages);
    const rest = seen.slice(1);
    expect(new Set(rest).size).toBe(25);
    expect([...rest].sort()).toEqual([...tied].sort());
    expect(rest).toEqual([...tied].sort().reverse());
  });

  it('a mesma pagina, repetida, devolve a mesma ordem', async () => {
    const a = await getPublicFeed({ city: CITY, page: 2, limit: 7 });
    const b = await getPublicFeed({ city: CITY, page: 2, limit: 7 });
    expect(a.listings.map((l) => l.id)).toEqual(b.listings.map((l) => l.id));
  });

  it('pagina alem da ultima e lista vazia com total correto, inclusive com deslocamento enorme', async () => {
    expect(await getPublicFeed({ city: CITY, page: 4, limit: 10 })).toMatchObject({
      listings: [],
      total: 26,
      page: 4,
    });
    // OFFSET perto do teto de int32 chega ao banco; acima dele, so a contagem.
    for (const page of [40_000_000, 1e9, Number.MAX_SAFE_INTEGER]) {
      expect(await getPublicFeed({ city: CITY, page, limit: 50 })).toEqual({
        listings: [],
        total: 26,
        page,
        limit: 50,
      });
    }
  });

  it('limit acima do teto e limitado a 50; invalido volta ao padrao', async () => {
    const callAsAction = getPublicFeed as unknown as (
      arg: unknown,
    ) => ReturnType<typeof getPublicFeed>;
    const capped = await callAsAction({ city: CITY, limit: 10_000 });
    expect(capped.limit).toBe(50);
    expect(capped.listings).toHaveLength(26);
    const fallback = await callAsAction({ city: CITY, limit: -1, page: 'x' });
    expect(fallback).toMatchObject({ page: 1, limit: 20 });
    expect(fallback.listings).toHaveLength(20);
  });

  it('filtros: cidade sem diferenciar maiusculas; UF normalizada; UF invalida nao corresponde', async () => {
    expect((await getPublicFeed({ city: `  ${CITY.toUpperCase()} ` })).total).toBe(26);
    expect((await getPublicFeed({ city: CITY, state: ' pe ' })).total).toBe(26);
    expect((await getPublicFeed({ city: CITY, state: 'SP' })).total).toBe(0);
    expect(await getPublicFeed({ city: CITY, state: 'PEX' })).toMatchObject({
      listings: [],
      total: 0,
    });
    // Cidade so com espacos e ignorada: mesmo total do feed sem filtro.
    const blank = await getPublicFeed({ city: '   ' });
    const none = await getPublicFeed();
    expect(blank.total).toBe(none.total);
  });

  it('detalhe traz todas as imagens ready em ordem e nenhuma pendente', async () => {
    const detail = await getPublicListingDetail(visibleWithImages);
    expect(detail?.images.map((i) => i.id)).toEqual(readyImages);
    expect(detail?.images.map((i) => i.position)).toEqual([1, 2]);
    expect(JSON.stringify(detail)).not.toContain(pendingImage);
    for (const image of detail!.images) {
      expect(image.derivatives.map((d) => d.url).sort()).toEqual(
        ['large', 'medium', 'thumb'].map((k) => `/media/${image.id}/${k}`),
      );
    }
  });

  it('detalhe indisponivel para todo estado nao publico, dono nao elegivel, inexistente e malformado', async () => {
    for (const [label, id] of Object.entries(hidden)) {
      expect(await getPublicListingDetail(id), label).toBeNull();
    }
    expect(await getPublicListingDetail(randomUUID())).toBeNull();
    expect(await getPublicListingDetail('nao-uuid')).toBeNull();
  });

  it('DTO so tem a allowlist, sem contato, email, dono ou estado', async () => {
    const feed = await getPublicFeed({ city: CITY, limit: 50 });
    const detail = await getPublicListingDetail(visibleWithImages);
    for (const item of [...feed.listings, detail!]) {
      expect(Object.keys(item).sort()).toEqual(
        ['city', 'createdAt', 'description', 'id', 'images', 'state', 'title'].sort(),
      );
    }
    const json = JSON.stringify({ feed, detail });
    for (const forbidden of [
      PHONE_MARKER,
      // O numero em outras grafias. '90000' sozinho nao serve: aparece por
      // acaso em UUID aleatorio (CI de F2-013: id terminado em "…90000").
      '90000-0000',
      '11900000000',
      '@example.test',
      active,
      'ownerId',
      'status',
      'updatedAt',
      'termsVersion',
      'objectKey',
      'originals/',
      'derivatives/',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });
});
