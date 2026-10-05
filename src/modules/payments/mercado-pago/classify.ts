import { decimalToCents, parseInstant } from './values';

// Classificacao FECHADA do estado autoritativo da order (payments-design.md,
// PD-6.6 passo 3; PD-3.6; CI-9). Unico lugar que interpreta `status` e
// `status_detail` do provedor (PD-11.5). Fontes dos valores: MP-2 e MP-3 de
// payment-exceptions.md (status da order e da transacao), conferidos em
// 2026-10-01 contra a documentacao vigente e os tipos do SDK oficial.
//
// Regra que nao se negocia: qualquer valor ausente, fora da lista ou
// contraditorio e `unknown`, e `unknown` NUNCA e aprovado.

export type AuthoritativeState =
  /** `processed`/`accredited` na order E na transacao Pix. */
  | { kind: 'accredited' }
  /** `created`, `processing`, `action_required`: sem acreditacao, nao terminal. */
  | { kind: 'pending' }
  /** `expired`, `canceled`, `failed`: sem acreditacao, terminal. */
  | { kind: 'not_accredited_terminal'; outcome: 'expired' | 'canceled' | 'failed' }
  /**
   * Devolucao ou contestacao: a acreditacao deixou de valer (PD-9). `reason` e
   * um codigo fechado do TROQS que diz qual estado a caracterizou (PE-11, tabela
   * de auditoria; F3-011): `order_refunded`, `order_charged_back`,
   * `processed_refunded` ou `processed_partially_refunded`.
   */
  | { kind: 'reversed'; reason: ReversalReason }
  /** Fora da lista, ausente ou contraditorio: nunca aprovado (PD-3.6). */
  | { kind: 'unknown'; reason: string };

/** Fato de pagamento reportado pelo provedor, em termos do TROQS (PD-2.2). */
export interface ProviderPaymentFact {
  providerPaymentId: string;
  isPix: boolean;
  amountCents: number | null;
  paidAmountCents: number | null;
  providerStatus: string;
  providerStatusDetail: string | null;
  /**
   * Sempre `null` na order: a Orders API nao traz data de aprovacao no
   * pagamento (ADR-0008). O instante autoritativo vem da busca da Payments API
   * (`classifyAccreditation`), nunca de campo adivinhado aqui.
   */
  accreditedAt: null;
}

export interface OrderSnapshot {
  providerOrderId: string;
  externalReference: string | null;
  state: AuthoritativeState;
  payments: ProviderPaymentFact[];
  totalPaidCents: number | null;
  /** Instante de expiracao absoluto informado pelo provedor, se houver. */
  pixExpiresAt: Date | null;
  createdAt: Date | null;
  lastUpdatedAt: Date | null;
}

type Raw = Record<string, unknown>;

