// @vitest-environment node
//
// Prova de integracao de #90: UF da lista de 27 (listing-contract.md, secoes 3,
// 3.2 e 9.1) contra o Better Auth REAL e PostgreSQL REAL e descartavel.
//
// Sessoes emitidas por `signInEmail`; o unico mock e `headers()` do Next.js,
// como em listing-drafts.integration.test.ts. Anuncios com UF legada fora da
// lista e imagens `ready` sao fixture no banco.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1 (docs/engineering/
// testing.md, secao 2.2). Dados sinteticos, removidos ao final.
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrismaClient } from '@/persistence/prisma';
import type { ListingStatus } from '@/generated/prisma/client';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import {
  createDraftListing,
  getListingForEdit,
  getPublicFeed,
  publishListing,
  reactivateListing,
  updateListing,
} from './actions';

let browserCookie = '';

vi.mock('next/headers', () => ({
  headers: async () => new Headers(browserCookie ? { cookie: browserCookie } : {}),
}));

vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const EMAIL = `it-listing-uf-${RUN_ID}@example.test`;
// Cidade exclusiva desta execucao: o feed publico so ve os anuncios da suite.
const CITY = `Cidade UF ${RUN_ID}`;
const OPTIONS = ['Um notebook', 'Um videogame', 'Uma camera'];
const STATE_ERROR = { state: 'Selecione o estado.' };

type CreateInput = Parameters<typeof createDraftListing>[0];

const prisma = () => getPrismaClient();
const createdImageIds: string[] = [];

const input = {
  title: 'Bicicleta sintetica UF',
  description: 'Anuncio sintetico de integracao.',
  city: CITY,
  tradeOptions: OPTIONS,
};

