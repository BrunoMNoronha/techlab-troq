// Modulo de dominio `request` (docs/architecture/overview.md, AR-3.3).
//
// Responsabilidade: Solicitacao de desbloqueio e reserva de vaga (RB-003).
// Entidades proprias (docs/architecture/data-model.md): `ContactRequest`.
//
// Dono da vaga de RB-003 e distinto de `payments` (AR-3.5): a vaga e reservada
// antes da cobranca, e este modulo decide o efeito de um fato de pagamento
// sobre a vaga.
//
// Este arquivo e a API PUBLICA do modulo: o que nao for exportado aqui nao e
// importado de fora (docs/engineering/conventions.md, secao 2.2). Consumidores
// externos importam `@/modules/request`; nunca um caminho interno do modulo.
//
// F1-005 materializou a fronteira e #59 a entrada da jornada (somente leitura).
// F3-003 (#93) acrescenta a reserva atomica de vaga com a tentativa de
// pagamento e o efeito de T5/T6 sobre as reservas (DM-6.10). Dependencia
// direcional: `request` -> `listing`, `payments`; nunca o inverso.
export { getContactRequestEntry } from './entry';
export type { ContactRequestEntryState } from './entry';
export { getPixPayment, requestContactUnlock } from './actions';
export { getPixPaymentFlow, requestContactUnlockFlow } from './charge-flow';
export type { PixChargeFailureReason, PixChargeResult } from './charge-flow';
export { createContactRequest, RESERVATION_WINDOW_MS } from './reservation';
export type { ContactRequestFailureReason, ContactRequestResult } from './reservation';
export { cancelChargesOfClosedListing, endOpenReservationsOnListingClosure } from './closure';
// F3-006 (#96): efeito do fato de pagamento sobre a vaga, sob a trava do anuncio.
export { confirmPaymentFlow } from './payment-confirmation';
export type {
  PaymentConfirmationOptions,
  PaymentConfirmationOutcome,
} from './payment-confirmation';
// F3-009 (#99): elegibilidade para a escolha, lida sob a trava (CR-3.2, P2 e P3).
export { listEligibleRequests, lockRequestForSelection, readRequestLinkInTx } from './selection';
export type {
  EligibleRequest,
  LockedRequestForSelection,
  RequestLink,
  SelectionReader,
} from './selection';
// F3-008 (#98): reconciliacao periodica, pela mesma rotina do webhook.
export { reconcileAttempt, runPaymentReconciliation } from './reconciliation';
export type {
  ReconcileOutcome,
  ReconcileResult,
  ReconciliationOptions,
  ReconciliationSummary,
} from './reconciliation';
