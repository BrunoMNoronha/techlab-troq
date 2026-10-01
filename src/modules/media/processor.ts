import sharp from 'sharp';
import { getPrismaClient } from '@/persistence/prisma';
import { enqueueDeletions } from './deletions';
import {
  isTransientFailure,
  type PermanentFailureCode,
  type TransientFailureCode,
} from './failure-codes';
import { MAX_SOURCE_BYTES, processImageBuffer, type DerivativeOutput } from './image-processing';
import { derivativeKey, derivativeKeys, originalKey } from './keys';
import { classifyR2Error, getObjectIfMatch, putDerivative } from './s3';

// Executor UNICO do processamento de imagens (media-pipeline-contract.md,
// secao 8). Chamado pelo caminho rapido (`after()` na confirmacao, restrito a
// uma imagem) e pela recuperacao (GET /api/jobs/media-process, com
// CRON_SECRET). A fila e o proprio estado em `listing_images` (ADR-0006).
//
// - Claim em UMA instrucao com `FOR UPDATE SKIP LOCKED`; nenhuma transacao fica
//   aberta durante download, sharp ou upload. A selecao travada fica numa CTE
//   `MATERIALIZED`: na forma `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP
//   LOCKED)`, o PostgreSQL pode reavaliar a subconsulta por linha externa de um
//   nested loop e reclamar mais que o lote (payments-design.md, PD-10.7).
// - `attempts` sobe no claim e e o token de fencing: so a tentativa corrente
//   finaliza. Lease de 360 s (> maxDuration de 300 s) recupera queda.
// - `ready` so e gravado na transacao final, com os tres derivados
//   persistidos e a exclusao do original enfileirada.

export const LEASE_SECONDS = 360;
export const MAX_ATTEMPTS = 5;
/** Recuo depois da 1a, 2a, 3a e 4a falha transitoria (minutos). */
export const BACKOFF_MINUTES = [1, 5, 15, 60] as const;
/** Lote de `exhaustAbandoned` por invocacao. */
export const EXHAUST_BATCH = 20;

// Medido no benchmark de 50 MP (2 GB / 1 vCPU): sem cache e com uma thread por
// operacao o pico e previsivel; o cache nao traz ganho para processamento unico.
sharp.cache(false);
sharp.concurrency(1);

interface Claim {
  id: string;
  attempts: number;
  object_key: string;
  source_etag: string;
  upload_generation: number;
}

export type ProcessOutcome = 'ready' | 'failed' | 'retry' | 'fenced';

export interface ProcessSummary {
  claimed: number;
  ready: number;
  failed: number;
  retried: number;
  fenced: number;
  exhausted: number;
}

/** Linhas cuja ultima tentativa morreu (lease vencido) sem orcamento restante. */
async function exhaustAbandoned(): Promise<number> {
  return getPrismaClient().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; upload_generation: number }[]>`
      WITH x AS MATERIALIZED (
        SELECT "id" FROM "listing_images"
        WHERE "status" = 'processing' AND "lease_expires_at" < now() AND "attempts" >= ${MAX_ATTEMPTS}
        LIMIT ${EXHAUST_BATCH}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "listing_images" li
      SET "status" = 'failed', "failure_code" = 'transient_exhausted',
          "lease_expires_at" = NULL, "updated_at" = now()
      FROM x
      WHERE li."id" = x."id"
      RETURNING li."id"::text AS "id", li."upload_generation"`;
    for (const row of rows) {
      await enqueueDeletions(tx, [originalKey(row.id, row.upload_generation)], 'source_failed');
      await enqueueDeletions(
        tx,
        derivativeKeys(row.id, row.upload_generation),
        'derivative_orphan',
      );
    }
    return rows.length;
  });
}

