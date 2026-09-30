// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Rota de limpeza de midia (F2-009, #47): so o segredo do agendador a aciona;
// falha fechada sem segredo configurado; sessao de usuario nao substitui o
// segredo; a resposta e so um resumo de contagens.
const runMediaCleanup = vi.fn();
vi.mock('@/modules/media/cleanup', () => ({
  runMediaCleanup: (...args: unknown[]) => runMediaCleanup(...args),
}));

import { GET, maxDuration } from './route';

function call(headers: Record<string, string> = {}) {
  return GET(new Request('http://localhost/api/jobs/media-cleanup', { headers }));
}

const SUMMARY = {
  abandoned: 1,
  expired: 0,
  claimed: 3,
  completed: 2,
  retried: 1,
  protected: 0,
  errors: 0,
};

describe('GET /api/jobs/media-cleanup', () => {
  beforeEach(() => {
    runMediaCleanup.mockReset();
    runMediaCleanup.mockResolvedValue(SUMMARY);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('declara maxDuration de 300 s', () => {
    expect(maxDuration).toBe(300);
  });

  it('sem CRON_SECRET configurado nao executa, mesmo com cabecalho', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await call({ authorization: 'Bearer qualquer' });
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('');
    expect(runMediaCleanup).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([
    {},
    { authorization: 'Bearer errado-errado-errado' },
    { authorization: 'segredo-sintetico-123' },
    { authorization: 'bearer segredo-sintetico-123' },
    { cookie: 'better-auth.session_token=sessao-valida-de-usuario' },
  ])('cabecalho ausente, incorreto ou so sessao (%o) nao executa', async (headers) => {
    vi.stubEnv('CRON_SECRET', 'segredo-sintetico-123');
    const res = await call(headers);
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('');
    expect(runMediaCleanup).not.toHaveBeenCalled();
  });

  it('a recusa e identica com e sem segredo configurado', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const without = await call({ authorization: 'Bearer x' });
    vi.stubEnv('CRON_SECRET', 'segredo-sintetico-123');
    const withSecret = await call({ authorization: 'Bearer x' });
    expect([...without.headers.entries()]).toEqual([...withSecret.headers.entries()]);
    expect(await without.text()).toBe(await withSecret.text());
  });

  it('com o segredo correto executa dentro do orcamento, sem cache, e devolve so contagens', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-sintetico-123');
    const before = Date.now();
    const res = await call({ authorization: 'Bearer segredo-sintetico-123' });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual(SUMMARY);
    expect(Object.values(body).every((v) => typeof v === 'number')).toBe(true);
    const [{ stopClaimingAt }] = runMediaCleanup.mock.calls[0] as [{ stopClaimingAt: number }];
    expect(stopClaimingAt - before).toBeGreaterThanOrEqual(179_000);
    expect(stopClaimingAt - before).toBeLessThanOrEqual(181_000);
  });
});
