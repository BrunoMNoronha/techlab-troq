// @vitest-environment node
//
// Prova do limite de tentativas de login (IC-10.2, #42 / F2-004) com o Better
// Auth REAL e PostgreSQL REAL e descartavel. So o transporte de e-mail do
// cadastro e `headers()` do Next.js sao simulados; o limitador, o provedor e o
// banco sao reais. `signInEmail` e observado (sem substituir o comportamento)
// para provar quantas tentativas chegam a verificacao da credencial.
//
// ESCREVE no banco. So roda com INTEGRATION_EPHEMERAL_DB=1 (docs/engineering/
// testing.md, secao 2.2). Dados e segredo sinteticos, removidos ao final.
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrismaClient } from '@/persistence/prisma';
import type { UserStatus } from '@/generated/prisma/client';
import { loginUser, registerUser } from './actions';
import { getAuth } from './auth';
import {
  loginFailureIdentifier,
  MAX_LOGIN_FAILURES,
  reserveLoginAttempt,
  RESERVATION_TTL_SECONDS,
} from './login-rate-limit';

vi.mock('./email', () => ({ sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const created: string[] = [];
const email = (label: string) => `it-rl-${label}-${RUN_ID}@example.test`;
const PASSWORD = 'senha-sintetica-rl-123';
const WRONG = 'senha-errada-000';
const INVALID = 'E-mail ou senha invalidos.';
const LIMITED = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';

const prisma = () => getPrismaClient();
let signInSpy: ReturnType<typeof vi.spyOn>;

async function createUser(
  label: string,
  { verified = true, status = 'active' as UserStatus } = {},
) {
  const userEmail = email(label);
  created.push(userEmail);
  const res = await registerUser({
    displayName: 'Pessoa Sintetica',
    email: userEmail,
    password: PASSWORD,
    over18: true,
    termsAccepted: true,
  });
  expect(res.success).toBe(true);
  const { id } = await prisma().user.findFirstOrThrow({ where: { email: userEmail } });
  await prisma().user.update({
    where: { id },
    data: { emailVerified: verified, emailVerifiedAt: verified ? new Date() : null, status },
  });
  return { userEmail, id };
}

function bucketRows(userEmail: string) {
  return prisma().verification.findMany({
    where: { identifier: loginFailureIdentifier(userEmail) },
  });
}

async function activeRows(userEmail: string) {
  const rows = await bucketRows(userEmail);
  return rows.filter((r) => r.expiresAt.getTime() > Date.now());
}

function sessionsOf(userId: string) {
  return prisma().session.count({ where: { userId } });
}

/**
 * Abre as 10 conexoes do pool (`pg`, `max = 10`) antes da rajada. Sem isso, a
 * rajada abre ~9 conexoes novas ao mesmo tempo, e cada transacao precisa da
 * sua dentro do `maxWait` do Prisma (2 s): uma demora na abertura de conexao
 * (Docker Desktop, rodada completa) derrubava as transacoes ainda sem conexao
 * com P2028 antes de chegarem ao limitador — o teste media a abertura de
 * conexoes, nao a concorrencia na trava. Conexoes ociosas duram 10 s no pool.
 */
async function warmPool() {
  await Promise.all(Array.from({ length: 10 }, () => prisma().$executeRaw`SELECT pg_sleep(0.05)`));
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'limite de tentativas de login (IC-10.2) contra PostgreSQL descartavel',
  () => {
    beforeAll(() => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      signInSpy = vi.spyOn(getAuth().api, 'signInEmail');
    });

    beforeEach(() => {
      signInSpy.mockClear();
    });

    afterAll(async () => {
      const db = prisma();
      const users = await db.user.findMany({
        where: { email: { in: created } },
        select: { id: true },
      });
      const ids = users.map((u) => u.id);
      await db.verification.deleteMany({
        where: {
          identifier: {
            in: [
              ...ids.map((id) => `email-verification:${id}`),
              ...[...created, email('fantasma'), email('fantasma-concorrente')].map(
                loginFailureIdentifier,
              ),
            ],
          },
        },
      });
      await db.termsAcceptance.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      await db.$disconnect();
      vi.unstubAllEnvs();
    });

    it('cinco senhas erradas chegam ao provedor; a sexta e recusada sem chamar o provedor', async () => {
      const { userEmail, id } = await createUser('limite');

      for (let attempt = 1; attempt <= MAX_LOGIN_FAILURES; attempt++) {
        expect(await loginUser(userEmail, WRONG)).toEqual({ success: false, error: INVALID });
        expect(await activeRows(userEmail)).toHaveLength(attempt);
      }
      expect(signInSpy).toHaveBeenCalledTimes(MAX_LOGIN_FAILURES);

      expect(await loginUser(userEmail, WRONG)).toEqual({ success: false, error: LIMITED });
      // Mesmo com a senha certa: bucket cheio nao consulta o provedor.
      expect(await loginUser(userEmail, PASSWORD)).toEqual({ success: false, error: LIMITED });
      expect(signInSpy).toHaveBeenCalledTimes(MAX_LOGIN_FAILURES);
      expect(await activeRows(userEmail)).toHaveLength(MAX_LOGIN_FAILURES);
      expect(await sessionsOf(id)).toBe(0);
    });

    it('e-mail inexistente tem a mesma semantica, sem enumeracao', async () => {
      const ghost = email('fantasma');

      for (let attempt = 1; attempt <= MAX_LOGIN_FAILURES; attempt++) {
        expect(await loginUser(ghost, WRONG)).toEqual({ success: false, error: INVALID });
      }
      expect(await loginUser(ghost, WRONG)).toEqual({ success: false, error: LIMITED });
      expect(signInSpy).toHaveBeenCalledTimes(MAX_LOGIN_FAILURES);
    });

    it('a chave e so o SHA-256 do e-mail normalizado; nada de e-mail, IP ou segredo', async () => {
      const { userEmail } = await createUser('chave');
      await loginUser(userEmail, WRONG);

      const [row] = await bucketRows(userEmail);
      const digest = createHash('sha256').update(userEmail).digest('hex');
      expect(row.identifier).toBe(`login-failure:${digest}`);
      expect(row.value).toBe('failure');
      const serialized = JSON.stringify(row);
      for (const forbidden of [userEmail, WRONG, PASSWORD, '127.0.0.1', '::1']) {
        expect(serialized).not.toContain(forbidden);
      }
      const ttl = row.expiresAt.getTime() - row.updatedAt!.getTime();
      expect(Math.round(ttl / 60_000)).toBe(15);
    });

    it('variantes de caixa e espaco compartilham o mesmo bucket', async () => {
      const { userEmail } = await createUser('normalizacao');
      const variants = [
        userEmail.toUpperCase(),
        `  ${userEmail}  `,
        userEmail,
        ` ${userEmail.toUpperCase()}`,
      ];

      for (let attempt = 0; attempt < MAX_LOGIN_FAILURES; attempt++) {
        await loginUser(variants[attempt % variants.length], WRONG);
      }
      expect(await loginUser(userEmail, WRONG)).toEqual({ success: false, error: LIMITED });
      expect(await activeRows(userEmail)).toHaveLength(MAX_LOGIN_FAILURES);
    });

    it('login bem-sucedido zera o bucket e as falhas seguintes recomecam do zero', async () => {
      const { userEmail, id } = await createUser('sucesso');
      for (let attempt = 0; attempt < 3; attempt++) await loginUser(userEmail, WRONG);
      expect(await activeRows(userEmail)).toHaveLength(3);

      expect((await loginUser(userEmail, PASSWORD)).success).toBe(true);
      expect(await bucketRows(userEmail)).toHaveLength(0);
      expect(await sessionsOf(id)).toBe(1);

      await loginUser(userEmail, WRONG);
      expect(await activeRows(userEmail)).toHaveLength(1);
    });

    it('e-mail nao verificado nao conta como falha', async () => {
      const { userEmail } = await createUser('pendente', { verified: false });

      for (let attempt = 0; attempt < MAX_LOGIN_FAILURES + 2; attempt++) {
        expect((await loginUser(userEmail, PASSWORD)).error).toContain('nao foi verificado');
      }
      expect(await bucketRows(userEmail)).toHaveLength(0);
    });

    it('conta nao ativa nao conta como falha', async () => {
      const { userEmail } = await createUser('bloqueada', { status: 'blocked_admin' });

      for (let attempt = 0; attempt < MAX_LOGIN_FAILURES + 2; attempt++) {
        expect((await loginUser(userEmail, PASSWORD)).error).toContain('suspensa ou inativa');
      }
      expect(await bucketRows(userEmail)).toHaveLength(0);
    });

    it('erro tecnico do provedor nao conta como falha', async () => {
      const { userEmail } = await createUser('erro-tecnico');
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      signInSpy.mockRejectedValueOnce(new Error('falha de rede sintetica'));

      expect((await loginUser(userEmail, WRONG)).success).toBe(false);
      expect(await bucketRows(userEmail)).toHaveLength(0);
      log.mockRestore();
    });

    it('falhas fora da janela de 15 min nao bloqueiam', async () => {
      const { userEmail } = await createUser('janela');
      for (let attempt = 0; attempt < MAX_LOGIN_FAILURES; attempt++)
        await loginUser(userEmail, WRONG);
      expect(await loginUser(userEmail, WRONG)).toEqual({ success: false, error: LIMITED });

      await prisma().$executeRaw`
        UPDATE "verifications" SET "expires_at" = now() - interval '1 second'
        WHERE "identifier" = ${loginFailureIdentifier(userEmail)}`;
      signInSpy.mockClear();

      expect(await loginUser(userEmail, WRONG)).toEqual({ success: false, error: INVALID });
      expect(signInSpy).toHaveBeenCalledTimes(1);
      expect(await activeRows(userEmail)).toHaveLength(1);
    });

    it('reserva orfa (funcao interrompida) expira sozinha em poucos minutos', async () => {
      const { userEmail } = await createUser('orfa');
      for (let attempt = 0; attempt < MAX_LOGIN_FAILURES - 1; attempt++)
        await loginUser(userEmail, WRONG);
      // Reserva nunca finalizada ocupa a ultima vaga.
      expect(await reserveLoginAttempt(userEmail)).not.toBeNull();
      expect(await loginUser(userEmail, WRONG)).toEqual({ success: false, error: LIMITED });

      const [orphan] = (await bucketRows(userEmail)).filter((r) => r.value === 'reservation');
      const ttl = orphan.expiresAt.getTime() - orphan.createdAt!.getTime();
      expect(Math.round(ttl / 1000)).toBe(RESERVATION_TTL_SECONDS);
      expect(RESERVATION_TTL_SECONDS).toBeLessThan(15 * 60);

      await prisma().verification.update({
        where: { id: orphan.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await loginUser(userEmail, WRONG)).toEqual({ success: false, error: INVALID });
    });

    it('10 tentativas simultaneas: no maximo 5 chegam ao provedor e nenhuma sessao e criada', async () => {
      await warmPool();
      const { userEmail, id } = await createUser('concorrente');

      const results = await Promise.all(
        Array.from({ length: 10 }, () => loginUser(userEmail, WRONG)),
      );

      const reachedProvider = signInSpy.mock.calls.length;
      expect(reachedProvider).toBeLessThanOrEqual(MAX_LOGIN_FAILURES);
      expect(results.filter((r) => r.error === LIMITED)).toHaveLength(10 - reachedProvider);
      expect(results.filter((r) => r.error === INVALID)).toHaveLength(reachedProvider);
      expect((await activeRows(userEmail)).length).toBeLessThanOrEqual(MAX_LOGIN_FAILURES);
      expect(await sessionsOf(id)).toBe(0);
    });

    it('10 tentativas simultaneas para e-mail inexistente respeitam o mesmo limite', async () => {
      const ghost = email('fantasma-concorrente');
      await warmPool();

      const results = await Promise.all(Array.from({ length: 10 }, () => loginUser(ghost, WRONG)));

      expect(signInSpy.mock.calls.length).toBeLessThanOrEqual(MAX_LOGIN_FAILURES);
      expect(results.filter((r) => r.error === LIMITED).length).toBeGreaterThanOrEqual(5);
      expect((await activeRows(ghost)).length).toBeLessThanOrEqual(MAX_LOGIN_FAILURES);
    });
  },
);
