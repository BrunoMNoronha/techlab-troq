-- F3-008 (#98) — agenda persistida dos trabalhos periodicos de pagamento
-- (payments-design.md, PD-3.4, PD-3.5 e nota de 2026-10-01 em PD-10.7).
--
-- A reclamacao por `FOR UPDATE SKIP LOCKED` avanca o proximo instante na mesma
-- transacao curta e commita; o processamento vem depois, fora dela. Assim duas
-- execucoes sobrepostas sao disjuntas (as linhas travadas sao puladas, e as ja
-- reclamadas ficam no futuro), e uma execucao que morra no meio so atrasa o
-- caso ate o instante reclamado.
--
-- Gerada por `prisma migrate diff` e reduzida a mao: os tres
-- `ALTER ... updated_at DROP DEFAULT` das tabelas do Better Auth sao drift
-- preexistente e ficam de fora (database.md, secoes 16 e 17).
--
-- Aditiva: colunas anulaveis, sem default e sem reescrita de tabela. NULL quer
-- dizer "elegivel ja", entao as linhas existentes entram no primeiro ciclo.

-- AlterTable
ALTER TABLE "payment_attempts" ADD COLUMN     "last_reconcile_result" TEXT,
ADD COLUMN     "last_reconciled_at" TIMESTAMPTZ(6),
ADD COLUMN     "next_reconcile_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "technical_refunds" ADD COLUMN     "next_attempt_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "payment_attempts_status_next_reconcile_at_idx" ON "payment_attempts"("status", "next_reconcile_at");

-- CreateIndex
CREATE INDEX "technical_refunds_status_next_attempt_at_idx" ON "technical_refunds"("status", "next_attempt_at");
