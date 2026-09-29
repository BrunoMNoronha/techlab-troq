import { createHash, randomUUID } from 'node:crypto';
import { getPrismaClient } from '@/persistence/prisma';

// Limite de tentativas de login (docs/architecture/identity-contract.md,
// IC-10.2). As chamadas `auth.api` feitas no servidor nao passam pelo
// limitador do Better Auth (IC-10.1), entao o TROQ limita antes de chamar o
// provedor.
//
// - Bucket por SHA-256 do e-mail normalizado, exista ou nao a conta: a
//   resposta nao revela existencia. Nenhum IP, nenhum e-mail em claro.
// - Persistencia em `verifications` (sem migration): `identifier` =
//   `login-failure:<sha256>`; `value` so indica o tipo da linha.
// - Todo instante vem do relogio do PostgreSQL (`now()`).
//
// Concorrencia: cada tentativa RESERVA uma vaga do bucket numa transacao curta,
// serializada por advisory lock do proprio identifier, e so depois chama o
// provedor (sem transacao aberta durante a verificacao da senha). Reservas
// pendentes contam como vagas ocupadas, entao tentativas simultaneas nunca
// levam mais de `MAX_LOGIN_FAILURES` verificacoes de credencial ao provedor.

export const LOGIN_FAILURE_PREFIX = 'login-failure:';
export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;
/**
 * Validade da reserva se a funcao morrer entre a reserva e a finalizacao.
 * A verificacao de senha (scrypt) leva ~1 s; 120 s cobre com folga uma
 * invocacao lenta e, no pior caso, uma reserva orfa ocupa uma vaga por 2 min,
 * muito menos que a janela de 15 min.
 */
export const RESERVATION_TTL_SECONDS = 120;

const KIND_RESERVATION = 'reservation';
const KIND_FAILURE = 'failure';

export interface LoginAttemptReservation {
  identifier: string;
  reservationId: string;
}

export function loginFailureIdentifier(email: string): string {
  const normalized = email.trim().toLowerCase();
  return `${LOGIN_FAILURE_PREFIX}${createHash('sha256').update(normalized, 'utf8').digest('hex')}`;
}

/**
 * Reserva uma vaga para verificar a credencial. Devolve `null` quando o bucket
 * ja tem `MAX_LOGIN_FAILURES` falhas ou reservas ativas: a tentativa deve ser
 * recusada sem chamar o provedor.
 */
export async function reserveLoginAttempt(email: string): Promise<LoginAttemptReservation | null> {
  const identifier = loginFailureIdentifier(email);
  const reservationId = randomUUID();

  return getPrismaClient().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`;
    // Linhas vencidas de qualquer bucket de login perdem a finalidade.
    await tx.$executeRaw`
      DELETE FROM "verifications"
      WHERE "identifier" LIKE ${`${LOGIN_FAILURE_PREFIX}%`} AND "expires_at" <= now()`;
    const [{ active }] = await tx.$queryRaw<{ active: number }[]>`
      SELECT count(*)::int AS "active" FROM "verifications"
      WHERE "identifier" = ${identifier} AND "expires_at" > now()`;
    if (active >= MAX_LOGIN_FAILURES) {
      return null;
    }
    await tx.$executeRaw`
      INSERT INTO "verifications" ("id", "identifier", "value", "expires_at", "created_at", "updated_at")
      VALUES (${reservationId}, ${identifier}, ${KIND_RESERVATION},
              now() + make_interval(secs => ${RESERVATION_TTL_SECONDS}), now(), now())`;
    return { identifier, reservationId };
  });
}

/**
 * Credencial invalida: a reserva vira falha valida por 15 min a partir de
 * agora. Se a reserva ja tiver vencido, a falha so e registrada se ainda
 * houver vaga, para o bucket nunca passar do limite.
 */
export async function recordLoginFailure(reservation: LoginAttemptReservation): Promise<void> {
  const { identifier, reservationId } = reservation;
  await getPrismaClient().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`;
    const updated = await tx.$executeRaw`
      UPDATE "verifications"
      SET "value" = ${KIND_FAILURE},
          "expires_at" = now() + make_interval(secs => ${LOGIN_FAILURE_WINDOW_SECONDS}),
          "updated_at" = now()
      WHERE "id" = ${reservationId} AND "identifier" = ${identifier}`;
    if (updated > 0) return;
    const [{ active }] = await tx.$queryRaw<{ active: number }[]>`
      SELECT count(*)::int AS "active" FROM "verifications"
      WHERE "identifier" = ${identifier} AND "expires_at" > now()`;
    if (active < MAX_LOGIN_FAILURES) {
      await tx.$executeRaw`
        INSERT INTO "verifications" ("id", "identifier", "value", "expires_at", "created_at", "updated_at")
        VALUES (${reservationId}, ${identifier}, ${KIND_FAILURE},
                now() + make_interval(secs => ${LOGIN_FAILURE_WINDOW_SECONDS}), now(), now())`;
    }
  });
}

/** Resultado que nao e credencial invalida: a reserva e descartada e nada conta. */
export async function releaseLoginAttempt(reservation: LoginAttemptReservation): Promise<void> {
  await getPrismaClient().$executeRaw`
    DELETE FROM "verifications"
    WHERE "id" = ${reservation.reservationId} AND "identifier" = ${reservation.identifier}`;
}

/** Login bem-sucedido: zera o bucket do e-mail (falhas e reservas). */
export async function clearLoginFailures(reservation: LoginAttemptReservation): Promise<void> {
  await getPrismaClient().$executeRaw`
    DELETE FROM "verifications" WHERE "identifier" = ${reservation.identifier}`;
}
