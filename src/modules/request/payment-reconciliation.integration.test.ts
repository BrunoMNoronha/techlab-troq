// @vitest-environment node
//
// Prova de integracao de F3-008 (#98): reconciliacao periodica e retentativa de
// reembolso, contra o Better Auth REAL e PostgreSQL REAL e descartavel, com o
// Mercado Pago SIMULADO (`node:http`): Orders API (criacao, consulta, busca por
// `external_reference`, reembolso, cancelamento) e a busca da Payments API.
//
// PD-13.2:
// - T-5 nao entrega NENHUMA notificacao: so a reconciliacao age;
// - T-18 roda duas execucoes REALMENTE sobrepostas: a primeira segura a
//   transacao de reclamacao aberta enquanto a segunda reclama, e a segunda
//   termina a sua reclamacao sem esperar trava (vista em `pg_stat_activity`);
// - a retentativa falha de verdade ate esgotar as tentativas automaticas.
// A recusa da rota sem segredo, com segredo errado e com esquema errado e
// exercitada pela rota HTTP real no fim (servidor `pnpm start`).
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1. Dados sinteticos.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeListing } from '@/app/anuncios/actions';
import { registerOwnContact } from '@/modules/contact';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { createDraftListing } from '@/modules/listing/actions';
import {
  claimAttemptsForReconciliation,
  claimRefundsForRetry,
  createMercadoPagoClient,
  REFUND_MAX_ATTEMPTS,
  refundBackoffHours,
  runRefundRetry,
} from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';
import { requestContactUnlockFlow } from './charge-flow';
import { confirmPaymentFlow } from './payment-confirmation';
import { runPaymentReconciliation } from './reconciliation';

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

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const TOKEN = 'TEST-sintetico-reconciliacao-0000';
const email = (tag: string) => `it-reconciliacao-${tag}-${RUN_ID}@example.test`;
const prisma = () => getPrismaClient();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const userIds: string[] = [];
const cookies: Record<string, string> = {};

// ---------------------------------------------------------------------------
// Provedor simulado
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

interface SimOrder {
  id: string;
  external_reference: string;
  status: string;
  status_detail: string;
  total_amount: string;
  total_paid_amount: string;
  created_date: string;
  last_updated_date: string;
  transactions: { payments: Raw[]; refunds?: Raw[] };
}

const sim = {
  byKey: new Map<string, SimOrder>(),
  byId: new Map<string, SimOrder>(),
  search: new Map<string, Raw[]>(),
  /** Orders cuja consulta responde 503. */
  unavailable: new Set<string>(),
  /** Cria a order e DERRUBA a resposta (passo 3 nunca acontece). */
  dropCreate: false,
  refundMode: 'ok' as 'ok' | 'unavailable' | 'rate_limited' | 'rejected' | 'cannot_refund',
  refundPosts: [] as string[],
  refundCalls: [] as { orderId: string; key: string; applied: boolean }[],
  cancelCalls: [] as { orderId: string; key: string }[],
  orderSearches: [] as string[],
  gets: new Map<string, number>(),
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
    id: `ORDREC${n}`,
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
          id: `PAYREC${n}`,
          amount: String(payment.amount),
          status: 'action_required',
          status_detail: 'waiting_transfer',
          date_of_expiration: new Date(Date.now() + 30 * 60_000).toISOString(),
          payment_method: { id: 'pix', type: 'bank_transfer', qr_code: `000201REC${n}` },
        },
      ],
    },
  };
}

function handle(req: IncomingMessage, res: ServerResponse, raw: string) {
  const url = new URL(req.url ?? '/', 'http://sim');
  const key = req.headers['x-idempotency-key'] as string;
  if (req.method === 'POST' && url.pathname === '/v1/orders') {
    let order = sim.byKey.get(key);
    if (!order) {
      order = newOrder(JSON.parse(raw));
      sim.byKey.set(key, order);
      sim.byId.set(order.id, order);
    }
    if (sim.dropCreate) return reply(res, 503, { errors: [{ code: 'internal_error' }] });
    return reply(res, 201, order);
  }
  if (req.method === 'GET' && url.pathname === '/v1/orders') {
    const reference = url.searchParams.get('external_reference') ?? '';
    const from = url.searchParams.get('begin_date');
    const to = url.searchParams.get('end_date');
    if (!from || !to) return reply(res, 400, { errors: [{ code: 'required_search_params' }] });
    sim.orderSearches.push(reference);
    const data = [...sim.byId.values()].filter(
      (o) =>
        o.external_reference === reference &&
        o.created_date >= new Date(from).toISOString() &&
        o.created_date <= new Date(to).toISOString(),
    );
    return reply(res, 200, { data, paging: { total: String(data.length) } });
  }
  const action = /^\/v1\/orders\/([^/]+)(?:\/(refund|cancel))?$/.exec(url.pathname);
  const order = action ? sim.byId.get(decodeURIComponent(action[1])) : undefined;
  if (req.method === 'GET' && action && !action[2]) {
    if (order) sim.gets.set(order.id, (sim.gets.get(order.id) ?? 0) + 1);
    if (order && sim.unavailable.has(order.id)) {
      return reply(res, 503, { errors: [{ code: 'internal_error' }] });
    }
    return order
      ? reply(res, 200, order)
      : reply(res, 404, { errors: [{ code: 'order_not_found' }] });
  }
  if (req.method === 'POST' && action?.[2] === 'refund') {
    sim.refundPosts.push(order?.id ?? '');
    if (sim.refundMode === 'unavailable') return reply(res, 503, {});
    if (sim.refundMode === 'rate_limited') {
      return reply(res, 429, { errors: [{ code: 'too_many_requests' }] });
    }
    if (sim.refundMode === 'cannot_refund') {
      // Recusa generica documentada (409); DEC-045 a trata como saldo insuficiente.
      return reply(res, 409, { errors: [{ code: 'cannot_refund_order' }] });
    }
    if (sim.refundMode === 'rejected') {
      // Codigo que a lista oficial NAO documenta (saldo insuficiente presumido).
      return reply(res, 400, { errors: [{ code: 'insufficient_balance' }] });
    }
    if (!order) return reply(res, 404, { errors: [{ code: 'order_not_found' }] });
    const open = order.transactions.payments.filter((p) => p.status !== 'refunded');
    for (const p of open) Object.assign(p, { status: 'refunded', status_detail: 'refunded' });
    if (open.length > 0) {
      Object.assign(order, { status: 'refunded', status_detail: 'refunded' });
      order.transactions.refunds = [{ id: `REFREC${sim.refundCalls.length + 1}`, amount: '0.99' }];
    }
    sim.refundCalls.push({ orderId: order.id, key, applied: open.length > 0 });
    return open.length > 0
      ? reply(res, 201, order)
      : reply(res, 409, { errors: [{ code: 'order_already_refunded' }] });
  }
  if (req.method === 'POST' && action?.[2] === 'cancel' && order) {
    sim.cancelCalls.push({ orderId: order.id, key });
    if (order.status !== 'action_required' && order.status !== 'created') {
      return reply(res, 409, { errors: [{ code: 'cannot_cancel_order' }] });
    }
    Object.assign(order, { status: 'canceled', status_detail: 'canceled' });
    for (const p of order.transactions.payments) {
      Object.assign(p, { status: 'canceled', status_detail: 'canceled' });
    }
    return reply(res, 200, order);
  }
  if (req.method === 'GET' && url.pathname === '/v1/payments/search') {
    const reference = url.searchParams.get('external_reference') ?? '';
    return reply(res, 200, { results: sim.search.get(reference) ?? [] });
  }
  return reply(res, 404, {});
}