function isRaw(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function rawPayments(order: Raw): Raw[] {
  const transactions = isRaw(order.transactions) ? order.transactions : null;
  const payments = transactions?.payments;
  return Array.isArray(payments) ? payments.filter(isRaw) : [];
}

function paymentMethodId(payment: Raw): string | null {
  return isRaw(payment.payment_method) ? str(payment.payment_method.id) : null;
}

const PENDING = new Set(['created', 'processing', 'action_required']);
const TERMINAL = new Map<string, 'expired' | 'canceled' | 'failed'>([
  ['expired', 'expired'],
  ['canceled', 'canceled'],
  ['failed', 'failed'],
]);
/** Codigo fechado do estado que caracterizou a reversao (vocabulario do TROQS). */
export type ReversalReason =
  'order_refunded' | 'order_charged_back' | 'processed_refunded' | 'processed_partially_refunded';

// `charged_back` e valor tecnico da API, nao afirmacao de chargeback no Pix
// (PD-9.3, PE-8.1).
const REVERSED_STATUS = new Map<string, ReversalReason>([
  ['refunded', 'order_refunded'],
  ['charged_back', 'order_charged_back'],
]);
const REVERSED_DETAIL_ON_PROCESSED = new Map<string, ReversalReason>([
  ['refunded', 'processed_refunded'],
  ['partially_refunded', 'processed_partially_refunded'],
]);

export function classifyState(order: Raw): AuthoritativeState {
  const status = str(order.status);
  const detail = str(order.status_detail);
  if (!status) return { kind: 'unknown', reason: 'order_status_missing' };

  const reversedStatus = REVERSED_STATUS.get(status);
  if (reversedStatus) return { kind: 'reversed', reason: reversedStatus };
  if (status === 'processed') {
    const reversedDetail = detail ? REVERSED_DETAIL_ON_PROCESSED.get(detail) : undefined;
    if (reversedDetail) return { kind: 'reversed', reason: reversedDetail };
    if (detail !== 'accredited') return { kind: 'unknown', reason: 'processed_detail_unmapped' };
    const pix = rawPayments(order).filter((p) => paymentMethodId(p) === 'pix');
    if (pix.length === 0) return { kind: 'unknown', reason: 'pix_payment_missing' };
    const pixAccredited = pix.some(
      (p) => str(p.status) === 'processed' && str(p.status_detail) === 'accredited',
    );
    // Order acreditada sem transacao Pix acreditada e contradicao: nao aprova.
    if (!pixAccredited) return { kind: 'unknown', reason: 'pix_payment_not_accredited' };
    return { kind: 'accredited' };
  }
  if (PENDING.has(status)) return { kind: 'pending' };
  const terminal = TERMINAL.get(status);
  if (terminal) return { kind: 'not_accredited_terminal', outcome: terminal };
  return { kind: 'unknown', reason: 'order_status_unmapped' };
}

function paymentFact(payment: Raw): ProviderPaymentFact | null {
  const id = str(payment.id);
  if (!id) return null;
  return {
    providerPaymentId: id,
    isPix: paymentMethodId(payment) === 'pix',
    amountCents: decimalToCents(payment.amount),
    paidAmountCents: decimalToCents(payment.paid_amount),
    providerStatus: str(payment.status) ?? 'missing',
    providerStatusDetail: str(payment.status_detail),
    accreditedAt: null,
  };
}

/** Snapshot da order em termos do TROQS, ou `null` se nem o identificador existe. */
export function toOrderSnapshot(order: unknown): OrderSnapshot | null {
  if (!isRaw(order)) return null;
  const id = str(order.id);
  if (!id) return null;
  const payments = rawPayments(order);
  const pix = payments.find((p) => paymentMethodId(p) === 'pix');
  return {
    providerOrderId: id,
    externalReference: str(order.external_reference),
    state: classifyState(order),
    payments: payments.map(paymentFact).filter((p): p is ProviderPaymentFact => p !== null),
    totalPaidCents: decimalToCents(order.total_paid_amount),
    pixExpiresAt: pix ? parseInstant(pix.date_of_expiration) : null,
    createdAt: parseInstant(order.created_date),
    lastUpdatedAt: parseInstant(order.last_updated_date),
  };
}

export interface PixInstructions {
  /** Pix copia e cola (BR Code). Persistir na criacao: some apos a acreditacao (spike, exp. 4). */
  qrCode: string;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
}

/** Instrucoes de pagamento da transacao Pix, presentes so na criacao. */
export function pixInstructions(order: unknown): PixInstructions | null {
  if (!isRaw(order)) return null;
  const pix = rawPayments(order).find((p) => paymentMethodId(p) === 'pix');
  const method = pix && isRaw(pix.payment_method) ? pix.payment_method : null;
  const qrCode = method ? str(method.qr_code) : null;
  if (!method || !qrCode) return null;
  return {
    qrCode,
    qrCodeBase64: str(method.qr_code_base64),
    ticketUrl: str(method.ticket_url),
  };
}
