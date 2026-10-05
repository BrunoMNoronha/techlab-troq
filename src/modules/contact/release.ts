import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { recordAuditEvent } from '@/modules/audit';

// Autorizacao de liberacao do contato (F3-009, #99; contact-release.md, CR-3).
// `ContactRelease` e de `contact` (AR-3.4): a escolha, em `negotiation`, chama
// esta funcao DENTRO da sua transacao, depois de verificar P1 a P7 sob as
// travas. Nao ha outro caminho de criacao (CR-3.3).
//
// A autorizacao nao contem o numero (CR-3.1), nao e revogada nem apagada
// (CR-3.5) e nao entrega nada (CR-1.2): a entrega e F3-010 (#100), que
// reverifica tudo a cada leitura (CR-5). Este modulo nao expoe UPDATE nem
// DELETE sobre ela.

export interface ContactReleaseInput {
  negotiationId: string;
  listingId: string;
  contactRequestId: string;
  /** Anunciante: titular do contato e ator da escolha. */
  ownerId: string;
  /** Solicitante escolhido: destinatario. */
  recipientId: string;
  /** Pagamento canonico aceito como evidencia (RB-001). */
  paymentId: string;
  /** `now()` da transacao da escolha. */
  at: Date;
}

/** Cria a autorizacao e a audita na transacao recebida (CR-3.2 a CR-3.4). */
export async function authorizeContactReleaseInTx(
  tx: Prisma.TransactionClient,
  input: ContactReleaseInput,
): Promise<{ contactReleaseId: string }> {
  const contactReleaseId = randomUUID();
  await tx.contactRelease.create({
    data: {
      id: contactReleaseId,
      negotiationId: input.negotiationId,
      listingId: input.listingId,
      contactRequestId: input.contactRequestId,
      ownerId: input.ownerId,
      recipientId: input.recipientId,
      paymentId: input.paymentId,
      authorizedAt: input.at,
    },
    select: { id: true },
  });
  await recordAuditEvent(tx, {
    eventType: 'contact.release_authorized',
    actorId: input.ownerId,
    targetType: 'contact_release',
    targetId: contactReleaseId,
    result: 'success',
    occurredAt: input.at,
    // Identificadores apenas: nunca o numero (CR-6.1, DM-11.2).
    details: {
      negotiationId: input.negotiationId,
      listingId: input.listingId,
      contactRequestId: input.contactRequestId,
      recipientId: input.recipientId,
      paymentId: input.paymentId,
    },
  });
  return { contactReleaseId };
}
