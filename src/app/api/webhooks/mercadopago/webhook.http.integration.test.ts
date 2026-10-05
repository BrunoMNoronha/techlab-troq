// @vitest-environment node
//
// Prova de F3-006 (#96) na ROTA REAL: `POST /api/webhooks/mercadopago` servido
// por um Next.js real (`pnpm build` + `pnpm start`) sobre o mesmo PostgreSQL
// descartavel, por requisicoes HTTP reais (T-13 e T-14; PD-6.1, PD-6.2, PD-6.10).
//
// Cobre o que nao depende do provedor: cada rejeicao (status sem corpo, nenhum
// efeito, registro minimo sem segredo) e a notificacao valida de order
// desconhecida. A confirmacao com provedor simulado esta em
// src/modules/request/payment-confirmation.integration.test.ts.
//
// Execucao: o servidor e o teste usam o MESMO banco, o MESMO
// MERCADO_PAGO_WEBHOOK_SECRET e o MESMO MERCADO_PAGO_APPLICATION_ID (sinteticos
// na CI). So roda com INTEGRATION_EPHEMERAL_DB=1 e PRIVATE_SURFACE_BASE_URL.
import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { getPrismaClient } from '@/persistence/prisma';

const BASE_URL = process.env.PRIVATE_SURFACE_BASE_URL?.replace(/\/$/, '') ?? '';
const SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET ?? '';
const APP_ID = process.env.MERCADO_PAGO_APPLICATION_ID ?? '';
const enabled =
  process.env.INTEGRATION_EPHEMERAL_DB === '1' && BASE_URL !== '' && SECRET !== '' && APP_ID !== '';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const PREFIX = `it96http-R${Date.now()}-R${randomBytes(3).toString('hex')}`;
let counter = 0;
const ORDER = `ORDHTTP${randomBytes(4).toString('hex').toUpperCase()}`;

interface Send {
  requestId?: string;
  dataId?: string | null;
  manifestId?: string;
  secret?: string;
  applicationId?: string;
  type?: string;
  signature?: string | null;
  body?: string;
}

