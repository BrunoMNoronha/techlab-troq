import pg from 'pg';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { requireDirectConnection } from './policy.mjs';

requireDirectConnection(process.env.DIRECT_URL, process.env.DATABASE_URL);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query('SELECT 1');
  const { rows } = await client.query(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
  );
  if (!rows.length) throw new Error('Histórico de migrations ausente.');
  if (process.env.GITHUB_OUTPUT && ['before', 'after'].includes(process.argv[2])) {
    const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    appendFileSync(process.env.GITHUB_OUTPUT, `${process.argv[2]}_history=${digest}\n`);
  }
  console.log(`Conexão pooled aprovada; ${rows.length} migrations concluídas.`);
} catch {
  throw new Error('Verificação do banco falhou; detalhes de conexão suprimidos.');
} finally {
  await client.end();
}
