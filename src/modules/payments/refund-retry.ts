import type { ConfirmationDeps } from './confirmation';
import {
  claimInTransaction,
  runClaimLoop,
  type ClaimHooks,
  type JobLoopCounts,
  type JobLoopOptions,
} from './jobs';
import { processTechnicalRefund, REFUND_BACKOFF_CAP_HOURS, type RefundRunOutcome } from './refund';

// Retentativa de reembolso tecnico (F3-008, #98; PD-3.4, PD-3.5, PD-8.5, PD-8.6).
// Cadencia contratual HORARIA, com recuo exponencial POR CASO persistido em
// `technical_refunds.next_attempt_at` (refund.ts). Reclama `pendente` e
// `falhou_retentando` vencidos por `SKIP LOCKED` (jobs.ts) e chama
// `processTechnicalRefund`, que rele a chave persistida (PD-5.2) e grava o
// desfecho condicionado a o reembolso ainda estar aberto. Nenhum caso fecha sem
// desfecho real: esgotar tentativas leva a `pendente_operacional` com o caso
// `reembolso_pendente` aberto e visivel.

export interface RefundRetrySummary extends JobLoopCounts {
  concluded: number;
  retrying: number;
  operational: number;
  inconsistent: number;
  skipped: number;
}

export interface RefundRetryOptions extends JobLoopOptions {
  deps?: ConfirmationDeps;
  hooks?: ClaimHooks;
}

/**
 * Reclama um lote vencido. O instante reclamado e o mesmo recuo que a falha
 * desta tentativa gravaria (2^tentativas horas, teto de 24 h): uma execucao que
 * morra no meio nao antecipa a proxima tentativa.
 */
export function claimRefundsForRetry(limit: number, hooks?: ClaimHooks): Promise<string[]> {
  return claimInTransaction(
    (tx) => tx.$queryRaw<{ id: string }[]>`
      WITH c AS MATERIALIZED (
        SELECT "id" FROM "technical_refunds"
        WHERE "status" IN ('pendente', 'falhou_retentando')
          AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= now())
        ORDER BY "next_attempt_at" NULLS FIRST, "created_at", "id"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "technical_refunds" tr
      SET "next_attempt_at" = now() + make_interval(
            hours => LEAST(power(2, LEAST(tr."attempt_count", 5))::int, ${REFUND_BACKOFF_CAP_HOURS}::int))
      FROM c
      WHERE tr."id" = c."id"
      RETURNING tr."id"::text AS "id"`,
    hooks,
  );
}

const BUCKET: Record<RefundRunOutcome, keyof RefundRetrySummary> = {
  concluded: 'concluded',
  already_concluded: 'skipped',
  retrying: 'retrying',
  operational: 'operational',
  inconsistent: 'inconsistent',
  not_found: 'skipped',
};

/** Uma execucao do trabalho. Seguro para execucoes sobrepostas e repetidas. */
export async function runRefundRetry(options: RefundRetryOptions): Promise<RefundRetrySummary> {
  const summary: RefundRetrySummary = {
    claimed: 0,
    concluded: 0,
    retrying: 0,
    operational: 0,
    inconsistent: 0,
    skipped: 0,
    deferred: 0,
    errors: 0,
  };
  const counts = await runClaimLoop(
    options,
    (limit) => claimRefundsForRetry(limit, options.hooks),
    async (refundId) => {
      const outcome = await processTechnicalRefund(refundId, options.deps);
      summary[BUCKET[outcome]] += 1;
    },
    'reembolso',
  );
  return { ...summary, ...counts };
}