let server: Server;
let gateway: ReturnType<typeof createMercadoPagoClient>;

/** Order acreditada, com `date_approved` autoritativo na busca da Payments API. */
function accredit(orderId: string, approvedAt: Date) {
  const order = sim.byId.get(orderId)!;
  Object.assign(order, {
    status: 'processed',
    status_detail: 'accredited',
    total_paid_amount: '0.99',
  });
  for (const p of order.transactions.payments) {
    Object.assign(p, { status: 'processed', status_detail: 'accredited', paid_amount: p.amount });
  }
  sim.search.set(order.external_reference, [
    {
      id: `${RUN_ID.replace(/\D/g, '').slice(-7)}${sim.counter}${Date.now() % 100000}`,
      status: 'approved',
      status_detail: 'accredited',
      external_reference: order.external_reference,
      transaction_amount: 0.99,
      date_approved: approvedAt.toISOString(),
    },
  ]);
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
  orderId: string | null;
  externalReference: string;
}

async function reserve(tag: string, listingId: string): Promise<Reserved> {
  const res = await as(tag, () => requestContactUnlockFlow(listingId, { gateway }));
  if (!res.success) throw new Error(`reserva falhou: ${JSON.stringify(res)}`);
  const attempt = await prisma().paymentAttempt.findUniqueOrThrow({
    where: { contactRequestId: res.contactRequestId },
  });
  return {
    contactRequestId: res.contactRequestId,
    attemptId: attempt.id,
    orderId: attempt.providerOrderId,
    externalReference: attempt.externalReference,
  };
}

async function windowOf(contactRequestId: string) {
  return prisma().contactRequest.findUniqueOrThrow({
    where: { id: contactRequestId },
    select: { reservedFrom: true, reservedUntil: true, status: true },
  });
}

async function moveWindowToPast(contactRequestId: string) {
  await prisma().$executeRaw`
    UPDATE "contact_requests"
    SET "reserved_from" = now() - interval '2 hours',
        "reserved_until" = now() - interval '90 minutes'
    WHERE "id" = ${contactRequestId}::uuid`;
  return windowOf(contactRequestId);
}

