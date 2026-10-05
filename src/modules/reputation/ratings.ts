import { recordAuditEvent } from '@/modules/audit';
import { validateSession, type SessionValidationResult } from '@/modules/identity';
import { lockNegotiationForRating } from '@/modules/negotiation';
import { getPrismaClient } from '@/persistence/prisma';

// DEC-030, RB-002 e DM-9: a linha da negociacao serializa submissao, edicao e
// publicacao. O relogio e lido APOS a trava: now() usaria o inicio da transacao
// e poderia aceitar uma nota cuja janela acabou enquanto aguardava a trava.
const WINDOW_MILLISECONDS = 14 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RatingFailureReason =
  | 'login_required'
  | 'email_unverified'
  | 'account_restricted'
  | 'not_found'
  | 'invalid_score'
  | 'negotiation_active'
  | 'window_closed'
  | 'already_published'
  | 'invalidated'
  | 'error';

const MESSAGES: Record<RatingFailureReason, string> = {
  login_required: 'Entre na sua conta para avaliar uma negociação.',
  email_unverified: 'Confirme seu e-mail para avaliar uma negociação.',
  account_restricted: 'Sua conta não pode avaliar uma negociação.',
  not_found: 'Negociação não encontrada.',
  invalid_score: 'Escolha uma nota inteira de 1 a 5.',
  negotiation_active: 'Encerre a negociação antes de avaliar.',
  window_closed: 'O prazo de 14 dias para avaliar esta negociação terminou.',
  already_published: 'Esta avaliação já foi publicada e não pode ser alterada.',
  invalidated: 'Esta avaliação foi invalidada e não pode ser substituída.',
  error: 'Não foi possível acessar a avaliação agora. Tente novamente.',
};

type RatingFailure = { success: false; reason: RatingFailureReason; error: string };

function failure(reason: RatingFailureReason): RatingFailure {
  return { success: false, reason, error: MESSAGES[reason] };
}

function sessionReason(reason: SessionValidationResult['reason']): RatingFailureReason {
  if (reason === 'unverified') return 'email_unverified';
  if (reason === 'blocked' || reason === 'deletion_requested') return 'account_restricted';
  return 'login_required';
}

export interface SubmitRatingInput {
  negotiationId: string;
  score: number;
}

export type SubmitRatingResult =
  { success: true; changed: boolean; published: boolean } | RatingFailure;

export interface OwnRatingView {
  // Nenhum campo representa a nota da contraparte, nem mesmo depois da
  // publicacao. A exposicao publica permanece apenas media e contagem.
  ownRating: {
    score: number;
    submittedAt: string;
    published: boolean;
    validity: 'valid' | 'invalidated';
  } | null;
  canSubmit: boolean;
  canEdit: boolean;
  deadline: string | null;
  serverNow: string;
}

export type OwnRatingResult = { success: true; view: OwnRatingView } | RatingFailure;