async function claimNext(imageId?: string): Promise<Claim | null> {
  const prisma = getPrismaClient();
  const rows = imageId
    ? await prisma.$queryRaw<Claim[]>`
        WITH c AS MATERIALIZED (
          SELECT "id" FROM "listing_images"
          WHERE "id" = ${imageId}::uuid AND "attempts" < ${MAX_ATTEMPTS}
            AND (("status" = 'uploaded' AND "source_confirmed_at" IS NOT NULL
                  AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= now()))
              OR ("status" = 'processing' AND "lease_expires_at" < now()))
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "listing_images" li
        SET "status" = 'processing', "attempts" = li."attempts" + 1,
            "lease_expires_at" = now() + make_interval(secs => ${LEASE_SECONDS}),
            "next_attempt_at" = NULL,
            "failure_code" = CASE WHEN li."status" = 'processing' THEN 'interrupted' ELSE li."failure_code" END,
            "updated_at" = now()
        FROM c
        WHERE li."id" = c."id"
        RETURNING li."id"::text AS "id", li."attempts", li."object_key", li."source_etag", li."upload_generation"`
    : await prisma.$queryRaw<Claim[]>`
        WITH c AS MATERIALIZED (
          SELECT "id" FROM "listing_images"
          WHERE "attempts" < ${MAX_ATTEMPTS}
            AND (("status" = 'uploaded' AND "source_confirmed_at" IS NOT NULL
                  AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= now()))
              OR ("status" = 'processing' AND "lease_expires_at" < now()))
          ORDER BY coalesce("next_attempt_at", "source_confirmed_at")
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "listing_images" li
        SET "status" = 'processing', "attempts" = li."attempts" + 1,
            "lease_expires_at" = now() + make_interval(secs => ${LEASE_SECONDS}),
            "next_attempt_at" = NULL,
            "failure_code" = CASE WHEN li."status" = 'processing' THEN 'interrupted' ELSE li."failure_code" END,
            "updated_at" = now()
        FROM c
        WHERE li."id" = c."id"
        RETURNING li."id"::text AS "id", li."attempts", li."object_key", li."source_etag", li."upload_generation"`;
  return rows[0] ?? null;
}

async function failPermanently(claim: Claim, code: PermanentFailureCode): Promise<ProcessOutcome> {
  return getPrismaClient().$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE "listing_images"
      SET "status" = 'failed', "failure_code" = ${code}, "lease_expires_at" = NULL,
          "next_attempt_at" = NULL, "updated_at" = now()
      WHERE "id" = ${claim.id}::uuid AND "status" = 'processing' AND "attempts" = ${claim.attempts}
        AND "upload_generation" = ${claim.upload_generation}`;
    if (updated !== 1) return 'fenced';
    await enqueueDeletions(tx, [originalKey(claim.id, claim.upload_generation)], 'source_failed');
    await enqueueDeletions(
      tx,
      derivativeKeys(claim.id, claim.upload_generation),
      'derivative_orphan',
    );
    return 'failed';
  });
}

async function retryLater(claim: Claim, code: TransientFailureCode): Promise<ProcessOutcome> {
  if (claim.attempts >= MAX_ATTEMPTS) return failPermanently(claim, 'transient_exhausted');
  const backoff =
    BACKOFF_MINUTES[claim.attempts - 1] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1];
  const updated = await getPrismaClient().$executeRaw`
    UPDATE "listing_images"
    SET "status" = 'uploaded', "failure_code" = ${code}, "lease_expires_at" = NULL,
        "next_attempt_at" = now() + make_interval(mins => ${backoff}), "updated_at" = now()
    WHERE "id" = ${claim.id}::uuid AND "status" = 'processing' AND "attempts" = ${claim.attempts}
      AND "upload_generation" = ${claim.upload_generation}`;
  return updated === 1 ? 'retry' : 'fenced';
}

async function finalizeReady(
  claim: Claim,
  width: number,
  height: number,
  derivatives: DerivativeOutput[],
): Promise<ProcessOutcome> {
  const written = derivatives.map((d) => derivativeKey(claim.id, claim.upload_generation, d.kind));
  return getPrismaClient().$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE "listing_images"
      SET "status" = 'ready', "processed_at" = now(), "width" = ${width}, "height" = ${height},
          "lease_expires_at" = NULL, "next_attempt_at" = NULL, "failure_code" = NULL,
          "updated_at" = now()
      WHERE "id" = ${claim.id}::uuid AND "status" = 'processing' AND "attempts" = ${claim.attempts}
        AND "upload_generation" = ${claim.upload_generation}`;

    if (updated !== 1) {
      // Fencing falhou (imagem removida, reclamada por outra tentativa ou
      // alterada): nada vira `ready`. Os objetos escritos por esta tentativa
      // ficam orfaos e vao para a fila, salvo se um derivado vivo os referencia.
      const live = await tx.$queryRaw<{ object_key: string }[]>`
        SELECT "object_key" FROM "image_derivatives" WHERE "object_key" = ANY(${written}::text[])`;
      const referenced = new Set(live.map((row) => row.object_key));
      await enqueueDeletions(
        tx,
        written.filter((key) => !referenced.has(key)),
        'derivative_orphan',
      );
      return 'fenced';
    }

    for (const derivative of derivatives) {
      const objectKey = derivativeKey(claim.id, claim.upload_generation, derivative.kind);
      await tx.imageDerivative.upsert({
        where: { imageId_kind: { imageId: claim.id, kind: derivative.kind } },
        create: {
          imageId: claim.id,
          kind: derivative.kind,
          objectKey,
          width: derivative.width,
          height: derivative.height,
        },
        update: { objectKey, width: derivative.width, height: derivative.height },
      });
    }
    await enqueueDeletions(
      tx,
      [originalKey(claim.id, claim.upload_generation)],
      'source_processed',
    );
    return 'ready';
  });
}

