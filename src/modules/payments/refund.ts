import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { recordAuditEvent } from '@/modules/audit';
import { notifyUser } from '@/modules/identity';
import { getPrismaClient } from '@/persistence/prisma';
import { openCaseInTx, type ConfirmationDeps } from './confirmation';
import {
  createMercadoPagoClient,
  MercadoPagoConfigError,
  type MercadoPagoClient,
  type RefundTransaction,
} from './mercado-pago';

// Reembolso tecnico e cancelamento (F3-007, #97; payments-design.md, PD-8.1 a
// PD-8.10; payment-exceptions.md, PE-7). Execucao FORA de transacao e sem trava:
// a hipotese ja foi persistida no ato da classificacao (PD-8.2), e aqui so se
// chama o provedor e se registra o desfecho.
//
// Rota do reembolso, escolhida pelo estado autoritativo da order (PD-8.3):
// - o pagamento e a UNICA transacao da order -> reembolso TOTAL (PE-7.7);
// - o pagamento e UMA de varias transacoes conhecidas da order -> reembolso SO
//   dela, pelo valor cheio (decisao RT-1 do Bruno, 2026-10-01; PE-7.3 lida
//   como "cada pagamento e devolvido por inteiro");
// - o pagamento nao e transacao conhecida da order (por exemplo, so aparece na
//   busca da Payments API) -> `pendente_operacional`, SEM chamada: devolver a
//   order inteira devolveria tambem o canonico.
// Nunca devolve o pagamento canonico de uma tentativa confirmada.
//
// Chave de idempotencia persistida na criacao e RELIDA aqui (PD-5.2); retentar
// e seguro e `order_already_refunded` e sucesso (PE-7.11). Falha nunca e
// escondida nem convertida em direito (PD-8.6): o caso fica aberto e visivel.

export type RefundRunOutcome =
  'concluded' | 'already_concluded' | 'retrying' | 'operational' | 'inconsistent' | 'not_found';

// Retentativa automatica (F3-008, #98; PD-3.4, PD-3.5). Depois da k-esima falha
// transitoria, a proxima tentativa fica para 2^(k-1) horas depois (1 h, 2 h,
// 4 h, 8 h, 16 h e, dai em diante, 24 h), gravado em `next_attempt_at` no mesmo
// UPDATE que registra a falha. Na REFUND_MAX_ATTEMPTS-esima tentativa sem
// sucesso, o reembolso vai a `pendente_operacional` e o caso `reembolso_pendente`
// continua ABERTO: esgotar tentativas nunca fecha caso (PD-3.5, PE-7.10).
//
// 8 tentativas cobrem ~79 h (1+2+4+8+16+24+24) desde a primeira: mais que um
// fim de semana para reposicao de saldo (PE-7.8) e muito mais que um incidente
// tipico do provedor, ainda longe do prazo de 180 dias (PD-8.7). Ajustavel por
// medicao, sem nova decisao (ADR-0006, decisao 12).
export const REFUND_MAX_ATTEMPTS = 8;
export const REFUND_BACKOFF_CAP_HOURS = 24;

// Prazo do provedor para reembolso: 180 dias a partir da aprovacao (PD-8.7,
// MP-5). A referencia oficial nao documenta o codigo dessa recusa (F3-008), entao
// o TROQS confere o prazo ANTES de chamar, pelo instante de acreditacao
// autoritativo ja gravado (`payments.accredited_at`, ADR-0008), contra o
// relogio do banco. Vencido -> `pendente_operacional` imediato e sem chamada:
// retentar e inutil (PD-8.5). O caso continua aberto (PD-3.5). DEC-045.
export const REFUND_WINDOW_DAYS = 180;

/** Recuo depois da k-esima falha (k >= 1), em horas. */
export function refundBackoffHours(failures: number): number {
  return Math.min(2 ** Math.max(failures - 1, 0), REFUND_BACKOFF_CAP_HOURS);
}

interface RefundRow {
  id: string;
  status: string;
  hypothesis: string;
  idempotencyKey: string;
  attemptCount: number;
  providerPaymentId: string;
  amountCents: number;
  isCanonical: boolean;
  attemptId: string;
  attemptStatus: string;
  providerOrderId: string | null;
  /** Quem pagou e o anuncio, para o aviso TE-6 (F3-013, DEC-048). */
  requesterId: string;
  listingId: string;
  /** Aprovacao ha `REFUND_WINDOW_DAYS` dias ou mais, pelo relogio do banco. */
  windowExpired: boolean;
}

