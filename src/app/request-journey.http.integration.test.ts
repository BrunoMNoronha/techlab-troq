// @vitest-environment node
//
// Prova HTTP de F3-012 (#102) contra um servidor Next.js REAL (`pnpm build` +
// `pnpm start`) sobre PostgreSQL REAL e descartavel, com os atores NAO
// autorizados reais (PD-13.2):
//
// - `/solicitacoes/[id]` e `/solicitacoes` (HTML e RSC): so o solicitante ve a
//   propria solicitacao; terceiro, dono do anuncio e outro solicitante recebem
//   o MESMO 404 de uma solicitacao inexistente; anonimo vai ao login com retorno;
//   respostas privadas e `no-store`; o Pix nunca esta no payload da pagina; com o
//   anuncio pausado, a tela nao oferece Pix (PD-6.11);
// - `/anuncios/[id]/solicitacoes`: so o dono ve as solicitacoes pagas
//   elegiveis (so o nome de exibicao); reserva nao paga nao aparece; quem nao e
//   dono recebe o mesmo 404 de anuncio inexistente;
// - as Server Actions `chooseRequester` e `requestContactUnlock`, chamadas como
//   o navegador as chama: terceiro e solicitante nao escolhem; anonimo nao
//   reserva; o dono escolhe com `confirmed: true`.
//
// Nenhuma resposta carrega o telefone do anunciante, e-mail, id de pagamento ou
// contagem de vagas. Servidor e teste usam o MESMO banco e o MESMO
// BETTER_AUTH_SECRET. So roda com INTEGRATION_EPHEMERAL_DB=1 e
// PRIVATE_SURFACE_BASE_URL (docs/engineering/testing.md). O servidor NAO tem
// credencial do Mercado Pago: nenhuma rota aqui chama o provedor.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { getPrismaClient } from '@/persistence/prisma';

vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

const BASE_URL = process.env.PRIVATE_SURFACE_BASE_URL?.replace(/\/$/, '') ?? '';
const enabled = process.env.INTEGRATION_EPHEMERAL_DB === '1' && BASE_URL !== '';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const PAYMENT_PREFIX = `http102-${RUN_ID}`;
const PHONE_E164 = '+5511987650102';
const PHONE_MARKERS = [PHONE_E164, PHONE_E164.slice(1), '11987650102', '987650102', '98765-0102'];

const prisma = () => getPrismaClient();
const userIds: string[] = [];
const ids: Record<string, string> = {};
const emails: Record<string, string> = {};
const names: Record<string, string> = {};
const cookies: Record<string, string> = { anon: '' };

