import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicListingFeedItem } from '@/modules/listing';
import { ListingCard } from './listing-card';

vi.mock('@/modules/request', () => ({ SLOTS_PER_LISTING: 3 }));
vi.mock('@/modules/request/actions', () => ({
  getContactRequestCardState: vi.fn(),
  requestContactUnlock: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const ID = '0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f';

function item(overrides: Partial<PublicListingFeedItem> = {}): PublicListingFeedItem {
  return {
    id: ID,
    title: 'Bicicleta Mountain Bike',
    description: 'Aro 29, revisada.',
    category: 'esportes',
    city: 'Recife',
    state: 'PE',
    tradeOptions: ['Notebook', 'Videogame', 'Câmera'],
    createdAt: new Date('2026-10-01T12:00:00Z'),
    images: [],
    ...overrides,
  };
}

// Card da vitrine (DEC-056): resumo publico do anuncio, vagas livres e
// solicitacao de contato no proprio card, sem dado do dono.
describe('ListingCard', () => {
  it('resume o anuncio: titulo com link, categoria, local e alternativas de troca', () => {
    render(<ListingCard item={item()} freeSlots={2} />);
    const card = screen.getByRole('article');

    expect(within(card).getByRole('link', { name: 'Bicicleta Mountain Bike' })).toHaveAttribute(
      'href',
      `/explorar/${ID}`,
    );
    expect(within(card).getByText('Esportes e lazer', { exact: false })).toBeInTheDocument();
    expect(within(card).getByText('Recife - PE')).toBeInTheDocument();
    const options = within(card)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(options).toEqual(['Notebook', 'Videogame', 'Câmera']);
  });

  it('mostra as vagas livres em texto, alem da barra', () => {
    render(<ListingCard item={item()} freeSlots={2} />);
    const bar = screen.getByRole('progressbar', { name: 'Vagas livres' });
    expect(bar).toHaveAttribute('aria-valuetext', '2 de 3');
    expect(screen.getByText('2 de 3')).toBeInTheDocument();
  });

  it('com vagas, oferece a solicitacao; o nome acessivel diz de qual anuncio', () => {
    render(<ListingCard item={item()} freeSlots={1} />);
    const button = screen.getByRole('button', {
      name: /Solicitar contato · R\$ 0,99 — Bicicleta Mountain Bike/,
    });
    expect(button).toBeEnabled();
  });

  it('sem vagas, o botao fica desabilitado e diz por que', () => {
    render(<ListingCard item={item()} freeSlots={0} />);
    expect(screen.getByRole('button', { name: /Sem vagas no momento/ })).toBeDisabled();
  });

  it('sem a contagem de vagas, omite a barra e mantem a solicitacao', () => {
    render(<ListingCard item={item()} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Solicitar contato/ })).toBeEnabled();
  });

  it('anuncio sem alternativas nao exibe a secao "Aceita em troca"', () => {
    render(<ListingCard item={item({ tradeOptions: [] })} freeSlots={3} />);
    expect(screen.queryByText('Aceita em troca')).not.toBeInTheDocument();
  });

  it('nenhum botao fica dentro de link (sem interativo aninhado)', () => {
    const { container } = render(<ListingCard item={item()} freeSlots={3} />);
    expect(container.querySelector('a button, a [role="button"]')).toBeNull();
  });

  it('nunca carrega telefone nem link de WhatsApp', () => {
    const { container } = render(<ListingCard item={item()} freeSlots={3} />);
    expect(container.textContent).not.toMatch(/\(\d{2}\)\s?\d{4,5}-?\d{4}/);
    expect(container.querySelector('a[href^="https://wa.me"], a[href^="tel:"]')).toBeNull();
  });
});
