import type { Prisma } from '@/generated/prisma/client';
import { enqueueDeletions } from './deletions';
import { derivativeKeys, originalKey } from './keys';

// Expurgo de imagens por retencao (media-pipeline-contract.md, secao 12;
// data-retention-policy.md, secoes 3, 4, 7 e 9). Fronteira de MIDIA que a
// futura exclusao de conta (RF-023) chama DENTRO da sua transacao; esta entrega
// nao cria a jornada de exclusao de conta.
//
// O que NAO dispara expurgo, por desenho:
// - `paused`: revoga o acesso publico e mantem os objetos (volta em T4);
// - `closed`: derivados privados enquanto o anuncio for historico de conta
//   ativa; nenhum prazo comeca em `closed` (secao 4 da politica);
// - `removed`: evidencia de moderacao, conservada pelo prazo da secao 7 da
//   politica (24 meses apos o encerramento do caso). O modelo atual nao tem o
//   fluxo de encerramento de caso; o fim dessa retencao e integracao da Fase 4.
//
// Retencao legitima respeitada aqui: anuncio `removed` (item proibido) e
// anuncio com denuncia ainda sem decisao (`recebida`, caso em aberto). Legal
// hold (secao 9) ainda nao tem registro no modelo; quando existir, entra nesta
// mesma consulta.

export interface AccountPurgeResult {
  /** Imagens cujos objetos entraram na fila. */
  purgedImages: number;
  /** Anuncios conservados por retencao legitima. */
  retainedListings: number;
}

export class AccountNotPendingDeletionError extends Error {
  constructor() {
    super('A conta nao esta em exclusao');
    this.name = 'AccountNotPendingDeletionError';
  }
}

/**
 * Enfileira, com `dueAt = now()` (dentro do prazo maximo de 30 dias a partir da
 * solicitacao), a exclusao de todos os objetos conhecidos das imagens dos
 * anuncios da conta, exceto os de anuncios sob retencao legitima. As linhas de
 * imagem saem na mesma transacao: sem `ImageDerivative` vivo, a fila pode apagar
 * os derivados (segunda barreira de cleanup.ts). O acesso publico ja esta
 * revogado pelo estado da conta (`deletion_requested` nao e `active`).
 */
export async function enqueueAccountMediaPurge(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<AccountPurgeResult> {
  const account = await tx.$queryRaw<{ status: string }[]>`
    SELECT u."status"::text AS "status" FROM "users" u
    JOIN "account_deletion_requests" r ON r."user_id" = u."id"
    WHERE u."id" = ${userId}::uuid
    FOR UPDATE OF u`;
  if (account[0]?.status !== 'deletion_requested') throw new AccountNotPendingDeletionError();

  // Trava os anuncios da conta em ordem estavel: serializa com reserva,
  // remocao e reordenacao de imagens (todas sob a trava do anuncio).
  const listings = await tx.$queryRaw<{ id: string; retained: boolean }[]>`
    SELECT l."id"::text AS "id",
      (l."status" = 'removed' OR EXISTS (
        SELECT 1 FROM "reports" r WHERE r."listing_id" = l."id" AND r."status" = 'recebida'
      )) AS "retained"
    FROM "listings" l
    WHERE l."owner_id" = ${userId}::uuid
    ORDER BY l."id"
    FOR UPDATE OF l`;

  const eligible = listings.filter((l) => !l.retained).map((l) => l.id);
  let purgedImages = 0;
  if (eligible.length > 0) {
    const images = await tx.$queryRaw<
      { id: string; upload_generation: number; keys: string[] | null }[]
    >`
      SELECT i."id"::text AS "id", i."upload_generation",
        (SELECT array_agg(d."object_key") FROM "image_derivatives" d WHERE d."image_id" = i."id")
          AS "keys"
      FROM "listing_images" i
      WHERE i."listing_id" = ANY(${eligible}::uuid[])`;

    for (const image of images) {
      await enqueueDeletions(
        tx,
        [
          originalKey(image.id, image.upload_generation),
          ...derivativeKeys(image.id, image.upload_generation),
          ...(image.keys ?? []),
        ],
        'retention_purge',
      );
    }
    // Derivados saem em cascata (ImageDerivative.onDelete: Cascade).
    await tx.$executeRaw`
      DELETE FROM "listing_images" WHERE "listing_id" = ANY(${eligible}::uuid[])`;
    purgedImages = images.length;
  }

  return { purgedImages, retainedListings: listings.length - eligible.length };
}
