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
// tentativa com a chave de idempotencia persistida (PD-2.1, PD-5); a cobranca,
// a confirmacao e o reembolso vem nas issues seguintes da Fase 3.
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

// F3-004 (#94): adaptador do Mercado Pago. O dominio recebe snapshot e veredito
// em termos do TROQ; o vocabulario do provedor fica em ./mercado-pago.
export {
  createMercadoPagoClient,
  MercadoPagoConfigError,
  readWebhookConfig,
  verifyNotification,
} from './mercado-pago';
export type {
  AuthoritativeState,
  CreatePixChargeInput,
  GatewayFailure,
  GatewayResult,
  MercadoPagoClient,
  NotificationInput,
  NotificationRejection,
  NotificationVerification,
  OrderSnapshot,
  PixChargeCreated,
  PixInstructions,
  ProviderPaymentFact,
  RefundOutcome,
} from './mercado-pago';
