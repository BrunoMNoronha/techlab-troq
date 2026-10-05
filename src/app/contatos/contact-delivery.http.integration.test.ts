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

function actionId(exportedName: string, filename: string): string {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), '.next', 'server', 'server-reference-manifest.json'), 'utf8'),
  ) as { node: Record<string, { exportedName?: string; filename?: string }> };
  const entry = Object.entries(manifest.node).find(
    ([, v]) => v.exportedName === exportedName && v.filename === filename,
  );
  if (!entry) throw new Error(`${exportedName} ausente do manifesto: rode pnpm build antes.`);
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
    'next-action': actionId('revealContact', 'src/app/contatos/actions.ts'),
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
  let listingId: string;
  let chosenRequest: string;
  let reservedRequest: string;
  let previousRelease: string;
  const invalidTags = [
    'anonymous',
    'unverified',
    'blocked_age',
    'blocked_admin',
    'deletion_requested',
    'revoked',
    'expired',
  ] as const;

  async function callPhase3Action(
    tag: string,
    name: string,
    file: string,
    path: string,
    args: unknown[],
  ) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        cookie: cookies[tag] ?? '',
        accept: 'text/x-component',
        'content-type': 'text/plain;charset=UTF-8',
        'next-action': actionId(name, file),
      },
      body: JSON.stringify(args),
    });
    return { status: res.status, body: await res.text() };
  }

  async function businessSnapshot() {
    const tables = [
      'user_contacts',
      'contact_requests',
      'contact_request_paid_guards',
      'payment_attempts',
      'payments',
      'payment_notifications',
      'reconciliation_cases',
      'technical_refunds',
      'selections',
      'negotiations',
      'contact_releases',
      'contact_access_events',
    ];
    const out: Record<string, unknown> = {};
    for (const table of tables)
      out[table] = await prisma().$queryRawUnsafe(
        `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS digest, count(*)::int AS n FROM "${table}" t`,
      );
    return out;
  }

  beforeAll(async () => {
    if (!process.env.BETTER_AUTH_SECRET) {
      throw new Error('Defina o mesmo BETTER_AUTH_SECRET do servidor em teste.');
    }
    for (const tag of [
      'owner',
      'chosen',
      'paid',
      'stranger',
      'reserved',
      'previous',
      ...invalidTags.filter((tag) => tag !== 'anonymous'),
    ])
      await createUser(tag);
    for (const tag of invalidTags) {
      if (tag === 'anonymous') {
        cookies[tag] = '';
        continue;
      }
      if (tag === 'unverified')
        await prisma().user.update({
          where: { id: ids[tag] },
          data: { emailVerified: false, emailVerifiedAt: null },
        });
      else if (tag === 'revoked')
        await prisma().session.deleteMany({ where: { userId: ids[tag] } });
      else if (tag === 'expired')
        await prisma().session.updateMany({
          where: { userId: ids[tag] },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        });
      else await prisma().user.update({ where: { id: ids[tag] }, data: { status: tag } });
    }
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
    listingId = listing.id;
    chosenRequest = await paidRequest(listing.id, ids.chosen, 1);
    await paidRequest(listing.id, ids.paid, 2);
    const now = new Date();
    const reserved = await prisma().contactRequest.create({
      data: {
        listingId,
        requesterId: ids.reserved,
        slotIndex: 3,
        status: 'reserved',
        reservedFrom: now,
        reservedUntil: new Date(now.getTime() + 30 * 60_000),
      },
    });
    reservedRequest = reserved.id;
    await prisma().paymentAttempt.create({
      data: {
        contactRequestId: reserved.id,
        externalReference: randomUUID(),
        idempotencyKey: randomUUID(),
        status: 'aguardando_pagamento',
      },
    });
    const old = await prisma().listing.create({
      data: {
        ownerId: ids.owner,
        title: `Anterior ${RUN_ID}`,
        description: 'Sintetico',
        city: 'Recife',
        uf: 'PE',
      },
    });
    await prisma().listing.update({ where: { id: old.id }, data: { status: 'published' } });
    const priorRequest = await paidRequest(old.id, ids.previous, 3);
    const prior = await selectForOwner(ids.owner, old.id, priorRequest);
    expect(prior.success).toBe(true);
    if (!prior.success) throw new Error('Escolha anterior recusada');
    previousRelease = (
      await prisma().contactRelease.findUniqueOrThrow({
        where: { negotiationId: prior.negotiationId },
      })
    ).id;
    await prisma().negotiation.update({
      where: { id: prior.negotiationId },
      data: { status: 'closed', closedAt: new Date(), closedById: ids.owner },
    });

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
          {
            eventType: 'contact.access_denied',
            actorId: null,
            targetId: { in: [releaseId, previousRelease] },
          },
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

  it.each(invalidTags)(
    'F3-014 (#104): %s, HTML/RSC e cinco actions reais recusados sem efeito de negocio',
    async (tag) => {
      const before = await businessSnapshot();
      for (const path of [
        '/contatos',
        '/solicitacoes',
        `/solicitacoes/${chosenRequest}`,
        `/anuncios/${listingId}/solicitacoes`,
      ]) {
        for (const rsc of [false, true]) {
          const response = await fetch(`${BASE_URL}${path}${rsc ? '?_rsc' : ''}`, {
            headers: { cookie: cookies[tag], ...(rsc ? { rsc: '1' } : {}) },
            redirect: 'manual',
          });
          const body = await response.text();
          expect(response.status).toBe(rsc ? 200 : 307);
          expect(rsc ? body : response.headers.get('location')).toContain('/login');
          expectNoPhone(body);
          expect(body).not.toContain(listingTitle);
          expect(body).not.toContain(releaseId);
        }
      }
      const reason =
        tag === 'unverified'
          ? 'email_unverified'
          : tag.startsWith('blocked') || tag === 'deletion_requested'
            ? 'account_restricted'
            : 'login_required';
      for (const [name, file, path, args] of [
        ['registerOwnContact', 'src/modules/contact/actions.ts', '/conta', [{ phone: PHONE_E164 }]],
        [
          'requestContactUnlock',
          'src/modules/request/actions.ts',
          `/explorar/${listingId}`,
          [listingId],
        ],
        [
          'getPixPayment',
          'src/modules/request/actions.ts',
          `/solicitacoes/${reservedRequest}`,
          [reservedRequest],
        ],
        [
          'chooseRequester',
          'src/modules/negotiation/actions.ts',
          `/anuncios/${listingId}/solicitacoes`,
          [{ listingId, contactRequestId: chosenRequest, confirmed: true }],
        ],
      ] as const) {
        const reply = await callPhase3Action(tag, name, file, path, [...args]);
        expect(reply.status).toBe(200);
        expect(reply.body).toContain(`"reason":"${reason}"`);
        expectNoPhone(reply.body);
      }
      const reveal = await callReveal(cookies[tag], releaseId);
      expect(reveal.status).toBe(200);
      expect(reveal.body).toContain('"success":false');
      expectNoPhone(reveal.body);
      expect(await businessSnapshot()).toEqual(before);
    },
  );

  it.each(['owner', 'chosen', 'paid', 'reserved', 'previous', 'stranger', ...invalidTags])(
    'F3-014 (#104): %s nao substitui o segredo dos tres jobs de pagamento',
    async (tag) => {
      const before = await businessSnapshot();
      for (const job of ['payments-reconcile', 'payments-refund-retry', 'payments-reversals']) {
        for (const authorization of [
          '',
          'Bearer incorreto-sintetico',
          'Basic incorreto-sintetico',
        ]) {
          const response = await fetch(`${BASE_URL}/api/jobs/${job}`, {
            headers: { cookie: cookies[tag], ...(authorization ? { authorization } : {}) },
            redirect: 'manual',
          });
          expect(response.status).toBe(401);
          expect(await response.text()).toBe('');
          expect(response.headers.get('cache-control')).toBe('no-store');
        }
      }
      expect(await businessSnapshot()).toEqual(before);
    },
  );

  it('F3-014 (#104): escolhido anterior conserva a propria autorizacao, mas nao recebe a nova', async () => {
    const before = await businessSnapshot();
    for (const tag of ['previous', 'reserved', 'paid', 'stranger', 'owner']) {
      const real = await callReveal(cookies[tag], releaseId);
      const ghost = await callReveal(cookies[tag], randomUUID());
      expect(real.status).toBe(200);
      expectNoPhone(real.body);
      expect(real.body.replace(/"b":"[^"]*"/, '')).toBe(ghost.body.replace(/"b":"[^"]*"/, ''));
      const pix = await callPhase3Action(
        tag === 'reserved' ? 'previous' : tag,
        'getPixPayment',
        'src/modules/request/actions.ts',
        `/solicitacoes/${reservedRequest}`,
        [reservedRequest],
      );
      expect(pix.body).toContain('"reason":"unavailable"');
    }
    expect(await businessSnapshot()).toEqual(before);
    const own = await callReveal(cookies.previous, previousRelease);
    expect(own.status).toBe(200);
    expect(own.body).toContain(`"phone":"${PHONE_E164}"`);
    expectNotStorable(own.cacheControl);
  });

  it.each(['unverified', 'blocked_age', 'blocked_admin', 'deletion_requested'] as const)(
    'F3-014 (#104): escolhido que virou %s perde a entrega da PROPRIA autorizacao por HTTP',
    async (restriction) => {
      await prisma().user.update({
        where: { id: ids.chosen },
        data:
          restriction === 'unverified'
            ? { emailVerified: false, emailVerifiedAt: null }
            : { status: restriction },
      });
      try {
        const before = await businessSnapshot();
        for (const rsc of [false, true]) {
          const response = await fetch(
            `${BASE_URL}/solicitacoes/${chosenRequest}${rsc ? '?_rsc' : ''}`,
            {
              headers: { cookie: cookies.chosen, ...(rsc ? { rsc: '1' } : {}) },
              redirect: 'manual',
            },
          );
          expect(response.status).toBe(rsc ? 200 : 307);
          expectNoPhone(await response.text());
        }
        const denied = await callReveal(cookies.chosen, releaseId);
        expect(denied.status).toBe(200);
        expect(denied.body).toContain('"success":false');
        expectNoPhone(denied.body);
        expect(await businessSnapshot()).toEqual(before);
      } finally {
        await prisma().user.update({
          where: { id: ids.chosen },
          data: { status: 'active', emailVerified: true, emailVerifiedAt: new Date() },
        });
      }
      // Sem revogacao da autorizacao: voltar ao estado elegivel permite releitura.
      const allowed = await callReveal(cookies.chosen, releaseId);
      expect(allowed.body).toContain(`"phone":"${PHONE_E164}"`);
      expectNotStorable(allowed.cacheControl);
    },
  );
});
