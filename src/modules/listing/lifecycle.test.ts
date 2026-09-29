import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  publishListing,
  pauseListing,
  reactivateListing,
  closeListing,
  discardDraft,
  getPublicFeed,
  getPublicListingDetail,
} from './actions';
import * as identityModule from '@/modules/identity';
import * as prismaModule from '@/persistence/prisma';

describe('modulo listing — transicoes de ciclo de vida e feed publico (#48/#49)', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const listingId = 'listing-lifecycle-100';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('publishListing (T1: draft -> published)', () => {
    it('rejeita publicacao se a declaracao de conformidade nao for aceita', async () => {
      const res = await publishListing(listingId, false);
      expect(res.success).toBe(false);
      expect(res.error).toContain('conformidade');
    });

    it('rejeita publicacao se o anuncio nao possuir nenhuma imagem no status ready', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
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
        id: listingId,
        ownerId: userId,
        status: 'draft',
        images: [], // 0 imagens
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
      } as unknown as prismaModule.PrismaClient);

      const res = await publishListing(listingId, true);
      expect(res.success).toBe(false);
      expect(res.error).toContain('pelo menos uma imagem');
    });

    it('publica rascunho com sucesso e grava aceite de termos e transicao', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
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
        id: listingId,
        ownerId: userId,
        status: 'draft',
        images: [{ id: 'img-ready', status: 'ready' }],
      });

      const mockTransaction = vi.fn().mockResolvedValueOnce([{}, {}, {}]);

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique, update: vi.fn() },
        termsAcceptance: { create: vi.fn() },
        listingTransition: { create: vi.fn() },
        $transaction: mockTransaction,
      } as unknown as prismaModule.PrismaClient);

      const res = await publishListing(listingId, true);
      expect(res.success).toBe(true);
      expect(mockTransaction).toHaveBeenCalled();
    });
  });

  describe('pauseListing (T3) & reactivateListing (T4)', () => {
    it('pausa anuncio publicado com sucesso', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
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
        id: listingId,
        ownerId: userId,
        status: 'published',
      });

      const mockTransaction = vi.fn().mockResolvedValueOnce([{}, {}]);

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique, update: vi.fn() },
        listingTransition: { create: vi.fn() },
        $transaction: mockTransaction,
      } as unknown as prismaModule.PrismaClient);

      const res = await pauseListing(listingId);
      expect(res.success).toBe(true);
    });

    it('reativa anuncio pausado com sucesso', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
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
        id: listingId,
        ownerId: userId,
        status: 'paused',
      });

      const mockTransaction = vi.fn().mockResolvedValueOnce([{}, {}]);

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique, update: vi.fn() },
        listingTransition: { create: vi.fn() },
        $transaction: mockTransaction,
      } as unknown as prismaModule.PrismaClient);

      const res = await reactivateListing(listingId);
      expect(res.success).toBe(true);
    });
  });

  describe('closeListing (T5) & discardDraft (T2)', () => {
    it('encerra anuncio publicado', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
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
        id: listingId,
        ownerId: userId,
        status: 'published',
      });

      const mockTransaction = vi.fn().mockResolvedValueOnce([{}, {}]);

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique, update: vi.fn() },
        listingTransition: { create: vi.fn() },
        $transaction: mockTransaction,
      } as unknown as prismaModule.PrismaClient);

      const res = await closeListing(listingId);
      expect(res.success).toBe(true);
    });

    it('descarta rascunho com sucesso', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
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
        id: listingId,
        ownerId: userId,
        status: 'draft',
      });

      const mockTransaction = vi.fn().mockResolvedValueOnce([{}, {}]);

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique, update: vi.fn() },
        listingTransition: { create: vi.fn() },
        $transaction: mockTransaction,
      } as unknown as prismaModule.PrismaClient);

      const res = await discardDraft(listingId);
      expect(res.success).toBe(true);
    });
  });

  describe('getPublicFeed & getPublicListingDetail (RF-014)', () => {
    it('feed publico expoe apenas DTO seguro sem telefone ou dados privados', async () => {
      const mockFindMany = vi.fn().mockResolvedValueOnce([
        {
          id: 'pub-1',
          title: 'Produto Público',
          description: 'Descrição',
          city: 'São Paulo',
          uf: 'SP',
          createdAt: new Date(),
          images: [],
        },
      ]);
      const mockCount = vi.fn().mockResolvedValueOnce(1);

      const mockTransaction = vi.fn().mockResolvedValueOnce([
        [
          {
            id: 'pub-1',
            title: 'Produto Público',
            description: 'Descrição',
            city: 'São Paulo',
            uf: 'SP',
            createdAt: new Date(),
            images: [],
          },
        ],
        1,
      ]);

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findMany: mockFindMany, count: mockCount },
        $transaction: mockTransaction,
      } as unknown as prismaModule.PrismaClient);

      const feed = await getPublicFeed();
      expect(feed.total).toBe(1);
      expect(feed.listings[0]).not.toHaveProperty('phone');
      expect(feed.listings[0]).not.toHaveProperty('whatsapp');
      expect(feed.listings[0]).not.toHaveProperty('email');
      expect(feed.listings[0]).not.toHaveProperty('ownerId');
    });

    it('detalhe publico retorna null se o anuncio nao estiver publicado', async () => {
      const mockFindFirst = vi.fn().mockResolvedValueOnce(null);

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findFirst: mockFindFirst },
      } as unknown as prismaModule.PrismaClient);

      const item = await getPublicListingDetail('0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f');
      expect(item).toBeNull();
    });

    it('detalhe publico trata ID fora do formato UUID como inexistente, sem consultar o banco', async () => {
      const mockFindFirst = vi.fn();
      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findFirst: mockFindFirst },
      } as unknown as prismaModule.PrismaClient);

      for (const id of ['nao-e-uuid', "1' OR '1'='1", '../conta', '']) {
        expect(await getPublicListingDetail(id)).toBeNull();
      }
      expect(mockFindFirst).not.toHaveBeenCalled();
    });
  });
});
