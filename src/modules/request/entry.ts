// Entrada da jornada de solicitacao de desbloqueio a partir do detalhe publico
// do anuncio (#59). Decide, no servidor e a cada requisicao, o que a pessoa
// pode fazer: entrar, confirmar e-mail, nada (conta restrita ou anuncio proprio)
// ou iniciar a solicitacao.
//
// A solicitacao paga (reserva de vaga, cobranca Pix de R$ 0,99, liberacao de
// contato) pertence a Fase 3 (#54) e ainda nao existe. Por isso o estado para
// quem e elegivel e `request_unavailable`: nada e criado, reservado ou cobrado.
// Esta funcao so le; nao e Server Action e nao e exposta como endpoint.
import { validateSession } from '@/modules/identity';
import { getPublicListingDetail, isListingOwnedBy } from '@/modules/listing';

export type ContactRequestEntryState =
  | 'listing_unavailable'
  | 'login_required'
  | 'email_unverified'
  | 'account_restricted'
  | 'own_listing'
  | 'request_unavailable';

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

  if (await isListingOwnedBy(listing.id, session.user.id)) {
    return 'own_listing';
  }

  return 'request_unavailable';
}
