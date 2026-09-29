import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateSession, loginRedirectPath } from './index';
import * as prismaModule from '@/persistence/prisma';

// Mock do next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Mock do Better Auth
const mockGetSession = vi.fn();
vi.mock('./auth', () => ({
  getAuth: () => ({
    api: {
      getSession: mockGetSession,
    },
  }),
}));

describe('modulo identity — validateSession (Guard server-side)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna no_session quando nao ha sessao ativa', async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const result = await validateSession();

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('no_session');
    expect(result.user).toBeNull();
  });

  it('retorna unverified se o email do usuario nao tiver sido verificado', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    mockGetSession.mockResolvedValueOnce({
      session: { id: 'sess-1', userId },
      user: { id: userId, email: 'user@troq.app', name: 'User Test' },
    });

    const mockFindUnique = vi.fn().mockResolvedValueOnce({
      id: userId,
      email: 'user@troq.app',
      displayName: 'User Test',
      emailVerified: false,
      status: 'active',
    });

    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      user: { findUnique: mockFindUnique },
    } as unknown as prismaModule.PrismaClient);

    const result = await validateSession();

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('unverified');
    expect(result.user?.id).toBe(userId);
  });

  it('retorna blocked se o status do usuario for bloqueado', async () => {
    const userId = '22222222-2222-2222-2222-222222222222';
    mockGetSession.mockResolvedValueOnce({
      session: { id: 'sess-2', userId },
      user: { id: userId, email: 'blocked@troq.app', name: 'Blocked User' },
    });

    const mockFindUnique = vi.fn().mockResolvedValueOnce({
      id: userId,
      email: 'blocked@troq.app',
      displayName: 'Blocked User',
      emailVerified: true,
      status: 'blocked_admin',
    });

    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      user: { findUnique: mockFindUnique },
    } as unknown as prismaModule.PrismaClient);

    const result = await validateSession();

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe('blocked');
  });

  it('retorna isValid=true quando usuario esta ativo e verificado', async () => {
    const userId = '33333333-3333-3333-3333-333333333333';
    mockGetSession.mockResolvedValueOnce({
      session: { id: 'sess-3', userId },
      user: { id: userId, email: 'active@troq.app', name: 'Active User' },
    });

    const mockFindUnique = vi.fn().mockResolvedValueOnce({
      id: userId,
      email: 'active@troq.app',
      displayName: 'Active User',
      emailVerified: true,
      status: 'active',
    });

    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      user: { findUnique: mockFindUnique },
    } as unknown as prismaModule.PrismaClient);

    const result = await validateSession();

    expect(result.isValid).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.user?.email).toBe('active@troq.app');
  });

  it('loginRedirectPath traduz cada motivo de sessao invalida para a tela de login', () => {
    expect(loginRedirectPath('no_session')).toBe('/login?motivo=sessao');
    expect(loginRedirectPath(undefined)).toBe('/login?motivo=sessao');
    expect(loginRedirectPath('blocked')).toBe('/login?motivo=bloqueada');
    expect(loginRedirectPath('deletion_requested')).toBe('/login?motivo=excluida');
    expect(loginRedirectPath('unverified')).toBe('/login?motivo=nao_verificada');
  });
});
