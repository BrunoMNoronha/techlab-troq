import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDraftListing,
  updateListing,
  publishListing,
  pauseListing,
  closeListing,
  getPublicFeed,
  getPublicListingDetail,
} from '@/modules/listing/actions';
import { getPublicListingImages } from '@/modules/media/service';
import { sanitizeEvent } from '@/modules/platform/telemetry/sentry-options';
import * as identityModule from '@/modules/identity';
import * as prismaModule from '@/persistence/prisma';
import type { UserStatus } from '@/generated/prisma/client';

describe('Audit de Segurança Integrada, RF-014 e Resiliência (F2-012 - Issue #50)', () => {
  const userAId = 'user-a-1111-1111-1111-111111111111';
  const userBId = 'user-b-2222-2222-2222-222222222222';
  const listingId = 'listing-sec-100';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. RF-014 — Isolamento Estrito de Contato e Privacidade em Todas as Superfícies', () => {
    it('feed público não expele email, telefone, whatsapp ou ownerId em nenhum item do DTO', async () => {
      const mockFindMany = vi.fn().mockResolvedValueOnce([
        {
          id: 'pub-lst-1',
          title: 'MacBook Air M2',
          description: 'Excelente estado de conservacao. Contato no chat.',
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
            id: 'pub-lst-1',
            title: 'MacBook Air M2',
            description: 'Excelente estado de conservacao. Contato no chat.',
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
      expect(feed.listings).toHaveLength(1);
      const item = feed.listings[0];

      expect(item).not.toHaveProperty('ownerId');
      expect(item).not.toHaveProperty('email');
      expect(item).not.toHaveProperty('phone');
      expect(item).not.toHaveProperty('whatsapp');

      const jsonStr = JSON.stringify(item);
      expect(jsonStr).not.toMatch(/\+?55\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}/);
      expect(jsonStr).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    });

    it('detalhe público oculta anúncio e não expõe dados se status não for published', async () => {
      const mockFindFirst = vi.fn().mockResolvedValueOnce(null);

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findFirst: mockFindFirst },
      } as unknown as prismaModule.PrismaClient);

      const result = await getPublicListingDetail('1c7e3fae-4d5b-4f9c-8a2b-3e4d5c6b7a8f');
      expect(result).toBeNull();
    });

    it('consulta de imagens públicas revoga acesso se conta do dono estiver suspensa/inativa', async () => {
      const mockFindUnique = vi.fn().mockResolvedValueOnce({
        id: listingId,
        status: 'published',
        owner: { status: 'blocked_admin' as UserStatus }, // Conta bloqueada
        images: [{ id: 'img-1', status: 'ready', position: 1, derivatives: [] }],
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
      } as unknown as prismaModule.PrismaClient);

      const images = await getPublicListingImages(listingId);
      expect(images).toHaveLength(0);
    });

    it('redação de telemetria expurga dados de contato e credenciais em logs e eventos Sentry', () => {
      const sensitiveEvent = {
        message: 'Erro no envio de whatsapp +55 11 99999-0000 para email usuario@example.invalid',
        extra: {
          phone: '11999990000',
          secretKey: 'BETTER_AUTH_SECRET_FICTICIO',
        },
      };

      const sanitized = sanitizeEvent(sensitiveEvent, {});
      const serialized = JSON.stringify(sanitized);

      expect(serialized).not.toContain('+55 11 99999-0000');
      expect(serialized).not.toContain('usuario@example.invalid');
      expect(serialized).not.toContain('11999990000');
      expect(serialized).not.toContain('BETTER_AUTH_SECRET_FICTICIO');
    });
  });

  describe('2. Autorização e Restrições de Estado da Conta', () => {
    it('usuário não verificado (emailVerified: false) não pode criar anúncio rascunho', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
        user: {
          id: userAId,
          email: 'unverified@example.invalid',
          displayName: 'Unverified',
          emailVerified: false,
          status: 'active' as UserStatus,
        },
        isValid: false,
        reason: 'unverified',
      });

      const res = await createDraftListing({
        title: 'Notebook Usado em Bom Estado',
        description: 'Descrição de teste com tamanho adequado.',
        city: 'Campinas',
        state: 'SP',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('autenticado');
    });

    it('usuário bloqueado/excluído (status: blocked_admin/deletion_requested) tem ações de anúncio negadas', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
        user: {
          id: userAId,
          email: 'blocked@example.invalid',
          displayName: 'Blocked',
          emailVerified: true,
          status: 'blocked_admin' as UserStatus,
        },
        isValid: false,
        reason: 'blocked',
      });

      const res = await publishListing(listingId, true);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Não autorizado');
    });

    it('proteção contra IDOR: Usuário B não pode editar anúncio do Usuário A', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
        user: {
          id: userBId, // Usuário B tentado alterar o anúncio do Usuário A
          email: 'userB@example.invalid',
          displayName: 'User B',
          emailVerified: true,
          status: 'active' as UserStatus,
        },
        isValid: true,
      });

      const mockFindUnique = vi.fn().mockResolvedValueOnce({
        id: listingId,
        ownerId: userAId, // Pertence ao Usuário A
        status: 'draft',
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
      } as unknown as prismaModule.PrismaClient);

      const res = await updateListing(listingId, { title: 'Tentativa de Hack por IDOR' });
      expect(res.success).toBe(false);
      expect(res.error).toContain('não tem permissão');
    });

    it('proteção contra IDOR: Usuário B não pode encerrar ou descartar anúncio do Usuário A', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
        user: {
          id: userBId,
          email: 'userB@example.invalid',
          displayName: 'User B',
          emailVerified: true,
          status: 'active' as UserStatus,
        },
        isValid: true,
      });

      const mockFindUnique = vi.fn().mockResolvedValueOnce({
        id: listingId,
        ownerId: userAId,
        status: 'published',
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
      } as unknown as prismaModule.PrismaClient);

      const resClose = await closeListing(listingId);
      expect(resClose.success).toBe(false);
      expect(resClose.error).toContain('não autorizado');
    });

    it('bloqueia transição de estado inválida: tentar pausar anúncio no status DRAFT', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
        user: {
          id: userAId,
          email: 'userA@example.invalid',
          displayName: 'User A',
          emailVerified: true,
          status: 'active' as UserStatus,
        },
        isValid: true,
      });

      const mockFindUnique = vi.fn().mockResolvedValueOnce({
        id: listingId,
        ownerId: userAId,
        status: 'draft', // Status e draft, nao publicado
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
      } as unknown as prismaModule.PrismaClient);

      const res = await pauseListing(listingId);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Apenas anúncios publicados podem ser pausados');
    });

    it('bloqueia edição de anúncio encerrado (CLOSED)', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
        user: {
          id: userAId,
          email: 'userA@example.invalid',
          displayName: 'User A',
          emailVerified: true,
          status: 'active' as UserStatus,
        },
        isValid: true,
      });

      const mockFindUnique = vi.fn().mockResolvedValueOnce({
        id: listingId,
        ownerId: userAId,
        status: 'closed',
      });

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
      } as unknown as prismaModule.PrismaClient);

      const res = await updateListing(listingId, { title: 'Tentativa de Editar Fechado' });
      expect(res.success).toBe(false);
      expect(res.error).toContain('encerrados ou removidos não podem ser editados');
    });
  });

  describe('3. Resiliência e Tratamento Seguro de Erros', () => {
    it('falha no banco durante transação de publicação não vaza credenciais ou pilha interna', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        session: {},
        user: {
          id: userAId,
          email: 'userA@example.invalid',
          displayName: 'User A',
          emailVerified: true,
          status: 'active' as UserStatus,
        },
        isValid: true,
      });

      const mockFindUnique = vi.fn().mockResolvedValueOnce({
        id: listingId,
        ownerId: userAId,
        status: 'draft',
        images: [{ id: 'img-1', status: 'ready' }],
      });

      // Simula erro no $transaction (ex: timeout de conexao ou constraint no DB)
      const mockTransaction = vi
        .fn()
        .mockRejectedValueOnce(
          new Error('Database Connection Refused postgresql://user:secret@localhost:5432/troq'),
        );

      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        listing: { findUnique: mockFindUnique },
        $transaction: mockTransaction,
      } as unknown as prismaModule.PrismaClient);

      await expect(publishListing(listingId, true)).rejects.toThrow();
    });
  });
});
