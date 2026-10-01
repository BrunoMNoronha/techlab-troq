// @vitest-environment node
//
// Prova de integracao de F3-005 (#95): passos 2 e 3 de PD-4.1 contra o Better
// Auth REAL, PostgreSQL REAL e descartavel e um provedor SIMULADO local
// (`node:http`) que guarda as orders POR `X-Idempotency-Key`, como o Mercado
// Pago faz (spike F0-010, exp. 3). Nenhuma chamada sai da maquina.
//
// T-15: a resposta da criacao e PERDIDA depois de o provedor criar a order (o
// socket cai); a tentativa fica `tentativa_criada`, e a retentativa com a MESMA
// chave recebe a MESMA order e conclui o passo 3 — uma unica order no provedor.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1 (testing.md, 2.2).
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListingStatus } from '@/generated/prisma/client';
import { registerOwnContact } from '@/modules/contact';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { createDraftListing, pauseListing } from '@/modules/listing/actions';
import { createMercadoPagoClient } from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';
import { getPixPaymentFlow, requestContactUnlockFlow } from './charge-flow';

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

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const TOKEN = 'TEST-sintetico-cobranca-000000';
const email = (tag: string) => `it-cobranca-${tag}-${RUN_ID}@example.test`;
const prisma = () => getPrismaClient();

const userIds: string[] = [];
const cookies: Record<string, string> = {};

// ---------------------------------------------------------------------------
// Provedor simulado
// ---------------------------------------------------------------------------

interface SimOrder {
  id: string;
  external_reference: string;
  status: string;
  status_detail: string;
  total_amount: string;
  transactions: { payments: Record<string, unknown>[] };
  created_date: string;
}

interface SimRequest {
  method: string;
  url: string;
  key: string | undefined;
  body: string;
}

const sim = {
  byKey: new Map<string, SimOrder>(),
  byId: new Map<string, SimOrder>(),
  requests: [] as SimRequest[],
  /** Proxima criacao: normal, 503 ou "cria e derruba o socket". */
  nextCreate: 'ok' as 'ok' | 'unavailable' | 'drop',
  counter: 0,
};

function durationMs(iso: string): number {
  const match = /^PT(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) throw new Error(`duracao inesperada: ${iso}`);
  return (Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)) * 1000;
}

function newOrder(body: Record<string, unknown>): SimOrder {
  sim.counter += 1;
  const n = `${RUN_ID.replace(/\D/g, '').slice(-8)}${sim.counter}`;
  const payment = (body.transactions as { payments: Record<string, unknown>[] }).payments[0];
  const expires = new Date(Date.now() + durationMs(String(payment.expiration_time)));
  return {
    id: `ORDSIM${n}`,
    external_reference: String(body.external_reference),
    status: 'action_required',
    status_detail: 'waiting_transfer',
    total_amount: String(body.total_amount),
    created_date: new Date().toISOString(),
    transactions: {
      payments: [
        {
          id: `PAYSIM${n}`,
          amount: String(payment.amount),
          status: 'action_required',
          status_detail: 'waiting_transfer',
          date_of_expiration: expires.toISOString(),
          payment_method: {
            id: 'pix',
            type: 'bank_transfer',
            qr_code: `000201SIMULADO${n}`,
            qr_code_base64: 'iVBORw0KGgo=',
            ticket_url: `https://example.test/ticket/${n}`,
          },
        },
      ],
    },
  };
}

function reply(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function handle(req: IncomingMessage, res: ServerResponse, raw: string) {
  const key = req.headers['x-idempotency-key'] as string | undefined;
  sim.requests.push({ method: req.method!, url: req.url!, key, body: raw });
  if (req.method === 'POST' && req.url === '/v1/orders') {
    const mode = sim.nextCreate;
    sim.nextCreate = 'ok';
    if (mode === 'unavailable') return reply(res, 503, { errors: [{ code: 'internal_error' }] });
    let order = key ? sim.byKey.get(key) : undefined;
    if (!order) {
      order = newOrder(JSON.parse(raw));
      if (key) sim.byKey.set(key, order);
      sim.byId.set(order.id, order);
    }
    // A order foi criada, mas a resposta se perde: o adaptador ve queda de rede.
    if (mode === 'drop') return req.socket.destroy();
    return reply(res, 201, order);
  }
  const get = /^\/v1\/orders\/([^/]+)$/.exec(req.url ?? '');
  if (req.method === 'GET' && get) {
    const order = sim.byId.get(decodeURIComponent(get[1]));
    return order
      ? reply(res, 200, order)
      : reply(res, 404, { errors: [{ code: 'order_not_found' }] });
  }
  return reply(res, 404, {});
}

let server: Server;
let gateway: ReturnType<typeof createMercadoPagoClient>;

const creates = () => sim.requests.filter((r) => r.method === 'POST' && r.url === '/v1/orders');

// ---------------------------------------------------------------------------
// Usuarios, sessoes e anuncios
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
  await prisma().listing.update({ where: { id }, data: { status: 'published' as ListingStatus } });
  return id;
}

