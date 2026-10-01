import { toSearchedPayments, type SearchedPayment } from './accreditation';
import {
  pixInstructions,
  toOrderSnapshot,
  type OrderSnapshot,
  type PixInstructions,
} from './classify';
import { readAccessToken } from './config';
import { centsToDecimal, toIsoDuration } from './values';

// Cliente HTTP da Orders API (ADR-0004, decisoes 3, 5, 7 e 11; payments-design.md,
// PD-4.1 passo 2, PD-5.3, PD-8.3 a PD-8.5, PD-6.9). `fetch` nativo, sem SDK.
// Unica leitura fora da Orders API: a busca de pagamentos da Payments API, so
// para o instante de acreditacao (ADR-0008). A busca de orders por
// `external_reference` (`GET /v1/orders`) e da propria Orders API e so serve a
// reconciliacao, para achar a order de uma tentativa que nao a registrou (F3-008).
//
// - Toda escrita leva `X-Idempotency-Key` RECEBIDA do chamador: a chave e da
//   tentativa persistida (PD-5.2) e nunca e gerada aqui.
// - `notification_url` nunca e enviado: a Orders API o rejeita e a URL e da
//   aplicacao (ADR-0004, decisao 11).
// - Falha de rede, timeout e 5xx viram `unavailable`, que nunca e aprovacao
//   (PD-6.9). 4xx vira `rejected` com o CODIGO do provedor, sem a mensagem.
// - Nenhum resultado, erro ou excecao carrega o token ou o corpo enviado.

export const MERCADO_PAGO_API_BASE_URL = 'https://api.mercadopago.com';
const DEFAULT_TIMEOUT_MS = 10_000;
const ERROR_CODE = /^[a-z0-9_]{1,64}$/i;

export type GatewayFailure =
  | {
      ok: false;
      kind: 'unavailable';
      reason: 'network' | 'timeout' | 'server_error' | 'rate_limited' | 'in_process';
    }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'rejected'; httpStatus: number; code: string };

export type GatewayResult<T> = { ok: true; value: T } | GatewayFailure;

export interface CreatePixChargeInput {
  idempotencyKey: string;
  externalReference: string;
  amountCents: number;
  /** Prazo desejado ate a expiracao; nunca enviado abaixo do minimo documentado. */
  expiresInMs: number;
  payerEmail: string;
}

export interface PixChargeCreated {
  snapshot: OrderSnapshot;
  instructions: PixInstructions | null;
}

export type RefundOutcome = {
  refunded: true;
  alreadyRefunded: boolean;
  /** Primeiro `transactions.refunds[].id` da resposta (MP-5), se houver. */
  providerRefundId: string | null;
};

/** Janela de criacao da busca de orders; a Orders API exige as duas datas. */
export interface OrderSearchWindow {
  createdFrom: Date;
  createdTo: Date;
}

/** Transacao da order a devolver por inteiro (decisao RT-1 do Bruno, F3-007). */
export interface RefundTransaction {
  providerTransactionId: string;
  amountCents: number;
}

function refundIdOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const transactions = (body as Record<string, unknown>).transactions;
  if (typeof transactions !== 'object' || transactions === null) return null;
  const refunds = (transactions as Record<string, unknown>).refunds;
  const first = Array.isArray(refunds) ? (refunds[0] as Record<string, unknown> | undefined) : null;
  const id = first?.id;
  return typeof id === 'string' && ERROR_CODE.test(id) ? id : null;
}

export interface MercadoPagoClientOptions {
  /** Somente para teste: `fetch` e URL base injetados por fabrica, nunca por variavel. */
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

interface RawResponse {
  status: number;
  body: unknown;
}

function errorCode(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    const errors = record.errors;
    const first = Array.isArray(errors) ? (errors[0] as Record<string, unknown> | undefined) : null;
    for (const candidate of [first?.code, record.code, record.error]) {
      if (typeof candidate === 'string' && ERROR_CODE.test(candidate)) return candidate;
    }
  }
  return 'unmapped';
}

