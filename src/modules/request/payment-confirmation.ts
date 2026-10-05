import type { Prisma } from '@/generated/prisma/client';
import { recordAuditEvent } from '@/modules/audit';
import { notifyUser } from '@/modules/identity';
import { lockListingForRequest } from '@/modules/listing';
import {
  classifyPaymentExceptionInTx,
  confirmPaymentInTx,
  forwardCaseInTx,
  markInconsistentInTx,
  observeAttempt,
  processRefundsForAttempt,
  readAttemptStatusInTx,
  recordNotAccreditedInTx,
  resolveDuplicateInTx,
  returnToAwaitingPaymentInTx,
  type AccreditedPayment,
  type ConfirmationDeps,
  type PaymentFact,
  type RecognitionOrigin,
} from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';

// Efeito do fato de pagamento sobre a vaga (F3-006, #96; payments-design.md,
// PD-6.6 passos 4 e 5, PD-6.7, PD-6.11; ADR-0008). `request` e dono da vaga
// (AR-3.5): `payments` le o estado autoritativo FORA de transacao e sem trava
// (`observeAttempt`); aqui, numa transacao curta e sob a trava de linha do
// anuncio (DM-6.12), a solicitacao e relida e o efeito e decidido:
//
// - acreditada, `reserved` e acreditacao <= `reservedUntil` -> `paid` +
//   `pagamento_confirmado`, consumindo a vaga (PE-4.2: vale mesmo reconhecida
//   muito depois);
// - acreditada fora da janela -> RT-2; sem reserva valida vigente -> RT-3. A
//   hipotese fica persistida no `TechnicalRefund` e no caso aberto (PD-8.2);
// - dois ou mais acreditados -> canonico eleito uma vez (PD-7.1) segue as
//   regras acima, e o excedente vira RT-1 (PD-7.3);
// - terminal sem acreditacao -> `expirada`/`falha` e a reserva viva sai da vaga;
// - pendente -> volta a aguardar; desconhecido -> `inconsistente`;
// - indisponivel -> nada muda (PD-6.9).
//
// A transacao NAO consulta o estado do anuncio: reserva viva de anuncio
// `paused` confirma (PD-6.11). Toda transicao e por UPDATE condicionado ao
// estado de origem: reprocessar o mesmo fato nao produz segundo efeito (PD-5.4).
//
// Depois do COMMIT, e fora da trava, a primeira tentativa de reembolso de toda
// excecao (F3-007; PD-8). A retentativa periodica e de F3-008.
//
// Tambem depois do COMMIT, e so quando ESTA chamada efetuou `reserved` ->
// `paid`, os avisos TE-1 (a quem pagou) e TE-2 (ao anunciante) (F3-013, #103;
// DEC-048). Reprocessar o mesmo fato devolve `already_confirmed` e nao avisa
// de novo.

export type PaymentConfirmationOutcome =
  | 'confirmed'
  | 'already_confirmed'
  | 'exception_rt_2'
  | 'exception_rt_3'
  | 'not_accredited'
  | 'pending'
  | 'unavailable'
  | 'no_order'
  | 'reversed'
  | 'inconsistent'
  | 'not_found'
  | 'no_effect';

export interface PaymentConfirmationOptions {
  /** Como o TROQ tomou conhecimento (PE-10.1). */
  origin: RecognitionOrigin;
  deps?: ConfirmationDeps;
}

interface RequestRow {
  id: string;
  listingId: string;
  requesterId: string;
  status: string;
  slotIndex: number;
  reservedUntil: Date;
}

async function readRequest(
  tx: Prisma.TransactionClient,
  contactRequestId: string,
): Promise<RequestRow | null> {
  const [row] = await tx.$queryRaw<RequestRow[]>`
    SELECT "id"::text AS "id", "listing_id"::text AS "listingId",
           "requester_id"::text AS "requesterId", "status"::text AS "status",
           "slot_index" AS "slotIndex", "reserved_until" AS "reservedUntil"
    FROM "contact_requests" WHERE "id" = ${contactRequestId}::uuid`;
  return row ?? null;
}