async function readRefund(refundId: string): Promise<RefundRow | null> {
  const [row] = await getPrismaClient().$queryRaw<RefundRow[]>`
    SELECT tr."id"::text AS "id", tr."status"::text AS "status",
           tr."hypothesis"::text AS "hypothesis", tr."idempotency_key" AS "idempotencyKey",
           tr."attempt_count" AS "attemptCount",
           p."provider_payment_id" AS "providerPaymentId", p."amount_cents" AS "amountCents",
           p."is_canonical" AS "isCanonical",
           pa."id"::text AS "attemptId", pa."status"::text AS "attemptStatus",
           pa."provider_order_id" AS "providerOrderId",
           cr."requester_id"::text AS "requesterId", cr."listing_id"::text AS "listingId",
           COALESCE(p."accredited_at" <= now() - make_interval(days => ${REFUND_WINDOW_DAYS}::int),
                    false) AS "windowExpired"
    FROM "technical_refunds" tr
    JOIN "payments" p ON p."id" = tr."payment_id"
    JOIN "payment_attempts" pa ON pa."id" = p."payment_attempt_id"
    JOIN "contact_requests" cr ON cr."id" = pa."contact_request_id"
    WHERE tr."id" = ${refundId}::uuid`;
  return row ?? null;
}

type Next = 'concluido' | 'falhou_retentando' | 'pendente_operacional';

/**
 * Registra UMA tentativa e o desfecho, condicionado a o reembolso ainda estar
 * aberto: execucoes concorrentes nao reabrem um reembolso concluido. Falha
 * transitoria grava o proximo instante (recuo exponencial) e, na ultima
 * tentativa automatica, vira `pendente_operacional` no MESMO UPDATE. Devolve o
 * estado gravado, ou `null` se o reembolso ja nao estava aberto.
 */
async function recordAttempt(
  refund: RefundRow,
  next: Next,
  result: string,
  extra: { providerRefundId?: string | null; inconsistency?: string } = {},
): Promise<Next | null> {
  return getPrismaClient().$transaction(async (tx) => {
    const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;
    const [row] = await tx.$queryRaw<{ status: Next; exhausted: boolean }[]>`
      UPDATE "technical_refunds"
      SET "status" = (CASE
            WHEN ${next}::text = 'falhou_retentando'
              AND "attempt_count" + 1 >= ${REFUND_MAX_ATTEMPTS}::int
              THEN 'pendente_operacional'
            ELSE ${next}::text END)::"technical_refund_status",
          "attempt_count" = "attempt_count" + 1,
          "last_attempt_at" = ${at},
          "last_attempt_result" = ${result.slice(0, 64)},
          "next_attempt_at" = (CASE
            WHEN ${next}::text = 'falhou_retentando'
              AND "attempt_count" + 1 < ${REFUND_MAX_ATTEMPTS}::int
              THEN ${at}::timestamptz + make_interval(
                hours => LEAST(power(2, LEAST("attempt_count", 5))::int, ${REFUND_BACKOFF_CAP_HOURS}::int))
            ELSE NULL END),
          "provider_refund_id" = COALESCE(${extra.providerRefundId ?? null}, "provider_refund_id"),
          "concluded_at" = ${next === 'concluido' ? at : null},
          "updated_at" = ${at}
      WHERE "id" = ${refund.id}::uuid AND "status" IN ('pendente', 'falhou_retentando')
      RETURNING "status"::text AS "status",
                (${next}::text = 'falhou_retentando' AND "status" = 'pendente_operacional') AS "exhausted"`;
    if (!row) return null;
    await recordAuditEvent(tx, {
      eventType: 'payment.refund_attempted',
      actorId: null,
      targetType: 'technical_refund',
      targetId: refund.id,
      result: next === 'concluido' ? 'success' : 'failure',
      occurredAt: at,
      details: {
        hypothesis: refund.hypothesis,
        status: row.status,
        result: result.slice(0, 64),
        ...(row.exhausted ? { exhausted: true, maxAttempts: REFUND_MAX_ATTEMPTS } : {}),
      },
    });
    if (extra.inconsistency) {
      await openCaseInTx(tx, {
        attemptId: refund.attemptId,
        kind: 'inconsistente',
        reason: extra.inconsistency,
        at,
      });
    }
    if (next === 'concluido') await settleAttempt(tx, refund, at);
    return row.status;
  });
}

/** Falha transitoria: retenta com recuo, ou escala se esta era a ultima tentativa. */
async function recordTransientFailure(
  refund: RefundRow,
  result: string,
): Promise<RefundRunOutcome> {
  const status = await recordAttempt(refund, 'falhou_retentando', result);
  return status === 'pendente_operacional' ? 'operational' : 'retrying';
}

