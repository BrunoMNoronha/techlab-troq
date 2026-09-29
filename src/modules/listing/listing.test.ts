import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDraftListing, updateListing, getOwnerListings, getListingForEdit } from './actions';
import * as identityModule from '@/modules/identity';
import * as prismaModule from '@/persistence/prisma';

describe('modulo listing — rascunhos, edicao e meus anuncios (#44 / F2-006)', () => {
  const userId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDraftListing', () => {
    it('rejeita criacao se o usuario nao estiver autenticado ou verificado', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        user: null,
        isValid: false,
        reason: 'no_session',
      });

      const res = await createDraftListing({
        title: 'Bicicleta Caloi Aro 29',
        description: 'Bicicleta em bom estado',
        city: 'São Paulo',
        state: 'SP',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('autenticado');
    });

    it('rejeita titulo invalido (< 5 caracteres)', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        user: {
          id: userId,
          email: 'user@troq.app',
          displayName: 'User',
          emailVerified: true,
          status: 'active',
        },
        isValid: true,
      });

      const res = await createDraftListing({
        title: 'Bike',
        description: 'Bicicleta em bom estado',
        city: 'São Paulo',
        state: 'SP',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('título');
    });

    it('cria anuncio no status draft com sucesso', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        user: {
          id: userId,
          email: 'user@troq.app',
          displayName: 'User',
          emailVerified: true,
          status: 'active',
        },
        isValid: true,
      });

      const mockCreate = vi.fn().mockResolvedValueOnce({
        id: 'listing-100',
        ownerId: userId,
        title: 'Bicicleta Caloi Aro 29',
        status: 'draft',
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { create: mockCreate },
      } as unknown as prismaModule.PrismaClient);

      const res = await createDraftListing({
        title: 'Bicicleta Caloi Aro 29',
        description: 'Bicicleta em excelente estado',
        city: 'São Paulo',
        state: 'SP',
      });

      expect(res.success).toBe(true);
      expect(res.listingId).toBe('listing-100');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ownerId: userId,
            title: 'Bicicleta Caloi Aro 29',
            status: 'draft',
          }),
        }),
      );
    });
  });

  describe('updateListing', () => {
    it('rejeita edicao por usuario que nao seja o proprietario (IDOR)', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        user: {
          id: 'other-user-id',
          email: 'other@troq.app',
          displayName: 'Other',
          emailVerified: true,
          status: 'active',
        },
        isValid: true,
      });

      const mockFindUnique = vi.fn().mockResolvedValueOnce({
        id: 'listing-200',
        ownerId: userId,
        status: 'draft',
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
      } as unknown as prismaModule.PrismaClient);

      const res = await updateListing('listing-200', { title: 'Novo Título Válido' });
      expect(res.success).toBe(false);
      expect(res.error).toContain('permissão');
    });

    it('rejeita edicao de anuncio em estado terminal (closed / removed)', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        user: {
          id: userId,
          email: 'user@troq.app',
          displayName: 'User',
          emailVerified: true,
          status: 'active',
        },
        isValid: true,
      });

      const mockFindUnique = vi.fn().mockResolvedValueOnce({
        id: 'listing-300',
        ownerId: userId,
        status: 'closed',
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
      } as unknown as prismaModule.PrismaClient);

      const res = await updateListing('listing-300', { title: 'Novo Título Válido' });
      expect(res.success).toBe(false);
      expect(res.error).toContain('encerrados ou removidos');
    });

    it('atualiza rascunho com sucesso', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        user: {
          id: userId,
          email: 'user@troq.app',
          displayName: 'User',
          emailVerified: true,
          status: 'active',
        },
        isValid: true,
      });

      const mockFindUnique = vi.fn().mockResolvedValueOnce({
        id: 'listing-400',
        ownerId: userId,
        status: 'draft',
      });
      const mockUpdate = vi.fn().mockResolvedValueOnce({});

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique, update: mockUpdate },
      } as unknown as prismaModule.PrismaClient);

      const res = await updateListing('listing-400', { title: 'Título Atualizado com Sucesso' });
      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'listing-400' },
          data: { title: 'Título Atualizado com Sucesso' },
        }),
      );
    });
  });

  describe('getOwnerListings', () => {
    it('retorna os anuncios pertencentes ao usuario autenticado', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        user: {
          id: userId,
          email: 'user@troq.app',
          displayName: 'User',
          emailVerified: true,
          status: 'active',
        },
        isValid: true,
      });

      const mockFindMany = vi.fn().mockResolvedValueOnce([
        {
          id: 'listing-1',
          title: 'Anúncio 1',
          description: 'Desc 1',
          city: 'São Paulo',
          uf: 'SP',
          status: 'draft',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findMany: mockFindMany },
      } as unknown as prismaModule.PrismaClient);

      const res = await getOwnerListings();
      expect(res.success).toBe(true);
      expect(res.listings).toHaveLength(1);
      expect(res.listings?.[0].title).toBe('Anúncio 1');
      expect(res.listings?.[0].state).toBe('SP');
    });
  });

  describe('getListingForEdit', () => {
    it('bloqueia consulta de edicao para terceiros', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        user: {
          id: 'hacker-id',
          email: 'hacker@troq.app',
          displayName: 'Hacker',
          emailVerified: true,
          status: 'active',
        },
        isValid: true,
      });

      const mockFindUnique = vi.fn().mockResolvedValueOnce({
        id: 'listing-500',
        ownerId: userId,
        title: 'Item Privado',
        status: 'draft',
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
      } as unknown as prismaModule.PrismaClient);

      const res = await getListingForEdit('listing-500');
      expect(res.success).toBe(false);
      expect(res.error).toContain('permissão');
    });
  });
});
