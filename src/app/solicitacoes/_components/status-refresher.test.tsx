import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_REFRESH_MS, StatusRefresher } from './status-refresher';

const refresh = vi.fn();
const router = { push: vi.fn(), refresh };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('StatusRefresher (F3-012)', () => {
  beforeEach(() => {
    refresh.mockReset();
    setVisibility('visible');
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rele a pagina a cada intervalo com a aba visivel', () => {
    render(<StatusRefresher />);
    act(() => vi.advanceTimersByTime(AUTO_REFRESH_MS * 2));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('com a aba oculta nao rele; ao voltar, rele na hora', () => {
    render(<StatusRefresher />);
    setVisibility('hidden');
    act(() => vi.advanceTimersByTime(AUTO_REFRESH_MS * 3));
    expect(refresh).not.toHaveBeenCalled();

    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('modo manual: sem intervalo, so pelo botao', () => {
    render(<StatusRefresher auto={false} label="Atualizar" />);
    act(() => vi.advanceTimersByTime(AUTO_REFRESH_MS * 3));
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/se atualiza sozinha/)).toBeNull();
  });
});
