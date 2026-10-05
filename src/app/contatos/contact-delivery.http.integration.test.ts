// @vitest-environment node
//
// Prova HTTP de F3-010 (#100) contra um servidor Next.js REAL (`pnpm build` +
// `pnpm start`) sobre PostgreSQL REAL e descartavel (contact-release.md, CR-6,
// CR-7, C-7 e C-11):
//
// - `/contatos` (HTML e RSC) do escolhido: dinamica, `private` e `no-store`, e o
//   payload NAO contem o numero -- so o id da autorizacao (C-11);
// - a Server Action `revealContact`, chamada como o navegador a chama (POST com
//   `Next-Action`): entrega ao escolhido com `no-store`, e nega a quem nao e,
//   sem o numero em lugar nenhum da resposta (C-7, C-2);
// - a rota nao e estatica nem revalidada por tempo: nada no manifesto de
//   pre-renderizacao (C-7).
//
// O id da action vem do manifesto do build (`server-reference-manifest.json`),
// pelo nome exportado e pelo arquivo. Servidor e teste usam o MESMO banco e o
// MESMO BETTER_AUTH_SECRET. So roda com INTEGRATION_EPHEMERAL_DB=1 e
// PRIVATE_SURFACE_BASE_URL (docs/engineering/testing.md).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { selectForOwner, type SelectionResult } from '@/modules/negotiation';
import { getPrismaClient } from '@/persistence/prisma';

vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

const BASE_URL = process.env.PRIVATE_SURFACE_BASE_URL?.replace(/\/$/, '') ?? '';
const enabled = process.env.INTEGRATION_EPHEMERAL_DB === '1' && BASE_URL !== '';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const PAYMENT_PREFIX = `http100-${RUN_ID}`;
const PHONE_E164 = '+5511987650123';
const PHONE_MARKERS = [PHONE_E164, PHONE_E164.slice(1), '11987650123', '987650123', '98765-0123'];

const prisma = () => getPrismaClient();
const userIds: string[] = [];
const ids: Record<string, string> = {};
const cookies: Record<string, string> = {};

async function createUser(tag: string): Promise<void> {
  const email = `http-entrega-${tag}-${RUN_ID}@example.test`;
  const res = await registerUser({
    displayName: `Pessoa ${tag}`,
    email,
    password: PASSWORD,
    over18: true,
    termsAccepted: true,
  });
  expect(res.success).toBe(true);
  const { id } = await prisma().user.findFirstOrThrow({ where: { email } });
  await prisma().user.update({
    where: { id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  userIds.push(id);
  ids[tag] = id;
  const { headers } = await getAuth().api.signInEmail({
    body: { email, password: PASSWORD },
    headers: new Headers({ 'user-agent': 'agente-sintetico/1.0' }),
    returnHeaders: true,
  });
  cookies[tag] = headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

/** Solicitacao paga com o que F3-003 e F3-006 gravam, semeada direto. */
async function paidRequest(listingId: string, requesterId: string, slotIndex: number) {
  const now = new Date();
  const request = await prisma().contactRequest.create({
    data: {
      listingId,
      requesterId,
      slotIndex,
      status: 'paid',
      reservedFrom: new Date(now.getTime() - 60_000),
      reservedUntil: new Date(now.getTime() + 29 * 60_000),
      paidAt: now,
    },
  });
  const attempt = await prisma().paymentAttempt.create({
    data: {
      contactRequestId: request.id,
      idempotencyKey: randomUUID(),
      externalReference: `${PAYMENT_PREFIX}-${slotIndex}`,
      status: 'pagamento_confirmado',
      accreditedAt: now,
      recognizedAt: now,
    },
  });
  await prisma().payment.create({
    data: {
      paymentAttemptId: attempt.id,
      providerPaymentId: `${PAYMENT_PREFIX}-${slotIndex}`,
      amountCents: 99,
      providerStatus: 'processed',
      accreditedAt: now,
      isCanonical: true,
    },
  });
  return request.id;
}

function revealActionId(): string {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), '.next', 'server', 'server-reference-manifest.json'), 'utf8'),
  ) as { node: Record<string, { exportedName?: string; filename?: string }> };
  const entry = Object.entries(manifest.node).find(
    ([, v]) => v.exportedName === 'revealContact' && v.filename === 'src/app/contatos/actions.ts',
  );
  if (!entry) throw new Error('revealContact ausente do manifesto: rode `pnpm build` antes.');
  return entry[0];
}

interface Reply {
  status: number;
  body: string;
  location: string;
  cacheControl: string;
}

async function getPage(cookie: string, rsc = false): Promise<Reply> {
  const headers: Record<string, string> = { 'user-agent': 'agente-sintetico/1.0' };
  if (cookie) headers.cookie = cookie;
  if (rsc) headers.rsc = '1';
  const res = await fetch(`${BASE_URL}/contatos${rsc ? '?_rsc' : ''}`, {
    headers,
    redirect: 'manual',
  });
  return {
    status: res.status,
    body: await res.text(),
    location: res.headers.get('location') ?? '',
    cacheControl: res.headers.get('cache-control') ?? '',
  };
}

