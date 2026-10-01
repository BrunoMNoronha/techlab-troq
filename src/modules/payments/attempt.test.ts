import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  deriveExternalReference,
  deriveIdempotencyKey,
  PAYMENT_ATTEMPT_KEY_NAMESPACE,
  uuidV5,
} from './attempt';

// Chave de idempotencia da tentativa (payments-design.md, PD-5.1). A
// persistencia e a releitura (PD-5.2) sao provadas contra banco real em
// src/modules/request/reservation.integration.test.ts.

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidV5 (RFC 9562, secao 5.5)', () => {
  it('reproduz o vetor de referencia do espaco DNS', () => {
    expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });
});

describe('deriveIdempotencyKey (PD-5.1)', () => {
  it('a mesma tentativa produz a mesma chave', () => {
    const id = randomUUID();
    expect(deriveIdempotencyKey(id)).toBe(deriveIdempotencyKey(id));
  });

  it('tentativas diferentes nao colidem', () => {
    const keys = new Set(Array.from({ length: 2000 }, () => deriveIdempotencyKey(randomUUID())));
    expect(keys.size).toBe(2000);
  });

  it('e um UUID v5 que nao contem o identificador da tentativa nem dado algum', () => {
    const id = randomUUID();
    const key = deriveIdempotencyKey(id);
    expect(key).toMatch(UUID_V5);
    expect(key).not.toContain(id);
    expect(key).not.toContain(id.slice(0, 8));
    expect(key).not.toBe(PAYMENT_ATTEMPT_KEY_NAMESPACE);
  });

  it('o espaco de nomes e fixo: mudar a derivacao exige nova versao, nunca troca silenciosa', () => {
    expect(PAYMENT_ATTEMPT_KEY_NAMESPACE).toBe('6b3f2a8e-9d41-4c7b-a0e5-3f1d9c2b7e64');
  });
});

describe('deriveExternalReference (PD-2.1)', () => {
  it('deriva da identidade da tentativa, com prefixo do TROQ', () => {
    const id = randomUUID();
    expect(deriveExternalReference(id)).toBe(`troq-pa-${id}`);
    expect(deriveExternalReference(id).length).toBeLessThanOrEqual(64);
  });
});
