// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { APIError } from 'better-auth/api';
import { loginUser, logoutUser } from './actions';
import { ACCOUNT_NOT_ACTIVE_CODE } from './auth';

// Teste UNITARIO da ponte entre as Server Actions e o Better Auth: o provedor e
// simulado para provar o que a action envia e como traduz cada resposta. Isto
// NAO prova sessao real — essa prova, com o provedor real e PostgreSQL
// descartavel, esta em auth-flow.integration.test.ts.

const requestHeaders = new Headers({ cookie: 'better-auth.session_token=assinado' });
vi.mock('next/headers', () => ({
  headers: async () => requestHeaders,
}));

const api = {
  signInEmail: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
};
const getAuth = vi.fn(() => ({ api }));
vi.mock('./auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth')>()),
  getAuth: () => getAuth(),
}));

// O limite de tentativas (IC-10.2) e simulado aqui para provar QUANDO o
// provedor e chamado e como cada resultado finaliza a reserva; o limite real
// contra PostgreSQL esta em login-rate-limit.integration.test.ts.
const RESERVATION = { identifier: 'login-failure:hash', reservationId: 'r1' };
const limiter = {
  reserveLoginAttempt: vi.fn(),
  recordLoginFailure: vi.fn(),
  releaseLoginAttempt: vi.fn(),
  clearLoginFailures: vi.fn(),
};
vi.mock('./login-rate-limit', () => ({
  reserveLoginAttempt: (email: string) => limiter.reserveLoginAttempt(email),
  recordLoginFailure: (r: unknown) => limiter.recordLoginFailure(r),
  releaseLoginAttempt: (r: unknown) => limiter.releaseLoginAttempt(r),
  clearLoginFailures: (r: unknown) => limiter.clearLoginFailures(r),
}));

const PASSWORD = 'senha-correta-123';

function providerError(status: 'UNAUTHORIZED' | 'FORBIDDEN' | 'BAD_REQUEST', code: string) {
  return new APIError(status, { message: 'erro do provedor', code });
}

