// @vitest-environment node
//
// Prova de integracao do nucleo de autenticacao (#40 / F2-002) contra o Better
// Auth REAL e PostgreSQL REAL e descartavel (docs/architecture/
// identity-contract.md, IC-5 e IC-8). Sem mock de Prisma, de hash nem do
// provedor.
//
// A prova da sessao usa o cookie EMITIDO pelo provedor (`Set-Cookie` de
// `signInEmail`), reapresentado a `getSession` como um navegador faria. O unico
// mock do Next.js e `headers()`, para que o guard e as actions do TROQ leiam
// esse mesmo cookie como leriam numa requisicao: ele prova a ponte, nao a sessao.
//
// ESCREVE no banco. Por isso so roda com INTEGRATION_EPHEMERAL_DB=1, declarando
// que DATABASE_URL aponta para um banco efemero proprio — nunca para o Neon de
// preview, onde `test:integration` e somente leitura (docs/engineering/
// testing.md, secao 2.2). Dados e segredo sao sinteticos; os dados sao
// removidos ao final.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrismaClient } from '@/persistence/prisma';
import type { UserStatus } from '@/generated/prisma/client';
import { loginUser, logoutUser, registerUser } from './actions';
import { ACCOUNT_NOT_ACTIVE_CODE, getAuth } from './auth';
import { validateSession } from './index';
import { createDraftListing, getListingForEdit, updateListing } from '@/modules/listing/actions';

// Cookie que o "navegador" apresenta na requisicao corrente.
let browserCookie = '';

vi.mock('next/headers', () => ({
  headers: async () => new Headers(browserCookie ? { cookie: browserCookie } : {}),
}));

