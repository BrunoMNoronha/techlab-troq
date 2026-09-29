// @vitest-environment node
//
// Prova de F2-008 (#46) contra PostgreSQL REAL e descartavel e Better Auth
// REAL: reserva sob trava, sexta/setima concorrente, limite de autorizacoes,
// confirmacao idempotente, claim SKIP LOCKED, lease, fencing, recuo, queda
// parcial, upsert, remocao, reordenacao DEFERRABLE, reenvio e isolamento A/B.
//
// O R2 e substituido por um armazenamento em memoria COM ETag, para provocar
// 412/404/5xx e bloqueios em pontos exatos. A prova contra o R2 real esta em
// media-r2.integration.test.ts. So `headers()` do Next e a fronteira s3 sao
// simulados.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1 (testing.md, 2.2).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { S3ServiceException } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListingStatus } from '@/generated/prisma/client';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { getPrismaClient } from '@/persistence/prisma';

let browserCookie = '';
vi.mock('next/headers', () => ({
  headers: async () => new Headers(browserCookie ? { cookie: browserCookie } : {}),
}));
vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

// ---- R2 simulado, com semantica de ETag e If-Match -------------------------
const store = new Map<string, { data: Buffer; etag: string }>();
const hooks: { onPut?: (key: string) => Promise<void>; onGet?: () => Promise<void> } = {};
const presignCalls: string[] = [];

function s3Status(status: number, name: string) {
  return new S3ServiceException({ name, $fault: 'client', $metadata: { httpStatusCode: status } });
}
function putObject(key: string, data: Buffer) {
  store.set(key, { data, etag: `"${createHash('md5').update(data).digest('hex')}"` });
}

vi.mock('./s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./s3')>();
  return {
    ...actual,
    presignOriginalUpload: vi.fn(async (key: string, contentType: string) => {
      presignCalls.push(key);
      return {
        url: `https://r2.invalid/${key}?assinatura`,
        headers: { 'Content-Type': contentType },
      };
    }),
    headObject: vi.fn(async (key: string) => {
      const object = store.get(key);
      return object
        ? { exists: true, size: object.data.length, etag: object.etag }
        : { exists: false };
    }),
    getObjectIfMatch: vi.fn(async (key: string, etag: string) => {
      if (hooks.onGet) await hooks.onGet();
      const object = store.get(key);
      if (!object) throw s3Status(404, 'NoSuchKey');
      if (object.etag !== etag) throw s3Status(412, 'PreconditionFailed');
      return { data: object.data, contentLength: object.data.length };
    }),
    putDerivative: vi.fn(async (key: string, data: Buffer) => {
      if (hooks.onPut) await hooks.onPut(key);
      putObject(key, data);
    }),
  };
});

