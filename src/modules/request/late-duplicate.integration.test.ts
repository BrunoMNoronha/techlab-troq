// @vitest-environment node
//
// Prova de integracao da #147: duplicidade aprovada que aparece DEPOIS da
// confirmacao, contra o Better Auth REAL e PostgreSQL REAL e descartavel, com o
// Mercado Pago SIMULADO (`node:http`): Orders API (criacao, consulta e
// reembolso) e a busca da Payments API (ADR-0008).
//
// O que reproduz: a confirmacao unica marca como canonico a transacao da order
// (`PAYSIM...`, como o `PAY01...` real), e a busca da duplicidade devolve ids
// NUMERICOS da Payments API. O provedor nao documenta vinculo entre os dois
// (decisao RT-1 de F3-007; PD-8.11, item 5). Antes da correcao,
// `resolveDuplicateInTx` lancava `duplicate_canonical_outside_candidates`: o
// webhook engolia como `unavailable`, e a reconciliacao e a varredura de
// reversoes contavam `errors` (sinal `jobs.failure`) a cada passada.
//
// Origens cobertas: reentrega do webhook, `confirmPaymentFlow` da reconciliacao,
// a corrida da reconciliacao com o webhook e a varredura diaria de reversoes
// (F3-011). PD-13.2: as reentregas e os reprocessamentos sao CONCORRENTES de
// verdade (espera na trava do anuncio vista em `pg_stat_activity`).
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1. Dados sinteticos.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { runJob } from '@/app/api/jobs/_lib/run-job';
import { handleMercadoPagoWebhook } from '@/app/api/webhooks/mercadopago/handler';
import { registerOwnContact } from '@/modules/contact';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { createDraftListing } from '@/modules/listing/actions';
import { createMercadoPagoClient, type MercadoPagoClient } from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';
import { requestContactUnlockFlow } from './charge-flow';
import { confirmPaymentFlow } from './payment-confirmation';
import { runPaymentReconciliation } from './reconciliation';
import { runPaymentReversalSweep } from './reversal-sweep';

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

// F3-013: o transporte dos avisos transacionais e SIMULADO (TE-1/TE-2 contados).
const sentEmails = vi.hoisted(() => ({
  send: vi
    .fn<(email: { to: string; idempotencyKey: string }) => Promise<{ ok: true }>>()
    .mockResolvedValue({ ok: true }),
}));
vi.mock('@/modules/identity/email-transport', () => ({
  sendTransactionalEmail: sentEmails.send,
}));

// Sinais operacionais observados: `jobs.failure` e o efeito visivel do defeito.
const signals = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock('@/modules/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/platform')>()),
  reportSignal: signals.report,
}));
const jobFailures = () => signals.report.mock.calls.filter(([name]) => name === 'jobs.failure');

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const TOKEN = 'TEST-sintetico-duplicidade-000000';
const SECRET = randomBytes(32).toString('hex');
const APP_ID = '9900000000000147';
const REQUEST_PREFIX = `it147-${RUN_ID}`;
/** Prefixo numerico dos ids sinteticos da Payments API, unico por execucao. */
const PID = RUN_ID.replace(/\D/g, '').slice(-9);
const LATE_REASON = 'late_duplicate_canonical_unlinked';
const email = (tag: string) => `it-dup-tardia-${tag}-${RUN_ID}@example.test`;
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
  transactions: { payments: Raw[] };
}

const sim = {
  byKey: new Map<string, SimOrder>(),
  byId: new Map<string, SimOrder>(),
  search: new Map<string, Raw[]>(),
  refundCalls: [] as string[],
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
    return reply(res, 201, order);
  }
  const action = /^\/v1\/orders\/([^/]+)(?:\/(refund|cancel))?$/.exec(url.pathname);
  const order = action ? sim.byId.get(decodeURIComponent(action[1])) : undefined;
  if (req.method === 'GET' && action && !action[2]) {
    return order
      ? reply(res, 200, order)
      : reply(res, 404, { errors: [{ code: 'order_not_found' }] });
  }
  if (req.method === 'POST' && action?.[2]) {
    // Nenhuma prova desta suite pode devolver dinheiro: qualquer chamada e falha.
    sim.refundCalls.push(`${action[2]}:${action[1]}`);
    return reply(res, 409, { errors: [{ code: 'order_already_refunded' }] });
  }
  if (req.method === 'GET' && url.pathname === '/v1/payments/search') {
    const reference = url.searchParams.get('external_reference') ?? '';
    return reply(res, 200, { results: sim.search.get(reference) ?? [] });
  }
  return reply(res, 404, {});
}

