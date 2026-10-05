// @vitest-environment node
// F4-002 (#164): Better Auth real e PostgreSQL real DESCARTAVEL. A base paga
// e semeada como F3-006; escolha e encerramento usam os comandos reais.
// Apenas headers e transportes de email sao simulados. Nenhum envio real.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { registerOwnContact } from '@/modules/contact';
import { getAuth, registerUser } from '@/modules/identity';
import { createDraftListing } from '@/modules/listing';
import { closeNegotiation, selectRequester } from '@/modules/negotiation';
import { createContactRequest } from '@/modules/request';
import { getPrismaClient } from '@/persistence/prisma';
import { submitRating } from './actions';
import { getOwnRating, getPublicListingReputation } from './ratings';

const cookies = new AsyncLocalStorage<string>();
vi.mock('next/headers', () => ({
  headers: async () => new Headers(cookies.getStore() ? { cookie: cookies.getStore()! } : {}),
}));
vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('@/modules/identity/email-transport', () => ({
  sendTransactionalEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PAYMENT_PREFIX = `it164-${RUN_ID}`;
const PASSWORD = 'senha-sintetica-164';
const userIds: string[] = [];
const db = () => getPrismaClient();
let sequence = 0;
interface Person {
  id: string;
  cookie: string;
}
let stranger: Person;
const as = <T>(person: Person, operation: () => Promise<T>): Promise<T> =>
  cookies.run(person.cookie, operation);

async function person(): Promise<Person> {
  sequence += 1;
  const email = `it164-${sequence}-${RUN_ID}@example.test`;
  expect(
    await registerUser({
      displayName: 'Pessoa sintetica',
      email,
      password: PASSWORD,
      over18: true,
      termsAccepted: true,
    }),
  ).toMatchObject({ success: true });
  const user = await db().user.findFirstOrThrow({ where: { email }, select: { id: true } });
  userIds.push(user.id);
  await db().user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  const result = await getAuth().api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = result.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect(cookie).toContain('session_token=');
  const resultPerson = { id: user.id, cookie };
  expect(
    await as(resultPerson, () => registerOwnContact({ phone: '(11) 91234-5678' })),
  ).toMatchObject({ success: true });
  return resultPerson;
}

async function pair(owner?: Person, chosen?: Person, closed = true) {
  owner ??= await person();
  chosen ??= await person();
  const listing = await as(owner, () =>
    createDraftListing({
      title: 'Bicicleta sintetica',
      description: 'Apenas integracao.',
      city: 'Recife',
      state: 'PE',
    }),
  );
  expect(listing.success).toBe(true);
  const listingId = listing.listingId!;
  // Fixture publicada pelo gatilho existente; o pipeline de imagens e da F2.
  await db().listing.update({ where: { id: listingId }, data: { status: 'published' } });
  const reservation = await as(chosen, () => createContactRequest(listingId));
  expect(reservation.success).toBe(true);
  if (!reservation.success) throw new Error('Fixture de reserva indisponivel');
  const requestId = reservation.contactRequestId;
  const attempt = await db().paymentAttempt.findUniqueOrThrow({
    where: { contactRequestId: requestId },
    select: { id: true },
  });
  sequence += 1;
  const now = new Date();
  // O estado confirmado de F3-006, com fatos financeiros coerentes. Gateway
  // nao e acionado por estes testes de avaliacao.
  await db().$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        paymentAttemptId: attempt.id,
        providerPaymentId: `${PAYMENT_PREFIX}-${sequence}`,
        amountCents: 99,
        providerStatus: 'processed',
        providerStatusDetail: 'accredited',
        accreditedAt: now,
        isCanonical: true,
      },
    });
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'pagamento_confirmado',
        accreditedAt: now,
        recognizedAt: now,
        recognitionSource: 'notificacao',
      },
    });
    await tx.contactRequest.update({
      where: { id: requestId },
      data: { status: 'paid', paidAt: now },
    });
  });
  const selected = await as(owner, () =>
    selectRequester({ listingId, contactRequestId: requestId, confirmed: true }),
  );
  expect(selected.success).toBe(true);
  if (!selected.success) throw new Error('Fixture de escolha indisponivel');
  const negotiationId = selected.negotiationId;
  if (closed) {
    expect(
      await as(owner, () => closeNegotiation({ negotiationId, confirmed: true })),
    ).toMatchObject({ success: true, changed: true });
  }
  return { owner, chosen, listingId, negotiationId };
}

