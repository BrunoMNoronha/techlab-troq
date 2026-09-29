import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { getPrismaClient } from '@/persistence/prisma';

// Token de verificacao de email do TROQ (docs/architecture/identity-contract.md,
// IC-7 e IC-9). Unico lugar que emite, limita e consome esse token.
//
// - O token em claro (32 bytes, base64url) so existe em memoria e no link
//   enviado; o banco guarda apenas o SHA-256 em `verifications.value`.
// - `identifier = 'email-verification:' + userId`: id, nunca email.
// - Todo instante (emissao, expiracao, janelas de limite) vem do relogio do
//   PostgreSQL (`now()`), para que limites e expiracao nao dependam do relogio
//   de cada funcao serverless.

/** Prefixo do `identifier` das linhas de verificacao de email. */
export const EMAIL_VERIFICATION_PREFIX = 'email-verification:';

const TOKEN_BYTES = 32;
// 32 bytes em base64url sem padding: 43 caracteres do alfabeto URL-safe.
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/** Limites por conta (IC-9.4): 60 s entre emissoes, 5 emissoes em 24 h. */
export const RESEND_MIN_INTERVAL_SECONDS = 60;
export const MAX_EMISSIONS_PER_DAY = 5;

export interface IssuedToken {
  /** Token em claro: vai somente para o link. Nunca persistir nem registrar em log. */
  token: string;
  /** Id da linha em `verifications`, usado para invalidar o token se o envio falhar. */
  verificationId: string;
}

export function identifierFor(userId: string): string {
  return `${EMAIL_VERIFICATION_PREFIX}${userId}`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Emite um token para a conta dentro da transacao recebida. Expira 24 h
 * depois da emissao (IC-7.2).
 */
export async function issueVerificationToken(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<IssuedToken> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const verificationId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "verifications" ("id", "identifier", "value", "expires_at", "created_at", "updated_at")
    VALUES (${verificationId}, ${identifierFor(userId)}, ${hashToken(token)},
            now() + interval '24 hours', now(), now())`;
  return { token, verificationId };
}

/** Torna inutilizavel um token emitido (ex.: envio falhou). A linha continua contando no limite. */
export async function invalidateVerificationToken(verificationId: string): Promise<void> {
  await getPrismaClient().$executeRaw`
    UPDATE "verifications" SET "expires_at" = now(), "updated_at" = now()
    WHERE "id" = ${verificationId} AND "expires_at" > now()`;
}

/**
 * Reenvio (IC-9.3): para conta `active` e nao verificada, aplica os limites de
 * IC-9.4, invalida os tokens anteriores e emite um novo — tudo sob lock da
 * linha do usuario, de modo que reenvios concorrentes da mesma conta sao
 * serializados e nao ultrapassam o limite. Devolve `null` quando a conta nao e
 * elegivel ou o limite suprime a emissao; o chamador nao distingue os casos.
 */
export async function issueResendToken(userId: string): Promise<IssuedToken | null> {
  return getPrismaClient().$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: string; email_verified: boolean }[]>`
      SELECT "status"::text AS "status", "email_verified"
      FROM "users" WHERE "id" = ${userId}::uuid
      FOR UPDATE`;
    const user = locked[0];
    if (!user || user.status !== 'active' || user.email_verified) {
      return null;
    }

    const identifier = identifierFor(userId);
    const [usage] = await tx.$queryRaw<{ emissions: number; recent: number }[]>`
      SELECT
        count(*)::int AS "emissions",
        count(*) FILTER (
          WHERE "created_at" > now() - make_interval(secs => ${RESEND_MIN_INTERVAL_SECONDS})
        )::int AS "recent"
      FROM "verifications"
      WHERE "identifier" = ${identifier} AND "created_at" > now() - interval '24 hours'`;
    if (usage.recent > 0 || usage.emissions >= MAX_EMISSIONS_PER_DAY) {
      return null;
    }

    await tx.$executeRaw`
      UPDATE "verifications" SET "expires_at" = now(), "updated_at" = now()
      WHERE "identifier" = ${identifier} AND "expires_at" > now()`;
    return issueVerificationToken(tx, userId);
  });
}

export type ConfirmationOutcome = 'verified' | 'invalid' | 'expired';

/**
 * Confirma o email a partir do token do link (IC-7.3). O consumo e um unico
 * `DELETE ... RETURNING` pelo hash: em confirmacoes concorrentes do mesmo
 * token, so a primeira transacao remove a linha e as demais nao encontram
 * nada. O Prisma Client nao devolve as colunas de linhas removidas em lote,
 * por isso a remocao usa SQL parametrizado (nunca concatenado). Nao cria sessao.
 */
export async function confirmVerificationToken(token: string): Promise<ConfirmationOutcome> {
  if (typeof token !== 'string' || !TOKEN_FORMAT.test(token)) {
    return 'invalid';
  }

  return getPrismaClient().$transaction(async (tx) => {
    const consumed = await tx.$queryRaw<{ identifier: string; valid: boolean }[]>`
      DELETE FROM "verifications"
      WHERE "value" = ${hashToken(token)}
        AND "identifier" LIKE ${`${EMAIL_VERIFICATION_PREFIX}%`}
      RETURNING "identifier", ("expires_at" > now()) AS "valid"`;
    const row = consumed[0];
    if (!row) {
      return 'invalid';
    }
    if (!row.valid) {
      return 'expired';
    }

    const userId = row.identifier.slice(EMAIL_VERIFICATION_PREFIX.length);
    const updated = await tx.$executeRaw`
      UPDATE "users"
      SET "email_verified" = true,
          "email_verified_at" = COALESCE("email_verified_at", now()),
          "updated_at" = now()
      WHERE "id" = ${userId}::uuid AND "status" <> 'deletion_requested'`;
    if (updated === 0) {
      return 'invalid';
    }

    // Tokens restantes da conta perdem a finalidade (inclusive os ja
    // invalidados, que so serviam para contar o limite de reenvio).
    await tx.$executeRaw`DELETE FROM "verifications" WHERE "identifier" = ${row.identifier}`;
    return 'verified';
  });
}
