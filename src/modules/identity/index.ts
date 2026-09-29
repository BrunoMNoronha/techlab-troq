import { headers, cookies } from 'next/headers';
import { getAuth } from './auth';
import { getPrismaClient } from '@/persistence/prisma';
import type { UserStatus } from '@/generated/prisma/client';

export { getAuth } from './auth';
export { sanitizeReturnPath } from './return-path';
export {
  registerUser,
  confirmEmailToken,
  resendVerificationToken,
  loginUser,
  logoutUser,
} from './actions';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  status: UserStatus;
}

export interface SessionValidationResult {
  session: unknown | null;
  user: AuthenticatedUser | null;
  isValid: boolean;
  reason?: 'no_session' | 'unverified' | 'blocked' | 'deletion_requested';
}

const LOGIN_REASON: Record<NonNullable<SessionValidationResult['reason']>, string> = {
  no_session: 'sessao',
  blocked: 'bloqueada',
  deletion_requested: 'excluida',
  unverified: 'nao_verificada',
};

/**
 * Caminho de login para uma sessao invalida, com o motivo exibido pela tela de
 * login (sessao ausente/expirada/revogada, conta bloqueada, excluida ou nao verificada).
 */
export function loginRedirectPath(reason: SessionValidationResult['reason']): string {
  return `/login?motivo=${LOGIN_REASON[reason ?? 'no_session']}`;
}

/**
 * Valida a sessao server-side da requisicao atual.
 * Verifica existencia da sessao no Better Auth ou fallback direto via Prisma token,
 * e confirma estado ativo e email verificado no PostgreSQL.
 */
export async function validateSession(): Promise<SessionValidationResult> {
  const auth = getAuth();
  const reqHeaders = await headers();
  let sessionData: { session: unknown; user: { id: string } } | null = null;

  try {
    const rawSession = await auth.api.getSession({
      headers: reqHeaders,
    });
    if (rawSession && rawSession.session && rawSession.user) {
      sessionData = rawSession as { session: unknown; user: { id: string } };
    }
  } catch (_e) {
    // Better Auth getSession error fallback
  }

  // Fallback: Se auth.api.getSession nao autenticar via cookie assinado do Better Auth,
  // busca a sessao token diretamente na tabela Session do Prisma
  if (!sessionData) {
    try {
      const cookieStore = await cookies();
      const token = cookieStore.get('better-auth.session_token')?.value;

      if (token) {
        const prisma = getPrismaClient();
        if (prisma?.session) {
          const sessionRecord = await prisma.session.findUnique({
            where: { token },
            include: { user: true },
          });

          if (sessionRecord && sessionRecord.expiresAt > new Date()) {
            sessionData = {
              session: sessionRecord,
              user: { id: sessionRecord.userId },
            };
          }
        }
      }
    } catch (_e) {
      // Ignora erros na leitura de cookies/Prisma em ambientes sem DATABASE_URL ou contexto HTTP
    }
  }

  if (!sessionData || !sessionData.session || !sessionData.user) {
    return { session: null, user: null, isValid: false, reason: 'no_session' };
  }

  try {
    const prisma = getPrismaClient();
    const dbUser = await prisma.user.findUnique({
      where: { id: sessionData.user.id },
      select: { id: true, email: true, displayName: true, emailVerified: true, status: true },
    });

    if (!dbUser) {
      return { session: null, user: null, isValid: false, reason: 'no_session' };
    }

    if (dbUser.status !== 'active') {
      return {
        session: sessionData.session,
        user: dbUser,
        isValid: false,
        reason: dbUser.status === 'deletion_requested' ? 'deletion_requested' : 'blocked',
      };
    }

    if (!dbUser.emailVerified) {
      return {
        session: sessionData.session,
        user: dbUser,
        isValid: false,
        reason: 'unverified',
      };
    }

    return {
      session: sessionData.session,
      user: dbUser,
      isValid: true,
    };
  } catch (_e) {
    return { session: null, user: null, isValid: false, reason: 'no_session' };
  }
}
