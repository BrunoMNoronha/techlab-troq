import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { hashPassword } from 'better-auth/crypto';
import { loginUser, logoutUser } from './actions';
import * as prismaModule from '@/persistence/prisma';

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
const cookiesMock = vi.fn(async () => cookieStore);

vi.mock('next/headers', () => ({
  cookies: () => cookiesMock(),
}));

const PASSWORD = 'senha-correta-123';
let passwordHash: string;

interface UserFixture {
  id: string;
  email: string;
  status: string;
  emailVerified: boolean;
}

const activeUser: UserFixture = {
  id: 'user-active',
  email: 'active@troq.app',
  status: 'active',
  emailVerified: true,
};

function mockPrisma({
  user = activeUser as UserFixture | null,
  credential = { password: passwordHash } as { password: string | null } | null,
  sessionCreate = vi.fn().mockResolvedValue({ id: 'sess-1' }),
  sessionDeleteMany = vi.fn().mockResolvedValue({ count: 1 }),
} = {}) {
  const prisma = {
    user: { findFirst: vi.fn().mockResolvedValue(user) },
    account: { findFirst: vi.fn().mockResolvedValue(credential) },
    session: { create: sessionCreate, deleteMany: sessionDeleteMany },
  };
  vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue(
    prisma as unknown as prismaModule.PrismaClient,
  );
  return prisma;
}

