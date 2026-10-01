import { recordAuditEvent } from '@/modules/audit';
import { getPrismaClient } from '@/persistence/prisma';
import {
  createMercadoPagoClient,
  MercadoPagoConfigError,
  type GatewayFailure,
  type MercadoPagoClient,
  type PixChargeCreated,
} from './mercado-pago';

// Cobranca Pix da reserva: passos 2 e 3 de PD-4.1 (F3-005, #95).
//
// Passo 2, FORA de transacao e sem trava segurada: chama o provedor com a chave
// de idempotencia PERSISTIDA no passo 1 (PD-5.2) — nunca recalculada.
// Passo 3, numa transacao curta: grava o identificador da order e move a
// tentativa `tentativa_criada` -> `aguardando_pagamento` por UPDATE condicionado
// ao estado de origem; uma segunda execucao nao produz efeito (PD-5.4).
//
// Recuperacao (PD-4.2, PD-4.3, PD-6.8): se o passo 2 ou o 3 falhar, a tentativa
// continua `tentativa_criada`. A proxima chamada refaz o passo 2 com a MESMA
// chave — o provedor devolve a MESMA order (spike F0-010, exp. 3) — e conclui o
// passo 3. Nunca existe segunda order para a mesma reserva.
//
// Quem decide SE a reserva ainda admite cobranca (viva, anuncio `published`) e
// o modulo `request`, dono da vaga (AR-3.5; PD-6.11, item 1). Este modulo so
// cobra a tentativa que recebe.
//
// As instrucoes Pix (copia e cola, QR, link) e o email do pagador NUNCA vao para
// log, auditoria ou telemetria. O email so segue no corpo enviado ao provedor
// e nao e persistido (PD-11.2).

/** Valor da solicitacao paga, em centavos (RB-004, PD-4.5). */
export const REQUEST_PRICE_CENTS = 99;

export interface PixPaymentDetails {
  /** Pix copia e cola (BR Code). */
  copyPaste: string;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  /** Expiracao absoluta informada pelo provedor (`date_of_expiration`). */
  expiresAt: string | null;
}

export type ChargeOrigin = 'initial' | 'retry';

export type ChargeOutcome =
  | { ok: true; pix: PixPaymentDetails | null }
  | { ok: false; reason: 'gateway_unavailable' | 'gateway_rejected' | 'attempt_not_chargeable' };

export interface ChargeContext {
  contactRequestId: string;
  actorId: string;
  payerEmail: string;
  reservedUntil: Date;
  /** `now()` do banco lido por quem autorizou a cobranca (DM-6.12). */
  now: Date;
  origin: ChargeOrigin;
}

export interface ChargeDeps {
  /** Somente para teste; o padrao e o cliente real do adaptador. */
  gateway?: MercadoPagoClient;
}

interface AttemptRow {
  id: string;
  status: string;
  idempotencyKey: string;
  externalReference: string;
  providerOrderId: string | null;
}

async function readAttempt(contactRequestId: string): Promise<AttemptRow | null> {
  const rows = await getPrismaClient().$queryRaw<AttemptRow[]>`
    SELECT "id"::text AS "id", "status"::text AS "status",
           "idempotency_key" AS "idempotencyKey",
           "external_reference" AS "externalReference",
           "provider_order_id" AS "providerOrderId"
    FROM "payment_attempts" WHERE "contact_request_id" = ${contactRequestId}::uuid`;
  return rows[0] ?? null;
}

function details(created: PixChargeCreated): PixPaymentDetails | null {
  if (!created.instructions) return null;
  return {
    copyPaste: created.instructions.qrCode,
    qrCodeBase64: created.instructions.qrCodeBase64,
    ticketUrl: created.instructions.ticketUrl,
    expiresAt: created.snapshot.pixExpiresAt?.toISOString() ?? null,
  };
}

