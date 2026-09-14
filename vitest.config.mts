import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Integracao com PostgreSQL real fica fora da suite padrao: exige banco
    // descartavel e roda por `npm run test:integration`.
    exclude: [...configDefaults.exclude, 'src/**/*.integration.test.ts'],
    css: false,
  },
});
