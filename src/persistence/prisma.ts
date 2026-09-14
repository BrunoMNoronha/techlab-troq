// Fronteira de persistencia do TROQ: o UNICO ponto da aplicacao que instancia o
// Prisma Client (docs/architecture/overview.md, AR-3.2 — a camada de
// persistencia e "o unico lugar que fala Prisma/SQL").
//
// Exclusivamente server-side: le `DATABASE_URL` (segredo; docs/engineering/
// environments.md, secao 5.2) e abre conexao TCP com o PostgreSQL. Nenhum
// Client Component pode importar este modulo — o bundle de cliente nao tem
// `net`/`tls`, e o build falha ao tentar (docs/engineering/database.md, secao 13).
//
// Decisoes (docs/engineering/database.md, secao 13):
// - Prisma ORM 7 exige driver adapter; usa-se `@prisma/adapter-pg` sobre `pg`.
//   O pool de conexoes pertence ao `pg` (padrao `max = 10`).
// - `DATABASE_URL` e a conexao POOLED do runtime. `DIRECT_URL` (conexao direta,
//   so Prisma CLI) nunca e lida aqui — ADR-0005, decisao 10.
// - Inicializacao LAZY: importar o modulo nao exige a variavel e nao toca o
//   banco; a ausencia de `DATABASE_URL` so falha quando um cliente e pedido.
// - Instancia unica por processo, guardada em `globalThis` para sobreviver ao
//   hot reload do Next.js em desenvolvimento (que reavalia modulos, mas nao o
//   objeto global). Sem `$disconnect()` por request: a instancia — e o pool —
//   sao reutilizados enquanto o processo viver.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

export type { PrismaClient } from '@/generated/prisma/client';

const DATABASE_URL_VARIABLE = 'DATABASE_URL';

// Chave nomeada (e nao um simbolo local) de proposito: um simbolo criado no
// modulo seria recriado a cada reavaliacao pelo hot reload e perderia o cache.
type GlobalWithPrismaClient = typeof globalThis & { __troqPrismaClient?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env[DATABASE_URL_VARIABLE];

  if (!connectionString) {
    // A mensagem nomeia a variavel e nunca o valor: nenhuma connection string
    // atravessa erro ou log (environments.md, secao 6.5).
    throw new Error(
      `${DATABASE_URL_VARIABLE} nao definida: o runtime nao pode abrir conexao com o PostgreSQL. ` +
        'Defina a variavel no ambiente (docs/engineering/environments.md, secao 5.2).',
    );
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}

/**
 * Devolve o Prisma Client da aplicacao, criando-o na primeira chamada e
 * reutilizando a mesma instancia nas seguintes.
 *
 * Lanca `Error` se `DATABASE_URL` nao estiver definida. Nao abre conexao ao
 * ser chamada: o `pg.Pool` e criado e a primeira conexao e aberta apenas na
 * primeira consulta.
 */
export function getPrismaClient(): PrismaClient {
  const scope = globalThis as GlobalWithPrismaClient;

  scope.__troqPrismaClient ??= createPrismaClient();

  return scope.__troqPrismaClient;
}