/**
 * Desfecho real (PD-2.4): fecha o caso `reembolso_pendente` da hipotese quando
 * todos os reembolsos dela concluiram e, se a tentativa inteira era excecao,
 * `reembolso_pendente` -> `reembolsada_ou_revertida`. Uma tentativa confirmada
 * com excedente devolvido continua `pagamento_confirmado` (PE-3.2).
 */
async function settleAttempt(
  tx: Prisma.TransactionClient,
  refund: RefundRow,
  at: Date,
): Promise<void> {
  const [{ open }] = await tx.$queryRaw<{ open: number }[]>`
    SELECT count(*)::int AS "open" FROM "technical_refunds" tr
    JOIN "payments" p ON p."id" = tr."payment_id"
    WHERE p."payment_attempt_id" = ${refund.attemptId}::uuid
      AND tr."hypothesis" = ${refund.hypothesis}::"technical_refund_hypothesis"
      AND tr."status" <> 'concluido'`;
  if (open === 0) {
    await tx.$executeRaw`
      UPDATE "reconciliation_cases"
      SET "closed_at" = ${at}, "outcome" = 'refunded', "updated_at" = ${at}
      WHERE "payment_attempt_id" = ${refund.attemptId}::uuid AND "kind" = 'reembolso_pendente'
        AND "reason" = ${refund.hypothesis} AND "closed_at" IS NULL`;
  }
  const [{ pending }] = await tx.$queryRaw<{ pending: number }[]>`
    SELECT count(*)::int AS "pending" FROM "technical_refunds" tr
    JOIN "payments" p ON p."id" = tr."payment_id"
    WHERE p."payment_attempt_id" = ${refund.attemptId}::uuid AND tr."status" <> 'concluido'`;
  if (pending === 0) {
    await tx.$executeRaw`
      UPDATE "payment_attempts"
      SET "status" = 'reembolsada_ou_revertida', "updated_at" = ${at}
      WHERE "id" = ${refund.attemptId}::uuid AND "status" = 'reembolso_pendente'`;
  }
}

