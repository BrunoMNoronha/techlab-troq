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
import { auditEventFor, transitionCode, TRANSITION_RULES } from './lifecycle';
import { LISTING_COMPLIANCE_TERMS_VERSION } from './compliance';
import * as identityModule from '@/modules/identity';
import * as prismaModule from '@/persistence/prisma';
import type { ListingStatus } from '@/generated/prisma/client';

// Unitario do ciclo de vida pelo dono (F2-010, #48). O banco e uma transacao
// falsa que registra o que seria gravado; trava, concorrencia e rollback reais
// sao provados em listing-lifecycle.integration.test.ts.

const userId = '11111111-1111-4111-8111-111111111111';
const listingId = '22222222-2222-4222-8222-222222222222';

interface FakeListing {
  status: ListingStatus;
  title?: string;
  description?: string;
  city?: string;
  uf?: string;
}

interface FakeDb {
  listing: FakeListing | null;
  ready: number;
  updates: string[];
  transitions: { fromStatus: ListingStatus; toStatus: ListingStatus }[];
  acceptances: { termsVersion: string; type: string }[];
  audits: { eventType: string; details: Record<string, unknown> }[];
  transactionCalls: number;
}

function sql(strings: TemplateStringsArray): string {
  return strings.join('?');
}

function fakeDb(listing: FakeListing | null, ready = 1): FakeDb {
  const db: FakeDb = {
    listing,
    ready,
    updates: [],
    transitions: [],
    acceptances: [],
    audits: [],
    transactionCalls: 0,
  };
  const tx = {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const text = sql(strings);
      if (text.includes('FOR UPDATE')) {
        return db.listing
          ? [
              {
                id: listingId,
                title: 'Bicicleta sintetica',
                description: 'Descricao sintetica.',
                city: 'Recife',
                uf: 'PE',
                ...db.listing,
              },
            ]
          : [];
      }
      if (text.includes('count(*)')) return [{ ready: db.ready }];
      if (text.includes('SELECT now()')) return [{ at: new Date('2026-09-30T12:00:00Z') }];
      throw new Error(`consulta inesperada: ${text}`);
    }),
    $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
      db.updates.push(sql(strings));
      return 1;
    }),
    listingTransition: {
      create: vi.fn(async ({ data }: { data: FakeDb['transitions'][number] }) => {
        db.transitions.push(data);
        return {};
      }),
    },
    termsAcceptance: {
      create: vi.fn(async ({ data }: { data: FakeDb['acceptances'][number] }) => {
        db.acceptances.push(data);
        return { id: '33333333-3333-4333-8333-333333333333' };
      }),
    },
    auditEvent: {
      create: vi.fn(async ({ data }: { data: FakeDb['audits'][number] }) => {
        db.audits.push(data);
        return {};
      }),
    },
  };
  vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      db.transactionCalls += 1;
      return fn(tx);
    }),
  } as unknown as prismaModule.PrismaClient);
  return db;
}

function signedIn(): void {
  vi.spyOn(identityModule, 'validateSession').mockResolvedValue({
    user: {
      id: userId,
      email: 'user@example.invalid',
      displayName: 'User',
      emailVerified: true,
      status: 'active',
    },
    isValid: true,
  });
}

describe('matriz de transicoes do dono (DEC-027, secao 4)', () => {
  it('T1 a T6 sao os unicos pares do dono e nenhum produz removed', () => {
    const pairs = Object.values(TRANSITION_RULES).flatMap((rule) =>
      rule.from.map((from) => transitionCode(from, rule.to)),
    );
    expect(pairs.sort()).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
    for (const rule of Object.values(TRANSITION_RULES)) expect(rule.to).not.toBe('removed');
  });

  it('pares fora da matriz nao tem codigo', () => {
    expect(transitionCode('closed', 'published')).toBeNull();
    expect(transitionCode('published', 'draft')).toBeNull();
    expect(transitionCode('draft', 'removed')).toBeNull();
  });

  it('so publicacao, T5 e T6 vao para a trilha de auditoria (DM-11.1)', () => {
    expect(['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map(auditEventFor)).toEqual([
      'listing.published',
      null,
      null,
      null,
      'listing.closed',
      'listing.closed',
    ]);
  });
});

