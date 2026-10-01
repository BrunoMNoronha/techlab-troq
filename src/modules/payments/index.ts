// Modulo de dominio `payments` (docs/architecture/overview.md, AR-3.3).
//
// Responsabilidade: Tentativa, cobranca, confirmacao, reembolso, reconciliacao.
// Entidades proprias (docs/architecture/data-model.md): `PaymentAttempt`, `Payment`, `TechnicalRefund`, `PaymentNotification`, `ReconciliationCase`.
//
// Dono do dinheiro e distinto de `request` (AR-3.5): informa fatos de pagamento
// e nunca cria, devolve nem reabre vaga por conta propria.
//
// Este arquivo e a API PUBLICA do modulo: o que nao for exportado aqui nao e
// importado de fora (docs/engineering/conventions.md, secao 2.2). Consumidores
// externos importam `@/modules/payments`; nunca um caminho interno do modulo.
//
// F1-005 materializou a fronteira. F3-003 (#93) acrescenta a criacao da
// tentativa com a chave de idempotencia persistida (PD-2.1, PD-5); F3-005 (#95)
// a cobranca; F3-006 (#96) a notificacao e a confirmacao. O reembolso vem em
// F3-007 (#97).
export {
  createPaymentAttempt,
  deriveIdempotencyKey,
  deriveExternalReference,
  readPersistedIdempotencyKey,
} from './attempt';
export type { CreatedPaymentAttempt } from './attempt';

// F3-005 (#95): passos 2 e 3 de PD-4.1 (cobranca e registro da order).
export { chargeForReservation, REQUEST_PRICE_CENTS } from './charge';
export type {
  ChargeContext,
  ChargeDeps,
  ChargeOrigin,
  ChargeOutcome,
  PixPaymentDetails,
} from './charge';

// F3-006 (#96): notificacao, estado autoritativo e transicoes da tentativa.
// `request` aplica o efeito sobre a vaga chamando as transicoes `*InTx` dentro
// da sua transacao, sob a trava do anuncio (AR-3.5, PD-6.6 passo 4).
export {
  classifyPaymentExceptionInTx,
  confirmPaymentInTx,
  createTechnicalRefundInTx,
  resolveDuplicateInTx,
  forwardCaseInTx,
  markInconsistentInTx,
  markNotificationProcessed,
  observeAttempt,
  readAttemptStatusInTx,
  recordNotAccreditedInTx,
  recordRejectedNotification,
  registerNotification,
  returnToAwaitingPaymentInTx,
} from './confirmation';
export type {
  ConfirmationDeps,
  ObservedAttempt,
  PaymentFact,
  RecognitionOrigin,
  RegisteredNotification,
} from './confirmation';

// F3-007 (#97): reembolso tecnico e cancelamento, fora de transacao (PD-8).
export {
  cancelUnaccreditedCharge,
  processRefundsForAttempt,
  processTechnicalRefund,
} from './refund';
export type { CancelOutcome, RefundRunOutcome } from './refund';

// F3-008 (#98): trabalhos periodicos. Reclamacao por `FOR UPDATE SKIP LOCKED`
// em transacao curta que avanca o proximo instante e commita; processamento
// depois, pelos fluxos existentes (nota de 2026-10-01 em PD-10.7).
export { REFUND_BACKOFF_CAP_HOURS, REFUND_MAX_ATTEMPTS, refundBackoffHours } from './refund';
export { claimRefundsForRetry, runRefundRetry } from './refund-retry';
export type { RefundRetryOptions, RefundRetrySummary } from './refund-retry';
export {
  adoptOrphanOrder,
  claimAttemptsForReconciliation,
  RECONCILE_ACTIVE_SECONDS,
  RECONCILE_OBSERVE_SECONDS,
  recordReconciliation,
} from './reconciliation';
export type { OrphanOutcome } from './reconciliation';
export { runClaimLoop } from './jobs';
export type { ClaimHooks, JobLoopCounts, JobLoopOptions } from './jobs';

// F3-004 (#94): adaptador do Mercado Pago. O dominio recebe snapshot e veredito
// em termos do TROQ; o vocabulario do provedor fica em ./mercado-pago.
export {
  createMercadoPagoClient,
  MercadoPagoConfigError,
  readWebhookConfig,
  verifyNotification,
} from './mercado-pago';
export type {
  AccreditationVerdict,
  AccreditedPayment,
  AuthoritativeState,
  CreatePixChargeInput,
  GatewayFailure,
  GatewayResult,
  MercadoPagoClient,
  NotificationInput,
  NotificationRejection,
  NotificationVerification,
  OrderSearchWindow,
  OrderSnapshot,
  PixChargeCreated,
  PixInstructions,
  ProviderPaymentFact,
  RefundOutcome,
  RefundTransaction,
} from './mercado-pago';
