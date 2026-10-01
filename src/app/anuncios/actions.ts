'use server';

import { closeOwnedListing, type LifecycleResult } from '@/modules/listing';
import { endOpenReservationsOnListingClosure } from '@/modules/request';

// Composicao de T5/T6 (overview.md, AR-3.2: Server Actions ficam em src/app).
// `listing` aplica a transicao e chama, na mesma transacao, o efeito de
// `request` sobre as reservas (DM-6.10). Os dois modulos nao se importam em
// ciclo: `request` depende de `listing`, e o encerramento e montado aqui.

/** T5/T6 `published`|`paused` -> `closed`. Irreversivel; a tela exige confirmacao. */
export async function closeListing(listingId: string): Promise<LifecycleResult> {
  return closeOwnedListing(listingId, endOpenReservationsOnListingClosure);
}