describe('modulo listing — transicoes de ciclo de vida (#48)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sem sessao valida: nada consulta o banco', async () => {
    vi.spyOn(identityModule, 'validateSession').mockResolvedValue({
      isValid: false,
      reason: 'no_session',
    } as Awaited<ReturnType<typeof identityModule.validateSession>>);
    const db = fakeDb({ status: 'draft' });
    const res = await publishListing(listingId, true);
    expect(res).toMatchObject({ success: false, reason: 'unauthenticated' });
    expect(db.transactionCalls).toBe(0);
  });

  it('ID malformado responde not_found sem consultar o banco', async () => {
    signedIn();
    const db = fakeDb({ status: 'draft' });
    for (const id of ['nao-e-uuid', "1' OR '1'='1", '']) {
      expect(await pauseListing(id)).toMatchObject({ success: false, reason: 'not_found' });
    }
    expect(db.transactionCalls).toBe(0);
  });

  it('anuncio alheio ou inexistente: a busca travada ja e filtrada pelo dono', async () => {
    signedIn();
    fakeDb(null);
    expect(await closeListing(listingId)).toMatchObject({
      success: false,
      reason: 'not_found',
      error: 'Anúncio não encontrado.',
    });
  });

  describe('T1 publicar', () => {
    it('sem aceite de conformidade: recusa sem gravar', async () => {
      signedIn();
      const db = fakeDb({ status: 'draft' });
      const res = await publishListing(listingId, false);
      expect(res).toMatchObject({ success: false, reason: 'compliance_required' });
      expect(db.updates).toHaveLength(0);
    });

    it('sem imagem pronta: recusa sem gravar', async () => {
      signedIn();
      const db = fakeDb({ status: 'draft' }, 0);
      const res = await publishListing(listingId, true);
      expect(res).toMatchObject({ success: false, reason: 'no_ready_image' });
      expect(db.updates).toHaveLength(0);
      expect(db.acceptances).toHaveLength(0);
    });

    it('revalida o conteudo no ato: campo invalido recusa com erro por campo', async () => {
      signedIn();
      const db = fakeDb({ status: 'draft', uf: 'P1' });
      const res = await publishListing(listingId, true);
      expect(res).toMatchObject({ success: false, reason: 'validation' });
      expect(res.success === false && res.fieldErrors?.state).toBeTruthy();
      expect(db.updates).toHaveLength(0);
    });

    it('publica: estado, transicao, aceite versionado e auditoria na mesma transacao', async () => {
      signedIn();
      const db = fakeDb({ status: 'draft' });
      const res = await publishListing(listingId, true);
      expect(res).toEqual({ success: true, status: 'published', changed: true });
      expect(db.transactionCalls).toBe(1);
      expect(db.updates[0]).toContain("'published'");
      expect(db.updates[0]).toContain('published_at');
      expect(db.transitions).toEqual([
        expect.objectContaining({ fromStatus: 'draft', toStatus: 'published' }),
      ]);
      expect(db.acceptances).toEqual([
        expect.objectContaining({
          type: 'listing_compliance',
          termsVersion: LISTING_COMPLIANCE_TERMS_VERSION,
        }),
      ]);
      expect(db.audits).toEqual([
        expect.objectContaining({
          eventType: 'listing.published',
          details: expect.objectContaining({
            transition: 'T1',
            termsVersion: LISTING_COMPLIANCE_TERMS_VERSION,
          }),
        }),
      ]);
    });

    it('repetir sobre anuncio ja publicado: sucesso sem novo aceite, transicao ou auditoria', async () => {
      signedIn();
      const db = fakeDb({ status: 'published' });
      const res = await publishListing(listingId, true);
      expect(res).toEqual({ success: true, status: 'published', changed: false });
      expect(db.updates).toHaveLength(0);
      expect(db.acceptances).toHaveLength(0);
      expect(db.audits).toHaveLength(0);
    });

    it('publicar anuncio pausado nao e T1: recusa (a reativacao e T4)', async () => {
      signedIn();
      fakeDb({ status: 'paused' });
      expect(await publishListing(listingId, true)).toMatchObject({
        success: false,
        reason: 'invalid_transition',
        status: 'paused',
      });
    });
  });

  describe('T2 descartar rascunho', () => {
    it('grava closed, nunca removed, sem auditoria critica', async () => {
      signedIn();
      const db = fakeDb({ status: 'draft' });
      const res = await discardDraft(listingId);
      expect(res).toEqual({ success: true, status: 'closed', changed: true });
      expect(db.updates[0]).toContain("'closed'");
      expect(db.updates[0]).not.toContain('removed');
      expect(db.transitions).toEqual([
        expect.objectContaining({ fromStatus: 'draft', toStatus: 'closed' }),
      ]);
      expect(db.audits).toHaveLength(0);
    });

    it('descartar anuncio publicado e recusado', async () => {
      signedIn();
      fakeDb({ status: 'published' });
      expect(await discardDraft(listingId)).toMatchObject({ reason: 'invalid_transition' });
    });
  });

  describe('T3 pausar e T4 reativar', () => {
    it('pausa anuncio publicado', async () => {
      signedIn();
      const db = fakeDb({ status: 'published' });
      expect(await pauseListing(listingId)).toEqual({
        success: true,
        status: 'paused',
        changed: true,
      });
      expect(db.updates[0]).toContain('paused_at');
      expect(db.audits).toHaveLength(0);
    });

    it('pausar rascunho e recusado', async () => {
      signedIn();
      fakeDb({ status: 'draft' });
      expect(await pauseListing(listingId)).toMatchObject({
        success: false,
        reason: 'invalid_transition',
        status: 'draft',
      });
    });

    it('reativa com imagem pronta, sem mudar a data da primeira publicacao', async () => {
      signedIn();
      const db = fakeDb({ status: 'paused' });
      expect(await reactivateListing(listingId)).toEqual({
        success: true,
        status: 'published',
        changed: true,
      });
      expect(db.updates[0]).not.toContain('published_at');
      expect(db.acceptances).toHaveLength(0);
    });

    it('reativar sem imagem pronta e recusado (D-3)', async () => {
      signedIn();
      const db = fakeDb({ status: 'paused' }, 0);
      expect(await reactivateListing(listingId)).toMatchObject({ reason: 'no_ready_image' });
      expect(db.updates).toHaveLength(0);
    });
  });

  describe('T5/T6 encerrar', () => {
    it.each([
      ['published', 'T5'],
      ['paused', 'T6'],
    ] as const)('encerra a partir de %s com auditoria %s', async (from, code) => {
      signedIn();
      const db = fakeDb({ status: from });
      expect(await closeListing(listingId)).toEqual({
        success: true,
        status: 'closed',
        changed: true,
      });
      expect(db.audits).toEqual([
        expect.objectContaining({
          eventType: 'listing.closed',
          details: expect.objectContaining({ transition: code, fromStatus: from }),
        }),
      ]);
    });

    it('encerrar anuncio ja encerrado e idempotente e nao audita de novo', async () => {
      signedIn();
      const db = fakeDb({ status: 'closed' });
      expect(await closeListing(listingId)).toEqual({
        success: true,
        status: 'closed',
        changed: false,
      });
      expect(db.audits).toHaveLength(0);
    });

    it('removed e terminal: nenhuma acao do dono sai dele', async () => {
      signedIn();
      for (const action of [publishListing, pauseListing, reactivateListing, closeListing]) {
        fakeDb({ status: 'removed' });
        const res = await (action as (id: string, c?: boolean) => ReturnType<typeof pauseListing>)(
          listingId,
          true,
        );
        expect(res).toMatchObject({ success: false, reason: 'invalid_transition' });
      }
    });
  });

  it('falha inesperada do banco vira erro generico, sem detalhe cru', async () => {
    signedIn();
    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      $transaction: vi.fn().mockRejectedValue(new Error('connection reset: host=db.interno')),
    } as unknown as prismaModule.PrismaClient);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await closeListing(listingId);
    expect(res).toMatchObject({ success: false, reason: 'error' });
    expect(JSON.stringify(spy.mock.calls)).not.toContain('db.interno');
  });
});

describe('getPublicFeed & getPublicListingDetail (RF-014)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('feed publico expoe apenas DTO seguro sem telefone ou dados privados', async () => {
    const row = {
      id: 'pub-1',
      title: 'Produto Público',
      description: 'Descrição',
      city: 'São Paulo',
      uf: 'SP',
      createdAt: new Date(),
      images: [],
    };
    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      listing: { findMany: vi.fn(), count: vi.fn() },
      $transaction: vi.fn().mockResolvedValueOnce([[row], 1]),
    } as unknown as prismaModule.PrismaClient);

    const feed = await getPublicFeed();
    expect(feed.total).toBe(1);
    expect(feed.listings[0]).not.toHaveProperty('phone');
    expect(feed.listings[0]).not.toHaveProperty('whatsapp');
    expect(feed.listings[0]).not.toHaveProperty('email');
    expect(feed.listings[0]).not.toHaveProperty('ownerId');
  });

  it('detalhe publico retorna null se o anuncio nao estiver publicado', async () => {
    vi.spyOn(prismaModule, 'getPrismaClient').mockReturnValue({
      listing: { findFirst: vi.fn().mockResolvedValueOnce(null) },
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
