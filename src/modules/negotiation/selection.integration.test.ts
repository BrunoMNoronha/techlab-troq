// @vitest-environment node
//
// Prova de integracao de F3-009 (#99): escolha do solicitante, abertura da
// negociacao `active` e autorizacao de liberacao, num unico ato, contra o
// Better Auth REAL e PostgreSQL REAL e descartavel (contact-release.md, CR-3.2
// a CR-3.4, C-9; data-model.md, DM-8; reselection-policy.md, DEC-032).
//
// C-9 e CONCORRENTE de verdade (PD-13.2): uma transacao segura a trava do
// anuncio enquanto N escolhas, em N conexoes do pool, sao disparadas; o teste
// so solta a trava depois de VER, em `pg_stat_activity`, N backends distintos
// esperando por ela. Uma variante dispara as N livremente, e outra prova que o
// indice do banco recusa uma segunda negociacao `active` mesmo sem o codigo.
//
// O estado "pago" e semeado pelo que F3-006 grava ao confirmar (tentativa em
// `pagamento_confirmado`, pagamento canonico, solicitacao `paid`): o caminho
// real da confirmacao ja e provado em payment-confirmation.integration.test.ts.
// Reversao e estados incertos sao semeados do mesmo modo. A reserva e real.
//
// Sessoes: cada chamada roda num AsyncLocalStorage com o cookie da propria
// pessoa; o unico mock e `headers()` do Next.js.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1 (docs/engineering/
// testing.md, secao 2.2). Dados sinteticos, removidos ao final.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ListingStatus, PaymentAttemptStatus, Prisma } from '@/generated/prisma/client';
import { registerOwnContact } from '@/modules/contact';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { createDraftListing } from '@/modules/listing/actions';
import { createContactRequest } from '@/modules/request';
import { getPrismaClient } from '@/persistence/prisma';
import { getSelectionOptions, selectRequester, type SelectionResult } from './selection';

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

// F3-013 (#103): o transporte dos avisos transacionais e SIMULADO.
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
/** Avisos TE-3 enviados desde o ultimo `mockClear`. */
const released = () =>
  sentEmails.send.mock.calls
    .map(([e]) => e)
    .filter((e) => e.idempotencyKey.startsWith('troq-notice/contact_released/'));

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const PAYMENT_PREFIX = `it99-${RUN_ID}`;
/** N de C-9: maior que as 3 pagas e cabendo no pool (`pg`, max = 10) com a transacao da trava. */
const N = 6;
const OWNER_PHONE = '(11) 91234-5678';
const PHONE_DIGITS = '912345678';

const email = (tag: string) => `it-escolha-${tag}-${RUN_ID}@example.test`;
const prisma = () => getPrismaClient();

const userIds: string[] = [];
const ids: Record<string, string> = {};
const cookies: Record<string, string> = {};
let paymentSeq = 0;

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
  ids[tag] = id;
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

/** Anuncio publicado do dono (T1 pelo gatilho), pronto para receber solicitacoes. */
async function publishedListing(owner = 'owner'): Promise<string> {
  const res = await as(owner, () =>
    createDraftListing({
      title: 'Bicicleta sintetica',
      description: 'Anuncio sintetico de integracao.',
      city: 'Recife',
      state: 'PE',
    }),
  );
  expect(res.success).toBe(true);
  const id = res.listingId!;
  await prisma().listing.update({ where: { id }, data: { status: 'published' } });
  return id;
}

/** Leva o anuncio ao estado pedido por transicoes permitidas pelo gatilho (T3, T5, T6, T8). */
async function moveListing(listingId: string, status: ListingStatus): Promise<void> {
  const path: Partial<Record<ListingStatus, ListingStatus[]>> = {
    paused: ['paused'],
    closed: ['closed'],
    removed: ['removed'],
    published: [],
  };
  for (const next of path[status] ?? []) {
    await prisma().listing.update({ where: { id: listingId }, data: { status: next } });
  }
}

/** Reserva real (F3-003) do solicitante no anuncio. */
async function reserve(listingId: string, tag: string): Promise<string> {
  const res = await as(tag, () => createContactRequest(listingId));
  expect(res.success).toBe(true);
  return (res as { contactRequestId: string }).contactRequestId;
}

