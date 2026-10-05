import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as contactModule from '@/modules/contact';
import * as identityModule from '@/modules/identity';
import * as requestModule from '@/modules/request';
import type { OwnContactRequestView } from '@/modules/request';
import SolicitacaoPage from './page';

// Acompanhamento da solicitacao (F3-012, #102): o que cada fase mostra. A
// autorizacao por HTTP real, com o ator nao autorizado, esta em
// request-journey.http.integration.test.ts; a regra, nos testes do modulo.

vi.mock('@/modules/identity', () => ({
  validateSession: vi.fn(),
  loginRedirectPath: (reason?: string) => `/login?motivo=${reason ?? 'sessao'}`,
}));
vi.mock('@/modules/request', () => ({ getOwnContactRequest: vi.fn() }));
vi.mock('@/modules/contact', () => ({ listOwnContactReleases: vi.fn() }));
vi.mock('@/modules/request/actions', () => ({ getPixPayment: vi.fn(() => new Promise(() => {})) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const validateSession = vi.mocked(identityModule.validateSession);
const getOwnContactRequest = vi.mocked(requestModule.getOwnContactRequest);
const listOwnContactReleases = vi.mocked(contactModule.listOwnContactReleases);

const ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const LISTING_ID = '0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f';
const params = { params: Promise.resolve({ id: ID }) };
const user = {
  id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
  email: 'pessoa@example.test',
  displayName: 'Pessoa',
  emailVerified: true,
  status: 'active' as const,
};

function view(over: Partial<OwnContactRequestView> = {}): OwnContactRequestView {
  return {
    contactRequestId: ID,
    listingId: LISTING_ID,
    listingTitle: 'Bicicleta aro 29',
    listingStatus: 'published',
    phase: 'awaiting_payment',
    reservedUntil: '2026-10-05T15:30:00.000Z',
    paidAt: null,
    now: '2026-10-05T15:00:00.000Z',
    ...over,
  };
}

describe('/solicitacoes/[id] (F3-012)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateSession.mockResolvedValue({ user, isValid: true });
    listOwnContactReleases.mockResolvedValue([]);
  });

  it('sem sessao vai ao login e volta para esta solicitacao', async () => {
    validateSession.mockResolvedValue({ user: null, isValid: false, reason: 'no_session' });
    await expect(SolicitacaoPage(params)).rejects.toThrow(
      `NEXT_REDIRECT /login?motivo=no_session&next=${encodeURIComponent(`/solicitacoes/${ID}`)}`,
    );
    expect(getOwnContactRequest).not.toHaveBeenCalled();
  });

  it('solicitacao de outra pessoa, inexistente ou malformada: o mesmo 404', async () => {
    getOwnContactRequest.mockResolvedValue(null);
    await expect(SolicitacaoPage(params)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('aguardando pagamento com anuncio publicado: tela do Pix e acompanhamento', async () => {
    getOwnContactRequest.mockResolvedValue(view());
    render(await SolicitacaoPage(params));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Solicitação de contato');
    expect(screen.getByRole('region', { name: 'Pague R$ 0,99 via Pix' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Já paguei — atualizar situação' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Vaga reservada');
    expect(screen.getByRole('link', { name: 'Bicicleta aro 29' })).toHaveAttribute(
      'href',
      `/explorar/${LISTING_ID}`,
    );
  });

  it('anuncio pausado (PD-6.11): sem Pix, com a vaga e o pagamento ja feito preservados', async () => {
    getOwnContactRequest.mockResolvedValue(view({ listingStatus: 'paused' }));
    render(await SolicitacaoPage(params));

    const notice = screen.getByRole('status', { name: 'Anúncio pausado pelo anunciante' });
    expect(notice).toHaveTextContent('o Pix não é exibido nem gerado de novo');
    expect(notice).toHaveTextContent('Se você já pagou dentro do prazo');
    expect(screen.queryByRole('region', { name: 'Pague R$ 0,99 via Pix' })).toBeNull();
    // Anuncio pausado nao e publico: o titulo nao vira link para o detalhe.
    expect(screen.queryByRole('link', { name: 'Bicicleta aro 29' })).toBeNull();
  });

  it('prazo encerrado ainda em `reserved`: avisa que a confirmacao tempestiva pode chegar', async () => {
    getOwnContactRequest.mockResolvedValue(view({ phase: 'window_closed' }));
    render(await SolicitacaoPage(params));

    const notice = screen.getByRole('status', { name: 'O prazo para pagar terminou' });
    expect(notice).toHaveTextContent('a confirmação ainda pode aparecer aqui');
    expect(notice).toHaveTextContent('é devolvido automaticamente');
    expect(screen.queryByRole('region', { name: 'Pague R$ 0,99 via Pix' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Voltar ao anúncio' })).toBeInTheDocument();
  });

  it.each(['expired', 'failed'] as const)('fase %s: encerrada, vaga liberada', async (phase) => {
    getOwnContactRequest.mockResolvedValue(view({ phase }));
    render(await SolicitacaoPage(params));

    expect(
      screen.getByRole('status', { name: 'Solicitação encerrada sem pagamento confirmado' }),
    ).toHaveTextContent('A vaga foi liberada');
  });

  it('paga e nao escolhida: aguarda a escolha, sem prometer liberacao', async () => {
    getOwnContactRequest.mockResolvedValue(
      view({ phase: 'paid', paidAt: '2026-10-05T15:05:00.000Z' }),
    );
    render(await SolicitacaoPage(params));

    const notice = screen.getByRole('status', { name: 'Pagamento confirmado' });
    expect(notice).toHaveTextContent('Pagar não garante ser escolhido');
    expect(notice).toHaveTextContent('12:05');
    expect(screen.queryByRole('link', { name: 'Ver contato liberado' })).toBeNull();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent(
      'Pagamento confirmado',
    );
  });

  it('paga e escolhida: leva a /contatos, sem o numero nesta pagina', async () => {
    getOwnContactRequest.mockResolvedValue(view({ phase: 'paid' }));
    listOwnContactReleases.mockResolvedValue([
      { contactReleaseId: 'r1', listingId: LISTING_ID, authorizedAt: '2026-10-05T16:00:00.000Z' },
    ]);
    const { container } = render(await SolicitacaoPage(params));

    expect(screen.getByRole('link', { name: 'Ver contato liberado' })).toHaveAttribute(
      'href',
      '/contatos',
    );
    expect(screen.getByText('Escolhida — contato liberado')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/wa\.me|tel:|\+55/);
  });
});
