// @vitest-environment node
//
// Prova ponta a ponta LOCAL da jornada de F3-012 (#102), pelas MESMAS funcoes
// de servidor que as telas chamam, contra Better Auth REAL, PostgreSQL REAL e
// descartavel e um provedor SIMULADO local (`node:http`: Orders API + busca da
// Payments API). Nenhuma chamada sai da maquina; nenhuma cobranca real.
//
// Visitante -> detalhe -> "Tenho interesse" exige login -> solicitante elegivel
// confirma (reserva + Pix) -> acompanha -> notificacao ASSINADA do provedor
// (receptor real, HMAC real) confirma o pagamento -> anuncio pausado nao
// reapresenta Pix, mas o pagamento ja acreditado confirma (PD-6.11) -> dono ve
// as solicitacoes pagas elegiveis -> escolhe com confirmacao explicita -> so o
// escolhido recebe o contato.
//
// Autorizacao com os atores NAO autorizados reais: visitante, terceiro com
// sessao, o outro solicitante pago e o proprio solicitante tentando agir como
// dono. Cada um recebe a mesma recusa de um recurso inexistente.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1 (testing.md, 2.2).
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { handleMercadoPagoWebhook } from '@/app/api/webhooks/mercadopago/handler';
import { revealContact } from '@/app/contatos/actions';
import { listOwnContactReleases, registerOwnContact } from '@/modules/contact';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { createDraftListing, pauseListing } from '@/modules/listing/actions';
import { getSelectionOptions, selectRequester } from '@/modules/negotiation';
import { createMercadoPagoClient } from '@/modules/payments';
import {
  getContactRequestEntryView,
  getOwnContactRequest,
  getPixPaymentFlow,
  listOwnContactRequests,
  requestContactUnlockFlow,
} from '@/modules/request';
import { requestContactUnlock } from '@/modules/request/actions';
import { getPrismaClient } from '@/persistence/prisma';

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

// Avisos TE-1/TE-2/TE-3 (F3-013): transporte SIMULADO.
const sentEmails = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock('@/modules/identity/email-transport', () => ({
  sendTransactionalEmail: sentEmails.send,
}));

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const TOKEN = 'TEST-sintetico-jornada-000000';
const SECRET = randomBytes(32).toString('hex');
const APP_ID = '9900000000000102';
const REQUEST_PREFIX = `it102-${RUN_ID}`;
const OWNER_PHONE = '(11) 91234-5678';
const OWNER_E164 = '+5511912345678';
const email = (tag: string) => `it-jornada-${tag}-${RUN_ID}@example.test`;
const prisma = () => getPrismaClient();

const userIds: string[] = [];
const cookies: Record<string, string> = {};
const names: Record<string, string> = {
  owner: 'Dona Sintetica',
  r0: 'Ana Sintetica',
  r1: 'Bruno Sintetico',
  third: 'Terceira Sintetica',
};

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
  requests: [] as { method: string; path: string }[],
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
            qr_code_base64: 'iVBORw0KGgo=',
            ticket_url: `https://example.test/sandbox/payments/${n}/ticket`,
          },
        },
      ],
    },
  };
}

function handle(req: IncomingMessage, res: ServerResponse, raw: string) {
  const url = new URL(req.url ?? '/', 'http://sim');
  sim.requests.push({ method: req.method ?? '', path: url.pathname });
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
  const get = /^\/v1\/orders\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'GET' && get) {
    const order = sim.byId.get(decodeURIComponent(get[1]));
    return order
      ? reply(res, 200, order)
      : reply(res, 404, { errors: [{ code: 'order_not_found' }] });
  }
  if (req.method === 'GET' && url.pathname === '/v1/payments/search') {
    const reference = url.searchParams.get('external_reference') ?? '';
    return reply(res, 200, { results: sim.search.get(reference) ?? [] });
  }
  return reply(res, 404, {});
}

/** Acredita a order no simulador (ambiente de teste aprovando o Pix). */
function accredit(orderId: string, approvedAt: Date) {
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
      id: Number(`19${sim.counter}${Math.floor(Math.random() * 1e6)}`),
      status: 'approved',
      status_detail: 'accredited',
      external_reference: order.external_reference,
      transaction_amount: 0.99,
      date_approved: approvedAt.toISOString(),
    },
  ]);
}

