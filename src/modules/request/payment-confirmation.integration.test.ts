// @vitest-environment node
//
// Prova de integracao de F3-006 (#96): receptor de webhook, confirmacao pelo
// estado autoritativo e transacao de efeito, contra o Better Auth REAL e
// PostgreSQL REAL e descartavel, com o Mercado Pago SIMULADO (`node:http`):
// Orders API (criacao e consulta) e a busca da Payments API (ADR-0008).
//
// O receptor e exercitado pela funcao da rota (`handleMercadoPagoWebhook`), com
// `Request` real e assinatura HMAC real; a prova pela rota HTTP do servidor real
// esta em src/app/api/webhooks/mercadopago/webhook.http.integration.test.ts.
//
// PD-13.2: T-2 e concorrente de verdade (espera vista em `pg_stat_activity`);
// T-3 entrega a mesma notificacao N vezes ao mesmo tempo; T-13/T-14 exercitam
// cada campo adulterado e o manifesto remontado do corpo.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1. Dados sinteticos.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { handleMercadoPagoWebhook } from '@/app/api/webhooks/mercadopago/handler';
import { registerOwnContact } from '@/modules/contact';
import { revealContact } from '@/app/contatos/actions';
import { chooseRequester } from '@/modules/negotiation';
import * as Sentry from '@sentry/nextjs';
import { createTelemetryOptions } from '@/modules/platform';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { createDraftListing, pauseListing } from '@/modules/listing/actions';
import { createMercadoPagoClient } from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';
import { requestContactUnlockFlow } from './charge-flow';
import { confirmPaymentFlow } from './payment-confirmation';

const cookieStore = new AsyncLocalStorage<string>();

vi.mock('next/headers', () => ({
  headers: async () => {
    const cookie = cookieStore.getStore() ?? '';
    return new Headers(cookie ? { cookie } : {});
  },
}));

vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

// F3-013 (#103): o transporte dos avisos transacionais e SIMULADO; dele se le
// quantos emails sairam, para quem, com que chave e com que conteudo.
const sentEmails = vi.hoisted(() => ({
  send: vi
    .fn<
      (email: {
        to: string;
        subject: string;
        text: string;
        html: string;
        idempotencyKey: string;
      }) => Promise<{ ok: true }>
    >()
    .mockResolvedValue({ ok: true }),
}));
vi.mock('@/modules/identity/email-transport', () => ({
  sendTransactionalEmail: sentEmails.send,
}));
const sent = () => sentEmails.send.mock.calls.map(([e]) => e);

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const TOKEN = 'TEST-sintetico-confirmacao-000000';
const SECRET = randomBytes(32).toString('hex');
const APP_ID = '9900000000000001';
const REQUEST_PREFIX = `it96-R${RUN_ID}`;
const email = (tag: string) => `it-confirma-${tag}-${RUN_ID}@example.test`;
const prisma = () => getPrismaClient();

const userIds: string[] = [];
const cookies: Record<string, string> = {};

// ---------------------------------------------------------------------------
// Provedor simulado: Orders API + busca da Payments API
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;
type Mode = 'ok' | 'unavailable' | 'slow';

interface SimOrder {
  id: string;
  external_reference: string;
  status: string;
  status_detail: string;
  total_amount: string;
  total_paid_amount: string;
  created_date: string;
  last_updated_date: string;
  transactions: { payments: Raw[] };
}

const sim = {
  byKey: new Map<string, SimOrder>(),
  byId: new Map<string, SimOrder>(),
  search: new Map<string, Raw[]>(),
  getMode: 'ok' as Mode,
  searchMode: 'ok' as Mode,
  slowMs: 1_500,
  creates: [] as string[],
  counter: 0,
};

function reply(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function newOrder(body: Raw): SimOrder {
  sim.counter += 1;
  const n = `${RUN_ID.replace(/\D/g, '').slice(-8)}${sim.counter}`;
  const payment = (body.transactions as { payments: Raw[] }).payments[0];
  const now = new Date().toISOString();
  return {
    id: `ORDSIM${n}`,
    external_reference: String(body.external_reference),
    status: 'action_required',
    status_detail: 'waiting_transfer',
    total_amount: String(body.total_amount),
    total_paid_amount: '0.00',
    created_date: now,
    last_updated_date: now,
    transactions: {
      payments: [
        {
          id: `PAYSIM${n}`,
          amount: String(payment.amount),
          status: 'action_required',
          status_detail: 'waiting_transfer',
          date_of_expiration: new Date(Date.now() + 30 * 60_000).toISOString(),
          payment_method: {
            id: 'pix',
            type: 'bank_transfer',
            qr_code: `000201SIMULADO${n}`,
            ticket_url: `https://example.test/sandbox/payments/${n}/ticket`,
          },
        },
      ],
    },
  };
}

async function respondWith(res: ServerResponse, mode: Mode, send: () => void) {
  if (mode === 'unavailable') return reply(res, 503, { errors: [{ code: 'internal_error' }] });
  if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, sim.slowMs));
  send();
}

