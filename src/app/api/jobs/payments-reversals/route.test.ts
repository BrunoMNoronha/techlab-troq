// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Rota da varredura de reversoes (F3-011, #101): so o segredo do agendador a
// aciona (CI-11, PD-8.9); falha fechada sem segredo configurado; sessao de
// usuario nao substitui o segredo; a resposta e so um resumo de contagens.
const runPaymentReversalSweep = vi.fn();
vi.mock('@/modules/request', () => ({
  runPaymentReversalSweep: (...args: unknown[]) => runPaymentReversalSweep(...args),
}));

// F3-013 (#103): toda execucao concluida emite `jobs.run`.
const reportSignal = vi.fn();
vi.mock('@/modules/platform', () => ({
  reportSignal: (...args: unknown[]) => reportSignal(...args),
}));

import { dynamic, GET, maxDuration, runtime } from './route';

const SECRET = 'segredo-sintetico-reversoes-1234';

function call(headers: Record<string, string> = {}) {
  return GET(new Request('http://localhost/api/jobs/payments-reversals', { headers }));
}

const SUMMARY = {
  claimed: 3,
  stillAccredited: 1,
  reversed: 1,
  inconsistent: 0,
  unavailable: 1,
  unchanged: 0,
  deferred: 0,
  errors: 0,
};

describe('GET /api/jobs/payments-reversals', () => {
  beforeEach(() => {
    runPaymentReversalSweep.mockReset();
    runPaymentReversalSweep.mockResolvedValue(SUMMARY);
    reportSignal.mockReset();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('Node.js, dinamica e com maxDuration de 300 s', () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
    expect(maxDuration).toBe(300);
  });

  it('sem CRON_SECRET configurado nao executa, mesmo com cabecalho', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await call({ authorization: 'Bearer qualquer' });
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('');
    expect(runPaymentReversalSweep).not.toHaveBeenCalled();
  });

  it.each<[string, Record<string, string>]>([
    ['sem cabecalho', {}],
    ['segredo errado', { authorization: 'Bearer segredo-errado-errado-errado-1234' }],
    ['so o segredo, sem esquema', { authorization: SECRET }],
    ['esquema em minusculas', { authorization: `bearer ${SECRET}` }],
    ['esquema Basic', { authorization: `Basic ${SECRET}` }],
    ['segredo com espaco extra', { authorization: `Bearer  ${SECRET}` }],
    ['so sessao de usuario', { cookie: 'better-auth.session_token=sessao-valida-de-usuario' }],
  ])('%s: 401 sem corpo e nada executa', async (_c, headers) => {
    vi.stubEnv('CRON_SECRET', SECRET);
    const res = await call(headers);
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('');
    expect(runPaymentReversalSweep).not.toHaveBeenCalled();
    expect(reportSignal).not.toHaveBeenCalled();
  });

  it('com o segredo: executa dentro do orcamento, sem cache, e devolve so contagens', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    const before = Date.now();
    const res = await call({ authorization: `Bearer ${SECRET}` });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual(SUMMARY);
    expect(Object.values(body).every((v) => typeof v === 'number')).toBe(true);
    const [{ stopClaimingAt }] = runPaymentReversalSweep.mock.calls[0] as [
      { stopClaimingAt: number },
    ];
    expect(stopClaimingAt - before).toBeGreaterThanOrEqual(179_000);
    expect(stopClaimingAt - before).toBeLessThanOrEqual(181_000);
    expect(reportSignal).toHaveBeenCalledWith(
      'jobs.run',
      expect.objectContaining({ job: 'payments-reversals', reversed: 1, still_accredited: 1 }),
    );
  });

  it('falha da varredura: a rota lanca e o sinal de falha sai com alerta', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    runPaymentReversalSweep.mockRejectedValueOnce(new Error('falha sintetica'));
    await expect(call({ authorization: `Bearer ${SECRET}` })).rejects.toThrow('falha sintetica');
    expect(reportSignal).toHaveBeenCalledWith(
      'jobs.failure',
      expect.objectContaining({ job: 'payments-reversals', kind: 'run_failed' }),
      expect.objectContaining({ alert: true }),
    );
  });
});
