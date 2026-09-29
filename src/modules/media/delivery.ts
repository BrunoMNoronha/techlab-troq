import { validateSession } from '@/modules/identity';
import { isUuid } from '@/modules/listing/ids';
import { getPrismaClient } from '@/persistence/prisma';
import { isMediaKind } from './media-path';
import { getDerivativeStream } from './s3';

// Entrega autorizada dos derivados (media-pipeline-contract.md, secao 9). A
// autorizacao e reconferida a CADA requisicao, no estado atual do banco: uma URL
// retida nao carrega permissao nenhuma, e a revogacao e imediata por
// construcao (9.2). O bucket continua privado; o corpo vem do R2 em stream.
//
// Toda recusa e o MESMO 404 (corpo e cabecalhos identicos): ID malformado, kind
// invalido, imagem inexistente, alheia, nao `ready`, anuncio nao publico, conta
// inativa, objeto ausente ou falha interna.

const NO_STORE = 'private, no-store';

export function mediaNotFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': NO_STORE,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

interface MediaTarget {
  object_key: string;
  listing_status: string;
  owner_id: string;
  owner_status: string;
}

/** Somente o necessario para decidir: chave do derivado, estado e dono. */
async function findReadyDerivative(imageId: string, kind: string): Promise<MediaTarget | null> {
  const rows = await getPrismaClient().$queryRaw<MediaTarget[]>`
    SELECT d."object_key", l."status"::text AS "listing_status",
           l."owner_id"::text AS "owner_id", u."status"::text AS "owner_status"
    FROM "listing_images" i
    JOIN "image_derivatives" d
      ON d."image_id" = i."id" AND d."kind" = ${kind}::"image_derivative_kind"
    JOIN "listings" l ON l."id" = i."listing_id"
    JOIN "users" u ON u."id" = l."owner_id"
    WHERE i."id" = ${imageId}::uuid AND i."status" = 'ready'`;
  return rows[0] ?? null;
}

function isPublic(target: MediaTarget): boolean {
  return target.listing_status === 'published' && target.owner_status === 'active';
}

/**
 * Acesso privado do dono (9.1, item 3): sessao valida — conta `active` e email
 * verificado, pela fronteira de identidade — cujo usuario e o dono, em
 * qualquer estado do anuncio. Nenhum outro usuario autenticado herda isso.
 */
async function isOwnerSession(target: MediaTarget): Promise<boolean> {
  const session = await validateSession();
  return session.isValid && session.user?.id === target.owner_id;
}

export async function serveMedia(imageId: string, kind: string): Promise<Response> {
  if (!isUuid(imageId) || !isMediaKind(kind)) return mediaNotFound();

  try {
    const target = await findReadyDerivative(imageId, kind);
    if (!target) return mediaNotFound();
    if (!isPublic(target) && !(await isOwnerSession(target))) return mediaNotFound();

    const object = await getDerivativeStream(target.object_key);
    if (!object) return mediaNotFound();

    const headers: Record<string, string> = {
      'Content-Type': 'image/webp',
      'Cache-Control': NO_STORE,
      'X-Content-Type-Options': 'nosniff',
    };
    if (typeof object.contentLength === 'number') {
      headers['Content-Length'] = String(object.contentLength);
    }
    return new Response(object.body, { status: 200, headers });
  } catch (err) {
    // Falha fechada: indisponibilidade do banco ou do R2 nunca vira acesso.
    console.error('[media] falha na entrega de derivado', {
      imageId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return mediaNotFound();
  }
}