async function attemptOf(contactRequestId: string) {
  return prisma().paymentAttempt.findUniqueOrThrow({ where: { contactRequestId } });
}

async function audits(eventType: string, attemptId: string) {
  return prisma().auditEvent.findMany({
    where: { eventType, targetId: attemptId },
    orderBy: { occurredAt: 'asc' },
  });
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'cobranca Pix da reserva: passos 2 e 3 contra PostgreSQL descartavel (#95)',
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
      gateway = createMercadoPagoClient({ baseUrl: `http://127.0.0.1:${port}`, timeoutMs: 2_000 });

      for (const tag of ['owner', 'r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'other']) {
        await createUser(tag);
        cookies[tag] = await signIn(tag);
      }
      // DEC-040: sem contato do anunciante, o anuncio nao aceita solicitacao.
      expect(await as('owner', () => registerOwnContact({ phone: '(11) 91234-5678' }))).toEqual({
        success: true,
        hasContact: true,
      });
    });

    beforeEach(() => {
      sim.nextCreate = 'ok';
      vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', TOKEN);
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
      const listings = await prisma().listing.findMany({
        where: { ownerId: { in: userIds } },
        select: { id: true },
      });
      const listingIds = listings.map((l) => l.id);
      await prisma()
        .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "it_f3005_block_audit"`;
      await prisma().auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma().paymentAttempt.deleteMany({
        where: { contactRequest: { listingId: { in: listingIds } } },
      });
      await prisma().contactRequest.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().listingTransition.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().listing.deleteMany({ where: { id: { in: listingIds } } });
      await prisma().verification.deleteMany({
        where: {
          OR: [
            { identifier: { in: userIds.map((id) => `email-verification:${id}`) } },
            { identifier: { startsWith: 'login-failure:' } },
          ],
        },
      });
      await prisma().termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().userContact.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().user.deleteMany({ where: { id: { in: userIds } } });
      await prisma().$disconnect();
      vi.unstubAllEnvs();
    });

    it('reserva e cobra: corpo exato, chave persistida, aguardando_pagamento e auditoria sem dado sensivel', async () => {
      const listingId = await publishedListing();
      const before = creates().length;
      const res = await as('r0', () => requestContactUnlockFlow(listingId, { gateway }));
      if (!res.success || !res.pix) throw new Error(`esperava Pix: ${JSON.stringify(res)}`);
      expect(res.pix.copyPaste).toMatch(/^000201SIMULADO/);

      const attempt = await attemptOf(res.contactRequestId);
      expect(attempt.status).toBe('aguardando_pagamento');
      const [sent] = creates().slice(before);
      expect(sent.key).toBe(attempt.idempotencyKey);
      const body = JSON.parse(sent.body);
      expect(body.total_amount).toBe('0.99');
      expect(body.transactions.payments[0].amount).toBe('0.99');
      expect(body.external_reference).toBe(attempt.externalReference);
      expect(body.transactions.payments[0].expiration_time).toBe('PT30M');
      expect(sent.body).not.toContain('notification_url');
      expect(attempt.providerOrderId).toBe(sim.byKey.get(attempt.idempotencyKey)!.id);

      const [created] = await audits('payment.charge_created', attempt.id);
      expect(created.details).toMatchObject({
        origin: 'initial',
        providerOrderId: attempt.providerOrderId,
      });
      // δ de PD-3.2: a cobranca nunca expira antes da reserva.
      expect((created.details as { expiryDeltaMs: number }).expiryDeltaMs).toBeGreaterThanOrEqual(
        0,
      );
      const text = JSON.stringify(
        await prisma().auditEvent.findMany({ where: { targetId: attempt.id } }),
      );
      expect(text).not.toContain(res.pix.copyPaste);
      expect(text).not.toContain('@example.test');
    });

    it('T-15: resposta perdida depois de criar a order; a retentativa usa a mesma chave e a mesma order', async () => {
      const listingId = await publishedListing();
      sim.nextCreate = 'drop';
      const first = await as('r1', () => requestContactUnlockFlow(listingId, { gateway }));
      if (!first.success) throw new Error('a reserva devia existir');
      expect(first.pix).toBeNull();

      const attempt = await attemptOf(first.contactRequestId);
      expect(attempt.status).toBe('tentativa_criada');
      expect(attempt.providerOrderId).toBeNull();
      expect(sim.byKey.has(attempt.idempotencyKey)).toBe(true);
      const [failed] = await audits('payment.charge_failed', attempt.id);
      expect(failed.details).toMatchObject({ kind: 'unavailable', code: 'network' });

      const retry = await as('r1', () => getPixPaymentFlow(first.contactRequestId, { gateway }));
      if (!retry.success || !retry.pix) throw new Error(`esperava Pix: ${JSON.stringify(retry)}`);
      const keyed = creates().filter((r) => r.key === attempt.idempotencyKey);
      expect(keyed).toHaveLength(2);
      const orders = [...sim.byId.values()].filter(
        (o) => o.external_reference === attempt.externalReference,
      );
      expect(orders).toHaveLength(1);
      const done = await attemptOf(first.contactRequestId);
      expect(done).toMatchObject({ status: 'aguardando_pagamento', providerOrderId: orders[0].id });
      const [created] = await audits('payment.charge_created', attempt.id);
      expect(created.details).toMatchObject({ origin: 'retry' });
      // A reserva nao foi prorrogada por nenhuma falha (PE-4.7).
      const request = await prisma().contactRequest.findUniqueOrThrow({
        where: { id: first.contactRequestId },
      });
      expect(request.reservedUntil.toISOString()).toBe(first.reservedUntil);
    });

    it('falha local no passo 3: a tentativa fica pendente e a retentativa conclui sem nova order', async () => {
      const listingId = await publishedListing();
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await prisma().$executeRawUnsafe(
        `ALTER TABLE "audit_events" ADD CONSTRAINT "it_f3005_block_audit"
         CHECK ("event_type" <> 'payment.charge_created') NOT VALID`,
      );
      let contactRequestId = '';
      try {
        const first = await as('r2', () => requestContactUnlockFlow(listingId, { gateway }));
        if (!first.success) throw new Error('a reserva devia existir');
        expect(first.pix).toBeNull();
        contactRequestId = first.contactRequestId;
        expect((await attemptOf(contactRequestId)).status).toBe('tentativa_criada');
      } finally {
        await prisma()
          .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT "it_f3005_block_audit"`;
        spy.mockRestore();
      }
      const attempt = await attemptOf(contactRequestId);
      const retry = await as('r2', () => getPixPaymentFlow(contactRequestId, { gateway }));
      expect(retry).toMatchObject({ success: true });
      expect(creates().filter((r) => r.key === attempt.idempotencyKey)).toHaveLength(2);
      expect(
        [...sim.byId.values()].filter((o) => o.external_reference === attempt.externalReference),
      ).toHaveLength(1);
      expect((await attemptOf(contactRequestId)).status).toBe('aguardando_pagamento');
    });

    it('retentativas concorrentes convergem para uma unica order', async () => {
      const listingId = await publishedListing();
      sim.nextCreate = 'drop';
      const first = await as('r3', () => requestContactUnlockFlow(listingId, { gateway }));
      if (!first.success) throw new Error('a reserva devia existir');
      const results = await Promise.all([
        as('r3', () => getPixPaymentFlow(first.contactRequestId, { gateway })),
        as('r3', () => getPixPaymentFlow(first.contactRequestId, { gateway })),
      ]);
      expect(results.every((r) => r.success)).toBe(true);
      const attempt = await attemptOf(first.contactRequestId);
      expect(attempt.status).toBe('aguardando_pagamento');
      expect(
        [...sim.byId.values()].filter((o) => o.external_reference === attempt.externalReference),
      ).toHaveLength(1);
      expect(await audits('payment.charge_created', attempt.id)).toHaveLength(1);
    });

    it('cobranca ja registrada: reapresenta pelo GET, sem criar outra', async () => {
      const listingId = await publishedListing();
      const first = await as('r4', () => requestContactUnlockFlow(listingId, { gateway }));
      if (!first.success || !first.pix) throw new Error('esperava Pix');
      const before = creates().length;
      const again = await as('r4', () => getPixPaymentFlow(first.contactRequestId, { gateway }));
      if (!again.success || !again.pix) throw new Error('esperava Pix');
      expect(again.pix.copyPaste).toBe(first.pix.copyPaste);
      expect(creates().length).toBe(before);
    });

    it.each([
      ['provedor indisponivel (503)', 'unavailable' as const, 'server_error'],
      ['credencial ausente', 'config' as const, 'configuration'],
    ])('%s: pendente, sem prorrogar e sem aprovar', async (_label, mode, code) => {
      const listingId = await publishedListing();
      if (mode === 'unavailable') sim.nextCreate = 'unavailable';
      else vi.stubEnv('MERCADO_PAGO_ACCESS_TOKEN', '');
      const res = await as('r5', () => requestContactUnlockFlow(listingId, { gateway }));
      if (!res.success) throw new Error('a reserva devia existir');
      expect(res.pix).toBeNull();
      const attempt = await attemptOf(res.contactRequestId);
      expect(attempt.status).toBe('tentativa_criada');
      const request = await prisma().contactRequest.findUniqueOrThrow({
        where: { id: res.contactRequestId },
      });
      expect(request.status).toBe('reserved');
      expect(request.reservedUntil.toISOString()).toBe(res.reservedUntil);
      const [failed] = await audits('payment.charge_failed', attempt.id);
      expect(failed.details).toMatchObject({ code });
      expect(JSON.stringify(failed.details)).not.toContain(TOKEN);
    });

    describe('recusas (PD-11.3, PD-6.11)', () => {
      it('outro usuario, o dono e anonimo nao obtem o Pix nem o estado', async () => {
        const listingId = await publishedListing();
        const res = await as('r0', () => requestContactUnlockFlow(listingId, { gateway }));
        if (!res.success) throw new Error('a reserva devia existir');
        const before = sim.requests.length;
        for (const tag of ['other', 'owner']) {
          expect(await as(tag, () => getPixPaymentFlow(res.contactRequestId, { gateway }))).toEqual(
            {
              success: false,
              reason: 'unavailable',
              error: 'Esta solicitação não está disponível.',
            },
          );
        }
        expect(
          await cookieStore.run('', () => getPixPaymentFlow(res.contactRequestId, { gateway })),
        ).toMatchObject({ success: false, reason: 'login_required' });
        // Inexistente e malformado: a mesma resposta de "alheio".
        for (const id of ['00000000-0000-4000-8000-000000000000', 'nao-e-uuid']) {
          expect(await as('other', () => getPixPaymentFlow(id, { gateway }))).toMatchObject({
            reason: 'unavailable',
          });
        }
        expect(sim.requests.length).toBe(before);
      });

      it('anuncio pausado: nao reapresenta o QR nem cobra', async () => {
        const listingId = await publishedListing();
        sim.nextCreate = 'unavailable';
        const res = await as('r1', () => requestContactUnlockFlow(listingId, { gateway }));
        if (!res.success) throw new Error('a reserva devia existir');
        expect(await as('owner', () => pauseListing(listingId))).toMatchObject({ success: true });
        const before = sim.requests.length;
        expect(
          await as('r1', () => getPixPaymentFlow(res.contactRequestId, { gateway })),
        ).toMatchObject({
          success: false,
          reason: 'unavailable',
        });
        expect(sim.requests.length).toBe(before);
        // A pausa nao encerra a reserva (PD-6.11).
        const request = await prisma().contactRequest.findUniqueOrThrow({
          where: { id: res.contactRequestId },
        });
        expect(request.status).toBe('reserved');
      });

      it('reserva vencida: recusa sem chamar o provedor', async () => {
        const listingId = await publishedListing();
        const res = await as('r2', () => requestContactUnlockFlow(listingId, { gateway }));
        if (!res.success) throw new Error('a reserva devia existir');
        await prisma().$executeRaw`
          UPDATE "contact_requests"
          SET "reserved_from" = now() - interval '2 hours',
              "reserved_until" = now() - interval '90 minutes'
          WHERE "id" = ${res.contactRequestId}::uuid`;
        const before = sim.requests.length;
        expect(
          await as('r2', () => getPixPaymentFlow(res.contactRequestId, { gateway })),
        ).toMatchObject({
          success: false,
          reason: 'unavailable',
        });
        expect(sim.requests.length).toBe(before);
      });
    });
  },
);
