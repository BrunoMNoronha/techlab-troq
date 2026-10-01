// @vitest-environment node
//
// Prova de F2-012 (#50): superficies RESTRITAS servidas por um servidor Next.js
// REAL (`pnpm build` + `pnpm start`) sobre PostgreSQL REAL e descartavel, por
// requisicoes HTTP reais (docs/delivery/phase-2-security-verification.md):
//
// - `/anuncios`, `/anuncios/novo`, `/anuncios/[id]/editar` e `/conta`, em
//   HTML e RSC, para anonimo, sessao revogada/expirada, nao verificado,
//   bloqueado, em exclusao, terceiro e dono;
// - nenhuma resposta carrega telefone persistido em `user_contacts`, hash de
//   senha, token de sessao, email ou id de outro usuario, chave de objeto ou
//   URL pre-assinada; `Cache-Control` nunca publico;
// - edicao de anuncio alheio, inexistente e malformado: o mesmo 404;
// - `/api/jobs/*` sem segredo ou com segredo errado: a mesma recusa, sem corpo;
// - `/api/auth/*`: escrita fechada (404 sem eco), leitura sem dado de terceiro.
//
// O servidor e o teste usam o MESMO banco efemero, o MESMO BETTER_AUTH_SECRET
// e o MESMO CRON_SECRET. So roda com INTEGRATION_EPHEMERAL_DB=1 e
// PRIVATE_SURFACE_BASE_URL (docs/engineering/testing.md).
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ListingStatus, UserStatus } from '@/generated/prisma/client';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { originalKey } from '@/modules/media/keys';
import { getPrismaClient } from '@/persistence/prisma';

vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

const BASE_URL = process.env.PRIVATE_SURFACE_BASE_URL?.replace(/\/$/, '') ?? '';
const enabled = process.env.INTEGRATION_EPHEMERAL_DB === '1' && BASE_URL !== '';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const PHONE = '+55 11 90000-0000';
// Forma canonica que `contact` grava (DM-4.5): e ela que o banco guarda (F3-002, #92).
const PHONE_E164 = '+5511900000000';
const PHONE_MARKERS = [PHONE, PHONE_E164, PHONE_E164.slice(1), '11900000000', '90000-0000'];

type Kind =
  | 'anonimo'
  | 'revogada'
  | 'expirada'
  | 'nao_verificado'
  | 'blocked_age'
  | 'blocked_admin'
  | 'deletion_requested'
  | 'terceiro'
  | 'dono';

interface Actor {
  kind: Kind;
  email: string;
  userId: string | null;
  cookie: string;
}

const userIds: string[] = [];

