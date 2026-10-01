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
import { hasContact } from '@/modules/contact';
import { validateSession } from '@/modules/identity';
import { getListingOwnerId, getPublicListingDetail } from '@/modules/listing';
import { getPrismaClient } from '@/persistence/prisma';

export type ContactRequestEntryState =
  | 'listing_unavailable'
  | 'login_required'
  | 'email_unverified'
  | 'account_restricted'
  | 'own_listing'
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

export async function getContactRequestEntry(listingId: string): Promise<ContactRequestEntryState> {
  const listing = await getPublicListingDetail(listingId);
  if (!listing) {
    return 'listing_unavailable';
  }

  const session = await validateSession();
  if (!session.isValid || !session.user) {
    switch (session.reason) {
      case 'unverified':
        return 'email_unverified';
      case 'blocked':
      case 'deletion_requested':
        return 'account_restricted';
      default:
        return 'login_required';
    }
  }

  const ownerId = await getListingOwnerId(listing.id);
  if (!ownerId) {
    return 'listing_unavailable';
  }
  if (ownerId === session.user.id) {
    return 'own_listing';
  }
  if (!(await hasContact(getPrismaClient(), ownerId))) {
    return 'not_accepting';
  }

  return (await hasFreeSlot(listing.id)) ? 'request_available' : 'no_slots';
}
