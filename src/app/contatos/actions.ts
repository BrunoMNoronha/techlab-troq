'use server';

import { deliverAuthorizedContact, type ContactDeliveryResult } from '@/modules/contact';
import { verifyContactReleaseChain } from '@/modules/negotiation';

// Obtencao sob demanda do contato liberado (F3-010, #100; contact-release.md,
// CR-6.2 item 2 e CR-7.4 item 4): Server Action (POST), disparada por gesto
// explicito do escolhido, autorizada por A1 a A6 a cada chamada. O id da
// autorizacao so seleciona dentro do conjunto do ator (CR-5.3).
//
// Composicao em `src/app` (overview.md, AR-3.2): `contact` guarda o dado e
// declara a porta da cadeia; `negotiation` a implementa. `contact` nao importa
// `negotiation` nem `request`.

/** Entrega o contato do anunciante da autorizacao, se o ator for o escolhido. */
export async function revealContact(contactReleaseId: string): Promise<ContactDeliveryResult> {
  return deliverAuthorizedContact(contactReleaseId, verifyContactReleaseChain);
}
