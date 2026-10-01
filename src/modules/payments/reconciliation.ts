import { recordAuditEvent } from '@/modules/audit';
import { getPrismaClient } from '@/persistence/prisma';
import { openCaseInTx, type ConfirmationDeps } from './confirmation';
import { claimInTransaction, type ClaimHooks } from './jobs';
import { createMercadoPagoClient, MercadoPagoConfigError } from './mercado-pago';

// Parte de `payments` da reconciliacao periodica (F3-008, #98; PD-10.1 a
// PD-10.7). `payments` reclama as tentativas (e dono delas), registra a ultima
// observacao e acha a order perdida de uma tentativa; quem decide o efeito
// sobre a vaga e `request` (AR-3.5), pelo mesmo `confirmPaymentFlow` do webhook.

/** Tentativa ativa: volta a ser elegivel em menos que a cadencia de 5 min. */
export const RECONCILE_ACTIVE_SECONDS = 4 * 60;
/** Inconsistente ou com caso aberto: so reobservada, de hora em hora. */
export const RECONCILE_OBSERVE_SECONDS = 60 * 60;

/**
 * Reclama um lote de tentativas vencidas (PD-10.2, exceto a varredura de
 * reversoes de F3-011): estados nao terminais, `inconsistente` e qualquer
 * tentativa com caso `pendente`/`divergencia`/`inconsistente` aberto.
 * `reembolso_pendente` e da retentativa de reembolso (refund-retry.ts).
 */
export function claimAttemptsForReconciliation(
  limit: number,
  hooks?: ClaimHooks,
): Promise<string[]> {
  return claimInTransaction(
    (tx) => tx.$queryRaw<{ id: string }[]>`
      WITH c AS MATERIALIZED (
        SELECT a."id" FROM "payment_attempts" a
        WHERE (
            a."status" IN (
              'tentativa_criada', 'aguardando_pagamento', 'em_confirmacao', 'inconsistente')
            OR EXISTS (
              SELECT 1 FROM "reconciliation_cases" rc
              WHERE rc."payment_attempt_id" = a."id" AND rc."closed_at" IS NULL
                AND rc."kind" IN ('pendente', 'divergencia', 'inconsistente')))
          AND (a."next_reconcile_at" IS NULL OR a."next_reconcile_at" <= now())
        ORDER BY a."next_reconcile_at" NULLS FIRST, a."created_at", a."id"
        LIMIT ${limit}
        FOR UPDATE OF a SKIP LOCKED
      )
      UPDATE "payment_attempts" pa
      SET "next_reconcile_at" = now() + make_interval(secs => CASE
            WHEN pa."status" IN ('tentativa_criada', 'aguardando_pagamento', 'em_confirmacao')
              THEN ${RECONCILE_ACTIVE_SECONDS}::int
            ELSE ${RECONCILE_OBSERVE_SECONDS}::int END)
      FROM c
      WHERE pa."id" = c."id"
      RETURNING pa."id"::text AS "id"`,
    hooks,
  );
}

/**
 * Diagnostico da ultima passagem (PD-10.4): codigo fechado, nunca resposta do
 * provedor. `deferSeconds` adia a proxima reclamacao alem do instante reclamado.
 */
export async function recordReconciliation(
  attemptId: string,
  result: string,
  deferSeconds?: number,
): Promise<void> {
  await getPrismaClient().$executeRaw`
    UPDATE "payment_attempts"
    SET "last_reconciled_at" = now(), "last_reconcile_result" = ${result.slice(0, 64)},
        "next_reconcile_at" = CASE WHEN ${deferSeconds ?? null}::int IS NULL
          THEN "next_reconcile_at"
          ELSE GREATEST("next_reconcile_at", now() + make_interval(secs => ${deferSeconds ?? 0}::int))
        END
    WHERE "id" = ${attemptId}::uuid`;
}

export type OrphanOutcome =
  'adopted' | 'not_found' | 'unavailable' | 'inconsistent' | 'not_applicable';

interface OrphanRow {
  id: string;
  status: string;
  externalReference: string;
  createdAt: Date;
  now: Date;
}

/**
 * Tentativa `tentativa_criada` cuja janela ja acabou: o passo 3 de PD-4.1 pode
 * ter se perdido depois de o provedor criar a order. Procura, SO LEITURA, por
 * `GET /v1/orders?external_reference` (referencia oficial conferida em
 * 2026-10-01) e, achando exatamente uma order desta referencia, registra-a como
 * o passo 3 faria (`tentativa_criada` -> `aguardando_pagamento`), para que a
 * confirmacao a releia pelo estado autoritativo. Nunca cria nem recria order.
 *
 * Nenhum resultado NAO prova que a order nao existe (atraso de indexacao,
 * credencial sem suporte a busca): a tentativa fica como esta e volta a ser
 * procurada. Mais de uma order, ou order ja ligada a outra tentativa, e
 * contradicao: caso `inconsistente`, sem adivinhar (PD-10.5).
 */
export async function adoptOrphanOrder(
  attemptId: string,
  deps: ConfirmationDeps = {},
): Promise<OrphanOutcome> {
  const prisma = getPrismaClient();
  const [attempt] = await prisma.$queryRaw<OrphanRow[]>`
    SELECT "id"::text AS "id", "status"::text AS "status",
           "external_reference" AS "externalReference", "created_at" AS "createdAt",
           now() AS "now"
    FROM "payment_attempts" WHERE "id" = ${attemptId}::uuid`;
  if (!attempt || attempt.status !== 'tentativa_criada') return 'not_applicable';

  const gateway = deps.gateway ?? createMercadoPagoClient();
  let found;
  try {
    found = await gateway.searchOrdersByReference(attempt.externalReference, {
      createdFrom: new Date(attempt.createdAt.getTime() - 60_000),
      createdTo: new Date(attempt.now.getTime() + 60_000),
    });
  } catch (err) {
    if (err instanceof MercadoPagoConfigError) return 'unavailable';
    throw err;
  }
  if (!found.ok) return 'unavailable';
  const orders = found.value.filter((o) => o.externalReference === attempt.externalReference);
  if (orders.length === 0) return 'not_found';

  return prisma.$transaction(async (tx) => {
    const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;
    const contradiction = async (reason: string) => {
      await openCaseInTx(tx, { attemptId, kind: 'inconsistente', reason, at });
      return 'inconsistent' as const;
    };
    if (orders.length > 1) return contradiction('orphan_order_ambiguous');
    const providerOrderId = orders[0].providerOrderId;
    const updated = await tx.$executeRaw`
      UPDATE "payment_attempts"
      SET "provider_order_id" = ${providerOrderId}, "status" = 'aguardando_pagamento',
          "updated_at" = ${at}
      WHERE "id" = ${attemptId}::uuid AND "status" = 'tentativa_criada'
        AND "provider_order_id" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "payment_attempts" WHERE "provider_order_id" = ${providerOrderId})`;
    if (updated === 0) {
      const [current] = await tx.$queryRaw<{ status: string }[]>`
        SELECT "status"::text AS "status" FROM "payment_attempts" WHERE "id" = ${attemptId}::uuid`;
      // O solicitante (ou outra execucao) concluiu o passo 3 antes: nada a fazer.
      if (current?.status !== 'tentativa_criada') return 'not_applicable';
      return contradiction('orphan_order_conflict');
    }
    await recordAuditEvent(tx, {
      eventType: 'payment.charge_adopted',
      actorId: null,
      targetType: 'payment_attempt',
      targetId: attemptId,
      result: 'success',
      occurredAt: at,
      details: { providerOrderId, origin: 'reconciliacao' },
    });
    return 'adopted';
  });
}
