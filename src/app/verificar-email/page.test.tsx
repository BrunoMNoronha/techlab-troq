import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import VerificarEmailPage from './page';

// O token do link vai no fragmento (`#token=`), que nunca chega ao servidor
// nem ao `Referer` — e portanto nao entra nos logs de requisicao da plataforma
// (identity-contract.md, IC-9.1 e IC-11.2).
const confirmEmailToken = vi.fn();
vi.mock('@/modules/identity/actions', () => ({
  confirmEmailToken: (token: string) => confirmEmailToken(token),
  resendVerificationToken: vi.fn(),
}));

const TOKEN = 'A'.repeat(43);

describe('pagina /verificar-email', () => {
  beforeEach(() => {
    confirmEmailToken.mockReset();
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('confirma com o token do fragmento e o remove da barra de endereco', async () => {
    confirmEmailToken.mockResolvedValue({ success: true });
    window.history.replaceState(null, '', `/verificar-email#token=${TOKEN}`);

    render(<VerificarEmailPage />);

    expect(await screen.findByText('E-mail verificado com sucesso!')).toBeInTheDocument();
    expect(confirmEmailToken).toHaveBeenCalledTimes(1);
    expect(confirmEmailToken).toHaveBeenCalledWith(TOKEN);
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('nao usa token na query string: sem fragmento, o link e invalido', async () => {
    window.history.replaceState(null, '', `/verificar-email?token=${TOKEN}`);

    render(<VerificarEmailPage />);

    expect(await screen.findByText('Link inválido ou já utilizado')).toBeInTheDocument();
    expect(confirmEmailToken).not.toHaveBeenCalled();
  });

  it('falha recuperavel permite tentar de novo com o mesmo token', async () => {
    confirmEmailToken
      .mockResolvedValueOnce({ success: false, reason: 'error', error: 'Falha temporaria.' })
      .mockResolvedValueOnce({ success: true });
    window.history.replaceState(null, '', `/verificar-email#token=${TOKEN}`);

    render(<VerificarEmailPage />);
    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    retry.click();

    await waitFor(() => expect(confirmEmailToken).toHaveBeenCalledTimes(2));
    expect(confirmEmailToken).toHaveBeenLastCalledWith(TOKEN);
    expect(await screen.findByText('E-mail verificado com sucesso!')).toBeInTheDocument();
  });
});
