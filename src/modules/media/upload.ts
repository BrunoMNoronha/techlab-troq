import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { validateSession } from '@/modules/identity';
import { isUuid } from '@/modules/listing/ids';
import { getPrismaClient } from '@/persistence/prisma';
import { enqueueDeletions } from './deletions';
import { failureMessage } from './failure-codes';
import { MAX_SOURCE_BYTES } from './image-processing';
import { derivativeKeys, originalKey } from './keys';
import { headObject, presignOriginalUpload, UPLOAD_URL_TTL_SECONDS } from './s3';
import { lockAndCheckUploadQuota, recordUploadAuthorization } from './upload-rate-limit';

// Gestao privada das imagens de um anuncio pelo dono (media-pipeline-contract.md,
// secoes 5, 6, 8.5 e 10). Toda operacao que muda posicoes ou o conjunto de
// imagens roda sob a trava de LINHA do anuncio (`FOR UPDATE`), adquirida numa
// busca ja filtrada pelo dono: anuncio ou imagem alheia, inexistente ou com ID
// malformado recebem a mesma resposta `not_found`. Nenhuma chamada ao R2
// acontece com transacao aberta.
//
// Estas funcoes leem a sessao; a camada 'use server' fica em actions.ts.

export const MAX_IMAGES_PER_LISTING = 6;
export const ACCEPTED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedUploadType = (typeof ACCEPTED_UPLOAD_TYPES)[number];

const EDITABLE_LISTING_STATUSES = ['draft', 'published', 'paused'];

export type MediaFailureReason =
  | 'unauthenticated'
  | 'not_found'
  | 'not_editable'
  | 'invalid_type'
  | 'invalid_size'
  | 'limit_reached'
  | 'rate_limited'
  | 'upload_not_found'
  | 'invalid_state'
  | 'last_ready_image'
  | 'invalid_order'
  | 'error';

const MESSAGES: Record<MediaFailureReason, string> = {
  unauthenticated: 'É necessário estar autenticado e com e-mail verificado.',
  not_found: 'Anúncio ou imagem não encontrado.',
  not_editable: 'Anúncios encerrados ou removidos não podem ser alterados.',
  invalid_type: 'Formato não suportado. Envie JPEG, PNG ou WebP.',
  invalid_size: 'O arquivo precisa ter entre 1 byte e 10 MB.',
  limit_reached: `O anúncio já tem o máximo de ${MAX_IMAGES_PER_LISTING} imagens.`,
  rate_limited: 'Muitos envios em pouco tempo. Aguarde e tente novamente.',
  upload_not_found: 'O arquivo ainda não chegou. Envie novamente.',
  invalid_state: 'A imagem mudou de estado. Atualize a página.',
  last_ready_image: 'Um anúncio publicado precisa manter pelo menos uma imagem pronta.',
  invalid_order: 'A ordem enviada não corresponde às imagens atuais. Atualize a página.',
  error: 'Não foi possível concluir a operação. Tente novamente.',
};

export type MediaResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { success: false; reason: MediaFailureReason; error: string };

function failure(reason: MediaFailureReason): {
  success: false;
  reason: MediaFailureReason;
  error: string;
} {
  return { success: false, reason, error: MESSAGES[reason] };
}

/** Falha de dominio lancada dentro da transacao para desfaze-la. */
class MediaAbort extends Error {
  constructor(readonly reason: MediaFailureReason) {
    super(reason);
  }
}

async function sessionUserId(): Promise<string | null> {
  const session = await validateSession();
  return session.isValid && session.user ? session.user.id : null;
}

function isAcceptedType(value: unknown): value is AcceptedUploadType {
  return typeof value === 'string' && (ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(value);
}

/**
 * Tamanho DECLARADO pelo cliente: so decide se vale emitir a URL e entra na
 * assinatura (`Content-Length`). A autoridade continua sendo o `HeadObject`.
 */
function isAcceptedSize(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_SOURCE_BYTES
  );
}

