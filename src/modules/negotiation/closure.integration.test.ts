// @vitest-environment node
// Better Auth e PostgreSQL reais, dados sinteticos e banco descartavel.
// A corrida observa duas conexoes esperando na trava antes de libera-la.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ListingStatus, Prisma } from '@/generated/prisma/client';
import {
  deliverAuthorizedContact,
  listOwnContactReleases,
  registerOwnContact,
} from '@/modules/contact';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { createDraftListing } from '@/modules/listing/actions';
import { createContactRequest } from '@/modules/request';
import { getPrismaClient } from '@/persistence/prisma';
import { closeNegotiation } from './actions';
import {
  getOwnNegotiation,
  listOwnedListingNegotiations,
  type CloseNegotiationResult,
} from './closure';
import { verifyContactReleaseChain } from './delivery-chain';
import { selectRequester, type SelectionResult } from './selection';

const cookieStore = new AsyncLocalStorage<string>();
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: cookieStore.getStore() ?? '' }),
}));
vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('@/modules/identity/email-transport', () => ({
  sendTransactionalEmail: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const PHONE = '+5511912345678';
const userIds: string[] = [];
const ids: Record<string, string> = {};
const cookies: Record<string, string> = {};
const prisma = () => getPrismaClient();
const email = (tag: string) => `it-closure-${tag}-${RUN_ID}@example.test`;

function as<T>(tag: string, fn: () => Promise<T>): Promise<T> {
  return cookieStore.run(cookies[tag] ?? '', fn);
}

async function createUser(tag: string): Promise<void> {
  expect(
    await registerUser({
      displayName: `Pessoa ${tag}`,
      email: email(tag),
      password: PASSWORD,
      over18: true,
      termsAccepted: true,
    }),
  ).toMatchObject({ success: true });
  const user = await prisma().user.findFirstOrThrow({ where: { email: email(tag) } });
  ids[tag] = user.id;
  userIds.push(user.id);
  await prisma().user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  const signed = await getAuth().api.signInEmail({
    body: { email: email(tag), password: PASSWORD },
    headers: new Headers({ 'user-agent': 'agente-sintetico/1.0' }),
    returnHeaders: true,
  });
  cookies[tag] = signed.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
  expect(cookies[tag]).toContain('session_token=');
}

async function listing(): Promise<string> {
  const result = await as('owner', () =>
    createDraftListing({
      title: 'Bicicleta sintetica',
      description: 'Anuncio sintetico de integracao.',
      city: 'Recife',
      state: 'PE',
    }),
  );
  expect(result.success).toBe(true);
  const id = result.listingId!;
  await prisma().listing.update({ where: { id }, data: { status: 'published' } });
  return id;
}

/** Reserva real; semeia apenas o fato financeiro confirmado por #96. */
async function paidRequest(listingId: string, tag: string): Promise<string> {
  const reserved = await as(tag, () => createContactRequest(listingId));
  expect(reserved.success).toBe(true);
  if (!reserved.success) throw new Error('reserva_sintetica_recusada');
  const at = new Date();
  await prisma().$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUniqueOrThrow({
      where: { contactRequestId: reserved.contactRequestId },
    });
    await tx.payment.create({
      data: {
        paymentAttemptId: attempt.id,
        providerPaymentId: `closure-${RUN_ID}-${randomUUID()}`,
        amountCents: 99,
        providerStatus: 'processed',
        providerStatusDetail: 'accredited',
        accreditedAt: at,
        isCanonical: true,
      },
    });
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'pagamento_confirmado',
        accreditedAt: at,
        recognizedAt: at,
        recognitionSource: 'notificacao',
      },
    });
    await tx.contactRequest.update({
      where: { id: reserved.contactRequestId },
      data: { status: 'paid', paidAt: at },
    });
  });
  return reserved.contactRequestId;
}