async function createVerifiedUser(email: string): Promise<string> {
  const res = await registerUser({
    displayName: 'Usuario Sintetico',
    email,
    password: PASSWORD,
    over18: true,
    termsAccepted: true,
  });
  expect(res.success).toBe(true);
  const prisma = getPrismaClient();
  const { id } = await prisma.user.findFirstOrThrow({ where: { email } });
  await prisma.user.update({
    where: { id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  await prisma.userContact.create({ data: { userId: id, phoneNumber: PHONE_E164 } });
  userIds.push(id);
  return id;
}

async function signIn(email: string): Promise<string> {
  const { headers } = await getAuth().api.signInEmail({
    body: { email, password: PASSWORD },
    headers: new Headers({ 'user-agent': 'agente-sintetico/1.0' }),
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function listingOf(ownerId: string, status: ListingStatus, title: string) {
  const prisma = getPrismaClient();
  const { id } = await prisma.listing.create({
    data: { ownerId, title, description: 'Descricao sintetica.', city: 'Recife', uf: 'PE' },
    select: { id: true },
  });
  const path: Record<ListingStatus, ListingStatus[]> = {
    draft: [],
    published: ['published'],
    paused: ['published', 'paused'],
    closed: ['closed'],
    removed: ['removed'],
  };
  for (const step of path[status]) {
    await prisma.listing.update({ where: { id }, data: { status: step } });
  }
  return id;
}

async function readyImage(listingId: string): Promise<string> {
  const id = randomUUID();
  await getPrismaClient().listingImage.create({
    data: {
      id,
      listingId,
      position: 1,
      status: 'ready',
      objectKey: originalKey(id, 1),
      width: 400,
      height: 300,
      sourceEtag: '"sintetico"',
      sourceConfirmedAt: new Date(),
      processedAt: new Date(),
    },
  });
  return id;
}

interface Page {
  status: number;
  body: string;
  location: string;
  cacheControl: string;
}

async function fetchPage(path: string, cookie: string, rsc = false): Promise<Page> {
  const headers: Record<string, string> = { 'user-agent': 'agente-sintetico/1.0' };
  if (cookie) headers.cookie = cookie;
  // Navegacao no cliente: `RSC: 1` e `_rsc` (vazio sem cabecalhos de roteamento),
  // como em public-surface.http.integration.test.ts.
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

const NOT_FOUND_ROW =
  /(?<=\\n|\n|")[0-9a-f]+:E\{\\?"digest\\?":\\?"NEXT_HTTP_ERROR_FALLBACK;404\\?"\}(?:\\n|\n)/g;

/** Mesma normalizacao da suite publica (listing-contract.md, 16.3). */
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

describe.skipIf(!enabled)('superficies restritas por HTTP real (#50)', () => {
  const actors = new Map<Kind, Actor>();
  let ownerDraft: string;
  let ownerPublished: string;
  let ownerImage: string;
  let thirdDraft: string;
  let secrets: string[];

  beforeAll(async () => {
    if (!process.env.BETTER_AUTH_SECRET || !process.env.CRON_SECRET) {
      throw new Error('Defina os mesmos BETTER_AUTH_SECRET e CRON_SECRET do servidor em teste.');
    }
    const prisma = getPrismaClient();
    for (const kind of [
      'dono',
      'terceiro',
      'revogada',
      'expirada',
      'nao_verificado',
      'blocked_age',
      'blocked_admin',
      'deletion_requested',
    ] as const) {
      const email = `sintetico-http-${kind}-${RUN_ID}@example.test`;
      const userId = await createVerifiedUser(email);
      const cookie = await signIn(email);
      if (kind === 'revogada') {
        await prisma.session.deleteMany({ where: { userId } });
      } else if (kind === 'expirada') {
        await prisma.session.updateMany({
          where: { userId },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        });
      } else if (kind === 'nao_verificado') {
        await prisma.user.update({
          where: { id: userId },
          data: { emailVerified: false, emailVerifiedAt: null },
        });
      } else if (kind !== 'dono' && kind !== 'terceiro') {
        await prisma.user.update({ where: { id: userId }, data: { status: kind as UserStatus } });
      }
      actors.set(kind, { kind, email, userId, cookie });
    }
    actors.set('anonimo', { kind: 'anonimo', email: '', userId: null, cookie: '' });

    const owner = actors.get('dono')!.userId!;
    ownerDraft = await listingOf(owner, 'draft', `Rascunho do dono ${RUN_ID}`);
    ownerImage = await readyImage(ownerDraft);
    ownerPublished = await listingOf(owner, 'published', `Publicado do dono ${RUN_ID}`);
    await readyImage(ownerPublished);
    thirdDraft = await listingOf(
      actors.get('terceiro')!.userId!,
      'draft',
      `Rascunho do terceiro ${RUN_ID}`,
    );

    // Segredos persistidos que nenhuma pagina pode devolver.
    const accounts = await prisma.account.findMany({
      where: { userId: { in: userIds } },
      select: { password: true },
    });
    const sessions = await prisma.session.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    secrets = [
      ...accounts.map((a) => a.password).filter((p): p is string => !!p),
      ...sessions.map((s) => s.token),
      PASSWORD,
    ];
  });

  afterAll(async () => {
    const prisma = getPrismaClient();
    const listings = { listing: { ownerId: { in: userIds } } };
    await prisma.listingImage.deleteMany({ where: listings });
    await prisma.listing.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.userContact.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.verification.deleteMany({
      where: { identifier: { in: userIds.map((u) => `email-verification:${u}`) } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  /** Marcadores proibidos para quem pede como `viewer`. */
  function expectClean(label: string, page: Page, viewer: Actor, requested = '') {
    const body = requested ? page.body.split(requested).join('<ID>') : page.body;
    for (const marker of [...PHONE_MARKERS, 'originals/', 'X-Amz-Signature', ...secrets]) {
      expect(body.includes(marker), `${label} contem segredo ou contato`).toBe(false);
    }
    for (const other of actors.values()) {
      if (other.kind === viewer.kind || !other.userId) continue;
      expect(body.includes(other.userId), `${label} contem id de ${other.kind}`).toBe(false);
      expect(body.includes(other.email), `${label} contem email de ${other.kind}`).toBe(false);
    }
    expect(page.cacheControl, label).not.toMatch(/public|s-maxage|stale-while-revalidate/);
  }

  const denied = [
    'anonimo',
    'revogada',
    'expirada',
    'nao_verificado',
    'blocked_age',
    'blocked_admin',
    'deletion_requested',
  ] as const;

  it.each(denied)('%s: toda pagina privada manda ao login, sem conteudo', async (kind) => {
    const viewer = actors.get(kind)!;
    for (const path of [
      '/anuncios',
      '/anuncios/novo',
      `/anuncios/${ownerDraft}/editar`,
      `/anuncios/${randomUUID()}/editar`,
      '/conta',
    ]) {
      for (const rsc of [false, true]) {
        const label = `${kind} ${rsc ? 'RSC' : 'HTML'} ${path}`;
        const page = await fetchPage(path, viewer.cookie, rsc);
        if (rsc) {
          // Navegacao no cliente (Next 16.3.5): HTTP 200 e o redirecionamento
          // vai no payload, como o 404 (listing-contract.md, 16.3).
          expect(page.status, label).toBe(200);
          expect(page.body, label).toMatch(/NEXT_REDIRECT;replace;\/login\?motivo=[a-z_-]+;307;/);
        } else {
          expect(page.status, label).toBe(307);
          expect(page.location, label).toMatch(/^\/login\?motivo=[a-z_-]+$/);
        }
        expect(page.body, label).not.toContain(RUN_ID);
        expectClean(label, page, viewer);
      }
    }
  });

  it('terceiro: ve so o que e dele; edicao do anuncio do dono e o mesmo 404 de inexistente', async () => {
    const third = actors.get('terceiro')!;
    const list = await fetchPage('/anuncios', third.cookie);
    expect(list.status).toBe(200);
    expect(list.body).toContain(`Rascunho do terceiro ${RUN_ID}`);
    expect(list.body).not.toContain('do dono');
    expectClean('terceiro /anuncios', list, third);

    for (const rsc of [false, true]) {
      let reference: string | null = null;
      for (const [label, id] of [
        ['do dono (rascunho)', ownerDraft],
        ['do dono (publicado)', ownerPublished],
        ['inexistente', randomUUID()],
        ['malformado', 'nao-uuid'],
      ] as const) {
        const page = await fetchPage(`/anuncios/${id}/editar`, third.cookie, rsc);
        const tag = `terceiro ${rsc ? 'RSC' : 'HTML'} editar ${label}`;
        if (rsc) {
          expect(page.body, tag).toContain('NEXT_HTTP_ERROR_FALLBACK;404');
        } else {
          expect(page.status, tag).toBe(404);
        }
        expect(page.body, tag).not.toContain('do dono');
        expectClean(tag, page, third, id);
        const normalized = normalize(page.body, id, rsc);
        reference ??= normalized;
        expect(normalized, tag).toBe(reference);
      }
    }

    const account = await fetchPage('/conta', third.cookie);
    expect(account.status).toBe(200);
    expect(account.body).toContain(third.email);
    expectClean('terceiro /conta', account, third);
  });

  it('dono: paginas privadas funcionam, sem contato, segredo, chave ou dado de terceiro', async () => {
    const owner = actors.get('dono')!;
    for (const path of [
      '/anuncios',
      '/anuncios/novo',
      `/anuncios/${ownerDraft}/editar`,
      '/conta',
    ]) {
      for (const rsc of [false, true]) {
        const label = `dono ${rsc ? 'RSC' : 'HTML'} ${path}`;
        const page = await fetchPage(path, owner.cookie, rsc);
        expect(page.status, label).toBe(200);
        expectClean(label, page, owner);
      }
    }
    // CR-2.5: /conta sabe que ha contato e oferece substituir, sem exibir digitos.
    const account = await fetchPage('/conta', owner.cookie);
    expect(account.body).toContain('Você tem um contato cadastrado');
    expect(account.body).toContain('Substituir contato');
    const edit = await fetchPage(`/anuncios/${ownerDraft}/editar`, owner.cookie);
    expect(edit.body).toContain(`Rascunho do dono ${RUN_ID}`);
    expect(edit.body).not.toContain(thirdDraft);
    // A miniatura do dono vem pela rota autorizada, nunca pela chave do objeto.
    expect(edit.body).not.toContain(originalKey(ownerImage, 1));
  });

  it('/api/jobs: sem segredo ou com segredo errado, a mesma recusa sem corpo', async () => {
    for (const job of ['media-process', 'media-cleanup']) {
      const responses = [];
      for (const auth of [
        undefined,
        'Bearer errado',
        `Bearer ${process.env.CRON_SECRET}x`,
        `Basic ${process.env.CRON_SECRET}`,
      ]) {
        const res = await fetch(`${BASE_URL}/api/jobs/${job}`, {
          headers: auth ? { authorization: auth } : {},
        });
        responses.push({
          status: res.status,
          body: await res.text(),
          cache: res.headers.get('cache-control'),
        });
      }
      for (const r of responses) {
        expect(r, job).toEqual({ status: 401, body: '', cache: 'no-store' });
      }
      // Sessao de usuario nao substitui o segredo.
      const withSession = await fetch(`${BASE_URL}/api/jobs/${job}`, {
        headers: { cookie: actors.get('dono')!.cookie },
      });
      expect(withSession.status, `${job} com sessao`).toBe(401);
    }
    const ok = await fetch(`${BASE_URL}/api/jobs/media-process`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys((await ok.json()) as object).sort()).toEqual(
      ['claimed', 'exhausted', 'failed', 'fenced', 'ready', 'retried'].sort(),
    );
  });

  it('/api/auth: escrita fechada sem eco; leitura so da propria sessao', async () => {
    for (const path of ['sign-in/email', 'sign-up/email', 'sign-out', 'reset-password']) {
      const res = await fetch(`${BASE_URL}/api/auth/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE_URL },
        body: JSON.stringify({ email: actors.get('dono')!.email, password: PASSWORD }),
      });
      const body = await res.text();
      expect(res.status, path).toBe(404);
      expect(body, path).toBe('');
    }
    const malformed = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email":',
    });
    expect(malformed.status).toBe(404);
    expect(await malformed.text()).toBe('');

    const forged = await fetch(`${BASE_URL}/api/auth/get-session`, {
      headers: { cookie: 'better-auth.session_token=forjado.assinatura' },
    });
    expect(forged.status).toBe(200);
    expect(await forged.text()).toBe('null');

    for (const kind of ['revogada', 'expirada'] as const) {
      const res = await fetch(`${BASE_URL}/api/auth/get-session`, {
        headers: { cookie: actors.get(kind)!.cookie },
      });
      expect(await res.text(), kind).toBe('null');
    }

    const own = await fetch(`${BASE_URL}/api/auth/get-session`, {
      headers: { cookie: actors.get('dono')!.cookie },
    });
    const ownBody = await own.text();
    expect(own.status).toBe(200);
    expect(own.headers.get('cache-control') ?? '').not.toMatch(/public|s-maxage/);
    expect(ownBody).toContain(actors.get('dono')!.email);
    for (const marker of [...PHONE_MARKERS, PASSWORD, ...secrets.filter((s) => s.includes(':'))]) {
      expect(ownBody.includes(marker), 'get-session contem contato ou hash').toBe(false);
    }
    for (const other of actors.values()) {
      if (other.kind === 'dono' || !other.userId) continue;
      expect(ownBody).not.toContain(other.userId);
    }

    const unknown = await fetch(`${BASE_URL}/api/auth/list-sessions`, {
      headers: { cookie: actors.get('dono')!.cookie },
    });
    expect(unknown.status).toBe(404);
  });
});