export function createMercadoPagoClient(options: MercadoPagoClientOptions = {}) {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? MERCADO_PAGO_API_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call(
    method: 'GET' | 'POST',
    path: string,
    idempotencyKey: string | null,
    body?: unknown,
  ): Promise<RawResponse | GatewayFailure> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${readAccessToken()}`,
      Accept: 'application/json',
    };
    if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      return { ok: false, kind: 'unavailable', reason: timedOut ? 'timeout' : 'network' };
    }
    if (response.status >= 500) {
      return { ok: false, kind: 'unavailable', reason: 'server_error' };
    }
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { status: response.status, body: parsed };
  }

  function isFailure(value: RawResponse | GatewayFailure): value is GatewayFailure {
    return 'ok' in value;
  }

  function fail(raw: RawResponse): GatewayFailure {
    const code = errorCode(raw.body);
    if (raw.status === 404 || code === 'order_not_found') return { ok: false, kind: 'not_found' };
    return { ok: false, kind: 'rejected', httpStatus: raw.status, code };
  }

  function snapshotOf(raw: RawResponse): GatewayResult<OrderSnapshot> {
    const snapshot = toOrderSnapshot(raw.body);
    // 2xx sem identificador de order nao e resposta interpretavel: nunca aprova.
    if (!snapshot) return { ok: false, kind: 'rejected', httpStatus: raw.status, code: 'unmapped' };
    return { ok: true, value: snapshot };
  }

  return {
    /** `POST /v1/orders`: cobranca Pix de valor exato (PD-4.1, passo 2). */
    async createPixCharge(input: CreatePixChargeInput): Promise<GatewayResult<PixChargeCreated>> {
      const amount = centsToDecimal(input.amountCents);
      const raw = await call('POST', '/v1/orders', input.idempotencyKey, {
        type: 'online',
        processing_mode: 'automatic',
        external_reference: input.externalReference,
        total_amount: amount,
        payer: { email: input.payerEmail },
        transactions: {
          payments: [
            {
              amount,
              payment_method: { id: 'pix', type: 'bank_transfer' },
              expiration_time: toIsoDuration(input.expiresInMs),
            },
          ],
        },
      });
      if (isFailure(raw)) return raw;
      if (raw.status !== 200 && raw.status !== 201) return fail(raw);
      const snapshot = snapshotOf(raw);
      if (!snapshot.ok) return snapshot;
      return {
        ok: true,
        value: { snapshot: snapshot.value, instructions: pixInstructions(raw.body) },
      };
    },

    /** `GET /v1/orders/{id}`: a consulta autoritativa (PD-6.6, PD-10.1). */
    async getOrder(providerOrderId: string): Promise<GatewayResult<OrderSnapshot>> {
      const raw = await call('GET', `/v1/orders/${encodeURIComponent(providerOrderId)}`, null);
      if (isFailure(raw)) return raw;
      if (raw.status !== 200) return fail(raw);
      return snapshotOf(raw);
    },

    /**
     * `GET /v1/orders/{id}` com as instrucoes Pix, para reapresenta-las ao
     * solicitante. O provedor so as devolve antes da acreditacao (spike, exp. 4);
     * depois, `instructions` e `null`.
     */
    async getPixCharge(providerOrderId: string): Promise<GatewayResult<PixChargeCreated>> {
      const raw = await call('GET', `/v1/orders/${encodeURIComponent(providerOrderId)}`, null);
      if (isFailure(raw)) return raw;
      if (raw.status !== 200) return fail(raw);
      const snapshot = snapshotOf(raw);
      if (!snapshot.ok) return snapshot;
      return {
        ok: true,
        value: { snapshot: snapshot.value, instructions: pixInstructions(raw.body) },
      };
    },

    /**
     * `GET /v1/payments/search?external_reference=...`: SO LEITURA, so para o
     * instante de acreditacao (ADR-0008, decisao 2). O veredito e de
     * `classifyAccreditation`; aqui so se traduz a resposta.
     */
    async findPaymentAccreditation(
      externalReference: string,
    ): Promise<GatewayResult<SearchedPayment[]>> {
      const query = new URLSearchParams({ external_reference: externalReference });
      const raw = await call('GET', `/v1/payments/search?${query.toString()}`, null);
      if (isFailure(raw)) return raw;
      if (raw.status !== 200) return fail(raw);
      const payments = toSearchedPayments(raw.body);
      // 200 sem lista de resultados nao e resposta interpretavel: nunca aprova.
      if (!payments)
        return { ok: false, kind: 'rejected', httpStatus: raw.status, code: 'unmapped' };
      return { ok: true, value: payments };
    },

    /**
     * `GET /v1/orders?begin_date&end_date&external_reference`: SO LEITURA. Acha a
     * order de uma tentativa que nao chegou a registra-la (passo 3 de PD-4.1
     * perdido; F3-008). `begin_date` e `end_date` sao obrigatorios (referencia
     * oficial conferida em 2026-10-01). Quem chama confere a referencia de cada
     * resultado e rele a order por `getOrder` antes de qualquer efeito.
     */
    async searchOrdersByReference(
      externalReference: string,
      window: OrderSearchWindow,
    ): Promise<GatewayResult<OrderSnapshot[]>> {
      const query = new URLSearchParams({
        begin_date: window.createdFrom.toISOString(),
        end_date: window.createdTo.toISOString(),
        external_reference: externalReference,
      });
      const raw = await call('GET', `/v1/orders?${query.toString()}`, null);
      if (isFailure(raw)) return raw;
      if (raw.status !== 200) return fail(raw);
      const data =
        typeof raw.body === 'object' && raw.body !== null
          ? (raw.body as Record<string, unknown>).data
          : undefined;
      // 200 sem lista, ou com item sem identificador, nao e resposta interpretavel.
      const orders = Array.isArray(data) ? data.map(toOrderSnapshot) : null;
      if (!orders || orders.some((o) => o === null)) {
        return { ok: false, kind: 'rejected', httpStatus: raw.status, code: 'unmapped' };
      }
      return { ok: true, value: orders as OrderSnapshot[] };
    },

    /** `POST /v1/orders/{id}/cancel`: so sem acreditacao (PD-8.3, MP-6). Nao e reembolso. */
    async cancelOrder(
      providerOrderId: string,
      idempotencyKey: string,
    ): Promise<GatewayResult<OrderSnapshot>> {
      const raw = await call(
        'POST',
        `/v1/orders/${encodeURIComponent(providerOrderId)}/cancel`,
        idempotencyKey,
      );
      if (isFailure(raw)) return raw;
      if (raw.status !== 200 && raw.status !== 201) return fail(raw);
      return snapshotOf(raw);
    },

    /**
     * `POST /v1/orders/{id}/refund` (MP-5). Sem `transaction`: reembolso TOTAL da
     * order, sem corpo (PD-8.4). Com `transaction`: devolve SO aquela transacao,
     * pelo valor CHEIO dela — `transactions[{ id, amount }]` —, para o excedente
     * de duplicidade sem tocar o canonico (decisao RT-1, F3-007; PE-7.3 lida como
     * "cada pagamento e devolvido por inteiro").
     * `order_already_refunded` e desfecho de SUCESSO, nao erro (PD-8.5, PE-7.11).
     * Transitorios DOCUMENTADOS na lista de erros desta rota (referencia oficial
     * conferida em 2026-10-01; F3-008) viram `unavailable`, para a retentativa:
     * HTTP 429 (`too_many_requests`, `usage_quota_exceeded`) e 409
     * `order_refund_already_in_process`. Saldo insuficiente e prazo de 180 dias
     * NAO constam dessa lista: chegam como `rejected` com o codigo bruto.
     */
    async refundOrder(
      providerOrderId: string,
      idempotencyKey: string,
      transaction?: RefundTransaction,
    ): Promise<GatewayResult<RefundOutcome>> {
      const raw = await call(
        'POST',
        `/v1/orders/${encodeURIComponent(providerOrderId)}/refund`,
        idempotencyKey,
        transaction
          ? {
              transactions: [
                {
                  id: transaction.providerTransactionId,
                  amount: centsToDecimal(transaction.amountCents),
                },
              ],
            }
          : undefined,
      );
      if (isFailure(raw)) return raw;
      if (raw.status === 200 || raw.status === 201) {
        return {
          ok: true,
          value: { refunded: true, alreadyRefunded: false, providerRefundId: refundIdOf(raw.body) },
        };
      }
      const code = errorCode(raw.body);
      if (code === 'order_already_refunded') {
        return {
          ok: true,
          value: { refunded: true, alreadyRefunded: true, providerRefundId: null },
        };
      }
      if (raw.status === 429) return { ok: false, kind: 'unavailable', reason: 'rate_limited' };
      if (code === 'order_refund_already_in_process') {
        return { ok: false, kind: 'unavailable', reason: 'in_process' };
      }
      return fail(raw);
    },
  };
}

export type MercadoPagoClient = ReturnType<typeof createMercadoPagoClient>;
