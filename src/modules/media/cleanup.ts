import { getPrismaClient } from '@/persistence/prisma';
import { enqueueDeletions } from './deletions';
import { derivativeKeys, originalKey } from './keys';
import { classifyR2DeleteError, deleteObject } from './s3';
import { compactPositions } from './upload';

// Limpeza de midia (media-pipeline-contract.md, secoes 11 e 13). Executor unico
// chamado por GET /api/jobs/media-cleanup (CRON_SECRET), com cadencia
// contratual HORARIA. Tres passos, nesta ordem:
//
// 1. Reservas abandonadas: `uploaded` sem confirmacao ha mais de 1 h saem da
//    lista sob a trava do anuncio; o original vai para a fila.
// 2. Teto absoluto: imagem nao `ready` autorizada ha mais de 20 h vira `failed`
//    (`expired`); original e derivados parciais vao para a fila.
// 3. Fila de exclusao: pendencias vencidas sao reclamadas em transacao curta
//    com `FOR UPDATE SKIP LOCKED`, apagadas no R2 SEM transacao aberta e so
//    entao concluidas. Falha mantem a pendencia, com codigo fechado e recuo.
//
// Nenhuma chamada ao R2 acontece com transacao aberta. Nada aqui registra
// chave de objeto, URL, credencial ou mensagem crua do provedor.

export const ABANDONED_AFTER_MINUTES = 60;
export const EXPIRE_AFTER_HOURS = 20;
/** Pendencia reclamada fica invisivel a outro executor por este tempo. */
export const DELETION_LEASE_SECONDS = 360;
/** Recuo depois da 1a, 2a, 3a e 4a falha; da 5a em diante, 60 min. */
export const DELETION_BACKOFF_MINUTES = [1, 5, 15, 60] as const;
/** Chave ainda viva: reconferida uma vez por dia, com diagnostico visivel. */
export const PROTECTED_RECHECK_HOURS = 24;

const BATCH = 20;

export interface CleanupSummary {
  abandoned: number;
  expired: number;
  claimed: number;
  completed: number;
  retried: number;
  protected: number;
  errors: number;
}

function emptySummary(): CleanupSummary {
  return {
    abandoned: 0,
    expired: 0,
    claimed: 0,
    completed: 0,
    retried: 0,
    protected: 0,
    errors: 0,
  };
}

// ---------------------------------------------------------------------------
// 1. Reservas abandonadas (secao 11)
// ---------------------------------------------------------------------------

