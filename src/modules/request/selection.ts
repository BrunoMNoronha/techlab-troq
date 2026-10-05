import type { Prisma } from '@/generated/prisma/client';
import { readConfirmedPaymentEvidence } from '@/modules/payments';

// Elegibilidade das solicitacoes para a escolha (F3-009, #99; contact-release.md,
// CR-3.2 P2 e P3, CR-4.1; payments-design.md, PD-11.3). `request` e dono da
// solicitacao; `negotiation` decide a escolha e nunca le `contact_requests` nem
// as tabelas de pagamento diretamente (conventions.md, secao 2.2).
//
// Elegivel AGORA = solicitacao `paid` cuja tentativa esta confirmada, com
// pagamento canonico (`readConfirmedPaymentEvidence`). Elegibilidade muda com o
// tempo e nao e autorizacao (CR-4.1): por isso a escolha relê tudo sob a trava,
// e a lista ao dono e so orientacao.

/** Cliente do Prisma ou transacao em curso. */
export type SelectionReader = Pick<Prisma.TransactionClient, 'contactRequest' | '$queryRaw'>;

export interface LockedRequestForSelection {
  id: string;
  requesterId: string;
  /** `paid` com pagamento confirmado, lido sob a trava. */
  eligible: boolean;
  /** Pagamento canonico aceito como evidencia (ContactRelease.paymentId), se elegivel. */
  paymentId: string | null;
}

/**
 * Trava a linha da solicitacao, se ela pertence ao anuncio (P2), e diz se ela e
 * elegivel (P3). Chamado DENTRO da transacao da escolha, depois da trava do
 * anuncio (DM-6.12). Solicitacao de outro anuncio, inexistente ou com ID
 * malformado devolve `null`, sem distinguir os casos.
 */
export async function lockRequestForSelection(
  tx: Prisma.TransactionClient,
  listingId: string,
  contactRequestId: string,
): Promise<LockedRequestForSelection | null> {
  const [row] = await tx.$queryRaw<{ id: string; requesterId: string; status: string }[]>`
    SELECT "id"::text AS "id", "requester_id"::text AS "requesterId", "status"::text AS "status"
    FROM "contact_requests"
    WHERE "id" = ${contactRequestId}::uuid AND "listing_id" = ${listingId}::uuid
    FOR UPDATE`;
  if (!row) return null;
  if (row.status !== 'paid') {
    return { id: row.id, requesterId: row.requesterId, eligible: false, paymentId: null };
  }
  const evidence = await readConfirmedPaymentEvidence(tx, [row.id]);
  const paymentId = evidence.get(row.id) ?? null;
  return { id: row.id, requesterId: row.requesterId, eligible: paymentId !== null, paymentId };
}

export interface RequestLink {
  listingId: string;
  requesterId: string;
  status: string;
}

/**
 * Anuncio, solicitante e estado ATUAL da solicitacao, para a entrega do contato
 * conferir a cadeia (CR-5.2, A4) e o `paid` (A5) no instante da leitura (F3-010,
 * #100). Sem trava: `paid` nao tem transicao de saida (DM-6.7, I-8).
 */
export async function readRequestLinkInTx(
  tx: Prisma.TransactionClient,
  contactRequestId: string,
): Promise<RequestLink | null> {
  const [row] = await tx.$queryRaw<RequestLink[]>`
    SELECT "listing_id"::text AS "listingId", "requester_id"::text AS "requesterId",
           "status"::text AS "status"
    FROM "contact_requests" WHERE "id" = ${contactRequestId}::uuid`;
  return row ?? null;
}

export interface EligibleRequest {
  contactRequestId: string;
  requesterDisplayName: string;
  paidAt: Date;
}

/**
 * Solicitacoes pagas ELEGIVEIS do anuncio, da mais antiga para a mais nova.
 * Nao verifica quem pergunta: o chamador ja provou que o ator e o dono
 * (PD-11.3). Solicitacao nao paga, revertida ou em estado incerto nunca
 * aparece (CR-4.2). So o nome de exibicao do solicitante sai daqui; nada de
 * e-mail nem de dado de pagamento.
 */
export async function listEligibleRequests(
  db: SelectionReader,
  listingId: string,
): Promise<EligibleRequest[]> {
  const paid = await db.contactRequest.findMany({
    where: { listingId, status: 'paid' },
    orderBy: [{ paidAt: 'asc' }, { slotIndex: 'asc' }],
    select: { id: true, paidAt: true, requester: { select: { displayName: true } } },
  });
  const evidence = await readConfirmedPaymentEvidence(
    db,
    paid.map((r) => r.id),
  );
  return paid
    .filter((r) => evidence.has(r.id) && r.paidAt !== null)
    .map((r) => ({
      contactRequestId: r.id,
      requesterDisplayName: r.requester.displayName,
      paidAt: r.paidAt as Date,
    }));
}