import { processPendingImages } from './processor';
import {
  confirmImageUpload,
  deleteListingImage,
  getOwnerListingImages,
  reorderListingImages,
  requestImageReupload,
  requestImageUpload,
} from './upload';
import { derivativeKeys, originalKey } from './keys';

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const emails = {
  a: `it-media-a-${RUN_ID}@example.test`,
  b: `it-media-b-${RUN_ID}@example.test`,
  c: `it-media-c-${RUN_ID}@example.test`,
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
  return headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

const PATH_TO: Record<ListingStatus, ListingStatus[]> = {
  draft: [],
  published: ['published'],
  paused: ['published', 'paused'],
  closed: ['closed'],
  removed: ['removed'],
};

async function listingOf(ownerId: string, status: ListingStatus = 'draft'): Promise<string> {
  const prisma = getPrismaClient();
  const { id } = await prisma.listing.create({
    data: {
      ownerId,
      title: 'Anuncio sintetico',
      description: 'Sintetico.',
      city: 'Recife',
      uf: 'PE',
    },
    select: { id: true },
  });
  for (const step of PATH_TO[status]) {
    await prisma.listing.update({ where: { id }, data: { status: step } });
  }
  return id;
}

async function setListingStatus(id: string, status: ListingStatus) {
  await getPrismaClient().listing.update({ where: { id }, data: { status } });
}

let jpeg: Buffer;

/** Reserva + "PUT" no armazenamento simulado + confirmacao. */
async function uploadConfirmed(listingId: string, data: Buffer = jpeg): Promise<string> {
  const reserved = await requestImageUpload(listingId, 'image/jpeg', Math.max(1, data.length));
  if (!reserved.success) throw new Error(`reserva falhou: ${reserved.reason}`);
  putObject(originalKey(reserved.data.imageId, 1), data);
  const confirmed = await confirmImageUpload(reserved.data.imageId);
  expect(confirmed).toMatchObject({ success: true, data: { outcome: 'queued' } });
  return reserved.data.imageId;
}

function image(id: string) {
  return getPrismaClient().listingImage.findUniqueOrThrow({ where: { id } });
}

function pendingDeletions(keys: string[]) {
  return getPrismaClient().mediaObjectDeletion.findMany({
    where: { objectKey: { in: keys }, completedAt: null },
    select: { objectKey: true, reason: true },
  });
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'pipeline de imagens: PostgreSQL real, Better Auth real, R2 simulado com ETag',
  () => {
    let userA: string;
    let userB: string;
    let userC: string;
    let cookieA: string;
    let cookieB: string;
    let cookieC: string;

    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
      userA = await createVerifiedUser(emails.a);
      userB = await createVerifiedUser(emails.b);
      userC = await createVerifiedUser(emails.c);
      cookieA = await signIn(emails.a);
      cookieB = await signIn(emails.b);
      cookieC = await signIn(emails.c);
      jpeg = await sharp({
        create: { width: 1200, height: 900, channels: 3, background: { r: 20, g: 120, b: 200 } },
      })
        .jpeg()
        .toBuffer();
    });

    beforeEach(async () => {
      browserCookie = cookieA;
      hooks.onPut = undefined;
      hooks.onGet = undefined;
      // O limite de 30 autorizacoes/hora e real; cada teste comeca com a cota de
      // A zerada (o teste do proprio limite usa o usuario C).
      await getPrismaClient().verification.deleteMany({
        where: { identifier: `media-upload:${userA}` },
      });
    });

    afterAll(async () => {
      const prisma = getPrismaClient();
      const all = Object.values(emails);
      const listings = await prisma.listing.findMany({
        where: { owner: { email: { in: all } } },
        select: { id: true },
      });
      const imageIds = (
        await prisma.listingImage.findMany({
          where: { listingId: { in: listings.map((l) => l.id) } },
          select: { id: true },
        })
      ).map((i) => i.id);
      await prisma.listingImage.deleteMany({ where: { id: { in: imageIds } } });
      await prisma.mediaObjectDeletion.deleteMany({
        where: {
          OR: [...imageIds, ...deletedImageIds].map((id) => ({ objectKey: { contains: id } })),
        },
      });
      await prisma.listing.deleteMany({ where: { id: { in: listings.map((l) => l.id) } } });
      await prisma.termsAcceptance.deleteMany({ where: { user: { email: { in: all } } } });
      const users = await prisma.user.findMany({
        where: { email: { in: all } },
        select: { id: true },
      });
      await prisma.verification.deleteMany({
        where: {
          identifier: {
            in: users.flatMap((u) => [`email-verification:${u.id}`, `media-upload:${u.id}`]),
          },
        },
      });
      await prisma.user.deleteMany({ where: { email: { in: all } } });
      await prisma.$disconnect();
      vi.unstubAllEnvs();
    });

    const deletedImageIds: string[] = [];

    describe('reserva', () => {
      it('reserva no rascunho proprio: uploaded, geracao 1, chave do servidor, relogio do banco', async () => {
        const listing = await listingOf(userA);
        const [{ now }] = await getPrismaClient().$queryRaw<{ now: Date }[]>`SELECT now() AS "now"`;

        const res = await requestImageUpload(listing, 'image/png', 4096);

        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data).toMatchObject({ position: 1, expiresInSeconds: 900 });
        expect(res.data.uploadHeaders).toEqual({ 'Content-Type': 'image/png' });
        const row = await image(res.data.imageId);
        expect(row).toMatchObject({
          listingId: listing,
          position: 1,
          status: 'uploaded',
          uploadGeneration: 1,
          objectKey: `originals/${res.data.imageId}/1`,
          sourceConfirmedAt: null,
          attempts: 0,
        });
        expect(Math.abs(row.uploadAuthorizedAt.getTime() - now.getTime())).toBeLessThan(5_000);
      });

      it('anuncio alheio, inexistente e malformado: mesma resposta, nada criado', async () => {
        const listingB = await listingOf(userB);
        const before = await getPrismaClient().listingImage.count({
          where: { listingId: listingB },
        });

        const foreign = await requestImageUpload(listingB, 'image/jpeg', 4096);
        const missing = await requestImageUpload(randomUUID(), 'image/jpeg', 4096);
        const malformed = await requestImageUpload('nao-uuid', 'image/jpeg', 4096);

        expect(foreign).toEqual({ success: false, reason: 'not_found', error: expect.any(String) });
        expect(missing).toEqual(foreign);
        expect(malformed).toEqual(foreign);
        expect(JSON.stringify(foreign)).not.toMatch(/permiss/i);
        expect(await getPrismaClient().listingImage.count({ where: { listingId: listingB } })).toBe(
          before,
        );
      });

      it.each(['closed', 'removed'] as const)('anuncio %s nao recebe imagem', async (status) => {
        const listing = await listingOf(userA, status);
        expect(await requestImageUpload(listing, 'image/jpeg', 4096)).toMatchObject({
          reason: 'not_editable',
        });
      });

      it('sexta e setima concorrentes: exatamente uma vence, nunca 7 imagens, posicoes unicas, sem URL orfa', async () => {
        const listing = await listingOf(userA);
        for (let i = 0; i < 5; i++) {
          expect((await requestImageUpload(listing, 'image/jpeg', 4096)).success).toBe(true);
        }
        const presignedBefore = presignCalls.length;
        const prisma = getPrismaClient();

        // Barreira que NAO e a trava sob teste: bloqueia INSERT em
        // listing_images (SELECT continua livre) ate as 8 reservas estarem de
        // fato esperando no banco. Sem a serializacao do codigo, as 8 leriam
        // 5 posicoes e disputariam a 6a no COMMIT.
        let releaseGate!: () => void;
        const gate = new Promise<void>((r) => (releaseGate = r));
        let gateHeld!: () => void;
        const held = new Promise<void>((r) => (gateHeld = r));
        const gateTx = prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`LOCK TABLE "listing_images" IN SHARE ROW EXCLUSIVE MODE`;
            gateHeld();
            await gate;
          },
          { timeout: 60_000 },
        );
        await held;

        const pending = Promise.all(
          Array.from({ length: 8 }, () => requestImageUpload(listing, 'image/jpeg', 4096)),
        );
        await vi.waitFor(
          async () => {
            const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
              SELECT count(*)::int AS "waiting" FROM pg_stat_activity
              WHERE "datname" = current_database() AND "wait_event_type" = 'Lock'`;
            expect(waiting).toBe(8);
          },
          { timeout: 20_000, interval: 50 },
        );
        releaseGate();
        await gateTx;
        const results = await pending;

        const winners = results.filter((r) => r.success);
        const losers = results.filter((r) => !r.success);
        expect(winners).toHaveLength(1);
        expect(losers).toHaveLength(7);
        for (const loser of losers) expect(loser).toMatchObject({ reason: 'limit_reached' });
        expect(presignCalls.length - presignedBefore).toBe(1);

        const rows = await getPrismaClient().listingImage.findMany({
          where: { listingId: listing },
          select: { position: true },
        });
        expect(rows).toHaveLength(6);
        expect(rows.map((r) => r.position).sort()).toEqual([1, 2, 3, 4, 5, 6]);
      });

      it('limite de 30 autorizacoes por hora, seguro sob concorrencia', async () => {
        browserCookie = cookieC;
        const listings = await Promise.all(Array.from({ length: 6 }, () => listingOf(userC)));

        // 36 posicoes livres; 35 pedidos simultaneos; so 30 podem ser autorizados.
        const results = await Promise.all(
          Array.from({ length: 35 }, (_, i) =>
            requestImageUpload(listings[i % 6], 'image/jpeg', 4096),
          ),
        );

        expect(results.filter((r) => r.success)).toHaveLength(30);
        expect(results.filter((r) => !r.success && r.reason === 'rate_limited')).toHaveLength(5);
        const [{ active }] = await getPrismaClient().$queryRaw<{ active: number }[]>`
          SELECT count(*)::int AS "active" FROM "verifications"
          WHERE "identifier" = ${`media-upload:${userC}`} AND "expires_at" > now()`;
        expect(active).toBe(30);
      });
    });

    describe('confirmacao', () => {
      it('sem objeto no R2 nao muda nada; com objeto grava ETag do servidor; repetir e idempotente', async () => {
        const listing = await listingOf(userA);
        const reserved = await requestImageUpload(listing, 'image/jpeg', 4096);
        if (!reserved.success) throw new Error('reserva');
        const id = reserved.data.imageId;

        expect(await confirmImageUpload(id)).toMatchObject({ reason: 'upload_not_found' });
        expect(await image(id)).toMatchObject({ status: 'uploaded', sourceConfirmedAt: null });

        putObject(originalKey(id, 1), jpeg);
        const concurrent = await Promise.all(
          Array.from({ length: 5 }, () => confirmImageUpload(id)),
        );
        const outcomes = concurrent.map((r) => (r.success ? r.data.outcome : r.reason));
        expect(outcomes.filter((o) => o === 'queued')).toHaveLength(1);
        expect(outcomes.filter((o) => o === 'already_confirmed')).toHaveLength(4);

        const row = await image(id);
        expect(row.sourceEtag).toBe(store.get(originalKey(id, 1))!.etag);
        expect(row.sourceConfirmedAt).not.toBeNull();
        expect(await confirmImageUpload(id)).toMatchObject({
          data: { outcome: 'already_confirmed' },
        });
      });

      it.each([
        ['vazio', Buffer.alloc(0), 'empty'],
        ['acima de 10 MB', Buffer.alloc(10 * 1024 * 1024 + 1, 7), 'too_large_bytes'],
      ])(
        'objeto %s: failed na confirmacao, sem processar, original na fila',
        async (_l, data, code) => {
          const listing = await listingOf(userA);
          const reserved = await requestImageUpload(listing, 'image/jpeg', 4096);
          if (!reserved.success) throw new Error('reserva');
          const id = reserved.data.imageId;
          putObject(originalKey(id, 1), data);

          expect(await confirmImageUpload(id)).toMatchObject({ data: { outcome: 'rejected' } });

          expect(await image(id)).toMatchObject({
            status: 'failed',
            failureCode: code,
            sourceConfirmedAt: null,
          });
          expect(await pendingDeletions([originalKey(id, 1)])).toEqual([
            { objectKey: originalKey(id, 1), reason: 'source_failed' },
          ]);
          expect((await processPendingImages({ imageId: id })).claimed).toBe(0);
        },
      );

      it('imagem alheia: confirmar, remover e reenviar respondem como inexistente', async () => {
        browserCookie = cookieB;
        const listingB = await listingOf(userB);
        const idB = await uploadConfirmed(listingB);
        browserCookie = cookieA;
        const before = await image(idB);

        for (const res of [
          await confirmImageUpload(idB),
          await deleteListingImage(idB),
          await requestImageReupload(idB, 'image/jpeg', 4096),
          await reorderListingImages(listingB, [idB]),
          await getOwnerListingImages(listingB),
        ]) {
          expect(res).toMatchObject({ success: false, reason: 'not_found' });
        }
        expect(await confirmImageUpload(randomUUID())).toMatchObject({ reason: 'not_found' });
        expect(await image(idB)).toEqual(before);
      });
    });

    describe('processamento', () => {
      it('caminho rapido: ready so com tres derivados persistidos; original na fila', async () => {
        const listing = await listingOf(userA);
        const id = await uploadConfirmed(listing);

        expect(await processPendingImages({ imageId: id })).toMatchObject({ claimed: 1, ready: 1 });

        const row = await image(id);
        expect(row).toMatchObject({
          status: 'ready',
          width: 1200,
          height: 900,
          attempts: 1,
          leaseExpiresAt: null,
          failureCode: null,
        });
        const derivatives = await getPrismaClient().imageDerivative.findMany({
          where: { imageId: id },
          orderBy: { width: 'asc' },
        });
        expect(derivatives.map((d) => [d.kind, d.objectKey, d.width, d.height])).toEqual([
          ['thumb', derivativeKeys(id, 1)[0], 320, 240],
          ['medium', derivativeKeys(id, 1)[1], 768, 576],
          ['large', derivativeKeys(id, 1)[2], 1200, 900],
        ]);
        for (const key of derivativeKeys(id, 1)) expect(store.has(key)).toBe(true);
        expect(await pendingDeletions([originalKey(id, 1)])).toEqual([
          { objectKey: originalKey(id, 1), reason: 'source_processed' },
        ]);
      });

      it('se after() nao rodar, a recuperacao periodica reclama a mesma imagem', async () => {
        const listing = await listingOf(userA);
        const id = await uploadConfirmed(listing); // nenhum caminho rapido chamado

        const summary = await processPendingImages();

        expect(summary.ready).toBeGreaterThanOrEqual(1);
        expect(await image(id)).toMatchObject({ status: 'ready' });
      });

      it('repetir o processamento e seguro: nada novo e reclamado, derivados nao duplicam', async () => {
        const listing = await listingOf(userA);
        const id = await uploadConfirmed(listing);
        await processPendingImages({ imageId: id });

        expect((await processPendingImages({ imageId: id })).claimed).toBe(0);
        expect(await getPrismaClient().imageDerivative.count({ where: { imageId: id } })).toBe(3);
      });

      it('claim concorrente: tres executores, tres imagens, cada uma reclamada uma vez', async () => {
        const listing = await listingOf(userA);
        const ids = [
          await uploadConfirmed(listing),
          await uploadConfirmed(listing),
          await uploadConfirmed(listing),
        ];

        await Promise.all(ids.map(() => processPendingImages({ maxImages: 1 })));

        for (const id of ids)
          expect(await image(id)).toMatchObject({ status: 'ready', attempts: 1 });
      });

      it('objeto substituido depois da confirmacao: 412, falha fechada, bytes novos nunca processados', async () => {
        const listing = await listingOf(userA);
        const id = await uploadConfirmed(listing);
        const other = await sharp({
          create: { width: 900, height: 900, channels: 3, background: 'red' },
        })
          .png()
          .toBuffer();
        putObject(originalKey(id, 1), other); // mesma chave, outro conteudo

        expect(await processPendingImages({ imageId: id })).toMatchObject({ failed: 1 });

        expect(await image(id)).toMatchObject({ status: 'failed', failureCode: 'source_replaced' });
        expect(await getPrismaClient().imageDerivative.count({ where: { imageId: id } })).toBe(0);
        for (const key of derivativeKeys(id, 1)) expect(store.has(key)).toBe(false);
        const pending = await pendingDeletions([originalKey(id, 1), ...derivativeKeys(id, 1)]);
        expect(pending).toHaveLength(4);
      });

      it('falha permanente de conteudo: failed com codigo, sem retentativa', async () => {
        const listing = await listingOf(userA);
        const id = await uploadConfirmed(listing, Buffer.from('nao e imagem'.repeat(40)));

        await processPendingImages({ imageId: id });

        expect(await image(id)).toMatchObject({
          status: 'failed',
          failureCode: 'unsupported_format',
          attempts: 1,
        });
        expect((await processPendingImages({ imageId: id })).claimed).toBe(0);
      });

      it('falha transitoria: recuo 1/5/15/60 min e failed na 5a tentativa', async () => {
        const listing = await listingOf(userA);
        const id = await uploadConfirmed(listing);
        hooks.onGet = async () => {
          throw s3Status(503, 'ServiceUnavailable');
        };
        const prisma = getPrismaClient();

        for (const [attempt, minutes] of [
          [1, 1],
          [2, 5],
          [3, 15],
          [4, 60],
        ] as const) {
          expect(await processPendingImages({ imageId: id })).toMatchObject({ retried: 1 });
          const row = await image(id);
          expect(row).toMatchObject({
            status: 'uploaded',
            attempts: attempt,
            failureCode: 'r2_unavailable',
          });
          const [{ delta }] = await prisma.$queryRaw<{ delta: number }[]>`
            SELECT extract(epoch FROM ("next_attempt_at" - now()))::float AS "delta"
            FROM "listing_images" WHERE "id" = ${id}::uuid`;
          expect(delta).toBeGreaterThan(minutes * 60 - 10);
          expect(delta).toBeLessThanOrEqual(minutes * 60);
          // Antes do recuo vencer, nada e reclamado.
          expect((await processPendingImages({ imageId: id })).claimed).toBe(0);
          await prisma.$executeRaw`
            UPDATE "listing_images" SET "next_attempt_at" = now() - interval '1 second'
            WHERE "id" = ${id}::uuid`;
        }

        expect(await processPendingImages({ imageId: id })).toMatchObject({ failed: 1 });
        expect(await image(id)).toMatchObject({
          status: 'failed',
          failureCode: 'transient_exhausted',
          attempts: 5,
        });
      });

      it.each([
        ['depois do primeiro derivado', 1],
        ['depois do segundo derivado', 2],
        ['depois dos tres objetos, antes da transacao final', 3],
      ])('queda %s: lease vence, novo executor converge sem duplicar', async (_l, written) => {
        const listing = await listingOf(userA);
        const id = await uploadConfirmed(listing);
        // Estado de uma tentativa que morreu: reclamada, lease vencido e parte
        // dos objetos ja escrita no R2.
        const partial = await sharp(jpeg).resize(320).webp().toBuffer();
        for (const key of derivativeKeys(id, 1).slice(0, written)) putObject(key, partial);
        await getPrismaClient().$executeRaw`
          UPDATE "listing_images"
          SET "status" = 'processing', "attempts" = 1, "lease_expires_at" = now() - interval '1 second'
          WHERE "id" = ${id}::uuid`;

        expect(await processPendingImages()).toMatchObject({ ready: expect.any(Number) });

        const row = await image(id);
        expect(row).toMatchObject({ status: 'ready', attempts: 2 });
        expect(await getPrismaClient().imageDerivative.count({ where: { imageId: id } })).toBe(3);
        // Objetos sobrescritos com o resultado real (large de 1200 px).
        const large = await sharp(store.get(derivativeKeys(id, 1)[2])!.data).metadata();
        expect(large.width).toBe(1200);
      });

      it('lease vivo nao e reclamado; vencido na 5a tentativa vira failed', async () => {
        const listing = await listingOf(userA);
        const id = await uploadConfirmed(listing);
        const prisma = getPrismaClient();
        await prisma.$executeRaw`
          UPDATE "listing_images" SET "status" = 'processing', "attempts" = 1,
            "lease_expires_at" = now() + interval '300 seconds' WHERE "id" = ${id}::uuid`;
        expect((await processPendingImages({ imageId: id })).claimed).toBe(0);

        await prisma.$executeRaw`
          UPDATE "listing_images" SET "attempts" = 5, "lease_expires_at" = now() - interval '1 second'
          WHERE "id" = ${id}::uuid`;
        expect((await processPendingImages()).exhausted).toBeGreaterThanOrEqual(1);
        expect(await image(id)).toMatchObject({
          status: 'failed',
          failureCode: 'transient_exhausted',
        });
      });

      it('fencing: executor antigo que termina depois de outro reclamar nao grava ready nem duplica', async () => {
        const listing = await listingOf(userA);
        const id = await uploadConfirmed(listing);
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        let blocked = false;
        hooks.onPut = async () => {
          if (!blocked) {
            blocked = true;
            await gate;
          }
        };

        const old = processPendingImages({ imageId: id }); // tentativa 1, presa no 1o PUT
        await vi.waitFor(() => expect(blocked).toBe(true));
        await getPrismaClient().$executeRaw`
          UPDATE "listing_images" SET "lease_expires_at" = now() - interval '1 second'
          WHERE "id" = ${id}::uuid`;
        const fresh = await processPendingImages({ imageId: id }); // tentativa 2
        release();
        const stale = await old;

        expect(fresh).toMatchObject({ ready: 1 });
        expect(stale).toMatchObject({ fenced: 1, ready: 0 });
        expect(await image(id)).toMatchObject({ status: 'ready', attempts: 2 });
        expect(await getPrismaClient().imageDerivative.count({ where: { imageId: id } })).toBe(3);
        // Chaves ainda referenciadas pelos derivados vivos nao vao para a fila.
        expect(await pendingDeletions(derivativeKeys(id, 1))).toEqual([]);
      });

      it('remocao durante o processamento: nada vira ready e os derivados escritos vao para a fila', async () => {
        const listing = await listingOf(userA);
        const id = await uploadConfirmed(listing);
        deletedImageIds.push(id);
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        let blocked = false;
        hooks.onPut = async (key) => {
          if (!blocked && key.endsWith('large.webp')) {
            blocked = true;
            await gate;
          }
        };

        const running = processPendingImages({ imageId: id });
        await vi.waitFor(() => expect(blocked).toBe(true));
        expect(await deleteListingImage(id)).toEqual({ success: true });
        release();

        expect(await running).toMatchObject({ fenced: 1 });
        expect(await getPrismaClient().listingImage.findUnique({ where: { id } })).toBeNull();
        const pending = await pendingDeletions([originalKey(id, 1), ...derivativeKeys(id, 1)]);
        expect(pending.map((p) => p.objectKey).sort()).toEqual(
          [originalKey(id, 1), ...derivativeKeys(id, 1)].sort(),
        );
      });
    });

    describe('gestao', () => {
      it('anuncio publicado nunca fica sem imagem ready', async () => {
        const listing = await listingOf(userA);
        const first = await uploadConfirmed(listing);
        await processPendingImages({ imageId: first });
        await setListingStatus(listing, 'published');

        expect(await deleteListingImage(first)).toMatchObject({ reason: 'last_ready_image' });

        const second = await uploadConfirmed(listing);
        await processPendingImages({ imageId: second });
        expect(await deleteListingImage(first)).toEqual({ success: true });
        deletedImageIds.push(first);
        expect(await deleteListingImage(second)).toMatchObject({ reason: 'last_ready_image' });
        expect(await image(second)).toMatchObject({ position: 1 });
      });

      it('remover compacta posicoes e enfileira os objetos; nao apaga objeto direto', async () => {
        const listing = await listingOf(userA);
        const ids = [
          await uploadConfirmed(listing),
          await uploadConfirmed(listing),
          await uploadConfirmed(listing),
        ];
        await processPendingImages({ imageId: ids[0] });

        expect(await deleteListingImage(ids[0])).toEqual({ success: true });
        deletedImageIds.push(ids[0]);

        expect((await image(ids[1])).position).toBe(1);
        expect((await image(ids[2])).position).toBe(2);
        for (const key of derivativeKeys(ids[0], 1)) expect(store.has(key)).toBe(true);
        const pending = await pendingDeletions([
          originalKey(ids[0], 1),
          ...derivativeKeys(ids[0], 1),
        ]);
        expect(
          pending.every((p) => p.reason === 'image_removed' || p.reason === 'source_processed'),
        ).toBe(true);
        expect(pending).toHaveLength(4);
      });

      it('reordenar seis imagens em rotacao completa usa a unicidade DEFERRABLE', async () => {
        const listing = await listingOf(userA);
        const ids: string[] = [];
        for (let i = 0; i < 6; i++) {
          const r = await requestImageUpload(listing, 'image/jpeg', 4096);
          if (!r.success) throw new Error('reserva');
          ids.push(r.data.imageId);
        }
        const rotated = [...ids.slice(1), ids[0]];

        expect(await reorderListingImages(listing, rotated)).toEqual({ success: true });

        for (const [index, id] of rotated.entries())
          expect((await image(id)).position).toBe(index + 1);
        expect(await reorderListingImages(listing, rotated.slice(1))).toMatchObject({
          reason: 'invalid_order',
        });
        expect(
          await reorderListingImages(listing, [...rotated.slice(1), randomUUID()]),
        ).toMatchObject({
          reason: 'invalid_order',
        });
      });

      it('reordenacoes concorrentes nunca corrompem a ordem', async () => {
        const listing = await listingOf(userA);
        const ids: string[] = [];
        for (let i = 0; i < 4; i++) {
          const r = await requestImageUpload(listing, 'image/jpeg', 4096);
          if (!r.success) throw new Error('reserva');
          ids.push(r.data.imageId);
        }
        const orders = [ids, [...ids].reverse(), [ids[2], ids[0], ids[3], ids[1]]];

        const results = await Promise.all(
          orders.map((order) => reorderListingImages(listing, order)),
        );

        expect(results.every((r) => r.success)).toBe(true);
        const final = await getPrismaClient().listingImage.findMany({
          where: { listingId: listing },
          orderBy: { position: 'asc' },
          select: { id: true, position: true },
        });
        expect(final.map((r) => r.position)).toEqual([1, 2, 3, 4]);
        expect(orders.map((o) => o.join())).toContain(final.map((r) => r.id).join());
      });

      it('reenvio de failed: mesmo id e posicao, geracao nova; limpeza da antiga nao alcanca a nova', async () => {
        const listing = await listingOf(userA);
        const id = await uploadConfirmed(listing, Buffer.from('nao e imagem'.repeat(40)));
        await processPendingImages({ imageId: id });
        const failed = await image(id);
        expect(failed.status).toBe('failed');

        const res = await requestImageReupload(id, 'image/webp', 4096);

        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data).toMatchObject({ imageId: id, position: failed.position });
        expect(await image(id)).toMatchObject({
          status: 'uploaded',
          uploadGeneration: 2,
          objectKey: originalKey(id, 2),
          attempts: 0,
          sourceConfirmedAt: null,
          sourceEtag: null,
          failureCode: null,
        });
        const oldKeys = [originalKey(id, 1), ...derivativeKeys(id, 1)];
        const newKeys = [originalKey(id, 2), ...derivativeKeys(id, 2)];
        expect((await pendingDeletions(oldKeys)).length).toBe(4);
        expect(await pendingDeletions(newKeys)).toEqual([]);

        putObject(originalKey(id, 2), jpeg);
        expect(await confirmImageUpload(id)).toMatchObject({ data: { outcome: 'queued' } });
        await processPendingImages({ imageId: id });
        expect(await image(id)).toMatchObject({ status: 'ready', uploadGeneration: 2 });
        const derivatives = await getPrismaClient().imageDerivative.findMany({
          where: { imageId: id },
        });
        expect(derivatives.map((d) => d.objectKey).sort()).toEqual(derivativeKeys(id, 2).sort());

        expect(await requestImageReupload(id, 'image/jpeg', 4096)).toMatchObject({
          reason: 'invalid_state',
        });
      });

      it('estado para a interface nao expoe chave, ETag nem URL', async () => {
        const listing = await listingOf(userA);
        const reserved = await requestImageUpload(listing, 'image/jpeg', 4096);
        const ready = await uploadConfirmed(listing);
        await processPendingImages({ imageId: ready });

        const view = await getOwnerListingImages(listing);

        expect(view.success).toBe(true);
        if (!view.success || !reserved.success) return;
        expect(view.data.images.map((i) => [i.id, i.state])).toEqual([
          [reserved.data.imageId, 'awaiting_upload'],
          [ready, 'ready'],
        ]);
        expect(JSON.stringify(view)).not.toMatch(/originals\/|derivatives\/|etag|https?:/i);
      });
    });
  },
);
