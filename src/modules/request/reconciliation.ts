import {
  adoptOrphanOrder,
  cancelUnaccreditedCharge,
  claimAttemptsForReconciliation,
  observeAttempt,
  recordReconciliation,
  runClaimLoop,
  type ClaimHooks,
  type ConfirmationDeps,
  type JobLoopCounts,
  type JobLoopOptions,
} from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';
import { confirmPaymentFlow, type PaymentConfirmationOutcome } from './payment-confirmation';

// Reconciliacao periodica de tentativas (F3-008, #98; payments-design.md,
// PD-3.4, PD-10.1 a PD-10.7; payment-exceptions.md, PE-9). Cadencia contratual
// de 5 minutos, chamada por GET /api/jobs/payments-reconcile (CRON_SECRET).
//
// `payments` reclama as tentativas por `SKIP LOCKED` numa transacao curta que
// avanca `next_reconcile_at` e commita (nota de 2026-10-01 em PD-10.7); so
// depois, sem nenhuma trava segurada, cada tentativa e levada ao fluxo que ja
// existe, que toma a trava do ANUNCIO na sua propria transacao curta:
//
// - `aguardando_pagamento`/`em_confirmacao` -> `confirmPaymentFlow` com origem
//   `reconciliacao`: a MESMA rotina do webhook, que reconstroi o estado sem
//   nenhuma notificacao (PD-10.1, CI-3, T-5);
// - a mesma tentativa, de solicitacao `failed` por T5/T6 -> cancelamento
//   pendente de PD-8.10 (`cancelUnaccreditedCharge`); se a order ja acreditou,
//   a confirmacao aplica RT-3;
// - `tentativa_criada` de reserva viva -> nada: quem retoma e o solicitante
//   (`getPixPaymentFlow`). Vencida a janela -> procura SO LEITURA da order
//   perdida (`adoptOrphanOrder`) e, achando, segue o primeiro caminho;
// - `inconsistente` ou com caso aberto -> so reobserva e registra. NUNCA fecha
//   caso nem resolve a favor da aprovacao (PD-10.4, PD-10.5): a resolucao e
//   operacional.
//
// Indisponibilidade nao muda nada e o caso volta no proximo ciclo (PD-6.9).

/** Orfa ainda nao achada: reprocurada de hora em hora no primeiro dia, depois diariamente. */
export const ORPHAN_RETRY_SECONDS = 60 * 60;
export const ORPHAN_RETRY_LATE_SECONDS = 24 * 60 * 60;
const ORPHAN_LATE_AFTER_MS = 24 * 60 * 60 * 1000;

export type ReconcileOutcome =
  | 'confirmed'
  | 'exception'
  | 'not_accredited'
  | 'pending'
  | 'canceled'
  | 'requester_owned'
  | 'orphan_not_found'
  | 'observed'
  | 'reversed'
  | 'unavailable'
  | 'inconsistent'
  | 'unchanged';

export interface ReconcileResult {
  outcome: ReconcileOutcome;
  /** A order perdida foi achada e registrada nesta passagem. */
  adopted: boolean;
}

interface AttemptState {
  status: string;
  contactRequestId: string;
  requestStatus: string;
  reservedUntil: Date;
  now: Date;
}

async function readState(attemptId: string): Promise<AttemptState | null> {
  const [row] = await getPrismaClient().$queryRaw<AttemptState[]>`
    SELECT pa."status"::text AS "status", pa."contact_request_id"::text AS "contactRequestId",
           cr."status"::text AS "requestStatus", cr."reserved_until" AS "reservedUntil",
           now() AS "now"
    FROM "payment_attempts" pa
    JOIN "contact_requests" cr ON cr."id" = pa."contact_request_id"
    WHERE pa."id" = ${attemptId}::uuid`;
  return row ?? null;
}

const FROM_CONFIRMATION: Record<PaymentConfirmationOutcome, ReconcileOutcome> = {
  confirmed: 'confirmed',
  already_confirmed: 'confirmed',
  exception_rt_2: 'exception',
  exception_rt_3: 'exception',
  not_accredited: 'not_accredited',
  pending: 'pending',
  unavailable: 'unavailable',
  inconsistent: 'inconsistent',
  // Reversao antes da confirmacao: aplicada pela mesma rotina (F3-011, PD-9.4).
  reversed: 'reversed',
  // So a varredura diaria pega tentativas confirmadas; aqui so por corrida.
  reversed_after_confirmation: 'reversed',
  no_order: 'unchanged',
  not_found: 'unchanged',
  no_effect: 'unchanged',
};

async function confirm(attemptId: string, deps: ConfirmationDeps): Promise<ReconcileOutcome> {
  return FROM_CONFIRMATION[await confirmPaymentFlow(attemptId, { origin: 'reconciliacao', deps })];
}

