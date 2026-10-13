import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { DemoDataset, Prisma } from '@/generated/prisma/client';
import { recordAuditEvent } from '@/modules/audit';
import { validateListingContent, validateTradeOptions } from '@/modules/listing';
import {
  derivativeKey,
  derivativeKeys,
  enqueueDeletions,
  originalKey,
  processImageBuffer,
  putDerivative,
  type DerivativeOutput,
} from '@/modules/media';
import { getPrismaClient } from '@/persistence/prisma';
import { DemoTargetError, requireDemoTarget, type DemoTarget } from './config';
import { DEMO_DATASET_VERSION, DEMO_PRODUCTS } from './manifest';

const DATASET_ID = 'products';
const PRODUCT_COUNT = 30;
const SEED_DEADLINE_MS = 5 * 60_000;
const PREPARATION_LEASE_MS = 15 * 60_000;
const PUT_DEADLINE_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIVE_STATUSES = ['preparing', 'active'];

export interface DemoSummary {
  environment: 'development' | 'preview';
  version: string;
  batchId: string | null;
  products: number;
  pendingMedia: number;
}

export type DemoOperationResult =
  | { success: true; created: number; existing: number; removed: number; pendingMedia: number }
  | { success: false; reason: 'conflict' | 'target' | 'error' | 'stale_batch'; error: string };

class DemoConflict extends Error {
  constructor(public readonly reason: 'conflict' | 'stale_batch' = 'conflict') {
    super('O lote foi alterado ou tem vínculos que impedem esta operação. Atualize a página.');
  }
}

function failure(error: unknown): DemoOperationResult {
  if (error instanceof DemoTargetError)
    return { success: false, reason: 'target', error: error.message };
  if (error instanceof DemoConflict)
    return { success: false, reason: error.reason, error: error.message };
  // FKs restritivas continuam sendo a ultima barreira contra vinculos novos.
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2003')
    return { success: false, reason: 'conflict', error: new DemoConflict().message };
  return {
    success: false,
    reason: 'error',
    error: 'Não foi possível concluir a operação. Os produtos não foram removidos parcialmente.',
  };
}

function checkDataset(dataset: DemoDataset, target: DemoTarget): void {
  if (
    dataset.id !== DATASET_ID ||
    dataset.environment !== target.environment ||
    dataset.databaseFingerprint !== target.databaseFingerprint ||
    dataset.mediaFingerprint !== target.mediaFingerprint
  )
    throw new DemoTargetError();
}

/** Trava curta; nenhum PUT/DELETE externo ocorre com transacao aberta. */
async function lockDataset(tx: Prisma.TransactionClient): Promise<void> {
  const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_xact_lock(201, 30) AS acquired`;
  if (!lock?.acquired) throw new DemoConflict();
}

async function pendingMedia(tx: Prisma.TransactionClient): Promise<number> {
  const [row] = await tx.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM "media_object_deletions" d
    JOIN "demo_media_objects" m ON m."object_key" = d."object_key"
    JOIN "demo_batches" b ON b."id" = m."batch_id"
    WHERE b."dataset_id" = ${DATASET_ID} AND d."completed_at" IS NULL`;
  return row?.count ?? 0;
}

/** A publicacao so liga Listing e item no mesmo commit que ativa o lote.
 * Um lote terminal/preparando com produto vivo nao pode ser ignorado, nem
 * autorizar uma nova geracao ou uma falsa remocao idempotente. */
async function requireConsistentProvenance(tx: Prisma.TransactionClient): Promise<void> {
  const unexpected = await tx.demoItem.count({
    where: {
      listingId: { not: null },
      batch: { datasetId: DATASET_ID, status: { not: 'active' } },
    },
  });
  if (unexpected !== 0) throw new DemoConflict();
}

function manifest(): void {
  if (
    DEMO_PRODUCTS.length !== PRODUCT_COUNT ||
    new Set(DEMO_PRODUCTS.map((item) => item.key)).size !== PRODUCT_COUNT ||
    new Set(DEMO_PRODUCTS.map((item) => item.title)).size !== PRODUCT_COUNT
  )
    throw new DemoConflict();
  for (const item of DEMO_PRODUCTS) {
    const content = validateListingContent({ ...item, state: item.uf }, true);
    const options = validateTradeOptions(item.tradeOptions, true);
    if (
      !content.ok ||
      !options.ok ||
      new Set(options.data).size !== 3 ||
      !/^[a-z0-9-]+\.png$/.test(basename(item.assetPath)) ||
      item.assetPath !== `public/demo-products/${basename(item.assetPath)}`
    )
      throw new DemoConflict();
  }
}

