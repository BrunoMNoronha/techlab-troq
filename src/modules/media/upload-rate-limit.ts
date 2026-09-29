import type { Prisma } from '@/generated/prisma/client';

// Limite de autorizacoes de upload por usuario (media-pipeline-contract.md,
// secao 5.1): 30 por hora. Contem o custo de reservas abandonadas; nao
// substitui a cota de seis imagens por anuncio.
//
// Mesmo padrao persistente do limite de login (identity/login-rate-limit.ts,
// IC-10.2): linhas em `verifications`, sem migration, `identifier` =
// `media-upload:<userId>` (identificador interno, nenhum dado pessoal), tempo
// pelo relogio do PostgreSQL e serializacao por advisory lock de TRANSACAO do
// proprio identifier. A contagem e a insercao acontecem na mesma transacao da
// reserva: so conta a autorizacao que de fato persistiu.

export const MEDIA_UPLOAD_PREFIX = 'media-upload:';
export const MAX_UPLOAD_AUTHORIZATIONS = 30;
export const UPLOAD_AUTHORIZATION_WINDOW_SECONDS = 60 * 60;

export function mediaUploadIdentifier(userId: string): string {
  return `${MEDIA_UPLOAD_PREFIX}${userId}`;
}

/**
 * Trava o bucket do usuario ate o fim da transacao e diz se ainda ha vaga.
 * Deve ser a PRIMEIRA trava da transacao (antes da linha do anuncio), para
 * que todos os fluxos de upload adquiram as travas na mesma ordem.
 */
export async function lockAndCheckUploadQuota(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<boolean> {
  const identifier = mediaUploadIdentifier(userId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`;
  await tx.$executeRaw`
    DELETE FROM "verifications"
    WHERE "identifier" = ${identifier} AND "expires_at" <= now()`;
  const [{ active }] = await tx.$queryRaw<{ active: number }[]>`
    SELECT count(*)::int AS "active" FROM "verifications"
    WHERE "identifier" = ${identifier} AND "expires_at" > now()`;
  return active < MAX_UPLOAD_AUTHORIZATIONS;
}

/** Registra uma autorizacao emitida. Chamar so depois de a reserva persistir. */
export async function recordUploadAuthorization(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const identifier = mediaUploadIdentifier(userId);
  await tx.$executeRaw`
    INSERT INTO "verifications" ("id", "identifier", "value", "expires_at", "created_at", "updated_at")
    VALUES (gen_random_uuid()::text, ${identifier}, 'authorization',
            now() + make_interval(secs => ${UPLOAD_AUTHORIZATION_WINDOW_SECONDS}), now(), now())`;
}
