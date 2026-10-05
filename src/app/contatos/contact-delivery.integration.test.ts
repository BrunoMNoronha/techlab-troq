// @vitest-environment node
//
// Prova de integracao de F3-010 (#100): entrega do contato SOMENTE ao
// escolhido, com auditoria de cada acesso, pela composicao real da Server
// Action (`revealContact` = `contact` + porta de `negotiation`), contra o
// Better Auth REAL e PostgreSQL REAL e descartavel (contact-release.md, CR-5,
// C-2 a C-6; data-model.md, DM-4.4 e DM-11.3).
//
// Toda prova de negativa exercita o ator nao autorizado de verdade (PD-13.2) e
// compara a resposta com a de um id inexistente: a negativa nao pode ser canal
// lateral (CR-5.4). C-5 usa a prova substituta de DV-13 (nota da secao 10): um
// ator autenticado, verificado e sem relacao, que conhece os ids. Ela sera
// reexecutada com um moderador real na Fase 4 (#55).
//
// A reserva e a escolha sao reais; o estado pago e semeado como F3-006 o grava.
// C-3 exige uma solicitacao fora de `paid` com autorizacao, o que o caso de uso
// nunca produz (P3, e `paid` nao tem saida, I-8): a cadeia e FORJADA direto no
// banco para provar que a entrega reverifica A4/A5 em vez de confiar na escolha.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1. Dados sinteticos.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { registerOwnContact } from '@/modules/contact';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { createDraftListing } from '@/modules/listing/actions';
import { selectRequester, type SelectionResult } from '@/modules/negotiation';
import { createContactRequest } from '@/modules/request';
import { getPrismaClient } from '@/persistence/prisma';
import { revealContact } from './actions';

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
const PAYMENT_PREFIX = `it100-${RUN_ID}`;
const OWNER_PHONE = '(11) 91234-5678';
const OWNER_E164 = '+5511912345678';
const OTHER_PHONE = '(21) 98765-4321';
const PHONE_MARKERS = ['912345678', '91234-5678', '987654321', '98765-4321'];

const email = (tag: string) => `it-entrega-${tag}-${RUN_ID}@example.test`;
const prisma = () => getPrismaClient();

const userIds: string[] = [];
const ids: Record<string, string> = {};
const cookies: Record<string, string> = {};
let paymentSeq = 0;

async function createUser(tag: string): Promise<void> {
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

async function publishedListing(owner: string): Promise<string> {
  const res = await as(owner, () =>
    createDraftListing({
      title: `Bicicleta ${owner}`,
      description: 'Anuncio sintetico de integracao.',
      city: 'Recife',
      state: 'PE',
    }),
  );
  expect(res.success).toBe(true);
  await prisma().listing.update({ where: { id: res.listingId! }, data: { status: 'published' } });
  return res.listingId!;
}

/** Reserva real + o que F3-006 grava ao confirmar a tempo. */
async function paidRequest(listingId: string, tag: string): Promise<string> {
  const reserved = await as(tag, () => createContactRequest(listingId));
  expect(reserved.success).toBe(true);
  const contactRequestId = (reserved as { contactRequestId: string }).contactRequestId;
  const attempt = await prisma().paymentAttempt.findUniqueOrThrow({
    where: { contactRequestId },
    select: { id: true },
  });
  paymentSeq += 1;
  const now = new Date();
  await prisma().$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.payment.create({
      data: {
        paymentAttemptId: attempt.id,
        providerPaymentId: `${PAYMENT_PREFIX}-${paymentSeq}`,
        amountCents: 99,
        providerStatus: 'processed',
        accreditedAt: now,
        isCanonical: true,
      },
    });
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'pagamento_confirmado', accreditedAt: now, recognizedAt: now },
    });
    await tx.contactRequest.update({
      where: { id: contactRequestId },
      data: { status: 'paid', paidAt: now },
    });
  });
  return contactRequestId;
}

/** Escolha real (F3-009); devolve a autorizacao criada. */
async function choose(owner: string, listingId: string, contactRequestId: string) {
  const res = await as(owner, () =>
    selectRequester({ listingId, contactRequestId, confirmed: true }),
  );
  expect(res.success).toBe(true);
  const { negotiationId } = res as Extract<SelectionResult, { success: true }>;
  return prisma().contactRelease.findUniqueOrThrow({ where: { negotiationId } });
}

const reveal = (tag: string, releaseId: string) => as(tag, () => revealContact(releaseId));

const DENIED = { success: false, reason: 'unavailable', error: 'Contato indisponível.' };

async function accessEvents(releaseId: string) {
  return prisma().contactAccessEvent.findMany({ where: { contactReleaseId: releaseId } });
}

