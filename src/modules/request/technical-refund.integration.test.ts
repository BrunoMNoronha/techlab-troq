// @vitest-environment node
//
// Prova de integracao de F3-007 (#97): reembolso tecnico, duplicidade e
// cancelamento, contra o Better Auth REAL e PostgreSQL REAL e descartavel, com
// o Mercado Pago SIMULADO (`node:http`): Orders API (criacao, consulta,
// reembolso total ou por transacao, cancelamento) e a busca da Payments API.
//
// PD-13.2: T-8 roda confirmacoes concorrentes de verdade (espera vista em
// `pg_stat_activity`) e repete a eleicao; T-16 retenta o reembolso de verdade,
// com a primeira resposta perdida depois de o provedor ter devolvido.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1. Dados sinteticos.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { closeListing } from '@/app/anuncios/actions';
import { registerOwnContact } from '@/modules/contact';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { createDraftListing } from '@/modules/listing/actions';
import { createMercadoPagoClient, processTechnicalRefund } from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';
import { requestContactUnlockFlow } from './charge-flow';
import { cancelChargesOfClosedListing } from './closure';
import { confirmPaymentFlow } from './payment-confirmation';

const cookieStore = new AsyncLocalStorage<string>();

vi.mock('next/headers', () => ({
  headers: async () => {
    const cookie = cookieStore.getStore() ?? '';
    return new Headers(cookie ? { cookie } : {});
  },
}));

// F3-013 (#103): o transporte dos avisos transacionais e SIMULADO (TE-6).
const sentEmails = vi.hoisted(() => ({
  send: vi
    .fn<(email: { to: string; idempotencyKey: string }) => Promise<{ ok: true }>>()
    .mockResolvedValue({ ok: true }),
}));
vi.mock('@/modules/identity/email-transport', () => ({
  sendTransactionalEmail: sentEmails.send,
}));
/** Avisos TE-6 enviados desde o ultimo `mockClear`. */
const refundNotices = () =>
  sentEmails.send.mock.calls
    .map(([e]) => e)
    .filter((e) => e.idempotencyKey.startsWith('troq-notice/refund_concluded/'));

vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const TOKEN = 'TEST-sintetico-reembolso-000000';
/** Prefixo numerico dos ids sinteticos da Payments API, unico por execucao. */
const PID = RUN_ID.replace(/\D/g, '').slice(-9);
const email = (tag: string) => `it-reembolso-${tag}-${RUN_ID}@example.test`;
const prisma = () => getPrismaClient();

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

interface RefundCall {
  orderId: string;
  key: string;
  body: Raw | null;
  applied: boolean;
}

const sim = {
  byKey: new Map<string, SimOrder>(),
  byId: new Map<string, SimOrder>(),
  search: new Map<string, Raw[]>(),
  refundMode: 'ok' as 'ok' | 'unavailable' | 'apply_then_unavailable' | 'not_found' | 'rejected',
  refundCalls: [] as RefundCall[],
  cancelCalls: [] as { orderId: string; key: string }[],
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
          payment_method: { id: 'pix', type: 'bank_transfer', qr_code: `000201SIM${n}` },
        },
      ],
    },
  };
}

