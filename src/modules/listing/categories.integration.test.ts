// Better Auth e PostgreSQL reais; somente banco descartavel.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getPrismaClient } from '@/persistence/prisma';
import { getAuth } from '@/modules/identity/auth';
import { registerUser } from '@/modules/identity/actions';
import {
  createDraftListing,
  updateListing,
  getListingForEdit,
  getOwnerListings,
  publishListing,
  pauseListing,
  reactivateListing,
  discardDraft,
  getPublicFeed,
  getPublicListingDetail,
} from './actions';

let browserCookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: browserCookie }) }));
vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

const password = 'senha-sintetica-categoria-123';
const content = {
  title: 'Produto sintetico categoria',
  description: 'Conteudo sintetico sem contato.',
  city: 'Recife',
  state: 'PE',
  tradeOptions: ['Um livro', 'Um jogo', 'Uma camera'],
};
const userIds: string[] = [];
let cookieA = '';
let cookieB = '';

async function account(suffix: string) {
  const email = `category-${Date.now()}-${suffix}@example.test`;
  expect(
    (
      await registerUser({
        displayName: 'Usuario Sintetico',
        email,
        password,
        over18: true,
        termsAccepted: true,
      })
    ).success,
  ).toBe(true);
  const db = getPrismaClient();
  const user = await db.user.findFirstOrThrow({ where: { email } });
  userIds.push(user.id);
  await db.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  const { headers } = await getAuth().api.signInEmail({
    body: { email, password },
    headers: new Headers(),
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

async function draft(category?: string | null) {
  const result = await createDraftListing({ ...content, category });
  expect(result.success).toBe(true);
  return result.listingId!;
}

async function readyImage(listingId: string) {
  const id = randomUUID();
  await getPrismaClient().$executeRaw`
    INSERT INTO listing_images
      (id, listing_id, position, status, object_key, upload_generation,
       source_confirmed_at, processed_at, width, height, created_at, updated_at)
    VALUES (${id}::uuid, ${listingId}::uuid, 1, 'ready', ${`originals/${id}/1`}, 1,
      now(), now(), 800, 600, now(), now())`;
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'categoria: persistencia, autorizacao, ciclo de vida e legados (#89)',
  () => {
    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
      cookieA = await account('a');
      cookieB = await account('b');
      browserCookie = cookieA;
    });

    afterAll(async () => {
      const db = getPrismaClient();
      const listings = await db.listing.findMany({
        where: { ownerId: { in: userIds } },
        select: { id: true },
      });
      const ids = listings.map((listing) => listing.id);
      await db.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
      await db.termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
      await db.listingTransition.deleteMany({ where: { listingId: { in: ids } } });
      await db.listingImage.deleteMany({ where: { listingId: { in: ids } } });
      await db.listingTradeOption.deleteMany({ where: { listingId: { in: ids } } });
      await db.listing.deleteMany({ where: { id: { in: ids } } });
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.account.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      vi.unstubAllEnvs();
    });

    it('salva/reabre/altera; patch omitido mantem; rascunho pode limpar', async () => {
      const id = await draft('esportes');
      expect((await getListingForEdit(id)).listing?.category).toBe('esportes');
      expect((await getOwnerListings()).listings?.find((row) => row.id === id)?.category).toBe(
        'esportes',
      );
      expect((await updateListing(id, { category: 'games' })).success).toBe(true);
      expect((await updateListing(id, { title: 'Titulo alterado sintetico' })).success).toBe(true);
      expect((await getListingForEdit(id)).listing).toMatchObject({
        category: 'games',
        description: content.description,
      });

      expect((await updateListing(id, { category: null })).success).toBe(true);
      expect((await getListingForEdit(id)).listing?.category).toBeNull();
    });

    it('migration incremental preserva titulo/estado de registro sem categoria', async () => {
      const migration = readFileSync(
        'prisma/migrations/20261005120000_listing_product_category/migration.sql',
        'utf8',
      );
      await getPrismaClient().$transaction(async (tx) => {
        // Tabela temporaria da conexao simula a versao anterior e sombreia
        // listings somente nesta transacao, sem alterar a tabela da aplicacao.
        await tx.$executeRawUnsafe(
          'CREATE TEMP TABLE listings (id text, title text, status text) ON COMMIT DROP',
        );
        await tx.$executeRaw`INSERT INTO listings VALUES ('legado', 'Titulo preservado', 'published')`;
        for (const statement of migration.split(';').filter((sql) => sql.trim())) {
          await tx.$executeRawUnsafe(statement);
        }
        expect(await tx.$queryRaw`SELECT * FROM listings`).toEqual([
          { id: 'legado', title: 'Titulo preservado', status: 'published', category: null },
        ]);
      });
    });

    it('publicar e limpar categoria concorrentemente nao produzem publico sem categoria', async () => {
      for (let round = 0; round < 3; round++) {
        const id = await draft('esportes');
        await readyImage(id);
        const [publish, clear] = await Promise.all([
          publishListing(id, true),
          updateListing(id, { category: null }),
        ]);
        expect(Number(publish.success) + Number(clear.success)).toBe(1);
        const row = await getPrismaClient().listing.findUniqueOrThrow({ where: { id } });
        if (row.status === 'published') expect(row.category).toBe('esportes');
        else expect(row).toMatchObject({ status: 'draft', category: null });
      }
    });

    it('recusa codigo/payload invalido sem escrita parcial; CHECK protege escrita direta', async () => {
      const id = await draft('esportes');
      const before = await getPrismaClient().listing.findUniqueOrThrow({ where: { id } });
      for (const category of ['desconhecida', [], 1]) {
        const result = await updateListing(id, {
          title: 'Nao pode ser gravado',
          category,
        } as never);
        expect(result).toMatchObject({
          success: false,
          reason: 'validation',
          fieldErrors: { category: expect.any(String) },
        });
        expect((await createDraftListing({ ...content, category } as never)).success).toBe(false);
      }
      expect(await getPrismaClient().listing.findUniqueOrThrow({ where: { id } })).toEqual(before);
      await expect(
        getPrismaClient().listing.update({ where: { id }, data: { category: 'desconhecida' } }),
      ).rejects.toThrow();
      expect((await getListingForEdit(id)).listing?.category).toBe('esportes');
    });

    it('dono alheio e estado terminal nao alteram categoria', async () => {
      const id = await draft('esportes');
      browserCookie = cookieB;
      expect(await updateListing(id, { category: 'games' })).toMatchObject({
        success: false,
        reason: 'not_found',
      });
      browserCookie = cookieA;
      expect((await discardDraft(id)).success).toBe(true);
      expect(await updateListing(id, { category: 'games' })).toMatchObject({
        success: false,
        reason: 'not_editable',
      });
      expect((await getListingForEdit(id)).listing?.category).toBe('esportes');
    });

    it('publicacao exige categoria; publica e projeta somente o codigo publico', async () => {
      const id = await draft();
      await readyImage(id);
      expect(await publishListing(id, true)).toMatchObject({
        success: false,
        fieldErrors: { category: expect.any(String) },
      });
      expect((await getListingForEdit(id)).listing?.status).toBe('draft');
      expect(await getPublicListingDetail(id)).toBeNull();
      expect((await updateListing(id, { category: 'esportes' })).success).toBe(true);
      expect((await publishListing(id, true)).success).toBe(true);
      browserCookie = '';
      const detail = await getPublicListingDetail(id);
      expect(detail?.category).toBe('esportes');
      expect(detail).not.toHaveProperty('ownerId');
      expect(detail).not.toHaveProperty('contact');
      expect((await getPublicFeed()).listings.find((row) => row.id === id)?.category).toBe(
        'esportes',
      );
      browserCookie = cookieA;
      expect(
        await updateListing(id, { category: null, title: 'Nao pode ser gravado' }),
      ).toMatchObject({ success: false, fieldErrors: { category: expect.any(String) } });
      expect((await getListingForEdit(id)).listing).toMatchObject({
        title: content.title,
        category: 'esportes',
      });
    });

    it('legado publicado fica visivel sem categoria; primeira edicao e reativacao regularizam', async () => {
      const id = await draft();
      await readyImage(id);
      await getPrismaClient().listing.update({ where: { id }, data: { status: 'published' } });
      expect((await getPublicListingDetail(id))?.category).toBeNull();
      expect((await getPublicFeed()).listings.some((row) => row.id === id)).toBe(true);
      expect(await updateListing(id, { title: 'Outra descricao de legado' })).toMatchObject({
        success: false,
        fieldErrors: { category: expect.any(String) },
      });
      expect((await pauseListing(id)).success).toBe(true);
      expect(await reactivateListing(id)).toMatchObject({
        success: false,
        fieldErrors: { category: expect.any(String) },
      });
      expect(await getPublicListingDetail(id)).toBeNull();
      expect((await updateListing(id, { category: 'outros' })).success).toBe(true);
      expect((await reactivateListing(id)).success).toBe(true);
      expect((await getPublicListingDetail(id))?.category).toBe('outros');
    });
  },
);
