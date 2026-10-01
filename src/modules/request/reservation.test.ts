import { describe, expect, it } from 'vitest';
import { lowestFreeSlot, RESERVATION_WINDOW_MS } from './reservation';

// Unitario das regras puras da reserva (F3-003, #93). A atomicidade, a trava,
// a concorrencia (T-1) e a auditoria sao provadas contra PostgreSQL real em
// reservation.integration.test.ts.

describe('lowestFreeSlot (DM-6.3, passo 3)', () => {
  it.each([
    [[], 1],
    [[1], 2],
    [[2], 1],
    [[1, 3], 2],
    [[1, 2], 3],
    [[3, 1, 2], null],
  ] as const)('ocupadas %j -> %s', (occupied, expected) => {
    expect(lowestFreeSlot(occupied)).toBe(expected);
  });
});

describe('janela de reserva (PD-3.1)', () => {
  it('e exatamente 30 minutos', () => {
    expect(RESERVATION_WINDOW_MS).toBe(30 * 60 * 1000);
  });
});
