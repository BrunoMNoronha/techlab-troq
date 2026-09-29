import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, isAPIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { getPrismaClient } from '@/persistence/prisma';

// Better Auth e a UNICA autoridade de sessao do TROQ: autentica email/senha,
// cria a sessao, grava e le o cookie assinado e encerra a sessao
// (docs/architecture/identity-contract.md, IC-5). O dominio so aplica
// autorizacao depois, em `validateSession` (IC-8).

export const APP_ENVIRONMENTS = ['development', 'preview', 'production'] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/** Codigo do erro do provedor quando a conta existe mas nao pode abrir sessao. */
export const ACCOUNT_NOT_ACTIVE_CODE = 'ACCOUNT_NOT_ACTIVE';

const MIN_SECRET_LENGTH = 32;
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Configuracao de ambiente ausente ou incoerente. A mensagem nomeia a variavel
 * e a regra violada, nunca o valor (IC-12.1; environments.md, secao 6.5).
 */
export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(`Configuracao de autenticacao invalida: ${message}`);
    this.name = 'AuthConfigurationError';
  }
}

export interface AuthEnvironment {
  appEnv: AppEnvironment;
  secret: string;
  baseURL: string;
}

function isAppEnvironment(value: string | undefined): value is AppEnvironment {
  return (APP_ENVIRONMENTS as readonly string[]).includes(value ?? '');
}

/**
 * Resolve e valida a configuracao do Better Auth, fail-closed (IC-12). Nao ha
 * segredo nem URL de fallback: sem configuracao completa e coerente, lanca
 * `AuthConfigurationError` e nenhuma instancia de autenticacao e criada.
 */
export function resolveAuthEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AuthEnvironment {
  const appEnv = env.APP_ENV;
  if (!isAppEnvironment(appEnv)) {
    throw new AuthConfigurationError(
      `APP_ENV deve ser ${APP_ENVIRONMENTS.join(', ')} (docs/engineering/environments.md, secao 5.1).`,
    );
  }

  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new AuthConfigurationError(
      `BETTER_AUTH_SECRET ausente ou com menos de ${MIN_SECRET_LENGTH} caracteres (docs/engineering/environments.md, secao 5.5).`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(env.BETTER_AUTH_URL ?? '');
  } catch {
    throw new AuthConfigurationError('BETTER_AUTH_URL ausente ou nao e uma URL absoluta.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AuthConfigurationError('BETTER_AUTH_URL deve usar http ou https.');
  }

  if (appEnv !== 'development') {
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:') {
      throw new AuthConfigurationError(`BETTER_AUTH_URL deve usar https em ${appEnv}.`);
    }
    if (LOOPBACK_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
      throw new AuthConfigurationError(
        `BETTER_AUTH_URL nao pode apontar para localhost em ${appEnv}.`,
      );
    }
  }

  return { appEnv, secret, baseURL: parsed.origin };
}

function createAuth() {
  const { secret, baseURL } = resolveAuthEnvironment();
  const prisma = getPrismaClient();

  return betterAuth({
    secret,
    baseURL,
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // Cadastro so pela Server Action `registerUser`, que grava 18+ e aceite
      // dos termos na mesma transacao da conta (IC-6.1).
      disableSignUp: true,
    },
    // `emailVerification` fica deliberadamente sem configuracao: a verificacao
    // usa token do TROQ (IC-7.1), e o login de conta nao verificada responde
    // EMAIL_NOT_VERIFIED sem enviar email nem criar sessao.
    user: {
      modelName: 'user',
      fields: {
        name: 'displayName',
      },
    },
    session: {
      modelName: 'session',
      expiresIn: 60 * 60 * 24 * 7, // 7 dias (IC-5.4)
      updateAge: 60 * 60 * 24, // 1 dia
      // Sem cache em cookie: sessao revogada deixa de valer na hora (IC-5.3).
      cookieCache: { enabled: false },
    },
    account: {
      modelName: 'account',
    },
    verification: {
      modelName: 'verification',
    },
    advanced: {
      database: { generateId: 'uuid' },
      ipAddress: { disableIpTracking: true },
    },
    databaseHooks: {
      session: {
        create: {
          // Ponto unico que impede sessao de conta nao ativa, qualquer que seja
          // o caminho do provedor (IC-5.3). Tambem nao persiste IP nem
          // user-agent (IC-11.1).
          before: async (session) => {
            const user = await getPrismaClient().user.findUnique({
              where: { id: session.userId },
              select: { status: true },
            });
            if (user?.status !== 'active') {
              throw new APIError('FORBIDDEN', {
                message: 'Conta nao ativa.',
                code: ACCOUNT_NOT_ACTIVE_CODE,
              });
            }
            return { data: { ...session, ipAddress: null, userAgent: null } };
          },
        },
      },
    },
    // Grava, em Server Actions, os cookies emitidos pelo provedor. Deve ser o
    // ultimo plugin (documentacao oficial, integracao Next.js).
    plugins: [nextCookies()],
  });
}

/**
 * Rotulo seguro para log de uma falha de autenticacao: status e codigo do
 * provedor, ou o nome do erro. Nunca a mensagem nem o objeto, que podem
 * carregar dado de requisicao (IC-11.2).
 */
export function authErrorLabel(err: unknown): string {
  if (isAPIError(err)) {
    const code = typeof err.body?.code === 'string' ? err.body.code : 'sem-codigo';
    return `${err.status}/${code}`;
  }
  return err instanceof Error ? err.name : 'erro-desconhecido';
}

// Cache singleton para o server-side do Better Auth
type GlobalWithAuth = typeof globalThis & { __troqAuth?: ReturnType<typeof createAuth> };

/**
 * Instancia do Better Auth, criada na primeira chamada. Lanca
 * `AuthConfigurationError` se o ambiente estiver incompleto ou incoerente.
 */
export function getAuth() {
  const scope = globalThis as GlobalWithAuth;
  scope.__troqAuth ??= createAuth();
  return scope.__troqAuth;
}
