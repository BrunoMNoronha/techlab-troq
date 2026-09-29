// @vitest-environment node
//
// Prova de integracao de cadastro, token de verificacao e reenvio (#41 / F2-003)
// contra PostgreSQL REAL e descartavel (identity-contract.md, IC-6, IC-7 e
// IC-9). Token, unicidade, concorrencia, limites e persistencia sao provados
// no banco real; so o transporte Resend e simulado, e dele se le o link que o
// usuario receberia. O login usa o Better Auth real.
//
// ESCREVE no banco. So roda com INTEGRATION_EPHEMERAL_DB=1 (docs/engineering/
// testing.md, secao 2.2). Dados e segredo sinteticos, removidos ao final.
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@/persistence/prisma';
import type { UserStatus } from '@/generated/prisma/client';
import { confirmEmailToken, registerUser, resendVerificationToken } from './actions';
import { getAuth } from './auth';
import type { EmailDeliveryResult, VerificationEmail } from './email';

const sendVerificationEmail = vi.fn<(message: VerificationEmail) => Promise<EmailDeliveryResult>>();
vi.mock('./email', () => ({
  sendVerificationEmail: (message: VerificationEmail) => sendVerificationEmail(message),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const createdEmails: string[] = [];
function email(label: string) {
  const value = `it-${label}-${RUN_ID}@example.test`;
  createdEmails.push(value);
  return value;
}
const PASSWORD = 'senha-sintetica-123';
const GENERIC =
  'Se houver cadastro pendente de verificacao para este e-mail, enviaremos um novo link.';

const prisma = () => getPrismaClient();

function input(userEmail: string, overrides: Record<string, unknown> = {}) {
  return {
    displayName: 'Pessoa Sintetica',
    email: userEmail,
    password: PASSWORD,
    over18: true,
    termsAccepted: true,
    ...overrides,
  } as Parameters<typeof registerUser>[0];
}

/** Token do ultimo link "enviado" ao destinatario (lido do transporte simulado). */
function lastTokenSentTo(userEmail: string): string {
  const call = sendVerificationEmail.mock.calls.filter(([m]) => m.to === userEmail).at(-1);
  if (!call) throw new Error('nenhum envio para o destinatario');
  return new URL(call[0].verificationUrl).searchParams.get('token')!;
}

async function register(userEmail: string) {
  const res = await registerUser(input(userEmail));
  expect(res).toMatchObject({ success: true, emailDelivery: 'sent' });
  return prisma().user.findFirstOrThrow({ where: { email: userEmail } });
}

function tokenRows(userId: string) {
  return prisma().verification.findMany({
    where: { identifier: `email-verification:${userId}` },
    orderBy: { createdAt: 'asc' },
  });
}

/** Desloca as emissoes da conta para o passado, simulando a passagem do tempo. */
async function ageEmissions(userId: string, seconds: number) {
  await prisma().$executeRaw`
    UPDATE "verifications"
    SET "created_at" = "created_at" - make_interval(secs => ${seconds}),
        "expires_at" = "expires_at" - make_interval(secs => ${seconds})
    WHERE "identifier" = ${`email-verification:${userId}`}`;
}

async function usersWithEmail(userEmail: string) {
  return prisma().user.count({ where: { email: userEmail } });
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'cadastro, verificacao e reenvio contra PostgreSQL descartavel',
  () => {
    const logSpies: ReturnType<typeof vi.spyOn>[] = [];

    beforeAll(() => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
    });

    beforeEach(() => {
      sendVerificationEmail.mockReset();
      sendVerificationEmail.mockResolvedValue({ ok: true });
      for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
        logSpies.push(vi.spyOn(console, method).mockImplementation(() => undefined));
      }
    });

    afterEach(() => {
      // Nenhum log carrega destinatario, token ou link (IC-9.1, IC-11.2).
      const logged = JSON.stringify(logSpies.flatMap((spy) => spy.mock.calls));
      const sensitive = sendVerificationEmail.mock.calls.flatMap(([m]) => [
        m.to,
        m.verificationUrl,
        new URL(m.verificationUrl).searchParams.get('token')!,
      ]);
      for (const value of [...createdEmails, ...sensitive]) {
        expect(logged).not.toContain(value);
      }
      for (const spy of logSpies.splice(0)) spy.mockRestore();
    });

    afterAll(async () => {
      const db = prisma();
      const users = await db.user.findMany({
        where: { email: { in: createdEmails } },
        select: { id: true },
      });
      await db.verification.deleteMany({
        where: { identifier: { in: users.map((u) => `email-verification:${u.id}`) } },
      });
      await db.termsAcceptance.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
      await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
      await db.$disconnect();
      vi.unstubAllEnvs();
    });

    describe('cadastro', () => {
      it.each([
        ['sem declaracao 18+', { over18: undefined }],
        ['over18 falso', { over18: false }],
        ['termos nao aceitos', { termsAccepted: false }],
        ['senha com 7 caracteres', { password: '1234567' }],
        ['senha com 129 caracteres', { password: 'a'.repeat(129) }],
      ])('%s nao grava nada', async (label, overrides) => {
        const userEmail = email(`recusa-${label.replace(/\W+/g, '-')}`);

        const res = await registerUser(input(userEmail, overrides));

        expect(res.success).toBe(false);
        expect(await usersWithEmail(userEmail)).toBe(0);
        expect(sendVerificationEmail).not.toHaveBeenCalled();
      });

      it('grava conta nao verificada, credencial com hash e aceite 18+ versionado', async () => {
        const user = await register(email('cadastro'));

        expect(user).toMatchObject({
          status: 'active',
          emailVerified: false,
          emailVerifiedAt: null,
        });
        const account = await prisma().account.findFirstOrThrow({ where: { userId: user.id } });
        expect(account).toMatchObject({ providerId: 'credential', accountId: user.id });
        expect(account.password).not.toContain(PASSWORD);
        const terms = await prisma().termsAcceptance.findMany({ where: { userId: user.id } });
        expect(terms).toEqual([
          expect.objectContaining({ type: 'age_eligibility', termsVersion: '1.0' }),
        ]);
        // Cadastro nao cria sessao.
        expect(await prisma().session.count({ where: { userId: user.id } })).toBe(0);
      });

      it('e-mail duplicado de conta ativa e recusado, inclusive com outra caixa', async () => {
        const userEmail = email('duplicado');
        await register(userEmail);

        const res = await registerUser(input(`  ${userEmail.toUpperCase()} `));

        expect(res).toMatchObject({ success: false, error: expect.stringContaining('cadastrado') });
        expect(await usersWithEmail(userEmail)).toBe(1);
      });

      it('e-mail de conta em deletion_requested tambem e recusado (IC-2.5)', async () => {
        const userEmail = email('exclusao');
        const user = await register(userEmail);
        await prisma().user.update({
          where: { id: user.id },
          data: { status: 'deletion_requested' },
        });

        const res = await registerUser(input(userEmail));

        expect(res.success).toBe(false);
        expect(await usersWithEmail(userEmail)).toBe(1);
      });

      it('cadastros concorrentes do mesmo e-mail criam uma unica conta, sem erro interno', async () => {
        const userEmail = email('concorrente');

        const results = await Promise.all(
          Array.from({ length: 5 }, () => registerUser(input(userEmail))),
        );

        expect(results.filter((r) => r.success)).toHaveLength(1);
        for (const failure of results.filter((r) => !r.success)) {
          expect(failure.error).toContain('cadastrado');
        }
        expect(await usersWithEmail(userEmail)).toBe(1);
      });

      it('falha de envio preserva a conta nao verificada e inutiliza o token emitido', async () => {
        const userEmail = email('falha-envio');
        sendVerificationEmail.mockResolvedValueOnce({ ok: false, reason: 'provider_error' });

        const res = await registerUser(input(userEmail));

        expect(res).toEqual({ success: true, emailPending: userEmail, emailDelivery: 'failed' });
        const user = await prisma().user.findFirstOrThrow({ where: { email: userEmail } });
        expect(user.emailVerified).toBe(false);
        const [row] = await tokenRows(user.id);
        expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
        expect(await confirmEmailToken(lastTokenSentTo(userEmail))).toMatchObject({
          success: false,
        });
        expect(
          (await prisma().user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified,
        ).toBe(false);
      });
    });

    describe('token e confirmacao', () => {
      it('o banco guarda so o SHA-256 do token, com identifier por userId e 24 h de validade', async () => {
        const userEmail = email('hash');
        const user = await register(userEmail);
        const token = lastTokenSentTo(userEmail);

        const rows = await tokenRows(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0].identifier).toBe(`email-verification:${user.id}`);
        expect(rows[0].value).toBe(createHash('sha256').update(token).digest('hex'));
        expect(await prisma().verification.count({ where: { value: token } })).toBe(0);
        expect(
          await prisma().verification.count({ where: { identifier: { contains: userEmail } } }),
        ).toBe(0);
        const ttl = rows[0].expiresAt.getTime() - rows[0].createdAt!.getTime();
        expect(Math.round(ttl / 3_600_000)).toBe(24);
      });

      it('token valido confirma, grava emailVerified e emailVerifiedAt e nao cria sessao', async () => {
        const userEmail = email('confirma');
        const user = await register(userEmail);

        expect(await confirmEmailToken(lastTokenSentTo(userEmail))).toEqual({ success: true });

        const updated = await prisma().user.findUniqueOrThrow({ where: { id: user.id } });
        expect(updated.emailVerified).toBe(true);
        expect(updated.emailVerifiedAt).toBeInstanceOf(Date);
        expect(await prisma().session.count({ where: { userId: user.id } })).toBe(0);
        expect(await tokenRows(user.id)).toHaveLength(0);
      });

      it('a credencial do cadastro autentica pelo Better Auth depois da confirmacao', async () => {
        const userEmail = email('login');
        await register(userEmail);

        await expect(
          getAuth().api.signInEmail({ body: { email: userEmail, password: PASSWORD } }),
        ).rejects.toMatchObject({ body: { code: 'EMAIL_NOT_VERIFIED' } });

        await confirmEmailToken(lastTokenSentTo(userEmail));
        const signIn = await getAuth().api.signInEmail({
          body: { email: userEmail, password: PASSWORD },
        });
        expect(signIn.user.email).toBe(userEmail);
      });

      it('token reutilizado, inexistente e malformado falham sem efeito', async () => {
        const userEmail = email('reuso');
        await register(userEmail);
        const token = lastTokenSentTo(userEmail);
        await confirmEmailToken(token);

        for (const attempt of [token, randomBytes(32).toString('base64url'), 'nao-e-token']) {
          expect(await confirmEmailToken(attempt)).toMatchObject({
            success: false,
            reason: 'invalid',
          });
        }
      });

      it('token expirado falha e nao verifica a conta', async () => {
        const userEmail = email('expirado');
        const user = await register(userEmail);
        await ageEmissions(user.id, 25 * 3600);

        expect(await confirmEmailToken(lastTokenSentTo(userEmail))).toMatchObject({
          success: false,
          reason: 'expired',
        });
        expect(
          (await prisma().user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified,
        ).toBe(false);
      });

      it('confirmacoes concorrentes do mesmo token produzem exatamente um sucesso', async () => {
        const userEmail = email('concorrencia');
        await register(userEmail);
        const token = lastTokenSentTo(userEmail);

        const results = await Promise.all(
          Array.from({ length: 8 }, () => confirmEmailToken(token)),
        );

        expect(results.filter((r) => r.success)).toHaveLength(1);
        expect(results.filter((r) => !r.success && r.reason === 'invalid')).toHaveLength(7);
      });

      it('conta em deletion_requested nao e verificada pelo token', async () => {
        const userEmail = email('token-exclusao');
        const user = await register(userEmail);
        await prisma().user.update({
          where: { id: user.id },
          data: { status: 'deletion_requested' },
        });

        expect((await confirmEmailToken(lastTokenSentTo(userEmail))).success).toBe(false);
        expect(
          (await prisma().user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified,
        ).toBe(false);
      });
    });

    describe('reenvio', () => {
      const ineligible: Array<[string, () => Promise<string>]> = [
        ['inexistente', async () => email('fantasma')],
        [
          'ja verificado',
          async () => {
            const userEmail = email('verificado');
            await register(userEmail);
            await confirmEmailToken(lastTokenSentTo(userEmail));
            return userEmail;
          },
        ],
        ...(['blocked_age', 'blocked_admin', 'deletion_requested'] as UserStatus[]).map(
          (status) =>
            [
              status,
              async () => {
                const userEmail = email(`status-${status}`);
                const user = await register(userEmail);
                await ageEmissions(user.id, 3600);
                await prisma().user.update({ where: { id: user.id }, data: { status } });
                return userEmail;
              },
            ] as [string, () => Promise<string>],
        ),
      ];

      it.each(ineligible)(
        'resposta generica e nenhuma emissao para conta %s',
        async (_caso, arrange) => {
          const userEmail = await arrange();
          sendVerificationEmail.mockClear();
          const before = await prisma().verification.count();

          expect(await resendVerificationToken(userEmail)).toEqual({
            success: true,
            message: GENERIC,
          });
          expect(sendVerificationEmail).not.toHaveBeenCalled();
          expect(await prisma().verification.count()).toBe(before);
        },
      );

      it('antes de 60 s nao emite; depois emite e invalida o token anterior', async () => {
        const userEmail = email('intervalo');
        const user = await register(userEmail);
        const firstToken = lastTokenSentTo(userEmail);

        expect(await resendVerificationToken(userEmail)).toEqual({
          success: true,
          message: GENERIC,
        });
        expect(await tokenRows(user.id)).toHaveLength(1);

        await ageEmissions(user.id, 61);
        expect(await resendVerificationToken(userEmail)).toEqual({
          success: true,
          message: GENERIC,
        });
        const secondToken = lastTokenSentTo(userEmail);
        expect(secondToken).not.toBe(firstToken);
        expect(await tokenRows(user.id)).toHaveLength(2);

        expect(await confirmEmailToken(firstToken)).toMatchObject({
          success: false,
          reason: 'expired',
        });
        expect(await confirmEmailToken(secondToken)).toEqual({ success: true });
      });

      it('no maximo 5 emissoes em 24 h contando o cadastro; a sexta nao emite', async () => {
        const userEmail = email('limite');
        const user = await register(userEmail);

        for (let emission = 2; emission <= 5; emission++) {
          await ageEmissions(user.id, 61);
          await resendVerificationToken(userEmail);
          expect(await tokenRows(user.id)).toHaveLength(emission);
        }

        await ageEmissions(user.id, 61);
        sendVerificationEmail.mockClear();
        expect(await resendVerificationToken(userEmail)).toEqual({
          success: true,
          message: GENERIC,
        });
        expect(sendVerificationEmail).not.toHaveBeenCalled();
        expect(await tokenRows(user.id)).toHaveLength(5);

        // Passadas 24 h da primeira emissao, a janela libera novamente.
        await ageEmissions(user.id, 24 * 3600);
        await resendVerificationToken(userEmail);
        expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
      });

      it('o limite vem do banco e persiste entre instancias novas do cliente', async () => {
        const userEmail = email('persistente');
        await register(userEmail);

        const scope = globalThis as typeof globalThis & { __troqPrismaClient?: PrismaClient };
        await scope.__troqPrismaClient?.$disconnect();
        delete scope.__troqPrismaClient;
        sendVerificationEmail.mockClear();

        expect(await resendVerificationToken(userEmail)).toEqual({
          success: true,
          message: GENERIC,
        });
        expect(sendVerificationEmail).not.toHaveBeenCalled();
      });

      it('reenvios concorrentes nao ultrapassam o limite', async () => {
        const userEmail = email('reenvio-concorrente');
        const user = await register(userEmail);
        await ageEmissions(user.id, 3600);
        sendVerificationEmail.mockClear();

        const results = await Promise.all(
          Array.from({ length: 10 }, () => resendVerificationToken(userEmail)),
        );

        for (const res of results) expect(res).toEqual({ success: true, message: GENERIC });
        expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
        expect(await tokenRows(user.id)).toHaveLength(2);
        const valid = (await tokenRows(user.id)).filter(
          (row) => row.expiresAt.getTime() > Date.now(),
        );
        expect(valid).toHaveLength(1);
      });

      it('falha do provedor no reenvio e informada e o novo token fica inutilizavel', async () => {
        const userEmail = email('reenvio-falha');
        const user = await register(userEmail);
        await ageEmissions(user.id, 61);
        sendVerificationEmail.mockResolvedValueOnce({ ok: false, reason: 'exception' });

        const res = await resendVerificationToken(userEmail);

        expect(res.success).toBe(false);
        expect(await confirmEmailToken(lastTokenSentTo(userEmail))).toMatchObject({
          success: false,
        });
        expect(
          (await prisma().user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified,
        ).toBe(false);
      });
    });
  },
);
