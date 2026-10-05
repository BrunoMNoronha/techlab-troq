'use server';

import { headers } from 'next/headers';
import { getPrismaClient } from '@/persistence/prisma';
import { hashPassword } from 'better-auth/crypto';
import { isAPIError } from 'better-auth/api';
import { ACCOUNT_NOT_ACTIVE_CODE, authErrorLabel, getAuth, resolveAppOrigin } from './auth';
import { sendVerificationEmail } from './email';
import { sanitizeReturnPath } from './return-path';
import { TERMS_VERSION } from './terms';
import {
  clearLoginFailures,
  recordLoginFailure,
  releaseLoginAttempt,
  reserveLoginAttempt,
  type LoginAttemptReservation,
} from './login-rate-limit';
import {
  confirmVerificationToken,
  invalidateVerificationToken,
  issueResendToken,
  issueVerificationToken,
  type IssuedToken,
} from './verification';

export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  over18: boolean;
  termsAccepted: boolean;
}

export interface RegisterResult {
  success: boolean;
  error?: string;
  /** E-mail da conta criada, para a tela de confirmacao. */
  emailPending?: string;
  /**
   * `failed`: a conta foi criada e continua nao verificada, mas o e-mail nao
   * saiu; a interface oferece reenvio, nunca novo cadastro (IC-9.2).
   */
  emailDelivery?: 'sent' | 'failed';
}

export interface ConfirmEmailResult {
  success: boolean;
  reason?: 'invalid' | 'expired' | 'error';
  error?: string;
}

export interface ResendResult {
  success: boolean;
  message?: string;
  error?: string;
}

// Convencoes do Better Auth para a credencial email/senha: `providerId`
// 'credential' e `accountId` igual ao id do usuario. O hash usa o algoritmo
// padrao do provedor (better-auth/crypto), o mesmo que `auth.api.signInEmail`
// confere no login (identity-contract.md, IC-4.2).
const CREDENTIAL_PROVIDER_ID = 'credential';
const INVALID_CREDENTIALS_ERROR = 'E-mail ou senha invalidos.';
const SESSION_START_ERROR = 'Nao foi possivel iniciar a sessao. Tente novamente.';
const SESSION_END_ERROR = 'Nao foi possivel encerrar a sessao. Tente novamente.';
// IC-10.2: mesma resposta exista ou nao a conta.
const TOO_MANY_ATTEMPTS_ERROR = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';

// Limites padrao do provedor para senha (IC-4.3).
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DUPLICATE_EMAIL_ERROR = 'Este e-mail ja esta cadastrado na plataforma.';
const REGISTRATION_UNAVAILABLE_ERROR =
  'Nao foi possivel concluir o cadastro agora. Tente novamente mais tarde.';
// Resposta unica do reenvio (IC-9.3): nao revela se a conta existe, se ja foi
// verificada, se esta ativa ou se o limite suprimiu a emissao.
const RESEND_GENERIC_MESSAGE =
  'Se houver cadastro pendente de verificacao para este e-mail, enviaremos um novo link.';
const RESEND_DELIVERY_ERROR = 'Nao foi possivel enviar o e-mail agora. Tente novamente.';

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'P2002';
}

/**
 * Envia o link do token emitido. O token vai no FRAGMENTO (`#token=`), que o
 * navegador nunca envia ao servidor nem poe no `Referer`: na query string ele
 * seria gravado pelos logs de requisicao da plataforma (IC-9.1, IC-11.2). Se o
 * envio falhar, o token e invalidado na hora: um link que o usuario nunca
 * recebeu nao pode continuar valido (IC-9.2).
 */
async function deliverVerificationLink(
  email: string,
  baseURL: string,
  issued: IssuedToken,
): Promise<boolean> {
  const delivery = await sendVerificationEmail({
    to: email,
    verificationUrl: `${baseURL}/verificar-email#token=${encodeURIComponent(issued.token)}`,
    idempotencyKey: `email-verification/${issued.verificationId}`,
  });
  if (delivery.ok) {
    return true;
  }
  try {
    await invalidateVerificationToken(issued.verificationId);
  } catch (err) {
    console.error('[email] falha ao invalidar token nao entregue:', authErrorLabel(err));
  }
  return false;
}

/**
 * Server Action de cadastro (identity-contract.md, IC-6).
 * Valida no servidor nome, e-mail, senha (8 a 128), a declaracao explicita de
 * 18 anos ou mais e o aceite dos termos — sem data de nascimento nem documento.
 * Em UMA transacao cria `User` (`active`, nao verificado), a credencial e o
 * `TermsAcceptance` `age_eligibility`, e emite o primeiro token (que conta no
 * limite de reenvio). O e-mail sai depois do commit; se falhar, a conta
 * permanece nao verificada e recuperavel pelo reenvio. Nao cria sessao.
 */