async function selected(): Promise<{
  listingId: string;
  requestId: string;
  negotiationId: string;
}> {
  const listingId = await listing();
  const requestId = await paidRequest(listingId, 'chosen');
  const result = await as('owner', () =>
    selectRequester({
      listingId,
      contactRequestId: requestId,
      confirmed: true,
    }),
  );
  expect(result.success).toBe(true);
  if (!result.success) throw new Error('escolha_sintetica_recusada');
  return { listingId, requestId, negotiationId: result.negotiationId };
}

const close = (negotiationId: string, tag = 'owner', confirmed = true) =>
  as(tag, () => closeNegotiation({ negotiationId, confirmed }));

async function untouched(listingId: string) {
  const [item, requests, payments, attempts, selections, releases, refunds] = await Promise.all([
    prisma().listing.findUniqueOrThrow({ where: { id: listingId } }),
    prisma().contactRequest.findMany({ where: { listingId }, orderBy: { id: 'asc' } }),
    prisma().payment.findMany({
      where: { paymentAttempt: { contactRequest: { listingId } } },
      orderBy: { id: 'asc' },
    }),
    prisma().paymentAttempt.findMany({
      where: { contactRequest: { listingId } },
      orderBy: { id: 'asc' },
    }),
    prisma().selection.findMany({ where: { listingId }, orderBy: { id: 'asc' } }),
    prisma().contactRelease.findMany({ where: { listingId }, orderBy: { id: 'asc' } }),
    prisma().technicalRefund.findMany({
      where: { payment: { paymentAttempt: { contactRequest: { listingId } } } },
    }),
  ]);
  return { item, requests, payments, attempts, selections, releases, refunds };
}

async function closureEvents(negotiationId: string) {
  return prisma().auditEvent.findMany({
    where: { eventType: 'negotiation.closed', targetId: negotiationId },
  });
}

