'use server';

import { createContactRequest, type ContactRequestResult } from './reservation';

// Fronteira chamavel pelo cliente da solicitacao de desbloqueio (F3-003, #93).
// A regra inteira -- sessao, trava, vaga, tentativa e auditoria -- vive em
// reservation.ts. Nenhuma tela chama esta action ainda: a jornada e F3-012 (#102).

/** Reserva uma vaga do anuncio para a pessoa autenticada (PD-4.1, passo 1). */
export async function requestContactUnlock(listingId: string): Promise<ContactRequestResult> {
  return createContactRequest(listingId);
}
