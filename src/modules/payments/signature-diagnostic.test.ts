// @vitest-environment node
import { createHmac, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import {
  PREVIEW_DIAGNOSTIC_ENV,
  PREVIEW_DIAGNOSTIC_ORDER_ID as ORDER,
} from './mercado-pago/signature-diagnostic';
import { recordPreviewSignatureDiagnostic } from './signature-diagnostic';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  prior: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@/modules/audit', () => ({ recordAuditEvent: mocks.audit }));
vi.mock('@/persistence/prisma', () => ({
  getPrismaClient: () => ({ $transaction: mocks.transaction }),
}));
const config = { secret: randomBytes(32).toString('hex'), applicationId: '9900000000000001' };
const attemptId = 'b4b181ea-8441-48c6-a313-a75669d349d7';
const ts = '1742505638683';
const requestId = 'diagnostic-synthetic-request';
const mac = createHmac('sha256', config.secret)
  .update(`id:${ORDER.toLowerCase()};request-id:${requestId};ts:${ts};`)
  .digest('hex');
const input = () => ({
  query: new URLSearchParams({ 'data.id': ORDER }),
  headers: new Headers({ 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${mac}` }),
  body: { type: 'order', application_id: config.applicationId, phone: 'synthetic-private-marker' },
});

describe('persistencia best-effort de diagnostico limitado', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('APP_ENV', 'preview');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv(PREVIEW_DIAGNOSTIC_ENV, ORDER);
    mocks.execute.mockResolvedValue(1);
    mocks.query.mockResolvedValue([{ id: attemptId }]);
    mocks.prior.mockResolvedValue(null);
    mocks.audit.mockResolvedValue(undefined);
    const tx = {
      $executeRaw: mocks.execute,
      $queryRaw: mocks.query,
      auditEvent: { findFirst: mocks.prior },
    };
    mocks.transaction.mockImplementation(
      async (work: (tx: Prisma.TransactionClient) => Promise<void>) =>
        work(tx as unknown as Prisma.TransactionClient),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('grava somente tres booleanos, ator nulo, alvo UUID e limite temporal da transacao', async () => {
    await recordPreviewSignatureDiagnostic(input(), config);
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), {
      eventType: 'payment.notification_signature_diagnostic',
      actorId: null,
      targetType: 'payment_attempt',
      targetId: attemptId,
      result: 'rejected',
      details: { rawMatch: false, lowerMatch: true, casesDiffer: true },
    });
    const eventText = JSON.stringify(mocks.audit.mock.calls[0][1]);
    for (const marker of [ORDER, config.secret, ts, requestId, mac, 'synthetic-private-marker'])
      expect(eventText).not.toContain(marker);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 1000,
      timeout: 5000,
    });
    expect(mocks.execute.mock.calls[2][0].join('')).toContain('pg_advisory_xact_lock');
    expect(mocks.query.mock.calls[0][1]).toBe(ORDER);
    expect(mocks.execute.mock.invocationCallOrder[2]).toBeLessThan(
      mocks.prior.mock.invocationCallOrder[0],
    );
  });

  it('retry com evento persistido nao escreve novamente', async () => {
    mocks.prior.mockResolvedValue({ id: 'prior-event' });
    await recordPreviewSignatureDiagnostic(input(), config);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('sem tentativa EXATA nao inventa alvo nem grava evento', async () => {
    mocks.query.mockResolvedValue([]);
    await recordPreviewSignatureDiagnostic(input(), config);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.prior).not.toHaveBeenCalled();
  });

  it.each(['off', 'production', 'different_order'])(
    'fora do escopo %s nao abre transacao',
    async (scope) => {
      const notification = input();
      if (scope === 'off') vi.stubEnv(PREVIEW_DIAGNOSTIC_ENV, '');
      if (scope === 'production') vi.stubEnv('VERCEL_ENV', 'production');
      if (scope === 'different_order') notification.query.set('data.id', `${ORDER}X`);
      await recordPreviewSignatureDiagnostic(notification, config);
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['database', 'audit'])(
    'falha %s e absorvida com mensagem fixa, sem ecoar erro',
    async (failure) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const privateError = new Error(`DO NOT LOG ${config.secret} ${mac}`);
      if (failure === 'database') mocks.transaction.mockRejectedValue(privateError);
      else mocks.audit.mockRejectedValue(privateError);
      await expect(recordPreviewSignatureDiagnostic(input(), config)).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledExactlyOnceWith(
        '[payments] falha no diagnostico temporario de assinatura',
      );
    },
  );
});
