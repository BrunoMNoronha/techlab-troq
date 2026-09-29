// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendVerificationEmail } from './email';

// O transporte Resend e simulado: este teste prova a fronteira do envio
// (IC-9.1), nao a entrega real — essa fica para a prova em `preview`.
const send = vi.fn();
const resendConstructor = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
    constructor(key: string) {
      resendConstructor(key);
    }
  },
}));

const TO = 'destinatario@example.test';
const URL_WITH_TOKEN = 'https://troq.example.test/verificar-email?token=TOKEN_SECRETO_123';
const API_KEY = 're_chave_sintetica_de_teste';
const message = {
  to: TO,
  verificationUrl: URL_WITH_TOKEN,
  idempotencyKey: 'email-verification/v1',
};

function loggedText(...spies: ReturnType<typeof vi.spyOn>[]) {
  return JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

describe('sendVerificationEmail — fronteira do envio (IC-9.1)', () => {
  let error: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_API_KEY', API_KEY);
    vi.stubEnv('EMAIL_FROM', 'TROQ <nao-responda@preview.troq.example>');
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Nenhum caminho registra destinatario, token, link ou chave.
    const text = loggedText(error, log);
    for (const secret of [TO, 'TOKEN_SECRETO_123', URL_WITH_TOKEN, API_KEY]) {
      expect(text).not.toContain(secret);
    }
    expect(log).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ['chave ausente', 'RESEND_API_KEY', undefined],
    ['chave placeholder', 'RESEND_API_KEY', 'SUBSTITUIR_RESEND_API_KEY'],
    ['remetente ausente', 'EMAIL_FROM', undefined],
    ['remetente placeholder', 'EMAIL_FROM', 'TROQ <nao-responda@example.invalid>'],
  ])('%s e falha, sem chamar o provedor', async (_caso, variable, value) => {
    vi.stubEnv(variable, value);

    expect(await sendVerificationEmail(message)).toEqual({ ok: false, reason: 'not_configured' });
    expect(send).not.toHaveBeenCalled();
  });

  it('erro devolvido pelo Resend e falha', async () => {
    send.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 403, name: 'validation_error', message: `rejeitado ${TO}` },
      headers: null,
    });

    expect(await sendVerificationEmail(message)).toEqual({ ok: false, reason: 'provider_error' });
    expect(error.mock.calls[0]?.[1]).toBe('403/validation_error');
  });

  it('excecao ao chamar o Resend e falha', async () => {
    send.mockRejectedValueOnce(new TypeError(`fetch falhou para ${URL_WITH_TOKEN}`));

    expect(await sendVerificationEmail(message)).toEqual({ ok: false, reason: 'exception' });
  });

  it('envio aceito e sucesso, com remetente do ambiente e chave de idempotencia', async () => {
    send.mockResolvedValueOnce({ data: { id: 'email-1' }, error: null, headers: null });

    expect(await sendVerificationEmail(message)).toEqual({ ok: true });
    expect(resendConstructor).toHaveBeenCalledWith(API_KEY);
    expect(send).toHaveBeenCalledTimes(1);
    const [payload, options] = send.mock.calls[0];
    expect(payload).toMatchObject({
      from: 'TROQ <nao-responda@preview.troq.example>',
      to: [TO],
    });
    expect(payload.text).toContain(URL_WITH_TOKEN);
    expect(options).toEqual({ idempotencyKey: 'email-verification/v1' });
  });
});