/** O que F3-006 grava ao confirmar a tempo (PD-6.6, passo 4), semeado direto. */
async function confirmPaid(contactRequestId: string): Promise<string> {
  const attempt = await prisma().paymentAttempt.findUniqueOrThrow({
    where: { contactRequestId },
    select: { id: true },
  });
  paymentSeq += 1;
  const now = new Date();
  const payment = await prisma().$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.payment.create({
      data: {
        paymentAttemptId: attempt.id,
        providerPaymentId: `${PAYMENT_PREFIX}-${paymentSeq}`,
        amountCents: 99,
        providerStatus: 'processed',
        providerStatusDetail: 'accredited',
        accreditedAt: now,
        isCanonical: true,
      },
      select: { id: true },
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
      where: { id: contactRequestId },
      data: { status: 'paid', paidAt: now },
    });
    return created;
  });
  return payment.id;
}

async function paidRequest(listingId: string, tag: string): Promise<string> {
  const id = await reserve(listingId, tag);
  await confirmPaid(id);
  return id;
}

async function setAttemptStatus(contactRequestId: string, status: PaymentAttemptStatus) {
  await prisma().paymentAttempt.update({ where: { contactRequestId }, data: { status } });
}

/** Encerramento sintetico (DEC-029): o caso de uso de encerramento e da Fase 4 (#55). */
async function closeNegotiation(negotiationId: string, by = 'owner'): Promise<void> {
  await prisma().negotiation.update({
    where: { id: negotiationId },
    data: { status: 'closed', closedAt: new Date(), closedById: ids[by] },
  });
}

function select(contactRequestId: string, listingId: string, tag = 'owner', confirmed = true) {
  return as(tag, () => selectRequester({ listingId, contactRequestId, confirmed }));
}

async function chainOf(listingId: string) {
  const [selections, negotiations, releases] = await Promise.all([
    prisma().selection.findMany({ where: { listingId }, orderBy: { selectedAt: 'asc' } }),
    prisma().negotiation.findMany({ where: { listingId }, orderBy: { createdAt: 'asc' } }),
    prisma().contactRelease.findMany({ where: { listingId }, orderBy: { authorizedAt: 'asc' } }),
  ]);
  return { selections, negotiations, releases };
}

async function expectNothingCreated(listingId: string) {
  const chain = await chainOf(listingId);
  expect(chain.selections).toHaveLength(0);
  expect(chain.negotiations).toHaveLength(0);
  expect(chain.releases).toHaveLength(0);
}