let server: Server;
let gateway: MercadoPagoClient;

function approved(order: SimOrder, id: string, approvedAt: Date): Raw {
  return {
    id: Number(id),
    status: 'approved',
    status_detail: 'accredited',
    external_reference: order.external_reference,
    transaction_amount: 0.99,
    date_approved: approvedAt.toISOString(),
  };
}

/** Order acreditada com UMA transacao; a busca devolve so o pagamento `first`. */
function accreditSingle(orderId: string, first: string, approvedAt: Date) {
  const order = sim.byId.get(orderId)!;
  Object.assign(order, {
    status: 'processed',
    status_detail: 'accredited',
    total_paid_amount: '0.99',
  });
  Object.assign(order.transactions.payments[0], {
    status: 'processed',
    status_detail: 'accredited',
    paid_amount: '0.99',
  });
  sim.search.set(order.external_reference, [approved(order, first, approvedAt)]);
}

/** Um segundo pagamento aprovado aparece na busca DEPOIS da confirmacao. */
function lateDuplicate(orderId: string, second: string, approvedAt: Date) {
  const order = sim.byId.get(orderId)!;
  sim.search.set(order.external_reference, [
    ...(sim.search.get(order.external_reference) ?? []),
    approved(order, second, approvedAt),
  ]);
}

// ---------------------------------------------------------------------------
// Notificacao assinada (HMAC real, como o receptor exige)
// ---------------------------------------------------------------------------

let requestCounter = 0;

