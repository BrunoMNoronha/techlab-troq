import type { Prisma } from '@/generated/prisma/client';
import { getPrismaClient } from '@/persistence/prisma';

// Laco comum dos trabalhos periodicos de pagamento (F3-008, #98; PD-10.3,
// PD-10.6; ADR-0006, decisoes 5, 6, 8 e 10).
//
// Cada lote e RECLAMADO numa transacao curta: `SELECT ... FOR UPDATE SKIP
// LOCKED` pula as linhas que outra execucao esta reclamando, e o UPDATE da
// mesma instrucao empurra o proximo instante das linhas reclamadas para o
// futuro. A transacao commita ANTES de qualquer chamada de rede; o
// processamento vem depois, pelos fluxos existentes, que tomam as proprias
// travas em transacoes curtas (nota de 2026-10-01 em PD-10.7).
//
// Por que e seguro:
// - duas execucoes sobrepostas sao disjuntas: durante a reclamacao, pelo
//   `SKIP LOCKED`; depois do commit, porque o instante reclamado ja esta no
//   futuro e a linha deixa de ser elegivel;
// - uma execucao que morra no meio so atrasa o caso ate o instante reclamado;
// - reprocessar e seguro: todo efeito e idempotente (PD-10.4).
// Nenhuma trava consultiva de sessao (DEC-038).

export interface ClaimHooks {
  /**
   * Somente para teste (prova T-18, PD-13.2): chamado DENTRO da transacao de
   * reclamacao, antes do commit, com os ids reclamados. Em producao nao existe.
   */
  onClaimed?: (ids: string[]) => Promise<void>;
}

/** Executa a instrucao de reclamacao numa transacao propria e curta. */
export async function claimInTransaction(
  claim: (tx: Prisma.TransactionClient) => Promise<{ id: string }[]>,
  hooks: ClaimHooks = {},
): Promise<string[]> {
  return getPrismaClient().$transaction(
    async (tx) => {
      const ids = (await claim(tx)).map((row) => row.id);
      if (hooks.onClaimed) await hooks.onClaimed(ids);
      return ids;
    },
    { timeout: 30_000 },
  );
}

export interface JobLoopOptions {
  /** Instante (ms) a partir do qual nenhum lote novo e reclamado. */
  stopClaimingAt: number;
  /**
   * Instante (ms) a partir do qual nenhum caso ja reclamado comeca a ser
   * processado; o resto fica para o instante reclamado. Padrao: +60 s.
   */
  stopProcessingAt?: number;
  batchSize?: number;
}

export interface JobLoopCounts {
  claimed: number;
  deferred: number;
  errors: number;
}

/**
 * Reclama e processa lotes ate esgotar a fila elegivel ou o orcamento
 * (PD-10.6). Um erro inesperado num caso nao interrompe os outros: conta como
 * `errors` e o caso volta no instante reclamado.
 */
export async function runClaimLoop(
  options: JobLoopOptions,
  claim: (limit: number) => Promise<string[]>,
  processOne: (id: string) => Promise<void>,
  label: string,
): Promise<JobLoopCounts> {
  const batchSize = options.batchSize ?? 5;
  const stopProcessingAt = options.stopProcessingAt ?? options.stopClaimingAt + 60_000;
  const counts: JobLoopCounts = { claimed: 0, deferred: 0, errors: 0 };
  while (Date.now() < options.stopClaimingAt) {
    const ids = await claim(batchSize);
    counts.claimed += ids.length;
    for (const id of ids) {
      if (Date.now() >= stopProcessingAt) {
        counts.deferred += 1;
        continue;
      }
      try {
        await processOne(id);
      } catch (err) {
        counts.errors += 1;
        console.error(`[payments] falha ao processar caso de ${label}`, {
          error: err instanceof Error ? err.name : 'unknown',
        });
      }
    }
    if (ids.length < batchSize) break;
  }
  return counts;
}
