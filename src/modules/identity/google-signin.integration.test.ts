// @vitest-environment node
//
// Prova de integracao da entrada com Conta Google (#81; docs/architecture/
// identity-contract.md, IC-15) contra o Better Auth REAL e PostgreSQL REAL e
// descartavel. O callback roda pela rota real `/api/auth/callback/google`, com
// state, cookie assinado, PKCE e hooks do provedor de verdade.
//
// O que e simulado: somente o Google. O endpoint de token
// (https://oauth2.googleapis.com/token) e respondido por um `fetch` falso que
// confere o PKCE e devolve um id_token com as claims do cenario. Isso prova o
// comportamento do TROQ e do Better Auth diante de cada resposta do Google; NAO
// prova a configuracao real do cliente OAuth, a tela de consentimento nem as
// URIs cadastradas, que exigem o Google real (docs/delivery/google-sign-in-proof.md).
//
// Do Next.js, so `headers()` e `cookies()` sao simulados, para que as Server
// Actions leiam o mesmo "navegador" que a rota. O `nextCookies()` do provedor
// nao grava fora de uma requisicao do Next, por isso o inicio de cada fluxo usa
// `auth.api.signInSocial({ returnHeaders: true })` com o mesmo corpo da action.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1 (docs/engineering/
// testing.md, secao 2.2). Dados, segredo e credenciais sao sinteticos.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrismaClient } from '@/persistence/prisma';
import type { UserStatus } from '@/generated/prisma/client';
import { GET as authRoute } from '@/app/api/auth/[...all]/route';
import { GET as googleReturnRoute } from '@/app/login/google/route';
import { logoutUser, registerUser } from './actions';
import { getAuth } from './auth';
import { GOOGLE_SIGNUP_PREFIX } from './google';
import {
  cancelGoogleSignup,
  completeGoogleSignup,
  linkGoogleAccount,
  startGoogleSignIn,
} from './google-actions';
import { validateSession } from './index';

// ---------------------------------------------------------------------------
// "Navegador": jar de cookies lido por headers()/cookies() e pela rota.
// ---------------------------------------------------------------------------
type Jar = Map<string, string>;
let browser: Jar = new Map();
// Navegador da chamada corrente, quando varias Server Actions correm em paralelo.
const concurrentBrowser = new AsyncLocalStorage<Jar>();
const currentBrowser = (): Jar => concurrentBrowser.getStore() ?? browser;

function cookieHeader(jar: Jar): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

function absorb(jar: Jar, setCookies: string[]) {
  for (const raw of setCookies) {
    const [pair, ...attrs] = raw.split(';');
    const index = pair.indexOf('=');
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === '';
    if (expired) jar.delete(name);
    else jar.set(name, value);
  }
}

vi.mock('next/headers', () => ({
  headers: async () => {
    const jar = currentBrowser();
    return new Headers(jar.size ? { cookie: cookieHeader(jar) } : {});
  },
  cookies: async () => ({
    get: (name: string) => {
      const jar = currentBrowser();
      return jar.has(name) ? { name, value: jar.get(name)! } : undefined;
    },
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0 || value === '') currentBrowser().delete(name);
      else currentBrowser().set(name, value);
    },
  }),
}));

