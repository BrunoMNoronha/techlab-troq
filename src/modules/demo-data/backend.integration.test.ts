// @vitest-environment node
// PostgreSQL real e descartavel; somente S3 e headers() sao simulados.
// Bytes passam pelo processador sharp e pela entrega autorizada existente.
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrismaClient } from '@/persistence/prisma';
import { getPublicFeed, getPublicListingDetail } from '@/modules/listing';
import { consumeDeletionQueue } from '@/modules/media/cleanup';
import { serveMedia } from '@/modules/media/delivery';
import { databaseFingerprint, mediaFingerprint } from './config';
import { getDemoDataSummary, removeDemoData, seedDemoData } from './service';

const storage = new Map<string, Buffer>();
const hooks: { put?: () => Promise<void>; failDelete?: boolean } = {};
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/modules/media/s3', async (original) => ({
  ...(await original<typeof import('@/modules/media/s3')>()),
  putDerivative: vi.fn(async (key: string, data: Buffer) => {
    if (hooks.put) await hooks.put();
    storage.set(key, Buffer.from(data));
  }),
  getDerivativeStream: vi.fn(async (key: string) => {
    const data = storage.get(key);
    return data
      ? {
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(data));
              controller.close();
            },
          }),
          contentLength: data.length,
        }
      : null;
  }),
  deleteObject: vi.fn(async (key: string) => {
    if (hooks.failDelete) throw new Error('synthetic-delete-failure');
    storage.delete(key);
  }),
}));

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const prisma = () => getPrismaClient();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'dados demonstrativos: PostgreSQL efêmero e mídia real com S3 simulado',
  () => {
    let actorId: string;
    let independentId: string;
    let technicalOwnerId: string | undefined;
    const ownBatchIds = new Set<string>();

    async function track() {
      if (!actorId) return;
      const dataset = await prisma().demoDataset.findUnique({ where: { id: 'products' } });
      technicalOwnerId = dataset?.ownerId;
      for (const batch of await prisma().demoBatch.findMany({ where: { datasetId: 'products' } }))
        ownBatchIds.add(batch.id);
    }

    async function cleanFixtures() {
      if (!actorId) return;
      await track();
      await prisma()
        .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "it_demo_201_audit_failure"`;
      const batchIds = [...ownBatchIds];
      const items = await prisma().demoItem.findMany({ where: { batchId: { in: batchIds } } });
      const listingIds = items.flatMap((item) => (item.listingId ? [item.listingId] : []));
      const objects = await prisma().demoMediaObject.findMany({
        where: { batchId: { in: batchIds } },
      });
      await prisma().paymentAttempt.deleteMany({
        where: { contactRequest: { listingId: { in: listingIds } } },
      });
      await prisma().contactRequest.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().contactRequestPaidGuard.deleteMany({
        where: { listingId: { in: listingIds } },
      });
      await prisma().termsAcceptance.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().listingTransition.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().report.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().demoItem.deleteMany({ where: { batchId: { in: batchIds } } });
      await prisma().listingImage.deleteMany({
        where: { listingId: { in: [...listingIds, independentId] } },
      });
      await prisma().listing.deleteMany({ where: { id: { in: listingIds } } });
      await prisma().mediaObjectDeletion.deleteMany({
        where: { objectKey: { in: objects.map((object) => object.objectKey) } },
      });
      await prisma().demoMediaObject.deleteMany({ where: { batchId: { in: batchIds } } });
      // Limpeza so das fixtures desta suite, nunca implementacao de expurgo.
      await prisma().auditEvent.deleteMany({
        where: { targetType: 'demo_batch', targetId: { in: batchIds } },
      });
      await prisma().demoBatch.deleteMany({ where: { id: { in: batchIds } } });
      if (technicalOwnerId) {
        await prisma().demoDataset.delete({ where: { id: 'products' } });
        await prisma().user.delete({ where: { id: technicalOwnerId } });
      }
      ownBatchIds.clear();
      technicalOwnerId = undefined;
      storage.clear();
    }

    beforeAll(async () => {
      // Exige um DB exclusivo, sem lote preexistente. Nao limpa dados de outro executor.
      expect(await prisma().demoDataset.count()).toBe(0);
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('DEMO_DATA_TARGET', 'development');
      vi.stubEnv('VERCEL', '0');
      vi.stubEnv('VERCEL_ENV', undefined);
      vi.stubEnv('R2_S3_ENDPOINT', 'https://synthetic.invalid');
      vi.stubEnv('R2_BUCKET', 'demo-fixture-only');
      vi.stubEnv('R2_REGION', 'auto');
      vi.stubEnv('R2_ACCESS_KEY_ID', 'synthetic');
      vi.stubEnv('R2_SECRET_ACCESS_KEY', 'synthetic');
      vi.stubEnv('DEMO_DATABASE_FINGERPRINT', databaseFingerprint(process.env.DATABASE_URL));
      vi.stubEnv(
        'DEMO_MEDIA_FINGERPRINT',
        mediaFingerprint(process.env.R2_S3_ENDPOINT, process.env.R2_BUCKET),
      );
      const actor = await prisma().user.create({
        data: {
          displayName: 'Operador sintético',
          email: `demo-operator-${randomUUID()}@example.invalid`,
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
      actorId = actor.id;
      const independent = await prisma().listing.create({
        data: {
          ownerId: actorId,
          title: 'Cadastro independente',
          description: 'Registro fora do lote.',
          city: 'Recife',
          uf: 'PE',
        },
      });
      independentId = independent.id;
    });

    beforeEach(() => {
      hooks.put = undefined;
      hooks.failDelete = false;
      vi.stubEnv('APP_ENV', 'development');
    });
    afterEach(cleanFixtures);
    afterAll(async () => {
      // beforeAll pode falhar antes de criar IDs. Nunca transformar undefined
      // em um filtro vazio, inclusive quando o DB nao era exclusivo.
      if (independentId) await prisma().listing.deleteMany({ where: { id: independentId } });
      if (actorId) await prisma().user.deleteMany({ where: { id: actorId } });
      vi.unstubAllEnvs();
      await prisma().$disconnect();
    });

    async function seed() {
      expect(await seedDemoData()).toMatchObject({ success: true, created: 30, existing: 0 });
      await track();
      const summary = await getDemoDataSummary();
      expect(summary).toMatchObject({ products: 30 });
      return summary.batchId!;
    }

    it('cria 30, repete sem duplicar, pagina todos e entrega WebP reais', async () => {
      await seed();
      expect(await seedDemoData()).toMatchObject({ success: true, created: 0, existing: 30 });
      expect(await prisma().listing.count()).toBe(31);
      const pages = await Promise.all([
        getPublicFeed({ page: 1, limit: 20 }),
        getPublicFeed({ page: 2, limit: 20 }),
      ]);
      const ids = pages.flatMap((page) => page.listings.map((listing) => listing.id));
      expect(new Set(ids).size).toBe(30);
      expect(pages[0].total).toBe(30);
      for (const id of ids) {
        const detail = await getPublicListingDetail(id);
        expect(detail?.tradeOptions).toHaveLength(3);
        expect(detail?.images).toHaveLength(1);
        for (const kind of ['thumb', 'medium', 'large']) {
          const response = await serveMedia(detail!.images[0].id, kind);
          expect(response.status).toBe(200);
          expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format).toBe(
            'webp',
          );
        }
      }
      expect(await prisma().termsAcceptance.count({ where: { userId: technicalOwnerId } })).toBe(0);
      expect(await prisma().listingTransition.count({ where: { actorId: technicalOwnerId } })).toBe(
        0,
      );
      expect(await prisma().account.count({ where: { userId: technicalOwnerId } })).toBe(0);
    });

    it('remove fisicamente, revoga entrega, preserva independentes e auditoria, repete zero', async () => {
      const batchId = await seed();
      const first = await prisma().demoItem.findFirstOrThrow({ where: { batchId } });
      expect(await removeDemoData(actorId, batchId)).toMatchObject({
        success: true,
        removed: 30,
        pendingMedia: 90,
      });
      expect(await prisma().listing.count()).toBe(1);
      expect(await prisma().listing.findUnique({ where: { id: independentId } })).not.toBeNull();
      expect(await prisma().user.findUnique({ where: { id: technicalOwnerId } })).not.toBeNull();
      expect(await prisma().auditEvent.count({ where: { targetId: batchId } })).toBe(2);
      expect(await serveMedia(first.imageId, 'thumb')).toMatchObject({ status: 404 });
      expect(await removeDemoData(actorId, batchId)).toMatchObject({
        success: true,
        removed: 0,
        pendingMedia: 90,
      });
    });

    it('recria UUIDs novos; confirmação antiga não remove lote novo nem fila antiga apaga bytes novos', async () => {
      const first = await seed();
      const oldKeys = [...storage.keys()];
      expect(await removeDemoData(actorId, first)).toMatchObject({ success: true, removed: 30 });
      const second = await seed();
      const freshKeys = [...storage.keys()].filter((key) => !oldKeys.includes(key));
      expect(second).not.toBe(first);
      expect(freshKeys).toHaveLength(90);
      expect(await removeDemoData(actorId, first)).toMatchObject({
        success: false,
        reason: 'stale_batch',
      });
      expect(await consumeDeletionQueue()).toMatchObject({ completed: 90 });
      expect(freshKeys.every((key) => storage.has(key))).toBe(true);
      expect(await getDemoDataSummary()).toMatchObject({ products: 30, pendingMedia: 0 });
    });

    it('mantém intenção antes do PUT e impede duas criações em preparação', async () => {
      const entered = deferred();
      const release = deferred();
      let first = true;
      hooks.put = async () => {
        if (!first) return;
        first = false;
        const pending = await prisma().mediaObjectDeletion.count({ where: { completedAt: null } });
        expect(pending).toBe(90);
        entered.resolve();
        await release.promise;
      };
      const creation = seedDemoData();
      await entered.promise;
      try {
        expect(await seedDemoData()).toMatchObject({ success: false, reason: 'conflict' });
        const summary = await getDemoDataSummary();
        expect(await removeDemoData(actorId, summary.batchId!)).toMatchObject({
          success: false,
          reason: 'conflict',
        });
      } finally {
        release.resolve();
      }
      expect(await creation).toMatchObject({ success: true, created: 30 });
      expect(await prisma().listing.count()).toBe(31);
    });

    it('trava FOR UPDATE espera solicitação FK concorrente e veta o lote depois do commit', async () => {
      const batchId = await seed();
      const item = await prisma().demoItem.findFirstOrThrow({ where: { batchId } });
      const inserted = deferred();
      const release = deferred();
      const writer = prisma().$transaction(
        async (tx) => {
          await tx.contactRequest.create({
            data: {
              listingId: item.listingId!,
              requesterId: actorId,
              slotIndex: 1,
              reservedFrom: new Date(),
              reservedUntil: new Date(Date.now() + 1_800_000),
            },
          });
          inserted.resolve();
          await release.promise;
        },
        { timeout: 30_000 },
      );
      await inserted.promise;
      const removal = removeDemoData(actorId, batchId);
      try {
        let waiting = false;
        const stopAt = Date.now() + 5_000;
        while (Date.now() < stopAt && !waiting) {
          const [row] = await prisma().$queryRaw<{ waiting: boolean }[]>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database() AND wait_event_type = 'Lock'
                AND query LIKE '%FOR UPDATE OF l%'
            ) AS waiting`;
          waiting = row.waiting;
          if (!waiting) await new Promise((done) => setTimeout(done, 20));
        }
        expect(waiting).toBe(true);
      } finally {
        release.resolve();
        await writer;
      }
      expect(await removal).toMatchObject({ success: false, reason: 'conflict' });
      expect(await getDemoDataSummary()).toMatchObject({ products: 30, pendingMedia: 0 });
      expect(await prisma().contactRequest.count({ where: { listingId: item.listingId! } })).toBe(
        1,
      );
    });

    it('lease expirado permite recuperação e impede publicação do preparador antigo', async () => {
      const entered = deferred();
      const release = deferred();
      let firstPut = true;
      hooks.put = async () => {
        if (!firstPut) return;
        firstPut = false;
        entered.resolve();
        await release.promise;
      };
      const abandoned = seedDemoData();
      await entered.promise;
      const old = await prisma().demoBatch.findFirstOrThrow({ where: { status: 'preparing' } });
      // Simula queda/expiracao sem antecipar as intencoes do PUT em curso.
      await prisma().demoBatch.update({
        where: { id: old.id },
        data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
      });
      try {
        expect(await seedDemoData()).toMatchObject({ success: true, created: 30 });
      } finally {
        release.resolve();
      }
      expect(await abandoned).toMatchObject({ success: false, reason: 'conflict' });
      expect(await getDemoDataSummary()).toMatchObject({ products: 30, pendingMedia: 90 });
      const oldKeys = (await prisma().demoMediaObject.findMany({ where: { batchId: old.id } })).map(
        (object) => object.objectKey,
      );
      await prisma().mediaObjectDeletion.updateMany({
        where: { objectKey: { in: oldKeys } },
        data: { dueAt: new Date() },
      });
      expect(await consumeDeletionQueue()).toMatchObject({ completed: 90 });
      expect(storage.size).toBe(90);
      expect(await getDemoDataSummary()).toMatchObject({ products: 30, pendingMedia: 0 });
    });

    it.each(['removed', 'failed'])(
      'recusa procedência adulterada: lote terminal %s com produtos vivos',
      async (status) => {
        const batchId = await seed();
        await prisma().demoBatch.update({ where: { id: batchId }, data: { status } });
        await expect(getDemoDataSummary()).rejects.toThrow();
        expect(await seedDemoData()).toMatchObject({ success: false, reason: 'conflict' });
        expect(await removeDemoData(actorId, batchId)).toMatchObject({
          success: false,
          reason: 'conflict',
        });
        expect(await prisma().demoBatch.count({ where: { datasetId: 'products' } })).toBe(1);
        expect(
          await prisma().demoItem.count({ where: { batchId, listingId: { not: null } } }),
        ).toBe(30);
        expect(await prisma().listing.count()).toBe(31);
        expect(await prisma().auditEvent.count({ where: { targetId: batchId } })).toBe(1);
        expect(storage.size).toBe(90);
      },
    );

    it.each(['request', 'terms', 'transition', 'report'])(
      'veta todo o lote com vínculo humano/de negócio: %s',
      async (kind) => {
        const batchId = await seed();
        const item = await prisma().demoItem.findFirstOrThrow({ where: { batchId } });
        const listingId = item.listingId!;
        if (kind === 'request') {
          const request = await prisma().contactRequest.create({
            data: {
              listingId,
              requesterId: actorId,
              slotIndex: 1,
              reservedFrom: new Date(),
              reservedUntil: new Date(Date.now() + 1_800_000),
            },
          });
          await prisma().paymentAttempt.create({
            data: {
              contactRequestId: request.id,
              idempotencyKey: randomUUID(),
              externalReference: randomUUID(),
            },
          });
        } else if (kind === 'terms') {
          await prisma().termsAcceptance.create({
            data: {
              listingId,
              userId: actorId,
              type: 'listing_compliance',
              termsVersion: 'synthetic',
            },
          });
        } else if (kind === 'transition') {
          await prisma().listingTransition.create({
            data: { listingId, actorId, fromStatus: 'draft', toStatus: 'published' },
          });
        } else {
          await prisma().report.create({
            data: {
              listingId,
              reporterId: actorId,
              category: 'outro',
              details: 'Denúncia sintética.',
            },
          });
        }
        expect(await removeDemoData(actorId, batchId)).toMatchObject({
          success: false,
          reason: 'conflict',
        });
        expect(await prisma().listing.count()).toBe(31);
        expect(await getDemoDataSummary()).toMatchObject({ products: 30, pendingMedia: 0 });
        expect(storage.size).toBe(90);
      },
    );

    it('recusa procedência, lote/ator adulterado e referência de mídia compartilhada', async () => {
      const batchId = await seed();
      expect(await removeDemoData(actorId, randomUUID())).toMatchObject({
        success: false,
        reason: 'stale_batch',
      });
      expect(await removeDemoData(randomUUID(), batchId)).toMatchObject({
        success: false,
        reason: 'conflict',
      });
      const item = await prisma().demoItem.findFirstOrThrow({ where: { batchId } });
      await prisma().demoItem.update({
        where: { id: item.id },
        data: { itemKey: 'unknown-product' },
      });
      expect(await removeDemoData(actorId, batchId)).toMatchObject({
        success: false,
        reason: 'conflict',
      });
      await prisma().demoItem.update({ where: { id: item.id }, data: { itemKey: item.itemKey } });
      // A primeira chave usada so e usada como referencia externa de teste.
      await prisma().listingImage.create({
        data: {
          listingId: independentId,
          position: 1,
          status: 'ready',
          objectKey: `originals/${randomUUID()}/1`,
          sourceConfirmedAt: new Date(),
          processedAt: new Date(),
          derivatives: {
            create: { kind: 'thumb', objectKey: [...storage.keys()][0], width: 320, height: 320 },
          },
        },
      });
      expect(await removeDemoData(actorId, batchId)).toMatchObject({
        success: false,
        reason: 'conflict',
      });
      expect(await prisma().listing.count()).toBe(31);
    });

    it('falha da auditoria desfaz integralmente remoção e fila', async () => {
      const batchId = await seed();
      await prisma()
        .$executeRaw`ALTER TABLE "audit_events" ADD CONSTRAINT "it_demo_201_audit_failure" CHECK ("event_type" <> 'demo.deleted') NOT VALID`;
      try {
        expect(await removeDemoData(actorId, batchId)).toMatchObject({
          success: false,
          reason: 'error',
        });
      } finally {
        await prisma()
          .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT "it_demo_201_audit_failure"`;
      }
      expect(await getDemoDataSummary()).toMatchObject({ products: 30, pendingMedia: 0 });
      expect(
        await prisma().listingImage.count({ where: { listing: { ownerId: technicalOwnerId } } }),
      ).toBe(30);
    });

    it('PUT interrompido não publica parcialmente, conserva compensação e recupera outro lote', async () => {
      let puts = 0;
      hooks.put = async () => {
        if (++puts === 4) throw new Error('synthetic-put-failure');
      };
      expect(await seedDemoData()).toMatchObject({ success: false, reason: 'error' });
      await track();
      const orphanKeys = [...storage.keys()];
      expect(orphanKeys).toHaveLength(3);
      expect(await getDemoDataSummary()).toMatchObject({
        products: 0,
        batchId: null,
        pendingMedia: 90,
      });
      expect(await prisma().listing.count()).toBe(1);
      hooks.put = undefined;
      await seed();
      const keys = (
        await prisma().demoMediaObject.findMany({ where: { batch: { status: 'failed' } } })
      ).map((object) => object.objectKey);
      await prisma().mediaObjectDeletion.updateMany({
        where: { objectKey: { in: keys } },
        data: { dueAt: new Date() },
      });
      expect(await consumeDeletionQueue()).toMatchObject({ completed: 90 });
      expect(orphanKeys.some((key) => storage.has(key))).toBe(false);
      expect(storage.size).toBe(90);
    });

    it('falha externa conserva pendências honestas e recuperáveis', async () => {
      const batchId = await seed();
      await removeDemoData(actorId, batchId);
      hooks.failDelete = true;
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        expect(await consumeDeletionQueue()).toMatchObject({ completed: 0, retried: 90 });
      } finally {
        log.mockRestore();
      }
      expect(await getDemoDataSummary()).toMatchObject({ products: 0, pendingMedia: 90 });
      expect(storage.size).toBe(90);
      hooks.failDelete = false;
      await prisma().mediaObjectDeletion.updateMany({
        where: { completedAt: null },
        data: { dueAt: new Date() },
      });
      expect(await consumeDeletionQueue()).toMatchObject({ completed: 90 });
      expect(await getDemoDataSummary()).toMatchObject({ pendingMedia: 0 });
    });

    it('Production e alvo divergente recusam antes de criar/mutar o banco', async () => {
      vi.stubEnv('APP_ENV', 'production');
      expect(await seedDemoData()).toMatchObject({ success: false, reason: 'target' });
      expect(await removeDemoData(actorId, randomUUID())).toMatchObject({
        success: false,
        reason: 'target',
      });
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('DEMO_MEDIA_FINGERPRINT', '0'.repeat(64));
      expect(await seedDemoData()).toMatchObject({ success: false, reason: 'target' });
      expect(await prisma().demoDataset.count()).toBe(0);
      expect(await prisma().listing.count()).toBe(1);
      vi.stubEnv(
        'DEMO_MEDIA_FINGERPRINT',
        mediaFingerprint(process.env.R2_S3_ENDPOINT, process.env.R2_BUCKET),
      );
    });
  },
);
