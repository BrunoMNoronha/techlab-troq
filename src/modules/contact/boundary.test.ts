// @vitest-environment node
//
// Fronteira do modulo `contact` (contact-release.md, CR-2.2; overview.md,
// AR-3.4; F3-002, #92): nenhum codigo fora de `src/modules/contact` le ou
// escreve `UserContact`, e ninguem de fora importa um caminho interno do modulo.
//
// A varredura e textual e propositalmente larga: pega o delegate do Prisma
// (`userContact`), o nome do modelo (`UserContact`) e o nome da tabela
// (`user_contacts`, que pegaria SQL cru), inclusive em comentario. Um falso
// positivo custa uma linha na lista abaixo; um falso negativo vaza o contato.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const MODULE_DIR = 'src/modules/contact/';

/** Codigo gerado pelo Prisma: declara o modelo, nao o le. */
const GENERATED_DIR = 'src/generated/';

/**
 * Excecoes explicitas: testes de integracao que SEMEIAM um contato sintetico
 * para provar que ele nao aparece numa superficie (C-1 e afins) e o REMOVEM no
 * final (a FK de `user_contacts` para `users` e Restrict). Nenhum codigo de
 * produto pode entrar nesta lista.
 */
const FIXTURE_EXCEPTIONS = new Set([
  'src/app/private-surface.http.integration.test.ts',
  'src/app/public-surface.http.integration.test.ts',
  'src/modules/listing/public-listing.integration.test.ts',
  'src/modules/platform/authorization-matrix.integration.test.ts',
  'src/modules/platform/telemetry-redaction.integration.test.ts',
  'src/modules/request/charge.integration.test.ts',
  'src/modules/request/reservation.integration.test.ts',
]);

const CONTACT_DATA = /userContact|UserContact|user_contacts/;
const INTERNAL_IMPORT = /['"]@\/modules\/contact\/([^'"]+)['"]/g;
/** Unico caminho interno importavel de fora: as actions, para o Client Component. */
const ALLOWED_INTERNAL = new Set(['actions']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts|cts|js|jsx|mjs)$/.test(entry.name) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(process.cwd(), path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}));

describe('fronteira do modulo contact (CR-2.2)', () => {
  it('a varredura enxerga o proprio modulo (sanidade)', () => {
    expect(files.some((f) => f.path === `${MODULE_DIR}contact.ts`)).toBe(true);
    expect(
      files.some((f) => f.path === `${MODULE_DIR}contact.ts` && CONTACT_DATA.test(f.text)),
    ).toBe(true);
  });

  it('nenhum arquivo fora de src/modules/contact acessa UserContact', () => {
    const offenders = files
      .filter((f) => !f.path.startsWith(MODULE_DIR) && !f.path.startsWith(GENERATED_DIR))
      .filter((f) => !FIXTURE_EXCEPTIONS.has(f.path))
      .filter((f) => CONTACT_DATA.test(f.text))
      .map((f) => f.path);

    expect(offenders).toEqual([]);
  });

  it('as excecoes sao so testes de integracao que ainda existem', () => {
    for (const path of FIXTURE_EXCEPTIONS) {
      expect(path).toMatch(/\.integration\.test\.ts$/);
      expect(files.some((f) => f.path === path)).toBe(true);
    }
  });

  it('ninguem de fora importa caminho interno do modulo, exceto as actions', () => {
    const offenders = files
      .filter((f) => !f.path.startsWith(MODULE_DIR))
      .flatMap((f) =>
        [...f.text.matchAll(INTERNAL_IMPORT)]
          .filter((m) => !ALLOWED_INTERNAL.has(m[1]))
          .map((m) => `${f.path} -> ${m[1]}`),
      );

    expect(offenders).toEqual([]);
  });
});
