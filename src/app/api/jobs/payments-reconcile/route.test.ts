// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Rota de reconciliacao de pagamentos (F3-008, #98): so o segredo do agendador
// a aciona (CI-11, PD-8.9); falha fechada sem segredo configurado; sessao de
// usuario nao substitui o segredo; a resposta e so um resumo de contagens.
const runPaymentReconciliation = vi.fn();
vi.mock('@/modules/request', () => ({
  runPaymentReconciliation: (...args: unknown[]) => runPaymentReconciliation(...args),
}));

import { dynamic, GET, maxDuration, runtime } from './route';

const SECRET = 'segredo-sintetico-reconciliacao-123';

function call(headers: Record<string, string> = {}) {
  return GET(new Request('http://localhost/api/jobs/payments-reconcile', { headers }));
}

const SUMMARY = {
  claimed: 4,
  confirmed: 1,
  exceptions: 1,
  notAccredited: 0,
  pending: 1,
  canceled: 1,
  adopted: 0,
  requesterOwned: 0,
  orphansNotFound: 0,
  observed: 0,
  divergences: 0,
  unavailable: 0,
  inconsistent: 0,
  unchanged: 0,
  deferred: 0,
  errors: 0,
};

describe('GET /api/jobs/payments-reconcile', () => {
  beforeEach(() => {
    runPaymentReconciliation.mockReset();
    runPaymentReconciliation.mockResolvedValue(SUMMARY);
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
    expect(runPaymentReconciliation).not.toHaveBeenCalled();
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
    expect(runPaymentReconciliation).not.toHaveBeenCalled();
  });

  it('a recusa e identica com e sem segredo configurado', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const without = await call({ authorization: 'Bearer x' });
    vi.stubEnv('CRON_SECRET', SECRET);
    const withSecret = await call({ authorization: 'Bearer x' });
    expect(without.status).toBe(withSecret.status);
    expect([...without.headers.entries()]).toEqual([...withSecret.headers.entries()]);
    expect(await without.text()).toBe(await withSecret.text());
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
    const [{ stopClaimingAt }] = runPaymentReconciliation.mock.calls[0] as [
      { stopClaimingAt: number },
    ];
    expect(stopClaimingAt - before).toBeGreaterThanOrEqual(179_000);
    expect(stopClaimingAt - before).toBeLessThanOrEqual(181_000);
  });
});
