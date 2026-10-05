// @vitest-environment node
//
// Prova de integracao dos sinais de pagamentos (F3-013, #103; AR-14.3) contra
// PostgreSQL REAL e descartavel: a leitura roda no banco migrado, com o relogio
// do banco, e a janela de notificacoes rejeitadas conta so o que esta dentro
// dela. A contagem e por DIFERENCA, para nao depender do que outras suites
// deixaram no banco.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1. Dados sinteticos.
import { afterAll, describe, expect, it } from 'vitest';
import { getPrismaClient } from '@/persistence/prisma';
import { readPaymentSignals, REJECTED_NOTIFICATION_WINDOW_HOURS } from './signals';

const TAG = `it103-${Date.now()}`;
const prisma = () => getPrismaClient();

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'sinais de pagamentos sobre PostgreSQL real (F3-013)',
  () => {
    afterAll(async () => {
      await prisma().$executeRaw`
        DELETE FROM "audit_events"
        WHERE "event_type" = 'payment.notification_rejected'
          AND "details"->>'providerRequestId' = ${TAG}`;
      await prisma().$disconnect();
    });

    it('a leitura executa e devolve contagens e idades nao negativas', async () => {
      const snapshot = await readPaymentSignals();
      for (const value of Object.values(snapshot)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(snapshot.refundPendingOverdue).toBeLessThanOrEqual(snapshot.refundPending);
      expect(snapshot.refundPendingOperational).toBeLessThanOrEqual(snapshot.refundPending);
    });

    it('notificacoes rejeitadas: conta as da janela e ignora as anteriores a ela', async () => {
      const before = await readPaymentSignals();
      const outside = new Date(
        Date.now() - (REJECTED_NOTIFICATION_WINDOW_HOURS + 1) * 60 * 60 * 1000,
      );
      const rows = [new Date(), new Date(Date.now() - 60_000), new Date(), outside];
      for (const occurredAt of rows) {
        await prisma().auditEvent.create({
          data: {
            eventType: 'payment.notification_rejected',
            actorId: null,
            targetType: 'payment_notification',
            targetId: null,
            result: 'rejected',
            occurredAt,
            details: { reason: 'signature_invalid', providerRequestId: TAG, providerDataId: null },
          },
        });
      }

      const after = await readPaymentSignals();
      expect(after.notificationsRejected - before.notificationsRejected).toBe(3);
    });
  },
);
