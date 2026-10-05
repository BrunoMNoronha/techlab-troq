// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sinais dos trabalhos periodicos (F3-013, #103; AR-14.3): toda execucao
// concluida registra `jobs.run`; erro por caso e execucao que lanca viram
// `jobs.failure` com alerta.
const reportSignal = vi.fn();
vi.mock('@/modules/platform', () => ({
  reportSignal: (...args: unknown[]) => reportSignal(...args),
}));

import { runJob } from './run-job';

describe('runJob', () => {
  beforeEach(() => reportSignal.mockReset());

  it('execucao sem trabalho ainda registra `jobs.run`, so com contagens em snake_case', async () => {
    const summary = { claimed: 0, notAccredited: 0, errors: 0, label: 'ignorado' };
    expect(await runJob('payments-reconcile', async () => summary)).toBe(summary);

    expect(reportSignal).toHaveBeenCalledTimes(1);
    const [name, attributes] = reportSignal.mock.calls[0];
    expect(name).toBe('jobs.run');
    expect(attributes).toMatchObject({
      job: 'payments-reconcile',
      claimed: 0,
      not_accredited: 0,
      errors: 0,
    });
    expect(attributes).not.toHaveProperty('label');
    expect(typeof attributes.duration_ms).toBe('number');
  });

  it('erro em algum caso: `jobs.run` e alerta `jobs.failure` de case_errors', async () => {
    await runJob('payments-refund-retry', async () => ({ claimed: 3, errors: 2 }));
    expect(reportSignal.mock.calls.map(([name]) => name)).toEqual(['jobs.run', 'jobs.failure']);
    expect(reportSignal.mock.calls[1]).toEqual([
      'jobs.failure',
      { job: 'payments-refund-retry', kind: 'case_errors', errors: 2 },
      { alert: true },
    ]);
  });

  it('execucao que lanca: alerta de erro sem a mensagem, e a falha e relancada', async () => {
    class PrismaClientKnownRequestError extends Error {
      override name = 'PrismaClientKnownRequestError';
    }
    const failure = new PrismaClientKnownRequestError('postgres://usuario:senha@host/db');
    await expect(
      runJob('media-cleanup', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(reportSignal).toHaveBeenCalledTimes(1);
    const [name, attributes, options] = reportSignal.mock.calls[0];
    expect(name).toBe('jobs.failure');
    expect(attributes).toMatchObject({
      job: 'media-cleanup',
      kind: 'run_failed',
      error: 'prisma_client_known_request_error',
    });
    expect(JSON.stringify(attributes)).not.toContain('senha');
    expect(options).toEqual({ alert: true, level: 'error' });
  });
});
