// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as prismaModule from '@/persistence/prisma';
import { AuthConfigurationError, getAuth, resolveAuthEnvironment } from './auth';

// Valores sinteticos, apenas de teste: nenhum segredo real (IC-12.2).
const SYNTHETIC_SECRET = 'segredo-sintetico-de-teste-0123456789abcdef';

type GlobalWithAuth = typeof globalThis & { __troqAuth?: unknown };

function resetAuthInstance() {
  delete (globalThis as GlobalWithAuth).__troqAuth;
}

function env(overrides: Record<string, string | undefined>): Record<string, string | undefined> {
  return {
    APP_ENV: 'development',
    BETTER_AUTH_SECRET: SYNTHETIC_SECRET,
    BETTER_AUTH_URL: 'http://localhost:3000',
    ...overrides,
  };
}

describe('configuracao fail-closed do Better Auth (IC-12, #40)', () => {
  it('aceita development com URL local explicita', () => {
    expect(resolveAuthEnvironment(env({}))).toEqual({
      appEnv: 'development',
      secret: SYNTHETIC_SECRET,
      baseURL: 'http://localhost:3000',
    });
  });

  it('aceita preview e production com https fora de localhost', () => {
    for (const appEnv of ['preview', 'production']) {
      const resolved = resolveAuthEnvironment(
        env({ APP_ENV: appEnv, BETTER_AUTH_URL: 'https://troq.example.test/' }),
      );
      expect(resolved.baseURL).toBe('https://troq.example.test');
    }
  });

  it.each([
    ['APP_ENV ausente', { APP_ENV: undefined }, 'APP_ENV'],
    ['APP_ENV desconhecido', { APP_ENV: 'staging' }, 'APP_ENV'],
    ['segredo ausente', { BETTER_AUTH_SECRET: undefined }, 'BETTER_AUTH_SECRET'],
    ['segredo vazio', { BETTER_AUTH_SECRET: '' }, 'BETTER_AUTH_SECRET'],
    ['segredo curto', { BETTER_AUTH_SECRET: 'curto-demais' }, 'BETTER_AUTH_SECRET'],
    ['URL ausente', { BETTER_AUTH_URL: undefined }, 'BETTER_AUTH_URL'],
    ['URL relativa', { BETTER_AUTH_URL: '/api/auth' }, 'BETTER_AUTH_URL'],
    ['esquema nao web', { BETTER_AUTH_URL: 'ftp://troq.example.test' }, 'BETTER_AUTH_URL'],
  ])('recusa %s', (_caso, overrides, variable) => {
    expect(() => resolveAuthEnvironment(env(overrides))).toThrow(AuthConfigurationError);
    expect(() => resolveAuthEnvironment(env(overrides))).toThrow(variable);
  });

  it.each([
    ['preview', 'http://troq.example.test'],
    ['preview', 'https://localhost:3000'],
    ['production', 'https://127.0.0.1'],
    ['production', 'https://[::1]:3000'],
    ['preview', 'https://app.localhost'],
  ])('recusa em %s a URL incoerente %s', (appEnv, url) => {
    expect(() => resolveAuthEnvironment(env({ APP_ENV: appEnv, BETTER_AUTH_URL: url }))).toThrow(
      AuthConfigurationError,
    );
  });

  it('a mensagem de erro nunca contem o valor do segredo', () => {
    const shortSecret = 'valor-secreto-curto';
    expect(() => resolveAuthEnvironment(env({ BETTER_AUTH_SECRET: shortSecret }))).toThrow(
      expect.not.objectContaining({ message: expect.stringContaining(shortSecret) }),
    );
  });

  describe('instancia do provedor', () => {
    beforeEach(() => {
      resetAuthInstance();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
      resetAuthInstance();
    });

    it('sem configuracao obrigatoria nao cria instancia com default inseguro', () => {
      vi.stubEnv('APP_ENV', 'preview');
      vi.stubEnv('BETTER_AUTH_SECRET', '');
      vi.stubEnv('BETTER_AUTH_URL', 'https://troq.example.test');

      expect(() => getAuth()).toThrow(AuthConfigurationError);
      expect((globalThis as GlobalWithAuth).__troqAuth).toBeUndefined();
    });

    it('recusa cadastro pelo endpoint do provedor, que pularia 18+ e aceite de termos', async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', SYNTHETIC_SECRET);
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
      const userCreate = vi.fn();
      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        user: { create: userCreate, findFirst: vi.fn() },
      } as unknown as prismaModule.PrismaClient);

      await expect(
        getAuth().api.signUpEmail({
          body: { name: 'Sintetico', email: 'bypass@example.test', password: 'senha-12345678' },
        }),
      ).rejects.toMatchObject({ body: { code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' } });
      expect(userCreate).not.toHaveBeenCalled();
    });
  });
});
