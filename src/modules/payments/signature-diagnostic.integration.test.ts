// @vitest-environment node
// PostgreSQL REAL descartavel; nenhum provedor externo. O segundo bloco usa
// tambem a rota HTTP de um Next REAL local, iniciado pelo executor com a mesma
// configuracao sintetica e banco (HMAC_DIAGNOSTIC_HTTP_BASE_URL, opcional).
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleMercadoPagoWebhook } from '@/app/api/webhooks/mercadopago/handler';
import { getPrismaClient } from '@/persistence/prisma';
import {
  PREVIEW_DIAGNOSTIC_ENV,
  PREVIEW_DIAGNOSTIC_ORDER_ID as ORDER,
} from './mercado-pago/signature-diagnostic';

const enabled = process.env.INTEGRATION_EPHEMERAL_DB === '1';
const HTTP_BASE = process.env.HMAC_DIAGNOSTIC_HTTP_BASE_URL ?? '';
const SECRET = process.env.HMAC_DIAGNOSTIC_TEST_SECRET ?? randomBytes(32).toString('hex');
const APP = '9900000000000001';
const EVENT = 'payment.notification_signature_diagnostic';
const LOCK = `payments:preview-signature-diagnostic:${ORDER}`;
const TAG = `itdiag-R${Date.now()}-R${randomBytes(3).toString('hex')}`;
const ownerId = randomUUID(),
  requesterId = randomUUID(),
  listingId = randomUUID(),
  requestId = randomUUID(),
  attemptId = randomUUID();
const db = () => getPrismaClient();
let serial = 0;
let localScopeVerified = false;

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

async function snapshot() {
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
    out[table] = await db().$queryRawUnsafe(
      `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS digest, count(*)::int AS n FROM "${table}" t`,
    );
  }
  return out;
}
const diagnostics = () => db().auditEvent.findMany({ where: { eventType: EVENT } });
const rejections = (id: string) =>
  db().auditEvent.findMany({
    where: {
      eventType: 'payment.notification_rejected',
      details: { path: ['providerRequestId'], equals: id },
    },
  });

async function send(
  opts: {
    destination?: 'handler' | 'http';
    order?: string;
    profile?: 'raw' | 'lower';
    signature?: string | null;
    app?: string;
  } = {},
) {
  const id = `${TAG}-${++serial}`;
  const order = opts.order ?? ORDER;
  const ts = String(Date.now());
  const signedId = opts.profile === 'raw' ? order : order.toLowerCase();
  const mac = createHmac('sha256', SECRET)
    .update(`id:${signedId};request-id:${id};ts:${ts};`)
    .digest('hex');
  const signature = opts.signature === undefined ? `ts=${ts},v1=${mac}` : opts.signature;
  const headers = new Headers({ 'content-type': 'application/json', 'x-request-id': id });
  if (signature !== null) headers.set('x-signature', signature);
  const body = JSON.stringify({
    type: 'order',
    application_id: opts.app ?? APP,
    data: { id: order },
  });
  const url = `${opts.destination === 'http' ? HTTP_BASE : 'http://localhost'}/api/webhooks/mercadopago?data.id=${encodeURIComponent(order)}`;
  const response =
    opts.destination === 'http'
      ? await fetch(url, {
          method: 'POST',
          headers,
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        })
      : await handleMercadoPagoWebhook(new Request(url, { method: 'POST', headers, body }));
  return { id, ts, mac, response, body: await response.text() };
}

async function assertRejected(
  reply: Awaited<ReturnType<typeof send>>,
  reason = 'signature_invalid',
) {
  expect(reply.response.status).toBe(401);
  expect(reply.body).toBe('');
  expect(reply.response.headers.get('cache-control')).toBe('no-store');
  expect(await db().paymentNotification.count({ where: { providerRequestId: reply.id } })).toBe(0);
  const events = await rejections(reply.id);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ actorId: null, result: 'rejected' });
  expect(events[0].details).toMatchObject({ reason });
  const text = JSON.stringify(events);
  for (const marker of [SECRET, reply.ts, reply.mac]) expect(text).not.toContain(marker);
}

