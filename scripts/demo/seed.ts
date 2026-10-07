// Executado explicitamente por pnpm demo:seed; nunca por build/migration.
export {};
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* variáveis do processo têm precedência */
  }
}

async function main() {
  const { seedDemoData, requireDemoTarget } = await import('../../src/modules/demo-data/index');
  const { getPrismaClient } = await import('../../src/persistence/prisma');
  requireDemoTarget();
  try {
    const result = await seedDemoData();
    if (!result.success) {
      console.error(result.error);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(result));
  } finally {
    await getPrismaClient().$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Não foi possível cadastrar os produtos exemplares. Confira o alvo e a configuração.',
  );
  process.exitCode = 1;
});