async function state(r: Reserved) {
  const [attempt, request, cases, refunds, notifications] = await Promise.all([
    prisma().paymentAttempt.findUniqueOrThrow({ where: { id: r.attemptId } }),
    prisma().contactRequest.findUniqueOrThrow({ where: { id: r.contactRequestId } }),
    prisma().reconciliationCase.findMany({
      where: { paymentAttemptId: r.attemptId },
      orderBy: { openedAt: 'asc' },
    }),
    prisma().technicalRefund.findMany({
      where: { payment: { paymentAttemptId: r.attemptId } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma().paymentNotification.count({ where: { paymentAttemptId: r.attemptId } }),
  ]);
  return { attempt, request, cases, refunds, notifications };
}

function audits(eventType: string, targetIds: string[]) {
  return prisma().auditEvent.findMany({ where: { eventType, targetId: { in: targetIds } } });
}

/**
 * Isola cada prova: tudo o que nao e desta prova fica fora da elegibilidade
 * (o banco e descartavel e compartilhado pelas provas deste arquivo).
 */
async function park(attemptIds: string[], refundIds: string[] = []) {
  await prisma().$executeRaw`
    UPDATE "payment_attempts" SET "next_reconcile_at" = now() + interval '10 years'
    WHERE NOT ("id" = ANY(${attemptIds}::uuid[]))`;
  await prisma().$executeRaw`
    UPDATE "technical_refunds" SET "next_attempt_at" = now() + interval '10 years'
    WHERE NOT ("id" = ANY(${refundIds}::uuid[]))`;
}

/** Faz o tempo passar para o recuo: as linhas indicadas voltam a ser elegiveis. */
async function makeDue(attemptIds: string[], refundIds: string[] = []) {
  await prisma().$executeRaw`
    UPDATE "payment_attempts" SET "next_reconcile_at" = now() - interval '1 second'
    WHERE "id" = ANY(${attemptIds}::uuid[])`;
  await prisma().$executeRaw`
    UPDATE "technical_refunds" SET "next_attempt_at" = now() - interval '1 second'
    WHERE "id" = ANY(${refundIds}::uuid[])`;
}

const reconcile = (extra: Partial<Parameters<typeof runPaymentReconciliation>[0]> = {}) =>
  runPaymentReconciliation({ stopClaimingAt: Date.now() + 30_000, deps: { gateway }, ...extra });

const retryRefunds = (extra: Partial<Parameters<typeof runRefundRetry>[0]> = {}) =>
  runRefundRetry({ stopClaimingAt: Date.now() + 30_000, deps: { gateway }, ...extra });

async function until(condition: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (condition()) return true;
    await sleep(25);
  }
  return condition();
}

async function lockWaits(): Promise<number> {
  const [{ count }] = await prisma().$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS "count" FROM pg_stat_activity
    WHERE "datname" = current_database() AND "wait_event_type" = 'Lock'`;
  return count;
}

/** RT-2 com o primeiro reembolso falhando por indisponibilidade. */
async function failingRefund(tag: string): Promise<Reserved & { refundId: string }> {
  const listingId = await publishedListing();
  const r = await reserve(tag, listingId);
  const window = await moveWindowToPast(r.contactRequestId);
  accredit(r.orderId!, new Date(window.reservedUntil.getTime() + 60_000));
  sim.refundMode = 'unavailable';
  expect(
    await confirmPaymentFlow(r.attemptId, { origin: 'reconciliacao', deps: { gateway } }),
  ).toBe('exception_rt_2');
  sim.refundMode = 'ok';
  const [refund] = (await state(r)).refunds;
  expect(refund).toMatchObject({ status: 'falhou_retentando', attemptCount: 1 });
  return { ...r, refundId: refund.id };
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'reconciliacao periodica e retentativa de reembolso (#98)',
  () => {
    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
      vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', TOKEN);

      server = createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => handle(req, res, raw));
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      gateway = createMercadoPagoClient({ baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 5_000 });

      for (const tag of ['owner', 'r0', 'r1', 'r2']) {
        await createUser(tag);
        cookies[tag] = await signIn(tag);
      }
      expect(await as('owner', () => registerOwnContact({ phone: '(11) 91234-5678' }))).toEqual({
        success: true,
        hasContact: true,
      });
    });

    beforeEach(() => {
      sim.refundMode = 'ok';
      sim.dropCreate = false;
      sim.unavailable.clear();
      vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', TOKEN);
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
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
      const refunds = await prisma().technicalRefund.findMany({
        where: { payment: { paymentAttemptId: { in: attemptIds } } },
        select: { id: true },
      });
      const cases = await prisma().reconciliationCase.findMany({
        where: { paymentAttemptId: { in: attemptIds } },
        select: { id: true },
      });
      await prisma().auditEvent.deleteMany({
        where: {
          OR: [
            { actorId: { in: userIds } },
            {
              targetId: {
                in: [
                  ...attemptIds,
                  ...requestIds,
                  ...refunds.map((r) => r.id),
                  ...cases.map((c) => c.id),
                ],
              },
            },
          ],
        },
      });
      await prisma().technicalRefund.deleteMany({
        where: { id: { in: refunds.map((r) => r.id) } },
      });
      await prisma().reconciliationCase.deleteMany({
        where: { id: { in: cases.map((c) => c.id) } },
      });
      await prisma().paymentNotification.deleteMany({
        where: { paymentAttemptId: { in: attemptIds } },
      });
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
    it('T-5: sem NENHUMA notificacao, a reconciliacao sozinha leva a paid pelo instante de acreditacao', async () => {
      const listingId = await publishedListing();
      const r = await reserve('r0', listingId);
      // Reserva feita ha 10 min, ainda viva; Pix pago 1 min depois de reservar.
      await prisma().$executeRaw`
        UPDATE "contact_requests"
        SET "reserved_from" = now() - interval '10 minutes',
            "reserved_until" = now() + interval '20 minutes'
        WHERE "id" = ${r.contactRequestId}::uuid`;
      const { reservedFrom } = await windowOf(r.contactRequestId);
      const approvedAt = new Date(reservedFrom.getTime() + 60_000);
      accredit(r.orderId!, approvedAt);
      await park([r.attemptId]);

      const summary = await reconcile();

      expect(summary).toMatchObject({ claimed: 1, confirmed: 1, errors: 0 });
      const s = await state(r);
      expect(s.notifications).toBe(0);
      expect(s.request.status).toBe('paid');
      expect(s.attempt).toMatchObject({
        status: 'pagamento_confirmado',
        recognitionSource: 'reconciliacao',
        lastReconcileResult: 'confirmed',
      });
      // O instante de ACREDITACAO, nao o de reconhecimento (PD-6.7, CI-4).
      expect(s.attempt.accreditedAt!.getTime()).toBe(approvedAt.getTime());
      expect(s.attempt.recognizedAt!.getTime()).toBeGreaterThan(approvedAt.getTime());

      // Executar de novo nao produz segundo efeito (PD-10.4).
      await makeDue([r.attemptId]);
      expect(await reconcile()).toMatchObject({ claimed: 0 });
      expect(await audits('payment.approved', [r.attemptId])).toHaveLength(1);
      expect(await audits('request.paid', [r.contactRequestId])).toHaveLength(1);
    });

    it('indisponibilidade: nada muda, nenhum direito, volta no proximo ciclo e converge depois', async () => {
      const listingId = await publishedListing();
      const r = await reserve('r1', listingId);
      const { reservedFrom } = await windowOf(r.contactRequestId);
      accredit(r.orderId!, new Date(reservedFrom.getTime() + 2_000));
      sim.unavailable.add(r.orderId!);
      await park([r.attemptId]);

      expect(await reconcile()).toMatchObject({ claimed: 1, unavailable: 1, confirmed: 0 });
      let s = await state(r);
      expect(s.attempt.status).toBe('aguardando_pagamento');
      expect(s.request.status).toBe('reserved');
      expect(s.cases).toHaveLength(0);
      expect(s.attempt.lastReconcileResult).toBe('unavailable');
      // O instante reclamado ficou no futuro: o mesmo ciclo nao a pega de novo.
      const delay = s.attempt.nextReconcileAt!.getTime() - s.attempt.lastReconciledAt!.getTime();
      expect(delay).toBeGreaterThan(3 * 60_000);
      expect(delay).toBeLessThanOrEqual(4 * 60_000 + 1_000);
      expect(await reconcile()).toMatchObject({ claimed: 0 });

      sim.unavailable.clear();
      await makeDue([r.attemptId]);
      expect(await reconcile()).toMatchObject({ claimed: 1, confirmed: 1 });
      s = await state(r);
      expect(s.request.status).toBe('paid');
    });

    // -----------------------------------------------------------------------
    describe('cancelamento pendente de PD-8.10', () => {
      it('T5 com cancelamento perdido: a reconciliacao cancela uma vez, com a chave persistida', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r2', listingId);
        vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', '');
        expect(await as('owner', () => closeListing(listingId))).toMatchObject({ success: true });
        vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', TOKEN);
        expect((await state(r)).attempt.status).toBe('aguardando_pagamento');
        await park([r.attemptId]);

        expect(await reconcile()).toMatchObject({ claimed: 1, canceled: 1 });
        await makeDue([r.attemptId]);
        expect(await reconcile()).toMatchObject({ claimed: 0 });

        const s = await state(r);
        expect(s.request.status).toBe('failed');
        expect(s.attempt.status).toBe('falha');
        expect(s.refunds).toHaveLength(0);
        expect(sim.cancelCalls.filter((c) => c.orderId === r.orderId).map((c) => c.key)).toEqual([
          s.attempt.cancelIdempotencyKey,
        ]);
      });

      it('acreditou antes do cancelamento: nao cancela, RT-3 e devolve', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r0', listingId);
        vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', '');
        await as('owner', () => closeListing(listingId));
        vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', TOKEN);
        const { reservedFrom } = await windowOf(r.contactRequestId);
        accredit(r.orderId!, new Date(reservedFrom.getTime() + 1_000));
        await park([r.attemptId]);

        expect(await reconcile()).toMatchObject({ claimed: 1, exceptions: 1 });

        const s = await state(r);
        expect(s.request.status).toBe('failed');
        expect(s.attempt.status).toBe('reembolsada_ou_revertida');
        expect(s.refunds.map((x) => [x.hypothesis, x.status])).toEqual([['rt_3', 'concluido']]);
        expect(sim.cancelCalls.filter((c) => c.orderId === r.orderId)).toHaveLength(0);
      });
    });

    // -----------------------------------------------------------------------
    describe('tentativa_criada com order perdida', () => {
      it('reserva viva: quem retoma e o solicitante; a reconciliacao nao busca nem cobra', async () => {
        const listingId = await publishedListing();
        sim.dropCreate = true;
        const r = await reserve('r1', listingId);
        sim.dropCreate = false;
        expect((await state(r)).attempt.status).toBe('tentativa_criada');
        const searches = sim.orderSearches.length;
        await park([r.attemptId]);

        expect(await reconcile()).toMatchObject({ claimed: 1, requesterOwned: 1 });
        expect(sim.orderSearches.length).toBe(searches);
        expect((await state(r)).attempt).toMatchObject({
          status: 'tentativa_criada',
          providerOrderId: null,
          lastReconcileResult: 'requester_owned',
        });
      });

      it('janela vencida: acha a order pela external_reference, registra e confirma o Pix tempestivo', async () => {
        const listingId = await publishedListing();
        sim.dropCreate = true;
        const r = await reserve('r2', listingId);
        sim.dropCreate = false;
        const order = [...sim.byId.values()].find(
          (o) => o.external_reference === r.externalReference,
        )!;
        const window = await moveWindowToPast(r.contactRequestId);
        // Pago dentro da janela; o TROQ nunca soube da order (PE-4.2).
        accredit(order.id, new Date(window.reservedFrom.getTime() + 60_000));
        await park([r.attemptId]);

        expect(await reconcile()).toMatchObject({ claimed: 1, adopted: 1, confirmed: 1 });

        const s = await state(r);
        expect(s.attempt).toMatchObject({
          status: 'pagamento_confirmado',
          providerOrderId: order.id,
          recognitionSource: 'reconciliacao',
          lastReconcileResult: 'adopted_confirmed',
        });
        expect(s.request.status).toBe('paid');
        expect(await audits('payment.charge_adopted', [r.attemptId])).toHaveLength(1);
        // Nunca cria order nova: a unica order desta referencia e a do passo 2.
        expect(
          [...sim.byId.values()].filter((o) => o.external_reference === r.externalReference),
        ).toHaveLength(1);
      });

      it('janela vencida sem order achada: nada e inventado, nenhum caso fechado, reprocura com recuo', async () => {
        const listingId = await publishedListing();
        vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', '');
        const r = await reserve('r0', listingId);
        vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', TOKEN);
        await moveWindowToPast(r.contactRequestId);
        await park([r.attemptId]);

        expect(await reconcile()).toMatchObject({ claimed: 1, orphansNotFound: 1 });

        const s = await state(r);
        expect(s.attempt).toMatchObject({
          status: 'tentativa_criada',
          providerOrderId: null,
          lastReconcileResult: 'orphan_not_found',
        });
        expect(s.cases).toHaveLength(0);
        expect(sim.orderSearches).toContain(r.externalReference);
        const delay = s.attempt.nextReconcileAt!.getTime() - s.attempt.lastReconciledAt!.getTime();
        expect(delay).toBeGreaterThan(59 * 60_000);
      });
    });

    // -----------------------------------------------------------------------
    it('inconsistente: so reobserva e registra; nunca aprova nem fecha o caso', async () => {
      const listingId = await publishedListing();
      const r = await reserve('r1', listingId);
      const order = sim.byId.get(r.orderId!)!;
      const reference = order.external_reference;
      order.external_reference = `${reference}-outra`;
      await park([r.attemptId]);

      expect(await reconcile()).toMatchObject({ claimed: 1, inconsistent: 1 });
      expect((await state(r)).attempt.status).toBe('inconsistente');

      // O provedor "se corrige" e mostra acreditacao tempestiva: continua
      // inconsistente, sem aprovacao; a resolucao e operacional (PD-10.4).
      order.external_reference = reference;
      const { reservedFrom } = await windowOf(r.contactRequestId);
      accredit(r.orderId!, new Date(reservedFrom.getTime() + 1_000));
      await makeDue([r.attemptId]);
      expect(await reconcile()).toMatchObject({ claimed: 1, observed: 1 });

      const s = await state(r);
      expect(s.attempt.status).toBe('inconsistente');
      expect(s.attempt.lastReconcileResult).toBe('observed_accredited');
      expect(s.request.status).toBe('reserved');
      expect(s.cases.map((c) => [c.kind, c.reason, c.closedAt])).toEqual([
        ['inconsistente', 'order_reference_mismatch', null],
      ]);
      expect(await audits('payment.approved', [r.attemptId])).toHaveLength(0);
      // Reobservacao e de hora em hora, nao a cada ciclo.
      const delay = s.attempt.nextReconcileAt!.getTime() - s.attempt.lastReconciledAt!.getTime();
      expect(delay).toBeGreaterThan(59 * 60_000);
    });

    // -----------------------------------------------------------------------
    it('T-18: duas reconciliacoes sobrepostas reclamam conjuntos disjuntos; um efeito por caso', async () => {
      const l1 = await publishedListing();
      const l2 = await publishedListing();
      const l3 = await publishedListing();
      const a1 = await reserve('r0', l1);
      const a2 = await reserve('r1', l1);
      const a3 = await reserve('r2', l1);
      const b1 = await reserve('r0', l2);
      const b2 = await reserve('r1', l2);
      const c1 = await reserve('r0', l3);
      for (const r of [a1, a2]) {
        const { reservedFrom } = await windowOf(r.contactRequestId);
        accredit(r.orderId!, new Date(reservedFrom.getTime() + 3_000));
      }
      const b1Window = await moveWindowToPast(b1.contactRequestId);
      accredit(b1.orderId!, new Date(b1Window.reservedUntil.getTime() + 60_000));
      vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', '');
      await as('owner', () => closeListing(l3));
      vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', TOKEN);
      const all = [a1, a2, a3, b1, b2, c1];
      const ids = all.map((r) => r.attemptId);
      await park(ids);

      const claims: { A: string[][]; B: string[][] } = { A: [], B: [] };
      let releaseA!: () => void;
      const holdA = new Promise<void>((resolve) => (releaseA = resolve));
      let waitsWhileHeld = -1;
      const runA = reconcile({
        batchSize: 3,
        hooks: {
          onClaimed: async (claimed) => {
            claims.A.push(claimed);
            // A primeira execucao segura a transacao de reclamacao ABERTA.
            if (claims.A.length === 1) await holdA;
          },
        },
      });
      let runB: ReturnType<typeof reconcile> | undefined;
      try {
        expect(await until(() => claims.A.length === 1, 15_000)).toBe(true);
        runB = reconcile({
          batchSize: 3,
          hooks: {
            onClaimed: async (claimed) => {
              claims.B.push(claimed);
            },
          },
        });
        // A segunda reclama ENQUANTO a primeira segura as linhas dela: pula, nao espera.
        expect(await until(() => claims.B.length >= 1, 10_000)).toBe(true);
        waitsWhileHeld = await lockWaits();
      } finally {
        releaseA();
      }
      const [summaryA, summaryB] = await Promise.all([runA, runB!]);

      expect(waitsWhileHeld).toBe(0);
      expect(claims.A[0]).toHaveLength(3);
      expect(claims.B[0]).toHaveLength(3);
      expect(claims.A[0].filter((id) => claims.B[0].includes(id))).toEqual([]);
      // Cada caso reclamado UMA unica vez no total, inclusive nos lotes seguintes.
      const every = [...claims.A.flat(), ...claims.B.flat()];
      expect([...every].sort()).toEqual([...ids].sort());
      expect(summaryA.claimed + summaryB.claimed).toBe(6);
      expect(summaryA.errors + summaryB.errors).toBe(0);

      // Um efeito por caso: duas aprovacoes, um reembolso, um cancelamento.
      for (const r of [a1, a2]) {
        expect((await state(r)).request.status).toBe('paid');
        expect(await audits('payment.approved', [r.attemptId])).toHaveLength(1);
      }
      expect(sim.refundCalls.filter((c) => c.orderId === b1.orderId)).toHaveLength(1);
      expect((await state(b1)).refunds.map((x) => x.status)).toEqual(['concluido']);
      expect(sim.cancelCalls.filter((c) => c.orderId === c1.orderId)).toHaveLength(1);
      expect((await state(c1)).attempt.status).toBe('falha');
      for (const r of [a3, b2]) {
        expect((await state(r)).attempt.status).toBe('aguardando_pagamento');
        expect(sim.gets.get(r.orderId!)).toBe(1);
      }
    });

    it('T-18 depois do commit: uma execucao que comeca enquanto a outra processa nao pega os mesmos casos', async () => {
      const listingId = await publishedListing();
      const pending = await reserve('r2', listingId);
      const refund = await failingRefund('r1');
      await makeDue([pending.attemptId], [refund.refundId]);
      await park([pending.attemptId], [refund.refundId]);

      // A primeira execucao reclamou e commitou; o processamento (rede) ainda
      // nao terminou. A segunda reclama agora e nao pode receber os mesmos casos.
      const firstAttempts = await claimAttemptsForReconciliation(10);
      const firstRefunds = await claimRefundsForRetry(10);
      expect(firstAttempts).toEqual([pending.attemptId]);
      expect(firstRefunds).toEqual([refund.refundId]);
      expect(await claimAttemptsForReconciliation(10)).toEqual([]);
      expect(await claimRefundsForRetry(10)).toEqual([]);

      // O instante reclamado e o recuo do caso: 4 min na tentativa ativa; para
      // o reembolso com 1 falha, 2^1 h (o mesmo que a falha desta tentativa gravaria).
      const s = await state(pending);
      const [r] = (await state(refund)).refunds;
      const now = Date.now();
      expect(s.attempt.nextReconcileAt!.getTime() - now).toBeGreaterThan(3 * 60_000);
      expect(r.nextAttemptAt!.getTime() - now).toBeGreaterThan(
        refundBackoffHours(2) * 3_600_000 - 60_000,
      );
    });

    // -----------------------------------------------------------------------
    describe('retentativa de reembolso', () => {
      it('recuo exponencial persistido; esgotadas as tentativas, pendente_operacional com caso ABERTO', async () => {
        const r = await failingRefund('r0');
        let refund = (await state(r)).refunds[0];
        expect(refund.nextAttemptAt!.getTime() - refund.lastAttemptAt!.getTime()).toBe(
          refundBackoffHours(1) * 3_600_000,
        );
        sim.refundMode = 'unavailable';

        for (let k = 2; k <= REFUND_MAX_ATTEMPTS; k++) {
          await makeDue([], [r.refundId]);
          await park([], [r.refundId]);
          const summary = await retryRefunds();
          expect(summary.claimed).toBe(1);
          refund = (await state(r)).refunds[0];
          expect(refund.attemptCount).toBe(k);
          if (k < REFUND_MAX_ATTEMPTS) {
            expect(summary.retrying).toBe(1);
            expect(refund.status).toBe('falhou_retentando');
            expect(refund.nextAttemptAt!.getTime() - refund.lastAttemptAt!.getTime()).toBe(
              refundBackoffHours(k) * 3_600_000,
            );
          } else {
            expect(summary.operational).toBe(1);
          }
        }
        expect([1, 2, 3, 4, 5, 6, 7].map(refundBackoffHours)).toEqual([1, 2, 4, 8, 16, 24, 24]);

        const s = await state(r);
        expect(s.refunds[0]).toMatchObject({
          status: 'pendente_operacional',
          attemptCount: REFUND_MAX_ATTEMPTS,
          nextAttemptAt: null,
          concludedAt: null,
        });
        // Esgotar NUNCA fecha caso nem conclui (PD-3.5, PE-7.10).
        expect(s.attempt.status).toBe('reembolso_pendente');
        expect(s.cases.find((c) => c.kind === 'reembolso_pendente')).toMatchObject({
          closedAt: null,
          outcome: null,
        });
        const events = await audits('payment.refund_attempted', [r.refundId]);
        expect(events).toHaveLength(REFUND_MAX_ATTEMPTS);
        expect(events.filter((e) => (e.details as { exhausted?: boolean }).exhausted)).toHaveLength(
          1,
        );

        // Nao volta a ser reclamado nem chamado.
        const posts = sim.refundPosts.length;
        await makeDue([], [r.refundId]);
        expect(await retryRefunds()).toMatchObject({ claimed: 0 });
        expect(sim.refundPosts.length).toBe(posts);
      });

      it('indisponivel ou 429 documentado -> falhou_retentando; depois conclui com a MESMA chave', async () => {
        const r = await failingRefund('r1');
        sim.refundMode = 'rate_limited';
        await makeDue([], [r.refundId]);
        await park([], [r.refundId]);
        expect(await retryRefunds()).toMatchObject({ claimed: 1, retrying: 1 });
        expect((await state(r)).refunds[0]).toMatchObject({
          status: 'falhou_retentando',
          attemptCount: 2,
          lastAttemptResult: 'refund_rate_limited',
        });

        // Ainda nao venceu o recuo: a execucao seguinte nao o pega.
        sim.refundMode = 'ok';
        expect(await retryRefunds()).toMatchObject({ claimed: 0 });
        await makeDue([], [r.refundId]);
        expect(await retryRefunds()).toMatchObject({ claimed: 1, concluded: 1 });

        const s = await state(r);
        expect(s.refunds[0]).toMatchObject({ status: 'concluido', attemptCount: 3 });
        expect(s.attempt.status).toBe('reembolsada_ou_revertida');
        expect(s.cases.find((c) => c.kind === 'reembolso_pendente')?.outcome).toBe('refunded');
        expect(sim.refundCalls.filter((c) => c.orderId === r.orderId).map((c) => c.key)).toEqual([
          s.refunds[0].idempotencyKey,
        ]);
      });

      it('DEC-045 saldo: cannot_refund_order -> falhou_retentando com recuo, sem inconsistencia; conclui com a MESMA chave', async () => {
        const r = await failingRefund('r1');
        sim.refundMode = 'cannot_refund';
        await makeDue([], [r.refundId]);
        await park([], [r.refundId]);
        expect(await retryRefunds()).toMatchObject({ claimed: 1, retrying: 1 });

        let s = await state(r);
        expect(s.refunds[0]).toMatchObject({
          status: 'falhou_retentando',
          attemptCount: 2,
          lastAttemptResult: 'refund_cannot_refund',
        });
        expect(s.refunds[0].nextAttemptAt!.getTime() - s.refunds[0].lastAttemptAt!.getTime()).toBe(
          refundBackoffHours(2) * 3_600_000,
        );
        expect(s.cases.map((c) => [c.kind, c.closedAt])).toEqual([['reembolso_pendente', null]]);

        // Saldo reposto: a retentativa seguinte conclui, com a chave persistida.
        sim.refundMode = 'ok';
        await makeDue([], [r.refundId]);
        expect(await retryRefunds()).toMatchObject({ claimed: 1, concluded: 1 });
        s = await state(r);
        expect(s.refunds[0]).toMatchObject({ status: 'concluido', attemptCount: 3 });
        expect(s.cases.find((c) => c.kind === 'reembolso_pendente')?.outcome).toBe('refunded');
        expect(sim.refundCalls.filter((c) => c.orderId === r.orderId).map((c) => c.key)).toEqual([
          s.refunds[0].idempotencyKey,
        ]);
      });

      it('DEC-045: cannot_refund_order com a order NAO acreditada e definitivo -> inconsistente, sem retentar', async () => {
        const r = await failingRefund('r0');
        const order = sim.byId.get(r.orderId!)!;
        Object.assign(order, { status: 'canceled', status_detail: 'canceled' });
        sim.refundMode = 'cannot_refund';
        await makeDue([], [r.refundId]);
        await park([], [r.refundId]);
        expect(await retryRefunds()).toMatchObject({ claimed: 1, inconsistent: 1 });

        const s = await state(r);
        expect(s.refunds[0]).toMatchObject({
          status: 'pendente_operacional',
          lastAttemptResult: 'refund_rejected_cannot_refund_order',
          nextAttemptAt: null,
        });
        expect(s.cases.map((c) => [c.kind, c.closedAt])).toEqual([
          ['reembolso_pendente', null],
          ['inconsistente', null],
        ]);
      });

      it('DEC-045 prazo: aprovacao com 180 dias ou mais -> pendente_operacional imediato, SEM chamada; 179 dias ainda chama', async () => {
        const expired = await failingRefund('r0');
        const inside = await failingRefund('r2');
        const age = async (r: Reserved, days: number) => {
          await prisma().$executeRaw`
            UPDATE "payments" SET "accredited_at" = now() - make_interval(days => ${days}::int)
            WHERE "payment_attempt_id" = ${r.attemptId}::uuid`;
        };
        await age(expired, 180);
        await age(inside, 179);
        await makeDue([], [expired.refundId, inside.refundId]);
        await park([], [expired.refundId, inside.refundId]);
        const posts = sim.refundPosts.length;

        expect(await retryRefunds()).toMatchObject({ claimed: 2, operational: 1, concluded: 1 });
        // So o reembolso dentro do prazo chegou ao provedor.
        expect(sim.refundPosts.slice(posts)).toEqual([inside.orderId]);

        const s = await state(expired);
        expect(s.refunds[0]).toMatchObject({
          status: 'pendente_operacional',
          attemptCount: 2,
          lastAttemptResult: 'refund_window_expired',
          nextAttemptAt: null,
          concludedAt: null,
        });
        // Limite do provedor, nao inconsistencia; o caso continua ABERTO (PD-3.5).
        expect(s.cases.map((c) => [c.kind, c.closedAt])).toEqual([['reembolso_pendente', null]]);
        expect(s.attempt.status).toBe('reembolso_pendente');
        expect((await state(inside)).refunds[0].status).toBe('concluido');
      });

      it('codigo NAO documentado fica no mapeamento conservador', async () => {
        const r = await failingRefund('r2');
        sim.refundMode = 'rejected';
        await makeDue([], [r.refundId]);
        await park([], [r.refundId]);
        expect(await retryRefunds()).toMatchObject({ claimed: 1, inconsistent: 1 });

        const s = await state(r);
        expect(s.refunds[0]).toMatchObject({
          status: 'pendente_operacional',
          lastAttemptResult: 'refund_rejected_insufficient_balance',
        });
        expect(s.cases.map((c) => [c.kind, c.closedAt])).toEqual([
          ['reembolso_pendente', null],
          ['inconsistente', null],
        ]);
      });

      it('T-18: duas retentativas sobrepostas sao disjuntas; um reembolso por caso', async () => {
        const fixtures = [];
        for (const tag of ['r0', 'r1', 'r2', 'r0']) fixtures.push(await failingRefund(tag));
        const ids = fixtures.map((f) => f.refundId);
        await makeDue([], ids);
        await park([], ids);

        const claims: { A: string[][]; B: string[][] } = { A: [], B: [] };
        let releaseA!: () => void;
        const holdA = new Promise<void>((resolve) => (releaseA = resolve));
        let waitsWhileHeld = -1;
        const runA = retryRefunds({
          batchSize: 2,
          hooks: {
            onClaimed: async (claimed) => {
              claims.A.push(claimed);
              if (claims.A.length === 1) await holdA;
            },
          },
        });
        let runB: ReturnType<typeof retryRefunds> | undefined;
        try {
          expect(await until(() => claims.A.length === 1, 15_000)).toBe(true);
          runB = retryRefunds({
            batchSize: 2,
            hooks: {
              onClaimed: async (claimed) => {
                claims.B.push(claimed);
              },
            },
          });
          expect(await until(() => claims.B.length >= 1, 10_000)).toBe(true);
          waitsWhileHeld = await lockWaits();
        } finally {
          releaseA();
        }
        const [summaryA, summaryB] = await Promise.all([runA, runB!]);

        expect(waitsWhileHeld).toBe(0);
        expect(claims.A[0]).toHaveLength(2);
        expect(claims.B[0]).toHaveLength(2);
        const every = [...claims.A.flat(), ...claims.B.flat()];
        expect([...every].sort()).toEqual([...ids].sort());
        expect(summaryA.concluded + summaryB.concluded).toBe(4);
        for (const f of fixtures) {
          expect(sim.refundCalls.filter((c) => c.orderId === f.orderId)).toHaveLength(1);
          expect((await state(f)).refunds[0].status).toBe('concluido');
        }
      });
    });

    // -----------------------------------------------------------------------
    // Prova pela ROTA HTTP REAL (servidor `pnpm start` sobre o mesmo banco, com
    // o mesmo CRON_SECRET e SEM credencial do Mercado Pago: falha fechada).
    const BASE_URL = process.env.PRIVATE_SURFACE_BASE_URL?.replace(/\/$/, '') ?? '';
    const CRON = process.env.CRON_SECRET ?? '';
    describe.skipIf(BASE_URL === '' || CRON === '')('rotas HTTP reais (CI-11)', () => {
      const get = (path: string, authorization?: string) =>
        fetch(`${BASE_URL}${path}`, {
          headers: authorization ? { authorization } : {},
          redirect: 'manual',
        });

      it.each(['/api/jobs/payments-reconcile', '/api/jobs/payments-refund-retry'])(
        '%s: recusa sem segredo, com segredo errado e com esquema errado; sem efeito',
        async (path) => {
          const listingId = await publishedListing();
          const r = await reserve('r1', listingId);
          await park([r.attemptId]);
          for (const authorization of [
            undefined,
            'Bearer segredo-errado-errado-errado-1234',
            `Basic ${CRON}`,
            `bearer ${CRON}`,
            CRON,
          ]) {
            const res = await get(path, authorization);
            expect(res.status).toBe(401);
            expect(await res.text()).toBe('');
            expect(res.headers.get('cache-control')).toBe('no-store');
          }
          expect((await state(r)).attempt).toMatchObject({
            nextReconcileAt: null,
            lastReconciledAt: null,
          });
        },
      );

      it('reconciliacao autorizada: reclama, falha fechada sem credencial, responde so contagens', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r2', listingId);
        await park([r.attemptId]);

        const res = await get('/api/jobs/payments-reconcile', `Bearer ${CRON}`);

        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        const text = await res.text();
        const body = JSON.parse(text) as Record<string, unknown>;
        expect(Object.values(body).every((v) => typeof v === 'number')).toBe(true);
        expect(body).toMatchObject({ claimed: 1, unavailable: 1, errors: 0 });
        for (const leak of [r.orderId!, r.attemptId, r.externalReference, CRON]) {
          expect(text).not.toContain(leak);
        }
        const s = await state(r);
        expect(s.attempt).toMatchObject({
          status: 'aguardando_pagamento',
          lastReconcileResult: 'unavailable',
        });
        expect(s.attempt.nextReconcileAt!.getTime()).toBeGreaterThan(Date.now());
      });

      it('retentativa autorizada: falha fechada vira falhou_retentando, sem vazar a chave', async () => {
        const r = await failingRefund('r0');
        await makeDue([], [r.refundId]);
        await park([], [r.refundId]);

        const res = await get('/api/jobs/payments-refund-retry', `Bearer ${CRON}`);

        expect(res.status).toBe(200);
        const text = await res.text();
        const body = JSON.parse(text) as Record<string, unknown>;
        expect(Object.values(body).every((v) => typeof v === 'number')).toBe(true);
        expect(body).toMatchObject({ claimed: 1, retrying: 1, errors: 0 });
        const [refund] = (await state(r)).refunds;
        expect(refund).toMatchObject({
          status: 'falhou_retentando',
          attemptCount: 2,
          lastAttemptResult: 'configuration',
        });
        for (const leak of [refund.idempotencyKey, r.orderId!, CRON]) {
          expect(text).not.toContain(leak);
        }
      });
    });
  },
);
