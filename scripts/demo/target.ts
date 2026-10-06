export {};
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* arquivos opcionais */
  }
}

async function main() {
  const { inspectDemoTarget } = await import('../../src/modules/demo-data/config');
  const target = inspectDemoTarget();
  console.log(`DEMO_DATA_TARGET=${target.environment}`);
  console.log(`DEMO_DATABASE_FINGERPRINT=${target.databaseFingerprint}`);
  console.log(`DEMO_MEDIA_FINGERPRINT=${target.mediaFingerprint}`);
}
main().catch(() => {
  console.error('Alvo demonstrativo inválido. Confira APP_ENV e os recursos isolados.');
  process.exitCode = 1;
});
