import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as contactModule from '@/modules/contact';
import * as identityModule from '@/modules/identity';
import * as listingModule from '@/modules/listing';
import ContatosPage from './page';

vi.mock('@/modules/contact', () => ({ listOwnContactReleases: vi.fn() }));
vi.mock('./actions', () => ({ revealContact: vi.fn() }));
vi.mock('@/modules/identity', () => ({
  validateSession: vi.fn(),
  loginRedirectPath: () => '/login?motivo=sessao',
}));
vi.mock('@/modules/listing', () => ({ getListingTitles: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));

describe('contatos: acesso ao histórico de negociações', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(identityModule.validateSession).mockResolvedValue({
      isValid: true,
      user: {
        id: 'chosen',
        email: 'sintetico@example.test',
        displayName: 'Escolhido',
        emailVerified: true,
        status: 'active',
      },
    });
    vi.mocked(listingModule.getListingTitles).mockResolvedValue(
      new Map([['listing', 'Bicicleta']]),
    );
  });

  it('cada liberação preserva o link da sua negociação, inclusive após reseleção', async () => {
    vi.mocked(contactModule.listOwnContactReleases).mockResolvedValue([
      {
        contactReleaseId: 'release-antiga',
        negotiationId: 'neg-antiga',
        listingId: 'listing',
        authorizedAt: '2026-10-01T15:00:00.000Z',
      },
      {
        contactReleaseId: 'release-nova',
        negotiationId: 'neg-nova',
        listingId: 'listing',
        authorizedAt: '2026-10-05T15:00:00.000Z',
      },
    ]);
    render(await ContatosPage());
    expect(
      screen
        .getAllByRole('link', { name: 'Acompanhar negociação e avaliar' })
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/negociacoes/neg-antiga', '/negociacoes/neg-nova']);
    expect(
      screen.getAllByRole('button', { name: /Ver.*contato|Ver.*telefone|Consultar.*contato/ }),
    ).toHaveLength(2);
  });
});