const ITEM_INCLUDE = {
  listing: {
    include: {
      images: { include: { derivatives: true } },
      tradeOptions: { orderBy: { position: 'asc' } },
    },
  },
} as const;

/** Recusa lote incompleto/adulterado em vez de substituir cadastro independente. */
async function cleanItems(tx: Prisma.TransactionClient, batchId: string, ownerId: string) {
  const items = await tx.demoItem.findMany({ where: { batchId }, include: ITEM_INCLUDE });
  if (items.length !== PRODUCT_COUNT) throw new DemoConflict();
  const expectedMedia = new Set<string>();
  for (const item of items) {
    const product = DEMO_PRODUCTS.find((entry) => entry.key === item.itemKey);
    const listing = item.listing;
    if (!product || !listing || listing.ownerId !== ownerId || listing.status !== 'published')
      throw new DemoConflict();
    for (const field of ['title', 'description', 'category', 'city', 'uf'] as const) {
      if (listing[field] !== product[field]) throw new DemoConflict();
    }
    if (
      listing.tradeOptions.length !== 3 ||
      listing.tradeOptions.some(
        (option, index) =>
          option.position !== index + 1 || option.label !== product.tradeOptions[index],
      ) ||
      listing.images.length !== 1
    )
      throw new DemoConflict();
    const image = listing.images[0];
    if (
      image.id !== item.imageId ||
      image.position !== 1 ||
      image.status !== 'ready' ||
      image.uploadGeneration !== 1 ||
      image.objectKey !== originalKey(item.imageId, 1) ||
      image.derivatives.length !== 3
    )
      throw new DemoConflict();
    const keys = derivativeKeys(item.imageId, 1);
    if (
      new Set(image.derivatives.map((derivative) => derivative.kind)).size !== 3 ||
      image.derivatives.some(
        (derivative) =>
          derivative.objectKey !== derivativeKey(item.imageId, 1, derivative.kind) ||
          derivative.width < 1 ||
          derivative.height < 1,
      )
    )
      throw new DemoConflict();
    for (const key of keys) expectedMedia.add(key);
  }
  const objects = await tx.demoMediaObject.findMany({ where: { batchId } });
  if (
    objects.length !== PRODUCT_COUNT * 3 ||
    objects.some((object) => !expectedMedia.has(object.objectKey))
  )
    throw new DemoConflict();
  return items;
}

async function requireTechnicalOwner(tx: Prisma.TransactionClient, ownerId: string): Promise<void> {
  const owner = await tx.user.findUnique({
    where: { id: ownerId },
    include: { _count: { select: { accounts: true, sessions: true } } },
  });
  if (
    !owner ||
    owner.status !== 'active' ||
    !owner.emailVerified ||
    !owner.emailVerifiedAt ||
    owner._count.accounts !== 0 ||
    owner._count.sessions !== 0
  )
    throw new DemoConflict();
}

export async function getDemoDataSummary(): Promise<DemoSummary> {
  const target = requireDemoTarget();
  return getPrismaClient().$transaction(async (tx) => {
    const dataset = await tx.demoDataset.findUnique({ where: { id: DATASET_ID } });
    if (dataset) checkDataset(dataset, target);
    await requireConsistentProvenance(tx);
    const batch = dataset
      ? await tx.demoBatch.findFirst({
          where: { datasetId: DATASET_ID, status: { in: LIVE_STATUSES } },
        })
      : null;
    return {
      environment: target.environment,
      version: batch?.version ?? DEMO_DATASET_VERSION,
      batchId: batch?.id ?? null,
      products: batch
        ? await tx.demoItem.count({ where: { batchId: batch.id, listingId: { not: null } } })
        : 0,
      pendingMedia: await pendingMedia(tx),
    };
  });
}

interface Preparation {
  batchId: string;
  ownerId: string;
  items: { id: string; itemKey: string; imageId: string }[];
}

