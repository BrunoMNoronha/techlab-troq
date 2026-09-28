import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loginUser, logoutUser } from './actions';
import * as prismaModule from '@/persistence/prisma';

describe('modulo identity — login e logout (#42 / F2-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loginUser', () => {
    it('rejeita e-mail vazio', async () => {
      const res = await loginUser('');
      expect(res.success).toBe(false);
      expect(res.error).toContain('e-mail');
    });

    it('rejeita e-mail nao encontrado no sistema', async () => {
      const mockFindFirst = vi.fn().mockResolvedValueOnce(null);
      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        user: { findFirst: mockFindFirst },
      } as unknown as prismaModule.PrismaClient);

      const res = await loginUser('notfound@troq.app');
      expect(res.success).toBe(false);
      expect(res.error).toContain('invalidas');
    });

    it('rejeita login de conta suspensa ou inativa', async () => {
      const mockFindFirst = vi.fn().mockResolvedValueOnce({
        id: 'user-blocked',
        email: 'blocked@troq.app',
        status: 'blocked_admin',
        emailVerified: true,
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        user: { findFirst: mockFindFirst },
      } as unknown as prismaModule.PrismaClient);

      const res = await loginUser('blocked@troq.app');
      expect(res.success).toBe(false);
      expect(res.error).toContain('suspensa ou inativa');
    });

    it('rejeita login de e-mail ainda nao verificado', async () => {
      const mockFindFirst = vi.fn().mockResolvedValueOnce({
        id: 'user-unverif',
        email: 'unverified@troq.app',
        status: 'active',
        emailVerified: false,
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        user: { findFirst: mockFindFirst },
      } as unknown as prismaModule.PrismaClient);

      const res = await loginUser('unverified@troq.app');
      expect(res.success).toBe(false);
      expect(res.error).toContain('nao foi verificado');
    });

    it('permite login de usuario ativo e verificado', async () => {
      const mockFindFirst = vi.fn().mockResolvedValueOnce({
        id: 'user-active',
        email: 'active@troq.app',
        status: 'active',
        emailVerified: true,
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        user: { findFirst: mockFindFirst },
      } as unknown as prismaModule.PrismaClient);

      const res = await loginUser('active@troq.app');
      expect(res.success).toBe(true);
      expect(res.redirectTo).toBe('/conta');
    });
  });

  describe('logoutUser', () => {
    it('executa logout com sucesso', async () => {
      const res = await logoutUser();
      expect(res.success).toBe(true);
    });
  });
});