/** Trava a linha do anuncio do dono; `null` para alheio ou inexistente. */
async function lockOwnedListing(
  tx: Prisma.TransactionClient,
  listingId: string,
  ownerId: string,
): Promise<{ id: string; status: string } | null> {
  const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
    SELECT "id", "status"::text AS "status" FROM "listings"
    WHERE "id" = ${listingId}::uuid AND "owner_id" = ${ownerId}::uuid
    FOR UPDATE`;
  return rows[0] ?? null;
}

/** Trava o anuncio dono da imagem, com a busca ja condicionada ao dono. */
async function lockListingOfImage(
  tx: Prisma.TransactionClient,
  imageId: string,
  ownerId: string,
): Promise<{ id: string; status: string } | null> {
  const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
    SELECT l."id", l."status"::text AS "status"
    FROM "listings" l JOIN "listing_images" i ON i."listing_id" = l."id"
    WHERE i."id" = ${imageId}::uuid AND l."owner_id" = ${ownerId}::uuid
    FOR UPDATE OF l`;
  return rows[0] ?? null;
}

export interface UploadAuthorization {
  imageId: string;
  position: number;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  expiresInSeconds: number;
}

async function presignOrRollback(
  imageId: string,
  generation: number,
  contentType: AcceptedUploadType,
  fileSize: number,
  position: number,
  onFailure: () => Promise<void>,
): Promise<MediaResult<UploadAuthorization>> {
  try {
    const presigned = await presignOriginalUpload(
      originalKey(imageId, generation),
      contentType,
      fileSize,
    );
    return {
      success: true,
      data: {
        imageId,
        position,
        uploadUrl: presigned.url,
        uploadHeaders: presigned.headers,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      },
    };
  } catch (err) {
    console.error('[media] falha ao emitir autorizacao de upload', {
      imageId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    await onFailure().catch(() => undefined);
    return failure('error');
  }
}

/**
 * Reserva a menor posicao livre (1..6) e, SO DEPOIS do commit, emite a
 * presigned PUT (media-pipeline-contract.md, 5.1 e 5.2).
 */
export async function requestImageUpload(
  listingId: string,
  contentType: string,
  fileSize: number,
): Promise<MediaResult<UploadAuthorization>> {
  const userId = await sessionUserId();
  if (!userId) return failure('unauthenticated');
  if (!isUuid(listingId)) return failure('not_found');
  if (!isAcceptedType(contentType)) return failure('invalid_type');
  if (!isAcceptedSize(fileSize)) return failure('invalid_size');

  const imageId = randomUUID();
  let position: number;
  try {
    position = await getPrismaClient().$transaction(async (tx) => {
      if (!(await lockAndCheckUploadQuota(tx, userId))) throw new MediaAbort('rate_limited');
      const listing = await lockOwnedListing(tx, listingId, userId);
      if (!listing) throw new MediaAbort('not_found');
      if (!EDITABLE_LISTING_STATUSES.includes(listing.status)) throw new MediaAbort('not_editable');

      // Todas as imagens contam, em qualquer estado tecnico.
      const taken = await tx.$queryRaw<{ position: number }[]>`
        SELECT "position" FROM "listing_images" WHERE "listing_id" = ${listingId}::uuid`;
      if (taken.length >= MAX_IMAGES_PER_LISTING) throw new MediaAbort('limit_reached');
      const used = new Set(taken.map((row) => row.position));
      const free = [1, 2, 3, 4, 5, 6].find((p) => !used.has(p));
      if (free === undefined) throw new MediaAbort('limit_reached');

      await tx.$executeRaw`
        INSERT INTO "listing_images"
          ("id", "listing_id", "position", "status", "object_key", "upload_generation",
           "upload_authorized_at", "created_at", "updated_at")
        VALUES (${imageId}::uuid, ${listingId}::uuid, ${free}, 'uploaded', ${originalKey(imageId, 1)},
                1, now(), now(), now())`;
      await recordUploadAuthorization(tx, userId);
      return free;
    });
  } catch (err) {
    if (err instanceof MediaAbort) return failure(err.reason);
    console.error('[media] falha na reserva de imagem', {
      listingId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return failure('error');
  }

  // Sem URL, a reserva recem-criada nao serve: desfaz para nao ocupar posicao.
  return presignOrRollback(imageId, 1, contentType, fileSize, position, () =>
    removeUnconfirmedReservation(imageId, listingId),
  );
}

async function removeUnconfirmedReservation(imageId: string, listingId: string): Promise<void> {
  await getPrismaClient().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "listings" WHERE "id" = ${listingId}::uuid FOR UPDATE`;
    await tx.$executeRaw`
      DELETE FROM "listing_images"
      WHERE "id" = ${imageId}::uuid AND "status" = 'uploaded' AND "source_confirmed_at" IS NULL`;
    await compactPositions(tx, listingId);
  });
}

export type ConfirmOutcome = 'queued' | 'already_confirmed' | 'rejected';

/**
 * Confirma contra o objeto REAL (`HeadObject`): tamanho e ETag vem do R2,
 * nunca do cliente (media-pipeline-contract.md, secao 6). Idempotente.
 */
export async function confirmImageUpload(
  imageId: string,
): Promise<MediaResult<{ outcome: ConfirmOutcome; failureMessage?: string }>> {
  const userId = await sessionUserId();
  if (!userId) return failure('unauthenticated');
  if (!isUuid(imageId)) return failure('not_found');

  const prisma = getPrismaClient();
  const rows = await prisma.$queryRaw<
    {
      status: string;
      source_confirmed_at: Date | null;
      object_key: string;
      upload_generation: number;
    }[]
  >`
    SELECT i."status"::text AS "status", i."source_confirmed_at", i."object_key", i."upload_generation"
    FROM "listing_images" i JOIN "listings" l ON l."id" = i."listing_id"
    WHERE i."id" = ${imageId}::uuid AND l."owner_id" = ${userId}::uuid`;
  const image = rows[0];
  if (!image) return failure('not_found');
  if (image.source_confirmed_at) return { success: true, data: { outcome: 'already_confirmed' } };
  if (image.status !== 'uploaded') return failure('invalid_state');

  let head;
  try {
    head = await headObject(image.object_key);
  } catch (err) {
    console.error('[media] HeadObject falhou na confirmacao', {
      imageId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return failure('error');
  }
  // Enquanto a URL vale, o cliente pode repetir o PUT: nada muda.
  if (!head.exists) return failure('upload_not_found');

  const rejectCode =
    head.size === 0 ? 'empty' : head.size > MAX_SOURCE_BYTES ? 'too_large_bytes' : null;
  const generation = image.upload_generation;

  if (rejectCode) {
    const rejected = await prisma.$transaction(async (tx) => {
      const updated = await tx.$executeRaw`
        UPDATE "listing_images"
        SET "status" = 'failed', "failure_code" = ${rejectCode}, "updated_at" = now()
        WHERE "id" = ${imageId}::uuid AND "status" = 'uploaded'
          AND "source_confirmed_at" IS NULL AND "upload_generation" = ${generation}`;
      if (updated === 1) {
        await enqueueDeletions(tx, [originalKey(imageId, generation)], 'source_failed');
      }
      return updated === 1;
    });
    if (!rejected) return failure('invalid_state');
    return {
      success: true,
      data: { outcome: 'rejected', failureMessage: failureMessage(rejectCode) },
    };
  }

  const confirmed = await prisma.$executeRaw`
    UPDATE "listing_images"
    SET "source_etag" = ${head.etag}, "source_confirmed_at" = now(), "updated_at" = now()
    WHERE "id" = ${imageId}::uuid AND "status" = 'uploaded'
      AND "source_confirmed_at" IS NULL AND "upload_generation" = ${generation}`;
  // Zero linhas: outra confirmacao concorrente venceu, ou a geracao mudou.
  return { success: true, data: { outcome: confirmed === 1 ? 'queued' : 'already_confirmed' } };
}

/**
 * Reenvio de imagem `failed`: mesmo id e posicao, nova geracao e nova chave;
 * a geracao anterior vai para a fila de exclusao (media-pipeline-contract.md, 8.5).
 */
export async function requestImageReupload(
  imageId: string,
  contentType: string,
  fileSize: number,
): Promise<MediaResult<UploadAuthorization>> {
  const userId = await sessionUserId();
  if (!userId) return failure('unauthenticated');
  if (!isUuid(imageId)) return failure('not_found');
  if (!isAcceptedType(contentType)) return failure('invalid_type');
  if (!isAcceptedSize(fileSize)) return failure('invalid_size');

  let result: { generation: number; position: number; listingId: string };
  try {
    result = await getPrismaClient().$transaction(async (tx) => {
      if (!(await lockAndCheckUploadQuota(tx, userId))) throw new MediaAbort('rate_limited');
      const listing = await lockListingOfImage(tx, imageId, userId);
      if (!listing) throw new MediaAbort('not_found');
      if (!EDITABLE_LISTING_STATUSES.includes(listing.status)) throw new MediaAbort('not_editable');

      const [image] = await tx.$queryRaw<
        { status: string; upload_generation: number; position: number }[]
      >`
        SELECT "status"::text AS "status", "upload_generation", "position"
        FROM "listing_images" WHERE "id" = ${imageId}::uuid FOR UPDATE`;
      if (!image || image.status !== 'failed') throw new MediaAbort('invalid_state');

      const previous = image.upload_generation;
      const next = previous + 1;
      await enqueueDeletions(tx, [originalKey(imageId, previous)], 'source_failed');
      await enqueueDeletions(tx, derivativeKeys(imageId, previous), 'derivative_orphan');
      await tx.$executeRaw`DELETE FROM "image_derivatives" WHERE "image_id" = ${imageId}::uuid`;
      await tx.$executeRaw`
        UPDATE "listing_images"
        SET "status" = 'uploaded', "upload_generation" = ${next},
            "object_key" = ${originalKey(imageId, next)}, "upload_authorized_at" = now(),
            "source_etag" = NULL, "source_confirmed_at" = NULL, "attempts" = 0,
            "next_attempt_at" = NULL, "lease_expires_at" = NULL, "failure_code" = NULL,
            "width" = NULL, "height" = NULL, "processed_at" = NULL, "updated_at" = now()
        WHERE "id" = ${imageId}::uuid`;
      await recordUploadAuthorization(tx, userId);
      return { generation: next, position: image.position, listingId: listing.id };
    });
  } catch (err) {
    if (err instanceof MediaAbort) return failure(err.reason);
    console.error('[media] falha no reenvio de imagem', {
      imageId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return failure('error');
  }

  // Sem URL, a imagem volta a `failed` para o dono tentar de novo.
  return presignOrRollback(
    imageId,
    result.generation,
    contentType,
    fileSize,
    result.position,
    async () => {
      await getPrismaClient().$executeRaw`
      UPDATE "listing_images" SET "status" = 'failed', "failure_code" = 'transient_exhausted',
        "updated_at" = now()
      WHERE "id" = ${imageId}::uuid AND "status" = 'uploaded' AND "source_confirmed_at" IS NULL
        AND "upload_generation" = ${result.generation}`;
    },
  );
}

/** Posicoes voltam a 1..N na ordem atual; conferidas no COMMIT (DEFERRABLE). */
async function compactPositions(tx: Prisma.TransactionClient, listingId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "listing_images" li SET "position" = r."rn", "updated_at" = now()
    FROM (
      SELECT "id", row_number() OVER (ORDER BY "position") AS "rn"
      FROM "listing_images" WHERE "listing_id" = ${listingId}::uuid
    ) r
    WHERE li."id" = r."id" AND li."position" <> r."rn"`;
}

/**
 * Remove uma imagem do anuncio (media-pipeline-contract.md, secao 10). O
 * registro sai na transacao; os objetos entram na fila de exclusao, e a
 * remocao fisica e do job de #47. Anuncio `published` nunca fica sem imagem
 * `ready` (DM-5.4).
 */
export async function deleteListingImage(imageId: string): Promise<MediaResult> {
  const userId = await sessionUserId();
  if (!userId) return failure('unauthenticated');
  if (!isUuid(imageId)) return failure('not_found');

  try {
    await getPrismaClient().$transaction(async (tx) => {
      const listing = await lockListingOfImage(tx, imageId, userId);
      if (!listing) throw new MediaAbort('not_found');
      if (!EDITABLE_LISTING_STATUSES.includes(listing.status)) throw new MediaAbort('not_editable');

      const [image] = await tx.$queryRaw<{ status: string; upload_generation: number }[]>`
        SELECT "status"::text AS "status", "upload_generation"
        FROM "listing_images" WHERE "id" = ${imageId}::uuid FOR UPDATE`;
      if (!image) throw new MediaAbort('not_found');

      if (listing.status === 'published' && image.status === 'ready') {
        const [{ ready }] = await tx.$queryRaw<{ ready: number }[]>`
          SELECT count(*)::int AS "ready" FROM "listing_images"
          WHERE "listing_id" = ${listing.id}::uuid AND "status" = 'ready'`;
        if (ready <= 1) throw new MediaAbort('last_ready_image');
      }

      const stored = await tx.$queryRaw<{ object_key: string }[]>`
        SELECT "object_key" FROM "image_derivatives" WHERE "image_id" = ${imageId}::uuid`;
      await enqueueDeletions(
        tx,
        [
          originalKey(imageId, image.upload_generation),
          ...derivativeKeys(imageId, image.upload_generation),
          ...stored.map((row) => row.object_key),
        ],
        'image_removed',
      );
      await tx.$executeRaw`DELETE FROM "listing_images" WHERE "id" = ${imageId}::uuid`;
      await compactPositions(tx, listing.id);
    });
    return { success: true };
  } catch (err) {
    if (err instanceof MediaAbort) return failure(err.reason);
    console.error('[media] falha ao remover imagem', {
      imageId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return failure('error');
  }
}

/**
 * Reordena: a entrada e a lista COMPLETA dos ids atuais, sem repeticao; as
 * posicoes viram 1..N na mesma transacao, sob a trava do anuncio. A unicidade
 * DEFERRABLE e conferida no COMMIT.
 */
export async function reorderListingImages(
  listingId: string,
  orderedImageIds: unknown,
): Promise<MediaResult> {
  const userId = await sessionUserId();
  if (!userId) return failure('unauthenticated');
  if (!isUuid(listingId)) return failure('not_found');
  if (
    !Array.isArray(orderedImageIds) ||
    orderedImageIds.length === 0 ||
    orderedImageIds.length > MAX_IMAGES_PER_LISTING ||
    !orderedImageIds.every(isUuid) ||
    new Set(orderedImageIds).size !== orderedImageIds.length
  ) {
    return failure('invalid_order');
  }
  const ids = orderedImageIds as string[];

  try {
    await getPrismaClient().$transaction(async (tx) => {
      const listing = await lockOwnedListing(tx, listingId, userId);
      if (!listing) throw new MediaAbort('not_found');
      if (!EDITABLE_LISTING_STATUSES.includes(listing.status)) throw new MediaAbort('not_editable');

      const current = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"::text AS "id" FROM "listing_images" WHERE "listing_id" = ${listingId}::uuid`;
      const currentSet = new Set(current.map((row) => row.id));
      if (currentSet.size !== ids.length || !ids.every((id) => currentSet.has(id))) {
        throw new MediaAbort('invalid_order');
      }

      await tx.$executeRaw`
        UPDATE "listing_images" li SET "position" = o."position", "updated_at" = now()
        FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS o("id", "position")
        WHERE li."id" = o."id" AND li."listing_id" = ${listingId}::uuid
          AND li."position" <> o."position"`;
    });
    return { success: true };
  } catch (err) {
    if (err instanceof MediaAbort) return failure(err.reason);
    console.error('[media] falha ao reordenar imagens', {
      listingId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return failure('error');
  }
}

export type ImageViewState = 'awaiting_upload' | 'processing' | 'ready' | 'failed';

export interface OwnerImageView {
  id: string;
  position: number;
  state: ImageViewState;
  width: number | null;
  height: number | null;
  failureMessage: string | null;
}

export interface OwnerImagesView {
  listingStatus: string;
  editable: boolean;
  images: OwnerImageView[];
}

/** Estado das imagens para a gestao privada. Nunca expoe chave, ETag ou URL. */
export async function getOwnerListingImages(
  listingId: string,
): Promise<MediaResult<OwnerImagesView>> {
  const userId = await sessionUserId();
  if (!userId) return failure('unauthenticated');
  if (!isUuid(listingId)) return failure('not_found');

  try {
    const prisma = getPrismaClient();
    const listing = await prisma.listing.findFirst({
      where: { id: listingId, ownerId: userId },
      select: {
        status: true,
        images: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            position: true,
            status: true,
            sourceConfirmedAt: true,
            width: true,
            height: true,
            failureCode: true,
          },
        },
      },
    });
    if (!listing) return failure('not_found');

    return {
      success: true,
      data: {
        listingStatus: listing.status,
        editable: EDITABLE_LISTING_STATUSES.includes(listing.status),
        images: listing.images.map((image) => {
          const state: ImageViewState =
            image.status === 'ready'
              ? 'ready'
              : image.status === 'failed'
                ? 'failed'
                : image.status === 'uploaded' && !image.sourceConfirmedAt
                  ? 'awaiting_upload'
                  : 'processing';
          return {
            id: image.id,
            position: image.position,
            state,
            width: state === 'ready' ? image.width : null,
            height: state === 'ready' ? image.height : null,
            failureMessage: state === 'failed' ? failureMessage(image.failureCode) : null,
          };
        }),
      },
    };
  } catch (err) {
    console.error('[media] falha ao ler imagens', {
      listingId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return failure('error');
  }
}
