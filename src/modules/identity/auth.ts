import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { getPrismaClient } from '@/persistence/prisma';

// Cache singleton para o server-side do Better Auth
type GlobalWithAuth = typeof globalThis & { __troqAuth?: ReturnType<typeof createAuth> };

function createAuth() {
  const prisma = getPrismaClient();

  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // Cadastro so pela Server Action `registerUser`, que registra 18+ e aceite
      // dos termos (docs/product/age-eligibility.md). O endpoint do provedor
      // criaria conta sem esses registros.
      disableSignUp: true,
    },
    user: {
      modelName: 'user',
      fields: {
        name: 'displayName',
        emailVerified: 'emailVerified',
      },
    },
    session: {
      modelName: 'session',
      expiresIn: 60 * 60 * 24 * 7, // 7 dias
      updateAge: 60 * 60 * 24, // 1 dia
    },
    account: {
      modelName: 'account',
    },
    verification: {
      modelName: 'verification',
    },
    secret: process.env.BETTER_AUTH_SECRET || 'development-secret-key-at-least-32-chars-long',
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  });
}

export function getAuth() {
  const scope = globalThis as GlobalWithAuth;
  scope.__troqAuth ??= createAuth();
  return scope.__troqAuth;
}
