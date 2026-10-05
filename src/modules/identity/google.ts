import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { BetterAuthOptions } from 'better-auth';
import type { Prisma } from '@/generated/prisma/client';
import { getPrismaClient } from '@/persistence/prisma';

// Entrada com Conta Google (#81; docs/architecture/identity-contract.md, IC-15).
//
// O Better Auth conduz o OAuth: state assinado e de uso unico, PKCE, troca do
// codigo e leitura do id_token devolvido pelo Google. O TROQ decide o que essa
// identidade pode fazer:
//
// - identidade ja vinculada (`accounts.provider_id = 'google'` + `sub`) entra
//   na conta dona, pelo hook de sessao que recusa conta nao ativa (IC-5.3);
// - identidade nova NUNCA vira `User` no callback. O gate `validateUserInfo`
//   guarda uma pendencia de cadastro de 15 minutos em `verifications` e manda o
//   navegador para `/cadastro/google`, onde a pessoa declara 18+ e aceita os
//   termos; so entao `completeGoogleSignup` cria a conta, numa transacao;
// - e-mail que ja pertence a uma conta TROQ nao e vinculado por igualdade de
//   e-mail: a vinculacao so acontece a partir de sessao autenticada (IC-15.4).

export const GOOGLE_PROVIDER_ID = 'google';

/** Prefixo do `identifier` da pendencia de cadastro em `verifications`. */
export const GOOGLE_SIGNUP_PREFIX = 'google-signup:';

/** Validade da pendencia de cadastro e do cookie que a referencia. */
export const GOOGLE_SIGNUP_TTL_SECONDS = 15 * 60;

/** Codigos que o gate devolve ao Better Auth, que os repassa na URL de erro. */
export const GOOGLE_SIGNUP_REQUIRED = 'google_signup_required';
export const GOOGLE_EMAIL_NOT_VERIFIED = 'google_email_not_verified';
export const SOCIAL_SIGNUP_DISABLED = 'signup_disabled';

const HANDLE_BYTES = 32;
// 32 bytes em base64url sem padding.
const HANDLE_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Sufixo dos client IDs de aplicacao web emitidos pelo Google Cloud.
const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Credenciais do cliente OAuth do Google (IC-15.8). Diferente do nucleo do
 * Better Auth, a ausencia NAO e erro: sem as duas variaveis, a entrada com
 * Google fica indisponivel e o login por senha segue intacto. Configuracao
 * parcial ou malformada tambem desliga o Google, com log que nomeia a
 * variavel, nunca o valor. Placeholders `SUBSTITUIR_...` contam como ausentes.
 */
export function resolveGoogleConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): GoogleOAuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
  const placeholder = (value: string) => value.startsWith('SUBSTITUIR_');
  const idMissing = !clientId || placeholder(clientId);
  const secretMissing = !clientSecret || placeholder(clientSecret);

  if (idMissing && secretMissing) {
    return null;
  }
  if (idMissing || secretMissing) {
    console.error(
      `[google] configuracao incompleta: ${idMissing ? 'GOOGLE_CLIENT_ID' : 'GOOGLE_CLIENT_SECRET'} ausente; entrada com Google desligada.`,
    );
    return null;
  }
  if (!clientId.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) {
    console.error(
      '[google] GOOGLE_CLIENT_ID fora do formato do Google; entrada com Google desligada.',
    );
    return null;
  }
  return { clientId, clientSecret };
}

/** Indica se a entrada com Google pode ser oferecida neste ambiente. */
export function isGoogleSignInAvailable(): boolean {
  return resolveGoogleConfig() !== null;
}

/**
 * Nome do cookie que liga o navegador a sua pendencia de cadastro. Em https
 * usa o prefixo `__Host-` (Secure, Path=/, sem Domain); em `development` sobre
 * http o prefixo seria recusado pelo navegador.
 */
export function googleSignupCookieName(secure: boolean): string {
  return secure ? '__Host-troq-google-signup' : 'troq-google-signup';
}

export function googleSignupCookieOptions(secure: boolean, maxAge = GOOGLE_SIGNUP_TTL_SECONDS) {
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge };
}

/** Nome e atributos do cookie de pendencia para a origem validada do ambiente. */
export function googleSignupCookieFor(baseURL: string) {
  const secure = new URL(baseURL).protocol === 'https:';
  return { name: googleSignupCookieName(secure), secure };
}

/** A conta ja tem uma identidade Google vinculada? */
export async function hasLinkedGoogleAccount(userId: string): Promise<boolean> {
  const account = await getPrismaClient().account.findFirst({
    where: { userId, providerId: GOOGLE_PROVIDER_ID },
    select: { id: true },
  });
  return account !== null;
}

function identifierFor(handle: string): string {
  return `${GOOGLE_SIGNUP_PREFIX}${createHash('sha256').update(handle, 'utf8').digest('hex')}`;
}

export function isGoogleSignupHandle(value: unknown): value is string {
  return typeof value === 'string' && HANDLE_FORMAT.test(value);
}

export interface PendingGoogleSignup {
  /** `sub` do Google: a identidade estavel da conta social. */
  sub: string;
  /** E-mail verificado pelo Google, normalizado. */
  email: string;
}

function parsePending(value: string): PendingGoogleSignup | null {
  try {
    const parsed = JSON.parse(value) as Partial<PendingGoogleSignup>;
    if (typeof parsed.sub === 'string' && typeof parsed.email === 'string') {
      return { sub: parsed.sub, email: parsed.email };
    }
  } catch {
    // Linha corrompida: tratada como inexistente.
  }
  return null;
}

