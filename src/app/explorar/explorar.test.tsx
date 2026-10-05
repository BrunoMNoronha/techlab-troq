import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as listingModule from '@/modules/listing';
import { explorarHref, readExplorarQuery } from './explorar-query';
import { ExplorarResults } from './explorar-results';
import ExplorarPage from './page';

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
    createdAt: new Date('2026-09-29T12:00:00.000Z'),
    images: [],
  };
}

function feed(total: number, page: number, count: number) {
  return {
    listings: Array.from({ length: count }, (_, i) => offer(`id-${page}-${i}`, `Oferta ${i}`)),
    total,
    page,
    limit: 20,
  };
}

// /explorar (listing-contract.md, 9.1 e 11; D-12). Consulta simulada: a
// consulta real e o HTTP estao nas suites de integracao.
describe('leitura da URL e links de /explorar', () => {
  it('le page, city e state; limit nao e lido da URL', () => {
    expect(readExplorarQuery({ page: '3', city: '  Recife ', state: ' pe', limit: '50' })).toEqual({
      page: 3,
      city: 'Recife',
      state: 'PE',
    });
  });

  it('page invalida vira 1; arrays usam o primeiro valor', () => {
    expect(readExplorarQuery({ page: ['x', '2'] }).page).toBe(1);
    expect(readExplorarQuery({ page: '-3' }).page).toBe(1);
    expect(readExplorarQuery({ city: ['Olinda', 'Recife'] }).city).toBe('Olinda');
  });

  it('links preservam os filtros e omitem pagina 1 e filtros vazios', () => {
    expect(explorarHref({ page: 1, city: '', state: '' })).toBe('/explorar');
    expect(explorarHref({ page: 2, city: 'São Paulo', state: 'SP' })).toBe(
      '/explorar?city=S%C3%A3o+Paulo&state=SP&page=2',
    );
  });
});

describe('ExplorarResults', () => {
  beforeEach(() => {
    getPublicFeed.mockReset();
  });

  it('consulta com a pagina e os filtros da URL, sem limit', async () => {
    getPublicFeed.mockResolvedValueOnce(feed(0, 2, 0));
    await ExplorarResults({ query: { page: 2, city: 'Recife', state: 'PE' } });
    expect(getPublicFeed).toHaveBeenCalledWith({ page: 2, city: 'Recife', state: 'PE' });
  });

  it('pagina com links anterior/proxima que preservam o filtro e marca a atual', async () => {
    getPublicFeed.mockResolvedValueOnce(feed(45, 2, 20));
    render(await ExplorarResults({ query: { page: 2, city: 'Recife', state: 'PE' } }));

    const nav = screen.getByRole('navigation', { name: 'Paginação' });
    expect(within(nav).getByRole('link', { name: /anterior/i })).toHaveAttribute(
      'href',
      '/explorar?city=Recife&state=PE',
    );
    expect(within(nav).getByRole('link', { name: /próxima/i })).toHaveAttribute(
      'href',
      '/explorar?city=Recife&state=PE&page=3',
    );
    expect(within(nav).getByText('Página 2 de 3')).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link', { name: /oferta/i })).toHaveLength(20);
  });

  it('primeira e ultima pagina nao oferecem link para fora do intervalo', async () => {
    getPublicFeed.mockResolvedValueOnce(feed(25, 1, 20));
    render(await ExplorarResults({ query: { page: 1, city: '', state: '' } }));
    const nav = screen.getByRole('navigation', { name: 'Paginação' });
    expect(within(nav).queryByRole('link', { name: /anterior/i })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /próxima/i })).toHaveAttribute(
      'href',
      '/explorar?page=2',
    );
  });

  it('uma unica pagina nao mostra paginacao', async () => {
    getPublicFeed.mockResolvedValueOnce(feed(3, 1, 3));
    render(await ExplorarResults({ query: { page: 1, city: '', state: '' } }));
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('vazio sem filtro nao inventa ofertas', async () => {
    getPublicFeed.mockResolvedValueOnce(feed(0, 1, 0));
    render(await ExplorarResults({ query: { page: 1, city: '', state: '' } }));
    expect(screen.getByRole('status')).toHaveTextContent(/ainda não há anúncios publicados/i);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('vazio com filtro sugere remover o filtro', async () => {
    getPublicFeed.mockResolvedValueOnce(feed(0, 1, 0));
    render(await ExplorarResults({ query: { page: 1, city: 'Olinda', state: '' } }));
    expect(screen.getByRole('status')).toHaveTextContent(/nenhum anúncio encontrado/i);
    expect(screen.getByRole('link', { name: /remover o filtro/i })).toHaveAttribute(
      'href',
      '/explorar',
    );
  });

  it('pagina alem da ultima informa o total e leva a ultima pagina', async () => {
    getPublicFeed.mockResolvedValueOnce(feed(45, 9, 0));
    render(await ExplorarResults({ query: { page: 9, city: '', state: '' } }));
    expect(screen.getByRole('status')).toHaveTextContent(/45 anúncio\(s\) em 3 página\(s\)/);
    expect(screen.getByRole('link', { name: /última página/i })).toHaveAttribute(
      'href',
      '/explorar?page=3',
    );
  });

  it('erro de carregamento oferece nova tentativa sem vazar detalhe interno', async () => {
    getPublicFeed.mockRejectedValueOnce(new Error('connection refused postgres://segredo'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = render(
      await ExplorarResults({ query: { page: 2, city: 'Recife', state: '' } }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/não foi possível carregar/i);
    expect(screen.getByRole('link', { name: 'Tentar novamente' })).toHaveAttribute(
      'href',
      '/explorar?city=Recife&page=2',
    );
    expect(container.innerHTML).not.toMatch(/postgres|segredo/);
  });
});

describe('ExplorarPage', () => {
  it('formulario GET com rotulos associados e valores da URL', async () => {
    render(await ExplorarPage({ searchParams: Promise.resolve({ city: 'Recife', state: 'pe' }) }));
    const form = screen.getByRole('search', { name: /filtrar/i });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/explorar');
    expect(screen.getByLabelText('Cidade')).toHaveValue('Recife');
    expect(screen.getByLabelText('UF')).toHaveValue('PE');
    expect(screen.getByRole('link', { name: 'Limpar filtro' })).toHaveAttribute(
      'href',
      '/explorar',
    );
  });

  it('sem filtro nao mostra o link de limpar', async () => {
    render(await ExplorarPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole('link', { name: 'Limpar filtro' })).not.toBeInTheDocument();
  });

  it('UF por lista (#90): "Todos os estados" sem filtro e as 27 UFs', async () => {
    render(await ExplorarPage({ searchParams: Promise.resolve({}) }));
    const select = screen.getByRole('combobox', { name: 'UF' });
    const opts = within(select).getAllByRole('option');
    expect(select).toHaveValue('');
    expect(opts[0]).toHaveTextContent('Todos os estados');
    expect(opts).toHaveLength(28);
    expect(within(select).getByRole('option', { name: 'Pernambuco (PE)' })).toHaveValue('PE');
  });

  it('UF inexistente na URL continua no formulario como invalida, sem virar outra UF', async () => {
    render(await ExplorarPage({ searchParams: Promise.resolve({ state: 'zz' }) }));
    const select = screen.getByRole('combobox', { name: 'UF' });
    expect(select).toHaveValue('ZZ');
    expect(within(select).getByRole('option', { name: 'UF inválida (ZZ)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Limpar filtro' })).toBeInTheDocument();
  });
});