/** A Server Action como o navegador a chama. */
async function callReveal(cookie: string, releaseId: string): Promise<Reply> {
  const headers: Record<string, string> = {
    'user-agent': 'agente-sintetico/1.0',
    accept: 'text/x-component',
    'content-type': 'text/plain;charset=UTF-8',
    'next-action': revealActionId(),
  };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${BASE_URL}/contatos`, {
    method: 'POST',
    headers,
    body: JSON.stringify([releaseId]),
    redirect: 'manual',
  });
  return {
    status: res.status,
    body: await res.text(),
    location: res.headers.get('location') ?? '',
    cacheControl: res.headers.get('cache-control') ?? '',
  };
}

function expectNotStorable(cacheControl: string) {
  expect(cacheControl).toContain('no-store');
  expect(cacheControl).not.toMatch(/public|s-maxage|stale-while-revalidate/);
}

function expectNoPhone(body: string) {
  for (const marker of PHONE_MARKERS) expect(body).not.toContain(marker);
}

describe.skipIf(!enabled)('entrega do contato por HTTP real (#100)', () => {
  let releaseId: string;
  let listingTitle: string;

  beforeAll(async () => {
    if (!process.env.BETTER_AUTH_SECRET) {
      throw new Error('Defina o mesmo BETTER_AUTH_SECRET do servidor em teste.');
    }
    for (const tag of ['owner', 'chosen', 'paid', 'stranger']) await createUser(tag);
    await prisma().userContact.create({ data: { userId: ids.owner, phoneNumber: PHONE_E164 } });

    listingTitle = `Bicicleta HTTP ${RUN_ID}`;
    const listing = await prisma().listing.create({
      data: {
        ownerId: ids.owner,
        title: listingTitle,
        description: 'Descricao sintetica.',
        city: 'Recife',
        uf: 'PE',
      },
    });
    await prisma().listing.update({ where: { id: listing.id }, data: { status: 'published' } });
    const chosenRequest = await paidRequest(listing.id, ids.chosen, 1);
    await paidRequest(listing.id, ids.paid, 2);

    const res = await selectForOwner(ids.owner, listing.id, chosenRequest);
    expect(res.success).toBe(true);
    const { negotiationId } = res as Extract<SelectionResult, { success: true }>;
    releaseId = (await prisma().contactRelease.findUniqueOrThrow({ where: { negotiationId } })).id;
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
          { eventType: 'contact.access_denied', actorId: null, targetId: releaseId },
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
    await prisma().listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma().userContact.deleteMany({ where: { userId: { in: userIds } } });
    await prisma().termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma().verification.deleteMany({
      where: { identifier: { in: userIds.map((u) => `email-verification:${u}`) } },
    });
    await prisma().user.deleteMany({ where: { id: { in: userIds } } });
    await prisma().$disconnect();
  });

  it('C-11 e C-7: a pagina do escolhido lista a autorizacao, sem o numero, privada e no-store', async () => {
    for (const rsc of [false, true]) {
      const page = await getPage(cookies.chosen, rsc);
      expect(page.status).toBe(200);
      expect(page.body).toContain(releaseId);
      expect(page.body).toContain(listingTitle);
      expectNoPhone(page.body);
      expect(page.cacheControl).toContain('private');
      expectNotStorable(page.cacheControl);
    }
  });

  it('a pagina de quem nao e escolhido nao menciona a autorizacao; anonimo vai ao login', async () => {
    for (const tag of ['paid', 'stranger', 'owner']) {
      const page = await getPage(cookies[tag]);
      expect(page.status).toBe(200);
      expect(page.body).not.toContain(releaseId);
      expectNoPhone(page.body);
    }
    const anon = await getPage('');
    expect(anon.status).toBe(307);
    expect(anon.location).toContain('/login');
    expectNoPhone(anon.body);
  });

  it('C-7 e C-6: a action entrega ao escolhido com no-store, e o acesso fica registrado', async () => {
    const before = await prisma().contactAccessEvent.count({
      where: { contactReleaseId: releaseId },
    });
    const reply = await callReveal(cookies.chosen, releaseId);
    expect(reply.status).toBe(200);
    expect(reply.body).toContain(`"phone":"${PHONE_E164}"`);
    expectNotStorable(reply.cacheControl);
    expect(
      await prisma().contactAccessEvent.count({ where: { contactReleaseId: releaseId } }),
    ).toBe(before + 1);
  });

  it('C-2 e A1: pago nao escolhido, terceiro, dono e anonimo nao recebem o numero', async () => {
    const replies = await Promise.all(
      ['paid', 'stranger', 'owner', ''].map((tag) =>
        callReveal(tag ? cookies[tag] : '', releaseId),
      ),
    );
    for (const reply of replies) {
      expect(reply.status).toBe(200);
      expectNoPhone(reply.body);
      expectNotStorable(reply.cacheControl);
    }
    expect(replies.slice(0, 3).every((r) => r.body.includes('Contato indisponível.'))).toBe(true);
    // Negativa sem canal lateral: identica a de um id que nao existe.
    const ghost = await callReveal(cookies.paid, randomUUID());
    const strip = (body: string) => body.replace(/"b":"[^"]*"/, '');
    expect(strip(replies[0].body)).toBe(strip(ghost.body));
  });

  it('C-7: a rota nao e pre-renderizada nem revalidada por tempo', () => {
    const prerender = JSON.parse(
      readFileSync(join(process.cwd(), '.next', 'prerender-manifest.json'), 'utf8'),
    ) as { routes: Record<string, unknown>; dynamicRoutes: Record<string, unknown> };
    expect(Object.keys(prerender.routes)).not.toContain('/contatos');
    expect(Object.keys(prerender.dynamicRoutes)).not.toContain('/contatos');
  });
});
