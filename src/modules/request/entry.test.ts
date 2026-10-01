import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as identityModule from '@/modules/identity';
import * as listingModule from '@/modules/listing';
import { getContactRequestEntry } from './entry';

vi.mock('@/modules/identity', () => ({ validateSession: vi.fn() }));
vi.mock('@/modules/listing', () => ({
  getPublicListingDetail: vi.fn(),
  isListingOwnedBy: vi.fn(),
}));

const queryRaw = vi.fn();
vi.mock('@/persistence/prisma', () => ({
  getPrismaClient: () => ({ $queryRaw: (...a: unknown[]) => queryRaw(...a) }),
}));

const validateSession = vi.mocked(identityModule.validateSession);
const getPublicListingDetail = vi.mocked(listingModule.getPublicListingDetail);
const isListingOwnedBy = vi.mocked(listingModule.isListingOwnedBy);

const LISTING_ID = '0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f';
const listing = {
  id: LISTING_ID,
  title: 'Bicicleta',
  description: 'Aro 29',
  city: 'Recife',
  state: 'PE',
  createdAt: new Date(),
  images: [],
};
const user = {
  id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
  email: 'pessoa@example.test',
  displayName: 'Pessoa',
  emailVerified: true,
  status: 'active' as const,
};

describe('getContactRequestEntry — entrada da solicitacao de desbloqueio (#59)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getPublicListingDetail.mockResolvedValue(listing);
    isListingOwnedBy.mockResolvedValue(false);
  });

  it('anuncio indisponivel (rascunho, pausado, conta inelegivel) nao abre a jornada', async () => {
    getPublicListingDetail.mockResolvedValue(null);

    expect(await getContactRequestEntry(LISTING_ID)).toBe('listing_unavailable');
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('visitante sem sessao ou com sessao expirada/revogada precisa entrar', async () => {
    validateSession.mockResolvedValue({
      user: null,
      isValid: false,
      reason: 'no_session',
    });

    expect(await getContactRequestEntry(LISTING_ID)).toBe('login_required');
  });

  it('email nao verificado nao pode solicitar', async () => {
    validateSession.mockResolvedValue({
      user: { ...user, emailVerified: false },
      isValid: false,
      reason: 'unverified',
    });

    expect(await getContactRequestEntry(LISTING_ID)).toBe('email_unverified');
  });

  it.each(['blocked', 'deletion_requested'] as const)('conta %s fica restrita', async (reason) => {
    validateSession.mockResolvedValue({ user, isValid: false, reason });

    expect(await getContactRequestEntry(LISTING_ID)).toBe('account_restricted');
  });

  it('anunciante nao solicita o proprio contato', async () => {
    validateSession.mockResolvedValue({ user, isValid: true });
    isListingOwnedBy.mockResolvedValue(true);

    expect(await getContactRequestEntry(LISTING_ID)).toBe('own_listing');
    expect(isListingOwnedBy).toHaveBeenCalledWith(LISTING_ID, user.id);
  });

  it.each([
    [0, 'request_available'],
    [2, 'request_available'],
    [3, 'no_slots'],
  ] as const)(
    'elegivel com %i vagas ocupadas recebe %s, sem criar nada',
    async (occupied, state) => {
      validateSession.mockResolvedValue({ user, isValid: true });
      queryRaw.mockResolvedValue([{ occupied }]);

      expect(await getContactRequestEntry(LISTING_ID)).toBe(state);
      // So leitura: a contagem considera `paid` e `reserved` ainda na janela.
      const sqlText = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
      expect(sqlText).toContain('"status" = \'paid\'');
      expect(sqlText).toContain('"reserved_until" > now()');
      expect(sqlText).not.toMatch(/INSERT|UPDATE|DELETE/);
    },
  );

  it('o estado devolvido nao revela quantas vagas estao ocupadas', async () => {
    validateSession.mockResolvedValue({ user, isValid: true });
    queryRaw.mockResolvedValue([{ occupied: 1 }]);

    expect(JSON.stringify(await getContactRequestEntry(LISTING_ID))).not.toMatch(/\d/);
  });
});