/** Caso de uso da action: identidade vem da sessao, contraparte vem do banco. */
export async function submitOwnRating(input: SubmitRatingInput): Promise<SubmitRatingResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return failure(sessionReason(session.reason));
  if (typeof input?.negotiationId !== 'string' || !UUID_PATTERN.test(input.negotiationId)) {
    return failure('not_found');
  }
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
    return failure('invalid_score');
  }

  const actorId = session.user.id;
  try {
    return await getPrismaClient().$transaction(async (tx) => {
      const negotiation = await lockNegotiationForRating(tx, input.negotiationId, actorId);
      if (!negotiation) return failure('not_found');
      if (negotiation.status !== 'closed' || !negotiation.closedAt) {
        return failure('negotiation_active');
      }
      const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS "at"`;
      const deadline = new Date(negotiation.closedAt.getTime() + WINDOW_MILLISECONDS);
      const own = await tx.rating.findUnique({
        where: {
          negotiationId_evaluatorId: { negotiationId: negotiation.id, evaluatorId: actorId },
        },
        select: { id: true, score: true, publishedAt: true, validity: true },
      });

      // Invalida nao devolve a direcao, mesmo que ainda houvesse tempo.
      if (own?.validity === 'invalidated') return failure('invalidated');
      if (own?.publishedAt) return failure('already_published');
      if (at >= deadline) return failure('window_closed');
      if (own?.score === input.score) {
        return { success: true, changed: false, published: false };
      }

      let ratingId: string;
      if (own) {
        await tx.rating.update({
          where: { id: own.id },
          data: { score: input.score, updatedAt: at },
          select: { id: true },
        });
        ratingId = own.id;
      } else {
        const created = await tx.rating.create({
          data: {
            negotiationId: negotiation.id,
            evaluatorId: actorId,
            evaluatedId:
              actorId === negotiation.ownerId ? negotiation.chosenId : negotiation.ownerId,
            score: input.score,
            submittedAt: at,
            createdAt: at,
            updatedAt: at,
          },
          select: { id: true },
        });
        ratingId = created.id;
      }

      // Nao duplicar a nota em auditoria: somente identidade do efeito.
      await recordAuditEvent(tx, {
        eventType: own ? 'rating.updated' : 'rating.submitted',
        actorId,
        targetType: 'rating',
        targetId: ratingId,
        result: 'success',
        occurredAt: at,
        details: { negotiationId: negotiation.id },
      });

      const validDirections = await tx.rating.count({
        where: { negotiationId: negotiation.id, validity: 'valid' },
      });
      const published = validDirections === 2;
      if (published) {
        await tx.rating.updateMany({
          where: { negotiationId: negotiation.id, validity: 'valid', publishedAt: null },
          data: { publishedAt: at, updatedAt: at },
        });
        await recordAuditEvent(tx, {
          eventType: 'rating.published',
          actorId,
          targetType: 'negotiation',
          targetId: negotiation.id,
          result: 'success',
          occurredAt: at,
        });
      }
      return { success: true, changed: true, published };
    });
  } catch (err) {
    console.error('[reputation] falha ao registrar a avaliação', {
      error: err instanceof Error ? err.name : 'unknown',
    });
    return failure('error');
  }
}

/** Consulta privada, server-only: so seleciona a avaliacao do proprio ator. */
export async function getOwnRating(negotiationId: string): Promise<OwnRatingResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return failure(sessionReason(session.reason));
  if (typeof negotiationId !== 'string' || !UUID_PATTERN.test(negotiationId)) {
    return failure('not_found');
  }
  const actorId = session.user.id;

  try {
    return await getPrismaClient().$transaction(async (tx) => {
      const negotiation = await lockNegotiationForRating(tx, negotiationId, actorId);
      if (!negotiation) return failure('not_found');
      const [{ at }] = await tx.$queryRaw<{ at: Date }[]>`SELECT clock_timestamp() AS "at"`;
      const deadline = negotiation.closedAt
        ? new Date(negotiation.closedAt.getTime() + WINDOW_MILLISECONDS)
        : null;
      const own = await tx.rating.findUnique({
        where: { negotiationId_evaluatorId: { negotiationId, evaluatorId: actorId } },
        select: { score: true, submittedAt: true, publishedAt: true, validity: true },
      });
      const inWindow = negotiation.status === 'closed' && deadline !== null && at < deadline;
      const published =
        own !== null && (own.publishedAt !== null || (deadline !== null && at >= deadline));

      return {
        success: true,
        view: {
          ownRating: own
            ? {
                score: own.score,
                submittedAt: own.submittedAt.toISOString(),
                published,
                validity: own.validity,
              }
            : null,
          canSubmit: inWindow && own === null,
          canEdit: inWindow && own !== null && own.validity === 'valid' && !published,
          deadline: deadline?.toISOString() ?? null,
          serverNow: at.toISOString(),
        },
      };
    });
  } catch (err) {
    console.error('[reputation] falha ao consultar a avaliação', {
      error: err instanceof Error ? err.name : 'unknown',
    });
    return failure('error');
  }
}

export interface PublicReputation {
  average: number | null;
  count: number;
}

/**
 * Media/contagem do anunciante de um anuncio publico. O gate equivale a
 * getPublicListingDetail: published e dono active. A consulta unica evita
 * resolver o dono numa leitura e agregar depois de uma retirada publica.
 * Nao seleciona conteudo legado, midia, ids de pessoas ou notas individuais.
 * Uma nota unica fica publica pelo relogio do banco mesmo sem job (DM-9.4).
 */
export async function getPublicListingReputation(
  listingId: string,
): Promise<PublicReputation | null> {
  if (typeof listingId !== 'string' || !UUID_PATTERN.test(listingId)) return null;
  try {
    const rows = await getPrismaClient().$queryRaw<PublicReputation[]>`
      SELECT ROUND(AVG(r."score")::numeric, 1)::float8 AS "average",
             COUNT(r."id")::int AS "count"
      FROM "listings" l
      JOIN "users" u ON u."id" = l."owner_id"
      LEFT JOIN (
        "ratings" r JOIN "negotiations" n ON n."id" = r."negotiation_id"
          AND n."status" = 'closed'
          AND (r."published_at" IS NOT NULL OR now() >= n."closed_at" + INTERVAL '336 hours')
      ) ON r."evaluated_id" = l."owner_id" AND r."validity" = 'valid'
      WHERE l."id" = ${listingId}::uuid
        AND l."status" = 'published' AND u."status" = 'active'
      GROUP BY l."id"`;
    const row = rows[0];
    return row ? { average: row.average, count: row.count } : null;
  } catch (err) {
    console.error('[reputation] falha ao consultar a reputação pública', {
      error: err instanceof Error ? err.name : 'unknown',
    });
    return null;
  }
}