/** Executa (ou retenta) um reembolso tecnico. Seguro para reexecucao e concorrencia. */
export async function processTechnicalRefund(
  refundId: string,
  deps: ConfirmationDeps = {},
): Promise<RefundRunOutcome> {
  const refund = await readRefund(refundId);
  if (!refund) return 'not_found';
  if (refund.status === 'concluido') return 'already_concluded';
  if (refund.status === 'pendente_operacional') return 'operational';
  if (refund.attemptCount >= REFUND_MAX_ATTEMPTS) {
    // Tentativas automaticas ja esgotadas (por exemplo, execucao interrompida
    // depois da ultima): escala sem chamar o provedor de novo. Caso aberto.
    await escalateExhaustedRefund(refund);
    return 'operational';
  }

  // Nunca devolve o canonico de uma solicitacao paga (PE-3.2, PD-7.3).
  if (refund.isCanonical && refund.attemptStatus === 'pagamento_confirmado') {
    await recordAttempt(refund, 'pendente_operacional', 'canonical_protected', {
      inconsistency: 'refund_of_canonical',
    });
    return 'inconsistent';
  }
  if (refund.windowExpired) {
    // Limite do provedor, nao inconsistencia: so o desfecho manual resta.
    await recordAttempt(refund, 'pendente_operacional', 'refund_window_expired');
    return 'operational';
  }
  if (!refund.providerOrderId) {
    await recordAttempt(refund, 'pendente_operacional', 'order_unknown');
    return 'operational';
  }

  const gateway: MercadoPagoClient = deps.gateway ?? createMercadoPagoClient();
  try {
    const order = await gateway.getOrder(refund.providerOrderId);
    if (!order.ok) {
      if (order.kind === 'not_found') {
        await recordAttempt(refund, 'pendente_operacional', 'order_not_found', {
          inconsistency: 'refund_order_not_found',
        });
        return 'inconsistent';
      }
      return recordTransientFailure(refund, `order_${order.kind}`);
    }

    const transactions = order.value.payments.map((p) => p.providerPaymentId);
    if (!transactions.includes(refund.providerPaymentId)) {
      // Decisao RT-1: sem identificar a transacao com seguranca, nao ha chamada.
      await recordAttempt(refund, 'pendente_operacional', 'transaction_not_identifiable');
      return 'operational';
    }
    // Reembolso total so quando a order tem uma unica transacao E a tentativa
    // nao e uma solicitacao paga (senao devolveria o pagamento valido).
    const single = transactions.length === 1;
    if (single && refund.attemptStatus === 'pagamento_confirmado') {
      await recordAttempt(refund, 'pendente_operacional', 'total_refund_would_hit_canonical', {
        inconsistency: 'refund_of_canonical',
      });
      return 'inconsistent';
    }
    const transaction: RefundTransaction | undefined = single
      ? undefined
      : { providerTransactionId: refund.providerPaymentId, amountCents: refund.amountCents };

    const result = await gateway.refundOrder(
      refund.providerOrderId,
      refund.idempotencyKey,
      transaction,
    );
    if (result.ok) {
      const recorded = await recordAttempt(
        refund,
        'concluido',
        result.value.alreadyRefunded ? 'order_already_refunded' : 'refunded',
        { providerRefundId: result.value.providerRefundId },
      );
      // TE-6, depois do COMMIT e so por quem gravou a conclusao (F3-013,
      // DEC-048). Execucao concorrente que perdeu o UPDATE recebe `null` e nao
      // avisa. `notifyUser` nunca lanca.
      if (recorded === 'concluido') {
        await notifyUser({
          kind: 'refund_concluded',
          recipientId: refund.requesterId,
          technicalRefundId: refund.id,
          listingId: refund.listingId,
        });
      }
      return 'concluded';
    }
    if (result.kind === 'unavailable' && result.reason === 'cannot_refund') {
      // DEC-045: a sandbox devolve `cannot_refund_order` tambem para order nao
      // acreditada ou cancelada (2026-10-01). So com a order ACREDITADA, lida
      // acima, a recusa e tratada como saldo insuficiente (transitorio, PE-7.8);
      // em qualquer outro estado e definitiva e abre inconsistencia (PD-8.5).
      if (order.value.state.kind === 'accredited') {
        return recordTransientFailure(refund, 'refund_cannot_refund');
      }
      await recordAttempt(refund, 'pendente_operacional', 'refund_rejected_cannot_refund_order', {
        inconsistency: 'refund_rejected_cannot_refund_order',
      });
      return 'inconsistent';
    }
    if (result.kind === 'unavailable') {
      return recordTransientFailure(refund, `refund_${result.reason}`);
    }
    // PD-8.5: `order_not_found` e erro nao mapeado abrem inconsistencia. Os
    // codigos de saldo insuficiente e de 180 dias NAO constam da lista de erros
    // oficial de `POST /v1/orders/{id}/refund` (conferida em 2026-10-01, F3-008).
    // DEC-045: o prazo e conferido acima, antes da chamada, e a recusa generica
    // documentada `cannot_refund_order` chega como `unavailable` (retentativa).
    // Qualquer outro codigo cai aqui.
    const code = result.kind === 'not_found' ? 'order_not_found' : result.code;
    await recordAttempt(refund, 'pendente_operacional', `refund_rejected_${code}`, {
      inconsistency: `refund_rejected_${code}`.slice(0, 64),
    });
    return 'inconsistent';
  } catch (err) {
    if (err instanceof MercadoPagoConfigError) {
      return recordTransientFailure(refund, 'configuration');
    }
    throw err;
  }
}

/** Escala para `pendente_operacional` sem nova chamada; o caso continua aberto. */
async function escalateExhaustedRefund(refund: RefundRow): Promise<void> {
  await getPrismaClient().$transaction(async (tx) => {
    const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;
    const updated = await tx.$executeRaw`
      UPDATE "technical_refunds"
      SET "status" = 'pendente_operacional', "next_attempt_at" = NULL, "updated_at" = ${at}
      WHERE "id" = ${refund.id}::uuid AND "status" IN ('pendente', 'falhou_retentando')`;
    if (updated === 0) return;
    await recordAuditEvent(tx, {
      eventType: 'payment.refund_attempted',
      actorId: null,
      targetType: 'technical_refund',
      targetId: refund.id,
      result: 'failure',
      occurredAt: at,
      details: {
        hypothesis: refund.hypothesis,
        status: 'pendente_operacional',
        result: 'retries_exhausted',
        exhausted: true,
        maxAttempts: REFUND_MAX_ATTEMPTS,
      },
    });
  });
}

/** Primeira tentativa (ou retentativa) de todos os reembolsos abertos da tentativa. */
export async function processRefundsForAttempt(
  attemptId: string,
  deps: ConfirmationDeps = {},
): Promise<RefundRunOutcome[]> {
  const refunds = await getPrismaClient().$queryRaw<{ id: string }[]>`
    SELECT tr."id"::text AS "id" FROM "technical_refunds" tr
    JOIN "payments" p ON p."id" = tr."payment_id"
    WHERE p."payment_attempt_id" = ${attemptId}::uuid
      AND tr."status" IN ('pendente', 'falhou_retentando')
    ORDER BY tr."created_at", tr."id"`;
  const outcomes: RefundRunOutcome[] = [];
  for (const refund of refunds) outcomes.push(await processTechnicalRefund(refund.id, deps));
  return outcomes;
}

