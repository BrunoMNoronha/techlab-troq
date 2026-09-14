// @vitest-environment node
//
// Testes unitarios da fronteira de persistencia: carregamento, erro controlado
// sem `DATABASE_URL` e reuso da instancia. Nao tocam banco: a prova de conexao
// real esta em prisma.integration.test.ts (`npm run test:integration`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Placeholder obviamente ficticio (host `example.invalid`, RFC 2606). Nenhuma
// conexao e aberta nestes testes, entao o valor nunca e resolvido.
const SYNTHETIC_DATABASE_URL =
  'postgresql://SUBSTITUIR_USUARIO:SUBSTITUIR_SENHA@pooled.example.invalid:5432/troq';

// Mesma chave usada por src/persistence/prisma.ts. Limpa-la entre os testes e o
// que os torna independentes da ordem de execucao.
const GLOBAL_KEY = '__troqPrismaClient';

function clearCachedClient(): void {
  delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
}

async function loadBoundary() {
  vi.resetModules();
  return import('./prisma');
}

describe('fronteira de persistencia (Prisma Client)', () => {
  beforeEach(() => {
    clearCachedClient();
    vi.stubEnv('DATABASE_URL', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearCachedClient();
  });

  it('carrega o modulo sem DATABASE_URL, sem lancar erro', async () => {
    const boundary = await loadBoundary();

    expect(typeof boundary.getPrismaClient).toBe('function');
  });

  it('falha de forma controlada ao pedir o client sem DATABASE_URL', async () => {
    const { getPrismaClient } = await loadBoundary();

    expect(() => getPrismaClient()).toThrowError(/DATABASE_URL/);
  });

  it('nao inclui valor de conexao na mensagem de erro', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { getPrismaClient } = await loadBoundary();

    let message = '';
    try {
      getPrismaClient();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toMatch(/postgres(ql)?:\/\//);
  });

  it('reutiliza a mesma instancia em chamadas sucessivas', async () => {
    vi.stubEnv('DATABASE_URL', SYNTHETIC_DATABASE_URL);
    const { getPrismaClient } = await loadBoundary();

    const first = getPrismaClient();
    const second = getPrismaClient();

    expect(second).toBe(first);
  });

  it('preserva a instancia quando o modulo e reavaliado (hot reload)', async () => {
    vi.stubEnv('DATABASE_URL', SYNTHETIC_DATABASE_URL);
    const firstLoad = await loadBoundary();
    const first = firstLoad.getPrismaClient();

    const secondLoad = await loadBoundary();
    const second = secondLoad.getPrismaClient();

    expect(secondLoad).not.toBe(firstLoad);
    expect(second).toBe(first);
  });
});
