// Entrada da jornada de solicitacao de desbloqueio a partir do detalhe publico
// do anuncio (#59). Decide, no servidor e a cada requisicao, o que a pessoa
// pode fazer: entrar, confirmar e-mail, nada (conta restrita ou anuncio proprio)
// ou solicitar, com ou sem vaga livre.
//
// F3-003 (#93): a reserva passou a existir (reservation.ts), e o elegivel recebe
// `request_available` ou `no_slots`. A tela que dispara a reserva e a cobranca
// e de F3-012 (#102). Esta funcao so le; nao e Server Action e nao e endpoint.
//
// F3-002 (#92, DEC-040): anuncio cujo dono nao tem contato cadastrado continua
// visivel, mas recebe `not_accepting`, sem revelar o motivo ao visitante. A
// decisao real e a mesma verificacao, sob a trava, em reservation.ts.
//
// F3-012 (#102): quem ja tem solicitacao aberta no anuncio (`reserved` dentro
// da janela ou `paid`) recebe `own_request` e o id DELA, para a tela levar ao
// Pix ja gerado ou ao acompanhamento, em vez de oferecer outra (DEC-041/051). So o
// proprio solicitante recebe esse id. A solicitacao continua decidida no
// servidor, sob a trava, por reservation.ts e charge-flow.ts.
import { hasContact } from '@/modules/contact';
import { validateSession } from '@/modules/identity';
import { getListingOwnerId, getPublicListingDetail } from '@/modules/listing';
import { getPrismaClient } from '@/persistence/prisma';
import { findOpenRequestOf } from './tracking';

export type ContactRequestEntryState =
  | 'listing_unavailable'
  | 'login_required'
  | 'email_unverified'
  | 'account_restricted'
  | 'own_listing'
  | 'own_request'
  | 'not_accepting'
  | 'request_available'
  | 'no_slots';

/**
 * Vagas ocupadas AGORA: `paid` e `reserved` ainda dentro da janela. Leitura sem
 * trava, so para orientar a tela; a decisao real e da transacao da reserva. O
 * resultado nao sai daqui: a tela so sabe se ha vaga, nunca quantas pagas existem.
 */
async function hasFreeSlot(listingId: string): Promise<boolean> {
  const [{ occupied }] = await getPrismaClient().$queryRaw<{ occupied: number }[]>`
    SELECT count(*)::int AS "occupied" FROM "contact_requests"
    WHERE "listing_id" = ${listingId}::uuid
      AND ("status" = 'paid' OR ("status" = 'reserved' AND "reserved_until" > now()))`;
  return occupied < 3;
}

export interface ContactRequestEntryView {
  state: ContactRequestEntryState;
  /** So em `own_request`: a solicitacao aberta do proprio ator neste anuncio. */
  ownRequestId: string | null;
}

export async function getContactRequestEntry(listingId: string): Promise<ContactRequestEntryState> {
  return (await getContactRequestEntryView(listingId)).state;
}

export async function getContactRequestEntryView(
  listingId: string,
): Promise<ContactRequestEntryView> {
  const state = (s: ContactRequestEntryState): ContactRequestEntryView => ({
    state: s,
    ownRequestId: null,
  });
  const listing = await getPublicListingDetail(listingId);
  if (!listing) {
    return state('listing_unavailable');
  }

  const session = await validateSession();
  if (!session.isValid || !session.user) {
    switch (session.reason) {
      case 'unverified':
        return state('email_unverified');
      case 'blocked':
      case 'deletion_requested':
        return state('account_restricted');
      default:
        return state('login_required');
    }
  }

  const ownerId = await getListingOwnerId(listing.id);
  if (!ownerId) {
    return state('listing_unavailable');
  }
  if (ownerId === session.user.id) {
    return state('own_listing');
  }
  // Antes de `not_accepting`: quem ja pagou continua acompanhando a propria
  // solicitacao mesmo que o anunciante tenha retirado o contato depois.
  const ownRequestId = await findOpenRequestOf(listing.id, session.user.id);
  if (ownRequestId) {
    return { state: 'own_request', ownRequestId };
  }
  if (!(await hasContact(getPrismaClient(), ownerId))) {
    return state('not_accepting');
  }

  return state((await hasFreeSlot(listing.id)) ? 'request_available' : 'no_slots');
}
