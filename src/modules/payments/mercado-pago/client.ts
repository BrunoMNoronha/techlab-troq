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
  | { ok: false; kind: 'unavailable'; reason: 'network' | 'timeout' | 'server_error' }
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

export type RefundOutcome = { refunded: true; alreadyRefunded: boolean };

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
     * `POST /v1/orders/{id}/refund` sem corpo: reembolso INTEGRAL (PD-8.4).
     * `order_already_refunded` e desfecho de SUCESSO, nao erro (PD-8.5, PE-7.11).
     */
    async refundOrder(
      providerOrderId: string,
      idempotencyKey: string,
    ): Promise<GatewayResult<RefundOutcome>> {
      const raw = await call(
        'POST',
        `/v1/orders/${encodeURIComponent(providerOrderId)}/refund`,
        idempotencyKey,
      );
      if (isFailure(raw)) return raw;
      if (raw.status === 200 || raw.status === 201) {
        return { ok: true, value: { refunded: true, alreadyRefunded: false } };
      }
      if (errorCode(raw.body) === 'order_already_refunded') {
        return { ok: true, value: { refunded: true, alreadyRefunded: true } };
      }
      return fail(raw);
    },
  };
}

export type MercadoPagoClient = ReturnType<typeof createMercadoPagoClient>;
