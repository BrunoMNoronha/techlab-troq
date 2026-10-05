-- F3-011 (#101) — agenda persistida da varredura diaria de reversoes
-- (payments-design.md, PD-3.4, PD-9.1, PD-10.2 e nota de 2026-10-01 em PD-10.7).
--
-- A reclamacao por `FOR UPDATE SKIP LOCKED` das tentativas `pagamento_confirmado`
-- avanca este instante 24 h na mesma transacao curta e commita; o exame vem
-- depois, fora dela. Coluna propria, e nao `next_reconcile_at`: uma tentativa
-- confirmada com caso aberto tambem e reobservada de hora em hora pela
-- reconciliacao de F3-008, e as duas agendas nao podem se empurrar.
--
-- Gerada por `prisma migrate diff` e reduzida a mao: os tres
-- `ALTER ... updated_at DROP DEFAULT` das tabelas do Better Auth sao drift
-- preexistente e ficam de fora (database.md, secoes 16 e 17).
--
-- Aditiva: coluna anulavel, sem default e sem reescrita de tabela. NULL quer
-- dizer "elegivel ja", entao as tentativas ja confirmadas entram na primeira
-- varredura.

-- AlterTable
ALTER TABLE "payment_attempts" ADD COLUMN     "next_reversal_check_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "payment_attempts_status_next_reversal_check_at_idx" ON "payment_attempts"("status", "next_reversal_check_at");