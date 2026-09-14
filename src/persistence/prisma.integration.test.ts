// @vitest-environment node
//
// Prova de integracao da fronteira de persistencia contra PostgreSQL REAL e
// descartavel, ja migrado por `prisma migrate deploy` (docs/engineering/
// database.md, secao 12). Executada por `npm run test:integration`, fora de
// `test:ci`, porque exige `DATABASE_URL` apontando para um banco efemero.
//
// Somente leitura: nenhuma linha e escrita. Nao usa mock — a garantia que se
// quer provar (o runtime conecta e consulta o schema migrado) depende do banco
// (docs/engineering/testing.md, secao 6.2).
import { afterAll, describe, expect, it } from 'vitest';
import { getPrismaClient } from './prisma';

const INITIAL_MIGRATION = '20260914210926_initial_schema';

describe('runtime Prisma contra PostgreSQL real', () => {
  afterAll(async () => {
    if (process.env.DATABASE_URL) {
      await getPrismaClient().$disconnect();
    }
  });

  it('exige DATABASE_URL definida para o banco descartavel', () => {
    expect(
      process.env.DATABASE_URL,
      'Defina DATABASE_URL para um PostgreSQL descartavel antes de rodar test:integration',
    ).toBeTruthy();
  });

  it('abre conexao e executa uma consulta trivial', async () => {
    const rows = await getPrismaClient().$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;

    expect(rows).toEqual([{ ok: 1 }]);
  });

  it('encontra a migration inicial aplicada em _prisma_migrations', async () => {
    const rows = await getPrismaClient().$queryRaw<
      { migration_name: string; finished: boolean }[]
    >`SELECT migration_name, finished_at IS NOT NULL AS finished FROM _prisma_migrations`;

    expect(rows).toContainEqual({ migration_name: INITIAL_MIGRATION, finished: true });
  });

  it('consulta o schema migrado pelo client tipado, sem escrever', async () => {
    const prisma = getPrismaClient();

    const [users, listings, contactRequests] = await Promise.all([
      prisma.user.count(),
      prisma.listing.count(),
      prisma.contactRequest.count(),
    ]);

    expect(typeof users).toBe('number');
    expect(typeof listings).toBe('number');
    expect(typeof contactRequests).toBe('number');
  });

  it('reutiliza a mesma instancia entre consultas', async () => {
    const a = getPrismaClient();
    await a.$queryRaw`SELECT 1`;
    const b = getPrismaClient();

    expect(b).toBe(a);
  });
});
