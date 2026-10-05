import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { recordAuditEvent } from '@/modules/audit';
import { reportSignal } from '@/modules/platform';
import { getPrismaClient } from '@/persistence/prisma';
import { REQUEST_PRICE_CENTS } from './charge';
import {
  classifyAccreditation,
  createMercadoPagoClient,
  MercadoPagoConfigError,
  type AccreditedPayment,
  type MercadoPagoClient,
  type NotificationRejection,
  type OrderSnapshot,
  type ReversalReason,
} from './mercado-pago';

// Notificacao e confirmacao do pagamento (F3-006, #96; payments-design.md,
// PD-6.1 a PD-6.11; ADR-0008). `payments` e dono do dinheiro e da tentativa
// (AR-3.5): aqui ficam o registro da notificacao, a leitura do estado
// autoritativo e as transicoes da tentativa. O efeito sobre a VAGA e decidido
// por `request`, que chama as transicoes `*InTx` dentro da sua transacao, sob a
// trava do anuncio.
//
// Idempotencia no EFEITO, nao na entrega (PD-5.4): `Payment` unico pelo id do
// provedor, transicao por UPDATE condicionado ao estado de origem e canonico
// condicionado a nao haver outro. `PaymentNotification` e auditoria e
// diagnostico, nunca corretude.
//
// Nada daqui grava assinatura, segredo, corpo da notificacao, token ou dado
// pessoal em log, auditoria ou telemetria (PD-6.2, DM-11.2).

/** Identificador tecnico aceito em auditoria; qualquer outro vira `null`. */
const SAFE_ID = /^[A-Za-z0-9._:-]{1,64}$/;