vi.mock('./email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

// ---------------------------------------------------------------------------
// Google simulado: endpoint de token.
// ---------------------------------------------------------------------------
const CLIENT_ID = 'cliente-sintetico.apps.googleusercontent.com';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

interface GoogleClaims {
  sub: string;
  email: string;
  email_verified: boolean;
}

/** Codigo de autorizacao emitido pelo "Google" -> claims e desafio PKCE. */
const issuedCodes = new Map<string, { claims: GoogleClaims; challenge: string }>();
let tokenEndpointFails = false;
const tokenRequests: URLSearchParams[] = [];

function fakeIdToken(claims: GoogleClaims): string {
  const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${enc({ alg: 'RS256', kid: 'sintetico' })}.${enc({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    iat: now,
    exp: now + 3600,
    ...claims,
  })}.assinatura-sintetica`;
}

const realFetch = globalThis.fetch;
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url !== TOKEN_ENDPOINT) {
    if (url.startsWith('https://')) throw new Error(`rede externa inesperada: ${url}`);
    return realFetch(input, init);
  }
  const rawBody = input instanceof Request ? await input.clone().text() : String(init?.body ?? '');
  const body = new URLSearchParams(rawBody);
  tokenRequests.push(body);
  const issued = issuedCodes.get(body.get('code') ?? '');
  const verifier = body.get('code_verifier') ?? '';
  const pkceOk =
    issued && createHash('sha256').update(verifier).digest('base64url') === issued.challenge;
  if (tokenEndpointFails || !issued || !pkceOk) {
    return new Response(JSON.stringify({ error: 'invalid_grant' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  issuedCodes.delete(body.get('code')!); // codigo de uso unico, como no Google
  return new Response(
    JSON.stringify({
      access_token: 'token-de-acesso-sintetico',
      id_token: fakeIdToken(issued.claims),
      expires_in: 3599,
      token_type: 'Bearer',
      scope: 'openid https://www.googleapis.com/auth/userinfo.email',
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

// ---------------------------------------------------------------------------
// Fluxo
// ---------------------------------------------------------------------------
const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const emailOf = (label: string) => `g-${label}-${RUN_ID}@example.test`;
const subOf = (label: string) => `sub-${label}-${RUN_ID}`;
const PASSWORD = 'senha-sintetica-123';
const createdEmails: string[] = [];
const startedStates: string[] = [];

interface Started {
  state: string;
  authorizationURL: URL;
}

/** Inicio do fluxo com o mesmo corpo de `startGoogleSignIn`, capturando o cookie de state. */
async function begin(jar: Jar, body: Record<string, unknown> = {}): Promise<Started> {
  const { headers, response } = await getAuth().api.signInSocial({
    body: {
      provider: 'google',
      callbackURL: '/conta',
      errorCallbackURL: '/login/google?next=%2Fconta',
      disableRedirect: true,
      ...body,
    },
    headers: new Headers({ cookie: cookieHeader(jar) }),
    returnHeaders: true,
  });
  absorb(jar, headers.getSetCookie());
  const authorizationURL = new URL((response as { url: string }).url);
  const state = authorizationURL.searchParams.get('state')!;
  startedStates.push(state);
  return { state, authorizationURL };
}

/** O "Google" autoriza e redireciona o navegador ao callback real do TROQ. */
async function callback(jar: Jar, started: Started, claims: GoogleClaims): Promise<Response> {
  const code = randomBytes(12).toString('hex');
  issuedCodes.set(code, {
    claims,
    challenge: started.authorizationURL.searchParams.get('code_challenge')!,
  });
  return rawCallback(jar, `code=${code}&state=${encodeURIComponent(started.state)}`);
}

async function rawCallback(jar: Jar, query: string): Promise<Response> {
  const res = await authRoute(
    new Request(`http://localhost:3000/api/auth/callback/google?${query}`, {
      headers: jar.size ? { cookie: cookieHeader(jar) } : {},
    }),
  );
  absorb(jar, res.headers.getSetCookie());
  return res;
}

function locationOf(res: Response): URL {
  expect([302, 303]).toContain(res.status);
  return new URL(res.headers.get('location')!, 'http://localhost:3000');
}

function claimsFor(label: string, overrides: Partial<GoogleClaims> = {}): GoogleClaims {
  createdEmails.push(overrides.email ?? emailOf(label));
  return { sub: subOf(label), email: emailOf(label), email_verified: true, ...overrides };
}

async function signupCookie(jar: Jar): Promise<string | undefined> {
  return jar.get('troq-google-signup');
}

async function pendingRows(): Promise<number> {
  return getPrismaClient().verification.count({
    where: { identifier: { startsWith: GOOGLE_SIGNUP_PREFIX } },
  });
}

function googleAccounts(sub: string) {
  return getPrismaClient().account.findMany({ where: { providerId: 'google', accountId: sub } });
}

function usersWithEmail(email: string) {
  return getPrismaClient().user.findMany({ where: { email } });
}