/** `reserved` -> `paid`, consumindo a vaga ja reservada (RB-003, DM-6.7). */
async function markPaid(
  tx: Prisma.TransactionClient,
  request: RequestRow,
  attemptId: string,
  at: Date,
): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE "contact_requests" SET "status" = 'paid', "paid_at" = ${at}, "updated_at" = ${at}
    WHERE "id" = ${request.id}::uuid AND "status" = 'reserved'`;
  if (updated === 0) return false;
  await recordAuditEvent(tx, {
    eventType: 'request.paid',
    actorId: null,
    targetType: 'contact_request',
    targetId: request.id,
    result: 'success',
    occurredAt: at,
    details: {
      listingId: request.listingId,
      slotIndex: request.slotIndex,
      paymentAttemptId: attemptId,
    },
  });
  return true;
}

/** Reserva viva sai da vaga: `expired` (fim da janela) ou `failed` (cobranca encerrada). */
async function releaseReservation(
  tx: Prisma.TransactionClient,
  request: RequestRow,
  next: 'expired' | 'failed',
  reason: string,
  at: Date,
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "contact_requests"
    SET "status" = ${next}::"contact_request_status", "updated_at" = ${at}
    WHERE "id" = ${request.id}::uuid AND "status" = 'reserved'`;
  if (updated === 0) return;
  await recordAuditEvent(tx, {
    eventType: next === 'expired' ? 'request.reservation_expired' : 'request.reservation_ended',
    actorId: null,
    targetType: 'contact_request',
    targetId: request.id,
    result: 'success',
    occurredAt: at,
    details: {
      listingId: request.listingId,
      slotIndex: request.slotIndex,
      trigger: 'payment_confirmation',
      reason,
    },
  });
}

async function applyFact(
  tx: Prisma.TransactionClient,
  attemptId: string,
  request: RequestRow,
  fact: PaymentFact,
  origin: RecognitionOrigin,
  at: Date,
): Promise<PaymentConfirmationOutcome> {
  switch (fact.kind) {
    case 'unavailable':
      return 'unavailable';
    case 'no_order':
      return 'no_order';
    case 'pending':
      await returnToAwaitingPaymentInTx(tx, { attemptId, at });
      return 'pending';
    case 'not_accredited_terminal': {
      const recorded = await recordNotAccreditedInTx(tx, { attemptId, outcome: fact.outcome, at });
      if (recorded) {
        await releaseReservation(
          tx,
          request,
          fact.outcome === 'expired' ? 'expired' : 'failed',
          `charge_${fact.outcome}`,
          at,
        );
      }
      return 'not_accredited';
    }
    case 'reversed': {
      // Reversao de pagamento ja confirmado e da varredura de F3-011; antes da
      // confirmacao, so fica registrada para a mesma entrega.
      const status = await readAttemptStatusInTx(tx, attemptId);
      if (status === 'aguardando_pagamento' || status === 'em_confirmacao') {
        await forwardCaseInTx(tx, { attemptId, reason: 'reversed_before_confirmation', at });
      }
      return 'reversed';
    }
    case 'multiple_accredited': {
      // PD-7: o canonico e eleito uma unica vez; o excedente vira RT-1 na mesma
      // transacao. O canonico segue a regra de tempestividade como unico.
      const { canonical } = await resolveDuplicateInTx(tx, {
        attemptId,
        payments: fact.payments,
        at,
      });
      return applyAccreditation(tx, attemptId, request, canonical, origin, at);
    }
    case 'inconsistent':
      await markInconsistentInTx(tx, { attemptId, reason: fact.reason, at });
      return 'inconsistent';
    case 'accredited':
      return applyAccreditation(tx, attemptId, request, fact, origin, at);
  }
}

