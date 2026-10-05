import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as listingModule from '@/modules/listing';
import HomePage from './page';
import { HOME_OFFERS_LIMIT, LatestOffers } from './_components/latest-offers';

vi.mock('@/modules/listing', () => ({ getPublicFeed: vi.fn() }));

const getPublicFeed = vi.mocked(listingModule.getPublicFeed);

function offer(id: string, title: string) {
  return {
    id,
    title,
    category: 'esportes',
    description: `Descrição de ${title}`,
    city: 'Recife',
    state: 'PE',
    createdAt: new Date('2026-09-29T12:00:00Z'),
    images: [],
  };
}

describe('HomePage', () => {
  it('apresenta o TROQS e leva a explorar e criar conta sem exigir login', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/contato protegido/i);
    expect(screen.getAllByRole('link', { name: /Explorar ofertas/ })[0]).toHaveAttribute(
      'href',
      '/explorar',
    );
    expect(screen.getByRole('link', { name: 'Criar conta grátis' })).toHaveAttribute(
      'href',
      '/cadastro',
    );
  });

  it('explica interesse gratuito, solicitação paga de R$ 0,99, limite de três e não reembolso', () => {
    render(<HomePage />);

    const section = screen.getByRole('region', { name: 'Como funciona o contato' });
    expect(section).toHaveTextContent(/interesse é gratuito/i);
    expect(section).toHaveTextContent('R$ 0,99');
    expect(section).toHaveTextContent(/três solicitações pagas/i);
    expect(section).toHaveTextContent(/pagar não garante ser escolhido/i);
    expect(section).toHaveTextContent(/não há reembolso por não ser escolhido/i);
  });

  it('leva à Política de Privacidade e aos Termos de Uso públicos', () => {
    render(<HomePage />);

    const privacy = screen.getByRole('region', { name: 'Seu contato fica com você' });
    expect(within(privacy).getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    );
    expect(within(privacy).getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute(
      'href',
      '/termos',
    );
  });

  it('não contém mais a linguagem de scaffold', () => {
    const { container } = render(<HomePage />);

    expect(container).not.toHaveTextContent(/fundação técnica|nenhuma funcionalidade/i);
  });
});

describe('LatestOffers', () => {
  beforeEach(() => {
    getPublicFeed.mockReset();
  });

  it('consulta a primeira página do feed público com o limite da home', async () => {
    getPublicFeed.mockResolvedValueOnce({
      listings: [],
      total: 0,
      page: 1,
      limit: HOME_OFFERS_LIMIT,
    });

    render(await LatestOffers());

    expect(getPublicFeed).toHaveBeenCalledWith({ page: 1, limit: HOME_OFFERS_LIMIT });
  });

  it('lista ofertas reais com link para o detalhe público', async () => {
    getPublicFeed.mockResolvedValueOnce({
      listings: [offer('a1', 'Bicicleta aro 29'), offer('b2', 'Mesa de madeira')],
      total: 2,
      page: 1,
      limit: HOME_OFFERS_LIMIT,
    });

    render(await LatestOffers());

    expect(screen.getByRole('link', { name: /Bicicleta aro 29/ })).toHaveAttribute(
      'href',
      '/explorar/a1',
    );
    expect(screen.getByRole('link', { name: /Mesa de madeira/ })).toHaveAttribute(
      'href',
      '/explorar/b2',
    );
    expect(screen.queryByText(/Ver todas as/)).not.toBeInTheDocument();
  });

  it('oferece a página completa quando há mais ofertas que o limite da home', async () => {
    getPublicFeed.mockResolvedValueOnce({
      listings: [offer('a1', 'Bicicleta')],
      total: 30,
      page: 1,
      limit: HOME_OFFERS_LIMIT,
    });

    render(await LatestOffers());

    expect(screen.getByRole('link', { name: 'Ver todas as 30 ofertas' })).toHaveAttribute(
      'href',
      '/explorar',
    );
  });

  it('mostra estado vazio sem inventar ofertas', async () => {
    getPublicFeed.mockResolvedValueOnce({
      listings: [],
      total: 0,
      page: 1,
      limit: HOME_OFFERS_LIMIT,
    });

    render(await LatestOffers());

    expect(screen.getByRole('status')).toHaveTextContent(/ainda não há ofertas publicadas/i);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('mostra estado de erro sem expor detalhes internos', async () => {
    getPublicFeed.mockRejectedValueOnce(new Error('connection refused postgres://segredo'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(await LatestOffers());

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/não foi possível carregar as ofertas/i);
    expect(alert).not.toHaveTextContent(/postgres|segredo/);
  });
});
