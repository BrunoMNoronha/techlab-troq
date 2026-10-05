import { reportSignal } from '@/modules/platform';
import { getPrismaClient } from '@/persistence/prisma';

// Sinais operacionais de pagamentos (F3-013, #103; overview.md, AR-14.3;
// payments-design.md, CI-7, PD-3.5, PD-8.6; ADR-0007, decisoes 3 a 6).
//
// Cada sinal e DERIVADO do estado persistido por uma leitura sem trava e
// enviado como telemetria. Nada aqui decide, fecha ou corrige caso: o estado
// continua no PostgreSQL e os casos continuam abertos ate desfecho real.
// Os atributos sao contagens e idades em horas; nenhum id, chave, valor,
// pessoa ou resposta do provedor.
//
// Limiares de alerta sao design, ajustaveis por medicao sem ADR (ADR-0007,
// politica de evolucao).

/** Reembolso pendente ha mais que isto vira alerta (CI-7). */
export const REFUND_PENDING_ALERT_HOURS = 24;
/** Tentativa nao terminal ha mais que isto: reconciliacao travada (AR-14.3). */
export const STALE_ATTEMPT_HOURS = 2;
/** Janela da contagem de notificacoes rejeitadas por autenticidade. */
export const REJECTED_NOTIFICATION_WINDOW_HOURS = 24;
/**
 * Acima disto, na janela, e "acima do normal" (PE-6.3). O normal e zero: o
 * provedor assina toda notificacao legitima.
 */
export const REJECTED_NOTIFICATION_ALERT = 10;

export interface PaymentSignalSnapshot {
  refundPending: number;
  refundPendingOverdue: number;
  refundPendingOperational: number;
  refundPendingOldestHours: number;
  inconsistentOpen: number;
  inconsistentOldestHours: number;
  attemptsStale: number;
  attemptsStaleOldestHours: number;
  notificationsRejected: number;
}

interface SnapshotRow {
  refundPending: bigint;
  refundPendingOverdue: bigint;
  refundPendingOperational: bigint;
  refundPendingOldestHours: number | null;
  inconsistentOpen: bigint;
  inconsistentOldestHours: number | null;
  attemptsStale: bigint;
  attemptsStaleOldestHours: number | null;
  notificationsRejected: bigint;
}

/** Leitura sem trava do estado persistido, com o relogio do banco. */
export async function readPaymentSignals(): Promise<PaymentSignalSnapshot> {
  const [row] = await getPrismaClient().$queryRaw<SnapshotRow[]>`
    WITH refunds AS (
      SELECT "status", "created_at" FROM "technical_refunds"
      WHERE "status" IN ('pendente', 'falhou_retentando', 'pendente_operacional')
    ), inconsistent AS (
      SELECT "opened_at" FROM "reconciliation_cases"
      WHERE "kind" = 'inconsistente' AND "closed_at" IS NULL
    ), stale AS (
      SELECT "created_at" FROM "payment_attempts"
      WHERE "status" IN ('tentativa_criada', 'aguardando_pagamento', 'em_confirmacao')
        AND "created_at" < now() - make_interval(hours => ${STALE_ATTEMPT_HOURS}::int)
    )
    SELECT
      (SELECT count(*) FROM refunds) AS "refundPending",
      (SELECT count(*) FROM refunds
        WHERE "created_at" < now() - make_interval(hours => ${REFUND_PENDING_ALERT_HOURS}::int))
        AS "refundPendingOverdue",
      (SELECT count(*) FROM refunds WHERE "status" = 'pendente_operacional')
        AS "refundPendingOperational",
      (SELECT EXTRACT(EPOCH FROM now() - min("created_at"))::float8 / 3600 FROM refunds)
        AS "refundPendingOldestHours",
      (SELECT count(*) FROM inconsistent) AS "inconsistentOpen",
      (SELECT EXTRACT(EPOCH FROM now() - min("opened_at"))::float8 / 3600 FROM inconsistent)
        AS "inconsistentOldestHours",
      (SELECT count(*) FROM stale) AS "attemptsStale",
      (SELECT EXTRACT(EPOCH FROM now() - min("created_at"))::float8 / 3600 FROM stale)
        AS "attemptsStaleOldestHours",
      (SELECT count(*) FROM "audit_events"
        WHERE "event_type" = 'payment.notification_rejected'
          AND "occurred_at" >= now() - make_interval(hours => ${REJECTED_NOTIFICATION_WINDOW_HOURS}::int))
        AS "notificationsRejected"`;

  const hours = (value: number | null) => (value === null ? 0 : Math.floor(value));
  return {
    refundPending: Number(row.refundPending),
    refundPendingOverdue: Number(row.refundPendingOverdue),
    refundPendingOperational: Number(row.refundPendingOperational),
    refundPendingOldestHours: hours(row.refundPendingOldestHours),
    inconsistentOpen: Number(row.inconsistentOpen),
    inconsistentOldestHours: hours(row.inconsistentOldestHours),
    attemptsStale: Number(row.attemptsStale),
    attemptsStaleOldestHours: hours(row.attemptsStaleOldestHours),
    notificationsRejected: Number(row.notificationsRejected),
  };
}

/**
 * Emite os sinais de AR-14.3 que pertencem a pagamentos. Cada um sai como log
 * estruturado sempre — inclusive com zero, para que "nada pendente" seja
 * distinguivel de "ninguem olhou" — e como alerta quando passa do limiar.
 */
export function emitPaymentSignals(snapshot: PaymentSignalSnapshot): void {
  reportSignal(
    'payments.refund_pending',
    {
      count: snapshot.refundPending,
      overdue: snapshot.refundPendingOverdue,
      operational: snapshot.refundPendingOperational,
      oldest_hours: snapshot.refundPendingOldestHours,
      threshold_hours: REFUND_PENDING_ALERT_HOURS,
    },
    { alert: snapshot.refundPendingOverdue > 0 || snapshot.refundPendingOperational > 0 },
  );
  reportSignal(
    'payments.inconsistent_open',
    { count: snapshot.inconsistentOpen, oldest_hours: snapshot.inconsistentOldestHours },
    { alert: snapshot.inconsistentOpen > 0 },
  );
  reportSignal(
    'payments.attempt_stale',
    {
      count: snapshot.attemptsStale,
      oldest_hours: snapshot.attemptsStaleOldestHours,
      threshold_hours: STALE_ATTEMPT_HOURS,
    },
    { alert: snapshot.attemptsStale > 0 },
  );
  reportSignal(
    'payments.notification_rejected',
    {
      count: snapshot.notificationsRejected,
      window_hours: REJECTED_NOTIFICATION_WINDOW_HOURS,
      threshold: REJECTED_NOTIFICATION_ALERT,
    },
    { alert: snapshot.notificationsRejected > REJECTED_NOTIFICATION_ALERT },
  );
}

/** Le e emite. Nunca lanca: a falha da leitura vira sinal de falha de trabalho. */
export async function reportPaymentSignals(): Promise<PaymentSignalSnapshot | null> {
  try {
    const snapshot = await readPaymentSignals();
    emitPaymentSignals(snapshot);
    return snapshot;
  } catch (err) {
    console.error('[payments] falha ao ler os sinais operacionais', {
      error: err instanceof Error ? err.name : 'unknown',
    });
    reportSignal(
      'jobs.failure',
      { job: 'payments-signals', error: err instanceof Error ? err.name.toLowerCase() : 'unknown' },
      { alert: true, level: 'error' },
    );
    return null;
  }
}