async function applyAccreditation(
  tx: Prisma.TransactionClient,
  attemptId: string,
  request: RequestRow,
  fact: AccreditedPayment,
  origin: RecognitionOrigin,
  at: Date,
): Promise<PaymentConfirmationOutcome> {
  const status = await readAttemptStatusInTx(tx, attemptId);
  if (status === 'pagamento_confirmado') return 'already_confirmed';
  if (status !== 'aguardando_pagamento' && status !== 'em_confirmacao') return 'no_effect';

  // PD-6.7: a tempestividade usa o instante de ACREDITACAO, nunca o de chegada
  // da notificacao nem o de processamento.
  const timely = fact.accreditedAt.getTime() <= request.reservedUntil.getTime();
  if (request.status === 'reserved' && timely) {
    const confirmed = await confirmPaymentInTx(tx, {
      attemptId,
      accreditedAt: fact.accreditedAt,
      providerPaymentId: fact.providerPaymentId,
      origin,
      at,
    });
    if (!confirmed || !(await markPaid(tx, request, attemptId, at))) {
      // As duas linhas mudam juntas ou nenhuma: desfaz a transacao inteira.
      throw new Error('payment_confirmation_diverged');
    }
    return 'confirmed';
  }

  const hypothesis = request.status === 'reserved' ? 'rt_2' : 'rt_3';
  const classified = await classifyPaymentExceptionInTx(tx, {
    attemptId,
    hypothesis,
    accreditedAt: fact.accreditedAt,
    providerPaymentId: fact.providerPaymentId,
    origin,
    at,
    facts: {
      contactRequestId: request.id,
      requestStatus: request.status,
      reservedUntil: request.reservedUntil.toISOString(),
    },
  });
  // RT-2: a janela acabou; a reserva sai da vaga e nao e ressuscitada (PE-4.3).
  if (classified && hypothesis === 'rt_2') {
    await releaseReservation(tx, request, 'expired', 'accredited_after_window', at);
  }
  return hypothesis === 'rt_2' ? 'exception_rt_2' : 'exception_rt_3';
}

/** TE-1 e TE-2, depois do commit. `notifyUser` nunca lanca. */
interface PaidNotice {
  request: RequestRow;
  ownerId: string | null;
}

async function notifyPaidRequest({ request, ownerId }: PaidNotice): Promise<void> {
  await Promise.all([
    notifyUser({
      kind: 'request_paid_requester',
      recipientId: request.requesterId,
      contactRequestId: request.id,
      listingId: request.listingId,
    }),
    ownerId
      ? notifyUser({
          kind: 'request_paid_owner',
          recipientId: ownerId,
          contactRequestId: request.id,
        })
      : Promise.resolve(),
  ]);
}

/**
 * Confirma (ou nao) o pagamento da tentativa contra o estado autoritativo.
 * Chamado pelo receptor de webhook e, em F3-008, pela reconciliacao. Seguro
 * para reexecucao e para execucoes concorrentes.
 */
export async function confirmPaymentFlow(
  attemptId: string,
  options: PaymentConfirmationOptions,
): Promise<PaymentConfirmationOutcome> {
  const observed = await observeAttempt(attemptId, options.deps);
  if (!observed) return 'not_found';
  if (observed.fact.kind === 'unavailable') return 'unavailable';
  if (observed.fact.kind === 'no_order') return 'no_order';

  const { outcome, paid } = await getPrismaClient().$transaction(
    async (tx): Promise<{ outcome: PaymentConfirmationOutcome; paid: PaidNotice | null }> => {
      const before = await readRequest(tx, observed.contactRequestId);
      if (!before) return { outcome: 'not_found', paid: null };
      // Trava de linha do anuncio: serializa com reservas, encerramentos e outras
      // confirmacoes do mesmo anuncio (DM-6.12). O estado do anuncio NAO e
      // verificado (PD-6.11).
      const listing = await lockListingForRequest(tx, before.listingId);
      const request = await readRequest(tx, observed.contactRequestId);
      if (!request) return { outcome: 'not_found', paid: null };
      const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT now() AS "at"`;
      const applied = await applyFact(tx, attemptId, request, observed.fact, options.origin, at);
      return {
        outcome: applied,
        paid: applied === 'confirmed' ? { request, ownerId: listing?.ownerId ?? null } : null,
      };
    },
  );

  // Depois do COMMIT, so quem efetuou a transicao avisa (TE-1, TE-2).
  if (paid) await notifyPaidRequest(paid);

  const owesRefund =
    observed.fact.kind === 'multiple_accredited' ||
    outcome === 'exception_rt_2' ||
    outcome === 'exception_rt_3';
  if (owesRefund) {
    try {
      await processRefundsForAttempt(attemptId, options.deps);
    } catch (err) {
      // O reembolso continua `pendente` e visivel; F3-008 retenta (PD-8.6).
      console.error('[request] falha na primeira tentativa de reembolso', {
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
  return outcome;
}
