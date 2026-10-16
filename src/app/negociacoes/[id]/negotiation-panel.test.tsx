import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as negotiationActions from '@/modules/negotiation/actions';
import * as reputationActions from '@/modules/reputation/actions';
import { NegotiationPanel, type NegotiationPanelProps } from './negotiation-panel';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('@/modules/negotiation/actions', () => ({ closeNegotiation: vi.fn() }));
vi.mock('@/modules/reputation/actions', () => ({ submitRating: vi.fn() }));

const closeNegotiation = vi.mocked(negotiationActions.closeNegotiation);
const submitRating = vi.mocked(reputationActions.submitRating);
const ID = '11111111-1111-4111-8111-111111111111';
const negotiation: NegotiationPanelProps['negotiation'] = {
  negotiationId: ID,
  listingId: '22222222-2222-4222-8222-222222222222',
  status: 'active',
  closedAt: null,
  role: 'chosen',
  counterpartDisplayName: 'Ana Sintética',
};
const rating: NonNullable<NegotiationPanelProps['rating']> = {
  ownRating: null,
  canSubmit: true,
  canEdit: false,
  deadline: '2026-10-19T15:00:00.000Z',
  serverNow: '2026-10-05T15:00:00.000Z',
};

function renderPanel(props: Partial<NegotiationPanelProps> = {}) {
  return render(<NegotiationPanel negotiation={negotiation} rating={null} {...props} />);
}
function renderClosed(view = rating) {
  return renderPanel({
    negotiation: { ...negotiation, status: 'closed', closedAt: rating.serverNow },
    rating: view,
  });
}

describe('NegotiationPanel: encerramento e avaliacao (#163/#164)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeNegotiation.mockReset();
    submitRating.mockReset();
  });

  it('active nao permite avaliar; abertura e cancelamento da confirmacao nao chamam action', () => {
    renderPanel();
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar negociação' }));
    expect(screen.getByRole('heading', { name: 'Confirmar o encerramento?' })).toHaveFocus();
    expect(screen.getByRole('group')).toHaveTextContent('não poderá ser reaberta');
    expect(screen.getByRole('group')).toHaveTextContent(
      'O anúncio, o pagamento, as vagas e o contato',
    );
    expect(closeNegotiation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('group')).toBeNull();
    expect(closeNegotiation).not.toHaveBeenCalled();
    expect(submitRating).not.toHaveBeenCalled();
  });

  it('só o segundo gesto encerra com confirmed true; duplo clique não duplica pedido', async () => {
    let complete!: (result: Awaited<ReturnType<typeof closeNegotiation>>) => void;
    closeNegotiation.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar negociação' }));
    const button = screen.getByRole('button', { name: 'Confirmar encerramento' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(closeNegotiation).toHaveBeenCalledTimes(1);
    expect(closeNegotiation).toHaveBeenCalledWith({ negotiationId: ID, confirmed: true });
    expect(button).toBeDisabled();
    complete({ success: true, negotiationId: ID, closedAt: rating.serverNow, changed: true });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Negociação encerrada');
    await waitFor(() => expect(status).toHaveFocus());
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Encerrar negociação' })).toBeNull();
  });

  it('sessão expirada redireciona para login com retorno privado', async () => {
    closeNegotiation.mockResolvedValue({
      success: false,
      reason: 'login_required',
      error: 'Entre na sua conta.',
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar negociação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/login?motivo=sessao&next=${encodeURIComponent(`/negociacoes/${ID}`)}`,
      ),
    );
  });

  it('recusa do servidor mostra motivo seguro e atualiza a leitura', async () => {
    closeNegotiation.mockResolvedValue({
      success: false,
      reason: 'account_restricted',
      error: 'Sua conta não pode acessar a negociação.',
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar negociação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sua conta não pode');
    expect(refresh).toHaveBeenCalled();
  });

  it('resposta perdida exige releitura antes de repetir; não promete ausência de efeito', async () => {
    closeNegotiation.mockRejectedValue(new Error('network'));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar negociação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível confirmar o resultado',
    );
    expect(screen.getByRole('link', { name: 'Atualizar negociação' })).toHaveAttribute(
      'href',
      `/negociacoes/${ID}`,
    );
    expect(screen.getByRole('button', { name: 'Confirmar encerramento' })).toBeDisabled();
    expect(closeNegotiation).toHaveBeenCalledTimes(1);
  });

  it('closed mostra prazo e nota inteira obrigatória, sem novo encerramento', () => {
    renderClosed();
    expect(screen.queryByRole('button', { name: 'Encerrar negociação' })).toBeNull();
    expect(screen.getByText(/Prazo para avaliar/)).toHaveTextContent('19/10/2026');
    expect(screen.getByLabelText('Sua nota sobre Ana Sintética')).toBeRequired();
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Enviar avaliação' })).toBeDisabled();
    expect(submitRating).not.toHaveBeenCalled();
  });

  it('envia apenas identificador e nota escolhida após submit; releitura não revela nota alheia', async () => {
    submitRating.mockResolvedValue({ success: true, changed: true, published: false });
    renderClosed();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    expect(await screen.findByRole('status')).toHaveTextContent('A nota permanece protegida');
    expect(submitRating).toHaveBeenCalledWith({ negotiationId: ID, score: 4 });
    expect(refresh).toHaveBeenCalled();
  });

  it('nota própria não publicada permite substituição; contraparte não é exibida', () => {
    renderClosed({
      ...rating,
      canSubmit: false,
      canEdit: true,
      ownRating: { score: 3, submittedAt: rating.serverNow, published: false, validity: 'valid' },
    });
    expect(screen.getByText('Sua nota: 3 de 5 estrelas.')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('3');
    expect(screen.getByRole('button', { name: 'Salvar nova nota' })).toBeInTheDocument();
    expect(screen.queryByText(/Nota recebida/)).toBeNull();
  });

  it('publicação após segunda submissão comunica imutabilidade', async () => {
    submitRating.mockResolvedValue({ success: true, changed: true, published: true });
    renderClosed();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    expect(await screen.findByRole('status')).toHaveTextContent('registrada e publicada');
    expect(refresh).toHaveBeenCalled();
  });

  it('janela vencida durante formulário aberto segue recusa autoritativa do servidor', async () => {
    submitRating.mockResolvedValue({
      success: false,
      reason: 'window_closed',
      error: 'O prazo de 14 dias para avaliar esta negociação terminou.',
    });
    renderClosed();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('prazo de 14 dias');
    expect(refresh).toHaveBeenCalled();
  });

  it.each(['valid', 'invalidated'] as const)(
    'nota terminal %s nunca oferece edição',
    (validity) => {
      renderClosed({
        ...rating,
        canSubmit: false,
        canEdit: false,
        ownRating: { score: 2, submittedAt: rating.serverNow, published: true, validity },
      });
      expect(screen.queryByRole('combobox')).toBeNull();
      expect(
        screen.queryByRole('button', { name: /Enviar avaliação|Salvar nova nota/ }),
      ).toBeNull();
      expect(
        screen.getByText(validity === 'invalidated' ? /foi invalidada/ : /está publicada/),
      ).toBeInTheDocument();
    },
  );

  it('janela sem avaliação encerrada comunica ausência sem inventar nota', () => {
    renderClosed({ ...rating, canSubmit: false });
    expect(screen.getByText(/Nenhuma nota foi registrada por você/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('falha de leitura de avaliação mostra recarga, sem formulário especulativo', () => {
    renderPanel({ negotiation: { ...negotiation, status: 'closed', closedAt: rating.serverNow } });
    expect(screen.getByRole('alert')).toHaveTextContent('consultar sua avaliação');
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
