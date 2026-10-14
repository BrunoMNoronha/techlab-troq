'use server';

import { getPixPaymentFlow, requestContactUnlockFlow, type PixChargeResult } from './charge-flow';
import { getContactRequestEntryView, type ContactRequestEntryView } from './entry';

// Fronteira chamavel pelo cliente da solicitacao de desbloqueio (F3-003, #93;
// F3-005, #95). A regra inteira -- sessao, trava, vaga, tentativa, cobranca e
// auditoria -- vive em reservation.ts, charge-flow.ts e no modulo `payments`.
// Chamadas pela jornada de F3-012 (#102): a confirmacao no detalhe publico
// (`/explorar/[id]`) e a tela do Pix (`/solicitacoes/[id]`). Desde DEC-056, tambem
// o dialogo do card da vitrine (home e `/explorar`).

/** Reserva uma vaga e gera o Pix de R$ 0,99 (PD-4.1, passos 1 a 3). */
export async function requestContactUnlock(listingId: string): Promise<PixChargeResult> {
  return requestContactUnlockFlow(listingId);
}

/** Reapresenta (ou retoma) o Pix da reserva viva do proprio solicitante. */
export async function getPixPayment(contactRequestId: string): Promise<PixChargeResult> {
  return getPixPaymentFlow(contactRequestId);
}

/**
 * Estado da entrada da solicitacao para o dialogo do card (DEC-056). Somente
 * leitura: nao reserva, nao cobra e nao grava nada (interest-flow.md, IF-5 a
 * IF-8). E o mesmo calculo do bloco do detalhe; `ownRequestId` so vem para o
 * proprio solicitante, como la.
 */
export async function getContactRequestCardState(
  listingId: string,
): Promise<ContactRequestEntryView> {
  return getContactRequestEntryView(listingId);
}
