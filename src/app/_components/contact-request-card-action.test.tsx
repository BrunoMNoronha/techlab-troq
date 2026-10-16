import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as requestActions from '@/modules/request/actions';
import { ContactRequestCardAction } from './contact-request-card-action';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/modules/request/actions', () => ({
  getContactRequestCardState: vi.fn(),
  requestContactUnlock: vi.fn(),
}));

const getContactRequestCardState = vi.mocked(requestActions.getContactRequestCardState);
const requestContactUnlock = vi.mocked(requestActions.requestContactUnlock);

const LISTING_ID = '0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f';

function openDialog(freeSlots = 2) {
  render(
    <ContactRequestCardAction
      listingId={LISTING_ID}
      listingTitle="Bicicleta"
      freeSlots={freeSlots}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Solicitar contato/ }));
}

// Solicitacao no proprio card (DEC-056). Abrir o dialogo so le o estado; so
// "Confirmar e gerar Pix" chama `requestContactUnlock` (interest-flow.md).
describe('ContactRequestCardAction', () => {
  beforeEach(() => {
    push.mockReset();
    getContactRequestCardState.mockReset();
    requestContactUnlock.mockReset();
  });

  it('abrir le o estado e nao cria solicitacao', async () => {
    getContactRequestCardState.mockResolvedValue({
      state: 'request_available',
      ownRequestId: null,
    });
    openDialog();

    expect(
      await screen.findByRole('button', { name: 'Confirmar e gerar Pix' }),
    ).toBeInTheDocument();
    expect(getContactRequestCardState).toHaveBeenCalledWith(LISTING_ID);
    expect(requestContactUnlock).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'Confirmar a solicitação paga de R$ 0,99' }),
    ).toBeInTheDocument();
  });

  it('visitante e orientado a entrar, com retorno ao anuncio', async () => {
    getContactRequestCardState.mockResolvedValue({ state: 'login_required', ownRequestId: null });
    openDialog();

    expect(await screen.findByRole('link', { name: 'Entrar para solicitar' })).toHaveAttribute(
      'href',
      `/login?motivo=solicitar&next=${encodeURIComponent(`/explorar/${LISTING_ID}`)}`,
    );
    expect(screen.queryByRole('button', { name: 'Confirmar e gerar Pix' })).not.toBeInTheDocument();
  });

  it('solicitacao aberta do proprio ator leva ao acompanhamento', async () => {
    getContactRequestCardState.mockResolvedValue({ state: 'own_request', ownRequestId: 'req-1' });
    openDialog();

    expect(
      await screen.findByRole('link', { name: 'Acompanhar minha solicitação' }),
    ).toHaveAttribute('href', '/solicitacoes/req-1');
  });

  it.each([
    ['own_listing', /Este anúncio é seu/],
    ['no_slots', /vagas de solicitação deste anúncio estão ocupadas/],
    ['email_unverified', /Confirme seu e-mail/],
    ['listing_unavailable', /não está mais disponível/],
  ] as const)('estado %s mostra o motivo, sem confirmacao', async (state, text) => {
    getContactRequestCardState.mockResolvedValue({ state, ownRequestId: null });
    openDialog();

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar e gerar Pix' })).not.toBeInTheDocument();
  });

  it('confirmar chama o servidor UMA vez e leva a tela do Pix', async () => {
    getContactRequestCardState.mockResolvedValue({
      state: 'request_available',
      ownRequestId: null,
    });
    let resolve!: (v: Awaited<ReturnType<typeof requestContactUnlock>>) => void;
    requestContactUnlock.mockReturnValue(new Promise((r) => (resolve = r)));
    openDialog();

    const confirm = await screen.findByRole('button', { name: 'Confirmar e gerar Pix' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(requestContactUnlock).toHaveBeenCalledTimes(1);

    resolve({ success: true, contactRequestId: 'req-9' } as Awaited<
      ReturnType<typeof requestContactUnlock>
    >);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/solicitacoes/req-9'));
  });

  it('"Agora não" fecha o dialogo sem rastro', async () => {
    getContactRequestCardState.mockResolvedValue({
      state: 'request_available',
      ownRequestId: null,
    });
    openDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Confirmar e gerar Pix' }),
      ).not.toBeInTheDocument(),
    );
    expect(requestContactUnlock).not.toHaveBeenCalled();
  });

  it('falha ao ler o estado informa que nada foi cobrado', async () => {
    getContactRequestCardState.mockRejectedValue(new Error('rede'));
    openDialog();

    expect(await screen.findByRole('alert')).toHaveTextContent('Nada foi cobrado');
  });
});
