import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as contactModule from '@/modules/contact';
import * as identityModule from '@/modules/identity';
import * as requestModule from '@/modules/request';
import MinhasSolicitacoesPage from './page';

vi.mock('@/modules/identity', () => ({
  validateSession: vi.fn(),
  loginRedirectPath: (reason?: string) => `/login?motivo=${reason ?? 'sessao'}`,
}));
vi.mock('@/modules/request', () => ({ listOwnContactRequests: vi.fn() }));
vi.mock('@/modules/contact', () => ({ listOwnContactReleases: vi.fn().mockResolvedValue([]) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));

const validateSession = vi.mocked(identityModule.validateSession);
const listOwnContactRequests = vi.mocked(requestModule.listOwnContactRequests);
const user = {
  id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
  email: 'pessoa@example.test',
  displayName: 'Pessoa',
  emailVerified: true,
  status: 'active' as const,
};

describe('/solicitacoes (F3-012)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateSession.mockResolvedValue({ user, isValid: true });
  });

  it('sem sessao vai ao login e volta para a lista', async () => {
    validateSession.mockResolvedValue({ user: null, isValid: false, reason: 'no_session' });
    await expect(MinhasSolicitacoesPage()).rejects.toThrow(
      `NEXT_REDIRECT /login?motivo=no_session&next=${encodeURIComponent('/solicitacoes')}`,
    );
  });

  it('lista as solicitacoes da propria pessoa, com fase e link de acompanhamento', async () => {
    listOwnContactRequests.mockResolvedValue([
      {
        contactRequestId: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
        listingId: '0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f',
        listingTitle: 'Bicicleta aro 29',
        phase: 'awaiting_payment',
        createdAt: '2026-10-05T15:00:00.000Z',
      },
      {
        contactRequestId: '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b',
        listingId: '1c7e3eaf-4d5b-4f9c-8a2b-3e4d5c6b7a8f',
        listingTitle: null,
        phase: 'paid',
        createdAt: '2026-10-04T15:00:00.000Z',
      },
    ]);
    render(await MinhasSolicitacoesPage());

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Aguardando pagamento')).toBeInTheDocument();
    expect(screen.getByText('Paga — aguardando escolha')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Acompanhar a solicitação de Bicicleta aro 29' }),
    ).toHaveAttribute('href', '/solicitacoes/5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a');
    expect(screen.getByText('Anúncio indisponível')).toBeInTheDocument();
  });

  it('paga e escolhida aparece como contato liberado', async () => {
    const listingId = '0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f';
    vi.mocked(contactModule.listOwnContactReleases).mockResolvedValueOnce([
      { contactReleaseId: 'r1', listingId, authorizedAt: '2026-10-05T16:00:00.000Z' },
    ]);
    listOwnContactRequests.mockResolvedValue([
      {
        contactRequestId: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
        listingId,
        listingTitle: 'Bicicleta aro 29',
        phase: 'paid',
        createdAt: '2026-10-05T15:00:00.000Z',
      },
    ]);
    render(await MinhasSolicitacoesPage());
    expect(screen.getByText('Escolhida — contato liberado')).toBeInTheDocument();
  });

  it('sem solicitacoes: estado vazio com caminho para explorar', async () => {
    listOwnContactRequests.mockResolvedValue([]);
    render(await MinhasSolicitacoesPage());

    expect(screen.getByText('Você ainda não fez nenhuma solicitação.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explorar ofertas' })).toHaveAttribute(
      'href',
      '/explorar',
    );
  });
});
