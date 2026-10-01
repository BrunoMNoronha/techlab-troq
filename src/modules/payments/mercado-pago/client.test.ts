// @vitest-environment node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMercadoPagoClient } from './client';
import { MercadoPagoConfigError } from './config';

// Contrato HTTP da Orders API contra um servidor SIMULADO local (`node:http`):
// o que o adaptador envia e como interpreta cada resposta (ADR-0004; PD-4.1
// passo 2, PD-5.3, PD-8.3 a PD-8.5, PD-6.9). Nenhuma chamada sai da maquina.
// Token sintetico; a suite confere que ele nunca aparece em resultado algum.

const TOKEN = 'TEST-sintetico-0000000000000000';
const KEY = '1b9d6bcd-bbfd-5b2d-9b5d-ab8dfbbd4bed';

interface Received {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: string;
}

let server: Server;
let baseUrl = '';
let received: Received[] = [];
let respond: (req: Received, res: ServerResponse) => void = (_req, res) => res.end();

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const ORDER = {
  id: 'ORD01M2G630W7G19741DAB2T15WJ4',
  status: 'action_required',
  status_detail: 'waiting_transfer',
  external_reference: 'troq-pa-1',
  total_amount: '0.99',
  total_paid_amount: '0.00',
  transactions: {
    payments: [
      {
        id: 'PAY01M2G630W7G19741DAB2T15WJ4',
        amount: '0.99',
        status: 'action_required',
        status_detail: 'waiting_transfer',
        date_of_expiration: '2026-10-01T13:30:00.000Z',
        payment_method: {
          id: 'pix',
          type: 'bank_transfer',
          qr_code: '00020126BRCODE',
          qr_code_base64: 'iVBORw0KGgo=',
          ticket_url: 'https://www.mercadopago.com.br/payments/1/ticket',
        },
      },
    ],
  },
};

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const entry = { method: req.method!, url: req.url!, headers: req.headers, body };
      received.push(entry);
      respond(entry, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  received = [];
  vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const client = () => createMercadoPagoClient({ baseUrl, timeoutMs: 1_000 });

const charge = {
  idempotencyKey: KEY,
  externalReference: 'troq-pa-1',
  amountCents: 99,
  expiresInMs: 30 * 60 * 1000,
  payerEmail: 'pagador@example.test',
};

describe('createPixCharge (POST /v1/orders)', () => {
  it('envia cabecalhos e corpo exatos, com 0.99 e sem notification_url', async () => {
    respond = (_req, res) => json(res, 201, ORDER);
    const result = await client().createPixCharge(charge);
    expect(result.ok).toBe(true);

    const [req] = received;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/v1/orders');
    expect(req.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(req.headers['content-type']).toBe('application/json');
    expect(req.headers['x-idempotency-key']).toBe(KEY);
    expect(JSON.parse(req.body)).toEqual({
      type: 'online',
      processing_mode: 'automatic',
      external_reference: 'troq-pa-1',
      total_amount: '0.99',
      payer: { email: 'pagador@example.test' },
      transactions: {
        payments: [
          {
            amount: '0.99',
            payment_method: { id: 'pix', type: 'bank_transfer' },
            expiration_time: 'PT30M',
          },
        ],
      },
    });
    expect(req.body).not.toContain('notification_url');
  });

  it('devolve snapshot pendente e as instrucoes Pix', async () => {
    respond = (_req, res) => json(res, 201, ORDER);
    const result = await client().createPixCharge(charge);
    if (!result.ok) throw new Error('esperava sucesso');
    expect(result.value.snapshot).toMatchObject({
      providerOrderId: ORDER.id,
      state: { kind: 'pending' },
    });
    expect(result.value.snapshot.pixExpiresAt?.toISOString()).toBe('2026-10-01T13:30:00.000Z');
    expect(result.value.instructions).toEqual({
      qrCode: '00020126BRCODE',
      qrCodeBase64: 'iVBORw0KGgo=',
      ticketUrl: 'https://www.mercadopago.com.br/payments/1/ticket',
    });
  });

  it('prazo abaixo do minimo e enviado como PT30M', async () => {
    respond = (_req, res) => json(res, 201, ORDER);
    await client().createPixCharge({ ...charge, expiresInMs: 29 * 60 * 1000 + 500 });
    const body = JSON.parse(received[0].body);
    expect(body.transactions.payments[0].expiration_time).toBe('PT30M');
  });

  it('2xx sem identificador de order nao e interpretado', async () => {
    respond = (_req, res) => json(res, 201, { status: 'processed' });
    expect(await client().createPixCharge(charge)).toEqual({
      ok: false,
      kind: 'rejected',
      httpStatus: 201,
      code: 'unmapped',
    });
  });

  it('4xx vira rejected com o codigo do provedor, sem a mensagem', async () => {
    respond = (_req, res) =>
      json(res, 400, {
        errors: [{ code: 'unsupported_properties', message: 'detalhe interno do provedor' }],
      });
    const result = await client().createPixCharge(charge);
    expect(result).toEqual({
      ok: false,
      kind: 'rejected',
      httpStatus: 400,
      code: 'unsupported_properties',
    });
    expect(JSON.stringify(result)).not.toContain('detalhe interno');
  });
});

describe('getOrder (GET /v1/orders/{id})', () => {
  it('consulta sem chave de idempotencia e classifica a acreditacao', async () => {
    respond = (_req, res) =>
      json(res, 200, {
        ...ORDER,
        status: 'processed',
        status_detail: 'accredited',
        transactions: {
          payments: [
            {
              ...ORDER.transactions.payments[0],
              status: 'processed',
              status_detail: 'accredited',
            },
          ],
        },
      });
    const result = await client().getOrder(ORDER.id);
    expect(received[0]).toMatchObject({ method: 'GET', url: `/v1/orders/${ORDER.id}` });
    expect(received[0].headers['x-idempotency-key']).toBeUndefined();
    expect(result).toMatchObject({ ok: true, value: { state: { kind: 'accredited' } } });
  });

  it('identificador com caracteres especiais e codificado no caminho', async () => {
    respond = (_req, res) => json(res, 404, { errors: [{ code: 'order_not_found' }] });
    await client().getOrder('../x?y');
    expect(received[0].url).toBe('/v1/orders/..%2Fx%3Fy');
  });

  it.each([
    [404, {}],
    [400, { errors: [{ code: 'order_not_found' }] }],
  ])('HTTP %i ou order_not_found: not_found', async (status, body) => {
    respond = (_req, res) => json(res, status, body);
    expect(await client().getOrder(ORDER.id)).toEqual({ ok: false, kind: 'not_found' });
  });
});

describe('getPixCharge (GET /v1/orders/{id} com instrucoes)', () => {
  it('reapresenta as instrucoes enquanto a order nao foi acreditada', async () => {
    respond = (_req, res) => json(res, 200, ORDER);
    const result = await client().getPixCharge(ORDER.id);
    expect(received[0]).toMatchObject({ method: 'GET', url: `/v1/orders/${ORDER.id}` });
    expect(received[0].headers['x-idempotency-key']).toBeUndefined();
    expect(result).toMatchObject({
      ok: true,
      value: {
        snapshot: { state: { kind: 'pending' } },
        instructions: { qrCode: '00020126BRCODE' },
      },
    });
  });

  it('depois da acreditacao o provedor nao devolve o QR: instructions null', async () => {
    const accredited = {
      ...ORDER,
      status: 'processed',
      status_detail: 'accredited',
      transactions: {
        payments: [
          {
            id: 'PAY1',
            status: 'processed',
            status_detail: 'accredited',
            payment_method: { id: 'pix', type: 'bank_transfer' },
          },
        ],
      },
    };
    respond = (_req, res) => json(res, 200, accredited);
    expect(await client().getPixCharge(ORDER.id)).toMatchObject({
      ok: true,
      value: { instructions: null },
    });
  });
});

describe('cancelOrder (POST /v1/orders/{id}/cancel)', () => {
  it('envia a chave de idempotencia recebida e devolve o snapshot', async () => {
    respond = (_req, res) =>
      json(res, 200, { ...ORDER, status: 'canceled', status_detail: 'canceled' });
    const result = await client().cancelOrder(ORDER.id, KEY);
    expect(received[0]).toMatchObject({ method: 'POST', url: `/v1/orders/${ORDER.id}/cancel` });
    expect(received[0].headers['x-idempotency-key']).toBe(KEY);
    expect(result).toMatchObject({
      ok: true,
      value: { state: { kind: 'not_accredited_terminal', outcome: 'canceled' } },
    });
  });
});

describe('refundOrder (POST /v1/orders/{id}/refund) — PD-8.5', () => {
  it('reembolso integral: sem corpo, com a chave recebida', async () => {
    respond = (_req, res) => json(res, 201, { ...ORDER, status: 'refunded' });
    expect(await client().refundOrder(ORDER.id, KEY)).toEqual({
      ok: true,
      value: { refunded: true, alreadyRefunded: false },
    });
    expect(received[0]).toMatchObject({ method: 'POST', url: `/v1/orders/${ORDER.id}/refund` });
    expect(received[0].body).toBe('');
    expect(received[0].headers['content-type']).toBeUndefined();
    expect(received[0].headers['x-idempotency-key']).toBe(KEY);
  });

  it('order_already_refunded (409) e desfecho de SUCESSO', async () => {
    respond = (_req, res) => json(res, 409, { errors: [{ code: 'order_already_refunded' }] });
    expect(await client().refundOrder(ORDER.id, KEY)).toEqual({
      ok: true,
      value: { refunded: true, alreadyRefunded: true },
    });
  });

  it('order_not_found: not_found, nunca "nao havia dinheiro"', async () => {
    respond = (_req, res) => json(res, 404, { errors: [{ code: 'order_not_found' }] });
    expect(await client().refundOrder(ORDER.id, KEY)).toEqual({ ok: false, kind: 'not_found' });
  });

  it.each([
    [409, { errors: [{ code: 'cannot_refund_order' }] }, 'cannot_refund_order'],
    [400, { errors: [{ code: 'refund_amount_exceeds' }] }, 'refund_amount_exceeds'],
    [400, { message: 'sem codigo' }, 'unmapped'],
    [400, { code: 'codigo com espaco' }, 'unmapped'],
  ])('codigo nao mapeado como sucesso fica rejected (HTTP %i)', async (status, body, code) => {
    respond = (_req, res) => json(res, status, body);
    expect(await client().refundOrder(ORDER.id, KEY)).toEqual({
      ok: false,
      kind: 'rejected',
      httpStatus: status,
      code,
    });
  });
});

describe('findPaymentAccreditation (GET /v1/payments/search) — ADR-0008', () => {
  const REF = 'troq-pa-1';

  it('so leitura: GET sem chave de idempotencia, filtrando pela external_reference', async () => {
    respond = (_req, res) =>
      json(res, 200, {
        paging: { total: 1 },
        results: [
          {
            id: 180819249321,
            status: 'approved',
            status_detail: 'accredited',
            external_reference: REF,
            transaction_amount: 0.99,
            date_approved: '2026-10-01T12:29:46.000-04:00',
          },
        ],
      });

    const result = await client().findPaymentAccreditation(REF);

    expect(received).toHaveLength(1);
    expect(received[0].method).toBe('GET');
    expect(received[0].url).toBe('/v1/payments/search?external_reference=troq-pa-1');
    expect(received[0].headers['x-idempotency-key']).toBeUndefined();
    expect(received[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(result).toEqual({
      ok: true,
      value: [
        {
          providerPaymentId: '180819249321',
          status: 'approved',
          statusDetail: 'accredited',
          externalReference: REF,
          amountCents: 99,
          approvedAt: new Date('2026-10-01T16:29:46.000Z'),
        },
      ],
    });
  });

  it('referencia com caracteres especiais e codificada na query', async () => {
    respond = (_req, res) => json(res, 200, { results: [] });
    await client().findPaymentAccreditation('troq-pa-a&b=c');
    expect(received[0].url).toBe('/v1/payments/search?external_reference=troq-pa-a%26b%3Dc');
  });

  it('200 sem lista de resultados nao e interpretado', async () => {
    respond = (_req, res) => json(res, 200, { paging: {} });
    expect(await client().findPaymentAccreditation(REF)).toEqual({
      ok: false,
      kind: 'rejected',
      httpStatus: 200,
      code: 'unmapped',
    });
  });

  it('5xx e timeout: unavailable, nunca aprovacao', async () => {
    respond = (_req, res) => json(res, 500, {});
    expect(await client().findPaymentAccreditation(REF)).toMatchObject({
      ok: false,
      kind: 'unavailable',
    });
    respond = () => undefined;
    const fast = createMercadoPagoClient({ baseUrl, timeoutMs: 100 });
    expect(await fast.findPaymentAccreditation(REF)).toEqual({
      ok: false,
      kind: 'unavailable',
      reason: 'timeout',
    });
  });
});

describe('indisponibilidade nunca e aprovacao (PD-6.9)', () => {
  it('5xx: unavailable', async () => {
    respond = (_req, res) => json(res, 503, { errors: [{ code: 'internal_error' }] });
    expect(await client().getOrder(ORDER.id)).toEqual({
      ok: false,
      kind: 'unavailable',
      reason: 'server_error',
    });
  });

  it('timeout: unavailable', async () => {
    respond = () => undefined; // nunca responde
    const fast = createMercadoPagoClient({ baseUrl, timeoutMs: 100 });
    expect(await fast.getOrder(ORDER.id)).toEqual({
      ok: false,
      kind: 'unavailable',
      reason: 'timeout',
    });
  });

  it('queda de rede: unavailable', async () => {
    const offline = createMercadoPagoClient({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 1_000 });
    expect(await offline.getOrder(ORDER.id)).toEqual({
      ok: false,
      kind: 'unavailable',
      reason: 'network',
    });
  });
});

describe('credenciais', () => {
  it('sem token: falha fechada que nomeia a variavel, sem chamar o provedor', async () => {
    vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', '');
    await expect(client().getOrder(ORDER.id)).rejects.toThrow(MercadoPagoConfigError);
    await expect(client().getOrder(ORDER.id)).rejects.toThrow('MERCADO_PAGO_ACCESS_TOKEN');
    expect(received).toHaveLength(0);
  });

  it('o token nunca aparece em resultado de nenhum tipo', async () => {
    const outcomes: unknown[] = [];
    for (const [status, body] of [
      [201, ORDER],
      [400, { errors: [{ code: 'bad_request', message: TOKEN }] }],
      [404, {}],
      [500, {}],
    ] as const) {
      respond = (_req, res) => json(res, status, body);
      outcomes.push(await client().createPixCharge(charge));
      outcomes.push(await client().refundOrder(ORDER.id, KEY));
    }
    expect(JSON.stringify(outcomes)).not.toContain(TOKEN);
  });
});
