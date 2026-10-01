import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { recordAuditEvent } from '@/modules/audit';

// Tentativa de pagamento da reserva (payments-design.md, PD-2.1, PD-4.1 passo 1,
// PD-5). Criada DENTRO da transacao que reserva a vaga, por quem e dono dela
// (`request`); este modulo nao conhece a vaga e nao chama o provedor aqui — a
// cobranca e o passo 2 (F3-005, #95).
//
// Chave de idempotencia (PD-5.1): UUID versao 5 (RFC 9562, secao 5.5) sobre um
// espaco de nomes fixo do TROQ e o identificador da tentativa. Deterministica,
// sem colisao pratica entre tentativas diferentes e sem nada da pessoa, do
// anuncio ou do valor. No formato UUID, o mesmo que a documentacao do provedor
// usa nos exemplos de `X-Idempotency-Key`.
//
// PD-5.2: a chave e PERSISTIDA aqui e relida em toda retentativa
// (`readPersistedIdempotencyKey`); ela nunca e recalculada no momento da
// chamada. Mudar o espaco de nomes no futuro nao muda a chave de tentativa antiga.

/** Espaco de nomes v5 das chaves de idempotencia de tentativa do TROQ. Nunca muda. */
export const PAYMENT_ATTEMPT_KEY_NAMESPACE = '6b3f2a8e-9d41-4c7b-a0e5-3f1d9c2b7e64';

/** Prefixo do `external_reference` enviado ao provedor (PD-2.1). */
const EXTERNAL_REFERENCE_PREFIX = 'troq-pa-';

function uuidBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** UUID v5 de `name` no espaco `namespace` (SHA-1 truncado, versao e variante fixadas). */
export function uuidV5(name: string, namespace: string): string {
  const hash = createHash('sha1')
    .update(Buffer.concat([uuidBytes(namespace), Buffer.from(name, 'utf8')]))
    .digest()
    .subarray(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return formatUuid(hash);
}

/** Chave de idempotencia derivada da identidade da tentativa (PD-5.1). */
export function deriveIdempotencyKey(attemptId: string): string {
  return uuidV5(`payment-attempt:${attemptId}`, PAYMENT_ATTEMPT_KEY_NAMESPACE);
}

/** `external_reference` derivado da identidade da tentativa (PD-2.1, PD-4.2). */
export function deriveExternalReference(attemptId: string): string {
  return `${EXTERNAL_REFERENCE_PREFIX}${attemptId}`;
}

export interface CreatedPaymentAttempt {
  id: string;
  idempotencyKey: string;
  externalReference: string;
}

/**
 * Cria a tentativa unica da solicitacao em `tentativa_criada`, com a chave ja
 * persistida, e audita a criacao (DM-11.1) na transacao recebida. A unicidade
 * por solicitacao e do banco (DM-7.1): uma segunda tentativa falha a transacao.
 */
export async function createPaymentAttempt(
  tx: Prisma.TransactionClient,
  input: { contactRequestId: string; actorId: string; at: Date },
): Promise<CreatedPaymentAttempt> {
  const id = randomUUID();
  const attempt: CreatedPaymentAttempt = {
    id,
    idempotencyKey: deriveIdempotencyKey(id),
    externalReference: deriveExternalReference(id),
  };
  await tx.paymentAttempt.create({
    data: {
      ...attempt,
      contactRequestId: input.contactRequestId,
      status: 'tentativa_criada',
      createdAt: input.at,
      updatedAt: input.at,
    },
  });
  await recordAuditEvent(tx, {
    eventType: 'payment.attempt_created',
    actorId: input.actorId,
    targetType: 'payment_attempt',
    targetId: id,
    result: 'success',
    occurredAt: input.at,
    details: { contactRequestId: input.contactRequestId, status: 'tentativa_criada' },
  });
  return attempt;
}

/**
 * Releitura da chave PERSISTIDA para uma retentativa (PD-5.2). Devolve `null`
 * se a tentativa nao existe; nunca deriva uma chave nova.
 */
export async function readPersistedIdempotencyKey(
  tx: Prisma.TransactionClient,
  attemptId: string,
): Promise<string | null> {
  const row = await tx.paymentAttempt.findUnique({
    where: { id: attemptId },
    select: { idempotencyKey: true },
  });
  return row?.idempotencyKey ?? null;
}
