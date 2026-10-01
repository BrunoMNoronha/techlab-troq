import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as contactModule from '@/modules/contact';
import * as identityModule from '@/modules/identity';
import * as listingModule from '@/modules/listing';
import MeusAnunciosPage from './page';
import EditarAnuncioPage from './[id]/editar/page';

// Superficies privadas de anuncios (#44): estados de "Meus anuncios" e da
// edicao, com o carregamento de dados simulado.
const notFoundError = new Error('NEXT_NOT_FOUND');
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw notFoundError;
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/modules/identity', () => ({
  validateSession: vi.fn(),
  loginRedirectPath: (reason?: string) => `/login?motivo=${reason ?? 'sessao'}`,
}));

vi.mock('@/modules/contact', () => ({ getOwnContactStatus: vi.fn() }));

vi.mock('@/modules/listing', () => ({
  getOwnerListings: vi.fn(),
  getListingForEdit: vi.fn(),
}));

vi.mock('@/modules/listing/actions', () => ({
  createDraftListing: vi.fn(),
  updateListing: vi.fn(),
  publishListing: vi.fn(),
  discardDraft: vi.fn(),
  pauseListing: vi.fn(),
  reactivateListing: vi.fn(),
}));

vi.mock('@/app/anuncios/actions', () => ({
  closeListing: vi.fn(),
}));

const getOwnerListingImages = vi.fn();
vi.mock('@/modules/media/upload', () => ({
  getOwnerListingImages: (...args: unknown[]) => getOwnerListingImages(...args),
}));
vi.mock('@/modules/media/actions', () => ({
  requestImageUpload: vi.fn(),
  requestImageReupload: vi.fn(),
  confirmImageUpload: vi.fn(),
  deleteListingImage: vi.fn(),
  reorderListingImages: vi.fn(),
  getOwnerListingImages: vi.fn(),
}));

const validateSession = vi.mocked(identityModule.validateSession);
const getOwnerListings = vi.mocked(listingModule.getOwnerListings);
const getListingForEdit = vi.mocked(listingModule.getListingForEdit);
const getOwnContactStatus = vi.mocked(contactModule.getOwnContactStatus);

const LISTING_ID = '22222222-2222-4222-8222-222222222222';

function listing(status: listingModule.ListingDTO['status'], title = `Anúncio ${status}`) {
  return {
    id: `${status}-id`,
    title,
    description: 'Descrição sintética',
    city: 'Recife',
    state: 'PE',
    status,
    createdAt: new Date('2026-09-29T12:00:00Z'),
    updatedAt: new Date('2026-09-29T12:00:00Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  validateSession.mockResolvedValue({
    user: {
      id: 'u',
      email: 'u@example.test',
      displayName: 'U',
      emailVerified: true,
      status: 'active',
    },
    isValid: true,
  });
  getOwnContactStatus.mockResolvedValue({ hasContact: true });
});