vi.mock('./email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const email = (label: string) => `it-${label}-${RUN_ID}@example.test`;
const PASSWORD = 'senha-sintetica-123';
const emails = {
  a: email('a'),
  b: email('b'),
  pendente: email('pendente'),
  semCredencial: email('semcred'),
  idade: email('idade'),
  admin: email('admin'),
  exclusao: email('exclusao'),
};

// Headers de uma requisicao de login: IP e user-agent chegam, mas nao podem ser
// persistidos (IC-11.1).
function loginRequestHeaders() {
  return new Headers({ 'user-agent': 'agente-sintetico/1.0', 'x-forwarded-for': '203.0.113.7' });
}

/** Converte os `Set-Cookie` do provedor no cabecalho `Cookie` que o navegador reenviaria. */
function toCookieHeader(setCookieHeaders: Headers): string {
  return setCookieHeaders
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

async function providerSignIn(userEmail: string, password = PASSWORD): Promise<string> {
  const { headers } = await getAuth().api.signInEmail({
    body: { email: userEmail, password },
    headers: loginRequestHeaders(),
    returnHeaders: true,
  });
  const cookie = toCookieHeader(headers);
  expect(cookie).toContain('session_token=');
  return cookie;
}

function providerGetSession(cookie: string) {
  return getAuth().api.getSession({ headers: new Headers({ cookie }) });
}

async function expectSignInRejected(userEmail: string, password: string, code: string) {
  await expect(
    getAuth().api.signInEmail({
      body: { email: userEmail, password },
      headers: loginRequestHeaders(),
    }),
  ).rejects.toMatchObject({ body: { code } });
}

async function createUser(
  userEmail: string,
  { verified = true, status = 'active' as UserStatus } = {},
): Promise<string> {
  const res = await registerUser({
    displayName: 'Usuario Sintetico',
    email: userEmail,
    password: PASSWORD,
    over18: true,
    termsAccepted: true,
  });
  expect(res.success).toBe(true);
  const { id } = await getPrismaClient().user.findFirstOrThrow({ where: { email: userEmail } });
  await getPrismaClient().user.update({
    where: { id },
    data: { emailVerified: verified, emailVerifiedAt: verified ? new Date() : null, status },
  });
  return id;
}

function sessionsOf(userEmail: string) {
  return getPrismaClient().session.findMany({ where: { user: { email: userEmail } } });
}

async function setStatus(userEmail: string, status: UserStatus) {
  await getPrismaClient().user.updateMany({ where: { email: userEmail }, data: { status } });
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'nucleo de autenticacao: Better Auth real contra PostgreSQL descartavel',
  () => {
    let userAId: string;
    let userBId: string;

    beforeAll(async () => {
      // Configuracao sintetica explicita; nenhum default vive em src/ (IC-12.2).
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');

      userAId = await createUser(emails.a);
      userBId = await createUser(emails.b);
      await createUser(emails.pendente, { verified: false });
      await createUser(emails.idade, { status: 'blocked_age' });
      await createUser(emails.admin, { status: 'blocked_admin' });
      await createUser(emails.exclusao, { status: 'deletion_requested' });
      await getPrismaClient().user.create({
        data: { displayName: 'Sem Credencial', email: emails.semCredencial, emailVerified: true },
      });
    });

    beforeEach(() => {
      browserCookie = '';
    });

    afterAll(async () => {
      const prisma = getPrismaClient();
      const all = Object.values(emails);
      // Registros com FK RESTRICT para users saem antes; sessions/accounts caem em cascata.
      await prisma.listing.deleteMany({ where: { owner: { email: { in: all } } } });
      await prisma.termsAcceptance.deleteMany({ where: { user: { email: { in: all } } } });
      const users = await prisma.user.findMany({
        where: { email: { in: all } },
        select: { id: true },
      });
      await prisma.verification.deleteMany({
        where: { identifier: { in: users.map((u) => `email-verification:${u.id}`) } },
      });
      await prisma.user.deleteMany({ where: { email: { in: all } } });
      await prisma.$disconnect();
      vi.unstubAllEnvs();
    });

    describe('emissao da sessao pelo provedor', () => {
      it('credencial persistida pelo cadastro autentica por signInEmail e cria a sessao no banco', async () => {
        const account = await getPrismaClient().account.findFirstOrThrow({
          where: { userId: userAId, providerId: 'credential' },
        });
        expect(account.password).toBeTruthy();
        expect(account.password).not.toContain(PASSWORD);

        const cookie = await providerSignIn(emails.a);

        const sessions = await sessionsOf(emails.a);
        expect(sessions).toHaveLength(1);
        expect(sessions[0].userId).toBe(userAId);
        expect(sessions[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
        // O cookie e assinado: nao e o token cru guardado no banco.
        expect(cookie).not.toBe(`better-auth.session_token=${sessions[0].token}`);
      });

      it('nao persiste IP nem user-agent na sessao', async () => {
        const sessions = await sessionsOf(emails.a);
        expect(sessions.length).toBeGreaterThan(0);
        for (const session of sessions) {
          expect(session.ipAddress).toBeNull();
          expect(session.userAgent).toBeNull();
        }
      });

      it('senha incorreta nao cria sessao', async () => {
        const before = (await sessionsOf(emails.a)).length;
        await expectSignInRejected(emails.a, 'senha-errada-000', 'INVALID_EMAIL_OR_PASSWORD');
        expect(await sessionsOf(emails.a)).toHaveLength(before);
      });

      it('usuario sem credencial e e-mail inexistente nao criam sessao', async () => {
        await expectSignInRejected(emails.semCredencial, PASSWORD, 'INVALID_EMAIL_OR_PASSWORD');
        await expectSignInRejected(email('inexistente'), PASSWORD, 'INVALID_EMAIL_OR_PASSWORD');
        expect(await sessionsOf(emails.semCredencial)).toHaveLength(0);
      });

      it('e-mail nao verificado nao recebe sessao', async () => {
        await expectSignInRejected(emails.pendente, PASSWORD, 'EMAIL_NOT_VERIFIED');
        expect(await sessionsOf(emails.pendente)).toHaveLength(0);
      });

      it.each([
        ['blocked_age', emails.idade],
        ['blocked_admin', emails.admin],
        ['deletion_requested', emails.exclusao],
      ])('conta %s nao recebe sessao, mesmo com a senha correta', async (_status, userEmail) => {
        await expectSignInRejected(userEmail, PASSWORD, ACCOUNT_NOT_ACTIVE_CODE);
        expect(await sessionsOf(userEmail)).toHaveLength(0);
      });
    });

    describe('validacao da sessao pelo provedor', () => {
      it('o cookie emitido pelo provedor e aceito por getSession', async () => {
        const cookie = await providerSignIn(emails.a);

        const session = await providerGetSession(cookie);

        expect(session?.user.id).toBe(userAId);
      });

      it('cookie adulterado nao autentica', async () => {
        const cookie = await providerSignIn(emails.a);
        const [name, value] = cookie.split('=');
        const decoded = decodeURIComponent(value);
        const tampered = `${name}=${encodeURIComponent(`${decoded[0] === 'x' ? 'y' : 'x'}${decoded.slice(1)}`)}`;

        expect(await providerGetSession(tampered)).toBeNull();
      });

      it('token cru do modelo antigo, mesmo com linha em sessions, nao autentica', async () => {
        const rawToken = randomBytes(32).toString('hex');
        await getPrismaClient().session.create({
          data: { userId: userAId, token: rawToken, expiresAt: new Date(Date.now() + 3_600_000) },
        });
        const legacyCookie = `better-auth.session_token=${rawToken}`;

        expect(await providerGetSession(legacyCookie)).toBeNull();

        browserCookie = legacyCookie;
        const guard = await validateSession();
        expect(guard.isValid).toBe(false);
        expect(guard.reason).toBe('no_session');
      });

      it('sessao inexistente nao autentica', async () => {
        expect(
          await providerGetSession(`better-auth.session_token=${randomBytes(16).toString('hex')}`),
        ).toBeNull();
        expect(await providerGetSession('')).toBeNull();
      });

      it('sessao expirada nao autentica e e removida pelo provedor', async () => {
        const cookie = await providerSignIn(emails.b);
        const [session] = await getPrismaClient().session.findMany({
          where: { userId: userBId },
          orderBy: { createdAt: 'desc' },
          take: 1,
        });
        await getPrismaClient().session.update({
          where: { id: session.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });

        expect(await providerGetSession(cookie)).toBeNull();
        expect(
          await getPrismaClient().session.findUnique({ where: { id: session.id } }),
        ).toBeNull();
      });

      it('sessao revogada pelo provedor nao autentica', async () => {
        const cookie = await providerSignIn(emails.b);
        await getAuth().api.revokeSessions({ headers: new Headers({ cookie }) });

        expect(await providerGetSession(cookie)).toBeNull();
        expect(await sessionsOf(emails.b)).toHaveLength(0);
      });

      it('sessao removida por userId (revogacao administrativa, IC-5.6) nao autentica', async () => {
        const cookie = await providerSignIn(emails.b);
        await getPrismaClient().session.deleteMany({ where: { userId: userBId } });

        expect(await providerGetSession(cookie)).toBeNull();
      });
    });

    describe('autorizacao de dominio (validateSession) sobre a sessao do provedor', () => {
      it('reconhece o usuario ativo e verificado autenticado pelo provedor', async () => {
        browserCookie = await providerSignIn(emails.b);

        const result = await validateSession();

        expect(result.isValid).toBe(true);
        expect(result.user?.id).toBe(userBId);
        expect(result.user?.email).toBe(emails.b);
      });

      it.each([
        ['blocked_admin', 'blocked'],
        ['blocked_age', 'blocked'],
        ['deletion_requested', 'deletion_requested'],
      ] as const)(
        'sessao anterior a mudanca para %s deixa de autorizar acao protegida',
        async (status, reason) => {
          browserCookie = await providerSignIn(emails.b);
          expect((await validateSession()).isValid).toBe(true);

          await setStatus(emails.b, status);
          try {
            // A sessao continua valida para o provedor; o guard nega pelo estado atual.
            expect(await providerGetSession(browserCookie)).not.toBeNull();
            const result = await validateSession();
            expect(result.isValid).toBe(false);
            expect(result.reason).toBe(reason);
            expect((await createDraftListing(listingInput())).success).toBe(false);
          } finally {
            await setStatus(emails.b, 'active');
          }
        },
      );

      it('email nao verificado com sessao remanescente e negado', async () => {
        browserCookie = await providerSignIn(emails.b);
        await getPrismaClient().user.update({
          where: { id: userBId },
          data: { emailVerified: false },
        });
        try {
          expect((await validateSession()).reason).toBe('unverified');
        } finally {
          await getPrismaClient().user.update({
            where: { id: userBId },
            data: { emailVerified: true },
          });
        }
      });

      it('usuario A nunca vira B: a identidade vem so da sessao, nao de entrada externa', async () => {
        browserCookie = await providerSignIn(emails.a);
        const created = await createDraftListing(listingInput());
        expect(created.success).toBe(true);
        const listingId = created.listingId!;

        browserCookie = `${await providerSignIn(emails.b)}; troq_user_id=${userAId}`;
        const asB = await validateSession();
        expect(asB.user?.id).toBe(userBId);

        const read = await getListingForEdit(listingId);
        expect(read.success).toBe(false);
        expect(read.listing).toBeUndefined();
        expect((await updateListing(listingId, { title: 'Adulterado por B' })).success).toBe(false);

        const stored = await getPrismaClient().listing.findUniqueOrThrow({
          where: { id: listingId },
        });
        expect(stored.title).toBe(listingInput().title);
      });
    });

    describe('Server Actions sobre o provedor real', () => {
      it('loginUser autentica pelo provedor e a sessao nasce no banco pelo Better Auth', async () => {
        const before = (await sessionsOf(emails.a)).length;

        const res = await loginUser(emails.a, PASSWORD);

        expect(res).toEqual({ success: true, redirectTo: '/conta' });
        expect(await sessionsOf(emails.a)).toHaveLength(before + 1);
      });

      it('loginUser de conta bloqueada nao cria sessao', async () => {
        const res = await loginUser(emails.admin, PASSWORD);

        expect(res.success).toBe(false);
        expect(res.error).toContain('suspensa ou inativa');
        expect(await sessionsOf(emails.admin)).toHaveLength(0);
      });

      it('logoutUser encerra a sessao pelo provedor e ela nao pode ser reutilizada', async () => {
        const cookie = await providerSignIn(emails.a);
        const target = await providerGetSession(cookie);
        browserCookie = cookie;

        expect(await logoutUser()).toEqual({ success: true });

        expect(
          await getPrismaClient().session.findUnique({ where: { id: target!.session.id } }),
        ).toBeNull();
        expect(await providerGetSession(cookie)).toBeNull();
        const replay = await validateSession();
        expect(replay.isValid).toBe(false);
        expect(replay.reason).toBe('no_session');
      });

      it('logoutUser sem sessao e sucesso idempotente', async () => {
        expect(await logoutUser()).toEqual({ success: true });
      });
    });
  },
);

function listingInput() {
  return {
    title: 'Bicicleta sintetica',
    description: 'Anuncio sintetico de teste de integracao.',
    city: 'Recife',
    state: 'PE',
  };
}