/** Falha do provedor auditada sem nada sensivel (DM-11.1, DM-11.2). */
async function auditFailure(
  attemptId: string,
  ctx: ChargeContext,
  failure: { kind: string; code?: string },
): Promise<void> {
  try {
    await getPrismaClient().$transaction((tx) =>
      recordAuditEvent(tx, {
        eventType: 'payment.charge_failed',
        actorId: ctx.actorId,
        targetType: 'payment_attempt',
        targetId: attemptId,
        result: 'failure',
        details: { origin: ctx.origin, ...failure },
      }),
    );
  } catch (err) {
    console.error('[payments] falha ao auditar falha de cobranca', {
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
}

function failureOf(result: GatewayFailure): { kind: string; code?: string } {
  return result.kind === 'rejected'
    ? { kind: 'rejected', code: result.code }
    : { kind: result.kind, ...(result.kind === 'unavailable' ? { code: result.reason } : {}) };
}

/**
 * Passo 3: grava a order e move a tentativa, condicionado a `tentativa_criada`.
 * Se outra execucao concorrente ja concluiu com a MESMA order, e sucesso
 * idempotente; order diferente e inconsistencia e nao sobrescreve nada.
 */
async function persistCharge(
  attempt: AttemptRow,
  ctx: ChargeContext,
  created: PixChargeCreated,
): Promise<boolean> {
  const providerOrderId = created.snapshot.providerOrderId;
  return getPrismaClient().$transaction(async (tx) => {
    const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;
    const updated = await tx.$executeRaw`
      UPDATE "payment_attempts"
      SET "provider_order_id" = ${providerOrderId}, "status" = 'aguardando_pagamento',
          "updated_at" = ${at}
      WHERE "id" = ${attempt.id}::uuid AND "status" = 'tentativa_criada'`;
    if (updated === 0) {
      const [current] = await tx.$queryRaw<{ status: string; providerOrderId: string | null }[]>`
        SELECT "status"::text AS "status", "provider_order_id" AS "providerOrderId"
        FROM "payment_attempts" WHERE "id" = ${attempt.id}::uuid`;
      return (
        current?.status === 'aguardando_pagamento' && current.providerOrderId === providerOrderId
      );
    }
    const expiresAt = created.snapshot.pixExpiresAt;
    await recordAuditEvent(tx, {
      eventType: 'payment.charge_created',
      actorId: ctx.actorId,
      targetType: 'payment_attempt',
      targetId: attempt.id,
      result: 'success',
      occurredAt: at,
      details: {
        origin: ctx.origin,
        providerOrderId,
        reservedUntil: ctx.reservedUntil.toISOString(),
        providerExpiresAt: expiresAt?.toISOString() ?? null,
        // δ de PD-3.2 (nota de F3-004): quanto a cobranca sobrevive a reserva.
        expiryDeltaMs: expiresAt ? expiresAt.getTime() - ctx.reservedUntil.getTime() : null,
      },
    });
    return true;
  });
}

/**
 * Cria (ou retoma) a cobranca Pix da tentativa da solicitacao e devolve as
 * instrucoes de pagamento. O chamador ja autorizou a cobranca sob a trava do
 * anuncio (PD-6.11, item 1).
 */
export async function chargeForReservation(
  ctx: ChargeContext,
  deps: ChargeDeps = {},
): Promise<ChargeOutcome> {
  const gateway = deps.gateway ?? createMercadoPagoClient();
  const attempt = await readAttempt(ctx.contactRequestId);
  if (!attempt) return { ok: false, reason: 'attempt_not_chargeable' };

  try {
    if (attempt.status === 'aguardando_pagamento' && attempt.providerOrderId) {
      const existing = await gateway.getPixCharge(attempt.providerOrderId);
      if (!existing.ok) {
        return {
          ok: false,
          reason: existing.kind === 'unavailable' ? 'gateway_unavailable' : 'gateway_rejected',
        };
      }
      return { ok: true, pix: details(existing.value) };
    }
    if (attempt.status !== 'tentativa_criada')
      return { ok: false, reason: 'attempt_not_chargeable' };

    // Passo 2, fora de transacao, com a chave persistida.
    const created = await gateway.createPixCharge({
      idempotencyKey: attempt.idempotencyKey,
      externalReference: attempt.externalReference,
      amountCents: REQUEST_PRICE_CENTS,
      expiresInMs: ctx.reservedUntil.getTime() - ctx.now.getTime(),
      payerEmail: ctx.payerEmail,
    });
    if (!created.ok) {
      await auditFailure(attempt.id, ctx, failureOf(created));
      return {
        ok: false,
        reason: created.kind === 'unavailable' ? 'gateway_unavailable' : 'gateway_rejected',
      };
    }
    // A order devolvida tem de ser a desta tentativa (PD-2.1): sem correlacao, nada e gravado.
    const reference = created.value.snapshot.externalReference;
    if (reference !== null && reference !== attempt.externalReference) {
      await auditFailure(attempt.id, ctx, { kind: 'rejected', code: 'reference_mismatch' });
      return { ok: false, reason: 'gateway_rejected' };
    }

    // Passo 3.
    if (!(await persistCharge(attempt, ctx, created.value))) {
      await auditFailure(attempt.id, ctx, { kind: 'rejected', code: 'order_mismatch' });
      return { ok: false, reason: 'gateway_rejected' };
    }
    return { ok: true, pix: details(created.value) };
  } catch (err) {
    if (err instanceof MercadoPagoConfigError) {
      // Credencial ausente: fail-closed, sem cobranca e sem nome de valor.
      await auditFailure(attempt.id, ctx, { kind: 'unavailable', code: 'configuration' });
      return { ok: false, reason: 'gateway_unavailable' };
    }
    // Falha local depois do provedor (por exemplo, no passo 3): a tentativa
    // continua `tentativa_criada` e a proxima chamada retoma a mesma order.
    console.error('[payments] falha ao concluir a cobranca', {
      error: err instanceof Error ? err.name : 'unknown',
    });
    await auditFailure(attempt.id, ctx, { kind: 'local_failure' });
    return { ok: false, reason: 'gateway_unavailable' };
  }
}
