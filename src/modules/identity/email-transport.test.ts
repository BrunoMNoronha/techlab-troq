// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Transporte dos emails transacionais (F3-013, #103). O Resend e simulado:
// prova-se a fronteira — dominio reservado nunca chega ao provedor, falta de
// configuracao e falha, a chave de idempotencia segue, e nenhum log carrega
// destinatario, assunto ou corpo.
const resend = vi.hoisted(() => ({ ctor: vi.fn(), send: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resend.send };
    constructor(key: string) {
      resend.ctor(key);
    }
  },
}));

import { isReservedRecipient, sendTransactionalEmail } from './email-transport';

const EMAIL = {
  to: 'pessoa@exemplo.com.br',
  subject: 'Assunto',
  text: 'Corpo',
  html: '<p>Corpo</p>',
  idempotencyKey: 'troq-notice/contact_released/00000000-0000-4000-8000-000000000001',
};

describe('isReservedRecipient', () => {
  it.each([
    'a@example.test',
    'a@x.example.invalid',
    'a@example',
    'a@host.localhost',
    'a@example.com',
    'a@sub.example.org',
    'a@example.net',
  ])('%s e reservado', (address) => expect(isReservedRecipient(address)).toBe(true));

  it.each(['a@gmail.com', 'a@contest.com', 'a@test.com.br', 'a@exemplo.com.br'])(
    '%s nao e reservado',
    (address) => expect(isReservedRecipient(address)).toBe(false),
  );
});

describe('sendTransactionalEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_API_KEY', 're_sintetica_123');
    vi.stubEnv('EMAIL_FROM', 'TROQ <nao-responda@preview.troqs.app>');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('dominio reservado nunca chega ao provedor', async () => {
    expect(await sendTransactionalEmail({ ...EMAIL, to: 'it@example.test' })).toEqual({
      ok: false,
      reason: 'reserved_recipient',
    });
    expect(resend.ctor).not.toHaveBeenCalled();
  });

  it('sem chave ou com remetente placeholder: not_configured, sem chamar o provedor', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(await sendTransactionalEmail(EMAIL)).toEqual({ ok: false, reason: 'not_configured' });
    vi.stubEnv('RESEND_API_KEY', 're_sintetica_123');
    vi.stubEnv('EMAIL_FROM', 'TROQ <nao-responda@example.invalid>');
    expect(await sendTransactionalEmail(EMAIL)).toEqual({ ok: false, reason: 'not_configured' });
    expect(resend.ctor).not.toHaveBeenCalled();
  });

  it('aceito pelo provedor: ok, com a chave de idempotencia da transicao', async () => {
    resend.send.mockResolvedValueOnce({ data: { id: 'x' }, error: null });
    expect(await sendTransactionalEmail(EMAIL)).toEqual({ ok: true });
    expect(resend.send).toHaveBeenCalledWith(
      {
        from: 'TROQ <nao-responda@preview.troqs.app>',
        to: [EMAIL.to],
        subject: EMAIL.subject,
        text: EMAIL.text,
        html: EMAIL.html,
      },
      { idempotencyKey: EMAIL.idempotencyKey },
    );
  });

  it('recusa e excecao do provedor sao falha, e o log nao carrega destinatario nem corpo', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    resend.send.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 422, name: 'validation_error', message: EMAIL.to },
    });
    expect(await sendTransactionalEmail(EMAIL)).toEqual({ ok: false, reason: 'provider_error' });
    resend.send.mockRejectedValueOnce(new TypeError(`falha ao enviar para ${EMAIL.to}`));
    expect(await sendTransactionalEmail(EMAIL)).toEqual({ ok: false, reason: 'exception' });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain(EMAIL.to);
    expect(logged).not.toContain('Corpo');
    log.mockRestore();
  });
});
