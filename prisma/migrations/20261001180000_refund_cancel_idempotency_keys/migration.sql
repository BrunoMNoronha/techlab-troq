-- F3-007 (#97) — chaves de idempotencia persistidas do reembolso tecnico e do
-- cancelamento da order (payments-design.md, PD-5.2 e PD-5.3; PE-2.4).
-- A chave e gerada uma vez e RELIDA em toda retentativa; nunca e derivada no
-- momento da chamada.
--
-- Gerada por `prisma migrate diff` e reduzida a mao: os tres
-- `ALTER ... updated_at DROP DEFAULT` das tabelas do Better Auth sao drift
-- preexistente e ficam de fora (database.md, secoes 16 e 17).
--
-- `idempotency_key` e NOT NULL sem default: `technical_refunds` nao tem linhas
-- em nenhum ambiente antes desta entrega (nenhum codigo a escrevia).

-- AlterTable
ALTER TABLE "payment_attempts" ADD COLUMN "cancel_idempotency_key" TEXT;

-- AlterTable
ALTER TABLE "technical_refunds" ADD COLUMN "idempotency_key" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_cancel_idempotency_key_key" ON "payment_attempts"("cancel_idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "technical_refunds_idempotency_key_key" ON "technical_refunds"("idempotency_key");
