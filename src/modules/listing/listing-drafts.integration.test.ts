// @vitest-environment node
//
// Prova de integracao de F2-006 (#44): rascunhos, edicao e "meus anuncios"
// contra o Better Auth REAL e PostgreSQL REAL e descartavel
// (docs/architecture/listing-contract.md, secoes 3, 4, 6 e 7).
//
// As sessoes sao emitidas por `signInEmail` e o cookie do provedor e
// reapresentado ao guard; o unico mock e `headers()` do Next.js, como em
// src/modules/identity/auth-flow.integration.test.ts. Estados que dependem de
// transicoes (#48) sao preparados direto no banco, como fixture.
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
  getOwnerListings,
  getPublicFeed,
  getPublicListingDetail,
  updateListing,
} from './actions';

let browserCookie = '';

vi.mock('next/headers', () => ({
  headers: async () => new Headers(browserCookie ? { cookie: browserCookie } : {}),
}));

vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const emails = {
  a: `it-listing-a-${RUN_ID}@example.test`,
  b: `it-listing-b-${RUN_ID}@example.test`,
};

const draftInput = {
  title: 'Bicicleta sintetica A',
  description: 'Rascunho sintetico de integracao.',
  city: 'Recife',
  state: 'PE',
};

async function createVerifiedUser(email: string): Promise<string> {
  const res = await registerUser({
    displayName: 'Usuario Sintetico',
    email,
    password: PASSWORD,
    over18: true,
    termsAccepted: true,
  });
  expect(res.success).toBe(true);
  const prisma = getPrismaClient();
  const { id } = await prisma.user.findFirstOrThrow({ where: { email } });
  await prisma.user.update({
    where: { id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  return id;
}

async function signIn(email: string): Promise<string> {
  const { headers } = await getAuth().api.signInEmail({
    body: { email, password: PASSWORD },
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

function readRow(id: string) {
  return getPrismaClient().listing.findUniqueOrThrow({ where: { id } });
}

// Caminho legal ate cada estado (o banco recusa pares fora de T1..T9).
const PATH_TO: Record<ListingStatus, ListingStatus[]> = {
  draft: [],
  published: ['published'],
  paused: ['published', 'paused'],
  closed: ['closed'],
  removed: ['removed'],
};

/** Fixture: anuncio do dono ja no estado pedido, sem passar pelas actions de #48. */
async function fixture(ownerId: string, status: ListingStatus, title = `Fixture ${status}`) {
  const prisma = getPrismaClient();
  const { id } = await prisma.listing.create({
    data: { ownerId, title, description: 'Fixture sintetica.', city: 'Recife', uf: 'PE' },
    select: { id: true },
  });
  for (const step of PATH_TO[status]) {
    await prisma.listing.update({ where: { id }, data: { status: step } });
  }
  return id;
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'rascunhos, edicao e meus anuncios: Better Auth real contra PostgreSQL descartavel',
  () => {
    let userAId: string;
    let userBId: string;
    let cookieA: string;
    let cookieB: string;
    let listingAId: string;
    let listingBId: string;

    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');

      userAId = await createVerifiedUser(emails.a);
      userBId = await createVerifiedUser(emails.b);
      cookieA = await signIn(emails.a);
      cookieB = await signIn(emails.b);
    });

    beforeEach(() => {
      browserCookie = cookieA;
    });

    afterAll(async () => {
      const prisma = getPrismaClient();
      const all = Object.values(emails);
      await prisma.listing.deleteMany({ where: { owner: { email: { in: all } } } });
      await prisma.termsAcceptance.deleteMany({ where: { user: { email: { in: all } } } });
      const users = await prisma.user.findMany({
        where: { email: { in: all } },
        select: { id: true },
      });
      await prisma.verification.deleteMany({
        where: { identifier: { in: users.map((u) => `email-verification:${u.id}`) } },
      });
      await prisma.user.deleteMany({ where: { email: { in: all } } });
      await prisma.$disconnect();
      vi.unstubAllEnvs();
    });

    it('1-3. A cria rascunho; dono e estado vem do servidor, nao do payload adulterado', async () => {
      const tampered = {
        ...draftInput,
        ownerId: userBId,
        status: 'published',
        publishedAt: new Date(),
        createdAt: new Date(0),
        id: randomUUID(),
      };

      const res = await createDraftListing(tampered);

      expect(res.success).toBe(true);
      listingAId = res.listingId!;
      expect(listingAId).not.toBe(tampered.id);
      const row = await readRow(listingAId);
      expect(row.ownerId).toBe(userAId);
      expect(row.status).toBe('draft');
      expect(row.publishedAt).toBeNull();
      expect(row.createdAt.getTime()).toBeGreaterThan(0);
      expect(row).toMatchObject({ title: draftInput.title, city: 'Recife', uf: 'PE' });
      // Rascunho sem imagem e valido.
      expect(await getPrismaClient().listingImage.count({ where: { listingId: listingAId } })).toBe(
        0,
      );
    });

    it('4. B cria o proprio anuncio', async () => {
      browserCookie = cookieB;
      const res = await createDraftListing({ ...draftInput, title: 'Anuncio privado de B' });
      expect(res.success).toBe(true);
      listingBId = res.listingId!;
      expect((await readRow(listingBId)).ownerId).toBe(userBId);
    });

    it('5 e 7. A nao le o anuncio de B, e a resposta e identica a de um UUID inexistente', async () => {
      const foreign = await getListingForEdit(listingBId);
      const missing = await getListingForEdit(randomUUID());
      const malformed = await getListingForEdit('nao-e-uuid');

      expect(foreign).toEqual({
        success: false,
        reason: 'not_found',
        error: 'Anúncio não encontrado.',
      });
      expect(missing).toEqual(foreign);
      expect(malformed).toEqual(foreign);
      expect(JSON.stringify(foreign)).not.toContain('Anuncio privado de B');
    });

    it('6-8. A nao altera o anuncio de B; resposta igual a inexistente; B intacto no banco', async () => {
      const before = await readRow(listingBId);

      const foreign = await updateListing(listingBId, { title: 'Adulterado por A' });
      const missing = await updateListing(randomUUID(), { title: 'Adulterado por A' });

      expect(foreign).toEqual({
        success: false,
        reason: 'not_found',
        error: 'Anúncio não encontrado.',
      });
      expect(missing).toEqual(foreign);
      expect(await readRow(listingBId)).toEqual(before);

      // Em qualquer estado de B, a resposta a A nao muda (nao vaza estado).
      for (const status of ['published', 'paused', 'closed', 'removed'] as const) {
        const otherId = await fixture(userBId, status, `B em ${status}`);
        const otherBefore = await readRow(otherId);
        expect(await updateListing(otherId, { title: 'Adulterado por A' })).toEqual(foreign);
        expect(await getListingForEdit(otherId)).toEqual(await getListingForEdit(randomUUID()));
        expect(await readRow(otherId)).toEqual(otherBefore);
      }
    });

    it('"Meus anuncios" de A contem so os anuncios de A', async () => {
      const res = await getOwnerListings();
      expect(res.success).toBe(true);
      const ids = res.listings!.map((l) => l.id);
      expect(ids).toContain(listingAId);
      expect(ids).not.toContain(listingBId);
      expect(res.listings![0]).not.toHaveProperty('ownerId');
    });

    it('9. entradas invalidas nao persistem escrita, na criacao nem na edicao', async () => {
      const countBefore = await getPrismaClient().listing.count({ where: { ownerId: userAId } });
      const invalidCreate = await createDraftListing({
        ...draftInput,
        description: '    ',
        city: '  ',
        state: 'P1',
      });
      expect(invalidCreate.reason).toBe('validation');
      expect(Object.keys(invalidCreate.fieldErrors!).sort()).toEqual([
        'city',
        'description',
        'state',
      ]);
      expect(await getPrismaClient().listing.count({ where: { ownerId: userAId } })).toBe(
        countBefore,
      );

      const before = await readRow(listingAId);
      for (const patch of [
        { description: '  ' },
        { city: '' },
        { state: 'PER' },
        { title: 'abc' },
      ]) {
        const res = await updateListing(listingAId, patch);
        expect(res.reason).toBe('validation');
      }
      expect(await readRow(listingAId)).toEqual(before);
    });

    it.each(['draft', 'published', 'paused'] as const)(
      '11. estado %s aceita alteracao valida do dono',
      async (status) => {
        const id = status === 'draft' ? listingAId : await fixture(userAId, status);
        const title = `Titulo em ${status}`;

        const res = await updateListing(id, { title, state: ' sp ', city: ' Olinda ' });

        expect(res).toEqual({ success: true, listingId: id });
        const row = await readRow(id);
        expect(row).toMatchObject({ title, uf: 'SP', city: 'Olinda', status, ownerId: userAId });
      },
    );

    it.each(['closed', 'removed'] as const)(
      '10. estado %s e somente leitura para o proprio dono',
      async (status) => {
        const id = await fixture(userAId, status);
        const before = await readRow(id);

        const res = await updateListing(id, { title: 'Tentativa em terminal' });

        expect(res).toMatchObject({ success: false, reason: 'not_editable' });
        expect(await readRow(id)).toEqual(before);
        // O dono continua vendo o historico.
        const read = await getListingForEdit(id);
        expect(read.listing?.status).toBe(status);
      },
    );

    it('corrida: transicao para closed concorrente nao deixa a edicao gravar em terminal', async () => {
      const prisma = getPrismaClient();
      const raceId = await fixture(userAId, 'published', 'Titulo antes da corrida');
      const titleBefore = (await readRow(raceId)).title;

      let signalLocked: () => void = () => {};
      const locked = new Promise<void>((r) => (signalLocked = r));
      let releaseLock: () => void = () => {};
      const release = new Promise<void>((r) => (releaseLock = r));

      // Outra operacao le `published`, trava a linha e a leva a `closed`, mas
      // ainda nao confirmou.
      const transition = prisma.$transaction(
        async (tx) => {
          await tx.listing.update({
            where: { id: raceId },
            data: { status: 'closed', closedAt: new Date() },
          });
          signalLocked();
          await release;
        },
        { timeout: 20_000 },
      );
      await locked;

      // A edicao comeca enquanto o anuncio ainda aparece `published` para
      // qualquer leitura fora da transicao.
      expect((await readRow(raceId)).status).toBe('published');
      const edit = updateListing(raceId, { title: 'Gravado durante a corrida' });

      // Espera a edicao ficar de fato bloqueada no lock da linha.
      const deadline = Date.now() + 10_000;
      for (;;) {
        const waiting = await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*)::bigint AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query ILIKE '%UPDATE%listings%'`;
        if (Number(waiting[0].n) > 0) break;
        if (Date.now() > deadline) throw new Error('a edicao nao chegou a esperar o lock');
        await new Promise((r) => setTimeout(r, 50));
      }

      releaseLock();
      await transition;
      const res = await edit;

      expect(res).toMatchObject({ success: false, reason: 'not_editable' });
      const row = await readRow(raceId);
      expect(row.status).toBe('closed');
      expect(row.title).toBe(titleBefore);
    });

    it('12. rascunho nao aparece na consulta publica', async () => {
      browserCookie = cookieB;
      const res = await createDraftListing({ ...draftInput, title: 'Rascunho nunca publico' });
      const draftId = res.listingId!;
      expect((await readRow(draftId)).status).toBe('draft');

      browserCookie = '';
      const feed = await getPublicFeed({ limit: 50 });
      expect(feed.listings.map((l) => l.id)).not.toContain(draftId);
      expect(await getPublicListingDetail(draftId)).toBeNull();
    });
  },
);
