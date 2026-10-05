import type { Prisma } from '@/generated/prisma/client';
import { recordAuditEvent } from '@/modules/audit';
import { openCaseInTx, type RecognitionOrigin } from './confirmation';
import { claimInTransaction, type ClaimHooks } from './jobs';

// Reversoes posteriores (F3-011, #101; payments-design.md, PD-9.1, PD-9.2,
// PD-10.2 e PD-10.7; payment-exceptions.md, PE-8.4 a PE-8.12; data-model.md,
// DM-6.7). `payments` e dono do dinheiro e da tentativa (AR-3.5): aqui ficam a
// reclamacao da varredura diaria e a transicao da tentativa. O efeito sobre a
// VAGA (nenhum: ela permanece consumida) e a leitura de elegibilidade e de
// liberacao sao de `request`, que chama as transicoes `*InTx` na sua
// transacao, sob a trava do anuncio, pelo mesmo `confirmPaymentFlow` do webhook
// e da reconciliacao.
//
// A reversao e EVENTO NOVO (PE-8.5): a aprovacao original (`payment.approved`,
// os dois instantes de CI-4, o canonico) fica como esta; nada e apagado. A
// tentativa vai a `reembolsada_ou_revertida`, o que basta para a solicitacao
// sair da elegibilidade (`readConfirmedPaymentEvidence`, CR-4.2). A linha da
// solicitacao continua `paid` (DM-6.7, PE-8.9) e nenhuma cobranca nova e criada
// (PE-8.8).

/** Varredura DIARIA (PD-3.4): o proximo exame de uma tentativa confirmada. */
export const REVERSAL_CHECK_SECONDS = 24 * 60 * 60;

/**
 * Reclama um lote de tentativas `pagamento_confirmado` com o exame vencido
 * (PD-10.2: "periodicamente, os pagamentos ja confirmados"). Mesma forma das
 * reclamacoes de F3-008: CTE `MATERIALIZED` com `FOR UPDATE SKIP LOCKED` numa
 * transacao curta que empurra `next_reversal_check_at` 24 h para a frente e
 * commita (nota de 2026-10-01 em PD-10.7). Coluna PROPRIA, e nao
 * `next_reconcile_at`: uma tentativa confirmada com caso aberto tambem e
 * reobservada de hora em hora pela reconciliacao, e as duas agendas nao podem
 * se empurrar.
 */
export function claimConfirmedForReversalCheck(
  limit: number,
  hooks?: ClaimHooks,
): Promise<string[]> {
  return claimInTransaction(
    (tx) => tx.$queryRaw<{ id: string }[]>`
      WITH c AS MATERIALIZED (
        SELECT a."id" FROM "payment_attempts" a
        WHERE a."status" = 'pagamento_confirmado'
          AND (a."next_reversal_check_at" IS NULL OR a."next_reversal_check_at" <= now())
        ORDER BY a."next_reversal_check_at" NULLS FIRST, a."accredited_at", a."id"
        LIMIT ${limit}
        FOR UPDATE OF a SKIP LOCKED
      )
      UPDATE "payment_attempts" pa
      SET "next_reversal_check_at" = now() + make_interval(secs => ${REVERSAL_CHECK_SECONDS}::int)
      FROM c
      WHERE pa."id" = c."id"
      RETURNING pa."id"::text AS "id"`,
    hooks,
  );
}

export type ConfirmedReversalOutcome =
  /** Esta chamada efetuou `pagamento_confirmado` -> `reembolsada_ou_revertida`. */
  | 'reversed'
  /** A tentativa ja nao estava confirmada (outra execucao reverteu antes). */
  | 'not_confirmed'
  /**
   * A tentativa tem reembolso tecnico RT-1 (excedente de duplicidade): a
   * devolucao do proprio TROQ pode explicar o estado de reversao da order, e a
   * order nao diz qual pagamento saiu. Contradicao: caso `inconsistente`, sem
   * transicao (PD-10.5).
   */
  | 'ambiguous';

/**
 * Reversao de pagamento JA CONFIRMADO (PD-9.2). Chamada por `request`, na sua
 * transacao, sob a trava do anuncio, depois de reler a solicitacao `paid`.
 * Transicao condicionada ao estado de origem: reprocessar o mesmo fato nao
 * produz segundo evento (PD-5.4). `effects` descreve o efeito sobre a vaga, a
 * elegibilidade e a liberacao, como PE-11 exige na auditoria da reversao.
 */