describe('modulo identity — ponte das actions com o Better Auth (#40)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    getAuth.mockImplementation(() => ({ api }));
    limiter.reserveLoginAttempt.mockResolvedValue(RESERVATION);
    limiter.recordLoginFailure.mockResolvedValue(undefined);
    limiter.releaseLoginAttempt.mockResolvedValue(undefined);
    limiter.clearLoginFailures.mockResolvedValue(undefined);
  });

  describe('loginUser — limite de tentativas (IC-10.2)', () => {
    it('com o bucket cheio recusa com mensagem generica sem chamar o provedor', async () => {
      limiter.reserveLoginAttempt.mockResolvedValueOnce(null);

      const res = await loginUser('  Alguem@Troq.App ', PASSWORD);

      expect(res).toEqual({
        success: false,
        error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      });
      expect(limiter.reserveLoginAttempt).toHaveBeenCalledWith('alguem@troq.app');
      expect(api.signInEmail).not.toHaveBeenCalled();
    });

    it('senha ausente nao consome vaga do bucket', async () => {
      await loginUser('alguem@troq.app', '');
      expect(limiter.reserveLoginAttempt).not.toHaveBeenCalled();
    });

    it('INVALID_EMAIL_OR_PASSWORD registra a falha', async () => {
      api.signInEmail.mockRejectedValueOnce(
        providerError('UNAUTHORIZED', 'INVALID_EMAIL_OR_PASSWORD'),
      );

      await loginUser('alguem@troq.app', 'errada');

      expect(limiter.recordLoginFailure).toHaveBeenCalledWith(RESERVATION);
      expect(limiter.releaseLoginAttempt).not.toHaveBeenCalled();
    });

    it.each([
      ['e-mail nao verificado', providerError('FORBIDDEN', 'EMAIL_NOT_VERIFIED')],
      ['conta nao ativa', providerError('FORBIDDEN', ACCOUNT_NOT_ACTIVE_CODE)],
      ['e-mail malformado', providerError('BAD_REQUEST', 'INVALID_EMAIL')],
      ['erro tecnico', new Error('falha interna')],
    ])('%s nao conta como falha: a reserva e descartada', async (_caso, err) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      api.signInEmail.mockRejectedValueOnce(err);

      await loginUser('alguem@troq.app', PASSWORD);

      expect(limiter.releaseLoginAttempt).toHaveBeenCalledWith(RESERVATION);
      expect(limiter.recordLoginFailure).not.toHaveBeenCalled();
    });

    it('login bem-sucedido zera o bucket', async () => {
      api.signInEmail.mockResolvedValueOnce({});

      expect((await loginUser('alguem@troq.app', PASSWORD)).success).toBe(true);
      expect(limiter.clearLoginFailures).toHaveBeenCalledWith(RESERVATION);
    });

    it('falha do limitador nega o login sem chamar o provedor', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      limiter.reserveLoginAttempt.mockRejectedValueOnce(new Error('banco indisponivel'));

      const res = await loginUser('alguem@troq.app', PASSWORD);

      expect(res.success).toBe(false);
      expect(api.signInEmail).not.toHaveBeenCalled();
    });
  });

  describe('loginUser', () => {
    it('rejeita e-mail vazio sem chamar o provedor', async () => {
      const res = await loginUser('', PASSWORD);
      expect(res.success).toBe(false);
      expect(res.error).toContain('e-mail');
      expect(api.signInEmail).not.toHaveBeenCalled();
    });

    it('rejeita senha ausente, inclusive em chamada direta sem o argumento', async () => {
      const directCall = loginUser as unknown as (email: string) => ReturnType<typeof loginUser>;

      for (const res of [await loginUser('active@troq.app', ''), await directCall('a@troq.app')]) {
        expect(res.success).toBe(false);
        expect(res.error).toContain('senha');
      }
      expect(api.signInEmail).not.toHaveBeenCalled();
    });

    it('delega ao signInEmail o e-mail normalizado, a senha e os headers da requisicao', async () => {
      api.signInEmail.mockResolvedValueOnce({ token: 'nao-usado', user: { id: 'u1' } });

      const res = await loginUser('  Active@troq.app ', PASSWORD);

      expect(res).toEqual({ success: true, redirectTo: '/conta' });
      expect(api.signInEmail).toHaveBeenCalledWith({
        body: { email: 'active@troq.app', password: PASSWORD },
        headers: requestHeaders,
      });
    });

    it('nao devolve token nem dado de sessao ao cliente', async () => {
      api.signInEmail.mockResolvedValueOnce({ token: 'token-secreto', user: { id: 'u1' } });

      const res = await loginUser('active@troq.app', PASSWORD);

      expect(JSON.stringify(res)).not.toContain('token-secreto');
    });

    it.each([
      ['UNAUTHORIZED', 'INVALID_EMAIL_OR_PASSWORD'],
      ['BAD_REQUEST', 'INVALID_EMAIL'],
    ] as const)('credencial invalida (%s/%s) recebe a mensagem generica', async (status, code) => {
      api.signInEmail.mockRejectedValueOnce(providerError(status, code));

      const res = await loginUser('quem@troq.app', 'senha-errada');

      expect(res).toEqual({ success: false, error: 'E-mail ou senha invalidos.' });
    });

    it('e-mail nao verificado e informado apos a senha correta', async () => {
      api.signInEmail.mockRejectedValueOnce(providerError('FORBIDDEN', 'EMAIL_NOT_VERIFIED'));

      const res = await loginUser('pendente@troq.app', PASSWORD);

      expect(res.success).toBe(false);
      expect(res.error).toContain('nao foi verificado');
    });

    it('conta nao ativa recusada pelo hook de sessao e informada apos a senha correta', async () => {
      api.signInEmail.mockRejectedValueOnce(providerError('FORBIDDEN', ACCOUNT_NOT_ACTIVE_CODE));

      const res = await loginUser('bloqueada@troq.app', PASSWORD);

      expect(res.success).toBe(false);
      expect(res.error).toContain('suspensa ou inativa');
    });

    it('falha inesperada ou configuracao ausente nao declara sucesso nem registra a senha', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      getAuth.mockImplementationOnce(() => {
        throw new Error(`configuracao ausente ${PASSWORD}`);
      });

      const res = await loginUser('active@troq.app', PASSWORD);

      expect(res.success).toBe(false);
      expect(JSON.stringify(log.mock.calls)).not.toContain(PASSWORD);
    });

    it('retorna ao anuncio de origem quando o destino e interno (#59)', async () => {
      api.signInEmail.mockResolvedValueOnce({});

      const res = await loginUser('active@troq.app', PASSWORD, '/explorar/abc-123');
      expect(res).toEqual({ success: true, redirectTo: '/explorar/abc-123' });
    });

    it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])(
      'ignora destino de retorno externo %s e usa /conta (#59)',
      async (returnTo) => {
        api.signInEmail.mockResolvedValueOnce({});

        const res = await loginUser('active@troq.app', PASSWORD, returnTo);
        expect(res).toEqual({ success: true, redirectTo: '/conta' });
      },
    );
  });

  describe('logoutUser', () => {
    it('encerra pelo signOut e confirma, com os mesmos headers, que a sessao deixou de existir', async () => {
      api.signOut.mockResolvedValueOnce({ success: true });
      api.getSession.mockResolvedValueOnce(null);

      expect(await logoutUser()).toEqual({ success: true });
      expect(api.signOut).toHaveBeenCalledWith({ headers: requestHeaders });
      expect(api.getSession).toHaveBeenCalledWith({
        headers: requestHeaders,
        query: { disableRefresh: true },
      });
    });

    it('nao declara sucesso se a sessao continua valida depois do signOut', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      api.signOut.mockResolvedValueOnce({ success: true });
      api.getSession.mockResolvedValueOnce({ session: {}, user: { id: 'u1' } });

      expect((await logoutUser()).success).toBe(false);
    });

    it.each([
      ['signOut falha', () => api.signOut.mockRejectedValueOnce(new Error('db'))],
      [
        'confirmacao falha',
        () => {
          api.signOut.mockResolvedValueOnce({ success: true });
          api.getSession.mockRejectedValueOnce(new Error('db'));
        },
      ],
      [
        'configuracao ausente',
        () =>
          getAuth.mockImplementationOnce(() => {
            throw new Error('configuracao ausente');
          }),
      ],
    ])('nao declara sucesso quando %s', async (_caso, arrange) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      arrange();

      expect((await logoutUser()).success).toBe(false);
    });
  });
});