function handle(req: IncomingMessage, res: ServerResponse, raw: string) {
  const url = new URL(req.url ?? '/', 'http://sim');
  if (req.method === 'POST' && url.pathname === '/v1/orders') {
    const key = req.headers['x-idempotency-key'] as string;
    let order = sim.byKey.get(key);
    if (!order) {
      order = newOrder(JSON.parse(raw));
      sim.byKey.set(key, order);
      sim.byId.set(order.id, order);
    }
    sim.creates.push(order.external_reference);
    return reply(res, 201, order);
  }
  const get = /^\/v1\/orders\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'GET' && get) {
    const order = sim.byId.get(decodeURIComponent(get[1]));
    return void respondWith(res, sim.getMode, () =>
      order ? reply(res, 200, order) : reply(res, 404, { errors: [{ code: 'order_not_found' }] }),
    );
  }
  // Reembolso total (F3-007): a primeira tentativa roda logo depois da excecao.
  const refund = /^\/v1\/orders\/([^/]+)\/refund$/.exec(url.pathname);
  if (req.method === 'POST' && refund) {
    const order = sim.byId.get(decodeURIComponent(refund[1]));
    if (!order) return reply(res, 404, { errors: [{ code: 'order_not_found' }] });
    Object.assign(order, { status: 'refunded', status_detail: 'refunded' });
    return reply(res, 201, order);
  }
  if (req.method === 'GET' && url.pathname === '/v1/payments/search') {
    const reference = url.searchParams.get('external_reference') ?? '';
    return void respondWith(res, sim.searchMode, () =>
      reply(res, 200, { results: sim.search.get(reference) ?? [] }),
    );
  }
  return reply(res, 404, {});
}

let server: Server;
let gateway: ReturnType<typeof createMercadoPagoClient>;

/** Acredita a order no simulador, com `date_approved` na busca da Payments API. */
function accredit(orderId: string, approvedAt: Date, overrides: Raw = {}) {
  const order = sim.byId.get(orderId)!;
  Object.assign(order, {
    status: 'processed',
    status_detail: 'accredited',
    total_paid_amount: '0.99',
    last_updated_date: new Date().toISOString(),
  });
  Object.assign(order.transactions.payments[0], {
    status: 'processed',
    status_detail: 'accredited',
    paid_amount: '0.99',
  });
  sim.search.set(order.external_reference, [
    {
      id: Number(`18${sim.counter}${Math.floor(Math.random() * 1e6)}`),
      status: 'approved',
      status_detail: 'accredited',
      external_reference: order.external_reference,
      transaction_amount: 0.99,
      date_approved: approvedAt.toISOString(),
      ...overrides,
    },
  ]);
}

function setOrderStatus(orderId: string, status: string, detail: string) {
  const order = sim.byId.get(orderId)!;
  order.status = status;
  order.status_detail = detail;
  Object.assign(order.transactions.payments[0], { status, status_detail: detail });
}

// ---------------------------------------------------------------------------
// Notificacao assinada
// ---------------------------------------------------------------------------

let requestCounter = 0;
const nextRequestId = () => `${REQUEST_PREFIX}-${++requestCounter}`;

