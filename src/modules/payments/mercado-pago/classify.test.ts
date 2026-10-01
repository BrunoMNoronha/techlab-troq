import { describe, expect, it } from 'vitest';
import { classifyState, pixInstructions, toOrderSnapshot } from './classify';

// Classificacao FECHADA (payments-design.md, PD-6.6 passo 3; PD-3.6; CI-9; T-12
// na parte unitaria). Todo valor fora da lista e `unknown` e nunca aprovado.

function order(status: unknown, statusDetail: unknown, pix?: Record<string, unknown>) {
  return {
    id: 'ORD01TESTE',
    status,
    status_detail: statusDetail,
    transactions: {
      payments: [
        {
          id: 'PAY01TESTE',
          amount: '0.99',
          paid_amount: '0.99',
          payment_method: { id: 'pix', type: 'bank_transfer' },
          status: 'processed',
          status_detail: 'accredited',
          ...pix,
        },
      ],
    },
  };
}

describe('classifyState', () => {
  it('acreditado so com processed/accredited na order E na transacao Pix', () => {
    expect(classifyState(order('processed', 'accredited'))).toEqual({ kind: 'accredited' });
  });

  it('order acreditada com transacao Pix nao acreditada e contradicao: unknown', () => {
    expect(
      classifyState(order('processed', 'accredited', { status: 'action_required' })),
    ).toMatchObject({ kind: 'unknown' });
  });

  it('order acreditada sem transacao Pix: unknown', () => {
    expect(
      classifyState({ id: 'X', status: 'processed', status_detail: 'accredited' }),
    ).toMatchObject({ kind: 'unknown', reason: 'pix_payment_missing' });
  });

  it.each([
    ['created', 'created'],
    ['processing', 'in_process'],
    ['action_required', 'waiting_transfer'],
    ['action_required', 'waiting_payment'],
    ['action_required', 'waiting_capture'],
    ['action_required', 'waiting_retry'],
  ])('%s/%s: pendente, nao terminal', (status, detail) => {
    expect(classifyState(order(status, detail))).toEqual({ kind: 'pending' });
  });

  it.each([
    ['expired', 'expired', 'expired'],
    ['canceled', 'canceled', 'canceled'],
    ['failed', 'failed', 'failed'],
  ] as const)('%s/%s: terminal sem acreditacao', (status, detail, outcome) => {
    expect(classifyState(order(status, detail))).toEqual({
      kind: 'not_accredited_terminal',
      outcome,
    });
  });

  it.each([
    ['refunded', 'refunded'],
    ['processed', 'refunded'],
    ['processed', 'partially_refunded'],
    ['charged_back', 'in_process'],
    ['charged_back', 'settled'],
    ['charged_back', 'reimbursed'],
  ])('%s/%s: reversao', (status, detail) => {
    expect(classifyState(order(status, detail))).toEqual({ kind: 'reversed' });
  });

  it.each([
    ['approved', 'accredited'],
    ['processed', 'waiting_transfer'],
    ['processed', undefined],
    ['PROCESSED', 'accredited'],
    [undefined, 'accredited'],
    [null, null],
    ['', ''],
    [42, 'accredited'],
  ])('desconhecido ou ausente (%j/%j) nunca e aprovado', (status, detail) => {
    expect(classifyState(order(status, detail)).kind).toBe('unknown');
  });
});

describe('toOrderSnapshot', () => {
  it('espelha os pagamentos em centavos e nao inventa instante de acreditacao (OD-16)', () => {
    const snapshot = toOrderSnapshot({
      ...order('processed', 'accredited', { date_of_expiration: '2026-10-01T13:30:00.000Z' }),
      external_reference: 'troq-pa-1',
      total_paid_amount: '0.99',
      created_date: '2026-10-01T13:00:00.000Z',
      last_updated_date: '2026-10-01T13:00:49.000Z',
    });
    expect(snapshot).toMatchObject({
      providerOrderId: 'ORD01TESTE',
      externalReference: 'troq-pa-1',
      state: { kind: 'accredited' },
      totalPaidCents: 99,
      payments: [
        {
          providerPaymentId: 'PAY01TESTE',
          isPix: true,
          amountCents: 99,
          paidAmountCents: 99,
          providerStatus: 'processed',
          providerStatusDetail: 'accredited',
          accreditedAt: null,
        },
      ],
    });
    expect(snapshot?.pixExpiresAt?.toISOString()).toBe('2026-10-01T13:30:00.000Z');
    // `last_updated_date` NAO e tratado como instante de acreditacao.
    expect(snapshot?.payments[0].accreditedAt).toBeNull();
  });

  it('sem identificador de order nao ha snapshot', () => {
    expect(toOrderSnapshot({ status: 'processed' })).toBeNull();
    expect(toOrderSnapshot(null)).toBeNull();
    expect(toOrderSnapshot([])).toBeNull();
  });
});

describe('pixInstructions', () => {
  it('extrai copia e cola, imagem e link da transacao Pix', () => {
    const body = order('action_required', 'waiting_transfer', {
      payment_method: {
        id: 'pix',
        type: 'bank_transfer',
        qr_code: '00020126BRCODE',
        qr_code_base64: 'iVBORw0KGgo=',
        ticket_url: 'https://www.mercadopago.com.br/payments/1/ticket',
      },
    });
    expect(pixInstructions(body)).toEqual({
      qrCode: '00020126BRCODE',
      qrCodeBase64: 'iVBORw0KGgo=',
      ticketUrl: 'https://www.mercadopago.com.br/payments/1/ticket',
    });
  });

  it('apos a acreditacao o provedor nao devolve mais o QR: null', () => {
    expect(pixInstructions(order('processed', 'accredited'))).toBeNull();
  });
});
