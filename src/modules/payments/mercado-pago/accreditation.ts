import { amountToCents, parseZonedInstant } from './values';

// Instante de acreditacao autoritativo (ADR-0008, DEC-043; payments-design.md,
// PD-6.6 e PD-6.7). A Orders API nao traz data de aprovacao no pagamento da
// order; a fonte e a Payments API, lida SO PARA LEITURA por
// `GET /v1/payments/search?external_reference=<da tentativa>`.
//
// Classificacao FECHADA do resultado da busca (ADR-0008, decisao 4). Funcao
// pura: o cliente HTTP so traduz a resposta; o veredito sai daqui.
//
// - `approved`: exatamente um pagamento `approved`/`accredited`, com a mesma
//   `external_reference`, o mesmo valor e `date_approved` com data, hora e fuso;
// - `absent`: nenhum resultado (atraso de indexacao) — tratado como
//   indisponibilidade pelo chamador, nunca como recusa;
// - `multiple`: mais de um aprovado — segue para duplicidade (PD-7, F3-007);
// - `divergent`: qualquer contradicao com a tentativa — `inconsistente`.
//
// Nunca usa `last_updated_date`, chegada da notificacao ou processamento.

/** Um pagamento devolvido pela busca, em termos do TROQ. */
export interface SearchedPayment {
  providerPaymentId: string | null;
  status: string | null;
  statusDetail: string | null;
  externalReference: string | null;
  amountCents: number | null;
  /** `date_approved` so se vier completa e com fuso; senao `null`. */
  approvedAt: Date | null;
}

export type AccreditationVerdict =
  | { kind: 'approved'; accreditedAt: Date; providerPaymentId: string | null }
  | { kind: 'absent' }
  /** Dois ou mais aprovados, TODOS validos: candidatos a eleicao de PD-7.1. */
  | { kind: 'multiple'; payments: AccreditedPayment[] }
  | { kind: 'divergent'; reason: AccreditationDivergence };

export interface AccreditedPayment {
  providerPaymentId: string;
  accreditedAt: Date;
}

export type AccreditationDivergence =
  | 'reference_mismatch'
  | 'payment_not_approved'
  | 'detail_not_accredited'
  | 'amount_mismatch'
  | 'date_approved_invalid'
  | 'payment_id_missing';

type Raw = Record<string, unknown>;

function isRaw(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return null;
}

/** Corpo de `GET /v1/payments/search` -> pagamentos, ou `null` se ininteligivel. */
export function toSearchedPayments(body: unknown): SearchedPayment[] | null {
  if (!isRaw(body) || !Array.isArray(body.results)) return null;
  return body.results.filter(isRaw).map((p) => ({
    providerPaymentId: str(p.id),
    status: str(p.status),
    statusDetail: str(p.status_detail),
    externalReference: str(p.external_reference),
    amountCents: amountToCents(p.transaction_amount),
    approvedAt: parseZonedInstant(p.date_approved),
  }));
}

export function classifyAccreditation(
  payments: readonly SearchedPayment[],
  expected: { externalReference: string; amountCents: number },
): AccreditationVerdict {
  if (payments.length === 0) return { kind: 'absent' };
  if (payments.some((p) => p.externalReference !== expected.externalReference)) {
    return { kind: 'divergent', reason: 'reference_mismatch' };
  }
  const approved = payments.filter((p) => p.status === 'approved');
  if (approved.length === 0) return { kind: 'divergent', reason: 'payment_not_approved' };

  // Cada aprovado tem de ser acreditado, do valor certo e com instante valido;
  // um so que nao seja torna o conjunto contraditorio (nunca elege por analogia).
  const accredited: AccreditedPayment[] = [];
  for (const payment of approved) {
    if (payment.statusDetail !== 'accredited') {
      return { kind: 'divergent', reason: 'detail_not_accredited' };
    }
    if (payment.amountCents !== expected.amountCents) {
      return { kind: 'divergent', reason: 'amount_mismatch' };
    }
    if (!payment.approvedAt) return { kind: 'divergent', reason: 'date_approved_invalid' };
    if (approved.length > 1 && !payment.providerPaymentId) {
      return { kind: 'divergent', reason: 'payment_id_missing' };
    }
    accredited.push({
      providerPaymentId: payment.providerPaymentId ?? '',
      accreditedAt: payment.approvedAt,
    });
  }
  if (accredited.length > 1) return { kind: 'multiple', payments: accredited };
  const [payment] = approved;
  return {
    kind: 'approved',
    accreditedAt: accredited[0].accreditedAt,
    providerPaymentId: payment.providerPaymentId,
  };
}
