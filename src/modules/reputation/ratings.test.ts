// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma, RatingValidity } from '@/generated/prisma/client';
import type { SessionValidationResult } from '@/modules/identity';
import { submitRating } from './actions';
import { getOwnRating, getPublicListingReputation } from './ratings';

// Unitarios dos limites e da projecao. As travas e corridas reais sao
// exercitadas em ratings.integration.test.ts, com PostgreSQL descartavel.
const mock = vi.hoisted(() => ({
  session: vi.fn<() => Promise<SessionValidationResult>>(),
  lock: vi.fn(),
  prisma: vi.fn(),
}));
vi.mock('@/modules/identity', () => ({ validateSession: mock.session }));
vi.mock('@/modules/negotiation', () => ({ lockNegotiationForRating: mock.lock }));
vi.mock('@/persistence/prisma', () => ({ getPrismaClient: mock.prisma }));

const OWNER = '11111111-1111-4111-8111-111111111111';
const CHOSEN = '22222222-2222-4222-8222-222222222222';
const NEGOTIATION = '33333333-3333-4333-8333-333333333333';
const LISTING = '44444444-4444-4444-8444-444444444444';
const CLOSED_AT = new Date('2026-10-01T12:00:00.000Z');
const DEADLINE = new Date('2026-10-15T12:00:00.000Z');

function database(
  at: Date,
  own: {
    id: string;
    score: number;
    submittedAt: Date;
    publishedAt: Date | null;
    validity: RatingValidity;
  } | null = null,
) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ at }]),
    auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit-event' }) },
    rating: {
      findUnique: vi.fn().mockResolvedValue(own),
      create: vi.fn().mockResolvedValue({ id: 'rating-created' }),
      update: vi.fn().mockResolvedValue({ id: 'rating-edited' }),
      count: vi.fn().mockResolvedValue(1),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  };
  mock.prisma.mockReturnValue({
    $transaction: (fn: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
      fn(tx as unknown as Prisma.TransactionClient),
    $queryRaw: vi.fn().mockResolvedValue([{ average: null, count: 0 }]),
  });
  return tx;
}

function ownRating() {
  return {
    id: 'rating-own',
    score: 3,
    submittedAt: CLOSED_AT,
    publishedAt: null,
    validity: 'valid' as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.session.mockResolvedValue({
    isValid: true,
    user: {
      id: OWNER,
      email: 'owner@example.test',
      displayName: 'Pessoa sintetica',
      emailVerified: true,
      status: 'active',
    },
  });
  mock.lock.mockResolvedValue({
    id: NEGOTIATION,
    listingId: LISTING,
    ownerId: OWNER,
    chosenId: CHOSEN,
    status: 'closed',
    closedAt: CLOSED_AT,
  });
});