describe('modulo identity — login e logout (#42 / F2-004)', () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.mockImplementation(async () => cookieStore);
  });

  describe('loginUser', () => {
    it('rejeita e-mail vazio', async () => {
      const res = await loginUser('', PASSWORD);
      expect(res.success).toBe(false);
      expect(res.error).toContain('e-mail');
    });

    it('rejeita senha ausente mesmo com e-mail de conta ativa e verificada', async () => {
      const prisma = mockPrisma();

      const res = await loginUser('active@troq.app', '');
      expect(res.success).toBe(false);
      expect(res.error).toContain('senha');
      expect(prisma.session.create).not.toHaveBeenCalled();
      expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it('rejeita chamada direta da action sem o argumento de senha (regressao)', async () => {
      const prisma = mockPrisma();

      // Chamada direta do endpoint da Server Action, sem passar pela validacao do formulario.
      const directCall = loginUser as unknown as (email: string) => ReturnType<typeof loginUser>;
      const res = await directCall('active@troq.app');

      expect(res.success).toBe(false);
      expect(prisma.session.create).not.toHaveBeenCalled();
      expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it('rejeita senha incorreta sem criar sessao nem cookie', async () => {
      const prisma = mockPrisma();

      const res = await loginUser('active@troq.app', 'senha-errada');
      expect(res.success).toBe(false);
      expect(res.error).toBe('E-mail ou senha invalidos.');
      expect(prisma.session.create).not.toHaveBeenCalled();
      expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it('rejeita usuario sem credencial de senha persistida', async () => {
      const prisma = mockPrisma({ credential: null });

      const res = await loginUser('active@troq.app', PASSWORD);
      expect(res.success).toBe(false);
      expect(res.error).toBe('E-mail ou senha invalidos.');
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('rejeita hash corrompido como credencial invalida', async () => {
      mockPrisma({ credential: { password: 'nao-e-um-hash' } });

      const res = await loginUser('active@troq.app', PASSWORD);
      expect(res.success).toBe(false);
      expect(res.error).toBe('E-mail ou senha invalidos.');
    });

    it('rejeita e-mail nao encontrado com a mesma mensagem generica', async () => {
      mockPrisma({ user: null });

      const res = await loginUser('notfound@troq.app', PASSWORD);
      expect(res.success).toBe(false);
      expect(res.error).toBe('E-mail ou senha invalidos.');
    });

    it('rejeita login de conta suspensa mesmo com senha correta', async () => {
      const prisma = mockPrisma({ user: { ...activeUser, status: 'blocked_admin' } });

      const res = await loginUser('active@troq.app', PASSWORD);
      expect(res.success).toBe(false);
      expect(res.error).toContain('suspensa ou inativa');
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('nao revela status da conta para senha incorreta', async () => {
      mockPrisma({ user: { ...activeUser, status: 'blocked_admin' } });

      const res = await loginUser('active@troq.app', 'senha-errada');
      expect(res.error).toBe('E-mail ou senha invalidos.');
    });

    it('rejeita login de e-mail ainda nao verificado', async () => {
      const prisma = mockPrisma({ user: { ...activeUser, emailVerified: false } });

      const res = await loginUser('active@troq.app', PASSWORD);
      expect(res.success).toBe(false);
      expect(res.error).toContain('nao foi verificado');
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('autentica conta ativa e verificada com senha correta, persistindo sessao e cookie', async () => {
      const prisma = mockPrisma();

      const res = await loginUser('  Active@troq.app ', PASSWORD);
      expect(res).toEqual({ success: true, redirectTo: '/conta' });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'active@troq.app', status: { not: 'deletion_requested' } },
      });
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      const token = prisma.session.create.mock.calls[0][0].data.token;
      expect(cookieStore.set).toHaveBeenCalledWith(
        'better-auth.session_token',
        token,
        expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
      );
    });

    it('retorna ao anuncio de origem quando o destino e interno (#59)', async () => {
      mockPrisma();

      const res = await loginUser('active@troq.app', PASSWORD, '/explorar/abc-123');
      expect(res).toEqual({ success: true, redirectTo: '/explorar/abc-123' });
    });

    it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])(
      'ignora destino de retorno externo %s e usa /conta (#59)',
      async (returnTo) => {
        mockPrisma();

        const res = await loginUser('active@troq.app', PASSWORD, returnTo);
        expect(res).toEqual({ success: true, redirectTo: '/conta' });
      },
    );

    it('senha incorreta com destino de retorno nao autentica nem redireciona (#59)', async () => {
      const prisma = mockPrisma();

      const res = await loginUser('active@troq.app', 'senha-errada', '/explorar/abc-123');
      expect(res.success).toBe(false);
      expect(res.redirectTo).toBeUndefined();
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('nao declara sucesso quando a persistencia da sessao falha', async () => {
      mockPrisma({ sessionCreate: vi.fn().mockRejectedValue(new Error('db down')) });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const res = await loginUser('active@troq.app', PASSWORD);
      expect(res.success).toBe(false);
      expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it('nao declara sucesso quando o cookie nao pode ser gravado e revoga a sessao criada', async () => {
      const prisma = mockPrisma();
      cookiesMock.mockImplementation(async () => {
        throw new Error('sem contexto de requisicao');
      });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const res = await loginUser('active@troq.app', PASSWORD);
      expect(res.success).toBe(false);
      const token = prisma.session.create.mock.calls[0][0].data.token;
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { token } });
    });
  });

  describe('logoutUser', () => {
    it('revoga a sessao do cookie no banco e remove o cookie', async () => {
      const prisma = mockPrisma();
      cookieStore.get.mockReturnValue({ value: 'token-abc' });

      const res = await logoutUser();
      expect(res.success).toBe(true);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { token: 'token-abc' } });
      expect(cookieStore.delete).toHaveBeenCalledWith('better-auth.session_token');
    });

    it('sem cookie de sessao, conclui sem tocar no banco', async () => {
      const prisma = mockPrisma();
      cookieStore.get.mockReturnValue(undefined);

      const res = await logoutUser();
      expect(res.success).toBe(true);
      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    });

    it('nao declara sucesso quando a revogacao da sessao falha', async () => {
      mockPrisma({ sessionDeleteMany: vi.fn().mockRejectedValue(new Error('db down')) });
      cookieStore.get.mockReturnValue({ value: 'token-abc' });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const res = await logoutUser();
      expect(res.success).toBe(false);
      expect(cookieStore.delete).not.toHaveBeenCalled();
    });

    it('nao declara sucesso sem contexto de cookies', async () => {
      cookiesMock.mockImplementation(async () => {
        throw new Error('sem contexto de requisicao');
      });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const res = await logoutUser();
      expect(res.success).toBe(false);
    });
  });
});
