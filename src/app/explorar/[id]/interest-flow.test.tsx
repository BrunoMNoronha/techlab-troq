import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as requestActions from '@/modules/request/actions';
import { InterestFlow } from './interest-flow';

// "Tenho interesse" e a confirmacao da solicitacao paga (F3-012, #102; RF-008,
// interest-flow.md). A regra e do servidor; aqui se prova que o clique
// gratuito nao chama o servidor e que so a confirmacao explicita o faz.

const push = vi.fn();
const router = { push, refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/modules/request/actions', () => ({ requestContactUnlock: vi.fn() }));

const requestContactUnlock = vi.mocked(requestActions.requestContactUnlock);
const LISTING_ID = '0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f';
const REQUEST_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';

function openConfirmation() {
  render(<InterestFlow listingId={LISTING_ID} />);
  fireEvent.click(screen.getByRole('button', { name: 'Tenho interesse' }));
  return screen.getByRole('group', { name: 'Confirmar a solicitação paga de R$ 0,99' });
}

describe('InterestFlow — Tenho interesse e confirmacao (F3-012)', () => {
  beforeEach(() => {
    push.mockReset();
    requestContactUnlock.mockReset();
  });

  it('"Tenho interesse" e gratuito: abre a explicacao sem chamar o servidor', () => {
    const panel = openConfirmation();

    expect(requestContactUnlock).not.toHaveBeenCalled();
    expect(panel).toHaveTextContent('três vagas');
    expect(panel).toHaveTextContent('30 minutos');
    expect(panel).toHaveTextContent('R$ 0,99');
    expect(panel).toHaveTextContent('pagar não garante ser escolhido');
    expect(panel).toHaveTextContent('não há reembolso por não ser escolhido');
    // Foco vai para o titulo da confirmacao (teclado e leitor de tela).
    expect(screen.getByRole('heading', { name: /Confirmar a solicitação/ })).toHaveFocus();
  });

  it('desistir fecha a confirmacao sem rastro', () => {
    openConfirmation();
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));

    expect(screen.getByRole('button', { name: 'Tenho interesse' })).toBeInTheDocument();
    expect(requestContactUnlock).not.toHaveBeenCalled();
  });

  it('confirmar chama o servidor UMA vez e leva a tela do Pix, sem dado de pagamento na URL', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof requestContactUnlock>>) => void;
    requestContactUnlock.mockReturnValue(new Promise((r) => (resolve = r)));
    openConfirmation();

    const confirm = screen.getByRole('button', { name: 'Confirmar e gerar Pix' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(await screen.findByRole('button', { name: 'Reservando vaga…' })).toBeDisabled();

    await act(async () =>
      resolve({
        success: true,
        contactRequestId: REQUEST_ID,
        reservedUntil: '2026-10-05T12:30:00.000Z',
        pix: { copyPaste: '000201SIMULADO', qrCodeBase64: null, ticketUrl: null, expiresAt: null },
      }),
    );

    expect(requestContactUnlock).toHaveBeenCalledTimes(1);
    expect(requestContactUnlock).toHaveBeenCalledWith(LISTING_ID);
    expect(push).toHaveBeenCalledWith(`/solicitacoes/${REQUEST_ID}`);
  });

  it('reserva viva no anuncio (DEC-041): mostra a recusa e leva as solicitacoes', async () => {
    requestContactUnlock.mockResolvedValue({
      success: false,
      reason: 'active_reservation',
      error: 'Você já tem uma solicitação aguardando pagamento neste anúncio.',
    });
    openConfirmation();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e gerar Pix' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('aguardando pagamento');
    expect(screen.getByRole('link', { name: 'Ver minhas solicitações' })).toHaveAttribute(
      'href',
      '/solicitacoes',
    );
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.queryByRole('button', { name: 'Confirmar e gerar Pix' })).toBeNull();
  });

  it.each(['no_slots', 'unavailable', 'not_accepting', 'already_paid'] as const)(
    'recusa definitiva (%s) nao oferece repetir',
    async (reason) => {
      requestContactUnlock.mockResolvedValue({ success: false, reason, error: 'Recusado.' });
      openConfirmation();
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar e gerar Pix' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Recusado.');
      expect(screen.queryByRole('button', { name: 'Confirmar e gerar Pix' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
      if (reason === 'already_paid') {
        expect(screen.getByRole('link', { name: 'Ver minhas solicitações' })).toHaveAttribute(
          'href',
          '/solicitacoes',
        );
      }
    },
  );

  it('sessao expirada volta ao login preservando o anuncio de origem', async () => {
    requestContactUnlock.mockResolvedValue({
      success: false,
      reason: 'login_required',
      error: 'Entre na sua conta.',
    });
    openConfirmation();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e gerar Pix' }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/login?motivo=solicitar&next=${encodeURIComponent(`/explorar/${LISTING_ID}`)}`,
      ),
    );
  });

  it('falha de rede informa que nada foi cobrado e permite tentar de novo', async () => {
    requestContactUnlock.mockRejectedValue(new Error('rede'));
    openConfirmation();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e gerar Pix' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Nada foi cobrado');
    expect(screen.getByRole('button', { name: 'Confirmar e gerar Pix' })).toBeEnabled();
  });
});
