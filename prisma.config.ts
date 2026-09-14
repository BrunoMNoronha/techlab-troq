import { defineConfig } from 'prisma/config';

// Prisma ORM 7 nao carrega `.env*` sozinho. O runtime Node.js 24 ja oferece
// `process.loadEnvFile`, entao nenhuma dependencia extra e necessaria. Os
// arquivos sao opcionais: em CI e em ambientes hospedados a variavel vem do
// proprio ambiente, e a ausencia do arquivo nao e erro.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Arquivo ausente: segue com o ambiente do processo.
  }
}

// Operacoes de schema e de migration usam a conexao DIRETA (nao pooled),
// conforme ADR-0005, decisao 10, e docs/engineering/environments.md, secao 5.2.
// `DATABASE_URL` (pooled) e lida exclusivamente pelo runtime da aplicacao, em
// src/persistence/prisma.ts; o CLI nunca a usa.
//
// O datasource so e declarado quando a variavel existe: `prisma generate`,
// `prisma validate` e `prisma format` nao tocam o banco e precisam funcionar
// sem ela (por exemplo em CI). Os comandos que tocam o banco (`migrate dev`,
// `migrate deploy`, `migrate status`, ...) falham com o erro do proprio Prisma
// quando `DIRECT_URL` nao esta definida.
const directUrl = process.env.DIRECT_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
});