describe('/anuncios — Meus anúncios', () => {
  it('sem sessao valida redireciona para o login', async () => {
    validateSession.mockResolvedValueOnce({ user: null, isValid: false, reason: 'no_session' });
    await expect(MeusAnunciosPage()).rejects.toThrow('REDIRECT /login');
    expect(getOwnerListings).not.toHaveBeenCalled();
  });

  it('lista os cinco estados; editar so em draft/published/paused, historico nos terminais', async () => {
    getOwnerListings.mockResolvedValueOnce({
      success: true,
      listings: [
        listing('draft'),
        listing('published'),
        listing('paused'),
        listing('closed'),
        listing('removed'),
      ],
    });

    render(await MeusAnunciosPage());

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    const labels = ['Rascunho', 'Publicado', 'Pausado', 'Encerrado', 'Removido'];
    items.forEach((item, i) => expect(item).toHaveTextContent(labels[i]));
    for (const status of ['draft', 'published', 'paused']) {
      expect(screen.getByRole('link', { name: `Editar Anúncio ${status}` })).toHaveAttribute(
        'href',
        `/anuncios/${status}-id/editar`,
      );
    }
    for (const status of ['closed', 'removed']) {
      expect(screen.queryByRole('link', { name: `Editar Anúncio ${status}` })).toBeNull();
      expect(screen.getByRole('link', { name: `Ver histórico de Anúncio ${status}` })).toBeTruthy();
    }
    // Nenhuma acao de ciclo de vida nesta entrega (#48).
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sem contato e com anuncio publicado, orienta o cadastro em /conta (DEC-040)', async () => {
    getOwnContactStatus.mockResolvedValueOnce({ hasContact: false });
    getOwnerListings.mockResolvedValueOnce({
      success: true,
      listings: [listing('draft'), listing('published')],
    });

    render(await MeusAnunciosPage());

    expect(screen.getByRole('status')).toHaveTextContent(/não estão aceitando solicitações/i);
    expect(screen.getByRole('link', { name: 'Cadastrar contato' })).toHaveAttribute(
      'href',
      '/conta',
    );
  });

  it.each([
    ['com contato cadastrado', true, ['published'] as const],
    ['sem anuncio publicado', false, ['draft', 'paused', 'closed'] as const],
  ])('%s, nenhum aviso de contato', async (_c, has, statuses) => {
    getOwnContactStatus.mockResolvedValueOnce({ hasContact: has });
    getOwnerListings.mockResolvedValueOnce({
      success: true,
      listings: statuses.map((status) => listing(status)),
    });

    render(await MeusAnunciosPage());

    expect(screen.queryByText(/não estão aceitando solicitações/i)).toBeNull();
  });

  it('lista vazia fala de anuncios, nao de publicacao', async () => {
    getOwnerListings.mockResolvedValueOnce({ success: true, listings: [] });

    render(await MeusAnunciosPage());

    expect(screen.getByText('Você ainda não tem anúncios')).toBeInTheDocument();
    expect(screen.queryByText(/não publicou/i)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falha de consulta mostra erro, nunca o estado vazio', async () => {
    getOwnerListings.mockResolvedValueOnce({
      success: false,
      reason: 'error',
      error: 'Não foi possível carregar seus anúncios. Tente novamente.',
    });

    render(await MeusAnunciosPage());

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar seus anúncios');
    expect(within(alert).getByRole('link', { name: 'Tentar novamente' })).toBeTruthy();
    expect(screen.queryByText('Você ainda não tem anúncios')).toBeNull();
  });
});

describe('/anuncios/[id]/editar', () => {
  const params = Promise.resolve({ id: LISTING_ID });

  it('anuncio alheio ou inexistente e 404, sem dado nenhum', async () => {
    getListingForEdit.mockResolvedValueOnce({
      success: false,
      reason: 'not_found',
      error: 'Anúncio não encontrado.',
    });

    await expect(EditarAnuncioPage({ params })).rejects.toBe(notFoundError);
  });

  it('erro operacional e distinto de 404 e oferece nova tentativa', async () => {
    getListingForEdit.mockResolvedValueOnce({
      success: false,
      reason: 'error',
      error: 'Não foi possível carregar o anúncio. Tente novamente.',
    });

    render(await EditarAnuncioPage({ params }));

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o anúncio');
    expect(screen.queryByRole('textbox')).toBeNull();
    // Terminal: nenhuma acao de ciclo de vida (closed/removed nao tem saida).
    expect(screen.queryByRole('heading', { name: 'Situação do anúncio' })).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it.each(['draft', 'published', 'paused'] as const)(
    'estado %s abre o formulario preenchido',
    async (status) => {
      getListingForEdit.mockResolvedValueOnce({ success: true, listing: listing(status) });
      getOwnerListingImages.mockResolvedValueOnce({
        success: true,
        data: { listingStatus: status, editable: true, images: [] },
      });

      render(await EditarAnuncioPage({ params }));

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Editar anúncio');
      expect(screen.getByLabelText('Título do anúncio')).toHaveValue(`Anúncio ${status}`);
      expect(screen.getByLabelText('UF')).toHaveValue('PE');
      // Gestao de imagens e situacao do anuncio na area privada (#46, #48).
      expect(screen.getByRole('heading', { name: 'Imagens do anúncio' })).toBeInTheDocument();
      expect(screen.getByLabelText('Adicionar fotos')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Situação do anúncio' })).toBeInTheDocument();
      const actionsByStatus: Record<string, string[]> = {
        draft: ['Publicar anúncio', 'Descartar rascunho'],
        published: ['Pausar anúncio', 'Encerrar anúncio'],
        paused: ['Reativar anúncio', 'Encerrar anúncio'],
      };
      for (const name of actionsByStatus[status]) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument();
      }
      const others = Object.values(actionsByStatus)
        .flat()
        .filter((name) => !actionsByStatus[status].includes(name));
      for (const name of others) expect(screen.queryByRole('button', { name })).toBeNull();
    },
  );

  it.each([
    ['closed', 'encerrado'],
    ['removed', 'removido'],
  ] as const)('estado %s e historico somente leitura', async (status, label) => {
    getListingForEdit.mockResolvedValueOnce({ success: true, listing: listing(status) });

    render(await EditarAnuncioPage({ params }));

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(`Anúncio ${status}`)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByLabelText('Adicionar fotos')).toBeNull();
    expect(getOwnerListingImages).not.toHaveBeenCalled();
  });
});
