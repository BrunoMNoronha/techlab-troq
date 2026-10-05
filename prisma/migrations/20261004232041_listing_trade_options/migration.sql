-- DEC-046 (#76) — alternativas de troca aceitas pelo anunciante
-- (docs/architecture/listing-contract.md, secao 3.1; data-model.md, DM-5.10).
--
-- Uma linha por campo preenchido, na posicao 1..3 informada no formulario:
-- a ordem e a do anunciante e sobrevive a reabrir e editar. A completude
-- (exatamente 3) NAO e restricao de banco: o rascunho pode ficar incompleto e
-- os anuncios anteriores a esta migration nao tem nenhuma opcao (secao 17.3).
-- Ela e verificada pela aplicacao sob a trava de linha do anuncio, na
-- publicacao, na reativacao e na edicao de anuncio `published`/`paused`.
--
-- Migration aditiva: nao altera `listings`, nao preenche opcoes ficticias e
-- nao muda o estado de nenhum anuncio existente.
--
-- Os tres `ALTER ... updated_at DROP DEFAULT` que `migrate dev` propos nas
-- tabelas do Better Auth sao drift preexistente, fora do escopo (database.md).

-- CreateTable
CREATE TABLE "listing_trade_options" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_trade_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_trade_options_listing_id_position_key" ON "listing_trade_options"("listing_id", "position");

-- AddForeignKey
ALTER TABLE "listing_trade_options" ADD CONSTRAINT "listing_trade_options_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SQL customizado: o Prisma Schema nao expressa CHECK.
-- No maximo 3 opcoes por anuncio, junto com a unicidade de (listing_id, position).
ALTER TABLE "listing_trade_options"
  ADD CONSTRAINT "listing_trade_options_position_range_check" CHECK ("position" BETWEEN 1 AND 3);

-- Texto ja normalizado pela aplicacao: aparado, nao vazio, ate 60 caracteres.
ALTER TABLE "listing_trade_options"
  ADD CONSTRAINT "listing_trade_options_label_check"
  CHECK ("label" = btrim("label") AND char_length("label") BETWEEN 1 AND 60);
