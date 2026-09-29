import { describe, expect, it } from 'vitest';
import { sanitizeReturnPath } from './return-path';

describe('sanitizeReturnPath — destino de retorno apos login (#59)', () => {
  it.each([
    [
      '/explorar/0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f',
      '/explorar/0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f',
    ],
    ['/conta', '/conta'],
    ['/explorar?city=Recife', '/explorar?city=Recife'],
    ['/explorar/../conta', '/conta'],
  ])('aceita caminho interno %s', (input, expected) => {
    expect(sanitizeReturnPath(input)).toBe(expected);
  });

  it.each([
    'https://evil.example/phish',
    '//evil.example/phish',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'explorar/abc',
    '/explorar\n/abc',
    '',
    `/${'a'.repeat(600)}`,
    undefined,
    null,
    123,
  ])('rejeita destino externo ou malformado %s', (input) => {
    expect(sanitizeReturnPath(input)).toBeNull();
  });

  it('mantem codificacao percentual inerte dentro do proprio caminho', () => {
    expect(sanitizeReturnPath('/%0d%0aSet-Cookie:x')).toBe('/%0d%0aSet-Cookie:x');
  });
});