export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const { displayName, password, over18, termsAccepted } = input ?? ({} as RegisterInput);
  const cleanName = typeof displayName === 'string' ? displayName.trim() : '';
  const cleanEmail = normalizeEmail(input?.email);

  if (cleanName.length < 2) {
    return { success: false, error: 'O nome exibido deve ter pelo menos 2 caracteres.' };
  }

  if (!cleanEmail || cleanEmail.length > MAX_EMAIL_LENGTH || !EMAIL_FORMAT.test(cleanEmail)) {
    return { success: false, error: 'Informe um e-mail valido.' };
  }

  if (
    typeof password !== 'string' ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return {
      success: false,
      error: `A senha deve ter entre ${MIN_PASSWORD_LENGTH} e ${MAX_PASSWORD_LENGTH} caracteres.`,
    };
  }

  if (over18 !== true) {
    return {
      success: false,
      error: 'E necessario confirmar ter 18 anos ou mais para se cadastrar.',
    };
  }

  if (termsAccepted !== true) {
    return { success: false, error: 'Voce precisa aceitar os Termos de Uso.' };
  }

  // A origem dos links e resolvida antes de gravar qualquer coisa: sem URL base
  // valida nao ha link, e nao se cria conta que nao poderia ser verificada (IC-12.3).
  let baseURL: string;
  try {
    baseURL = resolveAppOrigin().baseURL;
  } catch (err) {
    console.error('[Register Action Error]', authErrorLabel(err));
    return { success: false, error: REGISTRATION_UNAVAILABLE_ERROR };
  }

  let issued: IssuedToken;
  try {
    const prisma = getPrismaClient();
    // O provedor localiza usuario por e-mail em toda a tabela: enquanto a
    // exclusao nao tornar o e-mail irresolvivel, qualquer linha conflita (IC-2.5).
    const existing = await prisma.user.findFirst({
      where: { email: cleanEmail },
      select: { id: true },
    });
    if (existing) {
      return { success: false, error: DUPLICATE_EMAIL_ERROR };
    }

    const passwordHash = await hashPassword(password);

    issued = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          displayName: cleanName,
          email: cleanEmail,
          emailVerified: false,
          status: 'active',
        },
      });

      await tx.account.create({
        data: {
          userId: newUser.id,
          accountId: newUser.id,
          providerId: CREDENTIAL_PROVIDER_ID,
          password: passwordHash,
        },
      });

      await tx.termsAcceptance.create({
        data: {
          userId: newUser.id,
          type: 'age_eligibility',
          termsVersion: TERMS_VERSION,
        },
      });

      return issueVerificationToken(tx, newUser.id);
    });
  } catch (err) {
    // Cadastro concorrente com o mesmo e-mail: o indice unico decide (IC-6.4).
    if (isUniqueViolation(err)) {
      return { success: false, error: DUPLICATE_EMAIL_ERROR };
    }
    console.error('[Register Action Error]', authErrorLabel(err));
    return {
      success: false,
      error: 'Ocorreu um erro interno ao processar seu cadastro. Tente novamente.',
    };
  }

  const sent = await deliverVerificationLink(cleanEmail, baseURL, issued);
  return {
    success: true,
    emailPending: cleanEmail,
    emailDelivery: sent ? 'sent' : 'failed',
  };
}

/**
 * Server Action que confirma o e-mail pelo token do link (IC-7.3). O token e
 * de uso unico e resistente a confirmacao concorrente. Nao cria sessao: depois
 * do sucesso, o usuario entra pelo login.
 */
export async function confirmEmailToken(token: string): Promise<ConfirmEmailResult> {
  try {
    const outcome = await confirmVerificationToken(token);
    if (outcome === 'verified') {
      return { success: true };
    }
    if (outcome === 'expired') {
      return {
        success: false,
        reason: 'expired',
        error: 'Este link de verificacao expirou. Solicite um novo link.',
      };
    }
    return {
      success: false,
      reason: 'invalid',
      error: 'Link de verificacao invalido ou ja utilizado. Se voce ja confirmou, faca login.',
    };
  } catch (err) {
    console.error('[Confirm Email Error]', authErrorLabel(err));
    return {
      success: false,
      reason: 'error',
      error: 'Nao foi possivel confirmar agora. Tente abrir o link novamente em instantes.',
    };
  }
}

/**
 * Server Action de reenvio do e-mail de verificacao (IC-9.3 e IC-9.4). A
 * resposta e generica para e-mail inexistente, ja verificado, conta nao ativa
 * ou envio suprimido pelo limite; so a falha do provedor para conta elegivel
 * recebe resposta propria.
 */
export async function resendVerificationToken(email: string): Promise<ResendResult> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) {
    return { success: false, error: 'Informe o e-mail cadastrado.' };
  }

  const generic: ResendResult = { success: true, message: RESEND_GENERIC_MESSAGE };

  let baseURL: string;
  let issued: IssuedToken | null;
  try {
    baseURL = resolveAppOrigin().baseURL;

    const user = await getPrismaClient().user.findFirst({
      where: { email: cleanEmail, status: 'active', emailVerified: false },
      select: { id: true },
    });
    if (!user) {
      return generic;
    }
    issued = await issueResendToken(user.id);
  } catch (err) {
    console.error('[Resend Verification Error]', authErrorLabel(err));
    return { success: false, error: RESEND_DELIVERY_ERROR };
  }

  if (!issued) {
    return generic;
  }

  const sent = await deliverVerificationLink(cleanEmail, baseURL, issued);
  return sent ? generic : { success: false, error: RESEND_DELIVERY_ERROR };
}

