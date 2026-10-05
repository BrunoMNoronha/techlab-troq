import type { Prisma } from '@/generated/prisma/client';

// Evidencia de pagamento aceita para a escolha (F3-009, #99; contact-release.md,
// CR-3.2 P3 e CR-4.1; payments-design.md, PD-9.2). `payments` e dono do
// dinheiro (AR-3.5): `request` e `negotiation` perguntam aqui, e so aqui, se a
// cobranca de uma solicitacao esta confirmada, sem ler as tabelas de pagamento.
//
// Confirmada = tentativa em `pagamento_confirmado`, com instante de acreditacao,
// e um pagamento canonico eleito (PD-7.1). Qualquer outro estado -- inclusive
// `em_confirmacao`, `reembolso_pendente`, `inconsistente` e
// `reembolsada_ou_revertida` -- nao e evidencia: estado incerto nunca concede
// direito (PE-1.6, PE-6.11). A reversao de pagamento ja confirmado (F3-011,
// #101) tira a tentativa de `pagamento_confirmado` (reversal.ts), e por isso
// a solicitacao deixa de ser elegivel sem mudar esta consulta (CR-4.2; PD-9.5).
// Uma tentativa com excedente devolvido (RT-1) continua confirmada:
// o canonico segue valido (PD-8, nota de PD-7.3).

/** Cliente do Prisma ou transacao em curso: so `$queryRaw` e usado. */
export type PaymentEvidenceReader = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * Pagamento canonico que comprova a confirmacao de cada solicitacao, por id da
 * solicitacao. Solicitacao sem confirmacao nao aparece no mapa. Aceita a
 * transacao do chamador, para que a leitura aconteca sob a trava dele.
 */
export async function readConfirmedPaymentEvidence(
  db: PaymentEvidenceReader,
  contactRequestIds: readonly string[],
): Promise<Map<string, string>> {
  if (contactRequestIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ contactRequestId: string; paymentId: string }[]>`
    SELECT pa."contact_request_id"::text AS "contactRequestId", p."id"::text AS "paymentId"
    FROM "payment_attempts" pa
    JOIN "payments" p ON p."payment_attempt_id" = pa."id" AND p."is_canonical"
    WHERE pa."contact_request_id" = ANY(${contactRequestIds as string[]}::uuid[])
      AND pa."status" = 'pagamento_confirmado'
      AND pa."accredited_at" IS NOT NULL`;
  return new Map(rows.map((r) => [r.contactRequestId, r.paymentId]));
}
