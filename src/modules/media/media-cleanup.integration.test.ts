// @vitest-environment node
//
// Prova de F2-009 (#47) contra PostgreSQL REAL e descartavel: limpeza de
// reservas abandonadas (1 h), teto absoluto (20 h), fila de exclusao (prazo,
// idempotencia, recuo, falha parcial, queda entre o R2 e o banco, concorrencia
// com SKIP LOCKED + lease), barreira contra apagar chave viva, retencao por
// estado do anuncio e expurgo por exclusao de conta.
//
// O R2 e um armazenamento em memoria com ganchos, para provocar falhas em
// pontos exatos; a prova contra o R2 real esta em
// media-delivery-r2.integration.test.ts. Os prazos sao controlados pelo proprio
// banco (instantes gravados no passado), sem esperar tempo real.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1 (testing.md, 2.2).
import { randomUUID } from 'node:crypto';
import { S3ServiceException } from '@aws-sdk/client-s3';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListingStatus } from '@/generated/prisma/client';
import { getPrismaClient } from '@/persistence/prisma';

// ---- R2 simulado --------------------------------------------------------------
const store = new Set<string>();
const deleteCalls: string[] = [];
const hooks: {
  onDelete?: (key: string) => Promise<void>;
  onGet?: () => Promise<void>;
} = {};

vi.mock('./s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./s3')>();
  return {
    ...actual,
    deleteObject: vi.fn(async (key: string) => {
      deleteCalls.push(key);
      if (hooks.onDelete) await hooks.onDelete(key);
      store.delete(key);
    }),
    getObjectIfMatch: vi.fn(async () => {
      if (hooks.onGet) await hooks.onGet();
      throw new S3ServiceException({
        name: 'SlowDown',
        $fault: 'client',
        $metadata: { httpStatusCode: 429 },
      });
    }),
  };
});

import {
  abandonStaleReservations,
  consumeDeletionQueue,
  expireStaleImages,
  runMediaCleanup,
} from './cleanup';
import { enqueueDeletions } from './deletions';
import { derivativeKey, derivativeKeys, originalKey } from './keys';
import { processPendingImages } from './processor';
import { AccountNotPendingDeletionError, enqueueAccountMediaPurge } from './retention';

function s3Error(status: number, name: string) {
  return new S3ServiceException({ name, $fault: 'server', $metadata: { httpStatusCode: status } });
}

const RUN = randomUUID().slice(0, 8);
const users: string[] = [];

async function user(): Promise<string> {
  const id = randomUUID();
  await getPrismaClient().user.create({
    data: {
      id,
      displayName: 'Sintetico',
      email: `it-cleanup-${RUN}-${id.slice(0, 6)}@example.test`,
      emailVerified: true,
    },
  });
  users.push(id);
  return id;
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
    data: { ownerId, title: 'Limpeza sintetica', description: 'x', city: 'Recife', uf: 'PE' },
    select: { id: true },
  });
  for (const step of PATH_TO[status]) {
    await prisma.listing.update({ where: { id }, data: { status: step } });
  }
  return id;
}

type Seed = 'reserved' | 'confirmed' | 'processing' | 'ready' | 'failed';

/**
 * Imagem no estado pedido, autorizada `minutesAgo` minutos atras (instante do
 * banco). `ready` ganha os tres derivados, no banco e no armazenamento.
 */
async function seedImage(
  listingId: string,
  position: number,
  state: Seed,
  minutesAgo = 0,
): Promise<string> {
  const prisma = getPrismaClient();
  const id = randomUUID();
  const status = state === 'reserved' || state === 'confirmed' ? 'uploaded' : state;
  await prisma.$executeRaw`
    INSERT INTO "listing_images" (
      "id", "listing_id", "position", "status", "object_key", "upload_generation",
      "upload_authorized_at", "source_confirmed_at", "source_etag", "processed_at",
      "width", "height", "attempts", "lease_expires_at", "failure_code", "updated_at")
    VALUES (
      ${id}::uuid, ${listingId}::uuid, ${position}, ${status}::"listing_image_status",
      ${originalKey(id, 1)}, 1,
      now() - make_interval(mins => ${minutesAgo}),
      CASE WHEN ${state} = 'reserved' THEN NULL ELSE now() END,
      CASE WHEN ${state} = 'reserved' THEN NULL ELSE '"e"' END,
      CASE WHEN ${state} = 'ready' THEN now() ELSE NULL END,
      CASE WHEN ${state} = 'ready' THEN 400 ELSE NULL END,
      CASE WHEN ${state} = 'ready' THEN 300 ELSE NULL END,
      CASE WHEN ${state} = 'processing' THEN 1 ELSE 0 END,
      CASE WHEN ${state} = 'processing' THEN now() + interval '5 minutes' ELSE NULL END,
      CASE WHEN ${state} = 'failed' THEN 'corrupt' ELSE NULL END,
      now())`;
  if (state !== 'ready') store.add(originalKey(id, 1));
  if (state === 'ready') {
    for (const kind of ['thumb', 'medium', 'large'] as const) {
      const key = derivativeKey(id, 1, kind);
      store.add(key);
      await prisma.imageDerivative.create({
        data: { imageId: id, kind, objectKey: key, width: 400, height: 300 },
      });
    }
  }
  return id;
}

