// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Rota de recuperacao do processamento (F2-008, #46): so o segredo do
// agendador a aciona; falha fechada sem segredo configurado.
const processPendingImages = vi.fn();
vi.mock('@/modules/media/processor', () => ({
  processPendingImages: (...args: unknown[]) => processPendingImages(...args),
}));

import { GET, maxDuration } from './route';

function call(authorization?: string) {
  return GET(
    new Request('http://localhost/api/jobs/media-process', {
      headers: authorization ? { authorization } : {},
    }),
  );
}

describe('GET /api/jobs/media-process', () => {
  beforeEach(() => {
    processPendingImages.mockReset();
    processPendingImages.mockResolvedValue({ claimed: 1, ready: 1 });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('declara maxDuration de 300 s', () => {
    expect(maxDuration).toBe(300);
  });

  it('sem CRON_SECRET configurado nao executa, mesmo com cabecalho', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await call('Bearer qualquer');
    expect(res.status).toBe(401);
    expect(processPendingImages).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    'Bearer errado-errado-errado',
    'segredo-sintetico-123',
    'bearer segredo-sintetico-123',
  ])('cabecalho ausente ou incorreto (%s) nao executa', async (header) => {
    vi.stubEnv('CRON_SECRET', 'segredo-sintetico-123');
    const res = await call(header);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('');
    expect(processPendingImages).not.toHaveBeenCalled();
  });

  it('com o segredo correto processa dentro do orcamento e nao faz cache', async () => {
    vi.stubEnv('CRON_SECRET', 'segredo-sintetico-123');
    const before = Date.now();
    const res = await call('Bearer segredo-sintetico-123');

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ claimed: 1, ready: 1 });
    const [{ stopClaimingAt }] = processPendingImages.mock.calls[0] as [{ stopClaimingAt: number }];
    expect(stopClaimingAt - before).toBeGreaterThanOrEqual(179_000);
    expect(stopClaimingAt - before).toBeLessThanOrEqual(181_000);
  });
});
