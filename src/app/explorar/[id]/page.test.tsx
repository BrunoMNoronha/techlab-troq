import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as listingModule from '@/modules/listing';
import * as requestModule from '@/modules/request';
import DetalheAnuncioPublicoPage, { generateMetadata } from './page';

vi.mock('@/modules/listing', () => ({ getPublicListingDetail: vi.fn() }));
vi.mock('@/modules/request', () => ({ getContactRequestEntryView: vi.fn() }));
vi.mock('@/modules/request/actions', () => ({ requestContactUnlock: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const getPublicListingDetail = vi.mocked(listingModule.getPublicListingDetail);
const getContactRequestEntry = vi.mocked(requestModule.getContactRequestEntryView);

const ID = '0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f';

function derivatives(imageId: string) {
  return [
    { kind: 'large' as const, url: `/media/${imageId}/large`, width: 1600, height: 1200 },
    { kind: 'thumb' as const, url: `/media/${imageId}/thumb`, width: 320, height: 240 },
    { kind: 'medium' as const, url: `/media/${imageId}/medium`, width: 768, height: 576 },
  ];
}

const listing = {
  id: ID,
  title: 'Bicicleta aro 29',
  category: 'esportes',
  description: 'Bicicleta em ótimo estado.',
  city: 'Campinas',
  state: 'SP',
  tradeOptions: ['Um notebook', 'Um videogame', 'Uma câmera'],
  createdAt: new Date('2026-09-29T12:00:00.000Z'),
  images: [
    { id: 'img-1', position: 1, derivatives: derivatives('img-1') },
    { id: 'img-2', position: 2, derivatives: derivatives('img-2') },
    { id: 'img-3', position: 3, derivatives: derivatives('img-3') },
  ],
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

// Detalhe publico (listing-contract.md, 9.4 e 11). O 404 por HTTP real esta na
// prova de superficie publica (public-surface.http.integration.test.ts).
describe('detalhe publico /explorar/[id]', () => {
  beforeEach(() => {
    getPublicListingDetail.mockReset();
    getContactRequestEntry
      .mockReset()
      .mockResolvedValue({ state: 'login_required', ownRequestId: null });
  });

  it('mostra todas as imagens prontas, na ordem, com dimensoes, srcset e alt posicional', async () => {
    getPublicListingDetail.mockResolvedValue(listing);
    render(await DetalheAnuncioPublicoPage(params(ID)));

    const gallery = screen.getByRole('list', { name: 'Imagens do anúncio' });
    const images = within(gallery).getAllByRole('img');
    expect(images.map((img) => img.getAttribute('alt'))).toEqual([
      'Imagem 1 de 3: Bicicleta aro 29',
      'Imagem 2 de 3: Bicicleta aro 29',
      'Imagem 3 de 3: Bicicleta aro 29',
    ]);
    expect(images[0]).toHaveAttribute('src', '/media/img-1/large');
    expect(images[0]).toHaveAttribute('width', '1600');
    expect(images[0]).toHaveAttribute('height', '1200');
    expect(images[1]).toHaveAttribute('src', '/media/img-2/medium');
    expect(images[1]).toHaveAttribute('loading', 'lazy');
    expect(images[0].getAttribute('srcset')).toBe(
      '/media/img-1/thumb 320w, /media/img-1/medium 768w, /media/img-1/large 1600w',
    );
    for (const img of images) {
      expect(img.getAttribute('src')).toMatch(/^\/media\//);
    }
  });

  it('sem imagem pronta mostra o espaco reservado, sem img', async () => {
    getPublicListingDetail.mockResolvedValue({ ...listing, images: [] });
    render(await DetalheAnuncioPublicoPage(params(ID)));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('anuncio indisponivel e 404, com metadata generica', async () => {
    getPublicListingDetail.mockResolvedValue(null);
    await expect(DetalheAnuncioPublicoPage(params(ID))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getContactRequestEntry).not.toHaveBeenCalled();
    expect(await generateMetadata(params(ID))).toEqual({ title: 'Anúncio indisponível — TROQS' });
  });

  it('mostra as tres alternativas de troca como texto, na ordem, sem login (#76)', async () => {
    const injected = '<img src=x onerror="alert(1)"> um rádio';
    getPublicListingDetail.mockResolvedValue({
      ...listing,
      tradeOptions: ['Um notebook', injected, 'Uma câmera'],
    });
    render(await DetalheAnuncioPublicoPage(params(ID)));

    const section = screen.getByRole('region', { name: 'Aceita em troca' });
    expect(section).toHaveTextContent('não é preciso oferecer todas');
    const items = within(section).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Um notebook', injected, 'Uma câmera']);
    // Texto livre e sempre texto (listing-contract.md, secao 10): nada vira HTML.
    expect(within(section).queryByRole('img')).toBeNull();
  });

  it('anuncio anterior a #76, ainda sem alternativas, nao mostra a secao', async () => {
    getPublicListingDetail.mockResolvedValue({ ...listing, tradeOptions: [] });
    render(await DetalheAnuncioPublicoPage(params(ID)));
    expect(screen.queryByRole('region', { name: 'Aceita em troca' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bicicleta aro 29');
  });

  it('quem ja tem solicitacao aberta e levado a ela, sem nova solicitacao (F3-012)', async () => {
    const OWN = '7c6b5a49-3827-4615-8a9b-0c1d2e3f4a5b';
    getPublicListingDetail.mockResolvedValue(listing);
    getContactRequestEntry.mockResolvedValue({ state: 'own_request', ownRequestId: OWN });
    render(await DetalheAnuncioPublicoPage(params(ID)));

    expect(screen.getByRole('link', { name: 'Acompanhar minha solicitação' })).toHaveAttribute(
      'href',
      `/solicitacoes/${OWN}`,
    );
    expect(screen.queryByRole('button', { name: 'Tenho interesse' })).toBeNull();
  });

  it('elegivel ve "Tenho interesse"; o anuncio indisponivel nem chega a abrir a jornada', async () => {
    getPublicListingDetail.mockResolvedValue(listing);
    getContactRequestEntry.mockResolvedValue({ state: 'request_available', ownRequestId: null });
    render(await DetalheAnuncioPublicoPage(params(ID)));
    expect(screen.getByRole('button', { name: 'Tenho interesse' })).toBeInTheDocument();
  });

  it('metadata usa so titulo, cidade e UF', async () => {
    getPublicListingDetail.mockResolvedValue(listing);
    expect(await generateMetadata(params(ID))).toEqual({
      title: 'Bicicleta aro 29 — TROQS',
      description: 'Campinas - SP',
    });
  });
});
