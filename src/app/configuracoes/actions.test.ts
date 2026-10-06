import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidatePath } from 'next/cache';
import { removeDemoData, requireDemoTarget } from '@/modules/demo-data';
import { validateSession } from '@/modules/identity';
import { removeDemoProducts } from './actions';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/demo-data', () => ({ removeDemoData: vi.fn(), requireDemoTarget: vi.fn() }));
vi.mock('@/modules/identity', () => ({ validateSession: vi.fn() }));

const BATCH = 'c29c7475-931c-44c6-8d32-0a1c9fda0210';
const OTHER_BATCH = 'c29c7475-931c-44c6-8d32-0a1c9fda0211';
const actor = {
  id: 'ordinary-user',
  email: 'user@example.test',
  displayName: 'Usuário',
  emailVerified: true,
  status: 'active' as const,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(validateSession).mockResolvedValue({ isValid: true, user: actor });
  vi.mocked(removeDemoData).mockResolvedValue({
    success: true,
    created: 0,
    existing: 0,
    removed: 30,
    pendingMedia: 0,
  });
});

describe('remoção de produtos exemplares — Server Action', () => {
  it.each(['no_session', 'unverified', 'blocked', 'deletion_requested'] as const)(
    'nega sessão %s antes de consultar o alvo ou remover dados',
    async (reason) => {
      vi.mocked(validateSession).mockResolvedValue({ isValid: false, user: actor, reason });
      expect(await removeDemoProducts(BATCH)).toMatchObject({
        success: false,
        reason: 'login_required',
      });
      expect(requireDemoTarget).not.toHaveBeenCalled();
      expect(removeDemoData).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it('permite qualquer usuário validado e deriva a identidade somente da sessão', async () => {
    expect(await removeDemoProducts(BATCH)).toMatchObject({ success: true, removed: 30 });
    expect(requireDemoTarget).toHaveBeenCalledOnce();
    expect(removeDemoData).toHaveBeenCalledExactlyOnceWith('ordinary-user', BATCH);
    expect(revalidatePath).toHaveBeenCalledWith('/configuracoes');
    expect(revalidatePath).toHaveBeenCalledWith('/explorar');
  });

  it('revalida a sessão a cada invocação, inclusive após revogação', async () => {
    await removeDemoProducts(BATCH);
    vi.mocked(validateSession).mockResolvedValueOnce({
      isValid: false,
      user: null,
      reason: 'no_session',
    });
    expect(await removeDemoProducts(BATCH)).toMatchObject({ reason: 'login_required' });
    expect(removeDemoData).toHaveBeenCalledOnce();
  });

  it('nega chamada direta em produção ou alvo inválido sem expor detalhes', async () => {
    vi.mocked(requireDemoTarget).mockImplementation(() => {
      throw new Error('postgres://user:secret@production.invalid/private');
    });
    const result = await removeDemoProducts(BATCH);
    expect(result).toMatchObject({ success: false, reason: 'target' });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(removeDemoData).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', 'qualquer-id', { actorId: 'spoofed', batchId: BATCH }, 30])(
    'recusa referência de lote inválida %j',
    async (input) => {
      expect(await removeDemoProducts(input)).toMatchObject({ reason: 'validation' });
      expect(removeDemoData).not.toHaveBeenCalled();
    },
  );

  it('repasse do lote confirmado permite detectar confirmação antiga', async () => {
    vi.mocked(removeDemoData).mockResolvedValueOnce({
      success: false,
      reason: 'stale_batch',
      error: `lote atual ${OTHER_BATCH}`,
    });
    const result = await removeDemoProducts(BATCH);
    expect(removeDemoData).toHaveBeenCalledWith(actor.id, BATCH);
    expect(result).toMatchObject({ reason: 'stale_batch', error: expect.stringMatching(/mudou/) });
    expect(JSON.stringify(result)).not.toContain(OTHER_BATCH);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('conflito de negócio é comunicado sem expor erro interno e sem revalidação', async () => {
    vi.mocked(removeDemoData).mockResolvedValueOnce({
      success: false,
      reason: 'conflict',
      error: 'constraint secret_database_fk',
    });
    const result = await removeDemoProducts(BATCH);
    expect(result).toMatchObject({ error: expect.stringMatching(/Nenhum produto foi removido/) });
    expect(JSON.stringify(result)).not.toContain('secret_database');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('falha inesperada produz erro seguro', async () => {
    vi.mocked(removeDemoData).mockRejectedValueOnce(new Error('credential secret'));
    const result = await removeDemoProducts(BATCH);
    expect(result).toMatchObject({ success: false, reason: 'error' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
