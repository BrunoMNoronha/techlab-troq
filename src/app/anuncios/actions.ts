'use server';

import { closeOwnedListing, type LifecycleResult } from '@/modules/listing';
import { createMercadoPagoClient } from '@/modules/payments';
import {
  cancelChargesOfClosedListing,
  endOpenReservationsOnListingClosure,
} from '@/modules/request';

// Composicao de T5/T6 (overview.md, AR-3.2: Server Actions ficam em src/app).
// `listing` aplica a transicao e chama, na mesma transacao, o efeito de
// `request` sobre as reservas (DM-6.10). Os dois modulos nao se importam em
// ciclo: `request` depende de `listing`, e o encerramento e montado aqui.
// Depois do COMMIT, as cobrancas sem acreditacao das reservas encerradas sao
// canceladas (PD-8.10; F3-007), sem afetar o resultado do encerramento.

const CANCEL_TIMEOUT_MS = 4_000;

/** T5/T6 `published`|`paused` -> `closed`. Irreversivel; a tela exige confirmacao. */
export async function closeListing(listingId: string): Promise<LifecycleResult> {
  const result = await closeOwnedListing(listingId, endOpenReservationsOnListingClosure);
  if (result.success) {
    try {
      // Tempo limite curto por chamada: o dono espera a resposta desta action.
      await cancelChargesOfClosedListing(listingId, {
        gateway: createMercadoPagoClient({ timeoutMs: CANCEL_TIMEOUT_MS }),
      });
    } catch (err) {
      console.error('[anuncios] falha ao cancelar cobrancas do anuncio encerrado', {
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
  return result;
}
