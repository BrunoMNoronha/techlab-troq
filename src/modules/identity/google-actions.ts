'use server';

import { cookies, headers } from 'next/headers';
import { getPrismaClient } from '@/persistence/prisma';
import { authErrorLabel, getAuth, resolveAppOrigin } from './auth';
import {
  GOOGLE_PROVIDER_ID,
  consumePendingGoogleSignup,
  discardPendingGoogleSignup,
  googleSignupCookieFor,
  googleSignupCookieOptions,
  hasLinkedGoogleAccount,
  isGoogleSignInAvailable,
  peekPendingGoogleSignup,
} from './google';
import { validateSession } from './index';
import { sanitizeReturnPath } from './return-path';
import { TERMS_VERSION } from './terms';

// Server Actions da entrada com Conta Google (#81; identity-contract.md, IC-15).
// Os endpoints `/sign-in/social` e `/link-social` do Better Auth nao ficam
// expostos por HTTP: sao chamados daqui, depois das regras do TROQS, e o unico
// endpoint OAuth aberto e o callback (IC-13.1).

export interface GoogleRedirectResult {
  success: boolean;
  error?: string;
  /** URL de autorizacao do Google, ou caminho interno, para o navegador seguir. */
  redirectTo?: string;
}

export interface CompleteGoogleSignupInput {
  displayName: string;
  over18: boolean;
  termsAccepted: boolean;
  returnTo?: string;
}

const GOOGLE_AUTHORIZATION_ORIGIN = 'https://accounts.google.com';
// Sem destino de retorno, a entrada leva a vitrine publica de anuncios.
const DEFAULT_DESTINATION = '/explorar';

const GOOGLE_UNAVAILABLE_ERROR =
  'A entrada com Google esta indisponivel no momento. Use seu e-mail e senha.';
const GOOGLE_START_ERROR = 'Nao foi possivel iniciar a entrada com Google. Tente novamente.';
const SIGNUP_EXPIRED_ERROR =
  'Este cadastro com Google expirou ou ja foi concluido. Comece de novo pelo botao Continuar com Google.';
const EMAIL_TAKEN_ERROR =
  'Ja existe uma conta TROQS com este e-mail. Entre com e-mail e senha e vincule sua Conta Google em Minha conta.';
const SIGNUP_ERROR = 'Nao foi possivel concluir o cadastro agora. Tente novamente.';
const ACCOUNT_CREATED_SIGNIN_ERROR =
  'Sua conta foi criada, mas nao foi possivel entrar agora. Use o botao Continuar com Google na tela de login.';

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'P2002';
}

/**
 * Erro do fluxo Google cai sempre na rota que traduz o codigo do provedor
 * (`/login/google`), nunca numa pagina que exiba o codigo cru. `next` ja vem
 * validado por `sanitizeReturnPath`.
 */
function errorCallbackURL(params: Record<string, string | null>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const search = query.toString();
  return search ? `/login/google?${search}` : '/login/google';
}

function isGoogleAuthorizationURL(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).origin === GOOGLE_AUTHORIZATION_ORIGIN;
  } catch {
    return false;
  }
}

/**
 * Pede ao Better Auth a URL de autorizacao do Google para o navegador seguir.
 * O provedor gera o state (uso unico, ligado a este navegador por cookie
 * assinado gravado via `nextCookies()`) e o PKCE. `callbackURL` e um caminho
 * interno validado: o retorno pos-login nunca aponta para fora do TROQS.
 */
async function googleAuthorizationRedirect(
  returnTo: string | null,
  loginHint?: string,
): Promise<GoogleRedirectResult> {
  const result = await getAuth().api.signInSocial({
    body: {
      provider: GOOGLE_PROVIDER_ID,
      callbackURL: returnTo ?? DEFAULT_DESTINATION,
      errorCallbackURL: errorCallbackURL({ next: returnTo }),
      disableRedirect: true,
      ...(loginHint ? { loginHint } : {}),
    },
    headers: await headers(),
  });
  const url = 'url' in result ? result.url : undefined;
  if (!isGoogleAuthorizationURL(url)) {
    throw new Error('URL de autorizacao inesperada');
  }
  return { success: true, redirectTo: url };
}

