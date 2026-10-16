import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemoSummary } from '@/modules/demo-data';
import { removeDemoProducts, type RemoveDemoProductsResult } from './actions';
import { DemoProducts } from './demo-products';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock('./actions', () => ({ removeDemoProducts: vi.fn() }));

const BATCH = 'c29c7475-931c-44c6-8d32-0a1c9fda0210';
const summary: DemoSummary = {
  environment: 'development',
  version: 'v1',
  batchId: BATCH,
  products: 30,
  pendingMedia: 0,
};
const success: RemoveDemoProductsResult = {
  success: true,
  created: 0,
  existing: 0,
  removed: 30,
  pendingMedia: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(removeDemoProducts).mockResolvedValue(success);
});

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Remover 30 produtos exemplares' }));
  return screen.getByRole('dialog', { name: 'Remover produtos exemplares?' });
}

describe('Configurações — confirmação de remoção', () => {
  it('abrir e cancelar não alteram dados', () => {
    render(<DemoProducts summary={summary} />);
    expect(screen.getByText('v1')).toBeTruthy();
    expect(screen.getByText('c29c7475…0210')).toBeTruthy();
    const dialog = openDialog();
    expect(within(dialog).getByText('c29c7475…0210')).toBeTruthy();
    expect(within(dialog).getByText('v1')).toBeTruthy();
    expect(within(dialog).getByText(/remover 30 produtos exemplares/)).toBeTruthy();
    expect(dialog).toHaveTextContent('Ambiente: Desenvolvimento');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(removeDemoProducts).not.toHaveBeenCalled();
  });

  it('Escape cancela sem operação', () => {
    render(<DemoProducts summary={summary} />);
    const dialog = openDialog();
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(removeDemoProducts).not.toHaveBeenCalled();
  });

  it('confirma lote exibido, atualiza contagem e anuncia o resultado', async () => {
    render(<DemoProducts summary={summary} />);
    const dialog = openDialog();
    const confirm = within(dialog).getByRole('button', { name: 'Confirmar remoção' });
    confirm.focus();
    expect(document.activeElement).toBe(confirm);
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(removeDemoProducts).toHaveBeenCalledExactlyOnceWith(BATCH);
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('30 produtos exemplares removidos.');
    expect(screen.getByRole('button', { name: 'Remover produtos exemplares' })).toBeDisabled();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('status'));
    });
  });

  it('desabilita ações e evita submissão duplicada durante a espera', async () => {
    let complete!: (value: RemoveDemoProductsResult) => void;
    vi.mocked(removeDemoProducts).mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    render(<DemoProducts summary={summary} />);
    const dialog = openDialog();
    const confirm = within(dialog).getByRole('button', { name: 'Confirmar remoção' });
    const form = confirm.closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(within(dialog).getByRole('button', { name: 'Removendo...' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(removeDemoProducts).toHaveBeenCalledOnce();
    await act(async () => {
      complete(success);
    });
  });

  it('confirmação aberta continua ligada ao lote original após refresh', async () => {
    vi.mocked(removeDemoProducts).mockResolvedValueOnce({
      success: false,
      reason: 'stale_batch',
      error: 'O lote mudou. Confirme o lote atual.',
    });
    const { rerender } = render(<DemoProducts summary={summary} />);
    const dialog = openDialog();
    rerender(
      <DemoProducts
        summary={{ ...summary, version: 'v2', batchId: 'c29c7475-931c-44c6-8d32-0a1c9fda0211' }}
      />,
    );
    expect(screen.getByText('c29c7475…0211')).toBeTruthy();
    expect(screen.getByText('v2')).toBeTruthy();
    expect(within(dialog).getByText('c29c7475…0210')).toBeTruthy();
    expect(within(dialog).getByText('v1')).toBeTruthy();
    expect(within(dialog).queryByText('c29c7475…0211')).toBeNull();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar remoção' }));
    });
    expect(removeDemoProducts).toHaveBeenCalledWith(BATCH);
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent(/O lote mudou/);
  });

  it('conflito mantém a contagem e posiciona foco no erro', async () => {
    vi.mocked(removeDemoProducts).mockResolvedValueOnce({
      success: false,
      reason: 'conflict',
      error: 'Nenhum produto foi removido: existem vínculos.',
    });
    render(<DemoProducts summary={summary} />);
    const dialog = openDialog();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar remoção' }));
    });
    expect(screen.getByRole('button', { name: 'Remover 30 produtos exemplares' })).toBeEnabled();
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent(/Nenhum produto foi removido/);
    await waitFor(() => {
      expect(error).toHaveFocus();
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('distingue produtos removidos de arquivos pendentes e permite consultar a limpeza automática', async () => {
    vi.mocked(removeDemoProducts).mockResolvedValueOnce({
      ...success,
      success: true,
      pendingMedia: 2,
    });
    render(<DemoProducts summary={summary} />);
    const dialog = openDialog();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar remoção' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      /2 arquivos de imagem aguardam a limpeza automática/,
    );
    expect(screen.getByRole('button', { name: 'Remover produtos exemplares' })).toBeDisabled();
    const refreshCleanup = screen.getByRole('button', { name: 'Atualizar status da limpeza' });
    expect(refreshCleanup).toBeEnabled();
    fireEvent.click(refreshCleanup);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(removeDemoProducts).toHaveBeenCalledOnce();
  });

  it('sessão revogada leva ao login sem declarar sucesso', async () => {
    vi.mocked(removeDemoProducts).mockResolvedValueOnce({
      success: false,
      reason: 'login_required',
      error: 'Entre na sua conta.',
    });
    render(<DemoProducts summary={summary} />);
    const dialog = openDialog();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar remoção' }));
    });
    expect(push).toHaveBeenCalledWith('/login?motivo=sessao');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('erro de conexão mantém a operação disponível e anuncia falha', async () => {
    vi.mocked(removeDemoProducts).mockRejectedValueOnce(new Error('connection'));
    render(<DemoProducts summary={summary} />);
    const dialog = openDialog();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar remoção' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/Verifique sua conexão/);
    expect(screen.getByRole('button', { name: 'Remover 30 produtos exemplares' })).toBeEnabled();
  });
});
