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

const OPTIONS = ['Um notebook', 'Um videogame', 'Uma camera'];

/**
 * Fixture: anuncio do dono ja no estado pedido, sem passar pelas actions de #48.
 * Com `legacy`, nasce sem alternativas de troca, como os anteriores a #76.
 */
async function fixture(
  ownerId: string,
  status: ListingStatus,
  title = `Fixture ${status}`,
  legacy = false,
) {
  const prisma = getPrismaClient();
  const { id } = await prisma.listing.create({
    data: {
      ownerId,
      title,
      description: 'Fixture sintetica.',
      city: 'Recife',
      uf: 'PE',
      category: legacy ? null : 'esportes',
      ...(legacy
        ? {}
        : {
            tradeOptions: {
              create: OPTIONS.map((label, i) => ({ position: i + 1, label })),
            },
          }),
    },
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

      // Espera a edicao ficar de fato bloqueada na trava da linha (`FOR UPDATE`).
      const deadline = Date.now() + 10_000;
      for (;;) {
        const waiting = await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*)::bigint AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query ILIKE '%listings%FOR UPDATE%'`;
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

    describe('alternativas de troca (#76)', () => {
      const options = (listingId: string) =>
        getPrismaClient().listingTradeOption.findMany({
          where: { listingId },
          orderBy: { position: 'asc' },
          select: { position: true, label: true },
        });

      it('cria com tres, reabre e edita preservando conteudo e ordem', async () => {
        const res = await createDraftListing({
          ...draftInput,
          tradeOptions: [' Um notebook ', 'Um videogame', 'Uma camera'],
        });
        expect(res.success).toBe(true);
        const id = res.listingId!;

        expect((await getListingForEdit(id)).listing?.tradeOptions).toEqual([
          'Um notebook',
          'Um videogame',
          'Uma camera',
        ]);

        expect(
          await updateListing(id, { tradeOptions: ['Uma camera', 'Um notebook', 'Um tablet'] }),
        ).toEqual({ success: true, listingId: id });
        expect((await getListingForEdit(id)).listing?.tradeOptions).toEqual([
          'Uma camera',
          'Um notebook',
          'Um tablet',
        ]);
        expect(await options(id)).toEqual([
          { position: 1, label: 'Uma camera' },
          { position: 2, label: 'Um notebook' },
          { position: 3, label: 'Um tablet' },
        ]);
      });

      it('rascunho incompleto e salvo e retomado na posicao de cada campo', async () => {
        const res = await createDraftListing({
          ...draftInput,
          tradeOptions: ['', 'Um videogame', '  '],
        });
        const id = res.listingId!;
        expect((await getListingForEdit(id)).listing?.tradeOptions).toEqual([
          '',
          'Um videogame',
          '',
        ]);

        expect(
          await updateListing(id, { tradeOptions: ['Um notebook', 'Um videogame', ''] }),
        ).toEqual({ success: true, listingId: id });
        expect((await getListingForEdit(id)).listing?.tradeOptions).toEqual([
          'Um notebook',
          'Um videogame',
          '',
        ]);
      });

      it('publicado: forma, vazio e limite recusados sem nenhuma alteracao parcial', async () => {
        const id = await fixture(userAId, 'published', 'Publicado com alternativas');
        const rowBefore = await readRow(id);
        const optionsBefore = await options(id);

        for (const tradeOptions of [
          ['Um notebook', 'Um videogame'],
          ['Um notebook', 'Um videogame', 'Uma camera', 'Um tablet'],
          ['Um notebook', '   ', 'Uma camera'],
          ['Um notebook', 'Um videogame', ''],
          ['Um notebook', 'x'.repeat(61), 'Uma camera'],
        ]) {
          // Junto com um titulo valido: nem o titulo pode ser gravado.
          const res = await updateListing(id, { title: 'Titulo que nao pode ficar', tradeOptions });
          expect(res).toMatchObject({ success: false, reason: 'validation' });
        }
        expect(await readRow(id)).toEqual(rowBefore);
        expect(await options(id)).toEqual(optionsBefore);
        expect((await getPublicListingDetail(id))?.tradeOptions).toEqual(OPTIONS);
      });

      it('B nao altera as alternativas de A, nem pelo ID nem por chamada direta', async () => {
        const id = await fixture(userAId, 'published', 'Alternativas de A');
        const before = await options(id);

        browserCookie = cookieB;
        const foreign = await updateListing(id, { tradeOptions: ['x', 'y', 'z'] });
        expect(foreign).toEqual({
          success: false,
          reason: 'not_found',
          error: 'Anúncio não encontrado.',
        });
        expect(foreign).toEqual(
          await updateListing(randomUUID(), { tradeOptions: ['x', 'y', 'z'] }),
        );
        expect(await options(id)).toEqual(before);
      });

      it('legado publicado: segue publico sem alternativas; editar exige completar as tres', async () => {
        const id = await fixture(userAId, 'published', 'Publicado antes de #76', true);
        const rowBefore = await readRow(id);

        // Nao foi retirado nem recebeu alternativa ficticia.
        const publicBefore = await getPublicListingDetail(id);
        expect(publicBefore?.title).toBe('Publicado antes de #76');
        expect(publicBefore?.tradeOptions).toEqual([]);
        expect((await getListingForEdit(id)).listing?.tradeOptions).toEqual(['', '', '']);

        const titleOnly = await updateListing(id, { title: 'Titulo novo do legado' });
        expect(titleOnly).toMatchObject({ success: false, reason: 'validation' });
        expect(Object.keys(titleOnly.fieldErrors ?? {})).toEqual([
          'category',
          'tradeOption1',
          'tradeOption2',
          'tradeOption3',
        ]);
        expect(await readRow(id)).toEqual(rowBefore);

        expect(
          await updateListing(id, {
            title: 'Titulo novo do legado',
            tradeOptions: OPTIONS,
            category: 'esportes',
          }),
        ).toEqual({ success: true, listingId: id });
        const after = await getPublicListingDetail(id);
        expect(after?.title).toBe('Titulo novo do legado');
        expect(after?.tradeOptions).toEqual(OPTIONS);
        expect((await readRow(id)).status).toBe('published');
      });

      it('corrida: transicao concorrente para closed nao deixa trocar as alternativas', async () => {
        const prisma = getPrismaClient();
        const id = await fixture(userAId, 'published', 'Corrida das alternativas');
        const before = await options(id);
        let edit!: Promise<Awaited<ReturnType<typeof updateListing>>>;
        await prisma.$transaction(
          async (tx) => {
            await tx.listing.update({
              where: { id },
              data: { status: 'closed', closedAt: new Date() },
            });
            edit = updateListing(id, { tradeOptions: ['x', 'y', 'z'] });
            await new Promise((r) => setTimeout(r, 600));
          },
          { timeout: 15_000 },
        );
        expect(await edit).toMatchObject({ success: false, reason: 'not_editable' });
        expect(await options(id)).toEqual(before);
      });
    });

    // Contato e endereco no texto livre (#86, DEC-049; listing-contract.md, 10.1
    // e 10.2). O conteudo "legado" e gravado direto no banco, como fixture: a
    // aplicacao nao o aceita mais.
    describe('contato e endereco no titulo e na descricao (#86)', () => {
      const CONTACT = 'Não inclua telefone, WhatsApp, e-mail ou endereço neste campo.';

      async function withContent(
        status: ListingStatus,
        content: { title?: string; description?: string },
      ) {
        const id = await fixture(userAId, status, content.title ?? 'Legado sintetico #86');
        if (content.description) {
          await getPrismaClient().listing.update({
            where: { id },
            data: { description: content.description },
          });
        }
        return id;
      }

      it('criacao com contato e recusada nos dois campos e nada e gravado', async () => {
        const prisma = getPrismaClient();
        const before = await prisma.listing.count({ where: { ownerId: userAId } });

        const res = await createDraftListing({
          ...draftInput,
          title: 'Bike 11 98765-4321',
          description: 'Escreva para fulano@exemplo.test',
          tradeOptions: ['Um notebook', 'wa.me/5511987654321', ''],
        });

        expect(res).toMatchObject({ success: false, reason: 'validation' });
        expect(res.fieldErrors).toEqual({
          title: CONTACT,
          description: CONTACT,
          tradeOption2: CONTACT,
        });
        expect(JSON.stringify(res)).not.toMatch(/98765|fulano|wa\.me/);
        expect(await prisma.listing.count({ where: { ownerId: userAId } })).toBe(before);
      });

      it.each(['draft', 'published', 'paused'] as const)(
        'edicao de anuncio %s com endereco nao grava nada, nem o campo valido enviado junto',
        async (status) => {
          const id = await fixture(userAId, status, `Edicao com endereco ${status}`);
          const before = await readRow(id);

          const res = await updateListing(id, {
            title: 'Titulo valido e novo',
            description: 'Retirar na Rua Augusta, 500, apto 12',
          });

          expect(res).toMatchObject({ success: false, reason: 'validation' });
          expect(res.fieldErrors).toEqual({ description: CONTACT });
          expect(await readRow(id)).toEqual(before);
        },
      );

      it('chamada direta com payload arbitrario nao contorna a regra', async () => {
        const id = await fixture(userAId, 'published', 'Chamada direta #86');
        const before = await readRow(id);

        const res = await updateListing(id, {
          title: 'tel:+5511987654321',
          status: 'draft',
        } as unknown as Parameters<typeof updateListing>[1]);

        expect(res.fieldErrors).toEqual({ title: CONTACT });
        expect(await readRow(id)).toEqual(before);
      });

      it('publicado com contato gravado antes da regra: editar outro campo exige corrigir', async () => {
        const id = await withContent('published', {
          description: 'Chama no (11) 98765-4321',
        });
        const before = await readRow(id);

        const blocked = await updateListing(id, { title: 'Titulo novo sem contato' });
        expect(blocked).toMatchObject({ success: false, reason: 'validation' });
        expect(blocked.fieldErrors).toEqual({ description: CONTACT });
        expect(JSON.stringify(blocked)).not.toContain('98765');
        expect(await readRow(id)).toEqual(before);

        const fixed = await updateListing(id, {
          title: 'Titulo novo sem contato',
          description: 'Descricao corrigida, sem contato.',
        });
        expect(fixed).toEqual({ success: true, listingId: id });
        const after = await readRow(id);
        expect(after).toMatchObject({
          status: 'published',
          title: 'Titulo novo sem contato',
          description: 'Descricao corrigida, sem contato.',
        });

        browserCookie = '';
        expect((await getPublicListingDetail(id))?.description).toBe(
          'Descricao corrigida, sem contato.',
        );
      });
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
