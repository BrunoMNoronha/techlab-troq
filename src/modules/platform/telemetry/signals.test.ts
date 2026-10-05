// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sinais operacionais (F3-013, #103): nome fechado, atributos so numero,
// booleano ou codigo curto, alerta agrupado por sinal e nunca uma excecao
// para quem emite (ADR-0007, decisoes 4 a 6).
const sentry = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  logger: { info: sentry.info, warn: sentry.warn, error: sentry.error },
  captureMessage: sentry.captureMessage,
}));

import { reportSignal, sanitizeSignalAttributes } from './signals';

describe('sanitizeSignalAttributes', () => {
  it('mantem numero, booleano e codigo fechado', () => {
    expect(
      sanitizeSignalAttributes({ count: 3, overdue: true, reason: 'signature_invalid' }),
    ).toEqual({ count: 3, overdue: true, reason: 'signature_invalid' });
  });

  it('texto livre, email, telefone e numero nao finito viram `invalid`, sem eco', () => {
    const safe = sanitizeSignalAttributes({
      a: 'pessoa@exemplo.com.br',
      b: '(11) 91234-5678',
      c: 'Mensagem com espacos',
      d: Number.NaN,
      e: 'x'.repeat(65),
    });
    expect(safe).toEqual({ a: 'invalid', b: 'invalid', c: 'invalid', d: 'invalid', e: 'invalid' });
    expect(JSON.stringify(safe)).not.toMatch(/exemplo|91234|Mensagem/);
  });

  it('chave fora do padrao e descartada inteira', () => {
    expect(sanitizeSignalAttributes({ 'Email Pessoa': 1, ok: 2 })).toEqual({ ok: 2 });
  });
});

describe('reportSignal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sem alerta: so log estruturado de nivel info', () => {
    reportSignal('jobs.run', { job: 'media-cleanup', claimed: 0 });
    expect(sentry.info).toHaveBeenCalledWith('signal:jobs.run', {
      signal: 'jobs.run',
      job: 'media-cleanup',
      claimed: 0,
    });
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('com alerta: log de aviso e evento agrupado pelo nome do sinal', () => {
    reportSignal('payments.inconsistent_open', { count: 2 }, { alert: true });
    expect(sentry.warn).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith('signal:payments.inconsistent_open', {
      level: 'warning',
      fingerprint: ['troq-signal', 'payments.inconsistent_open'],
      tags: { signal: 'payments.inconsistent_open' },
      extra: { signal: 'payments.inconsistent_open', count: 2 },
    });
  });

  it('nivel de erro explicito', () => {
    reportSignal('jobs.failure', { job: 'media-process' }, { alert: true, level: 'error' });
    expect(sentry.error).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage.mock.calls[0][1]).toMatchObject({ level: 'error' });
  });

  it('telemetria que lanca nao interrompe quem emite', () => {
    sentry.warn.mockImplementationOnce(() => {
      throw new Error('sdk indisponivel');
    });
    expect(() => reportSignal('email.delivery_failed', {}, { alert: true })).not.toThrow();
  });
});