async function createUser(): Promise<string> {
  const res = await registerUser({
    displayName: 'Usuario Sintetico',
    email: EMAIL,
    password: PASSWORD,
    over18: true,
    termsAccepted: true,
  });
  expect(res.success).toBe(true);
  const { id } = await prisma().user.findFirstOrThrow({ where: { email: EMAIL } });
  await prisma().user.update({
    where: { id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  return id;
}

async function signIn(): Promise<string> {
  const { headers } = await getAuth().api.signInEmail({
    body: { email: EMAIL, password: PASSWORD },
    headers: new Headers({ 'user-agent': 'agente-sintetico/1.0' }),
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  expect(cookie).toContain('session_token=');
  return cookie;
}

async function readyImage(listingId: string): Promise<void> {
  const id = randomUUID();
  createdImageIds.push(id);
  await prisma().$executeRaw`
    INSERT INTO "listing_images"
      ("id", "listing_id", "position", "status", "object_key", "upload_generation",
       "source_confirmed_at", "processed_at", "width", "height", "created_at", "updated_at")
    VALUES (${id}::uuid, ${listingId}::uuid, 1, 'ready'::"listing_image_status",
            ${`originals/${id}/1`}, 1, now(), now(), 800, 600, now(), now())`;
}

/**
 * Anuncio gravado antes de #90 com UF fora da lista, ja no estado pedido pelo
 * caminho legal (o gatilho do banco recusa pares fora de T1..T9).
 */
async function legacyListing(ownerId: string, path: ListingStatus[]): Promise<string> {
  const { id } = await prisma().listing.create({
    data: {
      ownerId,
      title: 'Anuncio legado UF',
      description: 'Fixture sintetica com UF fora da lista.',
      city: CITY,
      uf: 'ZZ',
      // Categoria ja regularizada para isolar a regra de UF; #89 cobre ausencia.
      category: 'esportes',
      tradeOptions: { create: OPTIONS.map((label, i) => ({ position: i + 1, label })) },
    },
    select: { id: true },
  });
  await readyImage(id);
  for (const status of path) await prisma().listing.update({ where: { id }, data: { status } });
  return id;
}

function row(id: string) {
  return prisma().listing.findUniqueOrThrow({ where: { id } });
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'UF por lista (#90): Better Auth real contra PostgreSQL descartavel',
  () => {
    let userId: string;
    let cookie: string;

    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
      userId = await createUser();
      cookie = await signIn();
    });

    beforeEach(() => {
      browserCookie = cookie;
    });

    afterAll(async () => {
      const listings = await prisma().listing.findMany({
        where: { ownerId: userId },
        select: { id: true },
      });
      const listingIds = listings.map((l) => l.id);
      await prisma().auditEvent.deleteMany({ where: { actorId: userId } });
      await prisma().termsAcceptance.deleteMany({ where: { userId } });
      await prisma().listingTransition.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().listingImage.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().mediaObjectDeletion.deleteMany({
        where: { OR: createdImageIds.map((id) => ({ objectKey: { contains: id } })) },
      });
      await prisma().listing.deleteMany({ where: { id: { in: listingIds } } });
      await prisma().verification.deleteMany({
        where: { identifier: `email-verification:${userId}` },
      });
      await prisma().user.deleteMany({ where: { id: userId } });
      await prisma().$disconnect();
      vi.unstubAllEnvs();
    });

    it('criacao recusa UF inexistente, vazia ou de tipo invalido, sem gravar nada', async () => {
      const before = await prisma().listing.count({ where: { ownerId: userId } });
      for (const state of ['ZZ', '', '  ', 35, null, ['SP']]) {
        // Chamada direta com payload arbitrario: o tipo declarado nao e controle.
        const res = await createDraftListing({ ...input, state } as unknown as CreateInput);
        expect(res).toMatchObject({
          success: false,
          reason: 'validation',
          fieldErrors: STATE_ERROR,
        });
      }
      expect(await prisma().listing.count({ where: { ownerId: userId } })).toBe(before);
    });

    it('cria com UF normalizada, reabre selecionada e troca pela edicao', async () => {
      const created = await createDraftListing({ ...input, state: ' df ' });
      expect(created.success).toBe(true);
      const id = created.listingId!;
      expect((await row(id)).uf).toBe('DF');
      expect((await getListingForEdit(id)).listing).toMatchObject({ state: 'DF' });

      expect(await updateListing(id, { ...input, state: 'SP' })).toEqual({
        success: true,
        listingId: id,
      });
      expect((await getListingForEdit(id)).listing).toMatchObject({ state: 'SP' });

      // Patch sem `state` mantem a UF gravada.
      expect((await updateListing(id, { title: 'Bicicleta sintetica UF 2' })).success).toBe(true);
      expect(await row(id)).toMatchObject({ title: 'Bicicleta sintetica UF 2', uf: 'SP' });
    });

    it('edicao com UF inexistente nao grava nem os outros campos enviados', async () => {
      const id = (await createDraftListing({ ...input, state: 'PE' })).listingId!;
      const before = await row(id);

      const res = await updateListing(id, { title: 'Titulo que nao pode entrar', state: 'ZZ' });

      expect(res).toMatchObject({ success: false, reason: 'validation', fieldErrors: STATE_ERROR });
      expect(await row(id)).toEqual(before);
    });

    it('legado em rascunho: edicao devolve a UF como esta e publicar recusa no campo', async () => {
      const id = await legacyListing(userId, []);
      expect((await getListingForEdit(id)).listing).toMatchObject({ state: 'ZZ' });

      const res = await publishListing(id, true);

      expect(res).toMatchObject({ success: false, reason: 'validation', fieldErrors: STATE_ERROR });
      expect(await row(id)).toMatchObject({ status: 'draft', uf: 'ZZ' });
      expect(await prisma().listingTransition.count({ where: { listingId: id } })).toBe(0);

      // Escolhida uma UF valida, a publicacao passa.
      expect((await updateListing(id, { state: 'BA' })).success).toBe(true);
      expect(await publishListing(id, true)).toMatchObject({ success: true, status: 'published' });
    });

    it('legado pausado: reativar recusa a UF e o anuncio continua pausado', async () => {
      const id = await legacyListing(userId, ['published', 'paused']);

      const res = await reactivateListing(id);

      expect(res).toMatchObject({ success: false, reason: 'validation', fieldErrors: STATE_ERROR });
      expect(await row(id)).toMatchObject({ status: 'paused', uf: 'ZZ' });
    });

    it('legado publicado continua publico; filtro por UF inexistente nao amplia a consulta', async () => {
      const id = await legacyListing(userId, ['published']);

      const all = await getPublicFeed({ city: CITY });
      expect(all.listings.map((l) => l.id)).toContain(id);
      expect(await row(id)).toMatchObject({ status: 'published', uf: 'ZZ' });

      for (const state of ['ZZ', 'zz', 'XX1']) {
        expect(await getPublicFeed({ city: CITY, state })).toMatchObject({
          listings: [],
          total: 0,
        });
      }
    });
  },
);
