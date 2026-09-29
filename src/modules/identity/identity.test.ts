import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateSession, loginRedirectPath } from './index';
import * as prismaModule from '@/persistence/prisma';

// Teste UNITARIO do guard: a sessao do provedor e simulada. A prova com o
// Better Auth real e PostgreSQL descartavel esta em auth-flow.integration.test.ts.
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetSession = vi.fn();
vi.mock('./auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth')>()),
  getAuth: () => ({ api: { getSession: mockGetSession } }),
}));

const USER_ID = '33333333-3333-3333-3333-333333333333';

function providerSession() {
  return {
    session: { id: 'sess-1', token: 'token-do-provedor', userId: USER_ID },
    user: { id: USER_ID, email: 'active@troq.app', name: 'Active User' },
  };
}

function mockUser(user: Record<string, unknown> | null) {
  const findUnique = vi.fn().mockResolvedValueOnce(user);
  vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
    user: { findUnique },
  } as unknown as prismaModule.PrismaClient);
  return findUnique;
}

const activeUser = {
  id: USER_ID,
  email: 'active@troq.app',
  displayName: 'Active User',
  emailVerified: true,
  status: 'active',
};

describe('modulo identity — validateSession (Guard server-side)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('retorna no_session quando o provedor nao devolve sessao, sem consultar o banco', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const findUnique = mockUser(activeUser);

    const result = await validateSession();

    expect(result).toEqual({ user: null, isValid: false, reason: 'no_session' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('nega (fail-closed) quando o provedor falha', async () => {
    mockGetSession.mockRejectedValueOnce(new Error('falha interna'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await validateSession();

    expect(result).toEqual({ user: null, isValid: false, reason: 'no_session' });
  });

  it('nega (fail-closed) quando a leitura do estado da conta falha', async () => {
    mockGetSession.mockResolvedValueOnce(providerSession());
    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      user: { findUnique: vi.fn().mockRejectedValueOnce(new Error('banco indisponivel')) },
    } as unknown as prismaModule.PrismaClient);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await validateSession();

    expect(result).toEqual({ user: null, isValid: false, reason: 'no_session' });
  });

  it('consulta o estado atual pelo id autenticado pelo provedor', async () => {
    mockGetSession.mockResolvedValueOnce(providerSession());
    const findUnique = mockUser(activeUser);

    await validateSession();

    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: USER_ID } }));
  });

  it('usuario autenticado que nao existe mais e tratado como sem sessao', async () => {
    mockGetSession.mockResolvedValueOnce(providerSession());
    mockUser(null);

    expect((await validateSession()).reason).toBe('no_session');
  });

  it('retorna unverified se o email do usuario nao tiver sido verificado', async () => {
    mockGetSession.mockResolvedValueOnce(providerSession());
    mockUser({ ...activeUser, emailVerified: false });

    const result = await validateSession();

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('unverified');
    expect(result.user?.id).toBe(USER_ID);
  });

  it.each([
    ['blocked_age', 'blocked'],
    ['blocked_admin', 'blocked'],
    ['deletion_requested', 'deletion_requested'],
  ])('status %s e negado com motivo %s', async (status, reason) => {
    mockGetSession.mockResolvedValueOnce(providerSession());
    mockUser({ ...activeUser, status });

    const result = await validateSession();

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe(reason);
  });

  it('retorna isValid=true quando usuario esta ativo e verificado, sem expor a sessao', async () => {
    mockGetSession.mockResolvedValueOnce(providerSession());
    mockUser(activeUser);

    const result = await validateSession();

    expect(result).toEqual({ user: activeUser, isValid: true });
    expect(JSON.stringify(result)).not.toContain('token-do-provedor');
    expect(JSON.stringify(result)).not.toContain('sess-1');
  });

  it('loginRedirectPath traduz cada motivo de sessao invalida para a tela de login', () => {
    expect(loginRedirectPath('no_session')).toBe('/login?motivo=sessao');
    expect(loginRedirectPath(undefined)).toBe('/login?motivo=sessao');
    expect(loginRedirectPath('blocked')).toBe('/login?motivo=bloqueada');
    expect(loginRedirectPath('deletion_requested')).toBe('/login?motivo=excluida');
    expect(loginRedirectPath('unverified')).toBe('/login?motivo=nao_verificada');
  });
});
