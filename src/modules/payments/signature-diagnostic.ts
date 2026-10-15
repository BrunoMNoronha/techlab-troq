import { recordAuditEvent } from '@/modules/audit';
import { getPrismaClient } from '@/persistence/prisma';
import type { WebhookConfig } from './mercado-pago/config';
import type { NotificationInput } from './mercado-pago/signature';
import { diagnoseRejectedSignature } from './mercado-pago/signature-diagnostic';

const EVENT_TYPE = 'payment.notification_signature_diagnostic';

/**
 * Best-effort APOS o registro normal da recusa, em transacao independente.
 * Lock + check persistido limitam a um evento por tentativa, mesmo entre
 * instancias concorrentes. Order sem tentativa do TROQS nao grava nada.
 * Nunca registra PaymentNotification, muda pagamento ou autoriza outro perfil.
 */
export async function recordPreviewSignatureDiagnostic(
  input: NotificationInput,
  config: WebhookConfig,
): Promise<void> {
  try {
    const diagnostic = diagnoseRejectedSignature(input, config);
    if (diagnostic === null) return;
    const lockScope = `payments:preview-signature-diagnostic:${diagnostic.orderId}`;

    await getPrismaClient().$transaction(
      async (tx) => {
        // Limites locais a esta transacao; nenhuma espera indefinida no webhook.
        await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockScope}, 0))`;
        const [attempt] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM payment_attempts
          WHERE provider_order_id = ${diagnostic.orderId}
          FOR SHARE`;
        if (!attempt) return;

        const prior = await tx.auditEvent.findFirst({
          where: { eventType: EVENT_TYPE, targetType: 'payment_attempt', targetId: attempt.id },
          select: { id: true },
        });
        if (prior) return;

        await recordAuditEvent(tx, {
          eventType: EVENT_TYPE,
          actorId: null,
          targetType: 'payment_attempt',
          targetId: attempt.id,
          result: 'rejected',
          details: {
            rawMatch: diagnostic.rawMatch,
            lowerMatch: diagnostic.lowerMatch,
            casesDiffer: diagnostic.casesDiffer,
          },
        });
      },
      { maxWait: 1_000, timeout: 5_000 },
    );
  } catch {
    // Mensagem fixa: nem erro de driver nem dados recebidos atravessam o log.
    console.error('[payments] falha no diagnostico temporario de assinatura');
  }
}
