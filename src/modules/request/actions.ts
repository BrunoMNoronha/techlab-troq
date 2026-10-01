'use server';

import { getPixPaymentFlow, requestContactUnlockFlow, type PixChargeResult } from './charge-flow';

// Fronteira chamavel pelo cliente da solicitacao de desbloqueio (F3-003, #93;
// F3-005, #95). A regra inteira -- sessao, trava, vaga, tentativa, cobranca e
// auditoria -- vive em reservation.ts, charge-flow.ts e no modulo `payments`.
// Nenhuma tela chama estas actions ainda: a jornada e F3-012 (#102).

/** Reserva uma vaga e gera o Pix de R$ 0,99 (PD-4.1, passos 1 a 3). */
export async function requestContactUnlock(listingId: string): Promise<PixChargeResult> {
  return requestContactUnlockFlow(listingId);
}

/** Reapresenta (ou retoma) o Pix da reserva viva do proprio solicitante. */
export async function getPixPayment(contactRequestId: string): Promise<PixChargeResult> {
  return getPixPaymentFlow(contactRequestId);
}