/** Snapshot fresco por autocommit, sem soltar a trava da transacao holder. */
async function waitForBlockedBackends(expected: number): Promise<Set<number>> {
  let waiters = new Set<number>();
  for (let attempt = 0; attempt < 50 && waiters.size < expected; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const rows = await prisma().$queryRaw<{ pid: number }[]>`
      SELECT "pid" FROM pg_stat_activity
      WHERE "datname" = current_database() AND "wait_event_type" = 'Lock'
        AND "pid" <> pg_backend_pid()`;
    waiters = new Set(rows.map((row) => row.pid));
  }
  return waiters;
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'encerramento real, historico e reselecao (#163)',
  () => {
    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
      for (const tag of ['owner', 'chosen', 'other', 'third']) await createUser(tag);
      expect(await as('owner', () => registerOwnContact({ phone: PHONE }))).toMatchObject({
        success: true,
      });
    });

    afterAll(async () => {
      await prisma()
        .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "it_closure_audit_failure"`;
      const owned = {
        listingId: {
          in: (
            await prisma().listing.findMany({
              where: { ownerId: { in: userIds } },
              select: { id: true },
            })
          ).map((row) => row.id),
        },
      };
      await prisma().contactAccessEvent.deleteMany({ where: { contactRelease: owned } });
      await prisma().contactRelease.deleteMany({ where: owned });
      await prisma().negotiation.deleteMany({ where: owned });
      await prisma().selection.deleteMany({ where: owned });
      await prisma().payment.deleteMany({ where: { paymentAttempt: { contactRequest: owned } } });
      await prisma().paymentAttempt.deleteMany({ where: { contactRequest: owned } });
      await prisma().contactRequest.deleteMany({ where: owned });
      await prisma().listingTransition.deleteMany({ where: owned });
      await prisma().listing.deleteMany({ where: { id: owned.listingId } });
      await prisma().auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma().session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().account.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().verification.deleteMany({
        where: { OR: [{ identifier: { in: userIds } }, { identifier: { contains: RUN_ID } }] },
      });
      await prisma().termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().userContact.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().user.deleteMany({ where: { id: { in: userIds } } });
      await prisma().$disconnect();
      vi.unstubAllEnvs();
    });

    it.each(['owner', 'chosen'])(
      'participante %s encerra; retry preserva instante e uma auditoria',
      async (tag) => {
        const { listingId, negotiationId } = await selected();
        const before = await untouched(listingId);
        const result = await close(negotiationId, tag);
        expect(result).toMatchObject({ success: true, negotiationId, changed: true });
        if (!result.success) throw new Error('encerramento_recusado');
        const row = await prisma().negotiation.findUniqueOrThrow({ where: { id: negotiationId } });
        expect(row).toMatchObject({ status: 'closed', closedById: ids[tag] });
        expect(row.closedAt!.toISOString()).toBe(result.closedAt);
        expect(await close(negotiationId, tag)).toEqual({ ...result, changed: false });
        expect(await untouched(listingId)).toEqual(before);
        const events = await closureEvents(negotiationId);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          actorId: ids[tag],
          result: 'success',
          occurredAt: row.closedAt,
          details: { listingId, previousStatus: 'active', newStatus: 'closed', role: tag },
        });
        expect(JSON.stringify(events)).not.toContain(PHONE);
        await expect(
          prisma().negotiation.update({
            where: { id: negotiationId },
            data: { status: 'active', closedAt: null, closedById: null },
          }),
        ).rejects.toThrow();
      },
    );

    it.each(['published', 'paused', 'closed', 'removed'] as ListingStatus[])(
      'funciona com anuncio %s sem mudar efeitos da cadeia',
      async (status) => {
        const { listingId, negotiationId } = await selected();
        if (status !== 'published')
          await prisma().listing.update({ where: { id: listingId }, data: { status } });
        const before = await untouched(listingId);
        expect(await close(negotiationId, 'chosen')).toMatchObject({
          success: true,
          changed: true,
        });
        expect(await untouched(listingId)).toEqual(before);
      },
    );

    it('terceiro, solicitante nao escolhido e inexistente recebem a mesma negativa', async () => {
      const { listingId, negotiationId } = await selected();
      await paidRequest(listingId, 'other');
      const missing = await close(randomUUID(), 'owner');
      expect(await close(negotiationId, 'third')).toEqual(missing);
      expect(await close(negotiationId, 'other')).toEqual(missing);
      expect(await as('third', () => getOwnNegotiation(negotiationId))).toEqual(missing);
      expect(await as('other', () => listOwnedListingNegotiations(listingId))).toEqual(missing);
      expect(await close(negotiationId, 'owner', false)).toMatchObject({
        reason: 'confirmation_required',
      });
      expect(await close(negotiationId, 'anonymous')).toMatchObject({ reason: 'login_required' });
      expect(await closureEvents(negotiationId)).toHaveLength(0);
      expect(
        (await prisma().negotiation.findUniqueOrThrow({ where: { id: negotiationId } })).status,
      ).toBe('active');
    });

    it.each(['unverified', 'blocked_age', 'blocked_admin', 'deletion_requested'])(
      'estado %s recusa a parte real autenticada',
      async (status) => {
        const { negotiationId } = await selected();
        await prisma().user.update({
          where: { id: ids.chosen },
          data:
            status === 'unverified'
              ? { emailVerified: false }
              : { status: status as 'blocked_age' | 'blocked_admin' | 'deletion_requested' },
        });
        try {
          expect(await close(negotiationId, 'chosen')).toMatchObject({
            success: false,
            reason: status === 'unverified' ? 'email_unverified' : 'account_restricted',
          });
          expect(await closureEvents(negotiationId)).toHaveLength(0);
        } finally {
          await prisma().user.update({
            where: { id: ids.chosen },
            data: { status: 'active', emailVerified: true },
          });
        }
      },
    );

    it('duas conexoes esperando na trava: apenas uma encerra e a outra recebe o estado fechado', async () => {
      const { listingId, negotiationId } = await selected();
      let pending!: Promise<CloseNegotiationResult[]>;
      let waiters = new Set<number>();
      await prisma().$transaction(
        async (tx: Prisma.TransactionClient) => {
          await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${listingId}::uuid FOR UPDATE`;
          pending = Promise.all([close(negotiationId, 'owner'), close(negotiationId, 'chosen')]);
          for (let attempt = 0; attempt < 50 && waiters.size < 2; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            // pg_stat_activity conserva o primeiro snapshot dentro da transacao.
            // Consulta em autocommit fora do holder para observar esperas novas,
            // enquanto tx continua segurando a mesma trava do anuncio.
            const rows = await prisma().$queryRaw<{ pid: number }[]>`
            SELECT "pid" FROM pg_stat_activity
            WHERE "datname" = current_database() AND "wait_event_type" = 'Lock'
              AND "pid" <> pg_backend_pid()`;
            waiters = new Set(rows.map((row) => row.pid));
          }
        },
        { timeout: 30_000, maxWait: 10_000 },
      );
      expect(waiters.size).toBe(2);
      const results = await pending;
      expect(results.every((result) => result.success)).toBe(true);
      expect(results.filter((result) => result.success && result.changed)).toHaveLength(1);
      expect(results.filter((result) => result.success && !result.changed)).toHaveLength(1);
      expect((results[0] as { closedAt: string }).closedAt).toBe(
        (results[1] as { closedAt: string }).closedAt,
      );
      expect(await closureEvents(negotiationId)).toHaveLength(1);
    });

    it.each(['closure_first', 'selection_first'] as const)(
      'encerramento versus reselecao concorrentes: %s espera primeiro na trava',
      async (order) => {
        const { listingId, negotiationId } = await selected();
        const nextRequestId = await paidRequest(listingId, 'other');
        const before = await untouched(listingId);
        let closing!: Promise<CloseNegotiationResult>;
        let selecting!: Promise<SelectionResult>;
        let firstWaiter = new Set<number>();
        let bothWaiters = new Set<number>();
        const chooseNext = () =>
          as('owner', () =>
            selectRequester({ listingId, contactRequestId: nextRequestId, confirmed: true }),
          );

        await prisma().$transaction(
          async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${listingId}::uuid FOR UPDATE`;
            if (order === 'closure_first') {
              closing = close(negotiationId, 'chosen');
              firstWaiter = await waitForBlockedBackends(1);
              expect(firstWaiter.size).toBe(1);
              selecting = chooseNext();
            } else {
              selecting = chooseNext();
              firstWaiter = await waitForBlockedBackends(1);
              expect(firstWaiter.size).toBe(1);
              closing = close(negotiationId, 'chosen');
            }
            // A segunda operacao so comeca depois de observar a primeira
            // esperando. As duas estao em conexoes distintas antes do COMMIT.
            bothWaiters = await waitForBlockedBackends(2);
          },
          { timeout: 30_000, maxWait: 10_000 },
        );
        expect(bothWaiters.size).toBe(2);
        expect([...firstWaiter].every((pid) => bothWaiters.has(pid))).toBe(true);
        const [closed, initialSelection] = await Promise.all([closing, selecting]);
        expect(closed).toMatchObject({ success: true, negotiationId, changed: true });
        expect(await closureEvents(negotiationId)).toHaveLength(1);
        expect(
          await prisma().negotiation.findUniqueOrThrow({ where: { id: negotiationId } }),
        ).toMatchObject({ status: 'closed', closedById: ids.chosen });
        expect(
          await prisma().negotiation.count({ where: { listingId, status: 'active' } }),
        ).toBeLessThanOrEqual(1);

        let selectedNext = initialSelection;
        if (order === 'selection_first') {
          expect(initialSelection).toMatchObject({ success: false, reason: 'negotiation_active' });
          expect(await untouched(listingId)).toEqual(before);
          // A recusa nao consome o candidato: o mesmo pedido pago segue
          // elegivel quando o encerramento concorrente ja foi confirmado.
          selectedNext = await chooseNext();
        }
        expect(selectedNext).toMatchObject({ success: true, kind: 'reselection', changed: true });
        if (!selectedNext.success) throw new Error('reselecao_concorrente_recusada');
        expect(selectedNext.negotiationId).not.toBe(negotiationId);
        expect(await prisma().negotiation.count({ where: { listingId, status: 'active' } })).toBe(
          1,
        );

        const after = await untouched(listingId);
        expect(after.item).toEqual(before.item);
        expect(after.requests).toEqual(before.requests);
        expect(after.payments).toEqual(before.payments);
        expect(after.attempts).toEqual(before.attempts);
        expect(after.refunds).toEqual(before.refunds);
        expect(after.selections.filter((row) => row.contactRequestId !== nextRequestId)).toEqual(
          before.selections,
        );
        expect(after.releases.filter((row) => row.negotiationId === negotiationId)).toEqual(
          before.releases,
        );
        expect(after.selections).toHaveLength(2);
        expect(after.releases).toHaveLength(2);
        expect(await closureEvents(negotiationId)).toHaveLength(1);
        expect(await close(negotiationId, 'owner')).toMatchObject({
          success: true,
          changed: false,
        });
        const oldRelease = before.releases.find((row) => row.negotiationId === negotiationId)!;
        expect(
          await as('chosen', () =>
            deliverAuthorizedContact(oldRelease.id, verifyContactReleaseChain),
          ),
        ).toEqual({ success: true, phone: PHONE });
      },
    );

    it('falha da auditoria desfaz fechamento; retry conclui uma unica vez', async () => {
      const { negotiationId } = await selected();
      await prisma()
        .$executeRawUnsafe(`ALTER TABLE "audit_events" ADD CONSTRAINT "it_closure_audit_failure"
        CHECK ("event_type" <> 'negotiation.closed') NOT VALID`);
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect(await close(negotiationId)).toMatchObject({ success: false, reason: 'error' });
        expect(
          await prisma().negotiation.findUniqueOrThrow({ where: { id: negotiationId } }),
        ).toMatchObject({
          status: 'active',
          closedAt: null,
          closedById: null,
        });
        expect(await closureEvents(negotiationId)).toHaveLength(0);
      } finally {
        await prisma()
          .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT "it_closure_audit_failure"`;
        log.mockRestore();
      }
      expect(await close(negotiationId)).toMatchObject({ success: true, changed: true });
      expect(await closureEvents(negotiationId)).toHaveLength(1);
    });

    it('encerramento real permite reselecao e mantem historico e contato do escolhido anterior', async () => {
      const { listingId, negotiationId } = await selected();
      const nextRequestId = await paidRequest(listingId, 'other');
      expect(await close(negotiationId, 'chosen')).toMatchObject({ success: true });
      const next = await as('owner', () =>
        selectRequester({
          listingId,
          contactRequestId: nextRequestId,
          confirmed: true,
        }),
      );
      expect(next).toMatchObject({ success: true, changed: true, kind: 'reselection' });
      if (!next.success) throw new Error('reselecao_recusada');
      expect(next.negotiationId).not.toBe(negotiationId);
      expect(await as('chosen', () => getOwnNegotiation(negotiationId))).toMatchObject({
        success: true,
        negotiation: { status: 'closed', role: 'chosen', counterpartDisplayName: 'Pessoa owner' },
      });
      const history = await as('owner', () => listOwnedListingNegotiations(listingId));
      expect(history.success).toBe(true);
      if (!history.success) throw new Error('historico_recusado');
      expect(history.negotiations).toHaveLength(2);
      expect(history.negotiations.map((row) => row.status).sort()).toEqual(['active', 'closed']);
      expect(JSON.stringify(history)).not.toMatch(/@example\.test|phone|ownerId|chosenId|payment/i);
      const releases = await as('chosen', listOwnContactReleases);
      const release = releases!.find((row) => row.negotiationId === negotiationId)!;
      expect(release).toBeDefined();
      expect(
        await as('chosen', () =>
          deliverAuthorizedContact(release.contactReleaseId, verifyContactReleaseChain),
        ),
      ).toEqual({
        success: true,
        phone: PHONE,
      });
      expect(await as('other', () => getOwnNegotiation(negotiationId))).toMatchObject({
        reason: 'not_found',
      });
    });
  },
);