export async function reverseConfirmedPaymentInTx(
  tx: Prisma.TransactionClient,
  input: {
    attemptId: string;
    /** Codigo fechado do estado autoritativo que caracterizou a reversao. */
    authoritativeState: string;
    origin: RecognitionOrigin;
    at: Date;
    effects: Prisma.InputJsonObject;
  },
): Promise<ConfirmedReversalOutcome> {
  const [rt1] = await tx.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS "count" FROM "technical_refunds" tr
    JOIN "payments" p ON p."id" = tr."payment_id"
    WHERE p."payment_attempt_id" = ${input.attemptId}::uuid AND tr."hypothesis" = 'rt_1'`;
  if (rt1.count > 0) {
    await openCaseInTx(tx, {
      attemptId: input.attemptId,
      kind: 'inconsistente',
      reason: 'reversal_with_technical_refund',
      at: input.at,
      details: { authoritativeState: input.authoritativeState },
    });
    return 'ambiguous';
  }

  const [reversed] = await tx.$queryRaw<
    { accreditedAt: Date | null; recognizedAt: Date | null; recognitionSource: string | null }[]
  >`
    UPDATE "payment_attempts"
    SET "status" = 'reembolsada_ou_revertida', "updated_at" = ${input.at}
    WHERE "id" = ${input.attemptId}::uuid AND "status" = 'pagamento_confirmado'
    RETURNING "accredited_at" AS "accreditedAt", "recognized_at" AS "recognizedAt",
              "recognition_source"::text AS "recognitionSource"`;
  if (!reversed) return 'not_confirmed';

  const [canonical] = await tx.$queryRaw<{ providerPaymentId: string }[]>`
    SELECT "provider_payment_id" AS "providerPaymentId" FROM "payments"
    WHERE "payment_attempt_id" = ${input.attemptId}::uuid AND "is_canonical"`;
  await recordAuditEvent(tx, {
    eventType: 'payment.reversed',
    actorId: null,
    targetType: 'payment_attempt',
    targetId: input.attemptId,
    result: 'success',
    occurredAt: input.at,
    details: {
      confirmed: true,
      authoritativeState: input.authoritativeState,
      origin: input.origin,
      // A aprovacao original continua sendo fato historico (PE-8.5): os seus
      // instantes vao junto, para a trilha ler os dois eventos lado a lado.
      approval: {
        providerPaymentId: canonical?.providerPaymentId ?? null,
        accreditedAt: reversed.accreditedAt?.toISOString() ?? null,
        recognizedAt: reversed.recognizedAt?.toISOString() ?? null,
        recognitionSource: reversed.recognitionSource,
      },
      newCharge: false,
      ...input.effects,
    },
  });
  return 'reversed';
}

/**
 * Reversao observada ANTES da confirmacao (PD-6.6, linha "Reversao"; PD-9.4):
 * o valor foi acreditado e devolvido sem que o TROQ o tivesse reconhecido.
 * Nunca houve solicitacao paga nem vaga consumida, e o valor ja nao esta com o
 * TROQ: a tentativa vai a `reembolsada_ou_revertida`. O caso
 * `reversed_before_confirmation` que F3-006 abriu para esta entrega, se houver,
 * fecha com o desfecho real. A reserva viva, que nao pode mais ser paga (uma
 * tentativa por solicitacao, PD-4.3), e liberada por `request`.
 */
export async function reverseUnconfirmedPaymentInTx(
  tx: Prisma.TransactionClient,
  input: {
    attemptId: string;
    authoritativeState: string;
    origin: RecognitionOrigin;
    at: Date;
    effects: Prisma.InputJsonObject;
  },
): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE "payment_attempts"
    SET "status" = 'reembolsada_ou_revertida', "updated_at" = ${input.at}
    WHERE "id" = ${input.attemptId}::uuid
      AND "status" IN ('aguardando_pagamento', 'em_confirmacao')`;
  if (updated === 0) return false;
  await tx.$executeRaw`
    UPDATE "reconciliation_cases"
    SET "closed_at" = ${input.at}, "outcome" = 'reversed', "updated_at" = ${input.at}
    WHERE "payment_attempt_id" = ${input.attemptId}::uuid AND "kind" = 'divergencia'
      AND "reason" = 'reversed_before_confirmation' AND "closed_at" IS NULL`;
  await recordAuditEvent(tx, {
    eventType: 'payment.reversed',
    actorId: null,
    targetType: 'payment_attempt',
    targetId: input.attemptId,
    result: 'success',
    occurredAt: input.at,
    details: {
      confirmed: false,
      authoritativeState: input.authoritativeState,
      origin: input.origin,
      newCharge: false,
      ...input.effects,
    },
  });
  return true;
}
