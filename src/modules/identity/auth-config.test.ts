// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as prismaModule from '@/persistence/prisma';
import { getAuth } from './auth';

describe('configuracao do Better Auth (#42 / F2-004)', () => {
  it('recusa cadastro pelo endpoint do provedor, que pularia 18+ e aceite de termos', async () => {
    const userCreate = vi.fn();
    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      user: { create: userCreate, findFirst: vi.fn() },
    } as unknown as prismaModule.PrismaClient);

    await expect(
      getAuth().api.signUpEmail({
        body: { name: 'Sintetico', email: 'bypass@example.test', password: 'senha-12345678' },
      }),
    ).rejects.toMatchObject({ body: { code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' } });
    expect(userCreate).not.toHaveBeenCalled();
  });
});
