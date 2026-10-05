import { headers } from 'next/headers';
import { authErrorLabel, getAuth } from './auth';
import { getPrismaClient } from '@/persistence/prisma';
import type { UserStatus } from '@/generated/prisma/client';

export { getAuth } from './auth';
export { sanitizeReturnPath } from './return-path';
// F3-013 (#103): avisos transacionais por tipo (RF-021, DEC-048). O endereco
// do destinatario nunca sai deste modulo.
export { notifyUser, noticeIdempotencyKey, renderNotice } from './notifications';
export type { NoticeDeliveryResult, NoticeKind, RenderedNotice, UserNotice } from './notifications';
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

const NO_SESSION: SessionValidationResult = {
  user: null,
  isValid: false,
  reason: 'no_session',
};

/**
 * Guard server-side de toda acao protegida (nivel N1 de AR-7.2; IC-8.1).
 *
 * 1. A identidade vem EXCLUSIVAMENTE do Better Auth (`getSession`), que confere
 *    a assinatura do cookie, a existencia da sessao e a expiracao. Sem sessao
 *    do provedor nao ha sessao: nao existe leitura do cookie nem da tabela de
 *    sessoes pelo token (IC-5.2).
 * 2. A autorizacao de dominio le o estado ATUAL da conta em `users` pelo id
 *    autenticado: so `active` com email verificado e valida.
 *
 * Qualquer falha interna nega (fail-closed) e e registrada sem token, cookie
 * ou mensagem do erro (IC-5.7, IC-11.2).
 */
export async function validateSession(): Promise<SessionValidationResult> {
  let userId: string;
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (!session) {
      return { ...NO_SESSION };
    }
    userId = session.user.id;
  } catch (err) {
    console.error('[validateSession] falha ao validar a sessao no provedor:', authErrorLabel(err));
    return { ...NO_SESSION };
  }

  let dbUser: AuthenticatedUser | null;
  try {
    dbUser = await getPrismaClient().user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, emailVerified: true, status: true },
    });
  } catch (err) {
    console.error('[validateSession] falha ao ler o estado da conta:', authErrorLabel(err));
    return { ...NO_SESSION };
  }

  if (!dbUser) {
    return { ...NO_SESSION };
  }

  if (dbUser.status !== 'active') {
    return {
      user: dbUser,
      isValid: false,
      reason: dbUser.status === 'deletion_requested' ? 'deletion_requested' : 'blocked',
    };
  }

  if (!dbUser.emailVerified) {
    return { user: dbUser, isValid: false, reason: 'unverified' };
  }

  return { user: dbUser, isValid: true };
}
