// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SOCIAL_SIGNUP_DISABLED,
  googleSignupCookieFor,
  resolveGoogleConfig,
  validateProviderIdentity,
  withoutProviderTokens,
} from './google';
import { getAuth } from './auth';
import * as prismaModule from '@/persistence/prisma';

// Valores sinteticos, apenas de teste: nenhuma credencial real (IC-12.2).
const CLIENT_ID = 'cliente-sintetico.apps.googleusercontent.com';
const CLIENT_SECRET = 'segredo-sintetico-do-cliente';

type GlobalWithAuth = typeof globalThis & { __troqAuth?: unknown };

describe('configuracao do Google (IC-15.8)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('com as duas variaveis validas habilita o provedor', () => {
    expect(
      resolveGoogleConfig({ GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET }),
    ).toEqual({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  });

  it('sem nenhuma variavel fica desligado, sem erro e sem log', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(resolveGoogleConfig({})).toBeNull();
    expect(
      resolveGoogleConfig({
        GOOGLE_CLIENT_ID: 'SUBSTITUIR_GOOGLE_CLIENT_ID',
        GOOGLE_CLIENT_SECRET: 'SUBSTITUIR_GOOGLE_CLIENT_SECRET',
      }),
    ).toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    ['so o client id', { GOOGLE_CLIENT_ID: CLIENT_ID }, 'GOOGLE_CLIENT_SECRET'],
    ['so o segredo', { GOOGLE_CLIENT_SECRET: CLIENT_SECRET }, 'GOOGLE_CLIENT_ID'],
    [
      'client id fora do formato',
      { GOOGLE_CLIENT_ID: 'qualquer-coisa', GOOGLE_CLIENT_SECRET: CLIENT_SECRET },
      'GOOGLE_CLIENT_ID',
    ],
  ])(
    'configuracao parcial ou malformada (%s) desliga o Google e nomeia a variavel, nunca o valor',
    (_caso, env, variable) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(resolveGoogleConfig(env)).toBeNull();
      const logged = log.mock.calls.flat().join(' ');
      expect(logged).toContain(variable);
      expect(logged).not.toContain(CLIENT_SECRET);
      expect(logged).not.toContain(CLIENT_ID);
    },
  );

  describe('instancia do provedor', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      delete (globalThis as GlobalWithAuth).__troqAuth;
    });

    it('sem Google o Better Auth e construido normalmente e nao conhece o provedor', async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', 'segredo-sintetico-de-teste-0123456789abcdef');
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
      vi.stubEnv('GOOGLE_CLIENT_ID', '');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
      delete (globalThis as GlobalWithAuth).__troqAuth;
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue(
        {} as unknown as prismaModule.PrismaClient,
      );

      await expect(
        getAuth().api.signInSocial({ body: { provider: 'google', callbackURL: '/conta' } }),
      ).rejects.toMatchObject({ body: { code: 'PROVIDER_NOT_FOUND' } });
    });
  });
});

describe('cookie da pendencia de cadastro', () => {
  it('usa o prefixo __Host- em https e nome simples em http local', () => {
    expect(googleSignupCookieFor('https://troq.example.test')).toEqual({
      name: '__Host-troq-google-signup',
      secure: true,
    });
    expect(googleSignupCookieFor('http://localhost:3000')).toEqual({
      name: 'troq-google-signup',
      secure: false,
    });
  });
});

describe('gate validateUserInfo (IC-15.2)', () => {
  const ctx = {} as Parameters<typeof validateProviderIdentity>[1];

  it('recusa criacao de usuario por qualquer caminho que nao seja o Google', async () => {
    await expect(
      validateProviderIdentity(
        { user: { email: 'a@example.test' }, source: { method: 'email', action: 'create-user' } },
        ctx,
      ),
    ).resolves.toEqual({ error: SOCIAL_SIGNUP_DISABLED });
  });

  it('nao interfere em entrada nem em vinculacao', async () => {
    for (const action of ['sign-in', 'link-account'] as const) {
      await expect(
        validateProviderIdentity(
          {
            user: { email: 'a@example.test' },
            source: { method: 'oauth', action, oauth: { providerId: 'google' } },
          },
          ctx,
        ),
      ).resolves.toBeUndefined();
    }
  });

  it('identidade Google sem e-mail verificado nao gera pendencia', async () => {
    await expect(
      validateProviderIdentity(
        {
          user: { email: 'a@example.test', emailVerified: false },
          source: {
            method: 'oauth',
            action: 'create-user',
            oauth: { providerId: 'google', profile: { sub: '123' } },
          },
        },
        ctx,
      ),
    ).resolves.toEqual({ error: 'google_email_not_verified' });
  });
});

describe('tokens do provedor (IC-15.7)', () => {
  it('descarta tokens de contas sociais e preserva a credencial de senha', () => {
    expect(
      withoutProviderTokens({
        providerId: 'google',
        accountId: '123',
        accessToken: 'a',
        refreshToken: 'r',
        idToken: 'i',
      }),
    ).toMatchObject({ accessToken: null, refreshToken: null, idToken: null });
    const credential = { providerId: 'credential', accountId: 'u', password: 'hash' };
    expect(withoutProviderTokens(credential)).toBe(credential);
  });
});