/** Remove, sob a trava de cada anuncio, as reservas vencidas. */
export async function abandonStaleReservations(limit = BATCH): Promise<number> {
  const prisma = getPrismaClient();
  const listings = await prisma.$queryRaw<{ listing_id: string }[]>`
    SELECT DISTINCT "listing_id"::text AS "listing_id" FROM (
      SELECT "listing_id" FROM "listing_images"
      WHERE "status" = 'uploaded' AND "source_confirmed_at" IS NULL
        AND "upload_authorized_at" < now() - make_interval(mins => ${ABANDONED_AFTER_MINUTES})
      LIMIT ${limit}
    ) c`;

  let removed = 0;
  for (const { listing_id: listingId } of listings) {
    removed += await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "listings" WHERE "id" = ${listingId}::uuid FOR UPDATE`;
      // A condicao e reavaliada sob a trava: confirmacao concorrente vence.
      const rows = await tx.$queryRaw<{ id: string; upload_generation: number }[]>`
        DELETE FROM "listing_images"
        WHERE "listing_id" = ${listingId}::uuid
          AND "status" = 'uploaded' AND "source_confirmed_at" IS NULL
          AND "upload_authorized_at" < now() - make_interval(mins => ${ABANDONED_AFTER_MINUTES})
        RETURNING "id"::text AS "id", "upload_generation"`;
      if (rows.length === 0) return 0;
      await compactPositions(tx, listingId);
      await enqueueDeletions(
        tx,
        rows.map((r) => originalKey(r.id, r.upload_generation)),
        'source_abandoned',
      );
      return rows.length;
    });
  }
  return removed;
}

// ---------------------------------------------------------------------------
// 2. Teto absoluto de 20 h (secao 11)
// ---------------------------------------------------------------------------

/**
 * Imagem ainda nao `ready` autorizada ha mais de 20 h vira `failed`/`expired`.
 * Uma tentativa em curso e cercada pelo fencing do executor (status deixa de
 * ser `processing`) e enfileira os derivados que tiver escrito. Selecao em CTE
 * `MATERIALIZED` pelo mesmo motivo de `claimDeletions`.
 */
export async function expireStaleImages(limit = BATCH): Promise<number> {
  return getPrismaClient().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; upload_generation: number }[]>`
      WITH x AS MATERIALIZED (
        SELECT "id" FROM "listing_images"
        WHERE "status" IN ('uploaded', 'processing')
          AND "upload_authorized_at" < now() - make_interval(hours => ${EXPIRE_AFTER_HOURS})
        ORDER BY "upload_authorized_at"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "listing_images" li
      SET "status" = 'failed', "failure_code" = 'expired', "lease_expires_at" = NULL,
          "next_attempt_at" = NULL, "updated_at" = now()
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

// ---------------------------------------------------------------------------
// 3. Fila de exclusao (secao 13)
// ---------------------------------------------------------------------------

interface ClaimedDeletion {
  id: string;
  object_key: string;
  attempts: number;
}

/**
 * Reclama um lote vencido em UMA instrucao. `attempts` sobe no claim e e o
 * token de fencing; `due_at` e empurrado pelo lease, para que outro executor
 * nao pegue a mesma pendencia depois do commit. Queda do executor: o lease
 * vence e a pendencia volta a ser elegivel.
 *
 * A selecao travada fica numa CTE `MATERIALIZED`: na forma
 * `UPDATE ... FROM (SELECT ... LIMIT ... FOR UPDATE SKIP LOCKED)`, o PostgreSQL
 * pode planejar a subconsulta como lado interno de um nested loop e reavalia-la
 * por linha externa, reclamando mais que `limit` (payments-design.md, PD-10.7).
 */
async function claimDeletions(limit: number): Promise<ClaimedDeletion[]> {
  return getPrismaClient().$queryRaw<ClaimedDeletion[]>`
    WITH c AS MATERIALIZED (
      SELECT "id" FROM "media_object_deletions"
      WHERE "completed_at" IS NULL AND "due_at" <= now()
      ORDER BY "due_at"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "media_object_deletions" d
    SET "attempts" = d."attempts" + 1,
        "due_at" = now() + make_interval(secs => ${DELETION_LEASE_SECONDS})
    FROM c
    WHERE d."id" = c."id"
    RETURNING d."id"::text AS "id", d."object_key", d."attempts"`;
}

const DERIVATIVE_KEY = /^derivatives\/([0-9a-f-]{36})\/(\d+)\//;
const ORIGINAL_KEY = /^originals\/([0-9a-f-]{36})\/(\d+)$/;

/**
 * Segunda barreira antes de apagar (a primeira e a geracao na chave): a chave
 * esta viva se um `ImageDerivative` a referencia, ou se a GERACAO dela ainda
 * pode produzir/servir o objeto — derivado de geracao que nao terminou em
 * `failed`; original de geracao ainda `uploaded`/`processing`. Imagem
 * inexistente e geracao `failed` sao terminais: nao voltam a usar a chave.
 */
async function isLiveKey(key: string): Promise<boolean> {
  const derivative = DERIVATIVE_KEY.exec(key);
  const original = ORIGINAL_KEY.exec(key);
  const imageId = derivative?.[1] ?? original?.[1] ?? null;
  const generation = Number(derivative?.[2] ?? original?.[2] ?? 0);
  const liveStatuses = derivative
    ? ['uploaded', 'processing', 'ready']
    : ['uploaded', 'processing'];

  const rows = await getPrismaClient().$queryRaw<{ live: boolean }[]>`
    SELECT (
      EXISTS (SELECT 1 FROM "image_derivatives" WHERE "object_key" = ${key})
      OR (
        ${imageId}::uuid IS NOT NULL AND EXISTS (
          SELECT 1 FROM "listing_images"
          WHERE "id" = ${imageId}::uuid AND "upload_generation" = ${generation}
            AND "status"::text = ANY(${liveStatuses})
        )
      )
    ) AS "live"`;
  return rows[0]?.live === true;
}

function backoffMinutes(attempts: number): number {
  return DELETION_BACKOFF_MINUTES[Math.min(attempts, DELETION_BACKOFF_MINUTES.length) - 1];
}

type DeletionOutcome = 'completed' | 'retried' | 'protected' | 'error';

async function processDeletion(claim: ClaimedDeletion): Promise<DeletionOutcome> {
  const prisma = getPrismaClient();
  try {
    if (await isLiveKey(claim.object_key)) {
      await prisma.$executeRaw`
        UPDATE "media_object_deletions"
        SET "due_at" = now() + make_interval(hours => ${PROTECTED_RECHECK_HOURS}),
            "last_error_code" = 'live_reference'
        WHERE "id" = ${claim.id}::uuid AND "attempts" = ${claim.attempts}
          AND "completed_at" IS NULL`;
      return 'protected';
    }

    try {
      await deleteObject(claim.object_key);
    } catch (err) {
      const code = classifyR2DeleteError(err);
      await prisma.$executeRaw`
        UPDATE "media_object_deletions"
        SET "due_at" = now() + make_interval(mins => ${backoffMinutes(claim.attempts)}),
            "last_error_code" = ${code}
        WHERE "id" = ${claim.id}::uuid AND "attempts" = ${claim.attempts}
          AND "completed_at" IS NULL`;
      console.error('[media] exclusao de objeto falhou; pendencia mantida', {
        deletionId: claim.id,
        attempt: claim.attempts,
        code,
      });
      return 'retried';
    }

    // So depois de o R2 confirmar. Se esta gravacao falhar, o lease vence e a
    // proxima execucao repete o DeleteObject (idempotente) e conclui.
    await prisma.$executeRaw`
      UPDATE "media_object_deletions"
      SET "completed_at" = now(), "last_error_code" = NULL
      WHERE "id" = ${claim.id}::uuid AND "attempts" = ${claim.attempts}
        AND "completed_at" IS NULL`;
    return 'completed';
  } catch (err) {
    console.error('[media] falha inesperada na fila de exclusao', {
      deletionId: claim.id,
      attempt: claim.attempts,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return 'error';
  }
}

export interface CleanupOptions {
  /** Instante (ms epoch) a partir do qual nenhum lote novo e reclamado. */
  stopClaimingAt?: number;
  /** Tamanho do lote da fila de exclusao. */
  batchSize?: number;
}

/** Consome a fila de exclusao ate esvaziar os vencidos ou esgotar o orcamento. */
export async function consumeDeletionQueue(options: CleanupOptions = {}): Promise<CleanupSummary> {
  const summary = emptySummary();
  const batchSize = options.batchSize ?? BATCH;
  while (options.stopClaimingAt === undefined || Date.now() < options.stopClaimingAt) {
    const claims = await claimDeletions(batchSize);
    if (claims.length === 0) break;
    summary.claimed += claims.length;
    for (const claim of claims) {
      const outcome = await processDeletion(claim);
      if (outcome === 'completed') summary.completed += 1;
      else if (outcome === 'retried') summary.retried += 1;
      else if (outcome === 'protected') summary.protected += 1;
      else summary.errors += 1;
    }
  }
  return summary;
}

/** Os tres passos, na ordem do contrato. Idempotente e seguro em paralelo. */
export async function runMediaCleanup(options: CleanupOptions = {}): Promise<CleanupSummary> {
  const withinBudget = () =>
    options.stopClaimingAt === undefined || Date.now() < options.stopClaimingAt;

  let abandoned = 0;
  while (withinBudget()) {
    const n = await abandonStaleReservations();
    abandoned += n;
    if (n === 0) break;
  }
  let expired = 0;
  while (withinBudget()) {
    const n = await expireStaleImages();
    expired += n;
    if (n === 0) break;
  }
  const queue = await consumeDeletionQueue(options);
  return { ...queue, abandoned, expired };
}