function pending(keys: string[]) {
  return getPrismaClient().mediaObjectDeletion.findMany({
    where: { objectKey: { in: keys }, completedAt: null },
  });
}

async function enqueue(
  keys: string[],
  reason: 'derivative_orphan' | 'source_failed' = 'derivative_orphan',
) {
  for (const key of keys) store.add(key);
  await getPrismaClient().$transaction((tx) => enqueueDeletions(tx, keys, reason));
}

/**
 * Espera ate que pelo menos `atLeast` pendencias destas chaves tenham sido
 * reclamadas (`attempts > 0`). Estoura com erro explicito se isso nao ocorrer.
 */
async function waitUntilClaimed(keys: string[], atLeast: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [{ claimed }] = await getPrismaClient().$queryRaw<{ claimed: number }[]>`
      SELECT count(*)::int AS "claimed" FROM "media_object_deletions"
      WHERE "object_key" = ANY(${keys}) AND "attempts" > 0`;
    if (claimed >= atLeast) return;
    if (Date.now() > deadline) {
      throw new Error(`segundo consumidor nao reclamou em ${timeoutMs} ms (${claimed} reclamadas)`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Torna vencidas as pendencias destas chaves (lease/recuo "passou"). */
async function makeDue(keys: string[]) {
  await getPrismaClient().$executeRaw`
    UPDATE "media_object_deletions" SET "due_at" = now() - interval '1 second'
    WHERE "object_key" = ANY(${keys}) AND "completed_at" IS NULL`;
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'limpeza de midia e fila de exclusao: PostgreSQL real',
  () => {
    beforeEach(async () => {
      store.clear();
      deleteCalls.length = 0;
      hooks.onDelete = undefined;
      hooks.onGet = undefined;
      // Pendencias e imagens de outras suites ficam fora do alcance: banco
      // descartavel, nada e apagado — so estacionado.
      const prisma = getPrismaClient();
      await prisma.$executeRaw`
        UPDATE "media_object_deletions" SET "due_at" = 'infinity'
        WHERE "completed_at" IS NULL AND "due_at" <> 'infinity'`;
      await prisma.$executeRaw`
        UPDATE "listing_images" SET "upload_authorized_at" = now()
        WHERE "status" IN ('uploaded', 'processing')`;
    });

    afterAll(async () => {
      const prisma = getPrismaClient();
      const listings = await prisma.listing.findMany({
        where: { ownerId: { in: users } },
        select: { id: true },
      });
      const ids = listings.map((l) => l.id);
      await prisma.report.deleteMany({ where: { listingId: { in: ids } } });
      const images = await prisma.listingImage.findMany({
        where: { listingId: { in: ids } },
        select: { id: true },
      });
      await prisma.listingImage.deleteMany({ where: { listingId: { in: ids } } });
      await prisma.accountDeletionRequest.deleteMany({ where: { userId: { in: users } } });
      await prisma.listing.deleteMany({ where: { id: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      void images;
      await prisma.$disconnect();
    });

    // ------------------------------------------------------------------------
    it('reserva abandonada: 59 min nao, mais de 1 h sai da lista, compacta e enfileira', async () => {
      const owner = await user();
      const listing = await listingOf(owner);
      const first = await seedImage(listing, 1, 'confirmed', 120);
      const fresh = await seedImage(listing, 2, 'reserved', 59);
      const stale = await seedImage(listing, 3, 'reserved', 61);
      const last = await seedImage(listing, 4, 'ready', 300);

      expect(await abandonStaleReservations()).toBe(1);

      const rows = await getPrismaClient().listingImage.findMany({
        where: { listingId: listing },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      expect(rows).toEqual([
        { id: first, position: 1 },
        { id: fresh, position: 2 },
        { id: last, position: 3 },
      ]);
      const queued = await pending([originalKey(stale, 1), originalKey(fresh, 1)]);
      expect(queued.map((q) => [q.objectKey, q.reason])).toEqual([
        [originalKey(stale, 1), 'source_abandoned'],
      ]);
      // Idempotente: repetir nao remove mais nada.
      expect(await abandonStaleReservations()).toBe(0);
    });

    it('teto de 20 h: abaixo nao expira; acima vira failed/expired com original e parciais na fila', async () => {
      const owner = await user();
      const listing = await listingOf(owner);
      const young = await seedImage(listing, 1, 'confirmed', 20 * 60 - 1);
      const old = await seedImage(listing, 2, 'confirmed', 20 * 60 + 1);
      const oldProcessing = await seedImage(listing, 3, 'processing', 21 * 60);
      const oldReady = await seedImage(listing, 4, 'ready', 30 * 60);
      const oldFailed = await seedImage(listing, 5, 'failed', 30 * 60);

      expect(await expireStaleImages()).toBe(2);

      const prisma = getPrismaClient();
      const state = async (id: string) =>
        prisma.listingImage.findUniqueOrThrow({
          where: { id },
          select: { status: true, failureCode: true },
        });
      expect(await state(young)).toEqual({ status: 'uploaded', failureCode: null });
      expect(await state(old)).toEqual({ status: 'failed', failureCode: 'expired' });
      expect(await state(oldProcessing)).toEqual({ status: 'failed', failureCode: 'expired' });
      expect(await state(oldReady)).toEqual({ status: 'ready', failureCode: null });
      expect(await state(oldFailed)).toEqual({ status: 'failed', failureCode: 'corrupt' });

      for (const id of [old, oldProcessing]) {
        const queued = await pending([originalKey(id, 1), ...derivativeKeys(id, 1)]);
        expect(queued.map((q) => q.reason).sort()).toEqual([
          'derivative_orphan',
          'derivative_orphan',
          'derivative_orphan',
          'source_failed',
        ]);
      }
      expect(await pending([originalKey(young, 1), ...derivativeKeys(oldReady, 1)])).toEqual([]);
    });

    it('teto de 20 h cerca a tentativa em curso: o executor antigo nao grava `ready`', async () => {
      const owner = await user();
      const listing = await listingOf(owner);
      const image = await seedImage(listing, 1, 'confirmed', 21 * 60);
      // O executor reclama a imagem e, durante o download, a limpeza expira.
      hooks.onGet = async () => {
        expect(await expireStaleImages()).toBe(1);
      };
      const summary = await processPendingImages({ imageId: image });
      expect(summary.claimed).toBe(1);
      const row = await getPrismaClient().listingImage.findUniqueOrThrow({ where: { id: image } });
      expect(row).toMatchObject({ status: 'failed', failureCode: 'expired' });
    });

    it('fila: prazo futuro intocado, vencido apagado; objeto ausente conclui; repeticao converge', async () => {
      const id = randomUUID();
      const due = derivativeKey(id, 1, 'thumb');
      const absent = derivativeKey(id, 1, 'medium');
      const future = derivativeKey(id, 1, 'large');
      await enqueue([due, future]);
      await getPrismaClient().$transaction((tx) =>
        enqueueDeletions(tx, [absent], 'derivative_orphan'),
      );
      await getPrismaClient().$executeRaw`
        UPDATE "media_object_deletions" SET "due_at" = now() + interval '30 days' - interval '1 minute'
        WHERE "object_key" = ${future} AND "completed_at" IS NULL`;

      const run = await consumeDeletionQueue();
      expect(run).toMatchObject({ claimed: 2, completed: 2, retried: 0 });
      expect(store.has(due)).toBe(false);
      expect(store.has(future)).toBe(true);
      expect((await pending([due, absent])).length).toBe(0);
      const futureRow = (await pending([future]))[0];
      expect(futureRow.attempts).toBe(0);
      expect(futureRow.dueAt.getTime() - futureRow.createdAt.getTime()).toBeLessThanOrEqual(
        30 * 24 * 3600 * 1000,
      );

      expect(await consumeDeletionQueue()).toMatchObject({ claimed: 0 });
      expect(deleteCalls.filter((k) => k === due)).toHaveLength(1);
    });

    it('falha parcial: o primeiro item falha, o segundo conclui; a pendencia fica com codigo e recuo', async () => {
      const id = randomUUID();
      const bad = derivativeKey(id, 1, 'thumb');
      const good = derivativeKey(id, 1, 'medium');
      await enqueue([bad]);
      await enqueue([good]);
      hooks.onDelete = async (key) => {
        if (key === bad) throw s3Error(503, 'ServiceUnavailable');
      };

      const run = await consumeDeletionQueue();
      expect(run).toMatchObject({ claimed: 2, completed: 1, retried: 1 });
      expect(store.has(good)).toBe(false);
      expect(store.has(bad)).toBe(true);
      const [row] = await pending([bad]);
      expect(row).toMatchObject({
        attempts: 1,
        lastErrorCode: 'r2_unavailable',
        completedAt: null,
      });
      const waitMs = row.dueAt.getTime() - Date.now();
      expect(waitMs).toBeGreaterThan(30_000);
      expect(waitMs).toBeLessThanOrEqual(61_000);

      // Recuo ainda nao venceu: nada acontece.
      expect(await consumeDeletionQueue()).toMatchObject({ claimed: 0 });

      // Sequencia de recuo: 1, 5, 15, 60 e depois 60 min, sem desistir.
      const expected = [5, 15, 60, 60, 60];
      for (const minutes of expected) {
        await makeDue([bad]);
        await consumeDeletionQueue();
        const [again] = await pending([bad]);
        const wait = Math.round((again.dueAt.getTime() - Date.now()) / 60_000);
        expect(wait).toBe(minutes);
      }
      for (const [status, code] of [
        [429, 'r2_throttled'],
        [403, 'r2_denied'],
        [400, 'r2_rejected'],
      ] as const) {
        hooks.onDelete = async () => {
          throw s3Error(status, 'Erro');
        };
        await makeDue([bad]);
        await consumeDeletionQueue();
        expect((await pending([bad]))[0].lastErrorCode).toBe(code);
      }

      hooks.onDelete = undefined;
      await makeDue([bad]);
      expect(await consumeDeletionQueue()).toMatchObject({ completed: 1 });
      expect(store.has(bad)).toBe(false);
      expect(await pending([bad])).toEqual([]);
    });

    it('banco falha DEPOIS de o R2 apagar: nada e concluido; apos o lease a repeticao converge', async () => {
      const prisma = getPrismaClient();
      const key = derivativeKey(randomUUID(), 1, 'thumb');
      await enqueue([key]);
      // Falha real do banco na gravacao de `completed_at`, injetada entre o
      // DeleteObject e a conclusao: uma restricao temporaria recusa a coluna.
      hooks.onDelete = async () => {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "media_object_deletions" ADD CONSTRAINT "it_bloqueia_conclusao"
           CHECK ("completed_at" IS NULL) NOT VALID`,
        );
      };
      try {
        const run = await consumeDeletionQueue();
        expect(run).toMatchObject({ claimed: 1, completed: 0, errors: 1 });
      } finally {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "media_object_deletions" DROP CONSTRAINT IF EXISTS "it_bloqueia_conclusao"`,
        );
        hooks.onDelete = undefined;
      }
      expect(store.has(key)).toBe(false);
      const [row] = await pending([key]);
      expect(row.completedAt).toBeNull();
      // O lease ainda protege a pendencia (executor "morto" antes de concluir).
      expect(row.dueAt.getTime()).toBeGreaterThan(Date.now() + 300_000);
      expect(await consumeDeletionQueue()).toMatchObject({ claimed: 0 });

      // Lease vencido: a proxima execucao repete o DeleteObject (objeto ja
      // ausente) e conclui.
      await makeDue([key]);
      expect(await consumeDeletionQueue()).toMatchObject({ claimed: 1, completed: 1 });
      expect(deleteCalls.filter((k) => k === key)).toHaveLength(2);
      expect(await pending([key])).toEqual([]);
    });

    it('barreira: chave viva nunca e apagada; geracao terminal e apagada', async () => {
      const owner = await user();
      const listing = await listingOf(owner, 'published');
      const ready = await seedImage(listing, 1, 'ready');
      const processing = await seedImage(listing, 2, 'processing');
      const uploaded = await seedImage(listing, 3, 'confirmed');
      const failed = await seedImage(listing, 4, 'failed');

      const live = [
        derivativeKey(ready, 1, 'thumb'), // referenciada por ImageDerivative
        derivativeKey(processing, 1, 'large'), // geracao em processamento
        derivativeKey(uploaded, 1, 'medium'), // geracao ainda por processar
        originalKey(uploaded, 1), // original ainda nao processado
        originalKey(processing, 1),
      ];
      const dead = [
        originalKey(ready, 1), // original de imagem ja pronta
        derivativeKey(failed, 1, 'thumb'), // geracao terminal
        originalKey(failed, 1),
        derivativeKey(ready, 2, 'thumb'), // geracao que nao e a corrente
        derivativeKey(randomUUID(), 1, 'thumb'), // imagem que nao existe mais
      ];
      await enqueue([...live, ...dead]);

      const run = await consumeDeletionQueue();
      expect(run).toMatchObject({ claimed: 10, completed: 5, protected: 5 });
      for (const key of live) expect(store.has(key)).toBe(true);
      for (const key of dead) expect(store.has(key)).toBe(false);
      const protectedRows = await pending(live);
      expect(protectedRows).toHaveLength(5);
      for (const row of protectedRows) {
        expect(row.lastErrorCode).toBe('live_reference');
        const hours = (row.dueAt.getTime() - Date.now()) / 3_600_000;
        expect(hours).toBeGreaterThan(23.9);
        expect(hours).toBeLessThanOrEqual(24);
      }

      // Quando a referencia deixa de existir, a pendencia protegida converge.
      await getPrismaClient().listingImage.delete({ where: { id: ready } });
      await makeDue([derivativeKey(ready, 1, 'thumb')]);
      expect(await consumeDeletionQueue()).toMatchObject({ completed: 1 });
      expect(store.has(derivativeKey(ready, 1, 'thumb'))).toBe(false);
    });

    it('concorrencia: dois consumidores dividem a fila com SKIP LOCKED e nenhuma chave e apagada duas vezes', async () => {
      const id = randomUUID();
      const keys = Array.from({ length: 20 }, (_, i) => `derivatives/${id}/1/v1/k${i}.webp`);
      await enqueue(keys);
      // A divisao nao pode depender de o segundo consumidor reclamar antes de o
      // primeiro esvaziar a fila (~0,7 s): uma pausa do processo de teste ou uma
      // conexao nova lenta bastava para um levar as 20. O primeiro a apagar
      // segura o proprio lote (lease ja gravado) ate o banco mostrar que o outro
      // reclamou um lote diferente; so entao os dois seguem em paralelo.
      let holding = false;
      hooks.onDelete = async () => {
        if (!holding) {
          holding = true;
          await waitUntilClaimed(keys, 6);
        }
        await new Promise((r) => setTimeout(r, 20));
      };

      const [a, b] = await Promise.all([
        consumeDeletionQueue({ batchSize: 5 }),
        consumeDeletionQueue({ batchSize: 5 }),
      ]);
      expect(a.claimed + b.claimed).toBe(20);
      expect(a.claimed).toBeGreaterThan(0);
      expect(b.claimed).toBeGreaterThan(0);
      expect(a.completed + b.completed).toBe(20);
      expect(new Set(deleteCalls).size).toBe(20);
      expect(deleteCalls).toHaveLength(20);
      expect(await pending(keys)).toEqual([]);
    });

    it('concorrencia: um segundo executor iniciado DEPOIS do claim do primeiro nao repete o lote (lease)', async () => {
      const id = randomUUID();
      const keys = Array.from({ length: 6 }, (_, i) => `derivatives/${id}/1/v1/l${i}.webp`);
      await enqueue(keys);
      let second: Awaited<ReturnType<typeof consumeDeletionQueue>> | null = null;
      hooks.onDelete = async () => {
        if (!second) {
          second = { claimed: -1 } as never;
          second = await consumeDeletionQueue({ batchSize: 20 });
        }
      };
      const first = await consumeDeletionQueue({ batchSize: 20 });
      expect(first).toMatchObject({ claimed: 6, completed: 6 });
      expect(second).toMatchObject({ claimed: 0 });
      expect(deleteCalls).toHaveLength(6);
    });

    it('jobs repetidos e simultaneos da limpeza completa nao corrompem estado', async () => {
      const owner = await user();
      const listing = await listingOf(owner);
      await seedImage(listing, 1, 'ready', 5);
      const stale = await seedImage(listing, 2, 'reserved', 90);
      const old = await seedImage(listing, 3, 'confirmed', 21 * 60);

      const runs = await Promise.all([runMediaCleanup(), runMediaCleanup(), runMediaCleanup()]);
      expect(runs.reduce((n, r) => n + r.abandoned, 0)).toBe(1);
      expect(runs.reduce((n, r) => n + r.expired, 0)).toBe(1);
      const prisma = getPrismaClient();
      const rows = await prisma.listingImage.findMany({
        where: { listingId: listing },
        orderBy: { position: 'asc' },
        select: { id: true, position: true, status: true },
      });
      expect(rows.map((r) => r.position)).toEqual([1, 2]);
      expect(rows.find((r) => r.id === old)?.status).toBe('failed');
      expect(store.has(originalKey(stale, 1))).toBe(false);
      expect(store.has(originalKey(old, 1))).toBe(false);
      expect(new Set(deleteCalls).size).toBe(deleteCalls.length);
      expect(await runMediaCleanup()).toMatchObject({ abandoned: 0, expired: 0, claimed: 0 });
    });

    it('retencao: paused e closed nunca entram na fila; derivados permanecem', async () => {
      const owner = await user();
      const paused = await seedImage(await listingOf(owner, 'paused'), 1, 'ready', 48 * 60);
      const closed = await seedImage(await listingOf(owner, 'closed'), 1, 'ready', 48 * 60);
      const removed = await seedImage(await listingOf(owner, 'removed'), 1, 'ready', 48 * 60);
      const summary = await runMediaCleanup();
      expect(summary).toMatchObject({ abandoned: 0, expired: 0, claimed: 0 });
      for (const id of [paused, closed, removed]) {
        expect(await pending(derivativeKeys(id, 1))).toEqual([]);
        for (const key of derivativeKeys(id, 1)) expect(store.has(key)).toBe(true);
      }
    });

    it('exclusao de conta: expurga o elegivel, conserva removed e caso aberto, respeita 30 dias', async () => {
      const prisma = getPrismaClient();
      const owner = await user();
      const reporter = await user();
      const byStatus: Record<string, string> = {};
      for (const status of ['draft', 'published', 'paused', 'closed', 'removed'] as const) {
        byStatus[status] = await seedImage(await listingOf(owner, status), 1, 'ready');
      }
      const reportedListing = await listingOf(owner, 'published');
      const reported = await seedImage(reportedListing, 1, 'ready');
      await prisma.report.create({
        data: { listingId: reportedListing, reporterId: reporter, category: 'outro' },
      });

      // Conta ativa: recusa.
      await expect(
        prisma.$transaction((tx) => enqueueAccountMediaPurge(tx, owner)),
      ).rejects.toBeInstanceOf(AccountNotPendingDeletionError);

      const requestedAt = new Date();
      await prisma.user.update({ where: { id: owner }, data: { status: 'deletion_requested' } });
      await prisma.accountDeletionRequest.create({
        data: { userId: owner, requestedAt, immediateEffectAt: requestedAt },
      });

      const result = await prisma.$transaction((tx) => enqueueAccountMediaPurge(tx, owner));
      expect(result).toEqual({ purgedImages: 4, retainedListings: 2 });

      const eligible = ['draft', 'published', 'paused', 'closed'].map((s) => byStatus[s]);
      for (const id of eligible) {
        expect(await prisma.listingImage.findUnique({ where: { id } })).toBeNull();
        const queued = await pending([originalKey(id, 1), ...derivativeKeys(id, 1)]);
        expect(queued).toHaveLength(4);
        for (const row of queued) {
          expect(row.reason).toBe('retention_purge');
          expect(row.dueAt.getTime()).toBeLessThanOrEqual(
            requestedAt.getTime() + 30 * 24 * 3600 * 1000,
          );
        }
      }
      for (const id of [byStatus.removed, reported]) {
        expect(await prisma.listingImage.findUnique({ where: { id } })).not.toBeNull();
        expect(await pending([originalKey(id, 1), ...derivativeKeys(id, 1)])).toEqual([]);
      }

      const run = await consumeDeletionQueue();
      expect(run.completed).toBe(16);
      expect(run.protected).toBe(0);
      for (const id of eligible) {
        for (const key of derivativeKeys(id, 1)) expect(store.has(key)).toBe(false);
      }
      for (const id of [byStatus.removed, reported]) {
        for (const key of derivativeKeys(id, 1)) expect(store.has(key)).toBe(true);
      }
    });
  },
);