/** Confirma que as chamadas usam backends distintos esperando a mesma trava. */
async function waitForBlockedTransactions(count: number): Promise<void> {
  const limit = Date.now() + 8_000;
  while (Date.now() < limit) {
    const [{ waiting }] = await db().$queryRaw<{ waiting: number }[]>`
      SELECT COUNT(DISTINCT "pid")::int AS "waiting"
      FROM pg_stat_activity
      WHERE "datname" = current_database() AND "wait_event_type" = 'Lock'
        AND "query" LIKE '%negotiations%' AND "query" LIKE '%FOR UPDATE%'`;
    if (waiting >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Nao foram observadas ${count} transacoes concorrentes na trava da negociacao`);
}

async function underNegotiationLock<T>(
  negotiationId: string,
  launch: () => Promise<T>,
  count: number,
): Promise<T> {
  let resolveReady!: () => void;
  let resolveRelease!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const released = new Promise<void>((resolve) => {
    resolveRelease = resolve;
  });
  const holder = db().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "negotiations" WHERE "id" = ${negotiationId}::uuid FOR UPDATE`;
      resolveReady();
      await released;
    },
    { timeout: 20_000 },
  );
  await ready;
  const operations = launch();
  try {
    await waitForBlockedTransactions(count);
  } finally {
    resolveRelease();
    await holder;
  }
  return operations;
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'avaliacoes cegas e reputacao contra banco real (#164)',
  () => {
    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
      stranger = await person();
    });

    afterAll(async () => {
      const listings = await db().listing.findMany({
        where: { ownerId: { in: userIds } },
        select: { id: true },
      });
      const listingIds = listings.map((listing) => listing.id);
      await db().rating.deleteMany({ where: { evaluatorId: { in: userIds } } });
      await db().auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
      await db().contactRelease.deleteMany({ where: { listingId: { in: listingIds } } });
      await db().negotiation.deleteMany({ where: { listingId: { in: listingIds } } });
      await db().selection.deleteMany({ where: { listingId: { in: listingIds } } });
      await db().payment.deleteMany({
        where: { providerPaymentId: { startsWith: PAYMENT_PREFIX } },
      });
      await db().paymentAttempt.deleteMany({
        where: { contactRequest: { listingId: { in: listingIds } } },
      });
      await db().contactRequest.deleteMany({ where: { listingId: { in: listingIds } } });
      await db().listingTransition.deleteMany({ where: { listingId: { in: listingIds } } });
      await db().listing.deleteMany({ where: { id: { in: listingIds } } });
      await db().verification.deleteMany({
        where: { identifier: { in: userIds.map((id) => `email-verification:${id}`) } },
      });
      await db().termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
      await db().userContact.deleteMany({ where: { userId: { in: userIds } } });
      await db().user.deleteMany({ where: { id: { in: userIds } } });
      await db().$disconnect();
      vi.unstubAllEnvs();
    });

    it('recusa active, terceiros, sessao ausente e nao verificada sem criar nota', async () => {
      const p = await pair(undefined, undefined, false);
      expect(
        await as(p.owner, () => submitRating({ negotiationId: p.negotiationId, score: 4 })),
      ).toMatchObject({ success: false, reason: 'negotiation_active' });
      const unavailable = await as(stranger, () => getOwnRating(p.negotiationId));
      expect(unavailable).toEqual(
        await as(stranger, () => getOwnRating('00000000-0000-4000-8000-000000000000')),
      );
      expect(
        await as(stranger, () => submitRating({ negotiationId: p.negotiationId, score: 4 })),
      ).toMatchObject({ success: false, reason: 'not_found' });
      expect(
        await cookies.run('', () => submitRating({ negotiationId: p.negotiationId, score: 5 })),
      ).toMatchObject({ success: false, reason: 'login_required' });
      await db().user.update({ where: { id: p.chosen.id }, data: { emailVerified: false } });
      expect(
        await as(p.chosen, () => submitRating({ negotiationId: p.negotiationId, score: 5 })),
      ).toMatchObject({ success: false, reason: 'email_unverified' });
      expect(await db().rating.count({ where: { negotiationId: p.negotiationId } })).toBe(0);
    });

    it('nota unica fica cega, retry nao duplica e edicao conserva identidade/submissao', async () => {
      const p = await pair();
      expect(
        await as(p.chosen, () => submitRating({ negotiationId: p.negotiationId, score: 1 })),
      ).toEqual({ success: true, changed: true, published: false });
      const initial = await db().rating.findFirstOrThrow({
        where: { negotiationId: p.negotiationId },
      });
      expect(
        await as(p.chosen, () => submitRating({ negotiationId: p.negotiationId, score: 1 })),
      ).toEqual({ success: true, changed: false, published: false });
      expect(await getPublicListingReputation(p.listingId)).toEqual({ average: null, count: 0 });
      expect(await as(p.owner, () => getOwnRating(p.negotiationId))).toMatchObject({
        success: true,
        view: { ownRating: null, canSubmit: true, canEdit: false },
      });
      expect(await as(p.chosen, () => getOwnRating(p.negotiationId))).toMatchObject({
        success: true,
        view: { ownRating: { score: 1, published: false }, canSubmit: false, canEdit: true },
      });
      expect(
        await as(p.chosen, () => submitRating({ negotiationId: p.negotiationId, score: 5 })),
      ).toMatchObject({ success: true, changed: true, published: false });
      const edited = await db().rating.findFirstOrThrow({
        where: { negotiationId: p.negotiationId },
      });
      expect(edited.id).toBe(initial.id);
      expect(edited.submittedAt).toEqual(initial.submittedAt);
      expect(edited.score).toBe(5);
      expect(await db().rating.count({ where: { negotiationId: p.negotiationId } })).toBe(1);
      const events = await db().auditEvent.findMany({
        where: { targetId: initial.id, eventType: { startsWith: 'rating.' } },
        select: { eventType: true, details: true },
      });
      expect(events.map((event) => event.eventType).sort()).toEqual([
        'rating.submitted',
        'rating.updated',
      ]);
      expect(
        events.every(
          (event) =>
            JSON.stringify(event.details) === JSON.stringify({ negotiationId: p.negotiationId }),
        ),
      ).toBe(true);
    });

    it('duas submissoes concorrentes publicam ambas no mesmo instante', async () => {
      const p = await pair();
      const results = await underNegotiationLock(
        p.negotiationId,
        () =>
          Promise.all([
            as(p.owner, () => submitRating({ negotiationId: p.negotiationId, score: 2 })),
            as(p.chosen, () => submitRating({ negotiationId: p.negotiationId, score: 4 })),
          ]),
        2,
      );
      expect(results.every((result) => result.success)).toBe(true);
      expect(results.filter((result) => result.success && result.published)).toHaveLength(1);
      const ratings = await db().rating.findMany({ where: { negotiationId: p.negotiationId } });
      expect(ratings).toHaveLength(2);
      expect(ratings[0].publishedAt).not.toBeNull();
      expect(ratings[0].publishedAt).toEqual(ratings[1].publishedAt);
      expect(
        await db().auditEvent.count({
          where: { targetId: p.negotiationId, eventType: 'rating.published' },
        }),
      ).toBe(1);
      expect(await getPublicListingReputation(p.listingId)).toEqual({ average: 4, count: 1 });
      expect(
        await as(p.owner, () => submitRating({ negotiationId: p.negotiationId, score: 5 })),
      ).toMatchObject({ success: false, reason: 'already_published' });
    });

    it('mesma direcao concorrente cria uma unica nota', async () => {
      const p = await pair();
      const results = await underNegotiationLock(
        p.negotiationId,
        () =>
          Promise.all([
            as(p.owner, () => submitRating({ negotiationId: p.negotiationId, score: 3 })),
            as(p.owner, () => submitRating({ negotiationId: p.negotiationId, score: 3 })),
          ]),
        2,
      );
      expect(results).toEqual(
        expect.arrayContaining([
          { success: true, changed: true, published: false },
          { success: true, changed: false, published: false },
        ]),
      );
      expect(await db().rating.count({ where: { negotiationId: p.negotiationId } })).toBe(1);
    });

    it('falha na auditoria desfaz segunda submissao e publicacao das duas notas', async () => {
      const p = await pair();
      await as(p.owner, () => submitRating({ negotiationId: p.negotiationId, score: 4 }));
      await db()
        .$executeRaw`ALTER TABLE "audit_events" ADD CONSTRAINT "it164_block_publication_audit" CHECK ("event_type" <> 'rating.published') NOT VALID`;
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        expect(
          await as(p.chosen, () => submitRating({ negotiationId: p.negotiationId, score: 2 })),
        ).toMatchObject({ success: false, reason: 'error' });
        const ratings = await db().rating.findMany({ where: { negotiationId: p.negotiationId } });
        expect(ratings).toHaveLength(1);
        expect(ratings[0].evaluatorId).toBe(p.owner.id);
        expect(ratings[0].publishedAt).toBeNull();
        expect(await getPublicListingReputation(p.listingId)).toEqual({ average: null, count: 0 });
      } finally {
        await db()
          .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT "it164_block_publication_audit"`;
        errorLog.mockRestore();
      }
    });

    it('edicao versus segunda submissao nunca altera nota depois da publicacao', async () => {
      const p = await pair();
      expect(
        await as(p.owner, () => submitRating({ negotiationId: p.negotiationId, score: 3 })),
      ).toMatchObject({ success: true });
      const [edit, publication] = await underNegotiationLock(
        p.negotiationId,
        () =>
          Promise.all([
            as(p.owner, () => submitRating({ negotiationId: p.negotiationId, score: 5 })),
            as(p.chosen, () => submitRating({ negotiationId: p.negotiationId, score: 2 })),
          ]),
        2,
      );
      expect(publication).toMatchObject({ success: true, published: true });
      const own = await db().rating.findUniqueOrThrow({
        where: {
          negotiationId_evaluatorId: { negotiationId: p.negotiationId, evaluatorId: p.owner.id },
        },
      });
      if (edit.success) expect(own.score).toBe(5);
      else {
        expect(edit.reason).toBe('already_published');
        expect(own.score).toBe(3);
      }
      expect(
        await as(p.owner, () => submitRating({ negotiationId: p.negotiationId, score: 1 })),
      ).toMatchObject({ success: false, reason: 'already_published' });
      const rows = await db().rating.findMany({ where: { negotiationId: p.negotiationId } });
      expect(rows[0].publishedAt).toEqual(rows[1].publishedAt);
    });

    it('fim da janela publica nota unica na leitura sem gravar publishedAt nem precisar de job', async () => {
      const p = await pair();
      await as(p.chosen, () => submitRating({ negotiationId: p.negotiationId, score: 3 }));
      await db()
        .$executeRaw`UPDATE "negotiations" SET "closed_at" = clock_timestamp() - INTERVAL '336 hours' WHERE "id" = ${p.negotiationId}::uuid`;
      expect(
        await as(p.owner, () => submitRating({ negotiationId: p.negotiationId, score: 4 })),
      ).toMatchObject({ success: false, reason: 'window_closed' });
      expect(await as(p.chosen, () => getOwnRating(p.negotiationId))).toMatchObject({
        success: true,
        view: { canEdit: false, ownRating: { published: true } },
      });
      expect(await getPublicListingReputation(p.listingId)).toEqual({ average: 3, count: 1 });
      expect(
        (await db().rating.findFirstOrThrow({ where: { negotiationId: p.negotiationId } }))
          .publishedAt,
      ).toBeNull();
    });

    it('espera na trava que cruza o prazo nao usa timestamp antigo para aceitar a nota', async () => {
      const p = await pair();
      let submission: ReturnType<typeof submitRating> | undefined;
      await db().$transaction(
        async (tx) => {
          await tx.$executeRaw`UPDATE "negotiations" SET "closed_at" = clock_timestamp() - INTERVAL '336 hours' + INTERVAL '3 seconds' WHERE "id" = ${p.negotiationId}::uuid`;
          submission = as(p.chosen, () =>
            submitRating({ negotiationId: p.negotiationId, score: 5 }),
          );
          await waitForBlockedTransactions(1);
          // O PostgreSQL mantem a trava ate o commit; tempo real passa no banco.
          await tx.$executeRaw`SELECT pg_sleep(3.1)`;
        },
        { timeout: 15_000 },
      );
      expect(await submission).toMatchObject({ success: false, reason: 'window_closed' });
      expect(await db().rating.count({ where: { negotiationId: p.negotiationId } })).toBe(0);
    });

    it('agrega ambos os papeis e invalida remove somente media/contagem sem reabrir direcao', async () => {
      const first = await pair();
      const second = await pair(first.chosen, first.owner);
      await as(first.owner, () => submitRating({ negotiationId: first.negotiationId, score: 4 }));
      await as(first.chosen, () => submitRating({ negotiationId: first.negotiationId, score: 2 }));
      await as(second.owner, () => submitRating({ negotiationId: second.negotiationId, score: 5 }));
      await as(second.chosen, () =>
        submitRating({ negotiationId: second.negotiationId, score: 4 }),
      );
      expect(await getPublicListingReputation(first.listingId)).toEqual({ average: 3.5, count: 2 });
      // Invalida e fixture de F4-005, que nao faz parte desta entrega.
      await db().rating.update({
        where: {
          negotiationId_evaluatorId: {
            negotiationId: second.negotiationId,
            evaluatorId: second.owner.id,
          },
        },
        data: { validity: 'invalidated', invalidatedAt: new Date() },
      });
      expect(await getPublicListingReputation(first.listingId)).toEqual({ average: 2, count: 1 });
      expect(
        await as(second.owner, () =>
          submitRating({ negotiationId: second.negotiationId, score: 4 }),
        ),
      ).toMatchObject({ success: false, reason: 'invalidated' });
    });

    it('removed nao muda elegibilidade privada e gate publico tambem exige dono active', async () => {
      const p = await pair();
      await db().listing.update({ where: { id: p.listingId }, data: { status: 'removed' } });
      expect(
        await as(p.chosen, () => submitRating({ negotiationId: p.negotiationId, score: 4 })),
      ).toMatchObject({ success: true });
      expect(await getPublicListingReputation(p.listingId)).toBeNull();
      const other = await pair();
      await db().user.update({ where: { id: other.owner.id }, data: { status: 'blocked_admin' } });
      expect(await getPublicListingReputation(other.listingId)).toBeNull();
      expect(await getPublicListingReputation('invalido')).toBeNull();
    });

    it('constraints reais recusam nota fora do dominio, autoavaliacao e duplicata', async () => {
      const p = await pair();
      const data: Prisma.RatingUncheckedCreateInput = {
        negotiationId: p.negotiationId,
        evaluatorId: p.owner.id,
        evaluatedId: p.chosen.id,
        score: 5,
      };
      await expect(db().rating.create({ data: { ...data, score: 6 } })).rejects.toThrow();
      await expect(
        db().rating.create({ data: { ...data, evaluatedId: p.owner.id } }),
      ).rejects.toThrow();
      await as(p.owner, () => submitRating({ negotiationId: p.negotiationId, score: 4 }));
      await expect(db().rating.create({ data })).rejects.toThrow();
      expect(await db().rating.count({ where: { negotiationId: p.negotiationId } })).toBe(1);
    });
  },
);
