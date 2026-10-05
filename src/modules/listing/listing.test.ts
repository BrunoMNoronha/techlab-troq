import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDraftListing, updateListing, getOwnerListings, getListingForEdit } from './actions';
import * as identityModule from '@/modules/identity';
import * as prismaModule from '@/persistence/prisma';

// Unitarios com Prisma simulado: provam o contrato das actions privadas
// (listing-contract.md, secoes 3, 4, 6 e 7). O isolamento A/B contra banco
// real esta em listing-drafts.integration.test.ts.
describe('modulo listing — rascunhos, edicao e meus anuncios (#44 / F2-006)', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const listingId = '22222222-2222-4222-8222-222222222222';
  const validInput = {
    title: 'Bicicleta Caloi Aro 29',
    description: 'Bicicleta em bom estado',
    city: 'São Paulo',
    state: 'SP',
  };

  function asUser(id = userId) {
    vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
      user: {
        id,
        email: 'user@troq.app',
        displayName: 'User',
        emailVerified: true,
        status: 'active',
      },
      isValid: true,
    });
  }

  function mockPrisma(listing: Record<string, unknown>) {
    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      listing,
    } as unknown as prismaModule.PrismaClient);
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('createDraftListing', () => {
    it('rejeita criacao sem sessao valida, sem tocar no banco', async () => {
      vi.spyOn(identityModule, 'validateSession').mockResolvedValueOnce({
        user: null,
        isValid: false,
        reason: 'no_session',
      });
      const create = vi.fn();
      mockPrisma({ create });

      const res = await createDraftListing(validInput);

      expect(res).toMatchObject({ success: false, reason: 'unauthenticated' });
      expect(res.error).toContain('autenticado');
      expect(create).not.toHaveBeenCalled();
    });

    it('rejeita titulo invalido com erro no campo, sem escrita', async () => {
      asUser();
      const create = vi.fn();
      mockPrisma({ create });

      const res = await createDraftListing({ ...validInput, title: 'Bike' });

      expect(res).toMatchObject({ success: false, reason: 'validation' });
      expect(res.fieldErrors?.title).toContain('título');
      expect(create).not.toHaveBeenCalled();
    });

    it.each([
      ['descricao so com espacos', { description: '   ' }, 'description'],
      ['cidade so com espacos', { city: '  \t ' }, 'city'],
      ['UF com uma letra', { state: 'S' }, 'state'],
      ['UF com numero', { state: 'S1' }, 'state'],
    ])('rejeita %s', async (_label, patch, field) => {
      asUser();
      const create = vi.fn();
      mockPrisma({ create });

      const res = await createDraftListing({ ...validInput, ...patch });

      expect(res.success).toBe(false);
      expect(Object.keys(res.fieldErrors ?? {})).toEqual([field]);
      expect(create).not.toHaveBeenCalled();
    });

    it('cria em draft, dono da sessao e ignora ownerId/status/timestamps do payload', async () => {
      asUser();
      const create = vi.fn().mockResolvedValueOnce({ id: listingId });
      mockPrisma({ create });

      const tampered = {
        ...validInput,
        title: '  Bicicleta Caloi Aro 29  ',
        state: ' sp ',
        ownerId: '99999999-9999-4999-8999-999999999999',
        status: 'published',
        createdAt: new Date(0),
        images: [{ id: 'x' }],
      };
      const res = await createDraftListing(tampered);

      expect(res).toEqual({ success: true, listingId });
      expect(create).toHaveBeenCalledWith({
        data: {
          title: 'Bicicleta Caloi Aro 29',
          description: 'Bicicleta em bom estado',
          city: 'São Paulo',
          uf: 'SP',
          ownerId: userId,
          status: 'draft',
          tradeOptions: { create: [] },
        },
        select: { id: true },
      });
    });

    it('rascunho aceita alternativas incompletas e grava so as preenchidas, na posicao', async () => {
      asUser();
      const create = vi.fn().mockResolvedValueOnce({ id: listingId });
      mockPrisma({ create });

      const res = await createDraftListing({
        ...validInput,
        tradeOptions: ['', ' Um videogame ', '   '],
      });

      expect(res).toEqual({ success: true, listingId });
      expect(create.mock.calls[0][0].data.tradeOptions).toEqual({
        create: [{ position: 2, label: 'Um videogame' }],
      });
    });

    it.each([
      ['mais de tres', ['a', 'b', 'c', 'd'], 'tradeOptions'],
      ['menos de tres', ['a', 'b'], 'tradeOptions'],
      ['texto acima de 60 caracteres', ['a', 'b', 'c'.repeat(61)], 'tradeOption3'],
      ['item que nao e texto', ['a', 7, 'c'], 'tradeOption2'],
    ])('rejeita alternativas com %s, sem escrita', async (_c, tradeOptions, field) => {
      asUser();
      const create = vi.fn();
      mockPrisma({ create });

      const res = await createDraftListing({
        ...validInput,
        tradeOptions: tradeOptions as string[],
      });

      expect(res).toMatchObject({ success: false, reason: 'validation' });
      expect(Object.keys(res.fieldErrors ?? {})).toEqual([field]);
      expect(create).not.toHaveBeenCalled();
    });

    it('falha de banco vira erro controlado, sem detalhe interno', async () => {
      asUser();
      const create = vi.fn().mockRejectedValueOnce(new Error('connection refused at 10.0.0.1'));
      mockPrisma({ create });
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await createDraftListing(validInput);

      expect(res).toMatchObject({ success: false, reason: 'error' });
      expect(res.error).not.toContain('10.0.0.1');
    });
  });

  describe('updateListing', () => {
    /**
     * Transacao simulada: `$queryRaw` e a trava `FOR UPDATE` ja filtrada pelo
     * dono (lifecycle.ts, lockOwnedListing); `null` = nenhuma linha do dono.
     */
    function mockTx(
      lockedStatus: string | null,
      storedOptions: { position: number; label: string }[] = [],
    ) {
      const tx = {
        $queryRaw: vi
          .fn()
          .mockResolvedValue(lockedStatus ? [{ id: listingId, status: lockedStatus }] : []),
        listing: { update: vi.fn().mockResolvedValue({}) },
        listingTradeOption: {
          findMany: vi.fn().mockResolvedValue(storedOptions),
          deleteMany: vi.fn().mockResolvedValue({ count: storedOptions.length }),
          createMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
      };
      const $transaction = vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
      vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
        $transaction,
      } as unknown as prismaModule.PrismaClient);
      return { tx, $transaction };
    }

    const options = ['Um notebook', 'Um videogame', 'Uma câmera'];
    const stored = options.map((label, i) => ({ position: i + 1, label }));

    it('grava sob a trava do anuncio, filtrada pelo dono da sessao', async () => {
      asUser();
      const { tx } = mockTx('draft');

      const res = await updateListing(listingId, { title: ' Título Atualizado ', state: 'rj' });

      expect(res).toEqual({ success: true, listingId });
      expect(tx.$queryRaw.mock.calls[0].slice(1)).toEqual([listingId, userId]);
      expect(tx.listing.update).toHaveBeenCalledWith({
        where: { id: listingId },
        data: { title: 'Título Atualizado', uf: 'RJ', updatedAt: expect.any(Date) },
      });
      // Sem `tradeOptions` na entrada, as gravadas ficam como estao.
      expect(tx.listingTradeOption.deleteMany).not.toHaveBeenCalled();
      expect(tx.listingTradeOption.createMany).not.toHaveBeenCalled();
    });

    it('anuncio alheio e UUID inexistente produzem a mesma resposta', async () => {
      const otherUser = '33333333-3333-4333-8333-333333333333';
      asUser(otherUser);
      const first = mockTx(null);
      const foreign = await updateListing(listingId, { title: 'Tentativa de terceiro' });

      asUser(otherUser);
      mockTx(null);
      const missing = await updateListing('44444444-4444-4444-8444-444444444444', {
        title: 'Tentativa de terceiro',
      });

      expect(foreign).toEqual({
        success: false,
        reason: 'not_found',
        error: 'Anúncio não encontrado.',
      });
      expect(missing).toEqual(foreign);
      expect(JSON.stringify(foreign)).not.toMatch(/permiss/i);
      expect(first.tx.$queryRaw.mock.calls[0].slice(1)).toEqual([listingId, otherUser]);
      expect(first.tx.listing.update).not.toHaveBeenCalled();
    });

    it.each(['closed', 'removed'])(
      'anuncio proprio em estado terminal (%s) responde not_editable',
      async (status) => {
        asUser();
        const { tx } = mockTx(status, stored);

        const res = await updateListing(listingId, { title: 'Novo Título Válido' });

        expect(res).toMatchObject({ success: false, reason: 'not_editable' });
        expect(res.error).toContain('encerrados ou removidos');
        expect(tx.listing.update).not.toHaveBeenCalled();
      },
    );

    it('ID malformado responde not_found sem consultar o banco', async () => {
      asUser();
      const { $transaction } = mockTx('draft');

      const res = await updateListing('listing-200', { title: 'Novo Título Válido' });

      expect(res.reason).toBe('not_found');
      expect($transaction).not.toHaveBeenCalled();
    });

    it('valida antes do banco, com a mesma regra da criacao', async () => {
      asUser();
      const { $transaction } = mockTx('draft');

      const res = await updateListing(listingId, { description: '   ', city: '', state: '12' });

      expect(res.reason).toBe('validation');
      expect(Object.keys(res.fieldErrors ?? {}).sort()).toEqual(['city', 'description', 'state']);
      expect($transaction).not.toHaveBeenCalled();
    });

    it('rejeita edicao sem nenhum campo de conteudo', async () => {
      asUser();
      const { $transaction } = mockTx('draft');

      const res = await updateListing(listingId, {});

      expect(res.reason).toBe('validation');
      expect($transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['duas alternativas', ['Um notebook', 'Um videogame']],
      ['quatro alternativas', [...options, 'Um tablet']],
      ['lista ausente como texto', 'Um notebook'],
      ['nulo', null],
    ])('forma errada das alternativas (%s) e recusada antes do banco', async (_c, value) => {
      asUser();
      const { $transaction } = mockTx('published', stored);

      const res = await updateListing(listingId, {
        tradeOptions: value as unknown as string[],
      });

      expect(res).toMatchObject({ success: false, reason: 'validation' });
      expect(res.fieldErrors).toEqual({
        tradeOptions: 'Informe exatamente 3 alternativas de troca.',
      });
      expect($transaction).not.toHaveBeenCalled();
    });

    it('alternativa acima do limite e recusada mesmo em rascunho', async () => {
      asUser();
      const { $transaction } = mockTx('draft');

      const res = await updateListing(listingId, {
        tradeOptions: ['Um notebook', 'x'.repeat(61), ''],
      });

      expect(res.fieldErrors).toEqual({ tradeOption2: expect.stringContaining('60 caracteres') });
      expect($transaction).not.toHaveBeenCalled();
    });

    it('rascunho grava alternativas incompletas na posicao informada', async () => {
      asUser();
      const { tx } = mockTx('draft');

      const res = await updateListing(listingId, {
        tradeOptions: [' Um notebook ', '  ', 'Uma câmera'],
      });

      expect(res).toEqual({ success: true, listingId });
      expect(tx.listingTradeOption.deleteMany).toHaveBeenCalledWith({ where: { listingId } });
      expect(tx.listingTradeOption.createMany).toHaveBeenCalledWith({
        data: [
          { position: 1, label: 'Um notebook', listingId },
          { position: 3, label: 'Uma câmera', listingId },
        ],
      });
    });

    it.each(['published', 'paused'])(
      'anuncio %s nao aceita esvaziar uma alternativa, sem nenhuma escrita',
      async (status) => {
        asUser();
        const { tx } = mockTx(status, stored);

        const res = await updateListing(listingId, {
          title: 'Título novo e válido',
          tradeOptions: ['Um notebook', '   ', 'Uma câmera'],
        });

        expect(res).toMatchObject({ success: false, reason: 'validation' });
        expect(res.fieldErrors).toEqual({ tradeOption2: expect.any(String) });
        expect(tx.listing.update).not.toHaveBeenCalled();
        expect(tx.listingTradeOption.deleteMany).not.toHaveBeenCalled();
      },
    );

    it('anuncio publicado anterior a #76 precisa completar as alternativas para editar', async () => {
      asUser();
      const { tx } = mockTx('published', []);

      const res = await updateListing(listingId, { title: 'Título novo e válido' });

      expect(res).toMatchObject({ success: false, reason: 'validation' });
      expect(Object.keys(res.fieldErrors ?? {})).toEqual([
        'tradeOption1',
        'tradeOption2',
        'tradeOption3',
      ]);
      expect(tx.listing.update).not.toHaveBeenCalled();
    });

    it('anuncio publicado aceita as tres alternativas, substituindo as gravadas', async () => {
      asUser();
      const { tx } = mockTx('published', []);

      const res = await updateListing(listingId, { tradeOptions: options });

      expect(res).toEqual({ success: true, listingId });
      expect(tx.listing.update).toHaveBeenCalledWith({
        where: { id: listingId },
        data: { updatedAt: expect.any(Date) },
      });
      expect(tx.listingTradeOption.createMany).toHaveBeenCalledWith({
        data: stored.map((row) => ({ ...row, listingId })),
      });
    });
  });

  describe('getOwnerListings', () => {
    it('retorna os anuncios do usuario autenticado, filtrados pela sessao', async () => {
      asUser();
      const findMany = vi.fn().mockResolvedValueOnce([
        {
          id: listingId,
          title: 'Anúncio 1',
          description: 'Desc 1',
          city: 'São Paulo',
          uf: 'SP',
          status: 'closed',
          createdAt: new Date(),
          updatedAt: new Date(),
          tradeOptions: [{ position: 3, label: 'Uma câmera' }],
        },
      ]);
      mockPrisma({ findMany });

      const res = await getOwnerListings();

      expect(res.success).toBe(true);
      expect(res.listings?.[0]).toMatchObject({
        title: 'Anúncio 1',
        state: 'SP',
        status: 'closed',
        tradeOptions: ['', '', 'Uma câmera'],
      });
      expect(res.listings?.[0]).not.toHaveProperty('ownerId');
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ownerId: userId } }),
      );
    });

    it('falha de consulta e erro, nunca lista vazia', async () => {
      asUser();
      mockPrisma({ findMany: vi.fn().mockRejectedValueOnce(new Error('timeout')) });
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await getOwnerListings();

      expect(res).toMatchObject({ success: false, reason: 'error' });
      expect(res.listings).toBeUndefined();
    });
  });

  describe('getListingForEdit', () => {
    it('busca ja filtrada pelo dono; alheio e inexistente sao o mesmo not_found', async () => {
      const otherUser = '33333333-3333-4333-8333-333333333333';
      asUser(otherUser);
      const findFirst = vi.fn().mockResolvedValueOnce(null);
      mockPrisma({ findFirst });

      const res = await getListingForEdit(listingId);

      expect(res).toEqual({
        success: false,
        reason: 'not_found',
        error: 'Anúncio não encontrado.',
      });
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: listingId, ownerId: otherUser } }),
      );
    });

    it('ID malformado e not_found, sem erro de consulta', async () => {
      asUser();
      const findFirst = vi.fn();
      mockPrisma({ findFirst });

      expect((await getListingForEdit('nao-e-uuid')).reason).toBe('not_found');
      expect(findFirst).not.toHaveBeenCalled();
    });

    it('falha de banco e erro operacional, distinto de not_found', async () => {
      asUser();
      mockPrisma({ findFirst: vi.fn().mockRejectedValueOnce(new Error('boom')) });
      vi.spyOn(console, 'error').mockImplementation(() => {});

      expect((await getListingForEdit(listingId)).reason).toBe('error');
    });
  });
});