async function reserve(target: DemoTarget): Promise<Preparation | DemoOperationResult> {
  return getPrismaClient().$transaction(
    async (tx) => {
      await lockDataset(tx);
      let dataset = await tx.demoDataset.findUnique({ where: { id: DATASET_ID } });
      if (dataset) {
        checkDataset(dataset, target);
        await requireTechnicalOwner(tx, dataset.ownerId);
        await requireConsistentProvenance(tx);
      } else {
        const ownerId = randomUUID();
        await tx.user.create({
          data: {
            id: ownerId,
            displayName: 'Catálogo demonstrativo',
            email: `demo-products-${ownerId}@example.invalid`,
            emailVerified: true,
            emailVerifiedAt: new Date(),
            status: 'active',
          },
        });
        dataset = await tx.demoDataset.create({ data: { id: DATASET_ID, ownerId, ...target } });
      }
      const current = await tx.demoBatch.findFirst({
        where: { datasetId: DATASET_ID, status: { in: LIVE_STATUSES } },
      });
      if (current?.status === 'active') {
        if (current.version !== DEMO_DATASET_VERSION) throw new DemoConflict();
        await cleanItems(tx, current.id, dataset.ownerId);
        return {
          success: true,
          created: 0,
          existing: PRODUCT_COUNT,
          removed: 0,
          pendingMedia: await pendingMedia(tx),
        };
      }
      if (current) {
        if (!current.leaseExpiresAt || current.leaseExpiresAt.getTime() > Date.now())
          throw new DemoConflict();
        // Queda do processo: as intencoes duraveis ja permitem limpar os PUTs.
        await tx.demoBatch.update({
          where: { id: current.id },
          data: { status: 'failed', leaseExpiresAt: null, completedAt: new Date() },
        });
      }
      const batchId = randomUUID();
      const leaseExpiresAt = new Date(Date.now() + PREPARATION_LEASE_MS);
      const items = DEMO_PRODUCTS.map((product) => ({
        id: randomUUID(),
        batchId,
        itemKey: product.key,
        imageId: randomUUID(),
      }));
      const keys = items.flatMap((item) => derivativeKeys(item.imageId, 1));
      await tx.demoBatch.create({
        data: {
          id: batchId,
          datasetId: DATASET_ID,
          version: DEMO_DATASET_VERSION,
          status: 'preparing',
          leaseExpiresAt,
        },
      });
      await tx.demoItem.createMany({ data: items });
      await tx.demoMediaObject.createMany({
        data: keys.map((objectKey) => ({ objectKey, batchId })),
      });
      // Antes do primeiro PUT. O consumidor so reclama depois do lease, que e
      // maior que o prazo global + prazo abortavel do ultimo PUT.
      await tx.mediaObjectDeletion.createMany({
        data: keys.map((objectKey) => ({
          objectKey,
          reason: 'derivative_orphan',
          dueAt: leaseExpiresAt,
        })),
      });
      return { batchId, ownerId: dataset.ownerId, items };
    },
    { timeout: 30_000 },
  );
}

interface PreparedImage {
  itemId: string;
  imageId: string;
  itemKey: string;
  width: number;
  height: number;
  derivatives: DerivativeOutput[];
}

async function abandon(batchId: string): Promise<void> {
  // Falha em compensar o banco nao perde a intencao: ela vence no lease.
  try {
    await getPrismaClient().$transaction(async (tx) => {
      await lockDataset(tx);
      const batch = await tx.demoBatch.findUnique({ where: { id: batchId } });
      if (batch?.status !== 'preparing') return;
      await tx.demoBatch.update({
        where: { id: batchId },
        data: { status: 'failed', leaseExpiresAt: null, completedAt: new Date() },
      });
      // O lease permanece nas pendencias: um PUT abortado nao pode disputar
      // com DeleteObject. A limpeza retomavel respeita o prazo reservado.
    });
  } catch {
    // Nao registrar conexoes, chaves ou mensagens do provedor.
  }
}