async function concurrent(destination: 'handler' | 'http') {
  // A compilacao e o pool do servidor nao fazem parte da corrida no banco.
  if (destination === 'http')
    await assertRejected(await send({ destination, signature: null }), 'signature_missing');
  const before = await snapshot();
  const priorRejections = await db().auditEvent.count({
    where: {
      eventType: 'payment.notification_rejected',
      details: { path: ['providerRequestId'], string_starts_with: TAG },
    },
  });
  let pending: Promise<Awaited<ReturnType<typeof send>>[]> | undefined;
  const waiters = new Set<number>();
  let firstWaiterAt: number | null = null;
  try {
    await db().$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${LOCK}, 0))`;
        pending = Promise.all([send({ destination }), send({ destination })]);
        const arrivalDeadline = Date.now() + 10_000;
        while (
          Date.now() < arrivalDeadline &&
          (firstWaiterAt === null || Date.now() - firstWaiterAt < 2500) &&
          waiters.size < 2
        ) {
          // Autocommit fora do holder: pg_stat_activity fresco em cada leitura.
          const rows = await db().$queryRaw<{ pid: number }[]>`
          SELECT pid FROM pg_stat_activity WHERE datname = current_database()
            AND wait_event_type = 'Lock' AND wait_event = 'advisory'
            AND query LIKE '%pg_advisory_xact_lock%'`;
          waiters.clear();
          for (const row of rows) waiters.add(row.pid);
          if (waiters.size > 0 && firstWaiterAt === null) firstWaiterAt = Date.now();
          if (waiters.size < 2) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiters.size).toBe(2);
        // A recusa normal ja comitou enquanto a coleta diagnostica aguarda.
        expect(
          await db().auditEvent.count({
            where: {
              eventType: 'payment.notification_rejected',
              details: { path: ['providerRequestId'], string_starts_with: TAG },
            },
          }),
        ).toBe(priorRejections + 2);
      },
      { timeout: 15_000 },
    );
  } finally {
    if (pending) await pending;
  }
  const replies = await pending!;
  for (const reply of replies) await assertRejected(reply);
  expect(await snapshot()).toEqual(before);
  const events = await diagnostics();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    actorId: null,
    targetType: 'payment_attempt',
    targetId: attemptId,
    result: 'rejected',
    details: { rawMatch: false, lowerMatch: true, casesDiffer: true },
  });
  expect(Object.keys(events[0].details as object).sort()).toEqual([
    'casesDiffer',
    'lowerMatch',
    'rawMatch',
  ]);
  for (const reply of replies)
    for (const marker of [SECRET, reply.ts, reply.mac, reply.id, ORDER])
      expect(JSON.stringify(events)).not.toContain(marker);
  const retry = await send({ destination });
  await assertRejected(retry);
  expect(await diagnostics()).toHaveLength(1);
  expect(await snapshot()).toEqual(before);
}

describe.skipIf(!enabled)('diagnostico HMAC sobre PostgreSQL real isolado', () => {
  beforeAll(async () => {
    // Recusa execucao desta fixture em conexao remota, mesmo com opt-in acidental.
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new Error('Diagnostico de teste exige PostgreSQL local descartavel');
    if (HTTP_BASE && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(HTTP_BASE).hostname))
      throw new Error('HTTP de teste exige Next local');
    localScopeVerified = true;
    expect(await db().paymentAttempt.count({ where: { providerOrderId: ORDER } })).toBe(0);
    expect(await diagnostics()).toHaveLength(0);
    await db().user.createMany({
      data: [
        { id: ownerId, displayName: 'Owner sintetico', email: `${TAG}-owner@example.test` },
        {
          id: requesterId,
          displayName: 'Requester sintetico',
          email: `${TAG}-requester@example.test`,
        },
      ],
    });
    await db().listing.create({
      data: {
        id: listingId,
        ownerId,
        title: 'Diagnostico sintetico local',
        description: 'Fixture isolada sem contato',
        city: 'Sao Paulo',
        uf: 'SP',
        status: 'published',
        publishedAt: new Date(),
      },
    });
    const now = new Date();
    await db().contactRequest.create({
      data: {
        id: requestId,
        listingId,
        requesterId,
        slotIndex: 1,
        reservedFrom: now,
        reservedUntil: new Date(now.getTime() + 30 * 60_000),
      },
    });
    await db().paymentAttempt.create({
      data: {
        id: attemptId,
        contactRequestId: requestId,
        idempotencyKey: `${TAG}-key`,
        externalReference: `${TAG}-ref`,
        providerOrderId: ORDER,
        status: 'aguardando_pagamento',
      },
    });
  });
  beforeEach(async () => {
    vi.stubEnv('APP_ENV', 'preview');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv(PREVIEW_DIAGNOSTIC_ENV, ORDER);
    vi.stubEnv('MERCADO_PAGO_WEBHOOK_SECRET', SECRET);
    vi.stubEnv('MERCADO_PAGO_APPLICATION_ID', APP);
    await db().auditEvent.deleteMany({
      where: {
        OR: [
          { eventType: EVENT, targetId: attemptId },
          {
            eventType: 'payment.notification_rejected',
            details: { path: ['providerRequestId'], string_starts_with: TAG },
          },
        ],
      },
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    // afterAll tambem pode rodar quando beforeAll recusou o alvo remoto.
    if (!localScopeVerified) return;
    await db().auditEvent.deleteMany({
      where: {
        OR: [
          { eventType: EVENT, targetId: attemptId },
          { details: { path: ['providerRequestId'], string_starts_with: TAG } },
        ],
      },
    });
    await db().paymentNotification.deleteMany({
      where: { providerRequestId: { startsWith: TAG } },
    });
    await db().paymentAttempt.deleteMany({ where: { id: attemptId } });
    await db().contactRequest.deleteMany({ where: { id: requestId } });
    await db().listing.deleteMany({ where: { id: listingId } });
    await db().user.deleteMany({ where: { id: { in: [ownerId, requesterId] } } });
    await db().$disconnect();
  });

  it('duas conexoes observadas na trava: um diagnostico, duas recusas e retry sem efeito financeiro', async () => {
    await concurrent('handler');
  });

  it.each([
    'off',
    'invalid',
    'app_production',
    'vercel_production',
    'wrong_order',
    'malformed',
    'wrong_app',
  ])('%s preserva recusas e fatos, sem diagnostico', async (mode) => {
    const before = await snapshot();
    if (mode === 'off') vi.stubEnv(PREVIEW_DIAGNOSTIC_ENV, '');
    if (mode === 'invalid') vi.stubEnv(PREVIEW_DIAGNOSTIC_ENV, 'ORDTST-OTHER');
    if (mode === 'app_production') vi.stubEnv('APP_ENV', 'production');
    if (mode === 'vercel_production') vi.stubEnv('VERCEL_ENV', 'production');
    const reply = await send({
      order: mode === 'wrong_order' ? `${ORDER}X` : ORDER,
      signature: mode === 'malformed' ? 'ts=invalid,v1=invalid' : undefined,
      app: mode === 'wrong_app' ? '1' : APP,
    });
    await assertRejected(
      reply,
      mode === 'malformed'
        ? 'signature_malformed'
        : mode === 'wrong_app'
          ? 'application_mismatch'
          : 'signature_invalid',
    );
    expect(await diagnostics()).toHaveLength(0);
    expect(await snapshot()).toEqual(before);
  });

  it('erro PostgreSQL na auditoria diagnostica nao desfaz recusa comitada nem muda HTTP401', async () => {
    const before = await snapshot();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await db().$executeRawUnsafe(
      `CREATE FUNCTION it_hmac_diag_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic diagnostic failure'; END $$`,
    );
    await db().$executeRawUnsafe(
      `CREATE TRIGGER it_hmac_diag_failure BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.event_type = 'payment.notification_signature_diagnostic') EXECUTE FUNCTION it_hmac_diag_failure()`,
    );
    try {
      await assertRejected(await send());
      expect(await diagnostics()).toHaveLength(0);
      expect(await snapshot()).toEqual(before);
      expect(log).toHaveBeenCalledExactlyOnceWith(
        '[payments] falha no diagnostico temporario de assinatura',
      );
    } finally {
      await db().$executeRawUnsafe('DROP TRIGGER IF EXISTS it_hmac_diag_failure ON audit_events');
      await db().$executeRawUnsafe('DROP FUNCTION IF EXISTS it_hmac_diag_failure()');
    }
  });

  describe.skipIf(HTTP_BASE === '')(
    'rota Next real via HTTP, mesma fixture/banco/chave sintetica',
    () => {
      it('duas requisicoes aguardam lock, uma coleta, rejeicoes e retry continuam401', async () => {
        await concurrent('http');
      });
      it('raw de Order desconhecida continua200 registrado; nenhum diagnostico ou chamada de provedor', async () => {
        const reply = await send({
          destination: 'http',
          profile: 'raw',
          order: `ORDTSTUNKNOWN${randomBytes(8).toString('hex').toUpperCase()}`,
        });
        expect(reply.response.status).toBe(200);
        expect(reply.body).toBe('');
        expect(
          await db().paymentNotification.findMany({ where: { providerRequestId: reply.id } }),
        ).toMatchObject([{ paymentAttemptId: null, processingResult: 'unknown_order' }]);
        expect(await diagnostics()).toHaveLength(0);
        expect(await rejections(reply.id)).toHaveLength(0);
      });
    },
  );
});
