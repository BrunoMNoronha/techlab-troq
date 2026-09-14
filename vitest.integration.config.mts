import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Testes de integracao com PostgreSQL real e descartavel (docs/engineering/
// testing.md, secao 2.2). Separados da suite padrao porque exigem
// `DATABASE_URL` apontando para um banco efemero ja migrado; `test:ci` continua
// deterministico e sem banco. Executar com `npm run test:integration`.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    // Um unico banco descartavel: arquivos em serie evitam disputa por ele.
    fileParallelism: false,
  },
});