/** Inicia a entrada ou o cadastro com Google a partir de `/login` ou `/cadastro`. */
export async function startGoogleSignIn(returnTo?: string): Promise<GoogleRedirectResult> {
  if (!isGoogleSignInAvailable()) {
    return { success: false, error: GOOGLE_UNAVAILABLE_ERROR };
  }
  try {
    return await googleAuthorizationRedirect(sanitizeReturnPath(returnTo));
  } catch (err) {
    console.error('[Google Sign-In Error]', authErrorLabel(err));
    return { success: false, error: GOOGLE_START_ERROR };
  }
}

async function readSignupCookie() {
  const cookie = googleSignupCookieFor(resolveAppOrigin().baseURL);
  const store = await cookies();
  return { cookie, store, handle: store.get(cookie.name)?.value };
}

type SignupOutcome =
  | { kind: 'created' | 'already_registered'; email: string }
  | { kind: 'expired' }
  | { kind: 'email_taken' };

/**
 * Conclui o cadastro com Google (IC-15.3). Valida no servidor a declaracao 18+
 * e o aceite dos termos — sem data de nascimento nem documento, e sem inferir
 * idade pelo perfil Google. Em UMA transacao consome a pendencia (uso unico) e
 * cria `User` (`active`, e-mail verificado pelo Google), a conta social e o
 * `TermsAcceptance` `age_eligibility`. Falha em qualquer escrita desfaz tudo e
 * preserva a pendencia. A sessao nao e criada aqui: o navegador volta ao
 * Google, e o Better Auth abre a sessao da conta agora vinculada (IC-5.1).
 */