// ---------------------------------------------------------------------------
// Cancelamento (PD-8.3, PD-8.10): nao e reembolso e nao e excecao tecnica
// ---------------------------------------------------------------------------

export type CancelOutcome =
  | 'canceled'
  | 'not_applicable'
  | 'no_order'
  | 'accredited'
  | 'already_terminal'
  | 'unavailable'
  | 'rejected';

interface CancelRow {
  id: string;
  status: string;
  providerOrderId: string | null;
}

/** Chave do cancelamento: gerada na primeira vez e RELIDA depois (PD-5.2). */
async function cancelKey(attemptId: string): Promise<string> {
  const [row] = await getPrismaClient().$queryRaw<{ key: string }[]>`
    UPDATE "payment_attempts"
    SET "cancel_idempotency_key" = COALESCE("cancel_idempotency_key", ${randomUUID()})
    WHERE "id" = ${attemptId}::uuid
    RETURNING "cancel_idempotency_key" AS "key"`;
  return row.key;
}

/**
 * Cancela a order SEM acreditacao da tentativa de uma solicitacao ja encerrada
 * (T5/T6; PD-8.10). So `created`/`action_required` sao cancelaveis (MP-6). Se a
 * order ja acreditou, devolve `accredited`: quem chama aplica a confirmacao,
 * que classifica RT-3. Nunca cria `TechnicalRefund`.
 */
export async function cancelUnaccreditedCharge(
  contactRequestId: string,
  deps: ConfirmationDeps = {},
): Promise<{ attemptId: string | null; outcome: CancelOutcome }> {
  const [attempt] = await getPrismaClient().$queryRaw<CancelRow[]>`
    SELECT "id"::text AS "id", "status"::text AS "status",
           "provider_order_id" AS "providerOrderId"
    FROM "payment_attempts" WHERE "contact_request_id" = ${contactRequestId}::uuid`;
  if (!attempt) return { attemptId: null, outcome: 'not_applicable' };
  const result = (outcome: CancelOutcome) => ({ attemptId: attempt.id, outcome });
  if (attempt.status !== 'aguardando_pagamento' && attempt.status !== 'em_confirmacao') {
    return result('not_applicable');
  }
  if (!attempt.providerOrderId) return result('no_order');

  const gateway: MercadoPagoClient = deps.gateway ?? createMercadoPagoClient();
  try {
    const order = await gateway.getOrder(attempt.providerOrderId);
    if (!order.ok) return result(order.kind === 'unavailable' ? 'unavailable' : 'rejected');
    const state = order.value.state;
    if (state.kind === 'accredited' || state.kind === 'reversed' || state.kind === 'unknown') {
      return result('accredited');
    }
    if (state.kind === 'not_accredited_terminal') {
      await markCanceled(attempt, state.outcome);
      return result('already_terminal');
    }

    const canceled = await gateway.cancelOrder(
      attempt.providerOrderId,
      await cancelKey(attempt.id),
    );
    if (!canceled.ok) return result(canceled.kind === 'unavailable' ? 'unavailable' : 'rejected');
    if (canceled.value.state.kind !== 'not_accredited_terminal') return result('rejected');
    await markCanceled(attempt, 'canceled');
    return result('canceled');
  } catch (err) {
    if (err instanceof MercadoPagoConfigError) return result('unavailable');
    throw err;
  }
}

/** Tentativa -> `falha` (ou `expirada`) com auditoria propria; nunca reembolso. */
async function markCanceled(
  attempt: CancelRow,
  outcome: 'expired' | 'canceled' | 'failed',
): Promise<void> {
  await getPrismaClient().$transaction(async (tx) => {
    const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;
    const next = outcome === 'expired' ? 'expirada' : 'falha';
    const updated = await tx.$executeRaw`
      UPDATE "payment_attempts"
      SET "status" = ${next}::"payment_attempt_status", "updated_at" = ${at}
      WHERE "id" = ${attempt.id}::uuid
        AND "status" IN ('aguardando_pagamento', 'em_confirmacao')`;
    if (updated === 0) return;
    await recordAuditEvent(tx, {
      eventType: 'payment.charge_canceled',
      actorId: null,
      targetType: 'payment_attempt',
      targetId: attempt.id,
      result: 'success',
      occurredAt: at,
      details: { providerOrderId: attempt.providerOrderId, outcome, status: next },
    });
  });
}
