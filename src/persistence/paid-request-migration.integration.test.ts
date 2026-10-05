// @vitest-environment node
// DEC-051 (#148): aplica o SQL REAL sobre o historico REAL, num schema isolado
// do PostgreSQL descartavel. Preserva paid duplicado e reserva preexistente.
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface SqlClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
// pg ja e dependencia direta; carregar sem adicionar tipos/pacotes ao projeto.
const { Client } = createRequire(import.meta.url)('pg') as {
  Client: new (options: { connectionString: string }) => SqlClient;
};

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'migration DEC-051 com dados legados',
  () => {
    it('preserva todas as linhas pagas duplicadas, protege novas reservas e confirma a reserva anteriormente admitida', async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL! });
      const schema = `it148_${randomUUID().replaceAll('-', '')}`;
      const migrations = join(process.cwd(), 'prisma', 'migrations');
      const target = '20261005140000_paid_request_per_requester';
      const owner = randomUUID();
      const requester = randomUUID();
      const listing = randomUUID();
      const paid1 = randomUUID();
      const paid2 = randomUUID();
      const reserved = randomUUID();
      await client.connect();
      try {
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET search_path TO "${schema}"`);
        for (const migration of readdirSync(migrations)
          .filter((name) => /^\d/.test(name) && name < target)
          .sort()) {
          await client.query(readFileSync(join(migrations, migration, 'migration.sql'), 'utf8'));
        }
        await client.query(
          `
        INSERT INTO users (id, display_name, email, updated_at)
        VALUES ($1, 'Dono sintetico', 'owner148@example.test', now()),
               ($2, 'Solicitante sintetico', 'requester148@example.test', now())`,
          [owner, requester],
        );
        await client.query(
          `
        INSERT INTO listings (id, owner_id, title, description, city, uf, updated_at)
        VALUES ($1, $2, 'Item sintetico', 'Descricao sintetica', 'Recife', 'PE', now())`,
          [listing, owner],
        );
        await client.query(
          `
        INSERT INTO contact_requests
          (id, listing_id, requester_id, slot_index, status, reserved_from, reserved_until, paid_at, updated_at)
        VALUES ($1, $4, $5, 1, 'paid', now(), now() + interval '30 minutes', now(), now()),
               ($2, $4, $5, 2, 'paid', now(), now() + interval '30 minutes', now(), now()),
               ($3, $4, $5, 3, 'reserved', now(), now() + interval '30 minutes', NULL, now())`,
          [paid1, paid2, reserved, listing, requester],
        );
        const before = await client.query('SELECT * FROM contact_requests ORDER BY id');
        await client.query(readFileSync(join(migrations, target, 'migration.sql'), 'utf8'));
        expect((await client.query('SELECT * FROM contact_requests ORDER BY id')).rows).toEqual(
          before.rows,
        );
        expect(
          (await client.query('SELECT has_paid FROM contact_request_paid_guards')).rows,
        ).toEqual([{ has_paid: true }]);
        // A falha vem do guard, antes de chegar ao indice das tres vagas.
        await expect(
          client.query(
            `
        INSERT INTO contact_requests
          (id, listing_id, requester_id, slot_index, status, reserved_from, reserved_until, updated_at)
        VALUES ($1, $2, $3, 1, 'reserved', now(), now() + interval '30 minutes', now())`,
            [randomUUID(), listing, requester],
          ),
        ).rejects.toThrow(/DEC-051/);
        await expect(
          client.query(
            `
        INSERT INTO contact_requests
          (id, listing_id, requester_id, slot_index, status, reserved_from, reserved_until, paid_at, updated_at)
        VALUES ($1, $2, $3, 1, 'paid', now(), now() + interval '30 minutes', now(), now())`,
            [randomUUID(), listing, requester],
          ),
        ).rejects.toThrow(/DEC-051/);
        await client.query(
          "UPDATE contact_requests SET status = 'paid', paid_at = now() WHERE id = $1",
          [reserved],
        );
        expect(
          (await client.query("SELECT id FROM contact_requests WHERE status = 'paid'")).rows,
        ).toHaveLength(3);
      } finally {
        await client.query('ROLLBACK');
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await client.end();
      }
    }, 60_000);
  },
);
