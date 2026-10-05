// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Catalogo dos avisos transacionais da Fase 3 (F3-013, #103; DEC-048, TE-1 a
// TE-4). Prova: so texto fixo e ids internos; o contato nunca vai por email;
// conta inativa nao recebe; falha vira sinal sem endereco; nunca lanca.
const db = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@/persistence/prisma', () => ({
  getPrismaClient: () => ({ user: { findUnique: db.findUnique } }),
}));
const transport = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('./email-transport', () => ({ sendTransactionalEmail: transport.send }));
const signals = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock('@/modules/platform', () => ({ reportSignal: signals.report }));

import { noticeIdempotencyKey, notifyUser, renderNotice, type UserNotice } from './notifications';

const BASE = 'https://techlab-troq-git-preview-bruno-m-noronha.vercel.app';
const RECIPIENT = '00000000-0000-4000-8000-000000000001';
const REQUEST = '00000000-0000-4000-8000-000000000002';
const LISTING = '00000000-0000-4000-8000-000000000003';
const RELEASE = '00000000-0000-4000-8000-000000000004';
const REFUND = '00000000-0000-4000-8000-000000000005';
const ADDRESS = 'pessoa@exemplo.com.br';

const NOTICES: UserNotice[] = [
  {
    kind: 'request_paid_requester',
    recipientId: RECIPIENT,
    contactRequestId: REQUEST,
    listingId: LISTING,
  },
  { kind: 'request_paid_owner', recipientId: RECIPIENT, contactRequestId: REQUEST },
  { kind: 'contact_released', recipientId: RECIPIENT, contactReleaseId: RELEASE },
  {
    kind: 'refund_concluded',
    recipientId: RECIPIENT,
    technicalRefundId: REFUND,
    listingId: LISTING,
  },
];

describe('renderNotice', () => {
  it.each(NOTICES)('$kind: assunto, texto e html com o link certo e sem lacunas', (notice) => {
    const r = renderNotice(notice, BASE);
    const expectedPath = {
      request_paid_requester: `/explorar/${LISTING}`,
      request_paid_owner: '/anuncios',
      contact_released: '/contatos',
      refund_concluded: `/explorar/${LISTING}`,
    }[notice.kind];
    expect(r.subject).toMatch(/^TROQ: /);
    expect(r.text).toContain(`${BASE}${expectedPath}`);
    expect(r.html).toContain(`href="${BASE}${expectedPath}"`);
    for (const body of [r.subject, r.text, r.html]) {
      expect(body).not.toMatch(/undefined|null|\[object/);
      // Nenhum id de pessoa nem de solicitacao no corpo: so o do anuncio no link.
      expect(body).not.toContain(RECIPIENT);
      expect(body).not.toContain(REQUEST);
      expect(body).not.toContain(RELEASE);
      expect(body).not.toContain(REFUND);
    }
  });

  it('TE-3 nao contem o contato: manda a /contatos e diz que o numero nao vai por email', () => {
    const r = renderNotice(NOTICES[2], BASE);
    expect(r.text).toContain('não vai por e-mail');
    expect(r.text).not.toMatch(/\d{4,}[\s.-]?\d{4}/);
  });

  it('TE-6 nao expoe causa tecnica nem valor', () => {
    const r = renderNotice(NOTICES[3], BASE);
    for (const body of [r.subject, r.text, r.html]) {
      expect(body).not.toMatch(/rt_\d|duplic|janela|vaga|R\$|0,99/i);
    }
  });

  it('a chave de idempotencia e uma por transicao e tipo', () => {
    expect(NOTICES.map(noticeIdempotencyKey)).toEqual([
      `troq-notice/request_paid_requester/${REQUEST}`,
      `troq-notice/request_paid_owner/${REQUEST}`,
      `troq-notice/contact_released/${RELEASE}`,
      `troq-notice/refund_concluded/${REFUND}`,
    ]);
  });
});

describe('notifyUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'preview');
    vi.stubEnv('BETTER_AUTH_URL', BASE);
    db.findUnique.mockResolvedValue({ email: ADDRESS, emailVerified: true, status: 'active' });
    transport.send.mockResolvedValue({ ok: true });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('conta ativa e verificada: envia ao endereco dela, com a chave da transicao', async () => {
    expect(await notifyUser(NOTICES[2])).toEqual({ sent: true });
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ADDRESS,
        idempotencyKey: `troq-notice/contact_released/${RELEASE}`,
      }),
    );
    expect(signals.report).not.toHaveBeenCalled();
  });

  it.each([
    ['inexistente', null],
    ['bloqueada', { email: ADDRESS, emailVerified: true, status: 'blocked' }],
    ['em exclusao', { email: ADDRESS, emailVerified: true, status: 'deletion_requested' }],
    ['nao verificada', { email: ADDRESS, emailVerified: false, status: 'active' }],
  ])('conta %s nao recebe; sinal so de log', async (_c, user) => {
    db.findUnique.mockResolvedValueOnce(user);
    expect(await notifyUser(NOTICES[0])).toEqual({ sent: false, reason: 'recipient_unavailable' });
    expect(transport.send).not.toHaveBeenCalled();
    expect(signals.report).toHaveBeenCalledWith(
      'email.delivery_failed',
      { kind: 'request_paid_requester', reason: 'recipient_unavailable' },
      { alert: false },
    );
  });

  it('id malformado nao consulta o banco', async () => {
    expect(
      await notifyUser({
        kind: 'request_paid_owner',
        recipientId: RECIPIENT,
        contactRequestId: 'nao-e-uuid',
      }),
    ).toEqual({
      sent: false,
      reason: 'recipient_unavailable',
    });
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it('falha do provedor vira alerta sem endereco, e nao lanca', async () => {
    transport.send.mockResolvedValueOnce({ ok: false, reason: 'provider_error' });
    expect(await notifyUser(NOTICES[1])).toEqual({ sent: false, reason: 'provider_error' });
    expect(signals.report).toHaveBeenCalledWith(
      'email.delivery_failed',
      { kind: 'request_paid_owner', reason: 'provider_error' },
      { alert: true },
    );
    expect(JSON.stringify(signals.report.mock.calls)).not.toContain(ADDRESS);
  });

  it('origem publica ausente: not_configured, sem envio', async () => {
    vi.stubEnv('BETTER_AUTH_URL', '');
    expect(await notifyUser(NOTICES[0])).toEqual({ sent: false, reason: 'not_configured' });
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('excecao do banco nao escapa', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    db.findUnique.mockRejectedValueOnce(new Error(`conexao recusada para ${ADDRESS}`));
    expect(await notifyUser(NOTICES[0])).toEqual({ sent: false, reason: 'exception' });
    expect(JSON.stringify(log.mock.calls)).not.toContain(ADDRESS);
    log.mockRestore();
  });
});