function hmac(secret: string, manifest: string) {
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

interface NotifyOptions {
  queryDataId?: string | null;
  bodyDataId?: string;
  requestId?: string;
  ts?: string;
  signatureTs?: string;
  secret?: string;
  applicationId?: string;
  type?: string;
  signature?: string | null;
  manifest?: string;
  rawBody?: string;
}

function notification(orderId: string, opts: NotifyOptions = {}): Request {
  const requestId = opts.requestId ?? nextRequestId();
  const ts = opts.ts ?? String(Date.now());
  const queryDataId = opts.queryDataId === undefined ? orderId : opts.queryDataId;
  const url = new URL('http://localhost/api/webhooks/mercadopago');
  url.searchParams.set('type', 'order');
  if (queryDataId !== null) url.searchParams.set('data.id', queryDataId);
  const manifest =
    opts.manifest ??
    `id:${(queryDataId ?? '').toLowerCase()};request-id:${requestId};ts:${opts.signatureTs ?? ts};`;
  const signature =
    opts.signature === undefined
      ? `ts=${ts},v1=${hmac(opts.secret ?? SECRET, manifest)}`
      : opts.signature;
  const headers = new Headers({ 'content-type': 'application/json', 'x-request-id': requestId });
  if (signature !== null) headers.set('x-signature', signature);
  const body =
    opts.rawBody ??
    JSON.stringify({
      type: opts.type ?? 'order',
      action: 'order.processed',
      application_id: opts.applicationId ?? APP_ID,
      data: { id: opts.bodyDataId ?? orderId },
    });
  return new Request(url, { method: 'POST', headers, body });
}

function deliver(request: Request, budgetMs?: number) {
  return handleMercadoPagoWebhook(request, { gateway, budgetMs });
}

// ---------------------------------------------------------------------------
// Usuarios, anuncios e reservas
// ---------------------------------------------------------------------------

async function createUser(tag: string): Promise<string> {
  const res = await registerUser({
    displayName: 'Pessoa Sintetica',
    email: email(tag),
    password: PASSWORD,
    over18: true,
    termsAccepted: true,
  });
  expect(res.success).toBe(true);
  const { id } = await prisma().user.findFirstOrThrow({ where: { email: email(tag) } });
  await prisma().user.update({
    where: { id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  userIds.push(id);
  return id;
}

async function signIn(tag: string): Promise<string> {
  const { headers } = await getAuth().api.signInEmail({
    body: { email: email(tag), password: PASSWORD },
    headers: new Headers({ 'user-agent': 'agente-sintetico/1.0' }),
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

function as<T>(tag: string, fn: () => Promise<T>): Promise<T> {
  return cookieStore.run(cookies[tag] ?? '', fn);
}

async function publishedListing(): Promise<string> {
  const res = await as('owner', () =>
    createDraftListing({
      title: 'Bicicleta sintetica',
      description: 'Anuncio sintetico de integracao.',
      city: 'Recife',
      state: 'PE',
    }),
  );
  const id = res.listingId!;
  await prisma().listing.update({ where: { id }, data: { status: 'published' } });
  return id;
}

interface Reserved {
  contactRequestId: string;
  attemptId: string;
  orderId: string;
  externalReference: string;
}

/** Reserva + Pix pelo fluxo real (PD-4.1, passos 1 a 3), com o provedor simulado. */
async function reserve(tag: string, listingId: string): Promise<Reserved> {
  const res = await as(tag, () => requestContactUnlockFlow(listingId, { gateway }));
  if (!res.success || !res.pix) throw new Error(`reserva falhou: ${JSON.stringify(res)}`);
  const attempt = await prisma().paymentAttempt.findUniqueOrThrow({
    where: { contactRequestId: res.contactRequestId },
  });
  expect(attempt.status).toBe('aguardando_pagamento');
  return {
    contactRequestId: res.contactRequestId,
    attemptId: attempt.id,
    orderId: attempt.providerOrderId!,
    externalReference: attempt.externalReference,
  };
}

async function windowOf(contactRequestId: string) {
  return prisma().contactRequest.findUniqueOrThrow({
    where: { id: contactRequestId },
    select: { reservedFrom: true, reservedUntil: true, status: true },
  });
}

/** Desloca a janela da reserva para o passado (sem tocar o relogio). */
async function moveWindowToPast(contactRequestId: string) {
  await prisma().$executeRaw`
    UPDATE "contact_requests"
    SET "reserved_from" = now() - interval '2 hours',
        "reserved_until" = now() - interval '90 minutes'
    WHERE "id" = ${contactRequestId}::uuid`;
  return windowOf(contactRequestId);
}

async function state(r: Reserved) {
  const [attempt, request, payments, cases] = await Promise.all([
    prisma().paymentAttempt.findUniqueOrThrow({ where: { id: r.attemptId } }),
    prisma().contactRequest.findUniqueOrThrow({ where: { id: r.contactRequestId } }),
    prisma().payment.findMany({ where: { paymentAttemptId: r.attemptId } }),
    prisma().reconciliationCase.findMany({ where: { paymentAttemptId: r.attemptId } }),
  ]);
  return { attempt, request, payments, cases };
}

function audits(eventType: string, targetIds: string[]) {
  return prisma().auditEvent.findMany({ where: { eventType, targetId: { in: targetIds } } });
}

const REQUESTERS = ['r0', 'r1', 'r2', 'r3', 'r4'];

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'confirmacao do pagamento: webhook, estado autoritativo e efeito (#96)',
  () => {
    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
      vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', TOKEN);
      vi.stubEnv('MERCADO_PAGO_WEBHOOK_SECRET', SECRET);
      vi.stubEnv('MERCADO_PAGO_APPLICATION_ID', APP_ID);

      server = createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => handle(req, res, raw));
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      gateway = createMercadoPagoClient({ baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 5_000 });

      for (const tag of ['owner', ...REQUESTERS]) {
        await createUser(tag);
        cookies[tag] = await signIn(tag);
      }
      // DEC-040: sem contato do anunciante, nenhuma solicitacao e aceita.
      expect(await as('owner', () => registerOwnContact({ phone: '(11) 91234-5678' }))).toEqual({
        success: true,
        hasContact: true,
      });
    });

    beforeEach(() => {
      sentEmails.send.mockClear();
      sim.getMode = 'ok';
      sim.searchMode = 'ok';
      vi.stubEnv('MERCADO_PAGO_WEBHOOK_SECRET', SECRET);
      vi.stubEnv('MERCADO_PAGO_APPLICATION_ID', APP_ID);
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
      await prisma()
        .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "it_f3006_block_audit"`;
      const listings = await prisma().listing.findMany({
        where: { ownerId: { in: userIds } },
        select: { id: true },
      });
      const listingIds = listings.map((l) => l.id);
      const requests = await prisma().contactRequest.findMany({
        where: { listingId: { in: listingIds } },
        select: { id: true, paymentAttempt: { select: { id: true } } },
      });
      const requestIds = requests.map((r) => r.id);
      const attemptIds = requests.flatMap((r) => (r.paymentAttempt ? [r.paymentAttempt.id] : []));
      const caseIds = (
        await prisma().reconciliationCase.findMany({
          where: { paymentAttemptId: { in: attemptIds } },
          select: { id: true },
        })
      ).map((c) => c.id);
      const refundIds = (
        await prisma().technicalRefund.findMany({
          where: { payment: { paymentAttemptId: { in: attemptIds } } },
          select: { id: true },
        })
      ).map((r) => r.id);
      await prisma().auditEvent.deleteMany({
        where: {
          OR: [
            { actorId: { in: userIds } },
            { targetId: { in: [...attemptIds, ...requestIds, ...caseIds, ...refundIds] } },
            { details: { path: ['providerRequestId'], string_starts_with: REQUEST_PREFIX } },
          ],
        },
      });
      await prisma().reconciliationCase.deleteMany({ where: { id: { in: caseIds } } });
      await prisma().technicalRefund.deleteMany({
        where: { payment: { paymentAttemptId: { in: attemptIds } } },
      });
      await prisma().paymentNotification.deleteMany({
        where: {
          OR: [
            { paymentAttemptId: { in: attemptIds } },
            { providerRequestId: { startsWith: REQUEST_PREFIX } },
          ],
        },
      });
      await prisma().contactAccessEvent.deleteMany({
        where: { contactRelease: { listingId: { in: listingIds } } },
      });
      await prisma().contactRelease.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().negotiation.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().selection.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().payment.deleteMany({ where: { paymentAttemptId: { in: attemptIds } } });
      await prisma().paymentAttempt.deleteMany({ where: { id: { in: attemptIds } } });
      await prisma().contactRequest.deleteMany({ where: { id: { in: requestIds } } });
      await prisma().listingTransition.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().listing.deleteMany({ where: { id: { in: listingIds } } });
      await prisma().userContact.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().verification.deleteMany({
        where: {
          OR: [
            { identifier: { in: userIds.map((id) => `email-verification:${id}`) } },
            { identifier: { startsWith: 'login-failure:' } },
          ],
        },
      });
      await prisma().termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().user.deleteMany({ where: { id: { in: userIds } } });
      await prisma().$disconnect();
      vi.unstubAllEnvs();
    });

    // -----------------------------------------------------------------------
    it('C-8 (#104): fluxo completo e erro real sem contato em logs, envelopes, auditoria ou erros', async () => {
      const phone = '+5511912345678';
      const markers = [phone, phone.slice(1), '11912345678', '91234-5678'];
      const envelopes: string[] = [];
      const logged: string[] = [];
      const spies = ['log', 'warn', 'error', 'info', 'debug'].map((method) =>
        vi.spyOn(console, method as 'log').mockImplementation((...args: unknown[]) => {
          logged.push(
            args
              .map((a) =>
                a instanceof Error ? `${a.name}: ${a.message}\n${a.stack}` : JSON.stringify(a),
              )
              .join(' '),
          );
        }),
      );
      Sentry.init({
        ...createTelemetryOptions(),
        dsn: 'https://public@o0.ingest.sentry.io/0',
        transport: () => ({
          send: async (envelope: unknown) => {
            envelopes.push(JSON.stringify(envelope));
            return {};
          },
          flush: async () => true,
        }),
      });
      try {
        const listingId = await publishedListing();
        const r = await reserve('r0', listingId);
        const window = await windowOf(r.contactRequestId);
        accredit(r.orderId, new Date(window.reservedFrom.getTime() + 1_000));
        const payment = await deliver(notification(r.orderId));
        expect(payment.status).toBe(200);
        expect((await state(r)).request.status).toBe('paid');
        const chosen = await as('owner', () =>
          chooseRequester({ listingId, contactRequestId: r.contactRequestId, confirmed: true }),
        );
        expect(chosen.success).toBe(true);
        if (!chosen.success) throw new Error('Escolha recusada');
        const release = await prisma().contactRelease.findUniqueOrThrow({
          where: { negotiationId: chosen.negotiationId },
        });
        const legitimate = await as('r0', () => revealContact(release.id));
        expect(legitimate).toEqual({ success: true, phone });
        const denied = await as('r1', () => revealContact(release.id));
        expect(denied).toMatchObject({ success: false });
        // Falha real do banco ao gravar a entrega: rollback e mensagem generica.
        await prisma().$executeRawUnsafe(
          `ALTER TABLE "contact_access_events" ADD CONSTRAINT "it104_block_delivery" CHECK (false) NOT VALID`,
        );
        let errorReply: unknown;
        try {
          errorReply = await as('r0', () => revealContact(release.id));
          expect(errorReply).toMatchObject({ success: false, reason: 'unavailable' });
          try {
            await prisma().contactAccessEvent.create({
              data: {
                contactReleaseId: release.id,
                actorId: release.recipientId,
                accessedAt: new Date(),
              },
            });
          } catch (error) {
            Sentry.captureException(error, {
              extra: { phone, response: legitimate, cookie: cookies.r0 },
            });
          }
        } finally {
          await prisma().$executeRawUnsafe(
            `ALTER TABLE "contact_access_events" DROP CONSTRAINT "it104_block_delivery"`,
          );
        }
        Sentry.addBreadcrumb({ category: 'contact', message: `Contato ${phone}`, data: { phone } });
        Sentry.captureMessage('f3-security-flow-completed');
        Sentry.logger.info('f3-security-flow-completed', { phone, response: legitimate });
        await Sentry.flush(3000);
        await Sentry.close(3000);
        expect(envelopes.length).toBeGreaterThanOrEqual(2);
        expect(logged.length).toBeGreaterThan(0);
        const audit = await prisma().auditEvent.findMany({
          where: { OR: [{ actorId: { in: userIds } }, { targetId: release.id }] },
        });
        const outputs = JSON.stringify({ envelopes, logged, audit, denied, errorReply, chosen });
        for (const marker of markers)
          expect(outputs.includes(marker), 'C-8: contato fora da resposta autorizada').toBe(false);
        expect(
          await prisma().contactAccessEvent.count({ where: { contactReleaseId: release.id } }),
        ).toBe(1);
        // Captura nao vacua: confirma o marcador de controle no transporte.
        expect(envelopes.join('\n')).toContain('f3-security-flow-completed');
      } finally {
        await Sentry.close(3000);
        for (const spy of spies) spy.mockRestore();
      }
    });

    // -----------------------------------------------------------------------
    describe('T-13 e T-14: autenticidade na fronteira, sem efeito', () => {
      it('F3-014: correlacao hostil nao grava telefone como identificador tecnico na auditoria', async () => {
        const phone = '5511912345678';
        const before = await prisma().auditEvent.findMany({
          where: { eventType: 'payment.notification_rejected' },
          select: { id: true },
        });
        const reply = await deliver(
          notification(phone, { requestId: phone, signature: `ts=1,v1=${'0'.repeat(64)}` }),
        );
        expect(reply.status).toBe(401);
        expect(await reply.text()).toBe('');
        const fresh = await prisma().auditEvent.findMany({
          where: {
            eventType: 'payment.notification_rejected',
            id: { notIn: before.map((e) => e.id) },
          },
        });
        expect(fresh).toHaveLength(1);
        expect(fresh[0].details).toMatchObject({
          reason: 'signature_invalid',
          providerRequestId: null,
          providerDataId: null,
        });
        expect(JSON.stringify(fresh)).not.toContain(phone);
        // Evento desta fixture nao tem id de correlacao; limpeza pelo id gerado.
        await prisma().auditEvent.deleteMany({ where: { id: { in: fresh.map((e) => e.id) } } });
      });

      async function expectRejected(r: Reserved, request: Request, status: number) {
        const before = await state(r);
        const notificationsBefore = await prisma().paymentNotification.count({
          where: { paymentAttemptId: r.attemptId },
        });
        const response = await deliver(request);
        expect(response.status).toBe(status);
        expect(await response.text()).toBe('');
        const after = await state(r);
        expect(after.attempt.status).toBe(before.attempt.status);
        expect(after.request.status).toBe('reserved');
        expect(
          await prisma().paymentNotification.count({ where: { paymentAttemptId: r.attemptId } }),
        ).toBe(notificationsBefore);
      }

      it.each([
        ['v1 adulterado', { signature: `ts=1,v1=${'0'.repeat(64)}` }, 401],
        ['assinatura ausente', { signature: null }, 401],
        ['assinatura malformada', { signature: 'ts=abc,v1=zz' }, 401],
        ['segredo de outra aplicacao', { secret: 'outro-segredo' }, 401],
        ['aplicacao divergente (antes do HMAC)', { applicationId: '1234' }, 401],
        [
          'ts do cabecalho diferente do assinado',
          { ts: '1700000000000', signatureTs: '1700000000001' },
          401,
        ],
        ['corpo ininteligivel', { rawBody: '{nao-json' }, 400],
      ] as const)('%s: rejeitada', async (_c, opts, status) => {
        const listingId = await publishedListing();
        const r = await reserve('r1', listingId);
        await expectRejected(r, notification(r.orderId, opts), status);
      });

      it('data.id da query adulterado: a assinatura nao confere', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r2', listingId);
        const requestId = nextRequestId();
        const ts = String(Date.now());
        const signedFor = hmac(
          SECRET,
          `id:${r.orderId.toLowerCase()};request-id:${requestId};ts:${ts};`,
        );
        const tampered = notification(r.orderId, {
          queryDataId: `${r.orderId}X`,
          requestId,
          ts,
          signature: `ts=${ts},v1=${signedFor}`,
        });
        await expectRejected(r, tampered, 401);
      });

      it('x-request-id adulterado: a assinatura nao confere', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r3', listingId);
        const ts = String(Date.now());
        const signedFor = hmac(
          SECRET,
          `id:${r.orderId.toLowerCase()};request-id:${REQUEST_PREFIX}-orig;ts:${ts};`,
        );
        await expectRejected(
          r,
          notification(r.orderId, { ts, signature: `ts=${ts},v1=${signedFor}` }),
          401,
        );
      });

      it('T-14: manifesto remontado a partir do CORPO e rejeitado', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r4', listingId);
        const requestId = nextRequestId();
        const ts = String(Date.now());
        // Assinatura valida para o id do CORPO; a query traz outro id (e depois nenhum).
        const bodyManifest = `id:${r.orderId.toLowerCase()};request-id:${requestId};ts:${ts};`;
        await expectRejected(
          r,
          notification(r.orderId, {
            queryDataId: 'ORDOUTRA0001',
            bodyDataId: r.orderId,
            requestId,
            ts,
            manifest: bodyManifest,
            signature: `ts=${ts},v1=${hmac(SECRET, bodyManifest)}`,
          }),
          401,
        );
        await expectRejected(
          r,
          notification(r.orderId, {
            queryDataId: null,
            requestId,
            ts,
            signature: `ts=${ts},v1=${hmac(SECRET, bodyManifest)}`,
          }),
          401,
        );
      });

      it('registro minimo da rejeicao: motivo e correlacao, sem assinatura, corpo ou segredo', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r0', listingId);
        const requestId = nextRequestId();
        const ts = String(Date.now());
        const v1 = 'a'.repeat(64);
        await deliver(notification(r.orderId, { requestId, ts, signature: `ts=${ts},v1=${v1}` }));
        const [event] = await prisma().auditEvent.findMany({
          where: {
            eventType: 'payment.notification_rejected',
            details: { path: ['providerRequestId'], equals: requestId },
          },
        });
        expect(event).toMatchObject({ actorId: null, result: 'rejected' });
        expect(event.details).toEqual({
          reason: 'signature_invalid',
          providerRequestId: requestId,
          providerDataId: r.orderId,
        });
        const text = JSON.stringify(event);
        for (const secret of [v1, SECRET, ts, 'order.processed', APP_ID]) {
          expect(text).not.toContain(secret);
        }
      });

      it('topico diferente de order: 200 sem efeito; configuracao ausente: 503', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r1', listingId);
        await expectRejected(r, notification(r.orderId, { type: 'payment' }), 200);
        vi.stubEnv('MERCADO_PAGO_WEBHOOK_SECRET', '');
        await expectRejected(r, notification(r.orderId), 503);
      });
    });

    // -----------------------------------------------------------------------
    describe('notificacao valida e confirmacao', () => {
      it('acreditada a tempo: paid, pagamento_confirmado, canonico, dois instantes e auditoria', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r0', listingId);
        const { reservedFrom } = await windowOf(r.contactRequestId);
        // Pago logo depois de reservar; reconhecido depois disso.
        const approvedAt = new Date(reservedFrom.getTime() + 1);
        accredit(r.orderId, approvedAt);

        const response = await deliver(notification(r.orderId));

        expect(response.status).toBe(200);
        const s = await state(r);
        expect(s.request.status).toBe('paid');
        expect(s.request.paidAt).not.toBeNull();
        expect(s.attempt).toMatchObject({
          status: 'pagamento_confirmado',
          recognitionSource: 'notificacao',
        });
        expect(s.attempt.accreditedAt?.getTime()).toBe(approvedAt.getTime());
        expect(s.attempt.recognizedAt!.getTime()).toBeGreaterThan(approvedAt.getTime());
        expect(s.payments).toHaveLength(1);
        expect(s.payments[0]).toMatchObject({ isCanonical: true, amountCents: 99 });
        expect(s.payments[0].accreditedAt?.getTime()).toBe(approvedAt.getTime());
        const [approved] = await audits('payment.approved', [r.attemptId]);
        expect(approved.details).toMatchObject({
          accreditedAt: approvedAt.toISOString(),
          recognitionSource: 'notificacao',
        });
        expect(await audits('request.paid', [r.contactRequestId])).toHaveLength(1);
        const [notified] = await prisma().paymentNotification.findMany({
          where: { paymentAttemptId: r.attemptId },
        });
        expect(notified.processingResult).toBe('confirmed');

        // TE-1 e TE-2 (F3-013): depois do commit, um aviso a quem pagou e um
        // ao anunciante; nenhum texto de pessoa e nenhum contato.
        const mails = sent();
        expect(mails.map((m) => [m.to, m.idempotencyKey]).sort()).toEqual(
          [
            [email('owner'), `troq-notice/request_paid_owner/${r.contactRequestId}`],
            [email('r0'), `troq-notice/request_paid_requester/${r.contactRequestId}`],
          ].sort(),
        );
        for (const m of mails) {
          const body = `${m.subject}${m.text}${m.html}`;
          for (const piece of ['91234-5678', '912345678', '11912345678']) {
            expect(body).not.toContain(piece);
          }
        }
      });

      it(`T-3: a mesma notificacao entregue 5 vezes ao mesmo tempo produz um unico efeito`, async () => {
        const listingId = await publishedListing();
        const r = await reserve('r1', listingId);
        const { reservedFrom } = await windowOf(r.contactRequestId);
        accredit(r.orderId, new Date(reservedFrom.getTime() + 30_000));
        const requestId = nextRequestId();
        const ts = String(Date.now());

        const responses = await Promise.all(
          Array.from({ length: 5 }, () => deliver(notification(r.orderId, { requestId, ts }))),
        );

        expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
        expect(
          await prisma().paymentNotification.count({ where: { paymentAttemptId: r.attemptId } }),
        ).toBe(5);
        expect(await audits('payment.approved', [r.attemptId])).toHaveLength(1);
        expect(await audits('request.paid', [r.contactRequestId])).toHaveLength(1);
        const s = await state(r);
        expect(s.request.status).toBe('paid');
        expect(s.payments.filter((p) => p.isCanonical)).toHaveLength(1);
        // F3-013: cinco entregas simultaneas, uma transicao, um aviso de cada tipo.
        expect(
          sent()
            .map((m) => m.idempotencyKey)
            .sort(),
        ).toEqual([
          `troq-notice/request_paid_owner/${r.contactRequestId}`,
          `troq-notice/request_paid_requester/${r.contactRequestId}`,
        ]);
      });

      it('T-4: fora de ordem, o estado final e o autoritativo', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r2', listingId);
        const first = notification(r.orderId);
        const second = notification(r.orderId);

        // A segunda chega primeiro, com a order ainda pendente.
        expect((await deliver(second)).status).toBe(200);
        expect((await state(r)).attempt.status).toBe('aguardando_pagamento');

        const { reservedFrom } = await windowOf(r.contactRequestId);
        accredit(r.orderId, new Date(reservedFrom.getTime() + 120_000));
        // A primeira (mais antiga) chega depois: vale o estado consultado, nao a ordem.
        expect((await deliver(first)).status).toBe(200);
        // Reentrega tardia da segunda: sem segundo efeito.
        expect((await deliver(notification(r.orderId))).status).toBe(200);

        const s = await state(r);
        expect(s.request.status).toBe('paid');
        expect(s.attempt.status).toBe('pagamento_confirmado');
        expect(await audits('payment.approved', [r.attemptId])).toHaveLength(1);
        const results = (
          await prisma().paymentNotification.findMany({
            where: { paymentAttemptId: r.attemptId },
            orderBy: { receivedAt: 'asc' },
          })
        ).map((n) => n.processingResult);
        expect(results).toEqual(['pending', 'confirmed', 'already_confirmed']);
        // F3-013: a reentrega reprocessa a mesma transicao e nao reenvia.
        expect(sent()).toHaveLength(2);
        expect(
          await confirmPaymentFlow(r.attemptId, { origin: 'reconciliacao', deps: { gateway } }),
        ).toBe('already_confirmed');
        expect(sent()).toHaveLength(2);
      });

      it('T-6: acreditada dentro da janela e reconhecida muito depois vale, com os dois instantes', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r3', listingId);
        const window = await moveWindowToPast(r.contactRequestId);
        const approvedAt = new Date(window.reservedFrom.getTime() + 10 * 60_000);
        accredit(r.orderId, approvedAt);

        // Sem notificacao: a reconciliacao (F3-008) chama a mesma rotina.
        expect(
          await confirmPaymentFlow(r.attemptId, { origin: 'reconciliacao', deps: { gateway } }),
        ).toBe('confirmed');

        const s = await state(r);
        expect(s.request.status).toBe('paid');
        expect(s.attempt.recognitionSource).toBe('reconciliacao');
        expect(s.attempt.accreditedAt!.getTime()).toBe(approvedAt.getTime());
        expect(s.attempt.accreditedAt!.getTime()).toBeLessThanOrEqual(
          window.reservedUntil.getTime(),
        );
        expect(s.attempt.recognizedAt!.getTime()).toBeGreaterThan(window.reservedUntil.getTime());
      });

      it('anuncio pausado com reserva viva: a acreditacao tempestiva confirma (PD-6.11)', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r4', listingId);
        expect(await as('owner', () => pauseListing(listingId))).toMatchObject({ success: true });
        const { reservedFrom } = await windowOf(r.contactRequestId);
        accredit(r.orderId, new Date(reservedFrom.getTime() + 60_000));

        expect((await deliver(notification(r.orderId))).status).toBe(200);

        expect((await state(r)).request.status).toBe('paid');
      });

      it('order desconhecida: 200, registrada sem tentativa, sem efeito', async () => {
        const requestId = nextRequestId();
        const response = await deliver(notification('ORDDESCONHECIDA0001', { requestId }));
        expect(response.status).toBe(200);
        const [row] = await prisma().paymentNotification.findMany({
          where: { providerRequestId: requestId },
        });
        expect(row).toMatchObject({ paymentAttemptId: null, processingResult: 'unknown_order' });
      });
    });

    // -----------------------------------------------------------------------
    describe('T-2: duas reservas disputando a ultima vaga, confirmacoes simultaneas', () => {
      it('uma consome a vaga, a outra vira excecao RT-3; nenhuma fica ambigua', async () => {
        const listingId = await publishedListing();
        // Duas vagas ja pagas pelo fluxo real.
        for (const tag of ['r0', 'r1']) {
          const paid = await reserve(tag, listingId);
          const { reservedFrom } = await windowOf(paid.contactRequestId);
          accredit(paid.orderId, new Date(reservedFrom.getTime() + 30_000));
          expect(
            await confirmPaymentFlow(paid.attemptId, { origin: 'notificacao', deps: { gateway } }),
          ).toBe('confirmed');
        }
        // A reserva a ultima vaga e tem a janela vencida; B aloca e a expira (DM-6.3).
        const a = await reserve('r2', listingId);
        const aWindow = await moveWindowToPast(a.contactRequestId);
        const b = await reserve('r3', listingId);
        expect((await windowOf(a.contactRequestId)).status).toBe('expired');
        // Os dois Pix acreditam dentro das proprias janelas.
        accredit(a.orderId, new Date(aWindow.reservedFrom.getTime() + 60_000));
        const { reservedFrom: bFrom } = await windowOf(b.contactRequestId);
        accredit(b.orderId, new Date(bFrom.getTime() + 1_000));

        let pending!: Promise<string[]>;
        let waiting = 0;
        await prisma().$transaction(
          async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${listingId}::uuid FOR UPDATE`;
            pending = Promise.all(
              [a, b].map((r) =>
                confirmPaymentFlow(r.attemptId, { origin: 'notificacao', deps: { gateway } }),
              ),
            );
            for (let i = 0; i < 100 && waiting < 2; i++) {
              await new Promise((resolve) => setTimeout(resolve, 100));
              const [{ count }] = await tx.$queryRaw<{ count: number }[]>`
                SELECT count(*)::int AS "count" FROM pg_stat_activity
                WHERE "datname" = current_database()
                  AND "wait_event_type" = 'Lock'
                  AND "pid" <> pg_backend_pid()`;
              waiting = count;
            }
          },
          { timeout: 30_000, maxWait: 10_000 },
        );

        expect(waiting).toBe(2);
        expect((await pending).sort()).toEqual(['confirmed', 'exception_rt_3']);
        const [sa, sb] = await Promise.all([state(a), state(b)]);
        expect(sb.request.status).toBe('paid');
        expect(sb.attempt.status).toBe('pagamento_confirmado');
        expect(sa.request.status).toBe('expired');
        // A excecao e devolvida logo depois (F3-007): caso fechado com desfecho real.
        expect(sa.attempt.status).toBe('reembolsada_ou_revertida');
        expect(sa.cases.map((c) => [c.kind, c.reason, c.outcome])).toEqual([
          ['reembolso_pendente', 'rt_3', 'refunded'],
        ]);
        expect(await prisma().contactRequest.count({ where: { listingId, status: 'paid' } })).toBe(
          3,
        );
      });
    });

    // -----------------------------------------------------------------------
    describe('falhas e incertezas nunca viram aprovacao', () => {
      it('T-10: o provedor confirmou e a persistencia falhou -> retomada sem nova order', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r0', listingId);
        const { reservedFrom } = await windowOf(r.contactRequestId);
        accredit(r.orderId, new Date(reservedFrom.getTime() + 60_000));
        await prisma().$executeRaw`
          ALTER TABLE "audit_events" ADD CONSTRAINT "it_f3006_block_audit"
          CHECK ("event_type" <> 'payment.approved') NOT VALID`;
        try {
          await expect(
            confirmPaymentFlow(r.attemptId, { origin: 'notificacao', deps: { gateway } }),
          ).rejects.toThrow();
          const failed = await state(r);
          expect(failed.request.status).toBe('reserved');
          expect(failed.attempt.status).toBe('aguardando_pagamento');
          expect(failed.attempt.accreditedAt).toBeNull();
          expect(failed.payments.every((p) => !p.isCanonical)).toBe(true);
        } finally {
          await prisma()
            .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "it_f3006_block_audit"`;
        }

        expect(
          await confirmPaymentFlow(r.attemptId, { origin: 'reconciliacao', deps: { gateway } }),
        ).toBe('confirmed');
        expect((await state(r)).request.status).toBe('paid');
        expect(sim.creates.filter((ref) => ref === r.externalReference)).toHaveLength(1);
      });

      it.each([
        ['consulta da order indisponivel', () => (sim.getMode = 'unavailable')],
        ['busca da Payments API indisponivel', () => (sim.searchMode = 'unavailable')],
        [
          'busca ainda sem resultado (indexacao)',
          (orderRef: string) => sim.search.set(orderRef, []),
        ],
      ])('T-11: %s -> pendente, sem direito', async (_c, breakIt) => {
        const listingId = await publishedListing();
        const r = await reserve('r1', listingId);
        const { reservedFrom } = await windowOf(r.contactRequestId);
        accredit(r.orderId, new Date(reservedFrom.getTime() + 60_000));
        breakIt(r.externalReference);

        expect((await deliver(notification(r.orderId))).status).toBe(200);

        const s = await state(r);
        expect(s.request.status).toBe('reserved');
        expect(s.attempt.status).toBe('em_confirmacao');
        expect(s.cases).toHaveLength(0);
        expect(await audits('payment.approved', [r.attemptId])).toHaveLength(0);
      });

      it.each([
        [
          'status desconhecido da order',
          (r: Reserved) => setOrderStatus(r.orderId, 'em_analise_x', 'x'),
        ],
        [
          'busca com valor divergente',
          (r: Reserved) => {
            const order = sim.byId.get(r.orderId)!;
            accredit(r.orderId, new Date(order.created_date), { transaction_amount: 1.99 });
          },
        ],
        [
          'busca sem date_approved',
          (r: Reserved) => accredit(r.orderId, new Date(), { date_approved: null }),
        ],
      ])('T-12: %s -> inconsistente, caso aberto, nunca aprovado', async (_c, breakIt) => {
        const listingId = await publishedListing();
        const r = await reserve('r2', listingId);
        breakIt(r);

        expect(
          await confirmPaymentFlow(r.attemptId, { origin: 'reconciliacao', deps: { gateway } }),
        ).toBe('inconsistent');
        // Reprocessar nao abre segundo caso.
        await confirmPaymentFlow(r.attemptId, { origin: 'reconciliacao', deps: { gateway } });

        const s = await state(r);
        expect(s.request.status).toBe('reserved');
        expect(s.attempt.status).toBe('inconsistente');
        expect(s.cases.map((c) => c.kind)).toEqual(['inconsistente']);
        expect(await audits('payment.approved', [r.attemptId])).toHaveLength(0);
      });

      it('orcamento do receptor: provedor lento -> 200 dentro do orcamento, sem efeito parcial', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r3', listingId);
        const { reservedFrom } = await windowOf(r.contactRequestId);
        accredit(r.orderId, new Date(reservedFrom.getTime() + 60_000));
        sim.getMode = 'slow';
        sim.slowMs = 1_500;
        const requestId = nextRequestId();

        const started = Date.now();
        const response = await deliver(notification(r.orderId, { requestId }), 300);
        const elapsed = Date.now() - started;

        expect(response.status).toBe(200);
        expect(elapsed).toBeLessThan(1_200);
        const [row] = await prisma().paymentNotification.findMany({
          where: { providerRequestId: requestId },
        });
        expect(row.processingResult).toBe('deferred');
        // A confirmacao em curso termina sozinha e converge (idempotente).
        await new Promise((resolve) => setTimeout(resolve, 2_500));
        expect((await state(r)).request.status).toBe('paid');
      });
    });

    // -----------------------------------------------------------------------
    describe('excecoes, duplicidade e desfechos sem acreditacao', () => {
      it('acreditada DEPOIS da janela: RT-2 persistida, sem vaga, reserva expirada', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r4', listingId);
        const window = await moveWindowToPast(r.contactRequestId);
        accredit(r.orderId, new Date(window.reservedUntil.getTime() + 60_000));

        expect(
          await confirmPaymentFlow(r.attemptId, { origin: 'reconciliacao', deps: { gateway } }),
        ).toBe('exception_rt_2');

        const s = await state(r);
        expect(s.request.status).toBe('expired');
        expect(s.attempt.status).toBe('reembolsada_ou_revertida');
        expect(s.cases.map((c) => [c.kind, c.reason, c.outcome])).toEqual([
          ['reembolso_pendente', 'rt_2', 'refunded'],
        ]);
        expect(await audits('request.paid', [r.contactRequestId])).toHaveLength(0);
        // F3-013: excecao nao e pagamento confirmado; nenhum TE-1/TE-2. A
        // devolucao concluida avisa quem pagou, uma vez (TE-6, DEC-048).
        const refund = await prisma().technicalRefund.findFirstOrThrow({
          where: { payment: { paymentAttemptId: r.attemptId } },
        });
        expect(sent().map((m) => [m.to, m.idempotencyKey])).toEqual([
          [email('r4'), `troq-notice/refund_concluded/${refund.id}`],
        ]);
      });

      it('dois pagamentos aprovados na busca: canonico eleito e excedente RT-1 (F3-007)', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r0', listingId);
        const { reservedFrom } = await windowOf(r.contactRequestId);
        accredit(r.orderId, new Date(reservedFrom.getTime() + 60_000));
        const [first] = sim.search.get(r.externalReference)!;
        sim.search.set(r.externalReference, [first, { ...first, id: `${String(first.id)}9` }]);

        expect(
          await confirmPaymentFlow(r.attemptId, { origin: 'reconciliacao', deps: { gateway } }),
        ).toBe('confirmed');

        const s = await state(r);
        expect(s.request.status).toBe('paid');
        expect(s.attempt.status).toBe('pagamento_confirmado');
        expect(s.cases.map((c) => [c.kind, c.reason])).toEqual([['reembolso_pendente', 'rt_1']]);
        expect(s.payments.filter((p) => p.isCanonical).map((p) => p.providerPaymentId)).toEqual([
          String(first.id),
        ]);
      });

      it.each([
        ['expired', 'expirada', 'expired'],
        ['canceled', 'falha', 'failed'],
      ])(
        'order %s sem acreditacao: tentativa %s, vaga liberada (%s)',
        async (status, attemptStatus, requestStatus) => {
          const listingId = await publishedListing();
          const r = await reserve('r1', listingId);
          setOrderStatus(r.orderId, status, status);

          expect(
            await confirmPaymentFlow(r.attemptId, { origin: 'reconciliacao', deps: { gateway } }),
          ).toBe('not_accredited');

          const s = await state(r);
          expect(s.attempt.status).toBe(attemptStatus);
          expect(s.request.status).toBe(requestStatus);
        },
      );
    });
  },
);
