import {
  claimConfirmedForReversalCheck,
  recordReconciliation,
  runClaimLoop,
  type ClaimHooks,
  type ConfirmationDeps,
  type JobLoopCounts,
  type JobLoopOptions,
} from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';
import { confirmPaymentFlow, type PaymentConfirmationOutcome } from './payment-confirmation';

// Varredura diaria de reversoes (F3-011, #101; payments-design.md, PD-3.4,
// PD-9.1, PD-9.2, PD-10.2 e PD-10.7; payment-exceptions.md, PE-8.4, PE-9.3;
// CI-8). O provedor nao expoe notificacao de reembolso nem de reversao
// (PE-8.4): a unica deteccao possivel e reconsultar os pagamentos ja
// confirmados. Chamada por GET /api/jobs/payments-reversals (CRON_SECRET).
//
// `payments` reclama as tentativas `pagamento_confirmado` por `SKIP LOCKED`
// numa transacao curta que empurra `next_reversal_check_at` 24 h e commita;
// so depois, sem trava segurada, cada tentativa vai ao MESMO
// `confirmPaymentFlow` do webhook e da reconciliacao, com origem
// `reconciliacao`. Ele le o estado autoritativo fora de transacao e decide o
// efeito sob a trava do anuncio (payment-confirmation.ts):
//
// - ainda acreditada -> nada muda (`already_confirmed`);
// - reversao ou terminal sem acreditacao -> `reembolsada_ou_revertida`, evento
//   `payment.reversed`; `paid` e a vaga ficam (DM-6.7); a solicitacao sai da
//   elegibilidade; a liberacao concedida nao e tocada (CR-4.3); nenhuma
//   cobranca nova;
// - pendente, desconhecido ou reversao ambigua -> caso `inconsistente`, sem
//   transicao (PD-10.5);
// - indisponivel -> nada muda; volta na proxima varredura (PD-6.9).

export type ReversalCheckOutcome =
  'still_accredited' | 'reversed' | 'inconsistent' | 'unavailable' | 'unchanged';

const FROM_CONFIRMATION: Record<PaymentConfirmationOutcome, ReversalCheckOutcome> = {
  already_confirmed: 'still_accredited',
  reversed_after_confirmation: 'reversed',
  inconsistent: 'inconsistent',
  unavailable: 'unavailable',
  // Os demais nao acontecem com a tentativa confirmada; se acontecerem por
  // corrida, nada foi feito por esta passagem.
  confirmed: 'unchanged',
  exception_rt_2: 'unchanged',
  exception_rt_3: 'unchanged',
  not_accredited: 'unchanged',
  pending: 'unchanged',
  no_order: 'unchanged',
  reversed: 'unchanged',
  not_found: 'unchanged',
  no_effect: 'unchanged',
};

/**
 * Um exame de UMA tentativa ja reclamada. Rele o estado (a reclamacao nao o
 * congela): se ja nao esta confirmada, nao ha o que examinar. Grava o codigo da
 * ultima passagem para diagnostico, sem mexer na agenda da reconciliacao.
 */
export async function checkConfirmedAttemptForReversal(
  attemptId: string,
  deps: ConfirmationDeps = {},
): Promise<ReversalCheckOutcome> {
  const [row] = await getPrismaClient().$queryRaw<{ status: string }[]>`
    SELECT "status"::text AS "status" FROM "payment_attempts" WHERE "id" = ${attemptId}::uuid`;
  if (row?.status !== 'pagamento_confirmado') return 'unchanged';
  const outcome =
    FROM_CONFIRMATION[await confirmPaymentFlow(attemptId, { origin: 'reconciliacao', deps })];
  await recordReconciliation(attemptId, `reversal_check_${outcome}`);
  return outcome;
}

export interface ReversalSweepSummary extends JobLoopCounts {
  stillAccredited: number;
  reversed: number;
  inconsistent: number;
  unavailable: number;
  unchanged: number;
}

export interface ReversalSweepOptions extends JobLoopOptions {
  deps?: ConfirmationDeps;
  hooks?: ClaimHooks;
}

const BUCKET: Record<ReversalCheckOutcome, keyof ReversalSweepSummary> = {
  still_accredited: 'stillAccredited',
  reversed: 'reversed',
  inconsistent: 'inconsistent',
  unavailable: 'unavailable',
  unchanged: 'unchanged',
};

/** Uma execucao da varredura. Segura para execucoes sobrepostas e repetidas. */
export async function runPaymentReversalSweep(
  options: ReversalSweepOptions,
): Promise<ReversalSweepSummary> {
  const summary: ReversalSweepSummary = {
    claimed: 0,
    stillAccredited: 0,
    reversed: 0,
    inconsistent: 0,
    unavailable: 0,
    unchanged: 0,
    deferred: 0,
    errors: 0,
  };
  const deps = options.deps ?? {};
  const counts = await runClaimLoop(
    options,
    (limit) => claimConfirmedForReversalCheck(limit, options.hooks),
    async (attemptId) => {
      summary[BUCKET[await checkConfirmedAttemptForReversal(attemptId, deps)]] += 1;
    },
    'reversao',
  );
  return { ...summary, ...counts };
}
