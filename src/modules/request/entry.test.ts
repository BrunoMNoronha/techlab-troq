import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as contactModule from '@/modules/contact';
import * as identityModule from '@/modules/identity';
import * as listingModule from '@/modules/listing';
import { getContactRequestEntry, getContactRequestEntryView } from './entry';

vi.mock('@/modules/contact', () => ({ hasContact: vi.fn() }));
vi.mock('@/modules/identity', () => ({ validateSession: vi.fn() }));
vi.mock('@/modules/listing', () => ({
  getPublicListingDetail: vi.fn(),
  getListingOwnerId: vi.fn(),
}));

const queryRaw = vi.fn();
const sqlOf = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');
/** Responde a contagem de vagas e a busca da solicitacao aberta do ator, pela SQL. */
function database({ occupied = 0, openRequestId = null as string | null } = {}) {
  queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('count(*)')) return [{ occupied }];
    return openRequestId ? [{ id: openRequestId }] : [];
  });
}
vi.mock('@/persistence/prisma', () => ({
  getPrismaClient: () => ({ $queryRaw: (...a: unknown[]) => queryRaw(...a) }),
}));

const validateSession = vi.mocked(identityModule.validateSession);
const getPublicListingDetail = vi.mocked(listingModule.getPublicListingDetail);
const getListingOwnerId = vi.mocked(listingModule.getListingOwnerId);
const hasContact = vi.mocked(contactModule.hasContact);

const LISTING_ID = '0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f';
const listing = {
  id: LISTING_ID,
  title: 'Bicicleta',
  description: 'Aro 29',
  city: 'Recife',
  state: 'PE',
  tradeOptions: [],
  createdAt: new Date(),
  images: [],
};
const OWNER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
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
    getListingOwnerId.mockResolvedValue(OWNER_ID);
    hasContact.mockResolvedValue(true);
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
    getListingOwnerId.mockResolvedValue(user.id);

    expect(await getContactRequestEntry(LISTING_ID)).toBe('own_listing');
    expect(getListingOwnerId).toHaveBeenCalledWith(LISTING_ID);
    expect(hasContact).not.toHaveBeenCalled();
  });

  it('anunciante sem contato cadastrado nao aceita solicitacao (DEC-040)', async () => {
    validateSession.mockResolvedValue({ user, isValid: true });
    hasContact.mockResolvedValue(false);
    database();

    expect(await getContactRequestEntry(LISTING_ID)).toBe('not_accepting');
    // A verificacao e sobre o DONO do anuncio, nunca sobre quem visita.
    expect(hasContact).toHaveBeenCalledWith(expect.anything(), OWNER_ID);
    // Nenhuma contagem de vagas para quem nao pode solicitar.
    expect(queryRaw.mock.calls.some((c) => sqlOf(c).includes('count(*)'))).toBe(false);
  });

  it('quem ja tem solicitacao aberta no anuncio recebe own_request com o id DELA (F3-012)', async () => {
    const OWN_REQUEST = '7c6b5a49-3827-4615-8a9b-0c1d2e3f4a5b';
    validateSession.mockResolvedValue({ user, isValid: true });
    database({ openRequestId: OWN_REQUEST });

    expect(await getContactRequestEntryView(LISTING_ID)).toEqual({
      state: 'own_request',
      ownRequestId: OWN_REQUEST,
    });
    // A busca e restrita ao proprio ator e as solicitacoes abertas (reserva viva ou paga).
    const [call] = queryRaw.mock.calls;
    const sql = sqlOf(call);
    expect(sql).toContain('"requester_id" =');
    expect(sql).toContain(`"status" = 'paid'`);
    expect(sql).toContain('"reserved_until" > now()');
    expect(call.slice(1)).toEqual([LISTING_ID, user.id]);
    // Vem antes de `not_accepting`: quem pagou acompanha mesmo sem contato do anunciante.
    expect(hasContact).not.toHaveBeenCalled();
  });

  it('os demais estados nao carregam id de solicitacao', async () => {
    validateSession.mockResolvedValue({ user, isValid: true });
    database({ occupied: 1 });

    expect(await getContactRequestEntryView(LISTING_ID)).toEqual({
      state: 'request_available',
      ownRequestId: null,
    });
  });

  it.each([
    [0, 'request_available'],
    [2, 'request_available'],
    [3, 'no_slots'],
  ] as const)(
    'elegivel com %i vagas ocupadas recebe %s, sem criar nada',
    async (occupied, state) => {
      validateSession.mockResolvedValue({ user, isValid: true });
      database({ occupied });

      expect(await getContactRequestEntry(LISTING_ID)).toBe(state);
      // So leitura: a contagem considera `paid` e `reserved` ainda na janela.
      const count = queryRaw.mock.calls.find((c) => sqlOf(c).includes('count(*)'));
      const sqlText = sqlOf(count!);
      expect(sqlText).toContain('"status" = \'paid\'');
      expect(sqlText).toContain('"reserved_until" > now()');
      expect(sqlText).not.toMatch(/INSERT|UPDATE|DELETE/);
    },
  );

  it('o estado devolvido nao revela quantas vagas estao ocupadas', async () => {
    validateSession.mockResolvedValue({ user, isValid: true });
    database({ occupied: 1 });

    expect(JSON.stringify(await getContactRequestEntryView(LISTING_ID))).not.toMatch(/\d/);
  });
});