/** Leva uma identidade nova do callback ate a conta criada (18+ e termos aceitos). */
async function signUpWithGoogle(label: string, displayName = 'Pessoa Google'): Promise<Jar> {
  const jar: Jar = new Map();
  const res = await callback(jar, await begin(jar), claimsFor(label));
  expect(locationOf(res).searchParams.get('error')).toBe('google_signup_required');
  browser = jar;
  const done = await completeGoogleSignup({ displayName, over18: true, termsAccepted: true });
  expect(done.success).toBe(true);
  return jar;
}

async function createPasswordUser(
  email: string,
  { verified = true, status = 'active' as UserStatus } = {},
) {
  createdEmails.push(email);
  const res = await registerUser({
    displayName: 'Pessoa Senha',
    email,
    password: PASSWORD,
    over18: true,
    termsAccepted: true,
  });
  expect(res.success).toBe(true);
  const { id } = await getPrismaClient().user.findFirstOrThrow({ where: { email } });
  await getPrismaClient().user.update({
    where: { id },
    data: { emailVerified: verified, emailVerifiedAt: verified ? new Date() : null, status },
  });
  return id;
}

async function passwordSession(email: string): Promise<Jar> {
  const { headers } = await getAuth().api.signInEmail({
    body: { email, password: PASSWORD },
    headers: new Headers(),
    returnHeaders: true,
  });
  const jar: Jar = new Map();
  absorb(jar, headers.getSetCookie());
  return jar;
}

