import { describe, expect, it } from 'vitest';
import { classifyAccreditation, toSearchedPayments, type SearchedPayment } from './accreditation';

// ADR-0008, decisao 4: classificacao FECHADA da busca de pagamentos.
const REF = 'troq-pa-00000000-0000-4000-8000-000000000001';
const EXPECTED = { externalReference: REF, amountCents: 99 };
const APPROVED_AT = '2026-10-01T12:29:46.000-04:00';

function result(overrides: Record<string, unknown> = {}) {
  return {
    id: 180819249321,
    status: 'approved',
    status_detail: 'accredited',
    external_reference: REF,
    transaction_amount: 0.99,
    date_approved: APPROVED_AT,
    // Campos irrelevantes ao veredito que a resposta real traz.
    date_last_updated: '2026-10-01T12:29:49.000-04:00',
    ...overrides,
  };
}

function classify(results: Record<string, unknown>[]) {
  const payments = toSearchedPayments({ results, paging: { total: results.length } });
  if (!payments) throw new Error('resposta ininteligivel');
  return classifyAccreditation(payments, EXPECTED);
}

describe('toSearchedPayments', () => {
  it('traduz o resultado real da busca (forma observada no sandbox)', () => {
    expect(toSearchedPayments({ results: [result()] })).toEqual<SearchedPayment[]>([
      {
        providerPaymentId: '180819249321',
        status: 'approved',
        statusDetail: 'accredited',
        externalReference: REF,
        amountCents: 99,
        approvedAt: new Date('2026-10-01T16:29:46.000Z'),
      },
    ]);
  });

  it.each([null, {}, { results: 'x' }, []])('corpo sem lista de resultados: null (%j)', (body) => {
    expect(toSearchedPayments(body)).toBeNull();
  });
});

describe('classifyAccreditation (ADR-0008, decisao 4)', () => {
  it('um aprovado e acreditado: instante e date_approved, nunca date_last_updated', () => {
    expect(classify([result()])).toEqual({
      kind: 'approved',
      accreditedAt: new Date('2026-10-01T16:29:46.000Z'),
      providerPaymentId: '180819249321',
    });
  });

  it('nenhum resultado: absent (atraso de indexacao, nunca recusa)', () => {
    expect(classify([])).toEqual({ kind: 'absent' });
  });

  it('mais de um aprovado: multiple (duplicidade, PD-7)', () => {
    expect(classify([result(), result({ id: 2 })])).toEqual({ kind: 'multiple', count: 2 });
  });

  it('um aprovado e outro nao aprovado: vale o aprovado', () => {
    expect(classify([result({ id: 2, status: 'rejected' }), result()])).toMatchObject({
      kind: 'approved',
    });
  });

  it.each([
    [
      'referencia de outra tentativa',
      { external_reference: 'troq-pa-outra' },
      'reference_mismatch',
    ],
    [
      'pagamento nao aprovado',
      { status: 'pending', status_detail: 'pending_waiting_transfer' },
      'payment_not_approved',
    ],
    ['aprovado sem acreditacao', { status_detail: 'pending_capture' }, 'detail_not_accredited'],
    ['valor diferente', { transaction_amount: 1.99 }, 'amount_mismatch'],
    ['valor com fracao de centavo', { transaction_amount: 0.991 }, 'amount_mismatch'],
    ['valor em texto', { transaction_amount: '0.99' }, 'amount_mismatch'],
    ['sem date_approved', { date_approved: null }, 'date_approved_invalid'],
    [
      'date_approved sem fuso',
      { date_approved: '2026-10-01T12:29:46.000' },
      'date_approved_invalid',
    ],
    ['date_approved so com data', { date_approved: '2026-10-01' }, 'date_approved_invalid'],
    ['date_approved ilegivel', { date_approved: 'ontem' }, 'date_approved_invalid'],
  ])('%s: divergent (%j)', (_c, overrides, reason) => {
    expect(classify([result(overrides)])).toEqual({ kind: 'divergent', reason });
  });
});
