// @vitest-environment node
//
// Prova de integracao de F3-003 (#93): solicitacao de desbloqueio com reserva
// atomica de vaga contra o Better Auth REAL e PostgreSQL REAL e descartavel
// (payments-design.md, PD-4.1 passo 1 e PD-13 T-1; data-model.md, DM-6.2 a
// DM-6.12; listing-lifecycle.md, secoes 5 e 9).
//
// T-1 e CONCORRENTE de verdade (PD-13.2): uma transacao segura a trava do
// anuncio enquanto N solicitacoes, de N pessoas e em N conexoes do pool, sao
// disparadas; o teste so solta a trava depois de VER, em `pg_stat_activity`, N
// backends distintos esperando por ela. Uma variante sem a trava segurada
// dispara as N livremente.
//
// Sessoes: cada chamada roda num AsyncLocalStorage com o cookie da propria
// pessoa; o unico mock e `headers()` do Next.js.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1 (docs/engineering/
// testing.md, secao 2.2). Dados sinteticos, removidos ao final.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ListingStatus, Prisma } from '@/generated/prisma/client';
import { closeListing } from '@/app/anuncios/actions';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { createDraftListing, pauseListing } from '@/modules/listing/actions';
import { deriveIdempotencyKey, readPersistedIdempotencyKey } from '@/modules/payments';
import { getPrismaClient } from '@/persistence/prisma';
import { getContactRequestEntry } from './entry';
import { createContactRequest, type ContactRequestResult } from './reservation';

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
/** N de T-1: maior que 3 e cabendo no pool (`pg`, max = 10) com a transacao que segura a trava. */
const N = 8;

const email = (tag: string) => `it-reserva-${tag}-${RUN_ID}@example.test`;
const prisma = () => getPrismaClient();

const userIds: string[] = [];
const cookies: Record<string, string> = {};

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
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  expect(cookie).toContain('session_token=');
  return cookie;
}

function as<T>(tag: string, fn: () => Promise<T>): Promise<T> {
  return cookieStore.run(cookies[tag] ?? '', fn);
}

/** Anuncio do dono no estado pedido, pelo caminho legal do gatilho (T1, T3, T5). */
async function listingIn(status: ListingStatus = 'published'): Promise<string> {
  const res = await as('owner', () =>
    createDraftListing({
      title: 'Bicicleta sintetica',
      description: 'Anuncio sintetico de integracao.',
      city: 'Recife',
      state: 'PE',
    }),
  );
  expect(res.success).toBe(true);
  const id = res.listingId!;
  const path: Record<ListingStatus, ListingStatus[]> = {
    draft: [],
    published: ['published'],
    paused: ['published', 'paused'],
    closed: ['published', 'closed'],
    removed: ['published', 'removed'],
  };
  for (const next of path[status]) {
    await prisma().listing.update({ where: { id }, data: { status: next } });
  }
  return id;
}

function requestsOf(listingId: string) {
  return prisma().contactRequest.findMany({
    where: { listingId },
    orderBy: { slotIndex: 'asc' },
    include: { paymentAttempt: true },
  });
}