async function createUser(tag: string): Promise<void> {
  const email = `http-jornada-${tag}-${RUN_ID}@example.test`;
  const displayName = `Pessoa ${tag} ${RUN_ID.slice(-6)}`;
  const res = await registerUser({
    displayName,
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
  emails[tag] = email;
  names[tag] = displayName;
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

/** Reserva viva (F3-003) semeada direto, com a tentativa ja aguardando pagamento. */
async function reservedRequest(listingId: string, requesterId: string, slotIndex: number) {
  const now = new Date();
  const request = await prisma().contactRequest.create({
    data: {
      listingId,
      requesterId,
      slotIndex,
      status: 'reserved',
      reservedFrom: now,
      reservedUntil: new Date(now.getTime() + 30 * 60_000),
    },
  });
  await prisma().paymentAttempt.create({
    data: {
      contactRequestId: request.id,
      idempotencyKey: randomUUID(),
      externalReference: `${PAYMENT_PREFIX}-r${slotIndex}`,
      status: 'aguardando_pagamento',
      providerOrderId: `${PAYMENT_PREFIX}-ORD${slotIndex}`,
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
  if (!entry) throw new Error(`${exportedName} ausente do manifesto: rode \`pnpm build\` antes.`);
  return entry[0];
}

interface Reply {
  status: number;
  body: string;
  location: string;
  cacheControl: string;
}

async function fetchPage(path: string, cookie: string, rsc = false): Promise<Reply> {
  const headers: Record<string, string> = { 'user-agent': 'agente-sintetico/1.0' };
  if (cookie) headers.cookie = cookie;
  let url = `${BASE_URL}${path}`;
  if (rsc) {
    headers.rsc = '1';
    url += `${path.includes('?') ? '&' : '?'}_rsc`;
  }
  const res = await fetch(url, { headers, redirect: 'manual' });
  return {
    status: res.status,
    body: await res.text(),
    location: res.headers.get('location') ?? '',
    cacheControl: res.headers.get('cache-control') ?? '',
  };
}

/** A Server Action como o navegador a chama (memoria de F3-010). */
async function callAction(path: string, id: string, cookie: string, args: unknown[]) {
  const headers: Record<string, string> = {
    'user-agent': 'agente-sintetico/1.0',
    accept: 'text/x-component',
    'content-type': 'text/plain;charset=UTF-8',
    'next-action': id,
  };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
    redirect: 'manual',
  });
  return { status: res.status, body: await res.text() };
}

const NOT_FOUND_ROW =
  /(?<=\\n|\n|")[0-9a-f]+:E\{\\?"digest\\?":\\?"NEXT_HTTP_ERROR_FALLBACK;404\\?"\}(?:\\n|\n)/g;

/** Mesma normalizacao das suites de superficie (listing-contract.md, 16.3). */
function normalize(body: string, id: string, rsc: boolean): string {
  const out = body
    .split(id)
    .join('<ID>')
    .replace(NOT_FOUND_ROW, '')
    .replace(/(\\?")[A-Za-z0-9_-]{21}([vm])(\\?")/g, '$1<REQ>$2$3')
    .replace(/self\.__next_r=\\?"[^"\\]*\\?"/g, 'self.__next_r=<REQ>')
    .replace(/sentry-trace[^>]*>/g, '')
    .replace(/baggage[^>]*>/g, '')
    .replace(/"(?:sentry-trace|baggage)":"[^"]*"/g, '');
  return rsc ? out.split('\n').sort().join('\n') : out;
}

function expectPrivate(reply: Reply) {
  expect(reply.cacheControl).toContain('private');
  expect(reply.cacheControl).toContain('no-store');
  expect(reply.cacheControl).not.toMatch(/public|s-maxage|stale-while-revalidate/);
}

function expectNoSecrets(body: string, extra: string[] = []) {
  for (const marker of [...PHONE_MARKERS, PAYMENT_PREFIX, ...extra]) {
    expect(body).not.toContain(marker);
  }
}

describe.skipIf(!enabled)('jornada de solicitacao por HTTP real (F3-012, #102)', () => {
  let listingId: string;
  let listingTitle: string;
  let paidId: string;
  let paid2Id: string;
  let reservedId: string;

  beforeAll(async () => {
    if (!process.env.BETTER_AUTH_SECRET) {
      throw new Error('Defina o mesmo BETTER_AUTH_SECRET do servidor em teste.');
    }
    for (const tag of ['owner', 'paid', 'paid2', 'reserved', 'stranger']) await createUser(tag);
    await prisma().userContact.create({ data: { userId: ids.owner, phoneNumber: PHONE_E164 } });

    listingTitle = `Bicicleta jornada HTTP ${RUN_ID}`;
    const listing = await prisma().listing.create({
      data: {
        ownerId: ids.owner,
        title: listingTitle,
        description: 'Descricao sintetica.',
        city: 'Recife',
        uf: 'PE',
      },
    });
    listingId = listing.id;
    await prisma().listing.update({ where: { id: listingId }, data: { status: 'published' } });
    paidId = await paidRequest(listingId, ids.paid, 1);
    paid2Id = await paidRequest(listingId, ids.paid2, 2);
    reservedId = await reservedRequest(listingId, ids.reserved, 3);
  });

  afterAll(async () => {
    const listings = await prisma().listing.findMany({
      where: { ownerId: { in: userIds } },
      select: { id: true },
    });
    const listingIds = listings.map((l) => l.id);
    await prisma().auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
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
    await prisma().userContact.deleteMany({ where: { userId: { in: userIds } } });
    await prisma().termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma().verification.deleteMany({
      where: { identifier: { in: userIds.map((u) => `email-verification:${u}`) } },
    });
    await prisma().user.deleteMany({ where: { id: { in: userIds } } });
    await prisma().$disconnect();
  });

  it('solicitante ve a propria solicitacao paga: privada, no-store, sem contato nem pagamento', async () => {
    for (const rsc of [false, true]) {
      const page = await fetchPage(`/solicitacoes/${paidId}`, cookies.paid, rsc);
      expect(page.status).toBe(200);
      expectPrivate(page);
      expect(page.body).toContain('Pagamento confirmado');
      expect(page.body).toContain(listingTitle);
      expectNoSecrets(page.body, [emails.paid, emails.owner, names.paid2, names.reserved]);
      expect(page.body).not.toMatch(/três vagas ocupadas|vagas ocupadas: \d/);
    }
  });

  it('terceiro, dono e outro solicitante recebem o MESMO 404 de uma solicitacao inexistente', async () => {
    const ghost = randomUUID();
    for (const rsc of [false, true]) {
      const reference = await fetchPage(`/solicitacoes/${ghost}`, cookies.stranger, rsc);
      expect(reference.status).toBe(rsc ? 200 : 404);
      const expected = normalize(reference.body, ghost, rsc);
      for (const tag of ['stranger', 'owner', 'paid2', 'reserved']) {
        const page = await fetchPage(`/solicitacoes/${paidId}`, cookies[tag], rsc);
        expect(page.status).toBe(reference.status);
        expect(normalize(page.body, paidId, rsc)).toBe(expected);
        expectNoSecrets(page.body, [listingTitle, names.paid]);
      }
    }
    const malformed = await fetchPage('/solicitacoes/nao-e-uuid', cookies.paid);
    expect(malformed.status).toBe(404);
  });

  it('anonimo vai ao login com retorno a solicitacao, sem dado nenhum', async () => {
    const page = await fetchPage(`/solicitacoes/${paidId}`, '');
    expect(page.status).toBe(307);
    expect(page.location).toContain('/login');
    expect(decodeURIComponent(page.location)).toContain(`next=/solicitacoes/${paidId}`);
    expectNoSecrets(page.body, [listingTitle, names.paid]);

    const list = await fetchPage('/solicitacoes', '');
    expect(list.status).toBe(307);
    expect(decodeURIComponent(list.location)).toContain('next=/solicitacoes');
  });

  it('a lista de cada pessoa so tem as solicitacoes dela', async () => {
    const own = await fetchPage('/solicitacoes', cookies.paid);
    expect(own.status).toBe(200);
    expectPrivate(own);
    expect(own.body).toContain(`/solicitacoes/${paidId}`);
    expect(own.body).not.toContain(paid2Id);
    expect(own.body).not.toContain(reservedId);

    const stranger = await fetchPage('/solicitacoes', cookies.stranger);
    expect(stranger.status).toBe(200);
    for (const id of [paidId, paid2Id, reservedId]) expect(stranger.body).not.toContain(id);
    expect(stranger.body).toContain('Você ainda não fez nenhuma solicitação.');
  });

  it('reserva viva: a tela do Pix existe, mas o Pix nunca esta no payload da pagina', async () => {
    for (const rsc of [false, true]) {
      const page = await fetchPage(`/solicitacoes/${reservedId}`, cookies.reserved, rsc);
      expect(page.status).toBe(200);
      expectPrivate(page);
      // No RSC o componente do Pix e so uma referencia; no HTML, o estado inicial.
      expect(page.body).toContain(rsc ? '"PixPanel"' : 'Pague R$ 0,99 via Pix');
      expect(page.body).not.toContain('000201');
      expectNoSecrets(page.body, [`${PAYMENT_PREFIX}-ORD`]);
    }
  });

  it('anuncio pausado (PD-6.11): a tela nao oferece Pix e preserva a vaga', async () => {
    await prisma().listing.update({ where: { id: listingId }, data: { status: 'paused' } });
    try {
      const page = await fetchPage(`/solicitacoes/${reservedId}`, cookies.reserved);
      expect(page.status).toBe(200);
      expect(page.body).toContain('Anúncio pausado pelo anunciante');
      expect(page.body).not.toContain('Pague R$ 0,99 via Pix');
    } finally {
      await prisma().listing.update({ where: { id: listingId }, data: { status: 'published' } });
    }
  });

  it('dono ve so as solicitacoes pagas elegiveis, so com nome de exibicao', async () => {
    for (const rsc of [false, true]) {
      const page = await fetchPage(`/anuncios/${listingId}/solicitacoes`, cookies.owner, rsc);
      expect(page.status).toBe(200);
      expectPrivate(page);
      expect(page.body).toContain(names.paid);
      expect(page.body).toContain(names.paid2);
      // Reserva nao paga nao aparece (CR-4.2).
      expect(page.body).not.toContain(names.reserved);
      expectNoSecrets(page.body, [emails.paid, emails.paid2, emails.reserved]);
    }
  });

  it('quem nao e dono recebe o MESMO 404 de anuncio inexistente', async () => {
    const ghost = randomUUID();
    for (const rsc of [false, true]) {
      const reference = await fetchPage(`/anuncios/${ghost}/solicitacoes`, cookies.stranger, rsc);
      expect(reference.status).toBe(rsc ? 200 : 404);
      const expected = normalize(reference.body, ghost, rsc);
      for (const tag of ['stranger', 'paid', 'reserved']) {
        const page = await fetchPage(`/anuncios/${listingId}/solicitacoes`, cookies[tag], rsc);
        expect(page.status).toBe(reference.status);
        expect(normalize(page.body, listingId, rsc)).toBe(expected);
        expectNoSecrets(page.body, [names.paid, names.paid2]);
      }
    }
    const anon = await fetchPage(`/anuncios/${listingId}/solicitacoes`, '');
    expect(anon.status).toBe(307);
    expect(anon.location).toContain('/login');
  });

  it('Server Actions por HTTP: anonimo nao reserva; terceiro e solicitante nao escolhem; dono escolhe', async () => {
    const unlock = actionId('requestContactUnlock', 'src/modules/request/actions.ts');
    const before = await prisma().contactRequest.count({ where: { listingId } });
    const anon = await callAction(`/explorar/${listingId}`, unlock, '', [listingId]);
    expect(anon.status).toBe(200);
    expect(anon.body).toContain('"reason":"login_required"');
    expect(await prisma().contactRequest.count({ where: { listingId } })).toBe(before);

    const choose = actionId('chooseRequester', 'src/modules/negotiation/actions.ts');
    const page = `/anuncios/${listingId}/solicitacoes`;
    const input = { listingId, contactRequestId: paidId, confirmed: true };
    for (const tag of ['stranger', 'paid', 'paid2', 'reserved']) {
      const reply = await callAction(page, choose, cookies[tag], [input]);
      expect(reply.status).toBe(200);
      expect(reply.body).toContain('"reason":"not_found"');
      expectNoSecrets(reply.body, [names.paid]);
    }
    const unconfirmed = await callAction(page, choose, cookies.owner, [
      { ...input, confirmed: false },
    ]);
    expect(unconfirmed.body).toContain('"reason":"confirmation_required"');
    expect(await prisma().selection.count({ where: { listingId } })).toBe(0);

    const owner = await callAction(page, choose, cookies.owner, [input]);
    expect(owner.status).toBe(200);
    expect(owner.body).toContain('"success":true');
    expectNoSecrets(owner.body);
    expect(await prisma().selection.count({ where: { listingId } })).toBe(1);

    // Depois da escolha: o escolhido e levado a /contatos; o outro pago, nao.
    const chosen = await fetchPage(`/solicitacoes/${paidId}`, cookies.paid);
    expect(chosen.body).toContain('Você foi escolhido pelo anunciante');
    expectNoSecrets(chosen.body);
    const other = await fetchPage(`/solicitacoes/${paid2Id}`, cookies.paid2);
    expect(other.body).not.toContain('Você foi escolhido');
    expect(other.body).toContain('Pagamento confirmado');
  });

  it('DEC-051 (#148): chamada HTTP direta de quem ja pagou nao cria reserva, tentativa ou pagamento', async () => {
    const unlock = actionId('requestContactUnlock', 'src/modules/request/actions.ts');
    const snapshot = async () => ({
      requests: await prisma().contactRequest.findMany({
        where: { listingId },
        orderBy: { id: 'asc' },
      }),
      attempts: await prisma().paymentAttempt.findMany({
        where: { contactRequest: { listingId } },
        orderBy: { id: 'asc' },
      }),
      payments: await prisma().payment.findMany({
        where: { paymentAttempt: { contactRequest: { listingId } } },
        orderBy: { id: 'asc' },
      }),
      audits: await prisma().auditEvent.count({ where: { actorId: ids.paid2 } }),
    });
    const before = await snapshot();
    const reply = await callAction(`/explorar/${listingId}`, unlock, cookies.paid2, [listingId]);
    expect(reply.status).toBe(200);
    expect(reply.body).toContain('"reason":"already_paid"');
    expectNoSecrets(reply.body);
    expect(await snapshot()).toEqual(before);

    // A reversao retira a elegibilidade financeira, mas paid e a vaga ficam.
    const attempt = await prisma().paymentAttempt.findUniqueOrThrow({
      where: { contactRequestId: paid2Id },
    });
    await prisma().paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'reembolsada_ou_revertida' },
    });
    try {
      const reversed = await snapshot();
      const again = await callAction(`/explorar/${listingId}`, unlock, cookies.paid2, [listingId]);
      expect(again.status).toBe(200);
      expect(again.body).toContain('"reason":"already_paid"');
      expect(await snapshot()).toEqual(reversed);
      const own = await fetchPage(`/explorar/${listingId}`, cookies.paid2);
      expect(own.body).toContain(`/solicitacoes/${paid2Id}`);
      expect(own.body).not.toContain('Confirmar e gerar Pix');
      const candidates = await fetchPage(`/anuncios/${listingId}/solicitacoes`, cookies.owner);
      expect(candidates.body).not.toContain(names.paid2);
    } finally {
      await prisma().paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'pagamento_confirmado' },
      });
    }
    // Nao escolhido depois do encerramento da negociacao: o bloqueio permanece.
    await prisma().negotiation.updateMany({
      where: { listingId },
      data: { status: 'closed', closedAt: new Date(), closedById: ids.owner },
    });
    const ended = await snapshot();
    const notChosen = await callAction(`/explorar/${listingId}`, unlock, cookies.paid2, [
      listingId,
    ]);
    expect(notChosen.body).toContain('"reason":"already_paid"');
    expect(await snapshot()).toEqual(ended);
    // Encerramento do anuncio usa a recusa comum de indisponibilidade.
    await prisma().listing.update({ where: { id: listingId }, data: { status: 'closed' } });
    const closed = await snapshot();
    const unavailable = await callAction(`/explorar/${listingId}`, unlock, cookies.paid2, [
      listingId,
    ]);
    expect(unavailable.body).toContain('"reason":"unavailable"');
    expect(await snapshot()).toEqual(closed);
  });
});