/** Processa UMA imagem ja reclamada. Nunca lanca: todo erro vira desfecho. */
export async function processClaim(claim: Claim): Promise<ProcessOutcome> {
  try {
    let source: Buffer;
    try {
      const object = await getObjectIfMatch(claim.object_key, claim.source_etag);
      if (object.contentLength > MAX_SOURCE_BYTES) return failPermanently(claim, 'too_large_bytes');
      source = object.data;
    } catch (err) {
      const code = classifyR2Error(err);
      return isTransientFailure(code) ? retryLater(claim, code) : failPermanently(claim, code);
    }

    const result = await processImageBuffer(source);
    if (!result.ok) return failPermanently(claim, result.code);

    for (const derivative of result.derivatives) {
      try {
        await putDerivative(
          derivativeKey(claim.id, claim.upload_generation, derivative.kind),
          derivative.data,
        );
      } catch (err) {
        const code = classifyR2Error(err);
        return retryLater(claim, isTransientFailure(code) ? code : 'r2_unavailable');
      }
    }

    return await finalizeReady(claim, result.width, result.height, result.derivatives);
  } catch (err) {
    // Falha inesperada (banco indisponivel, defeito): sem desfecho gravado, o
    // lease vence e a proxima execucao reclama a imagem, consumindo tentativa.
    console.error('[media] falha inesperada no processamento', {
      imageId: claim.id,
      attempt: claim.attempts,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return 'fenced';
  }
}

export interface ProcessOptions {
  /** Caminho rapido: so esta imagem. */
  imageId?: string;
  /** Maximo de imagens nesta invocacao. */
  maxImages?: number;
  /** Instante (ms epoch) a partir do qual nao se reclama nova imagem. */
  stopClaimingAt?: number;
}

/**
 * Processa imagens pendentes, UMA de cada vez, ate acabar a fila, o limite de
 * imagens ou o orcamento de tempo. Idempotente e seguro sob execucoes
 * concorrentes, perdidas ou duplicadas.
 */
export async function processPendingImages(options: ProcessOptions = {}): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    claimed: 0,
    ready: 0,
    failed: 0,
    retried: 0,
    fenced: 0,
    exhausted: 0,
  };
  const maxImages = options.imageId ? 1 : (options.maxImages ?? Number.POSITIVE_INFINITY);

  if (!options.imageId) summary.exhausted = await exhaustAbandoned();

  while (summary.claimed < maxImages) {
    if (options.stopClaimingAt !== undefined && Date.now() >= options.stopClaimingAt) break;
    const claim = await claimNext(options.imageId);
    if (!claim) break;
    summary.claimed += 1;

    const outcome = await processClaim(claim);
    if (outcome === 'ready') summary.ready += 1;
    else if (outcome === 'failed') summary.failed += 1;
    else if (outcome === 'retry') summary.retried += 1;
    else summary.fenced += 1;
  }
  return summary;
}
