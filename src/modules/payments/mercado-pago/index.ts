// Adaptador do Mercado Pago (F3-004, #94). Interno ao modulo `payments`: so o
// `index.ts` do modulo reexporta o que o dominio usa, em termos do TROQ
// (ADR-0004, decisao 10; payments-design.md, PD-11.5).
export {
  createMercadoPagoClient,
  MERCADO_PAGO_API_BASE_URL,
  type CreatePixChargeInput,
  type GatewayFailure,
  type GatewayResult,
  type MercadoPagoClient,
  type MercadoPagoClientOptions,
  type PixChargeCreated,
  type RefundOutcome,
  type RefundTransaction,
} from './client';
export {
  classifyAccreditation,
  toSearchedPayments,
  type AccreditationDivergence,
  type AccreditationVerdict,
  type AccreditedPayment,
  type SearchedPayment,
} from './accreditation';
export {
  classifyState,
  toOrderSnapshot,
  type AuthoritativeState,
  type OrderSnapshot,
  type PixInstructions,
  type ProviderPaymentFact,
} from './classify';
export { MERCADO_PAGO_ENV, MercadoPagoConfigError, readWebhookConfig } from './config';
export {
  buildManifest,
  verifyNotification,
  type NotificationInput,
  type NotificationRejection,
  type NotificationVerification,
} from './signature';
export {
  amountToCents,
  centsToDecimal,
  decimalToCents,
  MIN_EXPIRATION_MS,
  parseZonedInstant,
  toIsoDuration,
} from './values';