function expectFailure(res: SelectionResult, reason: string) {
  expect(res).toMatchObject({ success: false, reason });
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'escolha, negociacao e autorizacao: Better Auth real contra PostgreSQL descartavel (#99)',
  () => {
    const requesters = ['r0', 'r1', 'r2', 'r3'];

    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');

      for (const tag of ['owner', 'other', 'stranger', ...requesters]) {
        await createUser(tag);
        cookies[tag] = await signIn(tag);
      }
      // DEC-040: so anunciante com contato recebe solicitacao.
      for (const tag of ['owner', 'other']) {
        expect(await as(tag, () => registerOwnContact({ phone: OWNER_PHONE }))).toEqual({
          success: true,
          hasContact: true,
        });
      }
    });

    afterAll(async () => {
      const listings = await prisma().listing.findMany({
        where: { ownerId: { in: userIds } },
        select: { id: true },
      });
      const listingIds = listings.map((l) => l.id);
      await prisma()
        .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "it_f3009_block_audit"`;
      await prisma().auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma().contactRelease.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().negotiation.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().selection.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().payment.deleteMany({
        where: { providerPaymentId: { startsWith: PAYMENT_PREFIX } },
      });
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

    describe('C-9: escolhas concorrentes no mesmo anuncio', () => {
      /** Tres pagas; N escolhas do dono, duas para cada solicitacao. */
      async function contestedListing() {
        const listingId = await publishedListing();
        const requestIds: string[] = [];
        for (const tag of ['r0', 'r1', 'r2']) requestIds.push(await paidRequest(listingId, tag));
        const targets = Array.from({ length: N }, (_, i) => requestIds[i % 3]);
        return { listingId, targets };
      }

      function expectSingleAuthorization(
        results: SelectionResult[],
        chain: Awaited<ReturnType<typeof chainOf>>,
      ) {
        const created = results.filter((r) => r.success && r.changed);
        expect(created).toHaveLength(1);
        const winner = created[0] as Extract<SelectionResult, { success: true }>;
        // Os demais: a repeticao idempotente da mesma escolha ou a recusa por P7.
        for (const r of results.filter((x) => x !== winner)) {
          if (r.success) {
            expect(r).toMatchObject({ changed: false, negotiationId: winner.negotiationId });
          } else {
            expect(r.reason).toBe('negotiation_active');
          }
        }
        expect(chain.selections).toHaveLength(1);
        expect(chain.negotiations).toHaveLength(1);
        expect(chain.negotiations.filter((n) => n.status === 'active')).toHaveLength(1);
        expect(chain.releases).toHaveLength(1);
        expect(chain.releases[0].negotiationId).toBe(winner.negotiationId);
        // F3-013: N disparos, uma transicao, um unico aviso TE-3, so ao escolhido.
        const chosenTag = Object.entries(ids).find(
          ([, id]) => id === chain.releases[0].recipientId,
        )![0];
        expect(released().map((m) => [m.to, m.idempotencyKey])).toEqual([
          [email(chosenTag), `troq-notice/contact_released/${chain.releases[0].id}`],
        ]);
      }

      it(`com a trava segurada: ${N} backends distintos esperam; uma autorizacao, uma negociacao active`, async () => {
        const { listingId, targets } = await contestedListing();
        sentEmails.send.mockClear();
        let pending!: Promise<SelectionResult[]>;
        const waiting: number[] = [];

        await prisma().$transaction(
          async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${listingId}::uuid FOR UPDATE`;
            pending = Promise.all(targets.map((requestId) => select(requestId, listingId)));
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
        expectSingleAuthorization(await pending, await chainOf(listingId));
      });

      it(`sem trava segurada: ${N} disparos livres terminam com uma unica autorizacao`, async () => {
        const { listingId, targets } = await contestedListing();
        sentEmails.send.mockClear();
        const results = await Promise.all(targets.map((requestId) => select(requestId, listingId)));
        expectSingleAuthorization(results, await chainOf(listingId));
      });

      it('o banco recusa uma segunda negociacao active no anuncio, mesmo fora do caso de uso (DM-8.5)', async () => {
        const listingId = await publishedListing();
        const a = await paidRequest(listingId, 'r0');
        const b = await paidRequest(listingId, 'r1');
        expect((await select(a, listingId)).success).toBe(true);

        const forged = prisma().$transaction(async (tx: Prisma.TransactionClient) => {
          const selection = await tx.selection.create({
            data: { listingId, contactRequestId: b, actorId: ids.owner },
          });
          await tx.negotiation.create({
            data: {
              selectionId: selection.id,
              listingId,
              ownerId: ids.owner,
              chosenId: ids.r1,
              status: 'active',
            },
          });
        });
        await expect(forged).rejects.toThrow();
        const chain = await chainOf(listingId);
        expect(chain.negotiations.filter((n) => n.status === 'active')).toHaveLength(1);
        expect(chain.selections).toHaveLength(1);
      });
    });

    describe('primeira escolha: o ato atomico (CR-3.2 a CR-3.4)', () => {
      it('cria Selection, Negotiation active e ContactRelease sem o numero, e audita os dois fatos', async () => {
        const listingId = await publishedListing();
        const requestId = await paidRequest(listingId, 'r0');
        const canonical = await prisma().payment.findFirstOrThrow({
          where: { paymentAttempt: { contactRequestId: requestId }, isCanonical: true },
        });

        sentEmails.send.mockClear();
        const res = await select(requestId, listingId);
        expect(res).toMatchObject({ success: true, kind: 'selection', changed: true });
        const { negotiationId } = res as Extract<SelectionResult, { success: true }>;

        const { selections, negotiations, releases } = await chainOf(listingId);
        expect(selections).toHaveLength(1);
        expect(selections[0]).toMatchObject({ contactRequestId: requestId, actorId: ids.owner });
        expect(negotiations).toEqual([
          expect.objectContaining({
            id: negotiationId,
            selectionId: selections[0].id,
            ownerId: ids.owner,
            chosenId: ids.r0,
            status: 'active',
            closedAt: null,
          }),
        ]);
        expect(releases).toEqual([
          expect.objectContaining({
            negotiationId,
            contactRequestId: requestId,
            ownerId: ids.owner,
            recipientId: ids.r0,
            paymentId: canonical.id,
          }),
        ]);
        // Um unico instante para o ato (DM-6.12, item 4).
        expect(negotiations[0].createdAt.getTime()).toBe(selections[0].selectedAt.getTime());
        expect(releases[0].authorizedAt.getTime()).toBe(selections[0].selectedAt.getTime());
        // CR-3.1: a autorizacao nao tem coluna de numero nem copia dele.
        expect(JSON.stringify(releases[0])).not.toContain(PHONE_DIGITS);

        const audits = await prisma().auditEvent.findMany({
          where: { targetId: { in: [selections[0].id, releases[0].id] } },
        });
        expect(audits.map((a) => a.eventType).sort()).toEqual([
          'contact.release_authorized',
          'negotiation.selected',
        ]);
        expect(audits.every((a) => a.actorId === ids.owner && a.result === 'success')).toBe(true);
        expect(JSON.stringify(audits)).not.toContain(PHONE_DIGITS);

        // TE-3 (F3-013): um aviso ao escolhido, que manda a /contatos e nao leva o numero.
        const [notice, ...rest] = released();
        expect(rest).toEqual([]);
        expect(notice).toMatchObject({
          to: email('r0'),
          idempotencyKey: `troq-notice/contact_released/${releases[0].id}`,
        });
        expect(notice.text).toContain('/contatos');
        for (const body of [notice.subject, notice.text, notice.html]) {
          expect(body).not.toContain(PHONE_DIGITS);
          expect(body).not.toContain('91234-5678');
        }
      });

      it('repetir a escolha do escolhido vivo e idempotente: sucesso sem gravar nada', async () => {
        const listingId = await publishedListing();
        const requestId = await paidRequest(listingId, 'r0');
        sentEmails.send.mockClear();
        const first = await select(requestId, listingId);
        expect(released()).toHaveLength(1);
        const again = await select(requestId, listingId);
        // F3-013: a repeticao idempotente nao grava nada e nao reenvia o aviso.
        expect(released()).toHaveLength(1);
        expect(again).toEqual({
          success: true,
          negotiationId: (first as Extract<SelectionResult, { success: true }>).negotiationId,
          kind: 'selection',
          changed: false,
        });
        const chain = await chainOf(listingId);
        expect([chain.selections.length, chain.negotiations.length, chain.releases.length]).toEqual(
          [1, 1, 1],
        );
      });

      it('falha da auditoria desfaz o ato inteiro: nao ha escolha sem autorizacao (CR-3.3)', async () => {
        const listingId = await publishedListing();
        const requestId = await paidRequest(listingId, 'r0');
        const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await prisma().$executeRawUnsafe(
          `ALTER TABLE "audit_events" ADD CONSTRAINT "it_f3009_block_audit"
           CHECK ("event_type" <> 'negotiation.selected') NOT VALID`,
        );
        try {
          expectFailure(await select(requestId, listingId), 'error');
        } finally {
          await prisma()
            .$executeRaw`ALTER TABLE "audit_events" DROP CONSTRAINT "it_f3009_block_audit"`;
          logSpy.mockRestore();
        }
        await expectNothingCreated(listingId);
        expect((await select(requestId, listingId)).success).toBe(true);
      });

      it.each(['paused', 'closed'] as const)(
        'primeira escolha em anuncio %s e permitida (reselection-policy.md, secao 6.1)',
        async (status) => {
          const listingId = await publishedListing();
          const requestId = await paidRequest(listingId, 'r0');
          await moveListing(listingId, status);
          expect(await select(requestId, listingId)).toMatchObject({
            success: true,
            kind: 'selection',
          });
        },
      );
    });

    describe('cada pre-condicao recusa sem criar autorizacao', () => {
      it('sessao e confirmacao: sem sessao, sem confirmacao explicita', async () => {
        const listingId = await publishedListing();
        const requestId = await paidRequest(listingId, 'r0');
        expectFailure(
          await cookieStore.run('', () =>
            selectRequester({ listingId, contactRequestId: requestId, confirmed: true }),
          ),
          'login_required',
        );
        expectFailure(await select(requestId, listingId, 'owner', false), 'confirmation_required');
        await expectNothingCreated(listingId);
      });

      it('P1: quem nao e o dono -- outro anunciante, o proprio solicitante, terceiro -- recebe not_found', async () => {
        const listingId = await publishedListing();
        const requestId = await paidRequest(listingId, 'r0');
        for (const tag of ['other', 'r0', 'stranger']) {
          expectFailure(await select(requestId, listingId, tag), 'not_found');
        }
        await expectNothingCreated(listingId);
      });

      it('P2: solicitacao de outro anuncio (mesmo do proprio dono) recebe not_found', async () => {
        const listingA = await publishedListing();
        const listingB = await publishedListing();
        const requestOfB = await paidRequest(listingB, 'r0');
        expectFailure(await select(requestOfB, listingA), 'not_found');
        // Identificador malformado: a mesma resposta.
        expectFailure(await select('nao-e-uuid', listingA), 'not_found');
        await expectNothingCreated(listingA);
        await expectNothingCreated(listingB);
      });

      it('P3: reservada, aguardando confirmacao, revertida ou inconsistente nunca e elegivel', async () => {
        const listingId = await publishedListing();
        const reserved = await reserve(listingId, 'r0');
        const confirming = await reserve(listingId, 'r1');
        await setAttemptStatus(confirming, 'em_confirmacao');
        const reversed = await paidRequest(listingId, 'r2');
        await setAttemptStatus(reversed, 'reembolsada_ou_revertida');

        for (const requestId of [reserved, confirming, reversed]) {
          expectFailure(await select(requestId, listingId), 'not_eligible');
        }
        await setAttemptStatus(reversed, 'inconsistente');
        expectFailure(await select(reversed, listingId), 'not_eligible');
        await expectNothingCreated(listingId);
      });

      it('P4 / RS-5: quem ja foi escolhido numa negociacao encerrada nao e escolhido de novo', async () => {
        const listingId = await publishedListing();
        const requestId = await paidRequest(listingId, 'r0');
        const first = await select(requestId, listingId);
        await closeNegotiation(
          (first as Extract<SelectionResult, { success: true }>).negotiationId,
        );

        expectFailure(await select(requestId, listingId), 'already_selected');
        const chain = await chainOf(listingId);
        expect([chain.selections.length, chain.negotiations.length, chain.releases.length]).toEqual(
          [1, 1, 1],
        );
      });

      it('P5: anuncio removed bloqueia a escolha (DEC-027, secao 6)', async () => {
        const listingId = await publishedListing();
        const requestId = await paidRequest(listingId, 'r0');
        await moveListing(listingId, 'removed');
        expectFailure(await select(requestId, listingId), 'listing_removed');
        await expectNothingCreated(listingId);
      });

      it.each(['paused', 'closed'] as const)(
        'P6 / RS-3: reselecao com anuncio %s e recusada',
        async (status) => {
          const listingId = await publishedListing();
          const a = await paidRequest(listingId, 'r0');
          const b = await paidRequest(listingId, 'r1');
          const first = await select(a, listingId);
          await closeNegotiation(
            (first as Extract<SelectionResult, { success: true }>).negotiationId,
            'r0',
          );
          await moveListing(listingId, status);

          expectFailure(await select(b, listingId), 'listing_not_published');
          const chain = await chainOf(listingId);
          expect([chain.selections.length, chain.releases.length]).toEqual([1, 1]);
        },
      );

      it('P7 / RS-2: com negociacao active no anuncio, outra escolha e recusada', async () => {
        const listingId = await publishedListing();
        const a = await paidRequest(listingId, 'r0');
        const b = await paidRequest(listingId, 'r1');
        expect((await select(a, listingId)).success).toBe(true);

        expectFailure(await select(b, listingId), 'negotiation_active');
        const chain = await chainOf(listingId);
        expect([chain.selections.length, chain.negotiations.length, chain.releases.length]).toEqual(
          [1, 1, 1],
        );
      });
    });

    describe('reselecao valida (DEC-032)', () => {
      it('cria autorizacao nova e independente e preserva a anterior intacta', async () => {
        const listingId = await publishedListing();
        const a = await paidRequest(listingId, 'r0');
        const b = await paidRequest(listingId, 'r1');
        const first = (await select(a, listingId)) as Extract<SelectionResult, { success: true }>;
        await closeNegotiation(first.negotiationId, 'r0');
        const before = await chainOf(listingId);
        sentEmails.send.mockClear();

        const second = await select(b, listingId);
        expect(second).toMatchObject({ success: true, kind: 'reselection', changed: true });
        const { negotiationId } = second as Extract<SelectionResult, { success: true }>;
        expect(negotiationId).not.toBe(first.negotiationId);

        const after = await chainOf(listingId);
        expect(after.selections).toHaveLength(2);
        expect(after.releases).toHaveLength(2);
        // A anterior permanece exatamente como estava (CR-3.5).
        expect(after.releases[0]).toEqual(before.releases[0]);
        expect(after.selections[0]).toEqual(before.selections[0]);
        expect(after.negotiations[0]).toEqual(before.negotiations[0]);
        expect(after.negotiations[0].status).toBe('closed');
        expect(after.releases[1]).toMatchObject({ negotiationId, recipientId: ids.r1 });
        // F3-013: a reselecao avisa so o novo escolhido.
        expect(released().map((m) => m.to)).toEqual([email('r1')]);
        expect(after.negotiations.filter((n) => n.status === 'active')).toEqual([
          expect.objectContaining({ id: negotiationId, chosenId: ids.r1 }),
        ]);

        // Cada escolha auditada independentemente (CR-3.4).
        const audits = await prisma().auditEvent.findMany({
          where: { targetId: { in: after.selections.map((s) => s.id) } },
          orderBy: { occurredAt: 'asc' },
        });
        expect(audits.map((x) => x.eventType)).toEqual([
          'negotiation.selected',
          'negotiation.reselected',
        ]);
        expect(
          await prisma().auditEvent.count({
            where: {
              eventType: 'contact.release_authorized',
              targetId: { in: after.releases.map((r) => r.id) },
            },
          }),
        ).toBe(2);
      });
    });

    describe('PD-11.3: o dono ve so as pagas elegiveis do proprio anuncio', () => {
      it('lista exclui nao paga, aguardando confirmacao, revertida, inconsistente e ja escolhida', async () => {
        const listingId = await publishedListing();
        const eligible = await paidRequest(listingId, 'r0');
        const reversed = await paidRequest(listingId, 'r1');
        await setAttemptStatus(reversed, 'reembolsada_ou_revertida');
        const inconsistent = await paidRequest(listingId, 'r2');
        await setAttemptStatus(inconsistent, 'inconsistente');

        let res = await as('owner', () => getSelectionOptions(listingId));
        expect(res).toMatchObject({
          success: true,
          options: {
            listingStatus: 'published',
            mode: 'selection',
            blockedBy: null,
            activeNegotiation: null,
            candidates: [{ contactRequestId: eligible, requesterDisplayName: 'Pessoa r0' }],
          },
        });
        // Nada de e-mail, telefone ou dado de pagamento no que sai para a tela.
        const payload = JSON.stringify(res);
        expect(payload).not.toContain('@');
        expect(payload).not.toContain(PHONE_DIGITS);
        expect(payload).not.toContain(PAYMENT_PREFIX);

        expect((await select(eligible, listingId)).success).toBe(true);
        res = await as('owner', () => getSelectionOptions(listingId));
        expect(res).toMatchObject({
          success: true,
          options: {
            blockedBy: 'negotiation_active',
            activeNegotiation: { chosenDisplayName: 'Pessoa r0' },
            candidates: [],
          },
        });
      });

      it('reservada e aguardando confirmacao nao aparecem; reselecao bloqueada fora de published', async () => {
        const listingId = await publishedListing();
        const a = await paidRequest(listingId, 'r0');
        const b = await paidRequest(listingId, 'r1');
        const pending = await reserve(listingId, 'r2');

        const first = (await select(a, listingId)) as Extract<SelectionResult, { success: true }>;
        await closeNegotiation(first.negotiationId);
        const expected = {
          success: true,
          options: {
            mode: 'reselection',
            activeNegotiation: null,
            candidates: [{ contactRequestId: b }],
          },
        };
        expect(await as('owner', () => getSelectionOptions(listingId))).toMatchObject({
          ...expected,
          options: { ...expected.options, listingStatus: 'published', blockedBy: null },
        });

        await setAttemptStatus(pending, 'em_confirmacao');
        await moveListing(listingId, 'paused');
        expect(await as('owner', () => getSelectionOptions(listingId))).toMatchObject({
          ...expected,
          options: {
            ...expected.options,
            listingStatus: 'paused',
            blockedBy: 'listing_not_published',
          },
        });
      });

      it('quem nao e o dono recebe not_found; sem sessao, login_required', async () => {
        const listingId = await publishedListing();
        await paidRequest(listingId, 'r0');
        for (const tag of ['other', 'r0', 'stranger']) {
          expect(await as(tag, () => getSelectionOptions(listingId))).toMatchObject({
            success: false,
            reason: 'not_found',
          });
        }
        expect(await cookieStore.run('', () => getSelectionOptions(listingId))).toMatchObject({
          success: false,
          reason: 'login_required',
        });
      });
    });
  },
);
