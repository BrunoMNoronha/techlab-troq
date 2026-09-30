import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LISTING_COMPLIANCE_DECLARATION, LISTING_COMPLIANCE_TERMS_VERSION } from './compliance';

// Trava de versao: o hash abaixo corresponde a LISTING_COMPLIANCE_TERMS_VERSION.
// Alterar a declaracao exige subir a versao e atualizar os dois juntos.
const VERSIONED_TEXT_HASHES: Record<string, string> = {
  'DEC-031/2026-09-14/declaracao-1':
    '751162d07d21e8aedb6c90819e23138448c0522776a6f91a0693c2a8f281cfee',
};

describe('declaracao de conformidade', () => {
  it('o texto exibido corresponde a versao gravada', () => {
    const hash = createHash('sha256').update(LISTING_COMPLIANCE_DECLARATION).digest('hex');
    expect(VERSIONED_TEXT_HASHES[LISTING_COMPLIANCE_TERMS_VERSION]).toBe(hash);
  });

  it('a versao identifica a decisao normativa da politica', () => {
    expect(LISTING_COMPLIANCE_TERMS_VERSION.startsWith('DEC-031/')).toBe(true);
  });
});