let requestCounter = 0;

/** Notificacao do provedor assinada com a chave do webhook (PD-6.2, PD-6.10). */
function notification(orderId: string): Request {
  const requestId = `${REQUEST_PREFIX}-${++requestCounter}`;
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

let server: Server;
let gateway: ReturnType<typeof createMercadoPagoClient>;

// ---------------------------------------------------------------------------
// Usuarios e sessoes
// ---------------------------------------------------------------------------

async function createUser(tag: string): Promise<string> {
  const res = await registerUser({
    displayName: names[tag],
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
  return cookieStore.run(tag === 'anon' ? '' : (cookies[tag] ?? ''), fn);
}

async function attemptOf(contactRequestId: string) {
  return prisma().paymentAttempt.findUniqueOrThrow({ where: { contactRequestId } });
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'jornada de interface da Fase 3, ponta a ponta local (F3-012, #102)',
  () => {
    let listingId: string;

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

      for (const tag of ['owner', 'r0', 'r1', 'third']) {
        await createUser(tag);
        cookies[tag] = await signIn(tag);
      }
      expect(await as('owner', () => registerOwnContact({ phone: OWNER_PHONE }))).toMatchObject({
        success: true,
      });
      const draft = await as('owner', () =>
        createDraftListing({
          title: 'Bicicleta sintetica da jornada',
          description: 'Anuncio sintetico de integracao.',
          city: 'Recife',
          state: 'PE',
        }),
      );
      listingId = draft.listingId!;
      await prisma().listing.update({ where: { id: listingId }, data: { status: 'published' } });
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
      const releaseIds = (
        await prisma().contactRelease.findMany({
          where: { listingId: { in: listingIds } },
          select: { id: true },
        })
      ).map((r) => r.id);
      await prisma().auditEvent.deleteMany({
        where: {
          OR: [
            { actorId: { in: userIds } },
            { targetId: { in: [...attemptIds, ...requestIds, ...releaseIds, ...listingIds] } },
            { details: { path: ['providerRequestId'], string_starts_with: REQUEST_PREFIX } },
          ],
        },
      });
      await prisma().contactAccessEvent.deleteMany({
        where: { contactReleaseId: { in: releaseIds } },
      });
      await prisma().contactRelease.deleteMany({ where: { id: { in: releaseIds } } });
      await prisma().negotiation.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().selection.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().reconciliationCase.deleteMany({
        where: { paymentAttemptId: { in: attemptIds } },
      });
      await prisma().paymentNotification.deleteMany({
        where: {
          OR: [
            { paymentAttemptId: { in: attemptIds } },
            { providerRequestId: { startsWith: REQUEST_PREFIX } },
          ],
        },
      });
      await prisma().payment.deleteMany({ where: { paymentAttemptId: { in: attemptIds } } });
      await prisma().paymentAttempt.deleteMany({ where: { id: { in: attemptIds } } });
      await prisma().contactRequest.deleteMany({ where: { id: { in: requestIds } } });
      await prisma().listingTransition.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().listing.deleteMany({ where: { id: { in: listingIds } } });
      await prisma().verification.deleteMany({
        where: { identifier: { in: userIds.map((id) => `email-verification:${id}`) } },
      });
      await prisma().termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().userContact.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().account.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().user.deleteMany({ where: { id: { in: userIds } } });
      await prisma().$disconnect();
      vi.unstubAllEnvs();
    });

    it('do detalhe publico ao contato entregue so ao escolhido', async () => {
      // 1. Visitante: ve o detalhe, e orientado a entrar; chamada direta nao cria nada.
      expect(await as('anon', () => getContactRequestEntryView(listingId))).toEqual({
        state: 'login_required',
        ownRequestId: null,
      });
      const anonymous = await as('anon', () => requestContactUnlock(listingId));
      expect(anonymous).toMatchObject({ success: false, reason: 'login_required' });
      expect(await prisma().contactRequest.count({ where: { listingId } })).toBe(0);
      expect(sim.requests).toHaveLength(0);

      // 2. Dono nao solicita o proprio anuncio.
      expect((await as('owner', () => getContactRequestEntryView(listingId))).state).toBe(
        'own_listing',
      );

      // 3. Solicitante elegivel: "Tenho interesse" e so interface; a confirmacao reserva e gera o Pix.
      expect(await as('r0', () => getContactRequestEntryView(listingId))).toEqual({
        state: 'request_available',
        ownRequestId: null,
      });
      const r0 = await as('r0', () => requestContactUnlockFlow(listingId, { gateway }));
      if (!r0.success || !r0.pix) throw new Error(`reserva r0 falhou: ${JSON.stringify(r0)}`);
      expect(r0.pix.copyPaste).toMatch(/^000201SIMULADO/);

      // 4. Acompanhamento: so o proprio solicitante ve; sem dado de pagamento nem de vaga.
      const tracking = await as('r0', () => getOwnContactRequest(r0.contactRequestId));
      expect(tracking).toMatchObject({
        contactRequestId: r0.contactRequestId,
        listingId,
        listingStatus: 'published',
        listingTitle: 'Bicicleta sintetica da jornada',
        phase: 'awaiting_payment',
        paidAt: null,
      });
      expect(Object.keys(tracking!).sort()).toEqual(
        [
          'contactRequestId',
          'listingId',
          'listingStatus',
          'listingTitle',
          'now',
          'paidAt',
          'phase',
          'reservedUntil',
        ].sort(),
      );
      for (const actor of ['anon', 'third', 'owner', 'r1']) {
        expect(await as(actor, () => getOwnContactRequest(r0.contactRequestId))).toBeNull();
      }
      expect(await as('r0', () => getOwnContactRequest(randomUUID()))).toBeNull();
      expect(await as('r0', () => getOwnContactRequest('nao-e-uuid'))).toBeNull();
      expect((await as('third', () => listOwnContactRequests()))!.length).toBe(0);

      // 5. A entrada leva ao Pix ja gerado; repetir e recusado (DEC-041).
      expect(await as('r0', () => getContactRequestEntryView(listingId))).toEqual({
        state: 'own_request',
        ownRequestId: r0.contactRequestId,
      });
      expect(await as('r0', () => requestContactUnlockFlow(listingId, { gateway }))).toMatchObject({
        success: false,
        reason: 'active_reservation',
      });

      // 6. A tela do Pix rele a MESMA order; terceiro nem chega ao provedor.
      const again = await as('r0', () => getPixPaymentFlow(r0.contactRequestId, { gateway }));
      expect(again).toMatchObject({ success: true, pix: { copyPaste: r0.pix.copyPaste } });
      const callsBefore = sim.requests.length;
      for (const actor of ['third', 'owner', 'r1', 'anon']) {
        const res = await as(actor, () => getPixPaymentFlow(r0.contactRequestId, { gateway }));
        expect(res.success).toBe(false);
        expect(JSON.stringify(res)).not.toContain('SIMULADO');
      }
      expect(sim.requests.length).toBe(callsBefore);
      expect(sim.byKey.size).toBe(1);

      // 7. Reserva nao paga nao aparece ao dono (CR-4.2; interesse nao e visivel).
      const empty = await as('owner', () => getSelectionOptions(listingId));
      expect(empty).toMatchObject({ success: true, options: { candidates: [] } });

      // 8. Notificacao assinada: ambiente de teste aprova o Pix; o receptor confirma.
      const r0Attempt = await attemptOf(r0.contactRequestId);
      accredit(r0Attempt.providerOrderId!, new Date());
      const delivered = await handleMercadoPagoWebhook(notification(r0Attempt.providerOrderId!), {
        gateway,
      });
      expect(delivered.status).toBe(200);
      const paid = await as('r0', () => getOwnContactRequest(r0.contactRequestId));
      expect(paid).toMatchObject({ phase: 'paid' });
      expect(paid!.paidAt).not.toBeNull();
      expect(await as('r0', () => getContactRequestEntryView(listingId))).toEqual({
        state: 'own_request',
        ownRequestId: r0.contactRequestId,
      });

      // 9. Segundo solicitante reserva; o dono pausa o anuncio.
      const r1 = await as('r1', () => requestContactUnlockFlow(listingId, { gateway }));
      if (!r1.success || !r1.pix) throw new Error(`reserva r1 falhou: ${JSON.stringify(r1)}`);
      expect(await as('owner', () => pauseListing(listingId))).toMatchObject({ success: true });

      // 10. Pausado (PD-6.11): o Pix nao e reapresentado; o detalhe publico some.
      const pausedPix = await as('r1', () => getPixPaymentFlow(r1.contactRequestId, { gateway }));
      expect(pausedPix).toMatchObject({ success: false, reason: 'unavailable' });
      expect(await as('r1', () => getOwnContactRequest(r1.contactRequestId))).toMatchObject({
        phase: 'awaiting_payment',
        listingStatus: 'paused',
      });
      expect((await as('third', () => getContactRequestEntryView(listingId))).state).toBe(
        'listing_unavailable',
      );

      // 11. ...mas o pagamento ja acreditado dentro da janela confirma (PD-6.11, item 2).
      const r1Attempt = await attemptOf(r1.contactRequestId);
      accredit(r1Attempt.providerOrderId!, new Date());
      expect(
        (await handleMercadoPagoWebhook(notification(r1Attempt.providerOrderId!), { gateway }))
          .status,
      ).toBe(200);
      expect(await as('r1', () => getOwnContactRequest(r1.contactRequestId))).toMatchObject({
        phase: 'paid',
      });

      // 12. Dono ve as duas solicitacoes pagas elegiveis: so nome e data.
      const options = await as('owner', () => getSelectionOptions(listingId));
      if (!options.success) throw new Error('opcoes do dono falharam');
      expect(options.options.candidates.map((c) => c.requesterDisplayName)).toEqual([
        names.r0,
        names.r1,
      ]);
      const serialized = JSON.stringify(options);
      for (const tag of ['r0', 'r1']) expect(serialized).not.toContain(email(tag));
      expect(serialized).not.toMatch(/ORDSIM|PAYSIM|SIMULADO/);

      // 13. Atores nao autorizados nao leem as opcoes nem escolhem.
      for (const actor of ['third', 'r0', 'r1', 'anon']) {
        const read = await as(actor, () => getSelectionOptions(listingId));
        expect(read.success).toBe(false);
        expect(JSON.stringify(read)).not.toContain(names.r0);
        const choose = await as(actor, () =>
          selectRequester({ listingId, contactRequestId: r0.contactRequestId, confirmed: true }),
        );
        expect(choose).toMatchObject({ success: false });
        expect(['not_found', 'login_required']).toContain((choose as { reason: string }).reason);
      }
      expect(await prisma().selection.count({ where: { listingId } })).toBe(0);

      // 14. Sem confirmacao explicita, nada acontece.
      expect(
        await as('owner', () =>
          selectRequester({ listingId, contactRequestId: r0.contactRequestId, confirmed: false }),
        ),
      ).toMatchObject({ success: false, reason: 'confirmation_required' });

      // 15. Escolha confirmada (primeira escolha vale com o anuncio pausado).
      expect(
        await as('owner', () =>
          selectRequester({ listingId, contactRequestId: r0.contactRequestId, confirmed: true }),
        ),
      ).toMatchObject({ success: true, kind: 'selection', changed: true });
      const after = await as('owner', () => getSelectionOptions(listingId));
      expect(after).toMatchObject({
        success: true,
        options: {
          blockedBy: 'negotiation_active',
          activeNegotiation: { chosenDisplayName: names.r0 },
        },
      });

      // 16. So o escolhido tem a liberacao e recebe o contato.
      const r0Releases = await as('r0', () => listOwnContactReleases());
      expect(r0Releases!.map((r) => r.listingId)).toEqual([listingId]);
      expect(await as('r0', () => revealContact(r0Releases![0].contactReleaseId))).toEqual({
        success: true,
        phone: OWNER_E164,
      });
      expect(await as('r1', () => listOwnContactReleases())).toEqual([]);
      for (const actor of ['r1', 'third', 'owner', 'anon']) {
        const denied = await as(actor, () => revealContact(r0Releases![0].contactReleaseId));
        expect(denied.success).toBe(false);
        expect(JSON.stringify(denied)).not.toContain(OWNER_E164.slice(3));
      }
      // O solicitante pago nao escolhido continua so com o acompanhamento.
      expect(await as('r1', () => getOwnContactRequest(r1.contactRequestId))).toMatchObject({
        phase: 'paid',
      });

      // Nenhum aviso transacional carrega o contato (CR-6.1).
      for (const [message] of sentEmails.send.mock.calls) {
        expect(JSON.stringify(message)).not.toContain(OWNER_E164.slice(3));
      }
    });
  },
);