function refund(order: SimOrder, body: Raw | null): boolean {
  const all = order.transactions.payments;
  const targets = body
    ? all.filter((p) =>
        (body.transactions as Raw[]).some((t) => t.id === p.id && t.amount === p.amount),
      )
    : all;
  const open = targets.filter((p) => p.status !== 'refunded');
  if (open.length === 0) return false;
  for (const p of open) Object.assign(p, { status: 'refunded', status_detail: 'refunded' });
  order.transactions.refunds = [
    ...(order.transactions.refunds ?? []),
    { id: `REFSIM${sim.refundCalls.length + 1}`, amount: open[0].amount },
  ];
  if (all.every((p) => p.status === 'refunded')) {
    Object.assign(order, { status: 'refunded', status_detail: 'refunded' });
  }
  return true;
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
    sim.creates.push(order.external_reference);
    return reply(res, 201, order);
  }
  const action = /^\/v1\/orders\/([^/]+)(?:\/(refund|cancel))?$/.exec(url.pathname);
  const order = action ? sim.byId.get(decodeURIComponent(action[1])) : undefined;
  if (req.method === 'GET' && action && !action[2]) {
    return order
      ? reply(res, 200, order)
      : reply(res, 404, { errors: [{ code: 'order_not_found' }] });
  }
  if (req.method === 'POST' && action?.[2] === 'refund') {
    const body = raw ? (JSON.parse(raw) as Raw) : null;
    const mode = sim.refundMode;
    if (mode === 'unavailable') return reply(res, 503, { errors: [{ code: 'internal_error' }] });
    if (mode === 'not_found' || !order)
      return reply(res, 404, { errors: [{ code: 'order_not_found' }] });
    if (mode === 'rejected') return reply(res, 400, { errors: [{ code: 'codigo_desconhecido' }] });
    const applied = refund(order, body);
    sim.refundCalls.push({ orderId: order.id, key, body, applied });
    if (mode === 'apply_then_unavailable') {
      sim.refundMode = 'ok';
      return reply(res, 503, { errors: [{ code: 'internal_error' }] });
    }
    return applied
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

function approved(order: SimOrder, id: string, approvedAt: Date): Raw {
  return {
    id,
    status: 'approved',
    status_detail: 'accredited',
    external_reference: order.external_reference,
    transaction_amount: 0.99,
    date_approved: approvedAt.toISOString(),
  };
}

/** Order acreditada; `searchPayments` define o que a busca da Payments API devolve. */
function accredit(orderId: string, searchPayments?: (order: SimOrder) => Raw[], approvedAt?: Date) {
  const order = sim.byId.get(orderId)!;
  Object.assign(order, {
    status: 'processed',
    status_detail: 'accredited',
    total_paid_amount: '0.99',
  });
  for (const p of order.transactions.payments) {
    Object.assign(p, { status: 'processed', status_detail: 'accredited', paid_amount: p.amount });
  }
  sim.search.set(
    order.external_reference,
    searchPayments
      ? searchPayments(order)
      : [approved(order, `18${sim.counter}${Date.now() % 100000}`, approvedAt ?? new Date())],
  );
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
}

async function reserve(tag: string, listingId: string): Promise<Reserved> {
  const res = await as(tag, () => requestContactUnlockFlow(listingId, { gateway }));
  if (!res.success || !res.pix) throw new Error(`reserva falhou: ${JSON.stringify(res)}`);
  const attempt = await prisma().paymentAttempt.findUniqueOrThrow({
    where: { contactRequestId: res.contactRequestId },
  });
  return {
    contactRequestId: res.contactRequestId,
    attemptId: attempt.id,
    orderId: attempt.providerOrderId!,
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

async function refundsOf(attemptId: string) {
  return prisma().technicalRefund.findMany({
    where: { payment: { paymentAttemptId: attemptId } },
    include: { payment: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function state(r: Reserved) {
  const [attempt, request, payments, cases, refunds] = await Promise.all([
    prisma().paymentAttempt.findUniqueOrThrow({ where: { id: r.attemptId } }),
    prisma().contactRequest.findUniqueOrThrow({ where: { id: r.contactRequestId } }),
    prisma().payment.findMany({ where: { paymentAttemptId: r.attemptId } }),
    prisma().reconciliationCase.findMany({
      where: { paymentAttemptId: r.attemptId },
      orderBy: { openedAt: 'asc' },
    }),
    refundsOf(r.attemptId),
  ]);
  return { attempt, request, payments, cases, refunds };
}

const confirm = (r: Reserved) =>
  confirmPaymentFlow(r.attemptId, { origin: 'reconciliacao', deps: { gateway } });

const refundCallsOf = (orderId: string) => sim.refundCalls.filter((c) => c.orderId === orderId);

function audits(eventType: string, targetIds: string[]) {
  return prisma().auditEvent.findMany({ where: { eventType, targetId: { in: targetIds } } });
}

/** Tres vagas consumidas pelo fluxo real, e a reserva A expirada pela alocacao de B. */
async function lastSlotScenario() {
  const listingId = await publishedListing();
  for (const tag of ['r0', 'r1']) {
    const paid = await reserve(tag, listingId);
    const { reservedFrom } = await windowOf(paid.contactRequestId);
    accredit(paid.orderId, undefined, new Date(reservedFrom.getTime() + 1_000));
    expect(await confirm(paid)).toBe('confirmed');
  }
  const a = await reserve('r2', listingId);
  const aWindow = await moveWindowToPast(a.contactRequestId);
  const b = await reserve('r3', listingId);
  return { listingId, a, aWindow, b };
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'reembolso tecnico, duplicidade e cancelamento (#97)',
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

      for (const tag of ['owner', 'r0', 'r1', 'r2', 'r3']) {
        await createUser(tag);
        cookies[tag] = await signIn(tag);
      }
      expect(await as('owner', () => registerOwnContact({ phone: '(11) 91234-5678' }))).toEqual({
        success: true,
        hasContact: true,
      });
    });

    beforeEach(() => {
      sentEmails.send.mockClear();
      sim.refundMode = 'ok';
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
    it('T-7: fora da janela -> RT-2 persistida, reembolso total, sem vaga, desfecho real', async () => {
      const listingId = await publishedListing();
      const r = await reserve('r0', listingId);
      const window = await moveWindowToPast(r.contactRequestId);
      accredit(r.orderId, undefined, new Date(window.reservedUntil.getTime() + 60_000));

      expect(await confirm(r)).toBe('exception_rt_2');

      const s = await state(r);
      expect(s.request.status).toBe('expired');
      expect(s.attempt.status).toBe('reembolsada_ou_revertida');
      expect(s.refunds).toHaveLength(1);
      expect(s.refunds[0]).toMatchObject({
        hypothesis: 'rt_2',
        status: 'concluido',
        attemptCount: 1,
        lastAttemptResult: 'refunded',
      });
      expect(s.refunds[0].providerRefundId).toMatch(/^REFSIM/);
      expect(s.refunds[0].concludedAt).not.toBeNull();
      expect(s.cases.map((c) => [c.kind, c.reason, c.outcome, c.closedAt !== null])).toEqual([
        ['reembolso_pendente', 'rt_2', 'refunded', true],
      ]);
      // Reembolso TOTAL (sem corpo), com a chave persistida do reembolso.
      expect(refundCallsOf(r.orderId).map((c) => [c.body, c.key])).toEqual([
        [null, s.refunds[0].idempotencyKey],
      ]);
      expect(await audits('request.paid', [r.contactRequestId])).toHaveLength(0);
      expect(await audits('payment.refund_classified', [s.refunds[0].id])).toHaveLength(1);
      // TE-6 (F3-013, DEC-048): um aviso a quem pagou, depois da conclusao.
      expect(refundNotices().map((m) => [m.to, m.idempotencyKey])).toEqual([
        [email('r0'), `troq-notice/refund_concluded/${s.refunds[0].id}`],
      ]);
    });

    it('T-9: tres vagas consumidas e chega pagamento acreditado -> RB-003 prevalece, RT-3', async () => {
      const { listingId, a, aWindow, b } = await lastSlotScenario();
      const { reservedFrom: bFrom } = await windowOf(b.contactRequestId);
      accredit(b.orderId, undefined, new Date(bFrom.getTime() + 1_000));
      expect(await confirm(b)).toBe('confirmed');
      // A acreditou dentro da propria janela, mas a reserva ja nao vale.
      accredit(a.orderId, undefined, new Date(aWindow.reservedFrom.getTime() + 60_000));

      expect(await confirm(a)).toBe('exception_rt_3');

      const s = await state(a);
      expect(s.request.status).toBe('expired');
      expect(s.attempt.status).toBe('reembolsada_ou_revertida');
      expect(s.refunds.map((x) => [x.hypothesis, x.status])).toEqual([['rt_3', 'concluido']]);
      expect(refundCallsOf(a.orderId)).toHaveLength(1);
      expect(await prisma().contactRequest.count({ where: { listingId, status: 'paid' } })).toBe(3);
    });

    it('T-16: reembolso retentado sobre pagamento ja reembolsado -> sucesso, uma unica devolucao', async () => {
      const listingId = await publishedListing();
      const r = await reserve('r1', listingId);
      const window = await moveWindowToPast(r.contactRequestId);
      accredit(r.orderId, undefined, new Date(window.reservedUntil.getTime() + 60_000));
      // O provedor devolve, mas a resposta se perde.
      sim.refundMode = 'apply_then_unavailable';

      expect(await confirm(r)).toBe('exception_rt_2');
      const first = await state(r);
      expect(first.refunds[0]).toMatchObject({ status: 'falhou_retentando', attemptCount: 1 });
      expect(first.attempt.status).toBe('reembolso_pendente');
      expect(first.cases.every((c) => c.closedAt === null)).toBe(true);
      // Falha ainda nao e devolucao: nenhum aviso TE-6.
      expect(refundNotices()).toEqual([]);

      expect(await processTechnicalRefund(first.refunds[0].id, { gateway })).toBe('concluded');
      // Retentar de novo, ja concluido: nada muda e nada e chamado.
      expect(await processTechnicalRefund(first.refunds[0].id, { gateway })).toBe(
        'already_concluded',
      );

      const after = await state(r);
      expect(after.refunds[0]).toMatchObject({
        status: 'concluido',
        attemptCount: 2,
        lastAttemptResult: 'order_already_refunded',
      });
      expect(after.attempt.status).toBe('reembolsada_ou_revertida');
      const calls = refundCallsOf(r.orderId);
      expect(calls.map((c) => c.applied)).toEqual([true, false]);
      // A MESMA chave persistida nas duas chamadas (PD-5.2).
      expect(new Set(calls.map((c) => c.key))).toEqual(new Set([after.refunds[0].idempotencyKey]));
      // TE-6 uma unica vez: a conclusao avisa; a reexecucao ja concluida, nao.
      expect(refundNotices().map((m) => m.to)).toEqual([email('r1')]);
    });

    // -----------------------------------------------------------------------
    describe('T-8: duplicidade', () => {
      it('confirmacoes concorrentes elegem um unico canonico; excedente RT-1 sem tocar o canonico', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r2', listingId);
        const { reservedFrom } = await windowOf(r.contactRequestId);
        const early = new Date(reservedFrom.getTime() + 1_000);
        const late = new Date(reservedFrom.getTime() + 5_000);
        accredit(r.orderId, (order) => [
          approved(order, `${PID}700002`, late),
          approved(order, `${PID}700001`, early),
        ]);

        let pending!: Promise<string[]>;
        let waiting = 0;
        await prisma().$transaction(
          async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${listingId}::uuid FOR UPDATE`;
            pending = Promise.all([confirm(r), confirm(r)]);
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
        expect((await pending).sort()).toEqual(['already_confirmed', 'confirmed']);

        // Reexecucoes com a busca em outra ordem: a eleicao nao muda.
        const order = sim.byId.get(r.orderId)!;
        sim.search.set(
          order.external_reference,
          [...sim.search.get(order.external_reference)!].reverse(),
        );
        expect(await confirm(r)).toBe('already_confirmed');

        const s = await state(r);
        expect(s.request.status).toBe('paid');
        expect(s.attempt.status).toBe('pagamento_confirmado');
        expect(s.attempt.accreditedAt!.getTime()).toBe(early.getTime());
        const canonical = s.payments.filter((p) => p.isCanonical);
        expect(canonical.map((p) => p.providerPaymentId)).toEqual([`${PID}700001`]);
        // O excedente nao e transacao conhecida da order: pendencia operacional, sem chamada.
        expect(s.refunds.map((x) => [x.payment.providerPaymentId, x.hypothesis, x.status])).toEqual(
          [[`${PID}700002`, 'rt_1', 'pendente_operacional']],
        );
        expect(s.refunds[0].lastAttemptResult).toBe('transaction_not_identifiable');
        expect(refundCallsOf(r.orderId)).toHaveLength(0);
        expect(s.cases.map((c) => [c.kind, c.reason, c.closedAt])).toEqual([
          ['reembolso_pendente', 'rt_1', null],
        ]);
        expect(await audits('payment.duplicate_resolved', [r.attemptId])).toHaveLength(1);
        expect(await audits('payment.approved', [r.attemptId])).toHaveLength(1);
        expect(await audits('request.paid', [r.contactRequestId])).toHaveLength(1);
      });

      it('empate exato no instante: vence o menor id em ordem LEXICOGRAFICA (PD-7.1)', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r3', listingId);
        const { reservedFrom } = await windowOf(r.contactRequestId);
        const same = new Date(reservedFrom.getTime() + 2_000);
        // Numericamente 20 < 100; lexicograficamente "...100" < "...20".
        accredit(r.orderId, (order) => [
          approved(order, `${PID}20`, same),
          approved(order, `${PID}100`, same),
        ]);

        expect(await confirm(r)).toBe('confirmed');

        const s = await state(r);
        expect(s.payments.filter((p) => p.isCanonical).map((p) => p.providerPaymentId)).toEqual([
          `${PID}100`,
        ]);
        expect(s.refunds.map((x) => x.payment.providerPaymentId)).toEqual([`${PID}20`]);
      });

      it('excedente que E transacao da order: devolvido so ele, pelo valor cheio', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r0', listingId);
        const order = sim.byId.get(r.orderId)!;
        const [first] = order.transactions.payments;
        order.transactions.payments.push({ ...first, id: `${String(first.id)}B` });
        accredit(r.orderId);
        // Estado confirmado com o canonico na primeira transacao (fixture direta:
        // a busca nao vincula ids da Payments API as transacoes da order).
        const at = new Date();
        await prisma().contactRequest.update({
          where: { id: r.contactRequestId },
          data: { status: 'paid', paidAt: at },
        });
        await prisma().paymentAttempt.update({
          where: { id: r.attemptId },
          data: { status: 'pagamento_confirmado', accreditedAt: at, recognizedAt: at },
        });
        const [canonical, excess] = await Promise.all(
          [String(first.id), `${String(first.id)}B`].map((id, i) =>
            prisma().payment.create({
              data: {
                paymentAttemptId: r.attemptId,
                providerPaymentId: id,
                amountCents: 99,
                providerStatus: 'processed',
                providerStatusDetail: 'accredited',
                accreditedAt: at,
                isCanonical: i === 0,
              },
            }),
          ),
        );
        const refundRow = await prisma().technicalRefund.create({
          data: { paymentId: excess.id, hypothesis: 'rt_1', idempotencyKey: randomUUID() },
        });
        const canonicalRefund = await prisma().technicalRefund.create({
          data: { paymentId: canonical.id, hypothesis: 'rt_1', idempotencyKey: randomUUID() },
        });

        expect(await processTechnicalRefund(refundRow.id, { gateway })).toBe('concluded');
        // Nunca devolve o canonico de uma solicitacao paga.
        expect(await processTechnicalRefund(canonicalRefund.id, { gateway })).toBe('inconsistent');

        expect(refundCallsOf(r.orderId).map((c) => c.body)).toEqual([
          { transactions: [{ id: `${String(first.id)}B`, amount: '0.99' }] },
        ]);
        expect(order.transactions.payments.map((p) => p.status)).toEqual(['processed', 'refunded']);
        const s = await state(r);
        expect(s.attempt.status).toBe('pagamento_confirmado');
        expect(s.request.status).toBe('paid');
        expect(s.cases.map((c) => [c.kind, c.reason])).toContainEqual([
          'inconsistente',
          'refund_of_canonical',
        ]);
      });
    });

    // -----------------------------------------------------------------------
    describe('PD-8.5: desfechos do provedor', () => {
      it.each([
        ['indisponivel', 'unavailable', 'falhou_retentando', null],
        ['order_not_found', 'not_found', 'pendente_operacional', 'refund_rejected_order_not_found'],
        [
          'codigo nao mapeado',
          'rejected',
          'pendente_operacional',
          'refund_rejected_codigo_desconhecido',
        ],
      ] as const)('%s -> %s', async (_c, mode, status, inconsistency) => {
        const listingId = await publishedListing();
        const r = await reserve('r1', listingId);
        const window = await moveWindowToPast(r.contactRequestId);
        accredit(r.orderId, undefined, new Date(window.reservedUntil.getTime() + 60_000));
        sim.refundMode = mode;

        expect(await confirm(r)).toBe('exception_rt_2');

        const s = await state(r);
        expect(s.refunds[0].status).toBe(status);
        expect(s.attempt.status).toBe('reembolso_pendente');
        // O caso de reembolso continua ABERTO e visivel (PD-2.4, PD-8.6).
        expect(s.cases.find((c) => c.kind === 'reembolso_pendente')?.closedAt).toBeNull();
        if (inconsistency) {
          expect(s.cases.map((c) => c.reason)).toContain(inconsistency);
        }
      });
    });

    // -----------------------------------------------------------------------
    describe('cancelamento de cobranca de reserva encerrada (PD-8.10)', () => {
      it('T5 pelo dono: a order sem acreditacao e cancelada; nao e reembolso', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r2', listingId);
        // A action real nao tem provedor configurado aqui: o encerramento nao
        // depende do cancelamento, que a reconciliacao pode refazer.
        vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', '');
        expect(await as('owner', () => closeListing(listingId))).toMatchObject({ success: true });
        vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', TOKEN);
        expect((await state(r)).attempt.status).toBe('aguardando_pagamento');

        expect(await cancelChargesOfClosedListing(listingId, { gateway })).toEqual(['canceled']);
        // Repetir e seguro: a tentativa ja terminou.
        expect(await cancelChargesOfClosedListing(listingId, { gateway })).toEqual([
          'not_applicable',
        ]);

        const s = await state(r);
        expect(s.request.status).toBe('failed');
        expect(s.attempt.status).toBe('falha');
        expect(s.attempt.cancelIdempotencyKey).not.toBeNull();
        expect(s.refunds).toHaveLength(0);
        expect(sim.byId.get(r.orderId)!.status).toBe('canceled');
        expect(sim.cancelCalls.filter((c) => c.orderId === r.orderId).map((c) => c.key)).toEqual([
          s.attempt.cancelIdempotencyKey,
        ]);
        expect(await audits('payment.charge_canceled', [r.attemptId])).toHaveLength(1);
      });

      it('acreditou antes do cancelamento: nao cancela, aplica RT-3 e devolve', async () => {
        const listingId = await publishedListing();
        const r = await reserve('r3', listingId);
        vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', '');
        await as('owner', () => closeListing(listingId));
        vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', TOKEN);
        const { reservedFrom } = await windowOf(r.contactRequestId);
        accredit(r.orderId, undefined, new Date(reservedFrom.getTime() + 1_000));

        expect(await cancelChargesOfClosedListing(listingId, { gateway })).toEqual(['accredited']);

        const s = await state(r);
        expect(s.request.status).toBe('failed');
        expect(s.attempt.status).toBe('reembolsada_ou_revertida');
        expect(s.refunds.map((x) => [x.hypothesis, x.status])).toEqual([['rt_3', 'concluido']]);
        expect(sim.cancelCalls.filter((c) => c.orderId === r.orderId)).toHaveLength(0);
      });
    });
  },
);
