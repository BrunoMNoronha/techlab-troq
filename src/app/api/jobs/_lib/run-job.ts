import { reportSignal } from '@/modules/platform';

// Sinais dos trabalhos periodicos (F3-013, #103; overview.md, AR-14.3: "ultima
// execucao bem-sucedida de cada trabalho periodico"; ADR-0006, consequencias).
//
// Toda execucao concluida emite `jobs.run` com as contagens do resumo — um
// registro por execucao, inclusive sem trabalho, para que "nao havia trabalho"
// seja distinguivel de "nao rodou". Casos com erro inesperado e execucao que
// lanca viram `jobs.failure` com alerta. Os resumos so tem contagens; mesmo
// assim, so atributos numericos seguem, com nome em snake_case.

export type JobName =
  | 'payments-reconcile'
  | 'payments-refund-retry'
  | 'payments-reversals'
  | 'media-cleanup'
  | 'media-process';

function snakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function numericCounts(summary: object): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(summary)) {
    if (typeof value === 'number') counts[snakeCase(key)] = value;
  }
  return counts;
}

/** Executa o trabalho e emite os sinais. Relanca a falha (a rota responde 500). */
export async function runJob<T extends object>(job: JobName, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  let summary: T;
  try {
    summary = await run();
  } catch (err) {
    reportSignal(
      'jobs.failure',
      {
        job,
        kind: 'run_failed',
        error: err instanceof Error ? snakeCase(err.name).replace(/^_/, '') : 'unknown',
        duration_ms: Date.now() - started,
      },
      { alert: true, level: 'error' },
    );
    throw err;
  }

  const counts = numericCounts(summary);
  reportSignal('jobs.run', { job, ...counts, duration_ms: Date.now() - started });
  if ((counts.errors ?? 0) > 0) {
    reportSignal(
      'jobs.failure',
      { job, kind: 'case_errors', errors: counts.errors },
      { alert: true },
    );
  }
  return summary;
}
