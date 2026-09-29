import type { Prisma } from '@/generated/prisma/client';

// Fila de exclusao de objetos do R2 (media-pipeline-contract.md, secao 13).
// A pendencia e inserida NA MESMA TRANSACAO do fato que torna o objeto
// descartavel; a insercao e idempotente pela unicidade parcial
// `media_object_deletions_pending_key`. O consumidor que apaga os objetos e o
// job horario de F2-009 (#47); esta entrega so produz as pendencias.

export type MediaDeletionReason =
  | 'source_processed'
  | 'source_failed'
  | 'source_abandoned'
  | 'derivative_orphan'
  | 'image_removed'
  | 'retention_purge';

export async function enqueueDeletions(
  tx: Prisma.TransactionClient,
  keys: string[],
  reason: MediaDeletionReason,
): Promise<void> {
  for (const key of new Set(keys)) {
    await tx.$executeRaw`
      INSERT INTO "media_object_deletions" ("id", "object_key", "reason", "due_at")
      VALUES (gen_random_uuid(), ${key}, ${reason}::"media_deletion_reason", now())
      ON CONFLICT ("object_key") WHERE "completed_at" IS NULL DO NOTHING`;
  }
}
