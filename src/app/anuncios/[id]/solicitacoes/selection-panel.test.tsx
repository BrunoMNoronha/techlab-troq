import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as negotiationActions from '@/modules/negotiation/actions';
import { SelectionPanel, type CandidateView } from './selection-panel';

// Escolha com confirmacao explicita (F3-012, #102; DEC-032, secao 2). A regra
// (P1 a P7, travas) esta em selection.integration.test.ts; aqui, a tela.

const push = vi.fn();
const refresh = vi.fn();
const router = { push, refresh };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/modules/negotiation/actions', () => ({ chooseRequester: vi.fn() }));

const chooseRequester = vi.mocked(negotiationActions.chooseRequester);
const LISTING_ID = '0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f';
const candidates: CandidateView[] = [
  {
    contactRequestId: '11111111-1111-4111-8111-111111111111',
    requesterDisplayName: 'Ana Sintética',
    paidAtLabel: '05/10/2026, 12:05',
  },
  {
    contactRequestId: '22222222-2222-4222-8222-222222222222',
    requesterDisplayName: 'Bruno Sintético',
    paidAtLabel: '05/10/2026, 12:10',
  },
];

function renderPanel(over: Partial<Parameters<typeof SelectionPanel>[0]> = {}) {
  return render(
    <SelectionPanel
      listingId={LISTING_ID}
      candidates={candidates}
      blocked={false}
      reselection={false}
      {...over}
    />,
  );
}

describe('SelectionPanel (F3-012)', () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    chooseRequester.mockReset();
  });

  it('lista so nome e data do pagamento; o primeiro clique nao escolhe ninguem', () => {
    renderPanel();

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Escolher Ana Sintética' }));

    const group = screen.getByRole('group', { name: 'Confirmar a escolha de Ana Sintética?' });
    expect(group).toHaveTextContent('liberado somente para esta pessoa');
    expect(group).toHaveTextContent('não pode ser desfeita');
    expect(screen.getByRole('heading', { name: /Confirmar a escolha/ })).toHaveFocus();
    expect(chooseRequester).not.toHaveBeenCalled();
  });

  it('cancelar nao chama o servidor', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Escolher Ana Sintética' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('group')).toBeNull();
    expect(chooseRequester).not.toHaveBeenCalled();
  });

  it('confirmar envia confirmed: true para a solicitacao certa, uma vez, e rele a pagina', async () => {
    chooseRequester.mockResolvedValue({
      success: true,
      negotiationId: 'n1',
      kind: 'selection',
      changed: true,
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Escolher Bruno Sintético' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar escolha' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Escolha registrada. Bruno Sintético já pode ver o seu contato.',
    );
    expect(chooseRequester).toHaveBeenCalledTimes(1);
    expect(chooseRequester).toHaveBeenCalledWith({
      listingId: LISTING_ID,
      contactRequestId: candidates[1].contactRequestId,
      confirmed: true,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('recusa do servidor aparece como alerta e a pagina e relida', async () => {
    chooseRequester.mockResolvedValue({
      success: false,
      reason: 'negotiation_active',
      error: 'Já existe uma negociação em andamento neste anúncio.',
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Escolher Ana Sintética' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar escolha' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('negociação em andamento');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(refresh).toHaveBeenCalled();
  });

  it('sessao expirada vai ao login e volta para a tela do anuncio', async () => {
    chooseRequester.mockResolvedValue({
      success: false,
      reason: 'login_required',
      error: 'Entre na sua conta.',
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Escolher Ana Sintética' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar escolha' }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/login?motivo=sessao&next=${encodeURIComponent(`/anuncios/${LISTING_ID}/solicitacoes`)}`,
      ),
    );
  });

  it('bloqueado (negociacao viva, removido, reselecao fora de publicado): sem botao de escolha', () => {
    renderPanel({ blocked: true });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('reselecao avisa que e nova escolha', () => {
    renderPanel({ reselection: true });
    fireEvent.click(screen.getByRole('button', { name: 'Escolher Ana Sintética' }));
    expect(screen.getByRole('group')).toHaveTextContent('reseleção');
  });

  it('sem candidatos: estado vazio', () => {
    renderPanel({ candidates: [] });
    expect(screen.getByText(/Nenhuma solicitação paga disponível/)).toBeInTheDocument();
  });
});