/**
 * Guarda a pendencia e devolve o handle em claro, que so existe no cookie
 * httpOnly; o banco guarda o SHA-256 dele no `identifier`. Expira em 15 minutos
 * pelo relogio do PostgreSQL. Aproveita para remover pendencias vencidas.
 */
export async function stashPendingGoogleSignup(pending: PendingGoogleSignup): Promise<string> {
  const handle = randomBytes(HANDLE_BYTES).toString('base64url');
  const prisma = getPrismaClient();
  await prisma.$executeRaw`
    DELETE FROM "verifications"
    WHERE "identifier" LIKE ${`${GOOGLE_SIGNUP_PREFIX}%`} AND "expires_at" <= now()`;
  await prisma.$executeRaw`
    INSERT INTO "verifications" ("id", "identifier", "value", "expires_at", "created_at", "updated_at")
    VALUES (${randomUUID()}, ${identifierFor(handle)}, ${JSON.stringify(pending)},
            now() + make_interval(secs => ${GOOGLE_SIGNUP_TTL_SECONDS}), now(), now())`;
  return handle;
}

/** Le a pendencia valida sem consumi-la (tela de conclusao). */
export async function peekPendingGoogleSignup(
  handle: unknown,
): Promise<PendingGoogleSignup | null> {
  if (!isGoogleSignupHandle(handle)) {
    return null;
  }
  const rows = await getPrismaClient().$queryRaw<{ value: string }[]>`
    SELECT "value" FROM "verifications"
    WHERE "identifier" = ${identifierFor(handle)} AND "expires_at" > now()`;
  return rows[0] ? parsePending(rows[0].value) : null;
}

/**
 * Consome a pendencia dentro da transacao recebida: um unico
 * `DELETE ... RETURNING`, de modo que conclusoes concorrentes do mesmo handle
 * resultam em no maximo uma conta. Pendencia vencida e removida e tratada como
 * inexistente.
 */
export async function consumePendingGoogleSignup(
  tx: Prisma.TransactionClient,
  handle: unknown,
): Promise<PendingGoogleSignup | null> {
  if (!isGoogleSignupHandle(handle)) {
    return null;
  }
  const rows = await tx.$queryRaw<{ value: string; valid: boolean }[]>`
    DELETE FROM "verifications"
    WHERE "identifier" = ${identifierFor(handle)}
    RETURNING "value", ("expires_at" > now()) AS "valid"`;
  const row = rows[0];
  return row?.valid ? parsePending(row.value) : null;
}

/** Descarta a pendencia (cancelamento). Idempotente. */
export async function discardPendingGoogleSignup(handle: unknown): Promise<void> {
  if (!isGoogleSignupHandle(handle)) {
    return;
  }
  await getPrismaClient().$executeRaw`
    DELETE FROM "verifications" WHERE "identifier" = ${identifierFor(handle)}`;
}

type ValidateUserInfo = NonNullable<NonNullable<BetterAuthOptions['user']>['validateUserInfo']>;

/**
 * Gate `user.validateUserInfo` do Better Auth (IC-15.2). O provedor o chama
 * antes de criar usuario, de vincular conta e de cada entrada OAuth.
 *
 * - `create-user` vindo do Google: nao cria nada. Exige e-mail verificado pelo
 *   Google, guarda a pendencia, grava o cookie no proprio callback e recusa com
 *   `google_signup_required`; o provedor redireciona para a URL de erro do
 *   fluxo, que leva a `/cadastro/google`.
 * - `create-user` por qualquer outro caminho: recusado. Usuarios so nascem
 *   pelas Server Actions do TROQ (IC-6.1).
 * - `sign-in` e `link-account`: permitidos; status da conta e decidido pelo
 *   hook de sessao e pelo guard, e a vinculacao pelas regras de IC-15.4.
 */
export const validateProviderIdentity: ValidateUserInfo = async ({ user, source }, ctx) => {
  if (source.action !== 'create-user') {
    return;
  }
  if (source.method !== 'oauth' || source.oauth?.providerId !== GOOGLE_PROVIDER_ID) {
    return { error: SOCIAL_SIGNUP_DISABLED };
  }

  const profile = (source.oauth.profile ?? {}) as Record<string, unknown>;
  const sub = typeof profile.sub === 'string' ? profile.sub : '';
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!sub || !email || email.length > MAX_EMAIL_LENGTH || !EMAIL_FORMAT.test(email)) {
    return { error: 'unable_to_get_user_info' };
  }
  // So o `email_verified` do id_token prova o controle do e-mail (IC-15.5).
  if (user.emailVerified !== true) {
    return { error: GOOGLE_EMAIL_NOT_VERIFIED };
  }

  const handle = await stashPendingGoogleSignup({ sub, email });
  const cookie = googleSignupCookieFor(ctx.context.baseURL);
  ctx.setCookie(cookie.name, handle, googleSignupCookieOptions(cookie.secure));
  return { error: GOOGLE_SIGNUP_REQUIRED };
};

/**
 * Tokens do provedor nunca sao guardados (IC-15.7): o TROQ nao chama APIs do
 * Google depois da entrada. Aplicado na criacao e na atualizacao de `accounts`.
 */
export function withoutProviderTokens<T extends { providerId?: string }>(account: T): T {
  if (account.providerId === 'credential') {
    return account;
  }
  return {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  };
}
