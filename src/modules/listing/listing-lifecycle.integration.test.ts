// @vitest-environment node
//
// Prova de integracao de F2-010 (#48): transicoes T1 a T6 pelo dono contra o
// Better Auth REAL e PostgreSQL REAL e descartavel (listing-lifecycle.md, secao
// 4; listing-contract.md, secoes 4.3, 4.4 e 5; data-model.md, DM-11.1).
//
// Sessoes emitidas por `signInEmail`; o unico mock e `headers()` do Next.js,
// como em listing-drafts.integration.test.ts. Imagens `ready` sao fixture no
// banco (o pipeline tem prova propria em src/modules/media).
//
// Corridas: sao DETERMINISTICAS. Uma transacao "concorrente" segura a trava do
// anuncio, a acao do dono e disparada e precisa ficar bloqueada; so depois do
// COMMIT da concorrente ela prossegue e le o estado ja atualizado. Sem a trava
// dentro da transacao (mutacao), a acao nao bloqueia e o teste falha.
//
// Rollback: uma restricao CHECK ... NOT VALID temporaria em `audit_events` faz
// a gravacao da auditoria falhar de verdade no banco.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1 (docs/engineering/
// testing.md, secao 2.2). Dados sinteticos, removidos ao final.
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrismaClient } from '@/persistence/prisma';
import type { ListingStatus, Prisma } from '@/generated/prisma/client';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { deleteListingImage } from '@/modules/media/upload';
import {
  createDraftListing,
  discardDraft,
  pauseListing,
  publishListing,
  reactivateListing,
  updateListing,
} from './actions';
import { LISTING_COMPLIANCE_TERMS_VERSION } from './compliance';
import { closeOwnedListing, transitionListing } from './lifecycle';

// T5/T6 exigem o efeito sobre as solicitacoes (DM-6.10). Esta suite prova o
// anuncio; o efeito real e a action composta (src/app/anuncios/actions.ts)
// sao provados em src/modules/request/reservation.integration.test.ts.
const closeListing = (id: string) => closeOwnedListing(id, async () => undefined);

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
const emails = {
  a: `it-lifecycle-a-${RUN_ID}@example.test`,
  b: `it-lifecycle-b-${RUN_ID}@example.test`,
  unverified: `it-lifecycle-u-${RUN_ID}@example.test`,
  blocked: `it-lifecycle-x-${RUN_ID}@example.test`,
};

const prisma = () => getPrismaClient();

/** Imagens criadas por esta suite: so as pendencias de exclusao delas sao limpas. */
const createdImageIds: string[] = [];

