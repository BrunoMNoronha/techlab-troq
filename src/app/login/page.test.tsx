import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import LoginPage from './page';

// Acessibilidade do login (#42): rotulos associados, envio pelo teclado e
// mensagem de erro anunciada, focada e associada aos campos — inclusive a de
// limite de tentativas (IC-10.2).
const loginUser = vi.fn();
vi.mock('@/modules/identity/actions', () => ({
  loginUser: (...args: unknown[]) => loginUser(...args),
}));

async function renderLogin() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <LoginPage searchParams={Promise.resolve({})} />
      </Suspense>,
    );
  });
}

describe('pagina /login', () => {
  it('campos tem rotulo associado e o formulario envia pelo teclado (Enter)', async () => {
    loginUser.mockResolvedValueOnce({ success: false, error: 'E-mail ou senha invalidos.' });
    await renderLogin();

    const email = screen.getByLabelText('E-mail');
    const password = screen.getByLabelText('Senha');
    fireEvent.change(email, { target: { value: 'pessoa@example.test' } });
    fireEvent.change(password, { target: { value: 'senha-sintetica' } });
    await act(async () => {
      fireEvent.submit(password.closest('form')!);
    });

    expect(loginUser).toHaveBeenCalledWith('pessoa@example.test', 'senha-sintetica', undefined);
  });

  it.each([
    'E-mail ou senha invalidos.',
    'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  ])('erro "%s" e anunciado, recebe o foco e descreve os campos', async (message) => {
    loginUser.mockResolvedValueOnce({ success: false, error: message });
    await renderLogin();

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@example.test' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'x' } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Senha').closest('form')!);
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(document.activeElement).toBe(alert);
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-describedby', alert.id);
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-describedby', alert.id);
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });
});