/**
 * Server Action para autenticacao (Login).
 * Exige e-mail E senha. Autenticacao, criacao da sessao e gravacao do cookie
 * pertencem ao Better Auth (`auth.api.signInEmail` + `nextCookies()`;
 * identity-contract.md, IC-5.1): esta action nao cria sessao nem cookie.
 * A ordem do provedor e senha -> verificacao do e-mail -> criacao da sessao,
 * e o hook de criacao recusa conta nao ativa; por isso status e verificacao so
 * sao revelados depois da senha correta (IC-10.3). `returnTo` so e usado se for
 * caminho interno valido (sanitizeReturnPath); caso contrario o destino e a
 * vitrine publica de anuncios (`/explorar`).
 * Antes do provedor, aplica o limite de 5 falhas em 15 min por e-mail (IC-10.2).
 */
export async function loginUser(
  email: string,
  password: string,
  returnTo?: string,
): Promise<{ success: boolean; error?: string; redirectTo?: string }> {
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!cleanEmail) {
    return { success: false, error: 'Informe seu e-mail.' };
  }

  if (typeof password !== 'string' || password.length === 0) {
    return { success: false, error: 'Informe sua senha.' };
  }

  // IC-10.2: reserva uma vaga no bucket do e-mail antes de chamar o provedor;
  // com o bucket cheio, recusa sem verificar a credencial.
  let reservation: LoginAttemptReservation | null;
  try {
    reservation = await reserveLoginAttempt(cleanEmail);
  } catch (err) {
    console.error('[Login Action Error] limite de tentativas', authErrorLabel(err));
    return { success: false, error: SESSION_START_ERROR };
  }
  if (!reservation) {
    return { success: false, error: TOO_MANY_ATTEMPTS_ERROR };
  }

  try {
    await getAuth().api.signInEmail({
      body: { email: cleanEmail, password },
      headers: await headers(),
    });
  } catch (err) {
    const code = isAPIError(err) ? err.body?.code : undefined;
    // So a credencial invalida conta como falha; qualquer outro resultado
    // descarta a reserva.
    await (
      code === 'INVALID_EMAIL_OR_PASSWORD'
        ? recordLoginFailure(reservation)
        : releaseLoginAttempt(reservation)
    ).catch((finalizeErr) =>
      console.error('[Login Action Error] limite de tentativas', authErrorLabel(finalizeErr)),
    );
    if (code === 'EMAIL_NOT_VERIFIED') {
      return {
        success: false,
        error: 'Seu e-mail ainda nao foi verificado. Confira sua caixa de entrada.',
      };
    }
    if (code === ACCOUNT_NOT_ACTIVE_CODE) {
      return {
        success: false,
        error: 'Sua conta esta suspensa ou inativa. Entre em contato com a plataforma.',
      };
    }
    // Credencial invalida, e-mail inexistente ou malformado: mesma resposta,
    // sem revelar se a conta existe.
    if (isAPIError(err) && (err.status === 'UNAUTHORIZED' || err.status === 'BAD_REQUEST')) {
      return { success: false, error: INVALID_CREDENTIALS_ERROR };
    }
    console.error('[Login Action Error]', authErrorLabel(err));
    return { success: false, error: SESSION_START_ERROR };
  }

  // Sucesso zera o bucket do e-mail. Uma falha aqui nao desfaz a sessao ja
  // criada; o bucket expira sozinho em no maximo 15 min.
  await clearLoginFailures(reservation).catch((err) =>
    console.error('[Login Action Error] limite de tentativas', authErrorLabel(err)),
  );

  return { success: true, redirectTo: sanitizeReturnPath(returnTo) ?? '/explorar' };
}

/**
 * Server Action para encerramento de sessao (Logout).
 * Encerra a sessao pelo Better Auth (`auth.api.signOut`), que apaga a sessao e
 * o cookie. Na versao 1.7.6 o provedor apenas registra em log uma falha ao
 * apagar a sessao, por isso a action confirma pelo proprio provedor, com os
 * mesmos headers da requisicao (que ainda trazem o cookie antigo), que a
 * sessao deixou de existir; sem essa confirmacao, responde falha (IC-5.5).
 * Sem sessao valida, o logout e sucesso idempotente.
 */
export async function logoutUser(): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = getAuth();
    const requestHeaders = await headers();

    await auth.api.signOut({ headers: requestHeaders });

    const remaining = await auth.api.getSession({
      headers: requestHeaders,
      query: { disableRefresh: true },
    });
    if (remaining) {
      console.error('[Logout Action Error] sessao ainda valida apos o encerramento');
      return { success: false, error: SESSION_END_ERROR };
    }
  } catch (err) {
    console.error('[Logout Action Error]', authErrorLabel(err));
    return { success: false, error: SESSION_END_ERROR };
  }

  return { success: true };
}
