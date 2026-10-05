import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GoogleAvailability } from '@/app/_components/google-sign-in';
import LoginPage from './page';

// Acessibilidade do login (#42): rotulos associados, envio pelo teclado e
// mensagem de erro anunciada, focada e associada aos campos — inclusive a de
// limite de tentativas (IC-10.2).
const loginUser = vi.fn();
vi.mock('@/modules/identity/actions', () => ({
  loginUser: (...args: unknown[]) => loginUser(...args),
}));
const startGoogleSignIn = vi.fn();
vi.mock('@/modules/identity/google-actions', () => ({
  startGoogleSignIn: (...args: unknown[]) => startGoogleSignIn(...args),
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

// Entrada com Google (#81): o botao so existe com o provedor configurado, fica
// ocupado durante o redirecionamento e anuncia erro em portugues.
describe('pagina /login — Continuar com Google', () => {
  async function renderWithGoogle(available: boolean, params: Record<string, string> = {}) {
    await act(async () => {
      render(
        <GoogleAvailability available={available}>
          <Suspense fallback={null}>
            <LoginPage searchParams={Promise.resolve(params)} />
          </Suspense>
        </GoogleAvailability>,
      );
    });
  }

  it('sem Google configurado nao mostra o botao e o login por senha continua', async () => {
    await renderWithGoogle(false);
    expect(screen.queryByRole('button', { name: 'Continuar com Google' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('com Google configurado inicia o fluxo com o destino pedido e fica ocupado', async () => {
    let resolve!: (value: unknown) => void;
    startGoogleSignIn.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await renderWithGoogle(true, { next: '/anuncios/novo' });

    const button = screen.getByRole('button', { name: 'Continuar com Google' });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(startGoogleSignIn).toHaveBeenCalledWith('/anuncios/novo');
    const busy = screen.getByRole('button', { name: 'Abrindo o Google...' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      resolve({ success: false, error: 'A entrada com Google esta indisponivel no momento.' });
    });
  });

  it('erro ao iniciar e anunciado, recebe o foco e libera o botao', async () => {
    startGoogleSignIn.mockResolvedValueOnce({
      success: false,
      error: 'Nao foi possivel iniciar a entrada com Google. Tente novamente.',
    });
    await renderWithGoogle(true);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }));
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nao foi possivel iniciar a entrada com Google');
    expect(document.activeElement).toBe(alert);
    expect(screen.getByRole('button', { name: 'Continuar com Google' })).toBeEnabled();
  });

  it.each([
    ['google_cancelado', 'nenhuma conta foi criada'],
    ['google_conta_existente', 'vincule a Conta Google em Minha conta'],
    ['google_email_nao_verificado', 'O Google nao confirmou o e-mail'],
    ['google_falha', 'Nao foi possivel entrar com Google'],
  ])('motivo %s exibe orientacao em portugues', async (motivo, text) => {
    await renderWithGoogle(true, { motivo });
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });
});