/** Processo tecnico explicito (CLI); nao autentica nem envia mensagens. */
export async function seedDemoData(): Promise<DemoOperationResult> {
  let preparation: Preparation | undefined;
  try {
    const target = requireDemoTarget();
    manifest();
    const reservation = await reserve(target);
    if ('success' in reservation) return reservation;
    preparation = reservation;
    const stopAt = Date.now() + SEED_DEADLINE_MS;
    const prepared: PreparedImage[] = [];
    for (const item of preparation.items) {
      if (Date.now() >= stopAt) throw new Error('demo_seed_deadline');
      const product = DEMO_PRODUCTS.find((entry) => entry.key === item.itemKey)!;
      // Prefixo estatico para o tracing do Next: somente assets deste catalogo,
      // nunca todo o checkout. O manifesto valida o basename antes da reserva.
      const output = await processImageBuffer(
        await readFile(join(process.cwd(), 'public/demo-products', basename(product.assetPath))),
      );
      if (!output.ok) throw new Error('demo_invalid_asset');
      for (const derivative of output.derivatives) {
        if (Date.now() >= stopAt) throw new Error('demo_seed_deadline');
        await putDerivative(
          derivativeKey(item.imageId, 1, derivative.kind),
          derivative.data,
          AbortSignal.timeout(Math.min(PUT_DEADLINE_MS, stopAt - Date.now())),
        );
      }
      prepared.push({
        itemId: item.id,
        itemKey: item.itemKey,
        imageId: item.imageId,
        width: output.width,
        height: output.height,
        derivatives: output.derivatives,
      });
    }
    const batchId = preparation.batchId;
    const ownerId = preparation.ownerId;
    return await getPrismaClient().$transaction(
      async (tx) => {
        await lockDataset(tx);
        const effective = requireDemoTarget();
        const dataset = await tx.demoDataset.findUniqueOrThrow({ where: { id: DATASET_ID } });
        checkDataset(dataset, effective);
        checkDataset(dataset, target);
        await requireTechnicalOwner(tx, ownerId);
        const batch = await tx.demoBatch.findUniqueOrThrow({ where: { id: batchId } });
        if (
          batch.status !== 'preparing' ||
          !batch.leaseExpiresAt ||
          batch.leaseExpiresAt.getTime() <= Date.now() ||
          Date.now() >= stopAt
        )
          throw new DemoConflict();
        const now = new Date();
        for (const image of prepared) {
          const product = DEMO_PRODUCTS.find((entry) => entry.key === image.itemKey)!;
          const listing = await tx.listing.create({
            data: {
              ownerId,
              category: product.category,
              title: product.title,
              description: product.description,
              city: product.city,
              uf: product.uf,
              status: 'published',
              publishedAt: now,
              tradeOptions: {
                create: product.tradeOptions.map((label, index) => ({
                  position: index + 1,
                  label,
                })),
              },
              images: {
                create: {
                  id: image.imageId,
                  position: 1,
                  status: 'ready',
                  objectKey: originalKey(image.imageId, 1),
                  width: image.width,
                  height: image.height,
                  sourceConfirmedAt: now,
                  processedAt: now,
                  derivatives: {
                    create: image.derivatives.map((derivative) => ({
                      kind: derivative.kind,
                      objectKey: derivativeKey(image.imageId, 1, derivative.kind),
                      width: derivative.width,
                      height: derivative.height,
                    })),
                  },
                },
              },
            },
          });
          await tx.demoItem.update({
            where: { id: image.itemId },
            data: { listingId: listing.id },
          });
        }
        const keys = prepared.flatMap((image) => derivativeKeys(image.imageId, 1));
        // Retira somente intencoes nao reclamadas. Publicacao e retirada sao
        // atomicas: se o processo cair antes, o lease limpa os objetos orfaos.
        const retired = await tx.mediaObjectDeletion.deleteMany({
          where: { objectKey: { in: keys }, completedAt: null, attempts: 0, dueAt: { gt: now } },
        });
        if (retired.count !== PRODUCT_COUNT * 3) throw new DemoConflict();
        await tx.demoBatch.update({
          where: { id: batchId },
          data: { status: 'active', leaseExpiresAt: null, completedAt: now },
        });
        await recordAuditEvent(tx, {
          eventType: 'demo.seeded',
          actorId: null,
          targetType: 'demo_batch',
          targetId: batchId,
          result: 'created',
          details: {
            environment: target.environment,
            version: DEMO_DATASET_VERSION,
            products: PRODUCT_COUNT,
            images: PRODUCT_COUNT,
            objects: keys.length,
          },
        });
        return {
          success: true,
          created: PRODUCT_COUNT,
          existing: 0,
          removed: 0,
          pendingMedia: await pendingMedia(tx),
        };
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (preparation) await abandon(preparation.batchId);
    return failure(error);
  }
}

/** Entrada somente pela action autenticada. O cliente confirma o ID do lote,
 * nunca escolhe IDs de produtos, chaves ou usuario alvo. */
export async function removeDemoData(
  actorId: string,
  expectedBatchId: string,
): Promise<DemoOperationResult> {
  try {
    const target = requireDemoTarget();
    if (!UUID.test(actorId) || !UUID.test(expectedBatchId)) throw new DemoConflict('stale_batch');
    manifest();
    return await getPrismaClient().$transaction(
      async (tx) => {
        await lockDataset(tx);
        const actor = await tx.user.findUnique({ where: { id: actorId } });
        if (!actor || actor.status !== 'active' || !actor.emailVerified) throw new DemoConflict();
        const dataset = await tx.demoDataset.findUnique({ where: { id: DATASET_ID } });
        if (!dataset) throw new DemoConflict('stale_batch');
        checkDataset(dataset, target);
        await requireConsistentProvenance(tx);
        const current = await tx.demoBatch.findFirst({
          where: { datasetId: DATASET_ID, status: { in: LIVE_STATUSES } },
        });
        const batch = await tx.demoBatch.findUnique({ where: { id: expectedBatchId } });
        if (!batch || batch.datasetId !== DATASET_ID || (current && current.id !== expectedBatchId))
          throw new DemoConflict('stale_batch');
        if (batch.status === 'removed')
          return {
            success: true,
            created: 0,
            existing: 0,
            removed: 0,
            pendingMedia: await pendingMedia(tx),
          };
        if (batch.status !== 'active' || batch.version !== DEMO_DATASET_VERSION)
          throw new DemoConflict();
        // UPDATE lock tambem bloqueia os key-share locks de novos filhos FK.
        // Depois da trava, READ COMMITTED enxerga os vinculos que venceram.
        await tx.$queryRaw`
          SELECT l."id" FROM "listings" l JOIN "demo_items" i ON i."listing_id" = l."id"
          WHERE i."batch_id" = ${batch.id}::uuid ORDER BY l."id" FOR UPDATE OF l`;
        await tx.$queryRaw`
          SELECT im."id" FROM "listing_images" im JOIN "demo_items" i ON i."listing_id" = im."listing_id"
          WHERE i."batch_id" = ${batch.id}::uuid ORDER BY im."id" FOR UPDATE OF im`;
        await requireTechnicalOwner(tx, dataset.ownerId);
        const items = await cleanItems(tx, batch.id, dataset.ownerId);
        const ids = items.map((item) => item.listingId!);
        const linked = await tx.listing.findMany({
          where: { id: { in: ids } },
          select: {
            _count: {
              select: {
                transitions: true,
                termsAcceptances: true,
                contactRequests: true,
                paidRequestGuards: true,
                selections: true,
                negotiations: true,
                contactReleases: true,
                reports: true,
                moderationDecisions: true,
              },
            },
          },
        });
        if (linked.some((listing) => Object.values(listing._count).some((count) => count > 0)))
          throw new DemoConflict();
        const objects = await tx.demoMediaObject.findMany({ where: { batchId: batch.id } });
        const shared = await tx.imageDerivative.count({
          where: {
            objectKey: { in: objects.map((object) => object.objectKey) },
            imageId: { notIn: items.map((item) => item.imageId) },
          },
        });
        if (shared !== 0) throw new DemoConflict();
        await enqueueDeletions(
          tx,
          objects.map((object) => object.objectKey),
          'image_removed',
        );
        await tx.demoItem.updateMany({ where: { batchId: batch.id }, data: { listingId: null } });
        // Os derivados saem pelo CASCADE exclusivo da imagem. Nao ha fatos
        // humanos entre estas dependencias sinteticas autorizadas.
        await tx.listingImage.deleteMany({
          where: { id: { in: items.map((item) => item.imageId) }, listingId: { in: ids } },
        });
        const removed = await tx.listing.deleteMany({
          where: { id: { in: ids }, ownerId: dataset.ownerId },
        });
        if (removed.count !== PRODUCT_COUNT) throw new DemoConflict();
        await tx.demoBatch.update({
          where: { id: batch.id },
          data: { status: 'removed', completedAt: new Date() },
        });
        await recordAuditEvent(tx, {
          eventType: 'demo.deleted',
          actorId,
          targetType: 'demo_batch',
          targetId: batch.id,
          result: 'removed',
          details: {
            environment: target.environment,
            version: batch.version,
            products: removed.count,
            images: items.length,
            objects: objects.length,
          },
        });
        return {
          success: true,
          created: 0,
          existing: 0,
          removed: removed.count,
          pendingMedia: await pendingMedia(tx),
        };
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    return failure(error);
  }
}
