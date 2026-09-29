// @vitest-environment node
//
// Prova de integracao do login/logout (#42 / F2-004) contra PostgreSQL REAL e
// descartavel: cadastro persiste a credencial com o hash do Better Auth, login
// exige a senha correta, logout revoga a sessao no banco e sessoes antigas
// deixam de valer apos bloqueio. Sem mock de Prisma nem de hash.
//
// ESCREVE no banco. Por isso so roda com INTEGRATION_EPHEMERAL_DB=1, declarando
// que DATABASE_URL aponta para um banco efemero proprio — nunca para o Neon de
// preview, onde `test:integration` e somente leitura (docs/engineering/
// testing.md, secao 2.2). Os dados sao sinteticos e removidos ao final.
//
// Apenas o que nao existe fora de uma requisicao HTTP e simulado: o cookie
// store de `next/headers` e o envio de e-mail.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrismaClient } from '@/persistence/prisma';
import { confirmEmailToken, loginUser, logoutUser, registerUser } from './actions';
import { validateSession } from './index';
import { createDraftListing, getListingForEdit, updateListing } from '@/modules/listing/actions';

const jar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));

vi.mock('./email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
}));

const COOKIE = 'better-auth.session_token';
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const emailA = `it-a-${RUN_ID}@example.test`;
const emailB = `it-b-${RUN_ID}@example.test`;
const emailNoCredential = `it-nocred-${RUN_ID}@example.test`;
const PASSWORD_A = 'senha-sintetica-a-123';
const PASSWORD_B = 'senha-sintetica-b-456';

async function registerAndVerify(email: string, password: string) {
  const res = await registerUser({
    displayName: 'Usuario Sintetico',
    email,
    password,
    over18: true,
    termsAccepted: true,
  });
  expect(res.success).toBe(true);
  const verification = await getPrismaClient().verification.findFirstOrThrow({
    where: { identifier: email },
  });
  return verification.value;
}

async function sessionCount(email: string) {
  return getPrismaClient().session.count({ where: { user: { email } } });
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'login, logout e area privada contra PostgreSQL real',
  () => {
    beforeEach(() => {
      jar.clear();
    });

    afterAll(async () => {
      const prisma = getPrismaClient();
      const emails = [emailA, emailB, emailNoCredential];
      // Registros com FK RESTRICT para users saem antes; sessions/accounts caem em cascata.
      await prisma.listing.deleteMany({ where: { owner: { email: { in: emails } } } });
      await prisma.termsAcceptance.deleteMany({ where: { user: { email: { in: emails } } } });
      await prisma.verification.deleteMany({ where: { identifier: { in: emails } } });
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      await prisma.$disconnect();
    });

    it('cadastro persiste a credencial com hash, nunca a senha em texto puro', async () => {
      const token = await registerAndVerify(emailA, PASSWORD_A);

      const account = await getPrismaClient().account.findFirstOrThrow({
        where: { user: { email: emailA }, providerId: 'credential' },
      });
      expect(account.password).toBeTruthy();
      expect(account.password).not.toContain(PASSWORD_A);

      // Antes da verificacao do e-mail, nem a senha correta autentica.
      const beforeVerify = await loginUser(emailA, PASSWORD_A);
      expect(beforeVerify.success).toBe(false);
      expect(await sessionCount(emailA)).toBe(0);

      expect((await confirmEmailToken(token)).success).toBe(true);
    });

    it('senha ausente, incorreta ou chamada direta sem senha nao geram sessao nem cookie', async () => {
      const directCall = loginUser as unknown as (email: string) => ReturnType<typeof loginUser>;

      for (const attempt of [
        () => loginUser(emailA, ''),
        () => loginUser(emailA, 'senha-errada-000'),
        () => directCall(emailA),
      ]) {
        const res = await attempt();
        expect(res.success).toBe(false);
      }

      expect(jar.has(COOKIE)).toBe(false);
      expect(await sessionCount(emailA)).toBe(0);
    });

    it('usuario sem credencial persistida nao autentica', async () => {
      await getPrismaClient().user.create({
        data: { displayName: 'Sem Credencial', email: emailNoCredential, emailVerified: true },
      });

      const res = await loginUser(emailNoCredential, PASSWORD_A);
      expect(res.success).toBe(false);
      expect(await sessionCount(emailNoCredential)).toBe(0);
    });

    it('login correto cria sessao valida; logout a revoga mesmo se o cookie for reapresentado', async () => {
      const res = await loginUser(emailA, PASSWORD_A);
      expect(res).toEqual({ success: true, redirectTo: '/conta' });

      const token = jar.get(COOKIE)!;
      expect(token).toBeTruthy();
      expect(await sessionCount(emailA)).toBe(1);

      const session = await validateSession();
      expect(session.isValid).toBe(true);
      expect(session.user?.email).toBe(emailA);

      expect((await logoutUser()).success).toBe(true);
      expect(jar.has(COOKIE)).toBe(false);
      expect(await sessionCount(emailA)).toBe(0);

      // Cookie antigo reapresentado depois do logout: acesso restrito negado.
      jar.set(COOKIE, token);
      const replay = await validateSession();
      expect(replay.isValid).toBe(false);
      expect(replay.reason).toBe('no_session');
      expect((await createDraftListing(listingInput())).success).toBe(false);
    });

    it('sessao expirada e negada', async () => {
      await loginUser(emailA, PASSWORD_A);
      await getPrismaClient().session.updateMany({
        where: { token: jar.get(COOKIE)! },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const result = await validateSession();
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('no_session');
    });

    it('usuario B nao le nem altera anuncio privado de A por chamada direta com ID', async () => {
      await loginUser(emailA, PASSWORD_A);
      const created = await createDraftListing(listingInput());
      expect(created.success).toBe(true);
      const listingId = created.listingId!;

      jar.clear();
      await confirmEmailToken(await registerAndVerify(emailB, PASSWORD_B));
      expect((await loginUser(emailB, PASSWORD_B)).success).toBe(true);

      const read = await getListingForEdit(listingId);
      expect(read.success).toBe(false);
      expect(read.listing).toBeUndefined();

      const write = await updateListing(listingId, { title: 'Titulo adulterado por B' });
      expect(write.success).toBe(false);

      const stored = await getPrismaClient().listing.findUniqueOrThrow({
        where: { id: listingId },
      });
      expect(stored.title).toBe(listingInput().title);
    });

    it('sessao antiga deixa de valer apos bloqueio e exclusao da conta', async () => {
      jar.clear();
      await loginUser(emailB, PASSWORD_B);
      expect((await validateSession()).isValid).toBe(true);

      const prisma = getPrismaClient();
      await prisma.user.updateMany({ where: { email: emailB }, data: { status: 'blocked_admin' } });
      const blocked = await validateSession();
      expect(blocked.isValid).toBe(false);
      expect(blocked.reason).toBe('blocked');
      expect((await createDraftListing(listingInput())).success).toBe(false);

      const relogin = await loginUser(emailB, PASSWORD_B);
      expect(relogin.success).toBe(false);

      await prisma.user.updateMany({
        where: { email: emailB },
        data: { status: 'deletion_requested' },
      });
      const deleted = await validateSession();
      expect(deleted.isValid).toBe(false);
      expect(deleted.reason).toBe('deletion_requested');
      expect((await loginUser(emailB, PASSWORD_B)).success).toBe(false);
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
