// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as prismaModule from '@/persistence/prisma';
import { registerUser, confirmEmailToken, resendVerificationToken } from './actions';

// Testes UNITARIOS das guardas de entrada (IC-6.2, IC-7.3, IC-9.3): nenhuma
// entrada recusada pode chegar ao banco nem ao envio. Persistencia, token,
// concorrencia e limites sao provados contra PostgreSQL real em
// email-verification.integration.test.ts.

const sendVerificationEmail = vi.fn();
vi.mock('./email', () => ({
  sendVerificationEmail: (...args: unknown[]) => sendVerificationEmail(...args),
}));

const validInput = {
  displayName: 'Pessoa Sintetica',
  email: 'pessoa@example.test',
  password: 'senha-valida-123',
  over18: true,
  termsAccepted: true,
};

describe('modulo identity — guardas de entrada do cadastro e da verificacao (#41)', () => {
  let getPrismaClient: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getPrismaClient = vi.spyOn(prismaModule, 'getPrismaClient').mockImplementation(() => {
      throw new Error('o banco nao deveria ser acessado');
    });
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('registerUser', () => {
    it.each([
      ['nome curto', { displayName: 'A' }, 'nome exibido'],
      ['e-mail vazio', { email: '' }, 'e-mail valido'],
      ['e-mail sem dominio', { email: 'pessoa@' }, 'e-mail valido'],
      ['senha com 7 caracteres', { password: '1234567' }, 'entre 8 e 128'],
      ['senha com 129 caracteres', { password: 'a'.repeat(129) }, 'entre 8 e 128'],
      ['sem declaracao 18+', { over18: undefined }, '18 anos'],
      ['declaracao 18+ falsa', { over18: false }, '18 anos'],
      ['declaracao 18+ nao booleana', { over18: 'true' }, '18 anos'],
      ['termos nao aceitos', { termsAccepted: false }, 'Termos de Uso'],
    ])('recusa %s sem tocar o banco nem enviar e-mail', async (_caso, override, message) => {
      const res = await registerUser({ ...validInput, ...override } as typeof validInput);

      expect(res.success).toBe(false);
      expect(res.error).toContain(message);
      expect(getPrismaClient).not.toHaveBeenCalled();
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('aceita os limites exatos de senha ate a etapa de persistencia', async () => {
      for (const password of ['12345678', 'a'.repeat(128)]) {
        getPrismaClient.mockClear();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        await registerUser({ ...validInput, password });
        expect(getPrismaClient).toHaveBeenCalled();
      }
    });

    it.each([
      ['APP_ENV invalido', 'APP_ENV', 'staging'],
      ['URL base ausente', 'BETTER_AUTH_URL', ''],
    ])('com %s nao grava conta nem produz link', async (_caso, variable, value) => {
      vi.stubEnv(variable, value);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const res = await registerUser(validInput);

      expect(res.success).toBe(false);
      expect(getPrismaClient).not.toHaveBeenCalled();
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('preview nao aceita localhost como base dos links', async () => {
      vi.stubEnv('APP_ENV', 'preview');
      vi.stubEnv('BETTER_AUTH_URL', 'https://localhost:3000');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      expect((await registerUser(validInput)).success).toBe(false);
      expect(getPrismaClient).not.toHaveBeenCalled();
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('confirmEmailToken', () => {
    it.each(['', 'curto', 'a'.repeat(64), `${'a'.repeat(42)}!`, 'a'.repeat(44)])(
      'token malformado (%s) e invalido sem consultar o banco',
      async (token) => {
        const res = await confirmEmailToken(token);

        expect(res).toMatchObject({ success: false, reason: 'invalid' });
        expect(getPrismaClient).not.toHaveBeenCalled();
      },
    );
  });

  describe('resendVerificationToken', () => {
    it('exige o e-mail sem tocar o banco', async () => {
      const res = await resendVerificationToken('   ');

      expect(res.success).toBe(false);
      expect(getPrismaClient).not.toHaveBeenCalled();
    });
  });
});
