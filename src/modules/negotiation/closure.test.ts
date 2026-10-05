// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeNegotiationFlow, getOwnNegotiation, listOwnedListingNegotiations } from './closure';

const mocks = vi.hoisted(() => ({ session: vi.fn(), db: vi.fn() }));
vi.mock('@/modules/identity', () => ({ validateSession: mocks.session }));
vi.mock('@/modules/audit', () => ({ recordAuditEvent: vi.fn() }));
vi.mock('@/modules/listing', () => ({ lockListingForRequest: vi.fn() }));
vi.mock('@/persistence/prisma', () => ({ getPrismaClient: mocks.db }));

const ID = '4a0458e0-3052-44da-ae12-81780410323f';

describe('fronteira de encerramento da negociacao (#163)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ isValid: true, user: { id: ID } });
  });

  it.each([
    ['no_session', 'login_required'],
    ['unverified', 'email_unverified'],
    ['blocked', 'account_restricted'],
    ['deletion_requested', 'account_restricted'],
  ])('sessao %s recusa comando e consultas sem tocar no banco', async (reason, expected) => {
    mocks.session.mockResolvedValue({ isValid: false, user: null, reason });
    for (const result of [
      await closeNegotiationFlow({ negotiationId: ID, confirmed: true }),
      await getOwnNegotiation(ID),
      await listOwnedListingNegotiations(ID),
    ]) {
      expect(result).toMatchObject({ success: false, reason: expected });
    }
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it.each([false, undefined, 'true', 1, null])(
    'confirmacao %s nao autoriza o encerramento',
    async (confirmed) => {
      expect(await closeNegotiationFlow({ negotiationId: ID, confirmed } as never)).toMatchObject({
        success: false,
        reason: 'confirmation_required',
      });
      expect(mocks.db).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'inexistente', 'javascript:alert(1)', null, { id: ID }])(
    'id arbitrario %s e recusado sem consulta nem eco do valor',
    async (negotiationId) => {
      const result = await closeNegotiationFlow({ negotiationId, confirmed: true } as never);
      expect(result).toEqual({
        success: false,
        reason: 'not_found',
        error: 'Negociação não encontrada.',
      });
      expect(mocks.db).not.toHaveBeenCalled();
    },
  );
});
