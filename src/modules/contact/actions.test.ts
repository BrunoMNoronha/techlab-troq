import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as identityModule from '@/modules/identity';
import { registerOwnContact } from './actions';

vi.mock('@/modules/identity', () => ({ validateSession: vi.fn() }));

const upsert = vi.fn();
vi.mock('@/persistence/prisma', () => ({
  getPrismaClient: () => ({ userContact: { upsert: (...a: unknown[]) => upsert(...a) } }),
}));

const validateSession = vi.mocked(identityModule.validateSession);

const user = {
  id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
  email: 'pessoa@example.test',
  displayName: 'Pessoa',
  emailVerified: true,
  status: 'active' as const,
};

const RAW = '(11) 91234-5678';
const DIGIT_VARIANTS = ['+5511912345678', '5511912345678', '11912345678', '91234-5678', '5678'];

function expectNoNumber(value: unknown) {
  const text = JSON.stringify(value);
  for (const variant of DIGIT_VARIANTS) expect(text).not.toContain(variant);
}

// CR-2.5: titular so da sessao, normalizacao no servidor, resposta sem o numero.
describe('registerOwnContact — registrar ou alterar o proprio contato (CR-2.2, CR-2.5)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    upsert.mockResolvedValue({ id: 'c' });
  });

  it('dono verificado e ativo grava a forma canonica e recebe so a confirmacao', async () => {
    validateSession.mockResolvedValue({ user, isValid: true });

    const result = await registerOwnContact({ phone: RAW });

    expect(result).toEqual({ success: true, hasContact: true });
    expectNoNumber(result);
    expect(upsert).toHaveBeenCalledWith({
      where: { userId: user.id },
      create: { userId: user.id, phoneNumber: '+5511912345678' },
      update: { phoneNumber: '+5511912345678' },
      select: { id: true },
    });
  });

  it('o titular vem da sessao: um userId enviado pelo cliente e ignorado', async () => {
    validateSession.mockResolvedValue({ user, isValid: true });
    const forged = { phone: RAW, userId: '00000000-0000-4000-8000-000000000000' };

    await registerOwnContact(forged as unknown as { phone: string });

    expect(upsert.mock.calls[0][0].where).toEqual({ userId: user.id });
  });

  it.each([
    ['no_session', null, 'login_required'],
    ['unverified', { ...user, emailVerified: false }, 'email_unverified'],
    ['blocked', { ...user, status: 'blocked_admin' as const }, 'account_restricted'],
    [
      'deletion_requested',
      { ...user, status: 'deletion_requested' as const },
      'account_restricted',
    ],
  ] as const)('sessao %s e recusada sem escrever', async (reason, sessionUser, expected) => {
    validateSession.mockResolvedValue({ user: sessionUser, isValid: false, reason });

    const result = await registerOwnContact({ phone: RAW });

    expect(result).toMatchObject({ success: false, reason: expected });
    expect(upsert).not.toHaveBeenCalled();
    expectNoNumber(result);
  });

  it.each([
    ['vazio', '', /informe seu telefone/i],
    ['invalido', '(11) 6234-5678', /telefone brasileiro com DDD/i],
    ['estrangeiro', '+1 415 555 0100', /telefone brasileiro com DDD/i],
  ])('entrada %s volta com erro de campo que nao ecoa o valor', async (_c, phone, message) => {
    validateSession.mockResolvedValue({ user, isValid: true });

    const result = await registerOwnContact({ phone });

    expect(result).toMatchObject({ success: false, reason: 'validation' });
    expect(result.success ? '' : result.fieldErrors?.phone).toMatch(message);
    expect(JSON.stringify(result)).not.toContain(phone || '\u0000');
    expect(JSON.stringify(result)).not.toMatch(/6234|0100/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('entrada malformada (sem objeto) e recusada como campo vazio', async () => {
    validateSession.mockResolvedValue({ user, isValid: true });

    const result = await registerOwnContact(null as unknown as { phone: string });

    expect(result).toMatchObject({ success: false, reason: 'validation' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('falha do banco nao vaza o numero nem a mensagem do erro', async () => {
    validateSession.mockResolvedValue({ user, isValid: true });
    upsert.mockRejectedValue(new Error('linha com +5511912345678'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await registerOwnContact({ phone: RAW });

    expect(result).toMatchObject({ success: false, reason: 'error' });
    expectNoNumber(result);
    expectNoNumber(log.mock.calls);
    log.mockRestore();
  });
});
