// @vitest-environment node
//
// Prova de integracao de F3-011 (#101): varredura diaria de reversoes e os seus
// efeitos (payments-design.md, PD-9.1, PD-9.2, PD-10.3; contact-release.md,
// CR-4.2, CR-4.3; data-model.md, DM-6.7), contra o Better Auth REAL e
// PostgreSQL REAL e descartavel, com o Mercado Pago SIMULADO (`node:http`):
// Orders API (criacao, consulta, reembolso) e a busca da Payments API.
//
// A reserva, a cobranca, a confirmacao, a escolha e a entrega do contato sao as
// REAIS (F3-003, F3-005, F3-006, F3-009, F3-010); so o provedor e simulado.
//
// PD-13.2:
// - T-17 e C-10 exercitam a reversao de verdade (o provedor passa a reportar
//   devolucao/contestacao) e conferem a vaga, a elegibilidade e a releitura
//   pelo caso de uso, nao por leitura de coluna;
// - a idempotencia reprocessa o MESMO fato varias vezes (varredura repetida e
//   webhook reentregue) e conta os eventos;
// - a concorrencia roda duas varreduras REALMENTE sobrepostas: a primeira
//   segura a transacao de reclamacao aberta enquanto a segunda reclama, e a
//   segunda termina sem esperar trava (vista em `pg_stat_activity`);
// - a recusa da rota sem segredo, com segredo errado e com esquema errado e
//   exercitada pela rota HTTP real no fim (servidor `pnpm start`).
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1. Dados sinteticos.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealContact } from '@/app/contatos/actions';
import { registerOwnContact } from '@/modules/contact';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { createDraftListing } from '@/modules/listing/actions';
import { getSelectionOptions, selectRequester, type SelectionResult } from '@/modules/negotiation';
import { createMercadoPagoClient, REVERSAL_CHECK_SECONDS } from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';
import { requestContactUnlockFlow } from './charge-flow';
import { confirmPaymentFlow } from './payment-confirmation';
import { runPaymentReconciliation } from './reconciliation';
import { createContactRequest } from './reservation';
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

// F3-013 (#103): os avisos da confirmacao saem por este transporte, simulado.
vi.mock('@/modules/identity/email-transport', () => ({
  sendTransactionalEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const TOKEN = 'TEST-sintetico-reversao-0000';
const OWNER_PHONE = '(11) 91234-5678';
const OWNER_E164 = '+5511912345678';
const email = (tag: string) => `it-reversao-${tag}-${RUN_ID}@example.test`;
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
  transactions: { payments: Raw[] };
}

const sim = {
  byKey: new Map<string, SimOrder>(),
  byId: new Map<string, SimOrder>(),
  search: new Map<string, Raw[]>(),
  /** Orders cuja consulta responde 503. */
  unavailable: new Set<string>(),
  creates: 0,
  refundPosts: [] as string[],
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
    id: `ORDREV${n}`,
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
          id: `PAYREV${n}`,
          amount: String(payment.amount),
          status: 'action_required',
          status_detail: 'waiting_transfer',
          date_of_expiration: new Date(Date.now() + 30 * 60_000).toISOString(),
          payment_method: { id: 'pix', type: 'bank_transfer', qr_code: `000201REV${n}` },
        },
      ],
    },
  };
}

