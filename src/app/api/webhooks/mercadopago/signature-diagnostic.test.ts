// @vitest-environment node
import { createHmac, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_DIAGNOSTIC_ENV,
  PREVIEW_DIAGNOSTIC_ORDER_ID as ORDER,
} from '@/modules/payments/mercado-pago/signature-diagnostic';
import { handleMercadoPagoWebhook } from './handler';

const mocks = vi.hoisted(() => ({
  rejection: vi.fn(),
  register: vi.fn(),
  processed: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('@/modules/audit', () => ({ recordAuditEvent: mocks.audit }));
vi.mock('@/persistence/prisma', () => ({
  getPrismaClient: () => ({ $transaction: mocks.transaction }),
}));
vi.mock('@/modules/request', () => ({ confirmPaymentFlow: mocks.confirm }));
vi.mock('@/modules/payments', async () => ({
  ...(await import('@/modules/payments/mercado-pago/signature')),
  ...(await import('@/modules/payments/mercado-pago/config')),
  ...(await import('@/modules/payments/signature-diagnostic')),
  recordRejectedNotification: mocks.rejection,
  registerNotification: mocks.register,
  markNotificationProcessed: mocks.processed,
  createMercadoPagoClient: vi.fn(),
}));

const secret = randomBytes(32).toString('hex');
const appId = '9900000000000001';
function request(
  opts: {
    profile?: 'raw' | 'lower';
    applicationId?: string;
    type?: string;
    signature?: string | null;
    order?: string;
  } = {},
) {
  const ts = '1742505638683';
  const requestId = 'diagnostic-handler-synthetic';
  const order = opts.order ?? ORDER;
  const signedId = opts.profile === 'raw' ? order : order.toLowerCase();
  const mac = createHmac('sha256', secret)
    .update(`id:${signedId};request-id:${requestId};ts:${ts};`)
    .digest('hex');
  const headers = new Headers({ 'content-type': 'application/json', 'x-request-id': requestId });
  const signature = opts.signature === undefined ? `ts=${ts},v1=${mac}` : opts.signature;
  if (signature !== null) headers.set('x-signature', signature);
  return new Request(`http://localhost/api/webhooks/mercadopago?data.id=${order}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: opts.type ?? 'order',
      application_id: opts.applicationId ?? appId,
      data: { id: order },
    }),
  });
}

describe('receptor: diagnostico nao autoriza nem substitui a auditoria normal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('APP_ENV', 'preview');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv(PREVIEW_DIAGNOSTIC_ENV, ORDER);
    vi.stubEnv('MERCADO_PAGO_WEBHOOK_SECRET', secret);
    vi.stubEnv('MERCADO_PAGO_APPLICATION_ID', appId);
    mocks.rejection.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
    mocks.register.mockResolvedValue({ notificationId: 'unknown-notification', attemptId: null });
    mocks.processed.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (work) =>
      work({
        $executeRaw: vi.fn().mockResolvedValue(1),
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'b4b181ea-8441-48c6-a313-a75669d349d7' }]),
        auditEvent: { findFirst: vi.fn().mockResolvedValue(null) },
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('lowerMatch=true segue 401 vazio/no-store, recusa antes do diagnostico e nenhum processamento', async () => {
    const response = await handleMercadoPagoWebhook(request());
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.rejection).toHaveBeenCalledOnce();
    expect(mocks.rejection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.audit.mock.invocationCallOrder[0],
    );
    expect(mocks.audit.mock.calls[0][1].details).toEqual({
      rawMatch: false,
      lowerMatch: true,
      casesDiffer: true,
    });
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('falha da escrita diagnostica preserva a recusa ja auditada e HTTP 401', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.audit.mockRejectedValue(new Error('synthetic database failure'));
    const response = await handleMercadoPagoWebhook(request());
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(mocks.rejection).toHaveBeenCalledOnce();
    expect(mocks.register).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      '[payments] falha no diagnostico temporario de assinatura',
    );
  });

  it('raw valido segue registro normal, sem comparacao nem diagnostico', async () => {
    const response = await handleMercadoPagoWebhook(request({ profile: 'raw' }));
    expect(response.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledOnce();
    expect(mocks.rejection).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    [{ applicationId: '1' }, 401, 'application_mismatch'],
    [{ type: 'payment' }, 200, 'unsupported_topic'],
    [{ signature: null }, 401, 'signature_missing'],
    [{ signature: 'ts=invalid,v1=invalid' }, 401, 'signature_malformed'],
    [{ order: `${ORDER}X` }, 401, 'signature_invalid'],
  ] as const)('guarda anterior ou order divergente: %j', async (opts, status, reason) => {
    const response = await handleMercadoPagoWebhook(request(opts));
    expect(response.status).toBe(status);
    expect(mocks.rejection).toHaveBeenCalledWith(expect.objectContaining({ reason }));
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'production'])(
    '%s mantem recusa normal e nao abre transacao diagnostica',
    async (mode) => {
      if (mode === 'disabled') vi.stubEnv(PREVIEW_DIAGNOSTIC_ENV, '');
      else vi.stubEnv('APP_ENV', 'production');
      expect((await handleMercadoPagoWebhook(request())).status).toBe(401);
      expect(mocks.rejection).toHaveBeenCalledOnce();
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );
});