type GlobalWithAuth = typeof globalThis & { __troqAuth?: unknown };

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'entrada com Conta Google: Better Auth real contra PostgreSQL descartavel (#81)',
  () => {
    beforeAll(() => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
      vi.stubEnv('GOOGLE_CLIENT_ID', CLIENT_ID);
      vi.stubEnv('GOOGLE_CLIENT_SECRET', `segredo-sintetico-${randomBytes(8).toString('hex')}`);
      delete (globalThis as GlobalWithAuth).__troqAuth;
      vi.spyOn(globalThis, 'fetch').mockImplementation(fakeFetch);
    });

    beforeEach(() => {
      browser = new Map();
      tokenEndpointFails = false;
    });

    afterEach(() => {
      browser = new Map();
    });

    afterAll(async () => {
      const prisma = getPrismaClient();
      const users = await prisma.user.findMany({
        where: { email: { in: createdEmails } },
        select: { id: true },
      });
      const ids = users.map((u) => u.id);
      await prisma.termsAcceptance.deleteMany({ where: { userId: { in: ids } } });
      await prisma.verification.deleteMany({
        where: {
          OR: [
            { identifier: { startsWith: GOOGLE_SIGNUP_PREFIX } },
            { identifier: { in: startedStates } },
            { identifier: { in: ids.map((id) => `email-verification:${id}`) } },
          ],
        },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.$disconnect();
      delete (globalThis as GlobalWithAuth).__troqAuth;
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    describe('pedido ao Google', () => {
      it('pede so openid e email, sem acesso offline, com PKCE e state, e callback fixo', async () => {
        const { authorizationURL } = await begin(new Map());
        const params = authorizationURL.searchParams;
        expect(authorizationURL.origin + authorizationURL.pathname).toBe(
          'https://accounts.google.com/o/oauth2/v2/auth',
        );
        expect(params.get('scope')?.split(' ').sort()).toEqual(['email', 'openid']);
        expect(params.get('client_id')).toBe(CLIENT_ID);
        expect(params.get('redirect_uri')).toBe('http://localhost:3000/api/auth/callback/google');
        expect(params.get('code_challenge_method')).toBe('S256');
        expect(params.get('state')).toBeTruthy();
        expect(params.has('access_type')).toBe(false);
        expect(params.has('include_granted_scopes')).toBe(false);
      });

      it('startGoogleSignIn devolve a URL do Google e descarta destino externo', async () => {
        const res = await startGoogleSignIn('https://evil.example/roubo');
        expect(res.success).toBe(true);
        expect(new URL(res.redirectTo!).origin).toBe('https://accounts.google.com');
      });
    });

    describe('primeiro acesso: cadastro so depois de 18+ e termos', () => {
      it('o callback de identidade nova nao cria conta nem sessao; grava so a pendencia e o cookie', async () => {
        const jar: Jar = new Map();
        const claims = claimsFor('novo');
        const before = await pendingRows();

        const res = await callback(jar, await begin(jar), claims);

        const location = locationOf(res);
        expect(location.pathname).toBe('/login/google');
        expect(location.searchParams.get('error')).toBe('google_signup_required');
        expect(location.searchParams.get('next')).toBe('/conta');
        const setCookies = res.headers.getSetCookie();
        const signup = setCookies.find((c) => c.startsWith('troq-google-signup='));
        expect(signup).toMatch(/HttpOnly/i);
        expect(signup).toMatch(/SameSite=Lax/i);
        expect(setCookies.some((c) => c.includes('session_token='))).toBe(false);

        expect(await usersWithEmail(claims.email)).toHaveLength(0);
        expect(await googleAccounts(claims.sub)).toHaveLength(0);
        expect(await pendingRows()).toBe(before + 1);
        // O banco guarda o hash do handle, nunca o handle do cookie.
        const handle = (await signupCookie(jar))!;
        const raw = await getPrismaClient().verification.findMany({
          where: { identifier: { startsWith: GOOGLE_SIGNUP_PREFIX } },
          select: { identifier: true, value: true },
        });
        expect(raw.some((r) => r.identifier.includes(handle) || r.value.includes(handle))).toBe(
          false,
        );

        // A rota de retorno leva a conclusao, preservando o destino interno.
        const forwarded = googleReturnRoute(new Request(location.href));
        expect(forwarded.status).toBe(303);
        expect(forwarded.headers.get('location')).toBe('/cadastro/google?next=%2Fconta');
      });

      it('sem 18+ ou sem termos nada e criado e a pendencia continua', async () => {
        const jar: Jar = new Map();
        const claims = claimsFor('recusa');
        await callback(jar, await begin(jar), claims);
        browser = jar;

        for (const input of [
          { displayName: 'Pessoa', over18: false, termsAccepted: true },
          { displayName: 'Pessoa', over18: true, termsAccepted: false },
          { displayName: 'P', over18: true, termsAccepted: true },
        ]) {
          const res = await completeGoogleSignup(input);
          expect(res.success).toBe(false);
        }
        // Valores "truthy" que nao sao o ato afirmativo `true` tambem sao recusados.
        const forged = await completeGoogleSignup({
          displayName: 'Pessoa',
          over18: 'true' as unknown as boolean,
          termsAccepted: true,
        });
        expect(forged.success).toBe(false);

        expect(await usersWithEmail(claims.email)).toHaveLength(0);
        expect(await signupCookie(jar)).toBeTruthy();
      });

      it('cancelar descarta a pendencia e o cookie, sem deixar conta', async () => {
        const jar: Jar = new Map();
        const claims = claimsFor('cancela');
        await callback(jar, await begin(jar), claims);
        browser = jar;
        const before = await pendingRows();

        const res = await cancelGoogleSignup();

        expect(res).toEqual({ success: true, redirectTo: '/login?motivo=google_cancelado' });
        expect(await pendingRows()).toBe(before - 1);
        expect(await signupCookie(jar)).toBeUndefined();
        expect(await usersWithEmail(claims.email)).toHaveLength(0);
        expect((await completeGoogleSignup(validInput())).success).toBe(false);
      });

      it('conclusao sem cookie ou com cookie forjado e recusada', async () => {
        browser = new Map();
        expect((await completeGoogleSignup(validInput())).success).toBe(false);
        browser = new Map([['troq-google-signup', 'A'.repeat(43)]]);
        expect((await completeGoogleSignup(validInput())).success).toBe(false);
      });

      it('com 18+ e termos cria conta, identidade e aceite numa transacao, e manda entrar pelo Google', async () => {
        const jar: Jar = new Map();
        const claims = claimsFor('cria');
        await callback(jar, await begin(jar), claims);
        browser = jar;
        const handle = (await signupCookie(jar))!;

        const res = await completeGoogleSignup({ ...validInput(), returnTo: '/anuncios/novo' });

        expect(res.success).toBe(true);
        const next = new URL(res.redirectTo!);
        expect(next.origin).toBe('https://accounts.google.com');
        expect(next.searchParams.get('login_hint')).toBe(claims.email);

        const [user] = await usersWithEmail(claims.email);
        expect(user).toMatchObject({
          status: 'active',
          emailVerified: true,
          displayName: 'Pessoa Google',
        });
        expect(user.emailVerifiedAt).toBeInstanceOf(Date);
        expect(user.image).toBeNull();
        const [account] = await googleAccounts(claims.sub);
        expect(account.userId).toBe(user.id);
        expect(account.password).toBeNull();
        const terms = await getPrismaClient().termsAcceptance.findMany({
          where: { userId: user.id },
        });
        expect(terms).toEqual([
          expect.objectContaining({ type: 'age_eligibility', termsVersion: '1.0' }),
        ]);
        expect(await signupCookie(jar)).toBeUndefined();
        // A conclusao nao cria sessao: quem abre a sessao e o Better Auth.
        expect(await getPrismaClient().session.count({ where: { userId: user.id } })).toBe(0);

        // Reapresentar o mesmo handle (replay do cookie) nao conclui de novo nem duplica.
        browser = new Map([['troq-google-signup', handle]]);
        const replay = await completeGoogleSignup(validInput());
        expect(replay.success).toBe(false);
        expect(replay.error).toMatch(/expirou ou ja foi concluido/);
        expect(await usersWithEmail(claims.email)).toHaveLength(1);
        expect(await googleAccounts(claims.sub)).toHaveLength(1);
      });
    });

    describe('acessos posteriores e concorrencia', () => {
      it('acesso posterior reutiliza a mesma conta e abre sessao valida pelo guard', async () => {
        await signUpWithGoogle('volta');
        const claims = claimsFor('volta');
        const jar: Jar = new Map();

        const res = await callback(
          jar,
          await begin(jar, { callbackURL: '/anuncios/novo' }),
          claims,
        );

        expect(locationOf(res).pathname).toBe('/anuncios/novo');
        browser = jar;
        const session = await validateSession();
        expect(session.isValid).toBe(true);
        expect(session.user?.email).toBe(claims.email);
        expect(await usersWithEmail(claims.email)).toHaveLength(1);
        expect(await googleAccounts(claims.sub)).toHaveLength(1);
      });

      it('callbacks concorrentes da mesma identidade nao duplicam conta nem identidade', async () => {
        await signUpWithGoogle('paralelo');
        const claims = claimsFor('paralelo');
        const jars: Jar[] = [new Map(), new Map(), new Map(), new Map()];
        const starts = await Promise.all(jars.map((jar) => begin(jar)));

        const results = await Promise.all(jars.map((jar, i) => callback(jar, starts[i], claims)));

        for (const res of results) expect(locationOf(res).pathname).toBe('/conta');
        expect(await usersWithEmail(claims.email)).toHaveLength(1);
        expect(await googleAccounts(claims.sub)).toHaveLength(1);
      });

      it('conclusoes concorrentes da mesma identidade nova criam uma unica conta', async () => {
        const claims = claimsFor('corrida');
        const jars: Jar[] = [new Map(), new Map(), new Map()];
        for (const jar of jars) await callback(jar, await begin(jar), claims);

        // Cada conclusao le o seu proprio navegador.
        const outcomes = await Promise.all(
          jars.map((jar) => concurrentBrowser.run(jar, () => completeGoogleSignup(validInput()))),
        );

        expect(outcomes.filter((o) => o.success).length).toBeGreaterThanOrEqual(1);
        expect(await usersWithEmail(claims.email)).toHaveLength(1);
        expect(await googleAccounts(claims.sub)).toHaveLength(1);
      });

      it('o indice unico impede gravar a mesma identidade em duas contas', async () => {
        await signUpWithGoogle('indice');
        const otherId = await createPasswordUser(emailOf('indice-outro'));
        await expect(
          getPrismaClient().account.create({
            data: { userId: otherId, providerId: 'google', accountId: subOf('indice') },
          }),
        ).rejects.toMatchObject({ code: 'P2002' });
      });

      it('tokens do Google nunca sao guardados', async () => {
        await signUpWithGoogle('tokens');
        const jar: Jar = new Map();
        await callback(jar, await begin(jar), claimsFor('tokens'));
        const [account] = await googleAccounts(subOf('tokens'));
        expect(account).toMatchObject({
          accessToken: null,
          refreshToken: null,
          idToken: null,
          accessTokenExpiresAt: null,
          refreshTokenExpiresAt: null,
        });
      });
    });

    describe('contas existentes e vinculacao', () => {
      it.each([
        ['verificado', true],
        ['nao verificado', false],
      ])(
        'e-mail de conta por senha (%s) nao e vinculado nem abre sessao',
        async (_caso, verified) => {
          const email = emailOf(`colisao-${verified}`);
          const userId = await createPasswordUser(email, { verified });
          const jar: Jar = new Map();

          const res = await callback(jar, await begin(jar), {
            sub: subOf(`colisao-${verified}`),
            email,
            email_verified: true,
          });

          const location = locationOf(res);
          expect(location.searchParams.get('error')).toBe('account_not_linked');
          expect(await googleAccounts(subOf(`colisao-${verified}`))).toHaveLength(0);
          expect(await getPrismaClient().session.count({ where: { userId } })).toBe(0);
          expect(res.headers.getSetCookie().some((c) => c.includes('session_token='))).toBe(false);
          const user = await getPrismaClient().user.findUniqueOrThrow({ where: { id: userId } });
          expect(user.emailVerified).toBe(verified);

          const forwarded = googleReturnRoute(new Request(location.href));
          expect(forwarded.headers.get('location')).toBe(
            '/login?motivo=google_conta_existente&next=%2Fconta',
          );
        },
      );

      it('e-mail nao verificado pelo Google nao gera pendencia nem conta', async () => {
        const jar: Jar = new Map();
        const claims = claimsFor('sem-verificacao', { email_verified: false });
        const before = await pendingRows();

        const res = await callback(jar, await begin(jar), claims);

        expect(locationOf(res).searchParams.get('error')).toBe('google_email_not_verified');
        expect(await pendingRows()).toBe(before);
        expect(await signupCookie(jar)).toBeUndefined();
        expect(await usersWithEmail(claims.email)).toHaveLength(0);
      });

      it('vinculacao explicita: sessao por senha + Google com o mesmo e-mail verificado', async () => {
        const email = emailOf('vincula');
        const userId = await createPasswordUser(email);
        const jar = await passwordSession(email);
        const { headers, response } = await getAuth().api.linkSocialAccount({
          body: {
            provider: 'google',
            callbackURL: '/conta?google=vinculada',
            errorCallbackURL: '/login/google?fluxo=vincular',
            disableRedirect: true,
          },
          headers: new Headers({ cookie: cookieHeader(jar) }),
          returnHeaders: true,
        });
        absorb(jar, headers.getSetCookie());
        const authorizationURL = new URL(response.url!);
        const state = authorizationURL.searchParams.get('state')!;
        startedStates.push(state);

        const res = await callback(
          jar,
          { state, authorizationURL },
          {
            sub: subOf('vincula'),
            email,
            email_verified: true,
          },
        );

        expect(locationOf(res).pathname + locationOf(res).search).toBe('/conta?google=vinculada');
        const [account] = await googleAccounts(subOf('vincula'));
        expect(account.userId).toBe(userId);
        expect(account.accessToken).toBeNull();

        // Depois de vinculada, a entrada pelo Google cai na mesma conta.
        const next: Jar = new Map();
        const signIn = await callback(next, await begin(next), {
          sub: subOf('vincula'),
          email,
          email_verified: true,
        });
        expect(locationOf(signIn).pathname).toBe('/conta');
        browser = next;
        expect((await validateSession()).user?.id).toBe(userId);
      });

      it.each([
        ['outro e-mail', { email: 'outro' }, 'email_does_not_match', 'email_diferente'],
        ['e-mail nao verificado', { verified: false }, 'unable_to_link_account', 'falha'],
        [
          'identidade de outra conta',
          { taken: true },
          'account_already_linked_to_different_user',
          'ja_vinculada',
        ],
      ])(
        'vinculacao recusada: %s',
        async (
          caso,
          scenario: { email?: string; verified?: boolean; taken?: boolean },
          code,
          reason,
        ) => {
          const label = `vinc-${caso.replace(/\W+/g, '-')}`;
          const email = emailOf(label);
          const userId = await createPasswordUser(email);
          let sub = subOf(label);
          if (scenario.taken) {
            await signUpWithGoogle(`${label}-dono`);
            sub = subOf(`${label}-dono`);
          }
          const jar = await passwordSession(email);
          const { headers, response } = await getAuth().api.linkSocialAccount({
            body: {
              provider: 'google',
              callbackURL: '/conta?google=vinculada',
              errorCallbackURL: '/login/google?fluxo=vincular',
              disableRedirect: true,
            },
            headers: new Headers({ cookie: cookieHeader(jar) }),
            returnHeaders: true,
          });
          absorb(jar, headers.getSetCookie());
          const authorizationURL = new URL(response.url!);
          const state = authorizationURL.searchParams.get('state')!;
          startedStates.push(state);

          const res = await callback(
            jar,
            { state, authorizationURL },
            {
              sub,
              email: scenario.email ? emailOf(`${label}-${scenario.email}`) : email,
              email_verified: scenario.verified ?? true,
            },
          );

          const location = locationOf(res);
          expect(location.searchParams.get('error')).toBe(code);
          expect(
            await getPrismaClient().account.count({ where: { userId, providerId: 'google' } }),
          ).toBe(0);
          const forwarded = googleReturnRoute(new Request(location.href));
          expect(forwarded.headers.get('location')).toBe(`/conta?google=${reason}`);
        },
      );

      it('linkGoogleAccount exige sessao valida pelo guard', async () => {
        browser = new Map();
        const res = await linkGoogleAccount();
        expect(res.success).toBe(false);
        expect(res.redirectTo).toBeUndefined();
      });
    });

    describe('status da conta, logout e revogacao', () => {
      it.each(['blocked_admin', 'blocked_age', 'deletion_requested'] as UserStatus[])(
        'conta %s nao obtem sessao pelo Google',
        async (status) => {
          const label = `status-${status}`;
          await signUpWithGoogle(label);
          await getPrismaClient().user.updateMany({
            where: { email: emailOf(label) },
            data: { status },
          });
          const jar: Jar = new Map();

          const res = await callback(jar, await begin(jar), claimsFor(label));

          const location = locationOf(res);
          expect(location.searchParams.get('error')).toBe('ACCOUNT_NOT_ACTIVE');
          expect(res.headers.getSetCookie().some((c) => c.includes('session_token='))).toBe(false);
          const { id } = await getPrismaClient().user.findFirstOrThrow({
            where: { email: emailOf(label) },
          });
          expect(await getPrismaClient().session.count({ where: { userId: id } })).toBe(0);
          const forwarded = googleReturnRoute(new Request(location.href));
          expect(forwarded.headers.get('location')).toBe('/login?motivo=bloqueada&next=%2Fconta');
        },
      );

      it('logout invalida a sessao aberta pelo Google; o cookie antigo e negado', async () => {
        await signUpWithGoogle('logout');
        const jar: Jar = new Map();
        await callback(jar, await begin(jar), claimsFor('logout'));
        const oldCookie = new Map(jar);
        browser = jar;
        expect((await validateSession()).isValid).toBe(true);

        expect(await logoutUser()).toEqual({ success: true });

        browser = oldCookie;
        const replay = await validateSession();
        expect(replay.isValid).toBe(false);
        expect(replay.reason).toBe('no_session');
      });

      it('revogacao (sessoes apagadas) e bloqueio posterior negam a sessao do Google', async () => {
        await signUpWithGoogle('revoga');
        const jar: Jar = new Map();
        await callback(jar, await begin(jar), claimsFor('revoga'));
        browser = jar;
        const { id } = await getPrismaClient().user.findFirstOrThrow({
          where: { email: emailOf('revoga') },
        });

        await getPrismaClient().user.update({ where: { id }, data: { status: 'blocked_admin' } });
        expect((await validateSession()).reason).toBe('blocked');

        await getPrismaClient().session.deleteMany({ where: { userId: id } });
        await getPrismaClient().user.update({ where: { id }, data: { status: 'active' } });
        expect((await validateSession()).reason).toBe('no_session');
      });
    });

    describe('callback adulterado, repetido, cancelado ou com falha do Google', () => {
      it('state reutilizado depois do uso e recusado sem sessao', async () => {
        await signUpWithGoogle('replay');
        const jar: Jar = new Map();
        const started = await begin(jar);
        const first = await callback(jar, started, claimsFor('replay'));
        expect(locationOf(first).pathname).toBe('/conta');

        const attacker: Jar = new Map(jar);
        attacker.delete('better-auth.session_token');
        const replay = await callback(attacker, started, claimsFor('replay'));

        const location = locationOf(replay);
        expect(location.pathname).toBe('/login/google');
        expect(location.searchParams.get('error')).toMatch(/state/);
        expect(replay.headers.getSetCookie().some((c) => c.includes('session_token='))).toBe(false);
        expect(googleReturnRoute(new Request(location.href)).headers.get('location')).toBe(
          '/login?motivo=google_falha',
        );
      });

      it('callback em outro navegador (sem o cookie do state) e recusado: CSRF de login', async () => {
        await signUpWithGoogle('csrf');
        const victimBrowser: Jar = new Map();
        const attackerFlow = await begin(new Map());

        const res = await callback(victimBrowser, attackerFlow, claimsFor('csrf'));

        expect(locationOf(res).searchParams.get('error')).toMatch(/state/);
        expect(victimBrowser.has('better-auth.session_token')).toBe(false);
      });

      it('state forjado, ausente ou sem codigo nao abre sessao', async () => {
        for (const query of ['code=abc&state=forjado', 'code=abc', 'state=']) {
          const jar: Jar = new Map();
          const res = await rawCallback(jar, query);
          expect(locationOf(res).pathname).toBe('/login/google');
          expect(jar.has('better-auth.session_token')).toBe(false);
        }
      });

      it('cancelamento no Google (access_denied) volta ao login sem conta', async () => {
        const jar: Jar = new Map();
        const started = await begin(jar);

        const res = await rawCallback(
          jar,
          `error=access_denied&state=${encodeURIComponent(started.state)}`,
        );

        const location = locationOf(res);
        expect(location.searchParams.get('error')).toBe('access_denied');
        expect(googleReturnRoute(new Request(location.href)).headers.get('location')).toBe(
          '/login?motivo=google_cancelado&next=%2Fconta',
        );
      });

      it('falha do Google na troca do codigo nao cria pendencia nem sessao', async () => {
        const jar: Jar = new Map();
        const before = await pendingRows();
        tokenEndpointFails = true;

        const res = await callback(jar, await begin(jar), claimsFor('falha-token'));

        expect(locationOf(res).searchParams.get('error')).toBe('invalid_code');
        expect(await pendingRows()).toBe(before);
        expect(jar.has('better-auth.session_token')).toBe(false);
      });

      it('o PKCE e conferido: o verificador enviado ao Google corresponde ao desafio', () => {
        expect(tokenRequests.length).toBeGreaterThan(0);
        for (const body of tokenRequests) {
          expect(body.get('code_verifier')).toBeTruthy();
          expect(body.get('redirect_uri')).toBe('http://localhost:3000/api/auth/callback/google');
        }
      });
    });
  },
);

function validInput() {
  return { displayName: 'Pessoa Google', over18: true, termsAccepted: true };
}
