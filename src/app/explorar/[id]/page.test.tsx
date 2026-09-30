import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as listingModule from '@/modules/listing';
import * as requestModule from '@/modules/request';
import DetalheAnuncioPublicoPage, { generateMetadata } from './page';

vi.mock('@/modules/listing', () => ({ getPublicListingDetail: vi.fn() }));
vi.mock('@/modules/request', () => ({ getContactRequestEntry: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const getPublicListingDetail = vi.mocked(listingModule.getPublicListingDetail);
const getContactRequestEntry = vi.mocked(requestModule.getContactRequestEntry);

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
  description: 'Bicicleta em ótimo estado.',
  city: 'Campinas',
  state: 'SP',
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
    getContactRequestEntry.mockReset().mockResolvedValue('login_required');
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
    expect(await generateMetadata(params(ID))).toEqual({ title: 'Anúncio indisponível — TROQ' });
  });

  it('metadata usa so titulo, cidade e UF', async () => {
    getPublicListingDetail.mockResolvedValue(listing);
    expect(await generateMetadata(params(ID))).toEqual({
      title: 'Bicicleta aro 29 — TROQ',
      description: 'Campinas - SP',
    });
  });
});