/** Tentativa aberta: confirmacao, ou o cancelamento pendente de PD-8.10. */
async function reconcileOpen(
  attemptId: string,
  state: AttemptState,
  deps: ConfirmationDeps,
): Promise<ReconcileOutcome> {
  if (state.requestStatus !== 'failed') return confirm(attemptId, deps);
  const { outcome } = await cancelUnaccreditedCharge(state.contactRequestId, deps);
  switch (outcome) {
    case 'canceled':
    case 'already_terminal':
      return 'canceled';
    case 'accredited':
      return confirm(attemptId, deps);
    case 'unavailable':
      return 'unavailable';
    case 'rejected':
    case 'not_applicable':
    case 'no_order':
      return 'unchanged';
  }
}

/**
 * Uma passagem da reconciliacao sobre UMA tentativa ja reclamada. Le o estado
 * de novo (a reclamacao nao o congela) e grava a ultima observacao.
 */
export async function reconcileAttempt(
  attemptId: string,
  deps: ConfirmationDeps = {},
): Promise<ReconcileResult> {
  const state = await readState(attemptId);
  if (!state) return { outcome: 'unchanged', adopted: false };

  let adopted = false;
  let outcome: ReconcileOutcome;
  let result: string | null = null;
  let deferSeconds: number | undefined;

  if (state.status === 'aguardando_pagamento' || state.status === 'em_confirmacao') {
    outcome = await reconcileOpen(attemptId, state, deps);
  } else if (state.status === 'tentativa_criada') {
    const alive =
      state.requestStatus === 'reserved' && state.reservedUntil.getTime() > state.now.getTime();
    if (alive) {
      outcome = 'requester_owned';
    } else {
      const orphan = await adoptOrphanOrder(attemptId, deps);
      if (orphan === 'adopted') {
        adopted = true;
        const after = await readState(attemptId);
        outcome = after ? await reconcileOpen(attemptId, after, deps) : 'unchanged';
      } else if (orphan === 'not_found') {
        // Sem resultado nao prova que a order nao existe: nada e inventado.
        outcome = 'orphan_not_found';
        const late = state.now.getTime() - state.reservedUntil.getTime() > ORPHAN_LATE_AFTER_MS;
        deferSeconds = late ? ORPHAN_RETRY_LATE_SECONDS : ORPHAN_RETRY_SECONDS;
      } else {
        outcome = orphan === 'not_applicable' ? 'unchanged' : orphan;
      }
    }
  } else {
    // Inconsistente ou com caso aberto: reobserva (so leitura e espelho) e
    // registra. Nenhuma transicao, nenhuma eleicao, nenhum caso fechado.
    const observed = await observeAttempt(attemptId, deps);
    outcome = 'observed';
    const fact = observed?.fact;
    const reason = fact && 'reason' in fact ? `:${fact.reason}` : '';
    result = `observed_${fact?.kind ?? 'missing'}${reason}`;
  }

  await recordReconciliation(
    attemptId,
    result ?? (adopted ? `adopted_${outcome}` : outcome),
    deferSeconds,
  );
  return { outcome, adopted };
}

export interface ReconciliationSummary extends JobLoopCounts {
  confirmed: number;
  exceptions: number;
  notAccredited: number;
  pending: number;
  canceled: number;
  adopted: number;
  requesterOwned: number;
  orphansNotFound: number;
  observed: number;
  reversed: number;
  unavailable: number;
  inconsistent: number;
  unchanged: number;
}

export interface ReconciliationOptions extends JobLoopOptions {
  deps?: ConfirmationDeps;
  hooks?: ClaimHooks;
}

const BUCKET: Record<ReconcileOutcome, keyof ReconciliationSummary> = {
  confirmed: 'confirmed',
  exception: 'exceptions',
  not_accredited: 'notAccredited',
  pending: 'pending',
  canceled: 'canceled',
  requester_owned: 'requesterOwned',
  orphan_not_found: 'orphansNotFound',
  observed: 'observed',
  reversed: 'reversed',
  unavailable: 'unavailable',
  inconsistent: 'inconsistent',
  unchanged: 'unchanged',
};

/** Uma execucao do trabalho. Seguro para execucoes sobrepostas e repetidas (T-18). */
export async function runPaymentReconciliation(
  options: ReconciliationOptions,
): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = {
    claimed: 0,
    confirmed: 0,
    exceptions: 0,
    notAccredited: 0,
    pending: 0,
    canceled: 0,
    adopted: 0,
    requesterOwned: 0,
    orphansNotFound: 0,
    observed: 0,
    reversed: 0,
    unavailable: 0,
    inconsistent: 0,
    unchanged: 0,
    deferred: 0,
    errors: 0,
  };
  const deps = options.deps ?? {};
  const counts = await runClaimLoop(
    options,
    (limit) => claimAttemptsForReconciliation(limit, options.hooks),
    async (attemptId) => {
      const { outcome, adopted } = await reconcileAttempt(attemptId, deps);
      summary[BUCKET[outcome]] += 1;
      if (adopted) summary.adopted += 1;
    },
    'reconciliacao',
  );
  return { ...summary, ...counts };
}
