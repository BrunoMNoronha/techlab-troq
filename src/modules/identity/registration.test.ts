import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerUser, confirmEmailToken, resendVerificationToken } from './actions';
import { verifyPassword } from 'better-auth/crypto';
import * as prismaModule from '@/persistence/prisma';

vi.mock('./email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
}));

describe('modulo identity — cadastro e verificacao de email (#41 / F2-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerUser', () => {
    it('rejeita cadastro com nome invalido', async () => {
      const res = await registerUser({
        displayName: 'A',
        email: 'user@troq.app',
        password: 'password123',
        over18: true,
        termsAccepted: true,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('nome exibido');
    });

    it('rejeita cadastro se autodeclaracao de maioridade (over18) for falsa', async () => {
      const res = await registerUser({
        displayName: 'User Minor',
        email: 'minor@troq.app',
        password: 'password123',
        over18: false,
        termsAccepted: true,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('18 anos');
    });

    it('rejeita cadastro se os termos de uso nao forem aceitos', async () => {
      const res = await registerUser({
        displayName: 'User Test',
        email: 'user@troq.app',
        password: 'password123',
        over18: true,
        termsAccepted: false,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Termos de Uso');
    });

    it('rejeita cadastro se o e-mail ja estiver em uso por conta ativa', async () => {
      const mockFindFirst = vi.fn().mockResolvedValueOnce({
        id: 'existing-id',
        email: 'dup@troq.app',
        status: 'active',
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        user: { findFirst: mockFindFirst },
      } as unknown as prismaModule.PrismaClient);

      const res = await registerUser({
        displayName: 'User Dup',
        email: 'dup@troq.app',
        password: 'password123',
        over18: true,
        termsAccepted: true,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('ja esta cadastrado');
    });

    it('cria usuario e aceite de termos age_eligibility em transacao com sucesso', async () => {
      const mockFindFirst = vi.fn().mockResolvedValueOnce(null);
      const mockUserCreate = vi.fn().mockResolvedValueOnce({
        id: 'user-new-id',
        displayName: 'New User',
        email: 'new@troq.app',
      });
      const mockAccountCreate = vi.fn().mockResolvedValueOnce({ id: 'account-id' });
      const mockTermsCreate = vi.fn().mockResolvedValueOnce({ id: 'terms-id' });
      const mockVerificationCreate = vi.fn().mockResolvedValueOnce({ id: 'verif-id' });

      const mockTransaction = vi.fn().mockImplementation(async (callback) => {
        return callback({
          user: { create: mockUserCreate },
          account: { create: mockAccountCreate },
          termsAcceptance: { create: mockTermsCreate },
        });
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        user: { findFirst: mockFindFirst },
        $transaction: mockTransaction,
        verification: { create: mockVerificationCreate },
      } as unknown as prismaModule.PrismaClient);

      const res = await registerUser({
        displayName: 'New User',
        email: 'new@troq.app',
        password: 'password123',
        over18: true,
        termsAccepted: true,
      });

      expect(res.success).toBe(true);
      expect(res.emailPending).toBe('new@troq.app');
      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayName: 'New User',
            email: 'new@troq.app',
            emailVerified: false,
          }),
        }),
      );
      // Credencial email/senha persistida com hash do Better Auth, nunca em texto puro.
      const accountData = mockAccountCreate.mock.calls[0][0].data;
      expect(accountData).toMatchObject({
        userId: 'user-new-id',
        accountId: 'user-new-id',
        providerId: 'credential',
      });
      expect(accountData.password).not.toBe('password123');
      await expect(
        verifyPassword({ hash: accountData.password, password: 'password123' }),
      ).resolves.toBe(true);
      expect(mockTermsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-new-id',
            type: 'age_eligibility',
            termsVersion: '1.0',
          }),
        }),
      );
    });
  });

  describe('confirmEmailToken', () => {
    it('retorna erro se o token for invalido ou nao existir', async () => {
      const mockFindFirst = vi.fn().mockResolvedValueOnce(null);
      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        verification: { findFirst: mockFindFirst },
      } as unknown as prismaModule.PrismaClient);

      const res = await confirmEmailToken('invalid-token');
      expect(res.success).toBe(false);
      expect(res.error).toContain('invalido');
    });

    it('retorna erro e remove o token se ele estiver expirado', async () => {
      const mockDelete = vi.fn().mockResolvedValueOnce({});
      const mockFindFirst = vi.fn().mockResolvedValueOnce({
        id: 'verif-1',
        identifier: 'expired@troq.app',
        value: 'exp-token',
        expiresAt: new Date(Date.now() - 10000), // Expirado ha 10s
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        verification: { findFirst: mockFindFirst, delete: mockDelete },
      } as unknown as prismaModule.PrismaClient);

      const res = await confirmEmailToken('exp-token');
      expect(res.success).toBe(false);
      expect(res.error).toContain('expirou');
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'verif-1' } });
    });

    it('marca e-mail como verificado quando token e valido', async () => {
      const mockVerifFindFirst = vi.fn().mockResolvedValueOnce({
        id: 'verif-2',
        identifier: 'valid@troq.app',
        value: 'valid-token',
        expiresAt: new Date(Date.now() + 100000),
      });

      const mockUserFindFirst = vi.fn().mockResolvedValueOnce({
        id: 'user-valid-id',
        email: 'valid@troq.app',
      });

      const mockTransaction = vi.fn().mockResolvedValueOnce([{}, {}]);

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        verification: { findFirst: mockVerifFindFirst, delete: vi.fn() },
        user: { findFirst: mockUserFindFirst, update: vi.fn() },
        $transaction: mockTransaction,
      } as unknown as prismaModule.PrismaClient);

      const res = await confirmEmailToken('valid-token');
      expect(res.success).toBe(true);
      expect(mockTransaction).toHaveBeenCalled();
    });
  });

  describe('resendVerificationToken', () => {
    it('retorna erro se o e-mail ja estiver verificado', async () => {
      const mockUserFindFirst = vi.fn().mockResolvedValueOnce({
        id: 'user-id',
        email: 'verified@troq.app',
        emailVerified: true,
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        user: { findFirst: mockUserFindFirst },
      } as unknown as prismaModule.PrismaClient);

      const res = await resendVerificationToken('verified@troq.app');
      expect(res.success).toBe(false);
      expect(res.error).toContain('ja foi verificado');
    });
  });
});