describe('avaliacao: limites de autorizacao e tempo', () => {
  it.each([
    ['no_session', 'login_required'],
    ['unverified', 'email_unverified'],
    ['blocked', 'account_restricted'],
    ['deletion_requested', 'account_restricted'],
  ] as const)('recusa sessao %s antes de acessar avaliacao', async (reason, expected) => {
    mock.session.mockResolvedValue({ isValid: false, user: null, reason });
    expect(await submitRating({ negotiationId: NEGOTIATION, score: 5 })).toMatchObject({
      success: false,
      reason: expected,
    });
    expect(await getOwnRating(NEGOTIATION)).toMatchObject({ success: false, reason: expected });
    expect(mock.prisma).not.toHaveBeenCalled();
  });

  it.each([0, 6, 2.5, NaN, Infinity, '5', null, undefined])(
    'recusa nota externa invalida %s',
    async (score) => {
      expect(
        await submitRating({ negotiationId: NEGOTIATION, score: score as number }),
      ).toMatchObject({
        success: false,
        reason: 'invalid_score',
      });
      expect(mock.prisma).not.toHaveBeenCalled();
    },
  );

  it('recusa identificador malformado sem consultar o banco', async () => {
    expect(await submitRating({ negotiationId: 'invalido', score: 4 })).toMatchObject({
      success: false,
      reason: 'not_found',
    });
    expect(await getOwnRating('invalido')).toMatchObject({ success: false, reason: 'not_found' });
    expect(mock.prisma).not.toHaveBeenCalled();
  });

  it('responde como inexistente para quem nao participa', async () => {
    const tx = database(CLOSED_AT);
    mock.lock.mockResolvedValue(null);
    expect(await submitRating({ negotiationId: NEGOTIATION, score: 1 })).toMatchObject({
      success: false,
      reason: 'not_found',
    });
    expect(tx.rating.findUnique).not.toHaveBeenCalled();
  });

  it('nega antes do encerramento', async () => {
    const tx = database(CLOSED_AT);
    mock.lock.mockResolvedValue({ status: 'active', closedAt: null });
    expect(await submitRating({ negotiationId: NEGOTIATION, score: 4 })).toMatchObject({
      success: false,
      reason: 'negotiation_active',
    });
    expect(tx.rating.create).not.toHaveBeenCalled();
  });

  it('aceita um milissegundo antes do fim e resolve a contraparte no servidor', async () => {
    const tx = database(new Date(DEADLINE.getTime() - 1));
    expect(await submitRating({ negotiationId: NEGOTIATION, score: 4 })).toEqual({
      success: true,
      changed: true,
      published: false,
    });
    expect(tx.rating.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ evaluatorId: OWNER, evaluatedId: CHOSEN }),
      }),
    );
  });

  it.each([0, 1])('recusa no termino e depois dele (%s ms)', async (offset) => {
    const tx = database(new Date(DEADLINE.getTime() + offset));
    expect(await submitRating({ negotiationId: NEGOTIATION, score: 4 })).toMatchObject({
      success: false,
      reason: 'window_closed',
    });
    expect(tx.rating.create).not.toHaveBeenCalled();
    expect(tx.rating.update).not.toHaveBeenCalled();
  });

  it('invalida nao reabre a direcao nem permite substituir a nota', async () => {
    const tx = database(CLOSED_AT, { ...ownRating(), validity: 'invalidated' });
    expect(await submitRating({ negotiationId: NEGOTIATION, score: 5 })).toMatchObject({
      success: false,
      reason: 'invalidated',
    });
    expect(tx.rating.update).not.toHaveBeenCalled();
    const result = await getOwnRating(NEGOTIATION);
    expect(result).toMatchObject({ success: true, view: { canSubmit: false, canEdit: false } });
  });

  it('publicada e imutavel ainda dentro da janela', async () => {
    const tx = database(CLOSED_AT, { ...ownRating(), publishedAt: CLOSED_AT });
    expect(await submitRating({ negotiationId: NEGOTIATION, score: 5 })).toMatchObject({
      success: false,
      reason: 'already_published',
    });
    expect(tx.rating.update).not.toHaveBeenCalled();
  });
});

describe('consultas: projecoes sem a nota da contraparte', () => {
  it('retorna so nota propria, preserva o prazo e deriva publicacao no termino sem job', async () => {
    const tx = database(DEADLINE, ownRating());
    const result = await getOwnRating(NEGOTIATION);
    expect(result).toEqual({
      success: true,
      view: {
        ownRating: {
          score: 3,
          submittedAt: CLOSED_AT.toISOString(),
          published: true,
          validity: 'valid',
        },
        canSubmit: false,
        canEdit: false,
        deadline: DEADLINE.toISOString(),
        serverNow: DEADLINE.toISOString(),
      },
    });
    expect(tx.rating.findUnique).toHaveBeenCalledWith({
      where: { negotiationId_evaluatorId: { negotiationId: NEGOTIATION, evaluatorId: OWNER } },
      select: { score: true, submittedAt: true, publishedAt: true, validity: true },
    });
    expect(tx.rating.updateMany).not.toHaveBeenCalled();
  });

  it('projecao publica descarta campos extras e nunca expoe ids ou notas individuais', async () => {
    const raw = vi
      .fn()
      .mockResolvedValue([{ average: 4.5, count: 2, evaluatedId: OWNER, score: 5 }]);
    mock.prisma.mockReturnValue({ $queryRaw: raw });
    expect(await getPublicListingReputation(LISTING)).toEqual({ average: 4.5, count: 2 });
    const sql = (raw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('l."status" = \'published\' AND u."status" = \'active\'');
    expect(sql).toContain('r."validity" = \'valid\'');
    expect(sql).toContain('now() >= n."closed_at"');
  });

  it('publico inexistente retorna null e ausencia de notas conserva media null', async () => {
    mock.prisma.mockReturnValue({ $queryRaw: vi.fn().mockResolvedValue([]) });
    expect(await getPublicListingReputation(LISTING)).toBeNull();
    mock.prisma.mockReturnValue({
      $queryRaw: vi.fn().mockResolvedValue([{ average: null, count: 0 }]),
    });
    expect(await getPublicListingReputation(LISTING)).toEqual({ average: null, count: 0 });
  });
});