function handle(req: IncomingMessage, res: ServerResponse, raw: string) {
  const url = new URL(req.url ?? '/', 'http://sim');
  const key = req.headers['x-idempotency-key'] as string;
  if (req.method === 'POST' && url.pathname === '/v1/orders') {
    sim.creates += 1;
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
    if (order && sim.unavailable.has(order.id)) {
      return reply(res, 503, { errors: [{ code: 'internal_error' }] });
    }
    return order
      ? reply(res, 200, order)
      : reply(res, 404, { errors: [{ code: 'order_not_found' }] });
  }
  if (req.method === 'POST' && action?.[2]) {
    // A reversao NAO gera reembolso nem cancelamento do TROQ: qualquer chamada
    // aqui e registrada e reprova as provas.
    sim.refundPosts.push(`${action[2]}:${order?.id ?? ''}`);
    return reply(res, 409, { errors: [{ code: 'cannot_refund_order' }] });
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

/** O provedor passa a reportar a order neste estado (reversao feita por terceiro). */
function providerReports(orderId: string, status: string, detail: string) {
  const order = sim.byId.get(orderId)!;
  Object.assign(order, {
    status,
    status_detail: detail,
    last_updated_date: new Date().toISOString(),
  });
  for (const p of order.transactions.payments) {
    Object.assign(p, { status, status_detail: detail });
  }
}

// ---------------------------------------------------------------------------
// Usuarios, anuncios, reservas e confirmacoes reais
// ---------------------------------------------------------------------------

async function createUser(tag: string): Promise<string> {
  const res = await registerUser({
    displayName: `Pessoa ${tag}`,
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
  tag: string;
  listingId: string;
  contactRequestId: string;
  attemptId: string;
  orderId: string;
  externalReference: string;
}

async function reserve(tag: string, listingId: string): Promise<Reserved> {
  const res = await as(tag, () => requestContactUnlockFlow(listingId, { gateway }));
  if (!res.success) throw new Error(`reserva falhou: ${JSON.stringify(res)}`);
  const attempt = await prisma().paymentAttempt.findUniqueOrThrow({
    where: { contactRequestId: res.contactRequestId },
  });
  expect(attempt.providerOrderId).not.toBeNull();
  return {
    tag,
    listingId,
    contactRequestId: res.contactRequestId,
    attemptId: attempt.id,
    orderId: attempt.providerOrderId!,
    externalReference: attempt.externalReference,
  };
}

/** Reserva, Pix pago 2 s depois de reservar e confirmacao REAL pelo webhook. */
async function paid(tag: string, listingId: string): Promise<Reserved> {
  const r = await reserve(tag, listingId);
  const { reservedFrom } = await prisma().contactRequest.findUniqueOrThrow({
    where: { id: r.contactRequestId },
    select: { reservedFrom: true },
  });
  accredit(r.orderId, new Date(reservedFrom.getTime() + 2_000));
  expect(await confirmPaymentFlow(r.attemptId, { origin: 'notificacao', deps: { gateway } })).toBe(
    'confirmed',
  );
  return r;
}

async function choose(listingId: string, r: Reserved) {
  const res = await as('owner', () =>
    selectRequester({ listingId, contactRequestId: r.contactRequestId, confirmed: true }),
  );
  expect(res).toMatchObject({ success: true });
  const { negotiationId } = res as Extract<SelectionResult, { success: true }>;
  return prisma().contactRelease.findUniqueOrThrow({ where: { negotiationId } });
}

async function candidates(listingId: string): Promise<string[]> {
  const res = await as('owner', () => getSelectionOptions(listingId));
  if (!res.success) throw new Error(`opcoes falharam: ${res.reason}`);
  return res.options.candidates.map((c) => c.contactRequestId);
}

async function state(r: Reserved) {
  const [attempt, request, cases, payments] = await Promise.all([
    prisma().paymentAttempt.findUniqueOrThrow({ where: { id: r.attemptId } }),
    prisma().contactRequest.findUniqueOrThrow({ where: { id: r.contactRequestId } }),
    prisma().reconciliationCase.findMany({
      where: { paymentAttemptId: r.attemptId },
      orderBy: { openedAt: 'asc' },
    }),
    prisma().payment.findMany({ where: { paymentAttemptId: r.attemptId } }),
  ]);
  return { attempt, request, cases, payments };
}

function audits(eventType: string, targetIds: string[]) {
  return prisma().auditEvent.findMany({
    where: { eventType, targetId: { in: targetIds } },
    orderBy: { occurredAt: 'asc' },
  });
}

/**
 * Isola cada prova: toda tentativa que nao e desta prova fica fora das duas
 * agendas (o banco e descartavel e compartilhado pelas provas deste arquivo).
 */
async function park(attemptIds: string[]) {
  await prisma().$executeRaw`
    UPDATE "payment_attempts"
    SET "next_reversal_check_at" = now() + interval '10 years',
        "next_reconcile_at" = now() + interval '10 years'
    WHERE NOT ("id" = ANY(${attemptIds}::uuid[]))`;
}

/** Faz o dia passar: as tentativas indicadas voltam a ser examinadas. */
async function makeDue(attemptIds: string[]) {
  await prisma().$executeRaw`
    UPDATE "payment_attempts" SET "next_reversal_check_at" = now() - interval '1 second'
    WHERE "id" = ANY(${attemptIds}::uuid[])`;
}

const sweep = (extra: Partial<Parameters<typeof runPaymentReversalSweep>[0]> = {}) =>
  runPaymentReversalSweep({ stopClaimingAt: Date.now() + 30_000, deps: { gateway }, ...extra });

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

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'reversoes posteriores e os seus efeitos (#101)',
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
      expect(await as('owner', () => registerOwnContact({ phone: OWNER_PHONE }))).toEqual({
        success: true,
        hasContact: true,
      });
    });

    beforeEach(() => {
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
      const releases = await prisma().contactRelease.findMany({
        where: { listingId: { in: listingIds } },
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
                  ...releases.map((c) => c.id),
                ],
              },
            },
          ],
        },
      });
      await prisma().contactAccessEvent.deleteMany({
        where: { contactReleaseId: { in: releases.map((r) => r.id) } },
      });
      await prisma().contactRelease.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().negotiation.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().selection.deleteMany({ where: { listingId: { in: listingIds } } });
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
    it('T-17: reversao apos a confirmacao mantem a vaga e o historico e tira a solicitacao nao escolhida das opcoes', async () => {
      const listingId = await publishedListing();
      const p0 = await paid('r0', listingId);
      const p1 = await paid('r1', listingId);
      const p2 = await paid('r2', listingId);
      expect(await candidates(listingId)).toEqual(
        expect.arrayContaining([p0.contactRequestId, p1.contactRequestId, p2.contactRequestId]),
      );
      const before = await state(p1);
      const approvals = await audits('payment.approved', [p1.attemptId]);
      expect(approvals).toHaveLength(1);
      await park([p0.attemptId, p1.attemptId, p2.attemptId]);

      // Devolucao feita por terceiro: o provedor passa a reportar a order devolvida.
      providerReports(p1.orderId, 'refunded', 'refunded');
      const creates = sim.creates;
      const calls = sim.refundPosts.length;

      const summary = await sweep();

      expect(summary).toMatchObject({
        claimed: 3,
        reversed: 1,
        stillAccredited: 2,
        inconsistent: 0,
        errors: 0,
      });
      const after = await state(p1);
      // Vaga consumida e linha `paid` intactas (DM-6.7, PE-8.9).
      expect(after.request).toMatchObject({
        status: 'paid',
        slotIndex: before.request.slotIndex,
        paidAt: before.request.paidAt,
      });
      // A tentativa sai de `pagamento_confirmado`; a aprovacao original e
      // fato historico: instantes, origem e canonico como estavam (PE-8.5).
      expect(after.attempt).toMatchObject({
        status: 'reembolsada_ou_revertida',
        accreditedAt: before.attempt.accreditedAt,
        recognizedAt: before.attempt.recognizedAt,
        recognitionSource: 'notificacao',
        lastReconcileResult: 'reversal_check_reversed',
      });
      expect(after.payments.filter((p) => p.isCanonical).map((p) => p.id)).toEqual(
        before.payments.filter((p) => p.isCanonical).map((p) => p.id),
      );
      expect(await audits('payment.approved', [p1.attemptId])).toEqual(approvals);
      expect(await audits('request.paid', [p1.contactRequestId])).toHaveLength(1);
      // A reversao e EVENTO NOVO, com instante, origem e efeitos (PE-8.5, PE-11).
      const [event] = await audits('payment.reversed', [p1.attemptId]);
      expect(event.occurredAt.getTime()).toBeGreaterThan(approvals[0].occurredAt.getTime());
      expect(event).toMatchObject({
        actorId: null,
        targetType: 'payment_attempt',
        result: 'success',
        details: {
          confirmed: true,
          authoritativeState: 'order_refunded',
          origin: 'reconciliacao',
          contactRequestId: p1.contactRequestId,
          slotIndex: before.request.slotIndex,
          requestStatus: 'paid',
          slotKept: true,
          eligibleForSelection: false,
          contactReleased: false,
          contactReleaseRevoked: false,
          newCharge: false,
          approval: {
            accreditedAt: before.attempt.accreditedAt!.toISOString(),
            recognizedAt: before.attempt.recognizedAt!.toISOString(),
            recognitionSource: 'notificacao',
          },
        },
      });
      // Nenhuma cobranca nova, de recuperacao ou devolucao pelo TROQ (PE-8.8).
      expect(sim.creates).toBe(creates);
      expect(sim.refundPosts.length).toBe(calls);
      expect(
        await prisma().paymentAttempt.count({ where: { contactRequestId: p1.contactRequestId } }),
      ).toBe(1);

      // A solicitacao nao escolhida deixa de ser apresentada e de ser elegivel (CR-4.2).
      const options = await candidates(listingId);
      expect(options).not.toContain(p1.contactRequestId);
      expect(options).toEqual(expect.arrayContaining([p0.contactRequestId, p2.contactRequestId]));
      expect(
        await as('owner', () =>
          selectRequester({ listingId, contactRequestId: p1.contactRequestId, confirmed: true }),
        ),
      ).toMatchObject({ success: false, reason: 'not_eligible' });
      // A vaga revertida nao abre uma quarta oportunidade paga (PE-8.10).
      expect(await as('r3', () => createContactRequest(listingId))).toMatchObject({
        success: false,
        reason: 'no_slots',
      });

      // Idempotente: o MESMO fato reprocessado pela varredura (dia seguinte) e
      // reentregue duas vezes pelo webhook nao produz segundo efeito (PD-10.4).
      await makeDue([p0.attemptId, p1.attemptId, p2.attemptId]);
      expect(await sweep()).toMatchObject({ claimed: 2, reversed: 0, stillAccredited: 2 });
      for (let i = 0; i < 2; i++) {
        expect(
          await confirmPaymentFlow(p1.attemptId, { origin: 'notificacao', deps: { gateway } }),
        ).toBe('no_effect');
      }
      expect(await audits('payment.reversed', [p1.attemptId])).toHaveLength(1);
      expect((await state(p1)).request.status).toBe('paid');
    });

    // -----------------------------------------------------------------------
    it('C-10: reversao depois da liberacao mantem a autorizacao, permite a releitura e registra o evento', async () => {
      const listingId = await publishedListing();
      const chosen = await paid('r0', listingId);
      const other = await paid('r1', listingId);
      const release = await choose(listingId, chosen);
      expect(await as('r0', () => revealContact(release.id))).toEqual({
        success: true,
        phone: OWNER_E164,
      });
      expect(await candidates(listingId)).toEqual([other.contactRequestId]);
      const accessBefore = await prisma().contactAccessEvent.count({
        where: { contactReleaseId: release.id },
      });
      await park([chosen.attemptId, other.attemptId]);

      // Contestacao no pagamento do escolhido (valor tecnico da API, PD-9.3) e
      // devolucao no do nao escolhido.
      providerReports(chosen.orderId, 'charged_back', 'settled');
      providerReports(other.orderId, 'refunded', 'refunded');

      expect(await sweep()).toMatchObject({ claimed: 2, reversed: 2, errors: 0 });

      // Autorizacao intacta: a mesma linha, sem nenhuma alteracao (CR-3.5).
      expect(
        await prisma().contactRelease.findUniqueOrThrow({ where: { id: release.id } }),
      ).toEqual(release);
      const negotiation = await prisma().negotiation.findUniqueOrThrow({
        where: { id: release.negotiationId },
      });
      expect(negotiation.status).toBe('active');
      // Releitura permitida (CR-4.3), e cada entrega continua registrada (CR-5.5).
      expect(await as('r0', () => revealContact(release.id))).toEqual({
        success: true,
        phone: OWNER_E164,
      });
      expect(
        await prisma().contactAccessEvent.count({ where: { contactReleaseId: release.id } }),
      ).toBe(accessBefore + 1);
      // Evento de reversao registrado, dizendo que a divulgacao ja ocorreu (PE-8.7).
      const [event] = await audits('payment.reversed', [chosen.attemptId]);
      expect(event).toMatchObject({
        details: {
          confirmed: true,
          authoritativeState: 'order_charged_back',
          contactReleased: true,
          contactReleaseRevoked: false,
          slotKept: true,
        },
      });
      expect(JSON.stringify(event.details)).not.toMatch(/912345678|91234-5678/);
      expect((await state(chosen)).request.status).toBe('paid');

      // A nao escolhida fica inelegivel: some das opcoes e, encerrada a
      // negociacao (DEC-029), a reselecao dela e recusada.
      expect(await candidates(listingId)).toEqual([]);
      await prisma().negotiation.update({
        where: { id: release.negotiationId },
        data: { status: 'closed', closedAt: new Date(), closedById: userIds[1] },
      });
      expect(
        await as('owner', () =>
          selectRequester({ listingId, contactRequestId: other.contactRequestId, confirmed: true }),
        ),
      ).toMatchObject({ success: false, reason: 'not_eligible' });
      // E o escolhido continua relendo mesmo com a negociacao encerrada.
      expect(await as('r0', () => revealContact(release.id))).toMatchObject({ success: true });
    });

    // -----------------------------------------------------------------------
    it('PD-9.1 e PD-10.5: terminal sem acreditacao tambem e reversao; pendente e desconhecido abrem inconsistencia sem transicao', async () => {
      const listingId = await publishedListing();
      const terminal = await paid('r0', listingId);
      const pending = await paid('r1', listingId);
      const unknown = await paid('r2', listingId);
      await park([terminal.attemptId, pending.attemptId, unknown.attemptId]);
      providerReports(terminal.orderId, 'canceled', 'canceled');
      providerReports(pending.orderId, 'action_required', 'waiting_transfer');
      providerReports(unknown.orderId, 'estado_inventado', 'qualquer');

      expect(await sweep()).toMatchObject({ claimed: 3, reversed: 1, inconsistent: 2 });

      const t = await state(terminal);
      expect(t.attempt.status).toBe('reembolsada_ou_revertida');
      expect(t.request.status).toBe('paid');
      expect((await audits('payment.reversed', [terminal.attemptId]))[0]).toMatchObject({
        details: { authoritativeState: 'terminal_canceled', slotKept: true },
      });
      for (const [r, reason] of [
        [pending, 'confirmed_payment_pending'],
        [unknown, 'order_status_unmapped'],
      ] as const) {
        const s = await state(r);
        expect(s.attempt.status).toBe('pagamento_confirmado');
        expect(s.request.status).toBe('paid');
        expect(s.cases.map((c) => [c.kind, c.reason, c.closedAt])).toEqual([
          ['inconsistente', reason, null],
        ]);
        expect(await audits('payment.reversed', [r.attemptId])).toHaveLength(0);
      }
    });

    // -----------------------------------------------------------------------
    it('indisponivel: nada muda, nenhuma reversao inventada, volta na proxima varredura diaria', async () => {
      const listingId = await publishedListing();
      const r = await paid('r0', listingId);
      await park([r.attemptId]);
      providerReports(r.orderId, 'refunded', 'refunded');
      sim.unavailable.add(r.orderId);

      expect(await sweep()).toMatchObject({ claimed: 1, unavailable: 1, reversed: 0 });
      let s = await state(r);
      expect(s.attempt).toMatchObject({
        status: 'pagamento_confirmado',
        lastReconcileResult: 'reversal_check_unavailable',
      });
      // O instante reclamado e a cadencia diaria; o mesmo dia nao a pega de novo.
      const delay =
        s.attempt.nextReversalCheckAt!.getTime() - s.attempt.lastReconciledAt!.getTime();
      expect(delay).toBeGreaterThan((REVERSAL_CHECK_SECONDS - 60) * 1000);
      expect(delay).toBeLessThanOrEqual(REVERSAL_CHECK_SECONDS * 1000 + 1_000);
      expect(await sweep()).toMatchObject({ claimed: 0 });

      sim.unavailable.clear();
      await makeDue([r.attemptId]);
      expect(await sweep()).toMatchObject({ claimed: 1, reversed: 1 });
      s = await state(r);
      expect(s.attempt.status).toBe('reembolsada_ou_revertida');
    });

    // -----------------------------------------------------------------------
    it('excedente RT-1 devolvido pelo proprio TROQ: reversao ambigua vira inconsistencia, sem transicao', async () => {
      const listingId = await publishedListing();
      const r = await paid('r1', listingId);
      // Duplicidade ja tratada por F3-007: um segundo pagamento com RT-1 concluido.
      await prisma().$executeRaw`
        WITH p AS (
          INSERT INTO "payments" (
            "id", "payment_attempt_id", "provider_payment_id", "amount_cents",
            "provider_status", "provider_status_detail", "accredited_at",
            "first_observed_at", "last_observed_at", "created_at", "updated_at")
          VALUES (gen_random_uuid(), ${r.attemptId}::uuid, ${`PAYREVDUP${RUN_ID}`}, 99,
                  'refunded', 'refunded', now(), now(), now(), now(), now())
          RETURNING "id")
        INSERT INTO "technical_refunds" (
          "id", "payment_id", "hypothesis", "idempotency_key", "status", "attempt_count",
          "created_at", "updated_at")
        SELECT gen_random_uuid(), p."id", 'rt_1', ${`chave-sintetica-${RUN_ID}`}, 'concluido', 1,
               now(), now()
        FROM p`;
      await park([r.attemptId]);
      providerReports(r.orderId, 'processed', 'partially_refunded');

      expect(await sweep()).toMatchObject({ claimed: 1, inconsistent: 1, reversed: 0 });

      const s = await state(r);
      expect(s.attempt.status).toBe('pagamento_confirmado');
      expect(s.cases.map((c) => [c.kind, c.reason, c.closedAt])).toEqual([
        ['inconsistente', 'reversal_with_technical_refund', null],
      ]);
      expect(await audits('payment.reversed', [r.attemptId])).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    it('reversao ANTES da confirmacao: a reconciliacao encerra a tentativa, libera a reserva e para de reconsultar', async () => {
      const listingId = await publishedListing();
      const r = await reserve('r2', listingId);
      const { reservedFrom } = await prisma().contactRequest.findUniqueOrThrow({
        where: { id: r.contactRequestId },
        select: { reservedFrom: true },
      });
      // Acreditado e devolvido antes de o TROQ reconhecer (nenhuma notificacao).
      accredit(r.orderId, new Date(reservedFrom.getTime() + 2_000));
      providerReports(r.orderId, 'refunded', 'refunded');
      await park([r.attemptId]);
      const reconcile = () =>
        runPaymentReconciliation({ stopClaimingAt: Date.now() + 30_000, deps: { gateway } });

      expect(await reconcile()).toMatchObject({ claimed: 1, reversed: 1, errors: 0 });

      const s = await state(r);
      expect(s.attempt.status).toBe('reembolsada_ou_revertida');
      // Nunca foi paga: a reserva, que nao pode mais ser paga, sai da vaga (PD-9.4).
      expect(s.request.status).toBe('failed');
      expect(s.cases).toHaveLength(0);
      expect((await audits('payment.reversed', [r.attemptId]))[0]).toMatchObject({
        details: { confirmed: false, authoritativeState: 'order_refunded', slotConsumed: false },
      });
      expect(await audits('request.reservation_ended', [r.contactRequestId])).toHaveLength(1);
      // Terminal e sem caso aberto: a reconciliacao nao volta a consulta-la.
      await prisma().$executeRaw`
        UPDATE "payment_attempts" SET "next_reconcile_at" = now() - interval '1 second'
        WHERE "id" = ${r.attemptId}::uuid`;
      expect(await reconcile()).toMatchObject({ claimed: 0 });
    });

    // -----------------------------------------------------------------------
    it('duas varreduras sobrepostas reclamam conjuntos disjuntos; um evento por reversao', async () => {
      const l1 = await publishedListing();
      const l2 = await publishedListing();
      const all: Reserved[] = [];
      for (const listingId of [l1, l2]) {
        for (const tag of ['r0', 'r1', 'r2']) all.push(await paid(tag, listingId));
      }
      const reversedSet = [all[0], all[2], all[4]];
      for (const r of reversedSet) providerReports(r.orderId, 'refunded', 'refunded');
      const ids = all.map((r) => r.attemptId);
      await park(ids);

      const claims: { A: string[][]; B: string[][] } = { A: [], B: [] };
      let releaseA!: () => void;
      const holdA = new Promise<void>((resolve) => (releaseA = resolve));
      let waitsWhileHeld = -1;
      const runA = sweep({
        batchSize: 3,
        hooks: {
          onClaimed: async (claimed) => {
            claims.A.push(claimed);
            // A primeira execucao segura a transacao de reclamacao ABERTA.
            if (claims.A.length === 1) await holdA;
          },
        },
      });
      let runB: ReturnType<typeof sweep> | undefined;
      try {
        expect(await until(() => claims.A.length === 1, 15_000)).toBe(true);
        runB = sweep({
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
      // Cada tentativa reclamada UMA unica vez no total, inclusive nos lotes seguintes.
      const every = [...claims.A.flat(), ...claims.B.flat()];
      expect([...every].sort()).toEqual([...ids].sort());
      expect(summaryA.claimed + summaryB.claimed).toBe(6);
      expect(summaryA.reversed + summaryB.reversed).toBe(3);
      expect(summaryA.stillAccredited + summaryB.stillAccredited).toBe(3);
      expect(summaryA.errors + summaryB.errors).toBe(0);
      for (const r of all) {
        const expected = reversedSet.includes(r) ? 1 : 0;
        expect(await audits('payment.reversed', [r.attemptId])).toHaveLength(expected);
        expect((await state(r)).request.status).toBe('paid');
      }
    });

    // -----------------------------------------------------------------------
    // Prova pela ROTA HTTP REAL (servidor `pnpm start` sobre o mesmo banco, com
    // o mesmo CRON_SECRET e SEM credencial do Mercado Pago: falha fechada).
    const BASE_URL = process.env.PRIVATE_SURFACE_BASE_URL?.replace(/\/$/, '') ?? '';
    const CRON = process.env.CRON_SECRET ?? '';
    describe.skipIf(BASE_URL === '' || CRON === '')('rota HTTP real (CI-11)', () => {
      const get = (authorization?: string) =>
        fetch(`${BASE_URL}/api/jobs/payments-reversals`, {
          headers: authorization ? { authorization } : {},
          redirect: 'manual',
        });

      it('recusa sem segredo, com segredo errado e com esquema errado; sem efeito', async () => {
        const listingId = await publishedListing();
        const r = await paid('r1', listingId);
        await prisma().$executeRaw`
          UPDATE "payment_attempts" SET "next_reversal_check_at" = NULL
          WHERE "id" = ${r.attemptId}::uuid`;
        await park([r.attemptId]);
        for (const authorization of [
          undefined,
          'Bearer segredo-errado-errado-errado-1234',
          `Basic ${CRON}`,
          `bearer ${CRON}`,
          CRON,
        ]) {
          const res = await get(authorization);
          expect(res.status).toBe(401);
          expect(await res.text()).toBe('');
          expect(res.headers.get('cache-control')).toBe('no-store');
        }
        expect((await state(r)).attempt).toMatchObject({
          status: 'pagamento_confirmado',
          nextReversalCheckAt: null,
        });
      });

      it('autorizada: reclama, falha fechada sem credencial, responde so contagens', async () => {
        const listingId = await publishedListing();
        const r = await paid('r2', listingId);
        await park([r.attemptId]);

        const res = await get(`Bearer ${CRON}`);

        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        const text = await res.text();
        const body = JSON.parse(text) as Record<string, unknown>;
        expect(Object.values(body).every((v) => typeof v === 'number')).toBe(true);
        expect(body).toMatchObject({ claimed: 1, unavailable: 1, reversed: 0, errors: 0 });
        for (const leak of [r.orderId, r.attemptId, r.externalReference, CRON]) {
          expect(text).not.toContain(leak);
        }
        const s = await state(r);
        expect(s.attempt).toMatchObject({
          status: 'pagamento_confirmado',
          lastReconcileResult: 'reversal_check_unavailable',
        });
        expect(s.attempt.nextReversalCheckAt!.getTime()).toBeGreaterThan(Date.now());
      });
    });
  },
);