function notification(orderId: string, requestId = `${REQUEST_PREFIX}-${++requestCounter}`) {
  const ts = String(Date.now());
  const url = new URL('http://localhost/api/webhooks/mercadopago');
  url.searchParams.set('type', 'order');
  url.searchParams.set('data.id', orderId);
  const manifest = `id:${orderId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex');
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
      'x-signature': `ts=${ts},v1=${v1}`,
    },
    body: JSON.stringify({
      type: 'order',
      action: 'order.processed',
      application_id: APP_ID,
      data: { id: orderId },
    }),
  });
}

/** Entrega pela funcao da rota; orcamento folgado, porque a prova segura a trava. */
const deliver = (request: Request) =>
  handleMercadoPagoWebhook(request, { gateway, budgetMs: 60_000 });

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
  listingId: string;
  contactRequestId: string;
  attemptId: string;
  orderId: string;
  /** Instante do primeiro pagamento, dentro da janela. */
  firstAt: Date;
  /** Instante do pagamento duplicado, tambem dentro da janela. */
  secondAt: Date;
  /** Sequencial da prova, para ids sinteticos distintos. */
  seq: number;
}

let reserveSeq = 0;

async function reserve(tag: string): Promise<Reserved> {
  const listingId = await publishedListing();
  const res = await as(tag, () => requestContactUnlockFlow(listingId, { gateway }));
  if (!res.success || !res.pix) throw new Error(`reserva falhou: ${JSON.stringify(res)}`);
  const attempt = await prisma().paymentAttempt.findUniqueOrThrow({
    where: { contactRequestId: res.contactRequestId },
  });
  const { reservedFrom } = await prisma().contactRequest.findUniqueOrThrow({
    where: { id: res.contactRequestId },
    select: { reservedFrom: true },
  });
  return {
    listingId,
    contactRequestId: res.contactRequestId,
    attemptId: attempt.id,
    orderId: attempt.providerOrderId!,
    firstAt: new Date(reservedFrom.getTime() + 1_000),
    secondAt: new Date(reservedFrom.getTime() + 5_000),
    seq: ++reserveSeq,
  };
}

async function state(r: Reserved) {
  const [attempt, request, payments, cases, refunds, notifications] = await Promise.all([
    prisma().paymentAttempt.findUniqueOrThrow({ where: { id: r.attemptId } }),
    prisma().contactRequest.findUniqueOrThrow({ where: { id: r.contactRequestId } }),
    prisma().payment.findMany({ where: { paymentAttemptId: r.attemptId } }),
    prisma().reconciliationCase.findMany({
      where: { paymentAttemptId: r.attemptId },
      orderBy: { openedAt: 'asc' },
    }),
    prisma().technicalRefund.findMany({ where: { payment: { paymentAttemptId: r.attemptId } } }),
    prisma().paymentNotification.findMany({
      where: { paymentAttemptId: r.attemptId },
      orderBy: { receivedAt: 'asc' },
    }),
  ]);
  return { attempt, request, payments, cases, refunds, notifications };
}

function audits(eventType: string, targetIds: string[]) {
  return prisma().auditEvent.findMany({ where: { eventType, targetId: { in: targetIds } } });
}

/** So a tentativa indicada fica elegivel nas duas agendas (banco compartilhado pela suite). */
async function onlyDue(attemptId: string) {
  await prisma().$executeRaw`
    UPDATE "payment_attempts"
    SET "next_reconcile_at" = now() + interval '10 years',
        "next_reversal_check_at" = now() + interval '10 years'
    WHERE "id" <> ${attemptId}::uuid`;
  await prisma().$executeRaw`
    UPDATE "payment_attempts"
    SET "next_reconcile_at" = now() - interval '1 second',
        "next_reversal_check_at" = now() - interval '1 second'
    WHERE "id" = ${attemptId}::uuid`;
}

const reconcile = (deps: { gateway: MercadoPagoClient } = { gateway }) =>
  runJob('payments-reconcile', () =>
    runPaymentReconciliation({ stopClaimingAt: Date.now() + 30_000, deps }),
  );
const sweep = () =>
  runJob('payments-reversals', () =>
    runPaymentReversalSweep({ stopClaimingAt: Date.now() + 30_000, deps: { gateway } }),
  );

/**
 * Segura a trava do anuncio enquanto `start()` dispara o trabalho concorrente,
 * ate `expected` sessoes estarem ESPERANDO por trava (PD-13.2). So entao solta.
 */
async function underListingLock<T>(
  listingId: string,
  expected: number,
  start: () => Promise<T>,
): Promise<{ waiting: number; result: T }> {
  let pending!: Promise<T>;
  let waiting = 0;
  await prisma().$transaction(
    async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${listingId}::uuid FOR UPDATE`;
      pending = start();
      for (let i = 0; i < 150 && waiting < expected; i++) {
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
  return { waiting, result: await pending };
}

/**
 * Invariantes da duplicidade tardia, depois de qualquer numero de passagens:
 * nada muda no que ja foi confirmado, nenhum dinheiro e devolvido, e o caso
 * operacional existe UMA vez, auditado uma vez.
 */
async function expectLateDuplicateHandled(r: Reserved) {
  const s = await state(r);
  const order = sim.byId.get(r.orderId)!;
  const transactionId = String(order.transactions.payments[0].id);

  expect(s.request.status).toBe('paid');
  expect(s.attempt.status).toBe('pagamento_confirmado');
  expect(s.attempt.accreditedAt!.getTime()).toBe(r.firstAt.getTime());
  // O canonico continua a transacao da order eleita na confirmacao (PD-7.2).
  expect(s.payments.filter((p) => p.isCanonical).map((p) => p.providerPaymentId)).toEqual([
    transactionId,
  ]);
  // Os dois pagamentos da busca ficam espelhados para a operacao, sem eleicao.
  expect(s.payments.map((p) => p.providerPaymentId).sort()).toEqual(
    [transactionId, searchId(r, 1), searchId(r, 2)].sort(),
  );
  // Sem vinculo documentado: nenhum reembolso classificado, nenhuma chamada.
  expect(s.refunds).toEqual([]);
  expect(sim.refundCalls.filter((c) => c.endsWith(r.orderId))).toEqual([]);
  // Um unico caso operacional (PD-10.5), aberto.
  const late = s.cases.filter((c) => c.reason === LATE_REASON);
  expect(late.map((c) => [c.kind, c.closedAt])).toEqual([['inconsistente', null]]);
  const opened = await audits('payment.case_opened', [late[0].id]);
  expect(opened).toHaveLength(1);
  expect(opened[0].details).toMatchObject({
    paymentAttemptId: r.attemptId,
    kind: 'inconsistente',
    reason: LATE_REASON,
    rule: 'PD-10.5',
    canonicalProviderPaymentId: transactionId,
    excessTreatment: 'pending_decision',
  });
  // Nada foi reeleito nem confirmado de novo.
  expect(await audits('payment.duplicate_resolved', [r.attemptId])).toHaveLength(0);
  expect(await audits('payment.approved', [r.attemptId])).toHaveLength(1);
  expect(await audits('request.paid', [r.contactRequestId])).toHaveLength(1);
  return s;
}

/** Id numerico sintetico do pagamento da busca (unico por execucao e por prova). */
const searchId = (r: Reserved, n: 1 | 2) => `${PID}${r.seq}0${n}`;

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'duplicidade aprovada depois da confirmacao (#147)',
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
      sentEmails.send.mockClear();
      signals.report.mockClear();
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
    it('confirmada por webhook: reentregas e reconciliacao concorrentes, depois a varredura', async () => {
      const r = await reserve('r0');
      accreditSingle(r.orderId, searchId(r, 1), r.firstAt);
      expect((await deliver(notification(r.orderId))).status).toBe(200);
      const confirmed = await state(r);
      expect(confirmed.attempt).toMatchObject({
        status: 'pagamento_confirmado',
        recognitionSource: 'notificacao',
      });
      expect(sentEmails.send).toHaveBeenCalledTimes(2); // TE-1 e TE-2, uma vez

      lateDuplicate(r.orderId, searchId(r, 2), r.secondAt);

      // Reentrega da MESMA notificacao (mesmo x-request-id), outra notificacao e
      // a confirmacao da reconciliacao, as tres esperando a trava do anuncio.
      const redelivered = `${REQUEST_PREFIX}-reentrega-${r.attemptId}`;
      const { waiting, result } = await underListingLock(r.listingId, 3, () =>
        Promise.all([
          deliver(notification(r.orderId, redelivered)),
          deliver(notification(r.orderId, redelivered)),
          confirmPaymentFlow(r.attemptId, { origin: 'reconciliacao', deps: { gateway } }),
        ]),
      );
      expect(waiting).toBe(3);
      expect(result[0].status).toBe(200);
      expect(result[1].status).toBe(200);
      expect(result[2]).toBe('inconsistent');

      const s = await expectLateDuplicateHandled(r);
      // O receptor registra o desfecho real, nao uma falha engolida.
      expect(s.notifications.map((n) => n.processingResult)).toEqual([
        'confirmed',
        'inconsistent',
        'inconsistent',
      ]);

      // Varredura diaria de reversoes (F3-011) sobre a mesma tentativa, duas vezes.
      for (let pass = 0; pass < 2; pass++) {
        await onlyDue(r.attemptId);
        const summary = await sweep();
        expect(summary).toMatchObject({ claimed: 1, inconsistent: 1, errors: 0 });
      }
      expect(jobFailures()).toEqual([]);
      await expectLateDuplicateHandled(r);
      // Nenhum aviso novo: TE-1/TE-2 so na confirmacao original.
      expect(sentEmails.send).toHaveBeenCalledTimes(2);
    });

    it('confirmada pela reconciliacao: varredura de reversoes e webhook concorrentes', async () => {
      const r = await reserve('r1');
      accreditSingle(r.orderId, searchId(r, 1), r.firstAt);
      await onlyDue(r.attemptId);
      expect(await reconcile()).toMatchObject({ claimed: 1, confirmed: 1, errors: 0 });
      expect((await state(r)).attempt).toMatchObject({
        status: 'pagamento_confirmado',
        recognitionSource: 'reconciliacao',
      });

      lateDuplicate(r.orderId, searchId(r, 2), r.secondAt);
      await onlyDue(r.attemptId);
      const { waiting, result } = await underListingLock(r.listingId, 2, () =>
        Promise.all([sweep(), deliver(notification(r.orderId))]),
      );
      expect(waiting).toBe(2);
      expect(result[0]).toMatchObject({ claimed: 1, inconsistent: 1, errors: 0 });
      expect(result[1].status).toBe(200);
      expect(jobFailures()).toEqual([]);

      const s = await expectLateDuplicateHandled(r);
      expect(s.notifications.map((n) => n.processingResult)).toEqual(['inconsistent']);
    });

    it('corrida na reconciliacao: a duplicidade e lida enquanto o webhook confirma', async () => {
      const r = await reserve('r2');
      accreditSingle(r.orderId, searchId(r, 1), r.firstAt);
      await onlyDue(r.attemptId);

      // A reconciliacao reclamou a tentativa ainda aberta. Antes de ela ler a
      // order, o webhook confirma com um so pagamento; so entao o duplicado
      // aparece, e a reconciliacao le a busca ja com os dois.
      let raced = false;
      const racing: MercadoPagoClient = {
        ...gateway,
        getOrder: async (orderId) => {
          if (!raced) {
            raced = true;
            expect((await deliver(notification(r.orderId))).status).toBe(200);
            lateDuplicate(r.orderId, searchId(r, 2), r.secondAt);
          }
          return gateway.getOrder(orderId);
        },
      };

      expect(await reconcile({ gateway: racing })).toMatchObject({
        claimed: 1,
        inconsistent: 1,
        errors: 0,
      });
      expect(raced).toBe(true);
      expect(jobFailures()).toEqual([]);

      const s = await expectLateDuplicateHandled(r);
      expect(s.attempt.recognitionSource).toBe('notificacao');
      expect(s.notifications.map((n) => n.processingResult)).toEqual(['confirmed']);
    });
  },
);
