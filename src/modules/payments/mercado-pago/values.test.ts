import { describe, expect, it } from 'vitest';
import {
  amountToCents,
  centsToDecimal,
  decimalToCents,
  MIN_EXPIRATION_MS,
  parseZonedInstant,
  toIsoDuration,
} from './values';

describe('centavos <-> decimal do provedor (DM-1.3, PD-4.5)', () => {
  it.each([
    [99, '0.99'],
    [1, '0.01'],
    [100, '1.00'],
    [5000, '50.00'],
    [0, '0.00'],
  ])('%i centavos -> %s', (cents, decimal) => {
    expect(centsToDecimal(cents)).toBe(decimal);
    expect(decimalToCents(decimal)).toBe(cents);
  });

  it.each([0.99, -1, Number.NaN, 2 ** 60])('recusa %s centavos', (value) => {
    expect(() => centsToDecimal(value)).toThrow(RangeError);
  });

  it.each(['0.9', '.99', '0.990', '00.99', '1,00', 'abc', '', undefined, 0.99, null])(
    'nao interpreta %j',
    (value) => {
      expect(decimalToCents(value)).toBeNull();
    },
  );
});

describe('toIsoDuration (expiration_time; MP-1, spike F0-010 exp. 6)', () => {
  it('30 minutos exatos -> PT30M', () => {
    expect(toIsoDuration(30 * 60 * 1000)).toBe('PT30M');
  });

  it('nunca abaixo do minimo documentado', () => {
    expect(toIsoDuration(29 * 60 * 1000)).toBe('PT30M');
    expect(toIsoDuration(0)).toBe('PT30M');
    expect(toIsoDuration(-5)).toBe('PT30M');
    expect(MIN_EXPIRATION_MS).toBe(30 * 60 * 1000);
  });

  it('acima do minimo arredonda o segundo para cima', () => {
    expect(toIsoDuration(31 * 60 * 1000 + 1)).toBe('PT31M1S');
    expect(toIsoDuration(45 * 60 * 1000)).toBe('PT45M');
  });

  it('recusa duracao nao finita', () => {
    expect(() => toIsoDuration(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('instante autoritativo com fuso (ADR-0008, decisao 3)', () => {
  it.each([
    ['2026-10-01T12:29:46.000-04:00', '2026-10-01T16:29:46.000Z'],
    ['2026-10-01T16:29:46Z', '2026-10-01T16:29:46.000Z'],
    ['2026-10-01T16:29:46.123456+00:00', '2026-10-01T16:29:46.123Z'],
  ])('%s -> %s', (raw, iso) => {
    expect(parseZonedInstant(raw)?.toISOString()).toBe(iso);
  });

  it.each(['2026-10-01', '2026-10-01T12:29:46', '2026-10-01 12:29:46Z', 'ontem', '', null, 0])(
    'sem data, hora e fuso completos: null (%j)',
    (raw) => {
      expect(parseZonedInstant(raw)).toBeNull();
    },
  );
});

describe('valor numerico da Payments API -> centavos', () => {
  it.each([
    [0.99, 99],
    [0.01, 1],
    [50, 5000],
    [1.1, 110],
  ])('%s -> %s', (value, cents) => {
    expect(amountToCents(value)).toBe(cents);
  });

  it.each([0.991, -1, Number.NaN, Number.POSITIVE_INFINITY, '0.99', null])(
    'valor que nao e centavo exato: null (%j)',
    (value) => {
      expect(amountToCents(value)).toBeNull();
    },
  );
});
