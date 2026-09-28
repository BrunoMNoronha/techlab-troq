import { headers } from 'next/headers';
import { getAuth } from './auth';
import { getPrismaClient } from '@/persistence/prisma';
import type { UserStatus } from '@/generated/prisma/client';

export { getAuth } from './auth';

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

/**
 * Valida a sessao server-side da requisicao atual.
 * Verifica existencia da sessao no Better Auth e confirma estado ativo e email verificado no PostgreSQL.
 */
export async function validateSession(): Promise<SessionValidationResult> {
  const auth = getAuth();
  const reqHeaders = await headers();
  const sessionData = await auth.api.getSession({
    headers: reqHeaders,
  });

  if (!sessionData || !sessionData.session || !sessionData.user) {
    return { session: null, user: null, isValid: false, reason: 'no_session' };
  }

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
}
