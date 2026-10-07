import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDemoDataSummary, requireDemoTarget } from '@/modules/demo-data';
import { validateSession } from '@/modules/identity';
import ConfiguracoesPage from './page';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/modules/identity', () => ({
  validateSession: vi.fn(),
  loginRedirectPath: (reason?: string) => `/login?motivo=${reason ?? 'sessao'}`,
}));
vi.mock('@/modules/demo-data', () => ({ getDemoDataSummary: vi.fn(), requireDemoTarget: vi.fn() }));
vi.mock('./actions', () => ({ removeDemoProducts: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(validateSession).mockResolvedValue({
    isValid: true,
    user: {
      id: 'u',
      email: 'u@example.test',
      displayName: 'U',
      status: 'active',
      emailVerified: true,
    },
  });
  vi.mocked(getDemoDataSummary).mockResolvedValue({
    environment: 'preview',
    version: 'v1',
    batchId: null,
    products: 0,
    pendingMedia: 0,
  });
});

describe('/configuracoes — produtos exemplares', () => {
  it('redireciona sessão inválida antes de consultar o lote', async () => {
    vi.mocked(validateSession).mockResolvedValueOnce({
      user: null,
      isValid: false,
      reason: 'blocked',
    });
    await expect(ConfiguracoesPage()).rejects.toThrow('REDIRECT /login?motivo=blocked');
    expect(requireDemoTarget).not.toHaveBeenCalled();
    expect(getDemoDataSummary).not.toHaveBeenCalled();
  });

  it('não oferece a página em produção ou em alvo não comprovado', async () => {
    vi.mocked(requireDemoTarget).mockImplementationOnce(() => {
      throw new Error('target');
    });
    await expect(ConfiguracoesPage()).rejects.toThrow('NOT_FOUND');
    expect(getDemoDataSummary).not.toHaveBeenCalled();
  });

  it('exibe ambiente e estado vazio, sem opção de geração', async () => {
    render(await ConfiguracoesPage());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Configurações');
    expect(screen.getByText('Preview')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remover produtos exemplares' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /gerar|criar|cadastrar/i })).toBeNull();
  });

  it('erro de consulta não revela configuração ou conexão', async () => {
    vi.mocked(getDemoDataSummary).mockRejectedValueOnce(
      new Error('postgres://secret:password@host/db'),
    );
    const { container } = render(await ConfiguracoesPage());
    expect(screen.getByRole('alert')).toHaveTextContent(/Não foi possível consultar o lote/);
    expect(container.textContent).not.toMatch(/secret|password|postgres/);
    expect(screen.queryByRole('button', { name: /remover/i })).toBeNull();
  });
});