async function send(opts: Send = {}) {
  const requestId = opts.requestId ?? `${PREFIX}-${++counter}`;
  const ts = String(Date.now());
  const dataId = opts.dataId === undefined ? ORDER : opts.dataId;
  const query = dataId === null ? 'type=order' : `type=order&data.id=${encodeURIComponent(dataId)}`;
  const manifest = `id:${(opts.manifestId ?? dataId ?? '').toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', opts.secret ?? SECRET)
    .update(manifest)
    .digest('hex');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-request-id': requestId,
  };
  const signature = opts.signature === undefined ? `ts=${ts},v1=${v1}` : opts.signature;
  if (signature !== null) headers['x-signature'] = signature;
  const res = await fetch(`${BASE_URL}/api/webhooks/mercadopago?${query}`, {
    method: 'POST',
    headers,
    body:
      opts.body ??
      JSON.stringify({
        type: opts.type ?? 'order',
        action: 'order.processed',
        application_id: opts.applicationId ?? APP_ID,
        data: { id: ORDER },
      }),
    redirect: 'manual',
  });
  return { requestId, ts, v1, status: res.status, body: await res.text(), headers: res.headers };
}

const notifications = (requestId: string) =>
  getPrismaClient().paymentNotification.findMany({ where: { providerRequestId: requestId } });

const rejection = (requestId: string) =>
  getPrismaClient().auditEvent.findMany({
    where: {
      eventType: 'payment.notification_rejected',
      details: { path: ['providerRequestId'], equals: requestId },
    },
  });

describe.skipIf(!enabled)('webhook do Mercado Pago pela rota real (#96, T-13/T-14)', () => {
  afterAll(async () => {
    const prisma = getPrismaClient();
    await prisma.auditEvent.deleteMany({
      where: { details: { path: ['providerRequestId'], string_starts_with: PREFIX } },
    });
    await prisma.paymentNotification.deleteMany({
      where: { providerRequestId: { startsWith: PREFIX } },
    });
    await prisma.$disconnect();
  });

  it.each([
    ['assinatura invalida', { signature: `ts=1,v1=${'0'.repeat(64)}` }, 'signature_invalid'],
    ['assinatura ausente', { signature: null }, 'signature_missing'],
    ['segredo de outra aplicacao', { secret: 'segredo-de-outra-aplicacao' }, 'signature_invalid'],
    ['aplicacao divergente', { applicationId: '1' }, 'application_mismatch'],
    [
      'data.id adulterado na query',
      { manifestId: ORDER, dataId: `${ORDER}X` },
      'signature_invalid',
    ],
    [
      'T-14: manifesto do corpo, sem data.id na query',
      { dataId: null, manifestId: ORDER },
      'signature_invalid',
    ],
  ] as const)('%s: 401 sem corpo, sem efeito, registro minimo', async (_c, opts, reason) => {
    const res = await send(opts);

    expect(res.status).toBe(401);
    expect(res.body).toBe('');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await notifications(res.requestId)).toHaveLength(0);
    const [event] = await rejection(res.requestId);
    expect(event).toMatchObject({ actorId: null, result: 'rejected' });
    expect((event.details as { reason: string }).reason).toBe(reason);
    const text = JSON.stringify(event);
    for (const secret of [res.v1, SECRET, res.ts]) expect(text).not.toContain(secret);
  });

  it('corpo ininteligivel: 400; topico diferente de order: 200 ignorado', async () => {
    const bad = await send({ body: '{nao-json' });
    expect(bad.status).toBe(400);
    expect(await notifications(bad.requestId)).toHaveLength(0);

    const other = await send({ type: 'payment' });
    expect(other.status).toBe(200);
    expect(other.body).toBe('');
    expect(await notifications(other.requestId)).toHaveLength(0);
  });

  it('valida de order desconhecida: 200, registrada sem tentativa', async () => {
    const res = await send();

    expect(res.status).toBe(200);
    expect(res.body).toBe('');
    const [row] = await notifications(res.requestId);
    expect(row).toMatchObject({
      paymentAttemptId: null,
      providerDataId: ORDER,
      processingResult: 'unknown_order',
    });
    expect(await rejection(res.requestId)).toHaveLength(0);
  });

  it('so POST: outro metodo nao processa', async () => {
    const res = await fetch(`${BASE_URL}/api/webhooks/mercadopago?data.id=${ORDER}`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(405);
  });

  it('F3-014 (#104): rajada de rejeicoes nao altera fatos financeiros nem vaza contato', async () => {
    const snapshot = async () => {
      const out: Record<string, unknown> = {};
      for (const table of [
        'contact_requests',
        'contact_request_paid_guards',
        'payment_attempts',
        'payments',
        'payment_notifications',
        'reconciliation_cases',
        'technical_refunds',
        'selections',
        'negotiations',
        'contact_releases',
        'contact_access_events',
      ]) {
        out[table] = await getPrismaClient().$queryRawUnsafe(
          `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS digest, count(*)::int AS n FROM "${table}" t`,
        );
      }
      return out;
    };
    const phone = '+5511912345678';
    const before = await snapshot();
    const responses = await Promise.all(
      Array.from({ length: 32 }, () =>
        send({
          signature: `ts=1,v1=${'0'.repeat(64)}`,
          body: JSON.stringify({
            type: 'order',
            application_id: APP_ID,
            data: { id: ORDER },
            phone,
          }),
        }),
      ),
    );
    expect(await snapshot()).toEqual(before);
    for (const reply of responses) {
      expect(reply.status).toBe(401);
      expect(reply.body).toBe('');
      const events = await rejection(reply.requestId);
      expect(events).toHaveLength(1);
      const text = JSON.stringify(events);
      for (const marker of [phone, phone.slice(1), SECRET, reply.v1])
        expect(text).not.toContain(marker);
    }
  });

  it('F3-014 (#104): telefone nos dois ids hostis e descartado na rota HTTP', async () => {
    const phone = '5511912345678';
    const prior = await getPrismaClient().auditEvent.findMany({
      where: { eventType: 'payment.notification_rejected' },
      select: { id: true },
    });
    const res = await send({
      requestId: phone,
      dataId: phone,
      signature: `ts=1,v1=${'0'.repeat(64)}`,
    });
    const fresh = await getPrismaClient().auditEvent.findMany({
      where: { eventType: 'payment.notification_rejected', id: { notIn: prior.map((e) => e.id) } },
    });
    try {
      expect(res.status).toBe(401);
      expect(res.body).toBe('');
      expect(fresh).toHaveLength(1);
      expect(fresh[0].details).toEqual({
        reason: 'signature_invalid',
        providerRequestId: null,
        providerDataId: null,
      });
      expect(JSON.stringify(fresh)).not.toContain(phone);
    } finally {
      await getPrismaClient().auditEvent.deleteMany({
        where: { id: { in: fresh.map((e) => e.id) } },
      });
    }
  });
});