function safeId(value: string | null): string | null {
  return value && SAFE_ID.test(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Receptor
// ---------------------------------------------------------------------------

/**
 * Registro minimo da notificacao REJEITADA (PD-6.2, nota DV-5): so motivo e
 * correlacao tecnica, ator nulo. Nunca assinatura, `ts`, corpo, cabecalhos ou
 * segredo. Falha aqui nao muda a resposta ao provedor.
 */
export async function recordRejectedNotification(input: {
  reason: NotificationRejection;
  providerRequestId: string | null;
  providerDataId: string | null;
}): Promise<void> {
  // Log por ocorrencia, so com o motivo codificado; o alerta por janela sai de
  // ./signals.ts (AR-14.3, F3-013).
  reportSignal('payments.notification_rejected', { reason: input.reason, count: 1 });
  try {
    await getPrismaClient().$transaction((tx) =>
      recordAuditEvent(tx, {
        eventType: 'payment.notification_rejected',
        actorId: null,
        targetType: 'payment_notification',
        targetId: null,
        result: 'rejected',
        details: {
          reason: input.reason,
          providerRequestId: safeId(input.providerRequestId),
          providerDataId: safeId(input.providerDataId),
        },
      }),
    );
  } catch (err) {
    console.error('[payments] falha ao registrar notificacao rejeitada', {
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
}

export interface RegisteredNotification {
  notificationId: string;
  /** Tentativa correlacionada pela order, ou `null` se a order e desconhecida. */
  attemptId: string | null;
}

/**
 * Notificacao VALIDADA (PD-6.3): numa transacao curta, registra a notificacao,
 * correlaciona pela order e marca a tentativa como pendente de confirmacao
 * (`aguardando_pagamento` -> `em_confirmacao`). Nao decide a verdade.
 */
export async function registerNotification(input: {
  providerOrderId: string | null;
  providerRequestId: string | null;
}): Promise<RegisteredNotification> {
  return getPrismaClient().$transaction(async (tx) => {
    const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;
    const orderId = input.providerOrderId;
    // O `data.id` chega no caixa do provedor; a order foi gravada como a criacao
    // a devolveu. A correlacao ignora o caixa, como o manifesto (PD-6.1).
    const [attempt] = orderId
      ? await tx.$queryRaw<{ id: string }[]>`
          SELECT "id"::text AS "id" FROM "payment_attempts"
          WHERE lower("provider_order_id") = lower(${orderId})`
      : [];
    const notification = await tx.paymentNotification.create({
      data: {
        paymentAttemptId: attempt?.id ?? null,
        providerRequestId: safeId(input.providerRequestId) ?? 'ausente',
        providerDataId: safeId(orderId) ?? 'ausente',
        receivedAt: at,
      },
      select: { id: true },
    });
    if (attempt) {
      await tx.$executeRaw`
        UPDATE "payment_attempts" SET "status" = 'em_confirmacao', "updated_at" = ${at}
        WHERE "id" = ${attempt.id}::uuid AND "status" = 'aguardando_pagamento'`;
    }
    return { notificationId: notification.id, attemptId: attempt?.id ?? null };
  });
}

/** Resultado do processamento, para diagnostico (PD-2.4). */
export async function markNotificationProcessed(
  notificationId: string,
  result: string,
): Promise<void> {
  try {
    await getPrismaClient().$executeRaw`
      UPDATE "payment_notifications"
      SET "processed_at" = now(), "processing_result" = ${result.slice(0, 64)}
      WHERE "id" = ${notificationId}::uuid`;
  } catch (err) {
    console.error('[payments] falha ao marcar notificacao processada', {
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
}

// ---------------------------------------------------------------------------
// Estado autoritativo
// ---------------------------------------------------------------------------

/** Fato de pagamento em termos do TROQ, entregue a `request` (AR-3.5). */
export type PaymentFact =
  /** Sem consulta conclusiva: nada muda, segue em reconciliacao (PD-6.9). */
  | { kind: 'unavailable'; reason: string }
  /** A tentativa ainda nao tem order registrada (passo 3 de PD-4.1 pendente). */
  | { kind: 'no_order' }
  | { kind: 'accredited'; accreditedAt: Date; providerPaymentId: string }
  | { kind: 'pending' }
  | { kind: 'not_accredited_terminal'; outcome: 'expired' | 'canceled' | 'failed' }
  /** Devolucao ou contestacao (PD-9.1), com o codigo do estado que a caracterizou. */
  | { kind: 'reversed'; reason: ReversalReason }
  /**
   * Mais de um pagamento acreditado (PD-7): os candidatos validados da busca,
   * cada um com o instante autoritativo, ja espelhados em `Payment`.
   */
  | { kind: 'multiple_accredited'; payments: AccreditedPayment[] }
  /** Desconhecido, ausente ou contraditorio: nunca aprovado (PD-3.6, CI-9). */
  | { kind: 'inconsistent'; reason: string };

export interface ObservedAttempt {
  attemptId: string;
  contactRequestId: string;
  fact: PaymentFact;
}

export interface ConfirmationDeps {
  /** Somente para teste e para o orcamento do receptor; o padrao e o cliente real. */
  gateway?: MercadoPagoClient;
}

interface AttemptRow {
  id: string;
  contactRequestId: string;
  externalReference: string;
  providerOrderId: string | null;
}

async function readAttempt(attemptId: string): Promise<AttemptRow | null> {
  const rows = await getPrismaClient().$queryRaw<AttemptRow[]>`
    SELECT "id"::text AS "id", "contact_request_id"::text AS "contactRequestId",
           "external_reference" AS "externalReference",
           "provider_order_id" AS "providerOrderId"
    FROM "payment_attempts" WHERE "id" = ${attemptId}::uuid`;
  return rows[0] ?? null;
}

/**
 * Espelha em `Payment` cada pagamento reportado (PD-6.6, passo 2; PD-2.2), por
 * `INSERT ... ON CONFLICT` no id do provedor (DM-7.3): notificacoes concorrentes
 * do mesmo pagamento nao colidem. Um pagamento ja ligado a OUTRA tentativa nao e
 * tocado e e contradicao.
 */
async function mirrorPayments(
  attempt: AttemptRow,
  snapshot: OrderSnapshot,
  accreditation: { providerPaymentId: string; accreditedAt: Date } | null,
): Promise<'ok' | 'foreign_payment'> {
  return getPrismaClient().$transaction(async (tx) => {
    const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;
    for (const payment of snapshot.payments) {
      const accreditedAt =
        accreditation?.providerPaymentId === payment.providerPaymentId
          ? accreditation.accreditedAt
          : null;
      const mirrored = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "payments" (
          "id", "payment_attempt_id", "provider_payment_id", "amount_cents",
          "provider_status", "provider_status_detail", "accredited_at",
          "first_observed_at", "last_observed_at", "created_at", "updated_at")
        VALUES (
          ${randomUUID()}::uuid, ${attempt.id}::uuid, ${payment.providerPaymentId},
          ${payment.amountCents ?? 0}, ${payment.providerStatus}, ${payment.providerStatusDetail},
          ${accreditedAt}, ${at}, ${at}, ${at}, ${at})
        ON CONFLICT ("provider_payment_id") DO UPDATE SET
          "provider_status" = EXCLUDED."provider_status",
          "provider_status_detail" = EXCLUDED."provider_status_detail",
          "accredited_at" = COALESCE(EXCLUDED."accredited_at", "payments"."accredited_at"),
          "last_observed_at" = EXCLUDED."last_observed_at",
          "updated_at" = EXCLUDED."updated_at"
        WHERE "payments"."payment_attempt_id" = EXCLUDED."payment_attempt_id"
        RETURNING "id"::text AS "id"`;
      if (mirrored.length === 0) return 'foreign_payment';
    }
    return 'ok';
  });
}

/**
 * Espelha os pagamentos aprovados da BUSCA (ids numericos da Payments API) na
 * duplicidade. Sao fatos distintos das transacoes da order (`PAY01...`); o
 * vinculo entre os dois nao e documentado, e por isso o excedente so e
 * devolvido por transacao quando ele E uma transacao conhecida da order
 * (decisao RT-1, F3-007).
 */
async function mirrorSearchPayments(
  attempt: AttemptRow,
  payments: AccreditedPayment[],
): Promise<'ok' | 'foreign_payment'> {
  return getPrismaClient().$transaction(async (tx) => {
    const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;
    for (const payment of payments) {
      const mirrored = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "payments" (
          "id", "payment_attempt_id", "provider_payment_id", "amount_cents",
          "provider_status", "provider_status_detail", "accredited_at",
          "first_observed_at", "last_observed_at", "created_at", "updated_at")
        VALUES (
          ${randomUUID()}::uuid, ${attempt.id}::uuid, ${payment.providerPaymentId},
          ${REQUEST_PRICE_CENTS}, 'approved', 'accredited', ${payment.accreditedAt},
          ${at}, ${at}, ${at}, ${at})
        ON CONFLICT ("provider_payment_id") DO UPDATE SET
          "last_observed_at" = EXCLUDED."last_observed_at",
          "updated_at" = EXCLUDED."updated_at"
        WHERE "payments"."payment_attempt_id" = EXCLUDED."payment_attempt_id"
        RETURNING "id"::text AS "id"`;
      if (mirrored.length === 0) return 'foreign_payment';
    }
    return 'ok';
  });
}

async function readFact(attempt: AttemptRow, gateway: MercadoPagoClient): Promise<PaymentFact> {
  if (!attempt.providerOrderId) return { kind: 'no_order' };

  const order = await gateway.getOrder(attempt.providerOrderId);
  if (!order.ok) {
    if (order.kind === 'not_found') return { kind: 'inconsistent', reason: 'order_not_found' };
    // 4xx de credencial ou formato nao e fato sobre o pagamento: nada muda.
    return {
      kind: 'unavailable',
      reason: order.kind === 'unavailable' ? order.reason : `rejected_${order.code}`,
    };
  }
  const snapshot = order.value;
  if (snapshot.externalReference !== attempt.externalReference) {
    return { kind: 'inconsistent', reason: 'order_reference_mismatch' };
  }
  if (snapshot.payments.some((p) => p.amountCents === null)) {
    return { kind: 'inconsistent', reason: 'payment_amount_unmapped' };
  }

  const state = snapshot.state;
  if (state.kind !== 'accredited') {
    if ((await mirrorPayments(attempt, snapshot, null)) === 'foreign_payment') {
      return { kind: 'inconsistent', reason: 'payment_of_other_attempt' };
    }
    switch (state.kind) {
      case 'pending':
        return { kind: 'pending' };
      case 'not_accredited_terminal':
        return { kind: 'not_accredited_terminal', outcome: state.outcome };
      case 'reversed':
        return { kind: 'reversed', reason: state.reason };
      case 'unknown':
        return { kind: 'inconsistent', reason: state.reason };
    }
  }

  // Acreditada pela order: o instante vem da Payments API (ADR-0008).
  const pix = snapshot.payments.filter((p) => p.isPix);
  if (pix.some((p) => p.amountCents !== REQUEST_PRICE_CENTS)) {
    return { kind: 'inconsistent', reason: 'order_amount_mismatch' };
  }
  const [pixPayment] = pix;
  const search = await gateway.findPaymentAccreditation(attempt.externalReference);
  if (!search.ok) {
    return {
      kind: 'unavailable',
      reason:
        search.kind === 'unavailable'
          ? `search_${search.reason}`
          : search.kind === 'not_found'
            ? 'search_not_found'
            : `search_rejected_${search.code}`,
    };
  }
  const verdict = classifyAccreditation(search.value, {
    externalReference: attempt.externalReference,
    amountCents: REQUEST_PRICE_CENTS,
  });
  switch (verdict.kind) {
    case 'absent':
      // Atraso de indexacao possivel: indisponibilidade, nunca recusa (ADR-0008, 4).
      return { kind: 'unavailable', reason: 'search_absent' };
    case 'multiple': {
      if ((await mirrorPayments(attempt, snapshot, null)) === 'foreign_payment') {
        return { kind: 'inconsistent', reason: 'payment_of_other_attempt' };
      }
      if ((await mirrorSearchPayments(attempt, verdict.payments)) === 'foreign_payment') {
        return { kind: 'inconsistent', reason: 'payment_of_other_attempt' };
      }
      return { kind: 'multiple_accredited', payments: verdict.payments };
    }
    case 'divergent':
      return { kind: 'inconsistent', reason: verdict.reason };
    case 'approved':
      break;
  }
  // Uma busca com um so aprovado contra uma order com varias transacoes Pix
  // nao diz qual delas acreditou: contradicao, nunca analogia.
  if (pix.length > 1) return { kind: 'inconsistent', reason: 'order_search_mismatch' };
  const accreditation = {
    providerPaymentId: pixPayment.providerPaymentId,
    accreditedAt: verdict.accreditedAt,
  };
  if ((await mirrorPayments(attempt, snapshot, accreditation)) === 'foreign_payment') {
    return { kind: 'inconsistent', reason: 'payment_of_other_attempt' };
  }
  return { kind: 'accredited', ...accreditation };
}

/**
 * Le o estado autoritativo da tentativa (PD-6.6, passos 1 a 3) e espelha os
 * pagamentos. Nao muda estado da tentativa nem da vaga: isso e de
 * `request`, sob a trava. `null` se a tentativa nao existe.
 */
export async function observeAttempt(
  attemptId: string,
  deps: ConfirmationDeps = {},
): Promise<ObservedAttempt | null> {
  const attempt = await readAttempt(attemptId);
  if (!attempt) return null;
  const gateway = deps.gateway ?? createMercadoPagoClient();
  try {
    const fact = await readFact(attempt, gateway);
    return { attemptId: attempt.id, contactRequestId: attempt.contactRequestId, fact };
  } catch (err) {
    if (err instanceof MercadoPagoConfigError) {
      return {
        attemptId: attempt.id,
        contactRequestId: attempt.contactRequestId,
        fact: { kind: 'unavailable', reason: 'configuration' },
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Transicoes da tentativa (sempre na transacao de `request`, sob a trava)
// ---------------------------------------------------------------------------

export type RecognitionOrigin = 'notificacao' | 'reconciliacao';

/** Estado atual da tentativa, lido na transacao do chamador. */
export async function readAttemptStatusInTx(
  tx: Prisma.TransactionClient,
  attemptId: string,
): Promise<string | null> {
  const [row] = await tx.$queryRaw<{ status: string }[]>`
    SELECT "status"::text AS "status" FROM "payment_attempts" WHERE "id" = ${attemptId}::uuid`;
  return row?.status ?? null;
}

/**
 * Acreditacao tempestiva reconhecida (PD-6.6, passo 4): `pagamento_confirmado`
 * com os DOIS instantes e a origem (CI-4, DM-7.5), canonico unico (DM-7.4) e
 * auditoria de aprovacao. `false` se a tentativa ja nao esta aberta.
 */
export async function confirmPaymentInTx(
  tx: Prisma.TransactionClient,
  input: {
    attemptId: string;
    accreditedAt: Date;
    providerPaymentId: string;
    origin: RecognitionOrigin;
    at: Date;
  },
): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE "payment_attempts"
    SET "status" = 'pagamento_confirmado', "accredited_at" = ${input.accreditedAt},
        "recognized_at" = ${input.at},
        "recognition_source" = ${input.origin}::"recognition_source",
        "updated_at" = ${input.at}
    WHERE "id" = ${input.attemptId}::uuid
      AND "status" IN ('aguardando_pagamento', 'em_confirmacao')`;
  if (updated === 0) return false;
  await tx.$executeRaw`
    UPDATE "payments" SET "is_canonical" = true, "updated_at" = ${input.at}
    WHERE "payment_attempt_id" = ${input.attemptId}::uuid
      AND "provider_payment_id" = ${input.providerPaymentId}
      AND NOT EXISTS (
        SELECT 1 FROM "payments"
        WHERE "payment_attempt_id" = ${input.attemptId}::uuid AND "is_canonical")`;
  await recordAuditEvent(tx, {
    eventType: 'payment.approved',
    actorId: null,
    targetType: 'payment_attempt',
    targetId: input.attemptId,
    result: 'success',
    occurredAt: input.at,
    details: {
      providerPaymentId: input.providerPaymentId,
      accreditedAt: input.accreditedAt.toISOString(),
      recognizedAt: input.at.toISOString(),
      recognitionSource: input.origin,
    },
  });
  return true;
}

export async function openCaseInTx(
  tx: Prisma.TransactionClient,
  input: {
    attemptId: string;
    kind: 'pendente' | 'divergencia' | 'reembolso_pendente' | 'inconsistente';
    reason: string;
    at: Date;
    details?: Prisma.InputJsonObject;
  },
): Promise<boolean> {
  const open = await tx.reconciliationCase.count({
    where: {
      paymentAttemptId: input.attemptId,
      kind: input.kind,
      reason: input.reason,
      closedAt: null,
    },
  });
  if (open > 0) return false;
  const created = await tx.reconciliationCase.create({
    data: {
      paymentAttemptId: input.attemptId,
      kind: input.kind,
      reason: input.reason,
      openedAt: input.at,
    },
    select: { id: true },
  });
  await recordAuditEvent(tx, {
    eventType: 'payment.case_opened',
    actorId: null,
    targetType: 'reconciliation_case',
    targetId: created.id,
    result: 'success',
    occurredAt: input.at,
    details: {
      paymentAttemptId: input.attemptId,
      kind: input.kind,
      reason: input.reason,
      ...input.details,
    },
  });
  return true;
}

/**
 * Reembolso tecnico INTEGRAL do pagamento, com a hipotese determinada e
 * persistida no ato da classificacao (PD-8.2, PE-7.2) e a chave de
 * idempotencia gerada AGORA e relida em toda retentativa (PD-5.2). Um por
 * pagamento (DM-7.x): reclassificar nao cria segundo reembolso.
 */
export async function createTechnicalRefundInTx(
  tx: Prisma.TransactionClient,
  input: {
    attemptId: string;
    providerPaymentId: string;
    hypothesis: 'rt_1' | 'rt_2' | 'rt_3';
    at: Date;
  },
): Promise<string | null> {
  const [created] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "technical_refunds" (
      "id", "payment_id", "hypothesis", "idempotency_key", "status", "attempt_count",
      "created_at", "updated_at")
    SELECT ${randomUUID()}::uuid, p."id", ${input.hypothesis}::"technical_refund_hypothesis",
           ${randomUUID()}, 'pendente', 0, ${input.at}, ${input.at}
    FROM "payments" p
    WHERE p."payment_attempt_id" = ${input.attemptId}::uuid
      AND p."provider_payment_id" = ${input.providerPaymentId}
    ON CONFLICT ("payment_id") DO NOTHING
    RETURNING "id"::text AS "id"`;
  if (!created) return null;
  await recordAuditEvent(tx, {
    eventType: 'payment.refund_classified',
    actorId: null,
    targetType: 'technical_refund',
    targetId: created.id,
    result: 'success',
    occurredAt: input.at,
    details: {
      paymentAttemptId: input.attemptId,
      providerPaymentId: input.providerPaymentId,
      hypothesis: input.hypothesis,
    },
  });
  return created.id;
}

/** Desfecho da duplicidade: eleicao (ou a ja feita) ou canonico sem vinculo (#147). */
export type DuplicateResolution =
  | { kind: 'elected'; canonical: AccreditedPayment; excess: AccreditedPayment[] }
  | { kind: 'canonical_unlinked'; canonicalProviderPaymentId: string };

/** Motivo do caso aberto na duplicidade tardia sem vinculo documentado (#147). */
const LATE_DUPLICATE_CASE_REASON = 'late_duplicate_canonical_unlinked';

/**
 * Duplicidade (PD-7): elege o canonico UMA unica vez — menor instante de
 * acreditacao autoritativo, empate pelo menor id do provedor em ordem
 * lexicografica (PD-7.1) — por atualizacao condicionada a nao haver canonico
 * (DM-7.4, PD-7.2). Reprocessar devolve a eleicao ja feita, nunca reelege.
 * O excedente vira RT-1 (PD-7.3), auditado com o canonico (PE-3.5).
 *
 * Duplicidade TARDIA (#147): o canonico ja eleito nao esta entre os candidatos
 * da busca. E o caso normal depois de uma confirmacao unica, que marca como
 * canonico a transacao da order (`PAY01...`), enquanto a busca devolve ids
 * numericos da Payments API; o provedor nao documenta vinculo entre os dois
 * (decisao RT-1 de F3-007; PD-8.11, item 5). Sem saber qual candidato e o
 * canonico, nao ha excedente identificavel: nada e reeleito, nada e
 * classificado para reembolso e o canonico nao e tocado. Abre-se UM caso
 * `inconsistente` (PD-10.5), auditado uma vez com os candidatos; o tratamento
 * do excedente e operacional ate decisao do Bruno.
 */
export async function resolveDuplicateInTx(
  tx: Prisma.TransactionClient,
  input: { attemptId: string; payments: AccreditedPayment[]; at: Date },
): Promise<DuplicateResolution> {
  const candidates = [...input.payments].sort(
    (a, b) =>
      a.accreditedAt.getTime() - b.accreditedAt.getTime() ||
      (a.providerPaymentId < b.providerPaymentId
        ? -1
        : a.providerPaymentId > b.providerPaymentId
          ? 1
          : 0),
  );
  const [existing] = await tx.$queryRaw<{ providerPaymentId: string }[]>`
    SELECT "provider_payment_id" AS "providerPaymentId" FROM "payments"
    WHERE "payment_attempt_id" = ${input.attemptId}::uuid AND "is_canonical"`;
  let canonical = candidates.find((c) => c.providerPaymentId === existing?.providerPaymentId);
  if (!canonical) {
    if (existing) {
      // Canonico ja eleito fora deste conjunto: nao se reelege por analogia
      // (PD-7.2) nem se adivinha qual candidato ele e (PD-10.5). O caso e unico
      // por motivo enquanto aberto, e a trava do anuncio serializa as
      // execucoes concorrentes: reentregar ou reprocessar nao duplica.
      await openCaseInTx(tx, {
        attemptId: input.attemptId,
        kind: 'inconsistente',
        reason: LATE_DUPLICATE_CASE_REASON,
        at: input.at,
        details: {
          rule: 'PD-10.5',
          canonicalProviderPaymentId: existing.providerPaymentId,
          candidates: candidates.map((c) => ({
            providerPaymentId: c.providerPaymentId,
            accreditedAt: c.accreditedAt.toISOString(),
          })),
          excessTreatment: 'pending_decision',
        },
      });
      return { kind: 'canonical_unlinked', canonicalProviderPaymentId: existing.providerPaymentId };
    }
    canonical = candidates[0];
    await tx.$executeRaw`
      UPDATE "payments" SET "is_canonical" = true, "updated_at" = ${input.at}
      WHERE "payment_attempt_id" = ${input.attemptId}::uuid
        AND "provider_payment_id" = ${canonical.providerPaymentId}
        AND NOT EXISTS (
          SELECT 1 FROM "payments"
          WHERE "payment_attempt_id" = ${input.attemptId}::uuid AND "is_canonical")`;
    await recordAuditEvent(tx, {
      eventType: 'payment.duplicate_resolved',
      actorId: null,
      targetType: 'payment_attempt',
      targetId: input.attemptId,
      result: 'success',
      occurredAt: input.at,
      details: {
        rule: 'PD-7.1',
        canonical: {
          providerPaymentId: canonical.providerPaymentId,
          accreditedAt: canonical.accreditedAt.toISOString(),
        },
        excess: candidates.slice(1).map((c) => ({
          providerPaymentId: c.providerPaymentId,
          accreditedAt: c.accreditedAt.toISOString(),
        })),
      },
    });
  }
  const chosen = canonical;
  const excess = candidates.filter((c) => c.providerPaymentId !== chosen.providerPaymentId);
  for (const payment of excess) {
    await createTechnicalRefundInTx(tx, {
      attemptId: input.attemptId,
      providerPaymentId: payment.providerPaymentId,
      hypothesis: 'rt_1',
      at: input.at,
    });
  }
  if (excess.length > 0) {
    await openCaseInTx(tx, {
      attemptId: input.attemptId,
      kind: 'reembolso_pendente',
      reason: 'rt_1',
      at: input.at,
    });
  }
  // Caso aberto por F3-006 antes do tratamento: fecha com o desfecho real.
  await tx.$executeRaw`
    UPDATE "reconciliation_cases"
    SET "closed_at" = ${input.at}, "outcome" = 'resolved_by_election', "updated_at" = ${input.at}
    WHERE "payment_attempt_id" = ${input.attemptId}::uuid AND "kind" = 'divergencia'
      AND "reason" = 'multiple_accredited' AND "closed_at" IS NULL`;
  return { kind: 'elected', canonical: chosen, excess };
}

/**
 * Acreditacao que NAO pode virar solicitacao paga (PD-6.6, passo 5): RT-2
 * (depois do fim da janela) ou RT-3 (sem reserva valida vigente). A hipotese e
 * determinada e persistida AGORA (PD-8.2): `TechnicalRefund` e caso aberto, na
 * mesma transacao. O reembolso e executado fora dela (refund.ts). Nao concede
 * direito (PD-3.3).
 */
export async function classifyPaymentExceptionInTx(
  tx: Prisma.TransactionClient,
  input: {
    attemptId: string;
    hypothesis: 'rt_2' | 'rt_3';
    accreditedAt: Date;
    providerPaymentId: string;
    origin: RecognitionOrigin;
    at: Date;
    facts: Prisma.InputJsonObject;
  },
): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE "payment_attempts"
    SET "status" = 'reembolso_pendente', "accredited_at" = ${input.accreditedAt},
        "recognized_at" = ${input.at},
        "recognition_source" = ${input.origin}::"recognition_source",
        "updated_at" = ${input.at}
    WHERE "id" = ${input.attemptId}::uuid
      AND "status" IN ('aguardando_pagamento', 'em_confirmacao')`;
  if (updated === 0) return false;
  await createTechnicalRefundInTx(tx, {
    attemptId: input.attemptId,
    providerPaymentId: input.providerPaymentId,
    hypothesis: input.hypothesis,
    at: input.at,
  });
  await openCaseInTx(tx, {
    attemptId: input.attemptId,
    kind: 'reembolso_pendente',
    reason: input.hypothesis,
    at: input.at,
    details: {
      providerPaymentId: input.providerPaymentId,
      accreditedAt: input.accreditedAt.toISOString(),
      recognizedAt: input.at.toISOString(),
      ...input.facts,
    },
  });
  return true;
}

/** Estado autoritativo terminal sem acreditacao: `expirada` ou `falha` (PD-6.6). */
export async function recordNotAccreditedInTx(
  tx: Prisma.TransactionClient,
  input: { attemptId: string; outcome: 'expired' | 'canceled' | 'failed'; at: Date },
): Promise<boolean> {
  const next = input.outcome === 'expired' ? 'expirada' : 'falha';
  const updated = await tx.$executeRaw`
    UPDATE "payment_attempts"
    SET "status" = ${next}::"payment_attempt_status", "updated_at" = ${input.at}
    WHERE "id" = ${input.attemptId}::uuid
      AND "status" IN ('aguardando_pagamento', 'em_confirmacao')`;
  if (updated === 0) return false;
  await recordAuditEvent(tx, {
    eventType: 'payment.not_accredited',
    actorId: null,
    targetType: 'payment_attempt',
    targetId: input.attemptId,
    result: 'failure',
    occurredAt: input.at,
    details: { outcome: input.outcome, status: next },
  });
  return true;
}

/** Nao acreditado e nao terminal: volta a aguardar o pagamento (PD-6.6). */
export async function returnToAwaitingPaymentInTx(
  tx: Prisma.TransactionClient,
  input: { attemptId: string; at: Date },
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "payment_attempts" SET "status" = 'aguardando_pagamento', "updated_at" = ${input.at}
    WHERE "id" = ${input.attemptId}::uuid AND "status" = 'em_confirmacao'`;
}

/**
 * Desconhecido ou contraditorio: `inconsistente` e caso aberto, sem analogia
 * (PE-1.5, PE-9.6, CI-9). Uma tentativa ja confirmada nao e rebaixada aqui.
 */
export async function markInconsistentInTx(
  tx: Prisma.TransactionClient,
  input: { attemptId: string; reason: string; at: Date },
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "payment_attempts" SET "status" = 'inconsistente', "updated_at" = ${input.at}
    WHERE "id" = ${input.attemptId}::uuid
      AND "status" IN ('aguardando_pagamento', 'em_confirmacao')`;
  await openCaseInTx(tx, {
    attemptId: input.attemptId,
    kind: 'inconsistente',
    reason: input.reason,
    at: input.at,
  });
}
