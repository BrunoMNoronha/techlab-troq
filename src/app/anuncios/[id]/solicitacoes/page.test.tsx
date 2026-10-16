import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as identityModule from '@/modules/identity';
import * as listingModule from '@/modules/listing';
import * as negotiationModule from '@/modules/negotiation';
import type { SelectionOptions } from '@/modules/negotiation';
import SolicitacoesDoAnuncioPage from './page';

// Tela do dono (F3-012, #102). Autorizacao por HTTP real com terceiro em
// request-journey.http.integration.test.ts.

vi.mock('@/modules/identity', () => ({
  validateSession: vi.fn(),
  loginRedirectPath: (reason?: string) => `/login?motivo=${reason ?? 'sessao'}`,
}));
vi.mock('@/modules/listing', () => ({ getListingTitles: vi.fn() }));
vi.mock('@/modules/negotiation', () => ({
  getSelectionOptions: vi.fn(),
  listOwnedListingNegotiations: vi.fn(),
}));
vi.mock('@/modules/negotiation/actions', () => ({ chooseRequester: vi.fn() }));
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
const getSelectionOptions = vi.mocked(negotiationModule.getSelectionOptions);
const listOwnedListingNegotiations = vi.mocked(negotiationModule.listOwnedListingNegotiations);
const getListingTitles = vi.mocked(listingModule.getListingTitles);

const ID = '0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f';
const params = { params: Promise.resolve({ id: ID }) };
const user = {
  id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
  email: 'dono@example.test',
  displayName: 'Dono',
  emailVerified: true,
  status: 'active' as const,
};

function options(over: Partial<SelectionOptions> = {}): SelectionOptions {
  return {
    listingStatus: 'published',
    mode: 'selection',
    blockedBy: null,
    activeNegotiation: null,
    candidates: [
      {
        contactRequestId: '11111111-1111-4111-8111-111111111111',
        requesterDisplayName: 'Ana Sintética',
        paidAt: '2026-10-05T15:05:00.000Z',
      },
    ],
    ...over,
  };
}

describe('/anuncios/[id]/solicitacoes (F3-012)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateSession.mockResolvedValue({ user, isValid: true });
    getListingTitles.mockResolvedValue(new Map([[ID, 'Bicicleta aro 29']]));
    listOwnedListingNegotiations.mockResolvedValue({ success: true, negotiations: [] });
  });

  it('sem sessao vai ao login e volta para esta tela', async () => {
    validateSession.mockResolvedValue({ user: null, isValid: false, reason: 'no_session' });
    await expect(SolicitacoesDoAnuncioPage(params)).rejects.toThrow(
      `NEXT_REDIRECT /login?motivo=no_session&next=${encodeURIComponent(`/anuncios/${ID}/solicitacoes`)}`,
    );
    expect(getSelectionOptions).not.toHaveBeenCalled();
  });

  it('anuncio alheio, inexistente ou malformado: o mesmo 404, sem titulo consultado', async () => {
    getSelectionOptions.mockResolvedValue({
      success: false,
      reason: 'not_found',
      error: 'Solicitação não encontrada.',
    });
    await expect(SolicitacoesDoAnuncioPage(params)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getListingTitles).not.toHaveBeenCalled();
  });

  it('dono ve as solicitacoes pagas elegiveis, com data formatada no servidor', async () => {
    getSelectionOptions.mockResolvedValue({ success: true, options: options() });
    render(await SolicitacoesDoAnuncioPage(params));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Solicitações pagas');
    expect(screen.getByText(/Bicicleta aro 29/)).toBeInTheDocument();
    expect(screen.getByText('Ana Sintética')).toBeInTheDocument();
    expect(screen.getByText(/Pagamento confirmado em 05\/10\/2026/)).toHaveTextContent('12:05');
    expect(screen.getByRole('button', { name: 'Escolher Ana Sintética' })).toBeInTheDocument();
    expect(
      screen.getByText(/Interesses gratuitos e reservas ainda não pagas não aparecem/),
    ).toBeVisible();
  });

  it('negociacao em andamento: mostra quem foi escolhido e bloqueia nova escolha', async () => {
    getSelectionOptions.mockResolvedValue({
      success: true,
      options: options({
        blockedBy: 'negotiation_active',
        activeNegotiation: { negotiationId: 'n1', chosenDisplayName: 'Carla Sintética' },
      }),
    });
    render(await SolicitacoesDoAnuncioPage(params));

    expect(screen.getByRole('status', { name: 'Negociação em andamento' })).toHaveTextContent(
      'Você escolheu Carla Sintética',
    );
    expect(screen.queryByRole('button', { name: /Escolher/ })).toBeNull();
  });

  it('reselecao com anuncio pausado: explica que precisa estar publicado', async () => {
    getSelectionOptions.mockResolvedValue({
      success: true,
      options: options({
        listingStatus: 'paused',
        mode: 'reselection',
        blockedBy: 'listing_not_published',
      }),
    });
    render(await SolicitacoesDoAnuncioPage(params));

    expect(screen.getByText(/precisa estar publicado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Escolher/ })).toBeNull();
  });

  it('falha de leitura: alerta sem dado do anuncio', async () => {
    getSelectionOptions.mockResolvedValue({ success: false, reason: 'error', error: 'x' });
    render(await SolicitacoesDoAnuncioPage(params));

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar');
    expect(getListingTitles).not.toHaveBeenCalled();
  });

  it('historico inclui negociação encerrada após reseleção com link privado', async () => {
    getSelectionOptions.mockResolvedValue({ success: true, options: options() });
    listOwnedListingNegotiations.mockResolvedValue({
      success: true,
      negotiations: [
        {
          negotiationId: 'n-antiga',
          listingId: ID,
          status: 'closed',
          closedAt: '2026-10-05T15:00:00.000Z',
          role: 'owner',
          counterpartDisplayName: 'Carla Sintética',
        },
      ],
    });
    render(await SolicitacoesDoAnuncioPage(params));
    expect(screen.getByRole('heading', { name: 'Histórico de negociações' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver negociação' })).toHaveAttribute(
      'href',
      '/negociacoes/n-antiga',
    );
    expect(screen.getByText(/Encerrada em/)).toHaveTextContent('05/10/2026');
  });

  it('falha do historico não se apresenta como lista vazia', async () => {
    getSelectionOptions.mockResolvedValue({ success: true, options: options() });
    listOwnedListingNegotiations.mockResolvedValue({
      success: false,
      reason: 'error',
      error: 'Falha de leitura.',
    });
    render(await SolicitacoesDoAnuncioPage(params));
    expect(screen.getByRole('alert')).toHaveTextContent('carregar o histórico');
  });
});
