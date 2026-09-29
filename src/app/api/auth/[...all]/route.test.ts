// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handler = vi.fn(async () => new Response('{}', { status: 200 }));
vi.mock('@/modules/identity/auth', () => ({ getAuth: () => ({ handler }) }));

const { GET, POST } = await import('./route');

const BASE = 'http://localhost:3000/api/auth';

describe('rota /api/auth — superficie do Better Auth (#42 / F2-004)', () => {
  beforeEach(() => handler.mockClear());

  it('qualquer POST (sign-up, sign-in, sign-out, update/delete-user) responde 404 sem chegar ao provedor', async () => {
    const res = await POST();
    expect(res.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it('GET fora da lista permitida responde 404', async () => {
    const res = await GET(new Request(`${BASE}/list-sessions`));
    expect(res.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['/ok', '/get-session'])('GET %s e repassado ao provedor', async (path) => {
    const res = await GET(new Request(`${BASE}${path}`));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
