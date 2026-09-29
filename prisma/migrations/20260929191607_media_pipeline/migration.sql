-- F2-008 (#46) — delta de modelo do pipeline de imagens.
-- Fonte: docs/architecture/media-pipeline-contract.md, secao 15.
--
-- Gerada por `prisma migrate dev --create-only --name media_pipeline` e editada
-- a mao (ADR-0005, decisao 5):
--   * removidos tres `ALTER ... "updated_at" DROP DEFAULT` em accounts,
--     sessions e verifications que o gerador acrescentou por drift preexistente
--     das tabelas do Better Auth — fora do escopo desta entrega;
--   * acrescentados backfill, CHECKs, indices parciais e a unicidade de posicao
--     DEFERRABLE, que o Prisma Schema nao expressa (database.md, secao 8).
--
-- Compatibilidade (ADR-0005, decisao 9): somente colunas novas com default ou
-- anulaveis, tabela nova e troca de indice unico por restricao unica
-- equivalente. A versao anterior da aplicacao continua funcionando contra este
-- schema.

-- CreateEnum
CREATE TYPE "media_deletion_reason" AS ENUM ('source_processed', 'source_failed', 'source_abandoned', 'derivative_orphan', 'image_removed', 'retention_purge');

-- AlterTable
ALTER TABLE "listing_images" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failure_code" TEXT,
ADD COLUMN     "lease_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "next_attempt_at" TIMESTAMPTZ(6),
ADD COLUMN     "source_confirmed_at" TIMESTAMPTZ(6),
ADD COLUMN     "source_etag" TEXT,
ADD COLUMN     "upload_authorized_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "upload_generation" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "media_object_deletions" (
    "id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "reason" "media_deletion_reason" NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_object_deletions_pkey" PRIMARY KEY ("id")
);

-- ===========================================================================
-- SQL customizado (media-pipeline-contract.md, secao 15)
-- ===========================================================================

-- Backfill de linhas anteriores a esta migration, antes dos CHECKs:
-- * `upload_authorized_at` herda o instante de criacao da reserva, em vez do
--   instante desta migration (o default so vale para linhas novas);
-- * imagem `ready` antiga passa a ter confirmacao e processamento registrados,
--   sem os quais o CHECK de `ready` abaixo recusaria a linha;
-- * imagem `failed` antiga recebe um codigo explicito de legado.
UPDATE "listing_images" SET "upload_authorized_at" = "created_at";
UPDATE "listing_images"
SET "processed_at" = coalesce("processed_at", "updated_at"),
    "source_confirmed_at" = coalesce("source_confirmed_at", "processed_at", "updated_at")
WHERE "status" = 'ready';
UPDATE "listing_images" SET "failure_code" = 'legacy_unknown'
WHERE "status" = 'failed' AND "failure_code" IS NULL;

-- Unicidade de posicao DEFERRABLE INITIALLY DEFERRED (contrato, secao 10):
-- reordenar seis imagens exige trocar posicoes dentro da mesma transacao, e o
-- CHECK 1..6 nao deixa posicao livre intermediaria. A verificacao passa a
-- ocorrer no COMMIT; ao fim de toda transacao, (listing_id, position) continua
-- unico. Mesmo nome do indice anterior.
-- Consequencia: esta restricao NAO pode ser arbitro de ON CONFLICT; nenhum
-- fluxo a usa assim (a reserva usa trava + contagem + menor posicao livre).
DROP INDEX "listing_images_listing_id_position_key";
ALTER TABLE "listing_images"
  ADD CONSTRAINT "listing_images_listing_id_position_key"
  UNIQUE ("listing_id", "position") DEFERRABLE INITIALLY DEFERRED;

-- `ready` so existe com upload confirmado e processamento concluido (8.3).
ALTER TABLE "listing_images"
  ADD CONSTRAINT "listing_images_ready_consistency_check"
  CHECK ("status" <> 'ready' OR ("source_confirmed_at" IS NOT NULL AND "processed_at" IS NOT NULL));

ALTER TABLE "listing_images"
  ADD CONSTRAINT "listing_images_attempts_check" CHECK ("attempts" >= 0);

ALTER TABLE "listing_images"
  ADD CONSTRAINT "listing_images_upload_generation_check" CHECK ("upload_generation" >= 1);

-- Lista fechada de codigos (8.4): permanentes, transitorios e o legado acima.
ALTER TABLE "listing_images"
  ADD CONSTRAINT "listing_images_failure_code_check"
  CHECK ("failure_code" IS NULL OR "failure_code" IN (
    'unsupported_format', 'animated', 'too_small', 'too_large_pixels', 'too_large_bytes',
    'corrupt', 'empty', 'source_replaced', 'source_missing', 'expired', 'transient_exhausted',
    'r2_throttled', 'r2_unavailable', 'timeout', 'network', 'interrupted',
    'legacy_unknown'));

-- Claim do executor (8.2): somente linhas que podem estar na fila.
CREATE INDEX "listing_images_claim_idx"
  ON "listing_images" ((coalesce("next_attempt_at", "source_confirmed_at")))
  WHERE "status" IN ('uploaded', 'processing');

-- Limpeza de reservas abandonadas e do teto de 20 h (secao 11; consumidor #47).
CREATE INDEX "listing_images_cleanup_idx"
  ON "listing_images" ("upload_authorized_at")
  WHERE "status" <> 'ready';

-- Fila de exclusao (secao 13): uma pendencia ativa por chave, o que torna a
-- insercao idempotente com ON CONFLICT ("object_key") WHERE "completed_at" IS NULL.
CREATE UNIQUE INDEX "media_object_deletions_pending_key"
  ON "media_object_deletions" ("object_key")
  WHERE "completed_at" IS NULL;

CREATE INDEX "media_object_deletions_due_idx"
  ON "media_object_deletions" ("due_at")
  WHERE "completed_at" IS NULL;

ALTER TABLE "media_object_deletions"
  ADD CONSTRAINT "media_object_deletions_attempts_check" CHECK ("attempts" >= 0);
