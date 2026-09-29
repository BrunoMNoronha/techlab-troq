import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requestImageUpload,
  confirmAndProcessImage,
  deleteListingImage,
  getPublicListingImages,
} from './service';
import * as identityModule from '@/modules/identity';
import * as prismaModule from '@/persistence/prisma';
import sharp from 'sharp';

vi.mock('./s3', () => ({
  generatePresignedUploadUrl: vi.fn().mockResolvedValue('https://r2.example.invalid/presigned-put'),
  deleteR2Object: vi.fn().mockResolvedValue(undefined),
  getS3Client: () => ({ send: vi.fn() }),
  R2_BUCKET: 'troq-media-test',
}));

describe('modulo media — upload, processamento R2 e controle de acesso (#46/#47)', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const listingId = 'list-100';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requestImageUpload', () => {
    it('rejeita formato nao suportado', async () => {
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

      const res = await requestImageUpload({
        listingId,
        contentType: 'image/gif',
        fileSize: 100000,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('não suportado');
    });

    it('rejeita arquivo maior que 10 MB', async () => {
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

      const res = await requestImageUpload({
        listingId,
        contentType: 'image/jpeg',
        fileSize: 11 * 1024 * 1024,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('10 MB');
    });

    it('rejeita upload se o limite de 6 imagens for atingido', async () => {
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
        id: listingId,
        ownerId: userId,
        status: 'draft',
        images: [{}, {}, {}, {}, {}, {}], // 6 imagens
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
      } as unknown as prismaModule.PrismaClient);

      const res = await requestImageUpload({
        listingId,
        contentType: 'image/png',
        fileSize: 500000,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('6 imagens');
    });

    it('emite URL pre-assinada com sucesso para slot valido', async () => {
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
        id: listingId,
        ownerId: userId,
        status: 'draft',
        images: [{}], // 1 imagem
      });

      const mockImageCreate = vi.fn().mockResolvedValueOnce({
        id: 'img-2',
        listingId,
        position: 2,
        status: 'uploaded',
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
        listingImage: { create: mockImageCreate },
      } as unknown as prismaModule.PrismaClient);

      const res = await requestImageUpload({
        listingId,
        contentType: 'image/jpeg',
        fileSize: 500000,
      });

      expect(res.success).toBe(true);
      expect(res.imageId).toBe('img-2');
      expect(res.uploadUrl).toBe('https://r2.example.invalid/presigned-put');
    });
  });

  describe('confirmAndProcessImage', () => {
    it('processa imagem valida e cria 3 derivados WebP', async () => {
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
        id: 'img-10',
        listingId,
        status: 'uploaded',
        listing: { id: listingId, ownerId: userId },
      });

      const mockImageUpdate = vi.fn().mockResolvedValue({});
      const mockDerivativeCreate = vi.fn().mockResolvedValue({});

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listingImage: { findUnique: mockFindUnique, update: mockImageUpdate },
        imageDerivative: { create: mockDerivativeCreate },
      } as unknown as prismaModule.PrismaClient);

      // Gerar imagem sintetica PNG 400x400 via Sharp
      const samplePngBuffer = await sharp({
        create: {
          width: 400,
          height: 400,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const res = await confirmAndProcessImage('img-10', samplePngBuffer);

      expect(res.success).toBe(true);
      expect(mockDerivativeCreate).toHaveBeenCalledTimes(3); // thumb, medium, large
      expect(mockImageUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: 'img-10' },
          data: expect.objectContaining({ status: 'ready' }),
        }),
      );
    });

    it('rejeita imagem com resolucao menor que 320px', async () => {
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
        id: 'img-tiny',
        listingId,
        status: 'uploaded',
        listing: { id: listingId, ownerId: userId },
      });

      const mockImageUpdate = vi.fn().mockResolvedValue({});

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listingImage: { findUnique: mockFindUnique, update: mockImageUpdate },
      } as unknown as prismaModule.PrismaClient);

      // Imagem de 100x100 (menor que 320px)
      const tinyPngBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 0, g: 255, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

      const res = await confirmAndProcessImage('img-tiny', tinyPngBuffer);

      expect(res.success).toBe(false);
      expect(res.error).toContain('320x320');
      expect(mockImageUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'img-tiny' },
          data: { status: 'failed' },
        }),
      );
    });
  });

  describe('getPublicListingImages (Issue #47 / F2-009)', () => {
    it('retorna derivados SOMENTE quando status=published e owner.status=active', async () => {
      const mockFindUnique = vi.fn().mockResolvedValueOnce({
        id: listingId,
        status: 'published',
        owner: { status: 'active' },
        images: [
          {
            id: 'img-ready-1',
            position: 1,
            status: 'ready',
            derivatives: [
              {
                kind: 'thumb',
                publicUrl: 'https://media.example.invalid/public/img-ready-1/thumb.webp',
                width: 320,
                height: 320,
              },
              {
                kind: 'medium',
                publicUrl: 'https://media.example.invalid/public/img-ready-1/medium.webp',
                width: 768,
                height: 768,
              },
            ],
          },
        ],
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
      } as unknown as prismaModule.PrismaClient);

      const images = await getPublicListingImages(listingId);
      expect(images).toHaveLength(1);
      expect(images[0].derivatives).toHaveLength(2);
    });

    it('revoga derivados imediatamente se o anuncio for pausado, rascunho ou encerrado', async () => {
      const mockFindUnique = vi.fn().mockResolvedValueOnce({
        id: listingId,
        status: 'paused',
        owner: { status: 'active' },
        images: [{ id: 'img-hidden' }],
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
      } as unknown as prismaModule.PrismaClient);

      const images = await getPublicListingImages(listingId);
      expect(images).toEqual([]);
    });
  });

  describe('deleteListingImage', () => {
    it('deleta imagem e reordena posicoes remanescentes', async () => {
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
        id: 'img-to-del',
        listingId,
        listing: { ownerId: userId },
        derivatives: [{ objectKey: 'public/img-to-del/thumb.webp' }],
      });

      const mockTransaction = vi.fn().mockResolvedValueOnce([{}, {}]);
      const mockFindMany = vi.fn().mockResolvedValueOnce([{ id: 'img-rem-1' }]);
      const mockUpdate = vi.fn().mockResolvedValue({});

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listingImage: {
          findUnique: mockFindUnique,
          findMany: mockFindMany,
          update: mockUpdate,
          delete: vi.fn(),
        },
        imageDerivative: { deleteMany: vi.fn() },
        $transaction: mockTransaction,
      } as unknown as prismaModule.PrismaClient);

      const res = await deleteListingImage('img-to-del');
      expect(res.success).toBe(true);
    });
  });
});
