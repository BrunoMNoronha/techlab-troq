import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as identity from '@/modules/identity';
import * as listing from '@/modules/listing';
import * as negotiation from '@/modules/negotiation';
import * as reputation from '@/modules/reputation';
import NegociacaoPage from './page';

vi.mock('@/modules/identity', () => ({
  validateSession: vi.fn(),
  loginRedirectPath: () => '/login?motivo=sessao',
}));
vi.mock('@/modules/listing', () => ({ getListingTitles: vi.fn() }));
vi.mock('@/modules/negotiation', () => ({ getOwnNegotiation: vi.fn() }));
vi.mock('@/modules/reputation', () => ({ getOwnRating: vi.fn() }));
vi.mock('@/modules/negotiation/actions', () => ({ closeNegotiation: vi.fn() }));
vi.mock('@/modules/reputation/actions', () => ({ submitRating: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const ID = '11111111-1111-4111-8111-111111111111';
const LISTING = '22222222-2222-4222-8222-222222222222';
const params = { params: Promise.resolve({ id: ID }) };
const privateView: negotiation.OwnNegotiationView = {
  negotiationId: ID,
  listingId: LISTING,
  status: 'active',
  closedAt: null,
  role: 'chosen',
  counterpartDisplayName: 'Ana Sintética',
};

describe('rota privada /negociacoes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(identity.validateSession).mockResolvedValue({
      isValid: true,
      user: {
        id: 'chosen',
        email: 'synthetic@example.test',
        displayName: 'Escolhido',
        emailVerified: true,
        status: 'active',
      },
    });
    vi.mocked(listing.getListingTitles).mockResolvedValue(new Map([[LISTING, 'Bicicleta']]));
    vi.mocked(negotiation.getOwnNegotiation).mockResolvedValue({
      success: true,
      negotiation: privateView,
    });
  });

  it('sem sessão vai ao login com retorno privado, sem consultar o recurso', async () => {
    vi.mocked(identity.validateSession).mockResolvedValue({
      isValid: false,
      user: null,
      reason: 'no_session',
    });
    await expect(NegociacaoPage(params)).rejects.toThrow(
      `NEXT_REDIRECT /login?motivo=sessao&next=${encodeURIComponent(`/negociacoes/${ID}`)}`,
    );
    expect(negotiation.getOwnNegotiation).not.toHaveBeenCalled();
  });

  it('nega inexistente ou alheia com 404 antes de consultar título ou nota', async () => {
    vi.mocked(negotiation.getOwnNegotiation).mockResolvedValue({
      success: false,
      reason: 'not_found',
      error: 'Negociação não encontrada.',
    });
    await expect(NegociacaoPage(params)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(listing.getListingTitles).not.toHaveBeenCalled();
    expect(reputation.getOwnRating).not.toHaveBeenCalled();
  });

  it('falha de banco é apresentada como falha, sem estado ou operação especulativa', async () => {
    vi.mocked(negotiation.getOwnNegotiation).mockResolvedValue({
      success: false,
      reason: 'error',
      error: 'Falha de leitura.',
    });
    render(await NegociacaoPage(params));
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar a negociação');
    expect(screen.getByRole('link', { name: 'Tentar novamente' })).toHaveAttribute(
      'href',
      `/negociacoes/${ID}`,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(reputation.getOwnRating).not.toHaveBeenCalled();
  });

  it('active mostra encerramento para escolhido sem consultar avaliação antes da elegibilidade', async () => {
    render(await NegociacaoPage(params));
    expect(screen.getByRole('link', { name: 'Contatos liberados' })).toHaveAttribute(
      'href',
      '/contatos',
    );
    expect(screen.getByRole('button', { name: 'Encerrar negociação' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(reputation.getOwnRating).not.toHaveBeenCalled();
  });

  it('dono acessa histórico closed e apenas sua própria nota pelo DTO privado', async () => {
    vi.mocked(negotiation.getOwnNegotiation).mockResolvedValue({
      success: true,
      negotiation: {
        ...privateView,
        role: 'owner',
        status: 'closed',
        closedAt: '2026-10-05T15:00:00.000Z',
      },
    });
    vi.mocked(reputation.getOwnRating).mockResolvedValue({
      success: true,
      view: {
        ownRating: {
          score: 4,
          submittedAt: '2026-10-05T16:00:00.000Z',
          published: false,
          validity: 'valid',
        },
        canSubmit: false,
        canEdit: true,
        deadline: '2026-10-19T15:00:00.000Z',
        serverNow: '2026-10-05T16:00:00.000Z',
      },
    });
    render(await NegociacaoPage(params));
    expect(screen.getByRole('link', { name: 'Solicitações do anúncio' })).toHaveAttribute(
      'href',
      `/anuncios/${LISTING}/solicitacoes`,
    );
    expect(screen.getByText('Sua nota: 4 de 5 estrelas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar nova nota' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Encerrar negociação' })).toBeNull();
    expect(reputation.getOwnRating).toHaveBeenCalledWith(ID);
  });

  it('closed com falha na avaliação pede releitura sem habilitar nota', async () => {
    vi.mocked(negotiation.getOwnNegotiation).mockResolvedValue({
      success: true,
      negotiation: { ...privateView, status: 'closed', closedAt: '2026-10-05T15:00:00.000Z' },
    });
    vi.mocked(reputation.getOwnRating).mockResolvedValue({
      success: false,
      reason: 'error',
      error: 'Falha de leitura.',
    });
    render(await NegociacaoPage(params));
    expect(screen.getByRole('alert')).toHaveTextContent('consultar sua avaliação');
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