export async function completeGoogleSignup(
  input: CompleteGoogleSignupInput,
): Promise<GoogleRedirectResult> {
  const { displayName, over18, termsAccepted, returnTo } =
    input ?? ({} as CompleteGoogleSignupInput);
  const cleanName = typeof displayName === 'string' ? displayName.trim() : '';

  if (cleanName.length < 2) {
    return { success: false, error: 'O nome exibido deve ter pelo menos 2 caracteres.' };
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
  // Sem Google configurado a conta criada nao teria como entrar.
  if (!isGoogleSignInAvailable()) {
    return { success: false, error: GOOGLE_UNAVAILABLE_ERROR };
  }

  let signup: Awaited<ReturnType<typeof readSignupCookie>>;
  let outcome: SignupOutcome;
  try {
    signup = await readSignupCookie();
    const handle = signup.handle;
    const prisma = getPrismaClient();
    try {
      outcome = await prisma.$transaction(async (tx): Promise<SignupOutcome> => {
        const pending = await consumePendingGoogleSignup(tx, handle);
        if (!pending) {
          return { kind: 'expired' };
        }
        const linked = await tx.account.findFirst({
          where: { providerId: GOOGLE_PROVIDER_ID, accountId: pending.sub },
          select: { id: true },
        });
        if (linked) {
          return { kind: 'already_registered', email: pending.email };
        }
        // Qualquer linha com o e-mail conflita (IC-2.5): nunca se vincula por
        // igualdade de e-mail (IC-15.4).
        const existing = await tx.user.findFirst({
          where: { email: pending.email },
          select: { id: true },
        });
        if (existing) {
          return { kind: 'email_taken' };
        }

        const user = await tx.user.create({
          data: {
            displayName: cleanName,
            email: pending.email,
            emailVerified: true,
            status: 'active',
          },
          select: { id: true },
        });
        // O par emailVerified/emailVerifiedAt muda junto, pelo relogio do banco (IC-3.2).
        await tx.$executeRaw`
          UPDATE "users" SET "email_verified_at" = now() WHERE "id" = ${user.id}::uuid`;
        await tx.account.create({
          data: { userId: user.id, providerId: GOOGLE_PROVIDER_ID, accountId: pending.sub },
        });
        await tx.termsAcceptance.create({
          data: { userId: user.id, type: 'age_eligibility', termsVersion: TERMS_VERSION },
        });
        return { kind: 'created', email: pending.email };
      });
    } catch (err) {
      if (!isUniqueViolation(err)) {
        throw err;
      }
      // Corrida com outro cadastro do mesmo e-mail ou da mesma identidade: os
      // indices unicos decidem. A pendencia continua no banco (rollback); se a
      // identidade ja ganhou conta, basta entrar com ela.
      const pending = await peekPendingGoogleSignup(handle);
      await discardPendingGoogleSignup(handle);
      const linked = pending
        ? await prisma.account.findFirst({
            where: { providerId: GOOGLE_PROVIDER_ID, accountId: pending.sub },
            select: { id: true },
          })
        : null;
      outcome =
        pending && linked
          ? { kind: 'already_registered', email: pending.email }
          : { kind: 'email_taken' };
    }
  } catch (err) {
    console.error('[Google Signup Error]', authErrorLabel(err));
    return { success: false, error: SIGNUP_ERROR };
  }

  // A pendencia foi consumida, descartada ou ja nao existia: o cookie perde a finalidade.
  signup.store.set(signup.cookie.name, '', googleSignupCookieOptions(signup.cookie.secure, 0));
  if (outcome.kind === 'expired') {
    return { success: false, error: SIGNUP_EXPIRED_ERROR };
  }
  if (outcome.kind === 'email_taken') {
    return { success: false, error: EMAIL_TAKEN_ERROR };
  }

  try {
    return await googleAuthorizationRedirect(sanitizeReturnPath(returnTo), outcome.email);
  } catch (err) {
    console.error('[Google Signup Error] entrada apos o cadastro', authErrorLabel(err));
    return { success: false, error: ACCOUNT_CREATED_SIGNIN_ERROR };
  }
}

/**
 * Recusa do cadastro com Google: descarta a pendencia e o cookie. Nada foi
 * criado em `users`, entao nada sobra para remover (IC-15.3).
 */
export async function cancelGoogleSignup(): Promise<GoogleRedirectResult> {
  try {
    const { cookie, store, handle } = await readSignupCookie();
    await discardPendingGoogleSignup(handle);
    store.set(cookie.name, '', googleSignupCookieOptions(cookie.secure, 0));
  } catch (err) {
    // A pendencia expira sozinha em 15 minutos; a recusa nunca cria acesso.
    console.error('[Google Signup Error] cancelamento', authErrorLabel(err));
  }
  return { success: true, redirectTo: '/login?motivo=google_cancelado' };
}

/**
 * Vinculacao explicita da Conta Google a conta TROQS ja autenticada (IC-15.4).
 * Exige sessao valida pelo guard (conta ativa e e-mail verificado). O Better
 * Auth guarda no state o id e o e-mail da sessao e, no callback, so vincula se
 * o Google confirmar o MESMO e-mail como verificado e se a identidade nao
 * pertencer a outra conta.
 */
export async function linkGoogleAccount(): Promise<GoogleRedirectResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    return { success: false, error: 'Sua sessao expirou. Entre novamente para continuar.' };
  }
  if (!isGoogleSignInAvailable()) {
    return { success: false, error: GOOGLE_UNAVAILABLE_ERROR };
  }
  try {
    if (await hasLinkedGoogleAccount(session.user.id)) {
      return { success: false, error: 'Sua conta ja tem uma Conta Google vinculada.' };
    }
    const result = await getAuth().api.linkSocialAccount({
      body: {
        provider: GOOGLE_PROVIDER_ID,
        callbackURL: '/conta?google=vinculada',
        errorCallbackURL: errorCallbackURL({ fluxo: 'vincular' }),
        disableRedirect: true,
        loginHint: session.user.email,
      },
      headers: await headers(),
    });
    if (!isGoogleAuthorizationURL(result.url)) {
      throw new Error('URL de autorizacao inesperada');
    }
    return { success: true, redirectTo: result.url };
  } catch (err) {
    console.error('[Google Link Error]', authErrorLabel(err));
    return { success: false, error: GOOGLE_START_ERROR };
  }
}