async function createUser(email: string): Promise<string> {
  const res = await registerUser({
    displayName: 'Usuario Sintetico',
    email,
    password: PASSWORD,
    over18: true,
    termsAccepted: true,
  });
  expect(res.success).toBe(true);
  const { id } = await prisma().user.findFirstOrThrow({ where: { email } });
  await prisma().user.update({
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

/**
 * Rascunho criado pela action real, como o dono logado, com as tres
 * alternativas de troca exigidas para publicar (#76).
 */
async function draft(
  title = 'Bicicleta sintetica',
  tradeOptions = ['Um notebook', 'Um videogame', 'Uma camera'],
): Promise<string> {
  const res = await createDraftListing({
    title,
    description: 'Anuncio sintetico de integracao.',
    city: 'Recife',
    state: 'PE',
    tradeOptions,
    category: 'esportes',
  });
  expect(res.success).toBe(true);
  return res.listingId!;
}

/** Fixture de imagem num estado tecnico; `ready` satisfaz o CHECK de consistencia. */
async function image(
  listingId: string,
  status: 'ready' | 'uploaded' | 'failed' = 'ready',
): Promise<string> {
  const id = randomUUID();
  createdImageIds.push(id);
  const [{ next }] = await prisma().$queryRaw<{ next: number }[]>`
    SELECT coalesce(max("position"), 0)::int + 1 AS "next" FROM "listing_images"
    WHERE "listing_id" = ${listingId}::uuid`;
  const ready = status === 'ready';
  await prisma().$executeRaw`
    INSERT INTO "listing_images"
      ("id", "listing_id", "position", "status", "object_key", "upload_generation",
       "source_confirmed_at", "processed_at", "failure_code", "width", "height",
       "created_at", "updated_at")
    VALUES (${id}::uuid, ${listingId}::uuid, ${next}, ${status}::"listing_image_status",
            ${`originals/${id}/1`}, 1,
            ${ready ? new Date() : null}, ${ready ? new Date() : null},
            ${status === 'failed' ? 'corrupt' : null}, ${ready ? 800 : null}, ${ready ? 600 : null},
            now(), now())`;
  return id;
}

function row(id: string) {
  return prisma().listing.findUniqueOrThrow({ where: { id } });
}

function transitions(listingId: string) {
  return prisma().listingTransition.findMany({
    where: { listingId },
    orderBy: { occurredAt: 'asc' },
    select: { fromStatus: true, toStatus: true, actorId: true },
  });
}

async function counts(listingId: string) {
  const [t, acc, aud] = await Promise.all([
    prisma().listingTransition.count({ where: { listingId } }),
    prisma().termsAcceptance.count({ where: { listingId, type: 'listing_compliance' } }),
    prisma().auditEvent.count({ where: { targetType: 'listing', targetId: listingId } }),
  ]);
  return { transitions: t, acceptances: acc, audits: aud };
}

/** Fixture de estado pelo caminho legal (o gatilho do banco recusa pares fora de T1..T9). */
async function fixtureStatus(listingId: string, path: ListingStatus[]): Promise<void> {
  for (const status of path) {
    await prisma().listing.update({ where: { id: listingId }, data: { status } });
  }
}

/**
 * Segura a trava do anuncio numa transacao concorrente, executa `inside`
 * nela, dispara `action` e confere que ela fica bloqueada ate o COMMIT.
 */
async function raceAgainstLock<T>(
  listingId: string,
  inside: (tx: Prisma.TransactionClient) => Promise<void>,
  action: () => Promise<T>,
): Promise<{ result: T; blocked: boolean }> {
  let pending!: Promise<T>;
  let settledEarly = false;
  await prisma().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${listingId}::uuid FOR UPDATE`;
      await inside(tx);
      pending = action();
      void pending.then(
        () => (settledEarly = true),
        () => (settledEarly = true),
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
    },
    { timeout: 15_000 },
  );
  const blocked = !settledEarly;
  return { result: await pending, blocked };
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'ciclo de vida pelo dono: Better Auth real contra PostgreSQL descartavel',
  () => {
    let userAId: string;
    let cookieA: string;
    let cookieB: string;
    let cookieUnverified: string;
    let cookieBlocked: string;

    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');

      userAId = await createUser(emails.a);
      await createUser(emails.b);
      const unverifiedId = await createUser(emails.unverified);
      const blockedId = await createUser(emails.blocked);
      cookieA = await signIn(emails.a);
      cookieB = await signIn(emails.b);
      // Sessoes validas emitidas antes; a conta perde a condicao depois do login.
      cookieUnverified = await signIn(emails.unverified);
      cookieBlocked = await signIn(emails.blocked);
      await prisma().user.update({
        where: { id: unverifiedId },
        data: { emailVerified: false, emailVerifiedAt: null },
      });
      await prisma().user.update({ where: { id: blockedId }, data: { status: 'blocked_admin' } });
    });

    beforeEach(() => {
      browserCookie = cookieA;
    });

    afterAll(async () => {
      const all = Object.values(emails);
      const users = await prisma().user.findMany({
        where: { email: { in: all } },
        select: { id: true },
      });
      const ids = users.map((u) => u.id);
      const listings = await prisma().listing.findMany({
        where: { ownerId: { in: ids } },
        select: { id: true },
      });
      const listingIds = listings.map((l) => l.id);
      await prisma()
        .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "it_f2010_block_audit"`;
      await prisma().auditEvent.deleteMany({ where: { actorId: { in: ids } } });
      await prisma().termsAcceptance.deleteMany({ where: { userId: { in: ids } } });
      await prisma().listingTransition.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().imageDerivative.deleteMany({
        where: { image: { listingId: { in: listingIds } } },
      });
      await prisma().listingImage.deleteMany({ where: { listingId: { in: listingIds } } });
      // Pendencias de outras suites ficam intocadas (testing.md, secao 2.2).
      await prisma().mediaObjectDeletion.deleteMany({
        where: { OR: createdImageIds.map((id) => ({ objectKey: { contains: id } })) },
      });
      await prisma().listing.deleteMany({ where: { id: { in: listingIds } } });
      await prisma().verification.deleteMany({
        where: {
          OR: [
            { identifier: { in: ids.map((id) => `email-verification:${id}`) } },
            { identifier: { startsWith: 'login-failure:' } },
          ],
        },
      });
      await prisma().user.deleteMany({ where: { id: { in: ids } } });
      await prisma().$disconnect();
      vi.unstubAllEnvs();
    });

    describe('T1 publicar', () => {
      it('publica: estado, transicao, aceite versionado e auditoria juntos', async () => {
        const id = await draft();
        await image(id);
        const res = await publishListing(id, true);
        expect(res).toEqual({ success: true, status: 'published', changed: true });

        const listing = await row(id);
        expect(listing.status).toBe('published');
        expect(listing.publishedAt).not.toBeNull();
        expect(await transitions(id)).toEqual([
          { fromStatus: 'draft', toStatus: 'published', actorId: userAId },
        ]);
        const acceptance = await prisma().termsAcceptance.findFirstOrThrow({
          where: { listingId: id },
        });
        expect(acceptance).toMatchObject({
          userId: userAId,
          type: 'listing_compliance',
          termsVersion: LISTING_COMPLIANCE_TERMS_VERSION,
        });
        const audit = await prisma().auditEvent.findFirstOrThrow({ where: { targetId: id } });
        expect(audit).toMatchObject({
          eventType: 'listing.published',
          actorId: userAId,
          targetType: 'listing',
          result: 'success',
        });
        expect(audit.details).toMatchObject({
          transition: 'T1',
          termsAcceptanceId: acceptance.id,
          termsVersion: LISTING_COMPLIANCE_TERMS_VERSION,
        });
        // Tudo no mesmo instante de transacao.
        expect(acceptance.acceptedAt.getTime()).toBe(audit.occurredAt.getTime());
      });

      it('repeticao nao duplica aceite, transicao nem auditoria', async () => {
        const id = await draft();
        await image(id);
        await publishListing(id, true);
        const before = await counts(id);
        expect(await publishListing(id, true)).toEqual({
          success: true,
          status: 'published',
          changed: false,
        });
        expect(await counts(id)).toEqual(before);
        expect(before).toEqual({ transitions: 1, acceptances: 1, audits: 1 });
      });

      it('sem aceite, sem imagem pronta ou so com imagem nao pronta: recusa sem gravar', async () => {
        const id = await draft();
        await image(id, 'uploaded');
        await image(id, 'failed');
        expect(await publishListing(id, false)).toMatchObject({ reason: 'compliance_required' });
        expect(await publishListing(id, true)).toMatchObject({ reason: 'no_ready_image' });
        expect((await row(id)).status).toBe('draft');
        expect(await counts(id)).toEqual({ transitions: 0, acceptances: 0, audits: 0 });
      });

      it('revalida o conteudo no ato: UF gravada fora do padrao impede publicar', async () => {
        const id = await draft();
        await image(id);
        await prisma().$executeRaw`UPDATE "listings" SET "uf" = 'P1' WHERE "id" = ${id}::uuid`;
        const res = await publishListing(id, true);
        expect(res).toMatchObject({ success: false, reason: 'validation' });
        expect(res.success === false && res.fieldErrors?.state).toBeTruthy();
        expect((await row(id)).status).toBe('draft');
      });

      it('duas publicacoes simultaneas: um efeito, um aceite, uma auditoria', async () => {
        const id = await draft();
        await image(id);
        const results = await Promise.all([publishListing(id, true), publishListing(id, true)]);
        expect(results.map((r) => r.success)).toEqual([true, true]);
        expect(results.filter((r) => r.success && r.changed)).toHaveLength(1);
        expect(await counts(id)).toEqual({ transitions: 1, acceptances: 1, audits: 1 });
      });

      it('corrida: remocao da unica imagem pronta segura a trava; a publicacao espera e recusa', async () => {
        const id = await draft();
        const img = await image(id);
        const { result, blocked } = await raceAgainstLock(
          id,
          async (tx) => {
            await tx.$executeRaw`DELETE FROM "listing_images" WHERE "id" = ${img}::uuid`;
          },
          () => publishListing(id, true),
        );
        expect(blocked).toBe(true);
        expect(result).toMatchObject({ success: false, reason: 'no_ready_image' });
        expect((await row(id)).status).toBe('draft');
        expect(await counts(id)).toEqual({ transitions: 0, acceptances: 0, audits: 0 });
      });

      it('corrida: publicacao e remocao pela action real nunca deixam publicado sem imagem pronta', async () => {
        for (let round = 0; round < 8; round += 1) {
          const id = await draft(`Corrida ${round}`);
          const img = await image(id);
          const [pub, del] = await Promise.all([publishListing(id, true), deleteListingImage(img)]);
          const listing = await row(id);
          const ready = await prisma().listingImage.count({
            where: { listingId: id, status: 'ready' },
          });
          if (listing.status === 'published') {
            expect(ready).toBeGreaterThanOrEqual(1);
            expect(del).toMatchObject({ success: false, reason: 'last_ready_image' });
          } else {
            expect(pub).toMatchObject({ success: false, reason: 'no_ready_image' });
            expect(ready).toBe(0);
          }
        }
      });
    });

    describe('T2 descartar rascunho', () => {
      it('grava closed com closedAt, nunca removed, sem auditoria critica', async () => {
        const id = await draft();
        expect(await discardDraft(id)).toEqual({ success: true, status: 'closed', changed: true });
        const listing = await row(id);
        expect(listing.status).toBe('closed');
        expect(listing.closedAt).not.toBeNull();
        expect(listing.removedAt).toBeNull();
        expect(await transitions(id)).toEqual([
          { fromStatus: 'draft', toStatus: 'closed', actorId: userAId },
        ]);
        expect((await counts(id)).audits).toBe(0);
      });

      it('closed e terminal: nenhuma acao do dono sai dele', async () => {
        const id = await draft();
        await image(id);
        await discardDraft(id);
        for (const action of [
          () => publishListing(id, true),
          () => pauseListing(id),
          () => reactivateListing(id),
        ]) {
          expect(await action()).toMatchObject({
            success: false,
            reason: 'invalid_transition',
            status: 'closed',
          });
        }
        expect(await discardDraft(id)).toMatchObject({ success: true, changed: false });
        expect(await closeListing(id)).toMatchObject({ success: true, changed: false });
        expect((await counts(id)).transitions).toBe(1);
      });
    });

    describe('alternativas de troca na publicacao e na reativacao (#76)', () => {
      const tradeOptionFields = (res: Awaited<ReturnType<typeof publishListing>>) =>
        res.success ? [] : Object.keys(res.fieldErrors ?? {}).sort();

      it('rascunho incompleto nao publica; completado pela edicao, publica', async () => {
        const id = await draft('Rascunho incompleto', ['Um notebook', '', '']);
        await image(id);

        const refused = await publishListing(id, true);
        expect(refused).toMatchObject({ success: false, reason: 'validation' });
        expect(tradeOptionFields(refused)).toEqual(['tradeOption2', 'tradeOption3']);
        expect((await row(id)).status).toBe('draft');
        expect(await counts(id)).toEqual({ transitions: 0, acceptances: 0, audits: 0 });

        expect(
          await updateListing(id, { tradeOptions: ['Um notebook', 'Um videogame', 'Uma camera'] }),
        ).toEqual({ success: true, listingId: id });
        expect(await publishListing(id, true)).toEqual({
          success: true,
          status: 'published',
          changed: true,
        });
      });

      it('o banco recusa posicao, texto e duplicidade invalidos; faltando uma, a publicacao recusa', async () => {
        // Os CHECK recusam texto nao aparado, vazio ou longo e posicao fora de
        // 1..3: a posicao vazia so pode faltar, e nunca ha uma quarta.
        const id = await draft();
        await image(id);
        for (const [position, label] of [
          [2, '   '],
          [2, ' Um notebook'],
          [2, 'x'.repeat(61)],
        ] as const) {
          await expect(
            prisma()
              .$executeRaw`UPDATE "listing_trade_options" SET "label" = ${label} WHERE "listing_id" = ${id}::uuid AND "position" = ${position}`,
          ).rejects.toThrow(/listing_trade_options_label_check/);
        }
        for (const position of [0, 4]) {
          await expect(
            prisma().listingTradeOption.create({
              data: { listingId: id, position, label: 'Um tablet' },
            }),
          ).rejects.toThrow(/listing_trade_options_position_range_check/);
        }
        await expect(
          prisma().listingTradeOption.create({
            data: { listingId: id, position: 1, label: 'Um tablet' },
          }),
        ).rejects.toThrow();
        expect(await prisma().listingTradeOption.count({ where: { listingId: id } })).toBe(3);
        await prisma().listingTradeOption.deleteMany({ where: { listingId: id, position: 2 } });

        const res = await publishListing(id, true);
        expect(tradeOptionFields(res)).toEqual(['tradeOption2']);
        expect((await row(id)).status).toBe('draft');
      });

      it('corrida: edicao que esvazia uma alternativa segura a trava; a publicacao espera e recusa', async () => {
        const id = await draft();
        await image(id);
        const { result, blocked } = await raceAgainstLock(
          id,
          async (tx) => {
            await tx.listingTradeOption.deleteMany({ where: { listingId: id, position: 3 } });
          },
          () => publishListing(id, true),
        );
        expect(blocked).toBe(true);
        expect(result).toMatchObject({ success: false, reason: 'validation' });
        expect(tradeOptionFields(result)).toEqual(['tradeOption3']);
        expect((await row(id)).status).toBe('draft');
        expect(await counts(id)).toEqual({ transitions: 0, acceptances: 0, audits: 0 });
      });

      it('corrida pelas actions reais: publicar e esvaziar uma alternativa nunca deixam publico incompleto', async () => {
        for (let round = 0; round < 6; round += 1) {
          const id = await draft(`Corrida alternativas ${round}`);
          await image(id);
          const [pub, edit] = await Promise.all([
            publishListing(id, true),
            updateListing(id, { tradeOptions: ['Um notebook', '', 'Uma camera'] }),
          ]);
          const status = (await row(id)).status;
          const stored = await prisma().listingTradeOption.count({ where: { listingId: id } });
          if (status === 'published') {
            // A publicacao venceu: a edicao viu `published` sob a trava e recusou.
            expect(pub).toMatchObject({ success: true, changed: true });
            expect(edit).toMatchObject({ success: false, reason: 'validation' });
            expect(stored).toBe(3);
          } else {
            expect(edit).toMatchObject({ success: true });
            expect(pub).toMatchObject({ success: false, reason: 'validation' });
            expect(stored).toBe(2);
          }
        }
      });

      it('pausado sem as tres (anuncio anterior a #76) nao reativa e continua pausado', async () => {
        const id = await draft();
        await image(id);
        await publishListing(id, true);
        await pauseListing(id);
        // Simula o legado: as alternativas nao existiam antes da migration.
        await prisma().listingTradeOption.deleteMany({ where: { listingId: id } });

        const res = await reactivateListing(id);
        expect(res).toMatchObject({ success: false, reason: 'validation' });
        expect(tradeOptionFields(res)).toEqual(['tradeOption1', 'tradeOption2', 'tradeOption3']);
        expect((await row(id)).status).toBe('paused');
        expect((await transitions(id)).map((t) => t.toStatus)).toEqual(['published', 'paused']);

        // Completar pela edicao (exige as tres em `paused`) libera a reativacao.
        expect(
          await updateListing(id, { tradeOptions: ['Um notebook', 'Um videogame', 'Uma camera'] }),
        ).toEqual({ success: true, listingId: id });
        expect(await reactivateListing(id)).toMatchObject({ success: true, status: 'published' });
      });
    });

    describe('T3 pausar e T4 reativar', () => {
      it('pausa e reativa preservando a data da primeira publicacao', async () => {
        const id = await draft();
        await image(id);
        await publishListing(id, true);
        const publishedAt = (await row(id)).publishedAt;

        expect(await pauseListing(id)).toEqual({ success: true, status: 'paused', changed: true });
        expect((await row(id)).pausedAt).not.toBeNull();
        expect(await pauseListing(id)).toMatchObject({ success: true, changed: false });

        expect(await reactivateListing(id)).toEqual({
          success: true,
          status: 'published',
          changed: true,
        });
        expect((await row(id)).publishedAt).toEqual(publishedAt);
        expect((await transitions(id)).map((t) => `${t.fromStatus}>${t.toStatus}`)).toEqual([
          'draft>published',
          'published>paused',
          'paused>published',
        ]);
        // T3 e T4 nao vao para a trilha critica; a publicacao sim.
        expect((await counts(id)).audits).toBe(1);
        expect((await counts(id)).acceptances).toBe(1);
      });

      it('reativar sem imagem pronta e recusado (D-3)', async () => {
        const id = await draft();
        const img = await image(id);
        await publishListing(id, true);
        await pauseListing(id);
        // Pausado, o dono pode remover a ultima imagem pronta.
        expect(await deleteListingImage(img)).toEqual({ success: true });
        expect(await reactivateListing(id)).toMatchObject({ reason: 'no_ready_image' });
        expect((await row(id)).status).toBe('paused');
      });

      it('corrida: remocao segura a trava; a reativacao espera e recusa', async () => {
        const id = await draft();
        const img = await image(id);
        await publishListing(id, true);
        await pauseListing(id);
        const { result, blocked } = await raceAgainstLock(
          id,
          async (tx) => {
            await tx.$executeRaw`DELETE FROM "listing_images" WHERE "id" = ${img}::uuid`;
          },
          () => reactivateListing(id),
        );
        expect(blocked).toBe(true);
        expect(result).toMatchObject({ success: false, reason: 'no_ready_image' });
        expect((await row(id)).status).toBe('paused');
      });

      it('rascunho nao pausa; publicado nao reativa', async () => {
        const id = await draft();
        await image(id);
        expect(await pauseListing(id)).toMatchObject({ reason: 'invalid_transition' });
        expect(await reactivateListing(id)).toMatchObject({ reason: 'invalid_transition' });
      });
    });

    describe('T5/T6 encerrar', () => {
      it.each([
        ['published', 'T5', ['published']],
        ['paused', 'T6', ['published', 'paused']],
      ] as const)('encerra a partir de %s com auditoria %s', async (from, code, path) => {
        const id = await draft();
        await fixtureStatus(id, [...path]);
        expect(await closeListing(id)).toEqual({ success: true, status: 'closed', changed: true });
        const audit = await prisma().auditEvent.findFirstOrThrow({ where: { targetId: id } });
        expect(audit).toMatchObject({ eventType: 'listing.closed', actorId: userAId });
        expect(audit.details).toMatchObject({ transition: code, fromStatus: from });
        expect(await closeListing(id)).toMatchObject({ success: true, changed: false });
        expect((await counts(id)).audits).toBe(1);
      });

      it('encerramento e pausa simultaneos terminam em closed com historico coerente', async () => {
        const id = await draft();
        await fixtureStatus(id, ['published']);
        const [close, pause] = await Promise.all([closeListing(id), pauseListing(id)]);
        expect(close).toMatchObject({ success: true, status: 'closed' });
        expect((await row(id)).status).toBe('closed');
        const path = (await transitions(id)).map((t) => `${t.fromStatus}>${t.toStatus}`);
        if (pause.success) {
          expect(path).toEqual(['published>paused', 'paused>closed']);
        } else {
          expect(pause).toMatchObject({ reason: 'invalid_transition', status: 'closed' });
          expect(path).toEqual(['published>closed']);
        }
        expect((await counts(id)).audits).toBe(1);
      });

      it('sem o efeito sobre as solicitacoes, encerrar e recusado e nada muda', async () => {
        const id = await draft();
        await fixtureStatus(id, ['published']);
        const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
          expect(await transitionListing(id, 'close')).toMatchObject({
            success: false,
            reason: 'error',
          });
        } finally {
          logSpy.mockRestore();
        }
        expect((await row(id)).status).toBe('published');
        expect(await counts(id)).toEqual({ transitions: 0, acceptances: 0, audits: 0 });
      });

      it('rollback: falha real ao gravar a auditoria desfaz o encerramento inteiro', async () => {
        const id = await draft();
        await fixtureStatus(id, ['published']);
        const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await prisma().$executeRawUnsafe(
          `ALTER TABLE "audit_events" ADD CONSTRAINT "it_f2010_block_audit"
           CHECK ("event_type" <> 'listing.closed') NOT VALID`,
        );
        try {
          expect(await closeListing(id)).toMatchObject({ success: false, reason: 'error' });
          expect((await row(id)).status).toBe('published');
          expect((await row(id)).closedAt).toBeNull();
          expect(await counts(id)).toEqual({ transitions: 0, acceptances: 0, audits: 0 });
        } finally {
          await prisma()
            .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT "it_f2010_block_audit"`;
          logSpy.mockRestore();
        }
        expect(await closeListing(id)).toMatchObject({ success: true, changed: true });
      });

      it('rollback: falha real ao gravar a auditoria da publicacao nao deixa aceite orfao', async () => {
        const id = await draft();
        await image(id);
        const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await prisma().$executeRawUnsafe(
          `ALTER TABLE "audit_events" ADD CONSTRAINT "it_f2010_block_audit"
           CHECK ("event_type" <> 'listing.published') NOT VALID`,
        );
        try {
          expect(await publishListing(id, true)).toMatchObject({ reason: 'error' });
          expect((await row(id)).status).toBe('draft');
          expect(await counts(id)).toEqual({ transitions: 0, acceptances: 0, audits: 0 });
        } finally {
          await prisma()
            .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT "it_f2010_block_audit"`;
          logSpy.mockRestore();
        }
      });
    });

    describe('acesso', () => {
      it('anuncio de outro usuario: a mesma resposta de um inexistente, sem efeito', async () => {
        const id = await draft('Anuncio de A');
        await image(id);
        browserCookie = cookieB;
        const missing = await pauseListing(randomUUID());
        for (const action of [
          () => publishListing(id, true),
          () => discardDraft(id),
          () => pauseListing(id),
          () => reactivateListing(id),
          () => closeListing(id),
        ]) {
          const res = await action();
          expect(res).toEqual(missing);
          expect(JSON.stringify(res)).not.toContain('Anuncio de A');
        }
        expect(missing).toMatchObject({ reason: 'not_found', error: 'Anúncio não encontrado.' });
        expect((await row(id)).status).toBe('draft');
        expect(await counts(id)).toEqual({ transitions: 0, acceptances: 0, audits: 0 });
      });

      it('sem sessao, e-mail nao verificado ou conta bloqueada: recusado sem efeito', async () => {
        const id = await draft();
        await image(id);
        for (const cookie of ['', cookieUnverified, cookieBlocked]) {
          browserCookie = cookie;
          expect(await publishListing(id, true)).toMatchObject({
            success: false,
            reason: 'unauthenticated',
          });
        }
        expect((await row(id)).status).toBe('draft');
      });
    });

    // Conteudo gravado antes de DEC-049 (#86; listing-contract.md, 10.1 e 10.2):
    // a transicao relê o conteudo sob a trava e recusa, sem efeito parcial.
    describe('contato e endereco gravados antes da regra (#86)', () => {
      const CONTACT = 'Não inclua telefone, WhatsApp, e-mail ou endereço neste campo.';

      it('T1 recusa titulo e descricao com contato, sem transicao, aceite ou auditoria', async () => {
        const id = await draft();
        await image(id);
        await prisma().listing.update({
          where: { id },
          data: { title: 'Bike 11 98765-4321', description: 'CEP 01310-100' },
        });

        const res = await publishListing(id, true);

        expect(res).toMatchObject({ success: false, reason: 'validation', status: 'draft' });
        expect(res.success === false && res.fieldErrors).toEqual({
          title: CONTACT,
          description: CONTACT,
        });
        expect(JSON.stringify(res)).not.toMatch(/98765|01310/);
        expect((await row(id)).status).toBe('draft');
        expect(await counts(id)).toEqual({ transitions: 0, acceptances: 0, audits: 0 });

        // Corrigido pela edicao, publica.
        expect(
          await updateListing(id, { title: 'Bicicleta corrigida', description: 'Sem contato.' }),
        ).toEqual({ success: true, listingId: id });
        expect(await publishListing(id, true)).toMatchObject({ success: true, changed: true });
      });

      it('T4 recusa reativar com e-mail gravado e o anuncio segue pausado', async () => {
        const id = await draft();
        await image(id);
        expect(await publishListing(id, true)).toMatchObject({ success: true });
        expect(await pauseListing(id)).toMatchObject({ success: true });
        await prisma().listing.update({
          where: { id },
          data: { description: 'Escreva para fulano arroba exemplo ponto com' },
        });
        const before = await counts(id);

        const res = await reactivateListing(id);

        expect(res).toMatchObject({ success: false, reason: 'validation', status: 'paused' });
        expect(res.success === false && res.fieldErrors).toEqual({ description: CONTACT });
        expect((await row(id)).status).toBe('paused');
        expect(await counts(id)).toEqual(before);
      });
    });
  },
);