function auditsOf(eventType: string, targetIds: string[]) {
  return prisma().auditEvent.findMany({ where: { eventType, targetId: { in: targetIds } } });
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'reserva atomica de vaga: Better Auth real contra PostgreSQL descartavel (#93)',
  () => {
    const requesters = Array.from({ length: N }, (_, i) => `r${i}`);

    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');

      for (const tag of ['owner', ...requesters, 'unverified', 'blocked']) {
        await createUser(tag);
        cookies[tag] = await signIn(tag);
      }
      // Sessoes validas emitidas antes; a conta perde a condicao depois do login.
      const [unverifiedId, blockedId] = userIds.slice(-2);
      await prisma().user.update({
        where: { id: unverifiedId },
        data: { emailVerified: false, emailVerifiedAt: null },
      });
      await prisma().user.update({ where: { id: blockedId }, data: { status: 'blocked_admin' } });
    });

    afterAll(async () => {
      const listings = await prisma().listing.findMany({
        where: { ownerId: { in: userIds } },
        select: { id: true },
      });
      const listingIds = listings.map((l) => l.id);
      await prisma()
        .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "it_f3003_block_audit"`;
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
      await prisma().user.deleteMany({ where: { id: { in: userIds } } });
      await prisma().$disconnect();
      vi.unstubAllEnvs();
    });

    describe('T-1: N solicitacoes realmente simultaneas (RB-003, RNF-016)', () => {
      it(`com a trava segurada: ${N} backends distintos esperam e exatamente 3 ocupam vaga`, async () => {
        const listingId = await listingIn('published');
        let pending!: Promise<ContactRequestResult[]>;
        const waiting: number[] = [];

        await prisma().$transaction(
          async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${listingId}::uuid FOR UPDATE`;
            pending = Promise.all(
              requesters.map((tag) => as(tag, () => createContactRequest(listingId))),
            );
            // So solta a trava depois de ver as N transacoes bloqueadas nela.
            for (let i = 0; i < 100 && waiting.length < N; i++) {
              await new Promise((resolve) => setTimeout(resolve, 100));
              const rows = await tx.$queryRaw<{ pid: number }[]>`
                SELECT "pid" FROM pg_stat_activity
                WHERE "datname" = current_database()
                  AND "wait_event_type" = 'Lock'
                  AND "pid" <> pg_backend_pid()`;
              waiting.splice(0, waiting.length, ...rows.map((r) => r.pid));
            }
          },
          { timeout: 30_000, maxWait: 10_000 },
        );

        expect(new Set(waiting).size).toBe(N);
        const results = await pending;
        const ok = results.filter((r) => r.success);
        const refused = results.filter((r) => !r.success);
        expect(ok).toHaveLength(3);
        expect(refused).toHaveLength(N - 3);
        expect(refused.every((r) => !r.success && r.reason === 'no_slots')).toBe(true);

        const rows = await requestsOf(listingId);
        expect(rows.map((r) => [r.slotIndex, r.status])).toEqual([
          [1, 'reserved'],
          [2, 'reserved'],
          [3, 'reserved'],
        ]);
        expect(new Set(rows.map((r) => r.requesterId)).size).toBe(3);
        expect(rows.every((r) => r.paymentAttempt?.status === 'tentativa_criada')).toBe(true);
      });

      it(`sem trava segurada: ${N} disparos livres terminam com exatamente 3 vagas`, async () => {
        const listingId = await listingIn('published');
        const results = await Promise.all(
          requesters.map((tag) => as(tag, () => createContactRequest(listingId))),
        );
        expect(results.filter((r) => r.success)).toHaveLength(3);
        expect(results.filter((r) => !r.success && r.reason === 'no_slots')).toHaveLength(N - 3);
        const occupied = await prisma().contactRequest.count({
          where: { listingId, status: { in: ['reserved', 'paid'] } },
        });
        expect(occupied).toBe(3);
      });
    });

    describe('reserva, tentativa e chave (PD-4.1 passo 1, PD-5)', () => {
      it('cria reserva de 30 min pelo relogio do banco, tentativa com chave persistida e auditoria', async () => {
        const listingId = await listingIn('published');
        const res = await as('r0', () => createContactRequest(listingId));
        expect(res.success).toBe(true);
        if (!res.success) return;

        const [row] = await requestsOf(listingId);
        expect(row).toMatchObject({ id: res.contactRequestId, status: 'reserved', slotIndex: 1 });
        expect(row.reservedUntil.getTime() - row.reservedFrom.getTime()).toBe(30 * 60 * 1000);
        expect(row.reservedUntil.toISOString()).toBe(res.reservedUntil);
        expect(row.createdAt.getTime()).toBe(row.reservedFrom.getTime());

        const attempt = row.paymentAttempt!;
        expect(attempt.status).toBe('tentativa_criada');
        expect(attempt.idempotencyKey).toBe(deriveIdempotencyKey(attempt.id));
        expect(attempt.externalReference).toBe(`troq-pa-${attempt.id}`);
        expect(attempt.providerOrderId).toBeNull();
        // PD-5.2: a retentativa rele a chave persistida.
        const reread = await prisma().$transaction((tx) =>
          readPersistedIdempotencyKey(tx, attempt.id),
        );
        expect(reread).toBe(attempt.idempotencyKey);
        expect(
          await prisma().$transaction((tx) => readPersistedIdempotencyKey(tx, randomUUID())),
        ).toBeNull();

        const [created] = await auditsOf('request.reservation_created', [row.id]);
        expect(created).toMatchObject({ actorId: row.requesterId, result: 'success' });
        expect(created.occurredAt.getTime()).toBe(row.reservedFrom.getTime());
        expect(created.details).toMatchObject({
          listingId,
          slotIndex: 1,
          paymentAttemptId: attempt.id,
        });
        expect(await auditsOf('payment.attempt_created', [attempt.id])).toHaveLength(1);
        // Auditoria sem dado pessoal (DM-11.2).
        expect(JSON.stringify(created.details)).not.toContain('@example.test');
      });

      it('reserva vencida e expirada no ato da alocacao e libera o indice, sem trabalho periodico', async () => {
        const listingId = await listingIn('published');
        for (const tag of ['r0', 'r1', 'r2']) {
          expect((await as(tag, () => createContactRequest(listingId))).success).toBe(true);
        }
        expect(await as('r3', () => createContactRequest(listingId))).toMatchObject({
          reason: 'no_slots',
        });
        // Janela das tres no passado (o CHECK exige reserved_until > reserved_from).
        await prisma().$executeRaw`
          UPDATE "contact_requests"
          SET "reserved_from" = now() - interval '2 hours',
              "reserved_until" = now() - interval '90 minutes'
          WHERE "listing_id" = ${listingId}::uuid`;
        expect(await as('r3', () => getContactRequestEntry(listingId))).toBe('request_available');

        const res = await as('r3', () => createContactRequest(listingId));
        expect(res.success).toBe(true);
        const rows = await requestsOf(listingId);
        expect(rows.filter((r) => r.status === 'expired')).toHaveLength(3);
        const fresh = rows.find((r) => r.status === 'reserved')!;
        expect(fresh.slotIndex).toBe(1);
        const expired = rows.filter((r) => r.status === 'expired').map((r) => r.id);
        const audits = await auditsOf('request.reservation_expired', expired);
        expect(audits).toHaveLength(3);
        expect(
          audits.every((a) => (a.details as { trigger: string }).trigger === 'allocation'),
        ).toBe(true);
        // A tentativa e do modulo `payments`: a expiracao da vaga nao a toca (AR-3.5).
        expect(rows.every((r) => r.paymentAttempt?.status === 'tentativa_criada')).toBe(true);
      });

      it('entrada: sem vaga devolve no_slots, sem revelar quantas pagas existem', async () => {
        const listingId = await listingIn('published');
        for (const tag of ['r0', 'r1', 'r2']) {
          await as(tag, () => createContactRequest(listingId));
        }
        expect(await as('r3', () => getContactRequestEntry(listingId))).toBe('no_slots');
        expect(await as('owner', () => getContactRequestEntry(listingId))).toBe('own_listing');
      });
    });

    describe('T5/T6: encerramento pela action composta (DM-6.10, PD-8.10)', () => {
      it('encerra as reservas sem cobranca, preserva a paga e deixa a tentativa identificavel', async () => {
        const listingId = await listingIn('published');
        await as('r0', () => createContactRequest(listingId));
        await as('r1', () => createContactRequest(listingId));
        // Solicitacao paga como fixture (a confirmacao e de F3-006).
        const paidId = randomUUID();
        await prisma().contactRequest.create({
          data: {
            id: paidId,
            listingId,
            requesterId: userIds[3],
            slotIndex: 3,
            status: 'paid',
            reservedFrom: new Date(Date.now() - 60_000),
            reservedUntil: new Date(Date.now() + 29 * 60_000),
            paidAt: new Date(),
          },
        });

        expect(await as('owner', () => closeListing(listingId))).toEqual({
          success: true,
          status: 'closed',
          changed: true,
        });

        const rows = await requestsOf(listingId);
        expect(rows.map((r) => [r.slotIndex, r.status])).toEqual([
          [1, 'failed'],
          [2, 'failed'],
          [3, 'paid'],
        ]);
        const ended = rows.filter((r) => r.status === 'failed');
        // Identificavel para o cancelamento de PD-8.10: solicitacao `failed` + tentativa nao terminal.
        expect(ended.every((r) => r.paymentAttempt?.status === 'tentativa_criada')).toBe(true);
        const audits = await auditsOf(
          'request.reservation_ended',
          ended.map((r) => r.id),
        );
        expect(audits).toHaveLength(2);
        expect(audits[0].details).toMatchObject({ reason: 'listing_closed', transition: 'T5' });
        const closedAudit = await prisma().auditEvent.findFirstOrThrow({
          where: { eventType: 'listing.closed', targetId: listingId },
        });
        expect(
          audits.every((a) => a.occurredAt.getTime() === closedAudit.occurredAt.getTime()),
        ).toBe(true);

        expect(await as('r2', () => createContactRequest(listingId))).toMatchObject({
          success: false,
          reason: 'unavailable',
        });
      });

      it('T6 a partir de pausado tambem encerra as reservas', async () => {
        const listingId = await listingIn('published');
        await as('r0', () => createContactRequest(listingId));
        expect(await as('owner', () => pauseListing(listingId))).toMatchObject({ success: true });
        // T3 nao encerra a reserva (listing-lifecycle.md, secao 5; PD-6.11).
        expect((await requestsOf(listingId))[0].status).toBe('reserved');
        expect(await as('owner', () => closeListing(listingId))).toMatchObject({ success: true });
        const [row] = await requestsOf(listingId);
        expect(row.status).toBe('failed');
        const [audit] = await auditsOf('request.reservation_ended', [row.id]);
        expect(audit.details).toMatchObject({ transition: 'T6' });
      });

      it('encerramento concorrente com nova solicitacao nunca deixa reserva viva em anuncio closed', async () => {
        for (let round = 0; round < 6; round++) {
          const listingId = await listingIn('published');
          const [close, request] = await Promise.all([
            as('owner', () => closeListing(listingId)),
            as('r0', () => createContactRequest(listingId)),
          ]);
          expect(close).toMatchObject({ success: true, status: 'closed' });
          if (!request.success) expect(request.reason).toBe('unavailable');
          const listing = await prisma().listing.findUniqueOrThrow({ where: { id: listingId } });
          expect(listing.status).toBe('closed');
          expect(
            await prisma().contactRequest.count({ where: { listingId, status: 'reserved' } }),
          ).toBe(0);
        }
      });
    });

    describe('recusas no servidor (listing-lifecycle.md, secao 9)', () => {
      it('anonimo, nao verificado e conta bloqueada sao recusados sem efeito', async () => {
        const listingId = await listingIn('published');
        expect(await cookieStore.run('', () => createContactRequest(listingId))).toMatchObject({
          reason: 'login_required',
        });
        expect(await as('unverified', () => createContactRequest(listingId))).toMatchObject({
          reason: 'email_unverified',
        });
        expect(await as('blocked', () => createContactRequest(listingId))).toMatchObject({
          reason: 'account_restricted',
        });
        expect(await prisma().contactRequest.count({ where: { listingId } })).toBe(0);
      });

      it('o dono nao solicita o proprio anuncio', async () => {
        const listingId = await listingIn('published');
        expect(await as('owner', () => createContactRequest(listingId))).toMatchObject({
          reason: 'own_listing',
        });
        expect(await prisma().contactRequest.count({ where: { listingId } })).toBe(0);
      });

      it('rascunho, pausado, encerrado, inexistente e ID malformado: a mesma resposta', async () => {
        const targets = [
          await listingIn('draft'),
          await listingIn('paused'),
          await listingIn('closed'),
          randomUUID(),
          'nao-e-uuid',
        ];
        const responses = [];
        for (const id of targets) {
          responses.push(await as('r0', () => createContactRequest(id)));
        }
        for (const res of responses) expect(res).toEqual(responses[0]);
        expect(responses[0]).toMatchObject({ success: false, reason: 'unavailable' });
        expect(
          await prisma().contactRequest.count({
            where: { listingId: { in: targets.slice(0, 3) } },
          }),
        ).toBe(0);
      });
    });

    describe('atomicidade', () => {
      it('falha real ao gravar a auditoria desfaz reserva e tentativa', async () => {
        const listingId = await listingIn('published');
        const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await prisma().$executeRawUnsafe(
          `ALTER TABLE "audit_events" ADD CONSTRAINT "it_f3003_block_audit"
           CHECK ("event_type" <> 'request.reservation_created') NOT VALID`,
        );
        try {
          expect(await as('r0', () => createContactRequest(listingId))).toMatchObject({
            success: false,
            reason: 'error',
          });
        } finally {
          await prisma()
            .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT "it_f3003_block_audit"`;
          logSpy.mockRestore();
        }
        expect(await prisma().contactRequest.count({ where: { listingId } })).toBe(0);
        expect(
          await prisma().paymentAttempt.count({ where: { contactRequest: { listingId } } }),
        ).toBe(0);
        expect((await as('r0', () => createContactRequest(listingId))).success).toBe(true);
      });
    });
  },
);
