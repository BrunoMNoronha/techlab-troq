import type { AuthorizedRelease, ContactChainCheck } from '@/modules/contact';
import { readRequestLinkInTx } from '@/modules/request';

// A4 e A5 de CR-5.2 para a entrega do contato (F3-010, #100). `negotiation` e
// dono de `Selection` e `Negotiation`; `request`, da solicitacao. A
// correlacao e verificada no servidor, a partir da autorizacao ja amarrada ao
// ator, e nunca montada a partir da requisicao (CR-5.2, A4).
//
// O estado da negociacao NAO e conferido: encerrar a negociacao nao afeta a
// liberacao ja concedida (DEC-029, secao 9.2). O estado do anuncio tambem nao:
// nenhuma transicao revoga a liberacao (DEC-027, secao 5).

/** A cadeia negociacao -> escolha -> solicitacao -> anuncio e a mesma, e a solicitacao esta `paid`. */
export const verifyContactReleaseChain: ContactChainCheck = async (
  tx,
  release: AuthorizedRelease,
) => {
  const negotiation = await tx.negotiation.findUnique({
    where: { id: release.negotiationId },
    select: {
      listingId: true,
      ownerId: true,
      chosenId: true,
      selection: { select: { listingId: true, contactRequestId: true, actorId: true } },
    },
  });
  if (!negotiation) return false;
  const { selection } = negotiation;
  const sameChain =
    negotiation.listingId === release.listingId &&
    negotiation.ownerId === release.ownerId &&
    negotiation.chosenId === release.recipientId &&
    selection.listingId === release.listingId &&
    selection.contactRequestId === release.contactRequestId &&
    selection.actorId === release.ownerId;
  if (!sameChain) return false;

  // A5: a solicitacao correlacionada esta `paid` AGORA, e e do mesmo anuncio e
  // do mesmo solicitante.
  const request = await readRequestLinkInTx(tx, release.contactRequestId);
  return (
    request !== null &&
    request.status === 'paid' &&
    request.listingId === release.listingId &&
    request.requesterId === release.recipientId
  );
};