async function denials(actorId: string | null, targetId: string | null) {
  return prisma().auditEvent.findMany({
    where: { eventType: 'contact.access_denied', actorId, targetId },
    orderBy: { occurredAt: 'asc' },
  });
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'entrega do contato ao escolhido: Better Auth real contra PostgreSQL descartavel (#100)',
  () => {
    // owner: anunciante de A; other: anunciante de B; r0 escolhido em A; r1 pago
    // nao escolhido em A; r2 escolhido em B; stranger: sem relacao.
    let listingA: string;
    let listingB: string;
    let releaseA: Awaited<ReturnType<typeof choose>>;
    let releaseB: Awaited<ReturnType<typeof choose>>;
    let requestR1: string;

    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');

      for (const tag of ['owner', 'other', 'r0', 'r1', 'r2', 'stranger']) {
        await createUser(tag);
        cookies[tag] = await signIn(tag);
      }
      expect((await as('owner', () => registerOwnContact({ phone: OWNER_PHONE }))).success).toBe(
        true,
      );
      expect((await as('other', () => registerOwnContact({ phone: OTHER_PHONE }))).success).toBe(
        true,
      );

      listingA = await publishedListing('owner');
      const requestR0 = await paidRequest(listingA, 'r0');
      requestR1 = await paidRequest(listingA, 'r1');
      releaseA = await choose('owner', listingA, requestR0);

      listingB = await publishedListing('other');
      releaseB = await choose('other', listingB, await paidRequest(listingB, 'r2'));
    });

    afterAll(async () => {
      const listings = await prisma().listing.findMany({
        where: { ownerId: { in: userIds } },
        select: { id: true },
      });
      const listingIds = listings.map((l) => l.id);
      await prisma().auditEvent.deleteMany({
        where: {
          OR: [
            { actorId: { in: userIds } },
            { eventType: 'contact.access_denied', actorId: null, targetId: releaseA?.id },
          ],
        },
      });
      await prisma().contactAccessEvent.deleteMany({
        where: { contactRelease: { listingId: { in: listingIds } } },
      });
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

    it('C-6: o escolhido recebe o contato, e CADA acesso grava ContactAccessEvent e a trilha', async () => {
      const before = (await accessEvents(releaseA.id)).length;
      expect(await reveal('r0', releaseA.id)).toEqual({ success: true, phone: OWNER_E164 });
      expect(await reveal('r0', releaseA.id)).toEqual({ success: true, phone: OWNER_E164 });

      const events = await accessEvents(releaseA.id);
      expect(events).toHaveLength(before + 2);
      expect(events.every((e) => e.actorId === ids.r0)).toBe(true);

      const trail = await prisma().auditEvent.findMany({
        where: { eventType: 'contact.delivered', targetId: releaseA.id },
      });
      expect(trail).toHaveLength(before + 2);
      expect(trail.every((a) => a.actorId === ids.r0 && a.result === 'success')).toBe(true);
      // Cada evento da trilha aponta para o seu ContactAccessEvent, no mesmo instante.
      for (const a of trail) {
        const detail = a.details as { contactAccessEventId: string };
        const event = events.find((e) => e.id === detail.contactAccessEventId);
        expect(event?.accessedAt.getTime()).toBe(a.occurredAt.getTime());
      }
      expect(JSON.stringify(trail)).not.toMatch(new RegExp(PHONE_MARKERS.join('|')));
    });

    it('C-2: solicitante pago NAO escolhido e negado, com a mesma resposta de um id inexistente', async () => {
      const ghost = randomUUID();
      const denied = await reveal('r1', releaseA.id);
      expect(denied).toEqual(DENIED);
      expect(await reveal('r1', ghost)).toEqual(denied);

      // Registrado so na trilha, como seguranca, sem o numero e sem ContactAccessEvent dele.
      const trail = await denials(ids.r1, releaseA.id);
      expect(trail).toHaveLength(1);
      expect(trail[0]).toMatchObject({ result: 'denied', details: { reason: 'not_recipient' } });
      expect(JSON.stringify(trail)).not.toMatch(new RegExp(PHONE_MARKERS.join('|')));
      expect((await accessEvents(releaseA.id)).some((e) => e.actorId === ids.r1)).toBe(false);
      // A solicitacao dele segue paga: nao e falta de pagamento, e falta de autorizacao.
      expect((await prisma().contactRequest.findUnique({ where: { id: requestR1 } }))?.status).toBe(
        'paid',
      );
    });

    it('C-4: quem tem a PROPRIA autorizacao apresenta a alheia e e negado por A2', async () => {
      // r2 e escolhido em B e conhece o id da autorizacao de A.
      expect(await reveal('r2', releaseB.id)).toMatchObject({ success: true });
      expect(await reveal('r2', releaseA.id)).toEqual(DENIED);
      // E o escolhido de A nao le a de B.
      expect(await reveal('r0', releaseB.id)).toEqual(DENIED);
      expect(await denials(ids.r2, releaseA.id)).toHaveLength(1);
    });

    it('C-5 (substituta, DV-13): ator autenticado sem relacao, que conhece os ids, e negado', async () => {
      for (const releaseId of [releaseA.id, releaseB.id]) {
        expect(await reveal('stranger', releaseId)).toEqual(DENIED);
      }
      expect(await reveal('stranger', 'nao-e-uuid')).toEqual(DENIED);
      expect(await denials(ids.stranger, releaseA.id)).toHaveLength(1);
      // O anunciante tambem nao recebe pela autorizacao: ele e o titular, nao o
      // destinatario (CR-8.1, ultima linha).
      expect(await reveal('owner', releaseA.id)).toEqual(DENIED);
    });

    it('A1: sem sessao, login; a tentativa fica na trilha sem ator', async () => {
      expect(await cookieStore.run('', () => revealContact(releaseA.id))).toEqual({
        success: false,
        reason: 'login_required',
        error: 'Entre na sua conta para ver o contato.',
      });
      const trail = await denials(null, releaseA.id);
      expect(trail.at(-1)).toMatchObject({ details: { reason: 'no_session' } });
    });

    it('A6: conta do escolhido bloqueada e negada, sem revogar; reativada, volta a receber', async () => {
      await prisma().user.update({ where: { id: ids.r0 }, data: { status: 'blocked_age' } });
      try {
        expect(await reveal('r0', releaseA.id)).toEqual(DENIED);
        expect((await denials(ids.r0, releaseA.id)).at(-1)).toMatchObject({
          details: { reason: 'account_restricted' },
        });
      } finally {
        await prisma().user.update({ where: { id: ids.r0 }, data: { status: 'active' } });
      }
      expect(await prisma().contactRelease.count({ where: { id: releaseA.id } })).toBe(1);
      expect(await reveal('r0', releaseA.id)).toMatchObject({ success: true });
    });

    it('CR-4.3 e DEC-029/027: reversao, negociacao encerrada e anuncio removido nao bloqueiam a releitura', async () => {
      await prisma().paymentAttempt.update({
        where: { contactRequestId: releaseA.contactRequestId },
        data: { status: 'reembolsada_ou_revertida' },
      });
      await prisma().negotiation.update({
        where: { id: releaseA.negotiationId },
        data: { status: 'closed', closedAt: new Date(), closedById: ids.r0 },
      });
      await prisma().listing.update({ where: { id: listingA }, data: { status: 'removed' } });
      expect(await reveal('r0', releaseA.id)).toEqual({ success: true, phone: OWNER_E164 });
    });

    describe('C-3 e A4: a entrega reverifica a cadeia, nao confia na escolha', () => {
      /** Autorizacao forjada direto no banco, fora do caso de uso de F3-009. */
      async function forgeRelease(input: {
        listingId: string;
        ownerTag: string;
        selectionRequestId: string;
        releaseRequestId: string;
        chosenTag: string;
      }) {
        const payment = await prisma().payment.findFirstOrThrow({
          where: { providerPaymentId: { startsWith: PAYMENT_PREFIX } },
          select: { id: true },
        });
        return prisma().$transaction(async (tx: Prisma.TransactionClient) => {
          const selection = await tx.selection.create({
            data: {
              listingId: input.listingId,
              contactRequestId: input.selectionRequestId,
              actorId: ids[input.ownerTag],
            },
          });
          const negotiation = await tx.negotiation.create({
            data: {
              selectionId: selection.id,
              listingId: input.listingId,
              ownerId: ids[input.ownerTag],
              chosenId: ids[input.chosenTag],
              status: 'active',
            },
          });
          return tx.contactRelease.create({
            data: {
              negotiationId: negotiation.id,
              listingId: input.listingId,
              contactRequestId: input.releaseRequestId,
              ownerId: ids[input.ownerTag],
              recipientId: ids[input.chosenTag],
              paymentId: payment.id,
            },
          });
        });
      }

      it('C-3: escolhido cuja solicitacao nao esta paid e negado (A5)', async () => {
        const listing = await publishedListing('other');
        const reserved = await as('r1', () => createContactRequest(listing));
        const requestId = (reserved as { contactRequestId: string }).contactRequestId;
        const forged = await forgeRelease({
          listingId: listing,
          ownerTag: 'other',
          selectionRequestId: requestId,
          releaseRequestId: requestId,
          chosenTag: 'r1',
        });
        expect(await reveal('r1', forged.id)).toEqual(DENIED);
        expect((await denials(ids.r1, forged.id)).at(-1)).toMatchObject({
          details: { reason: 'chain_mismatch' },
        });
        expect(await accessEvents(forged.id)).toHaveLength(0);
      });

      it('A4: autorizacao que aponta para outra solicitacao que a da escolha e negada', async () => {
        const listing = await publishedListing('other');
        const chosenRequest = await paidRequest(listing, 'r0');
        const otherRequest = await paidRequest(listing, 'r1');
        const forged = await forgeRelease({
          listingId: listing,
          ownerTag: 'other',
          selectionRequestId: chosenRequest,
          releaseRequestId: otherRequest,
          chosenTag: 'r1',
        });
        expect(await reveal('r1', forged.id)).toEqual(DENIED);
        expect(await accessEvents(forged.id)).toHaveLength(0);
      });
    });
  },
);
