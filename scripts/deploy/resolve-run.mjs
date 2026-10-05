import { appendFileSync } from 'node:fs';
import { requireSuccessfulRun, REPOSITORY } from './policy.mjs';

const runId = process.env.SOURCE_RUN_ID;
if (!/^\d+$/.test(runId ?? '')) throw new Error('Identificador de execução inválido.');
if (process.env.GITHUB_REF !== 'refs/heads/main')
  throw new Error('Execute apenas a partir de main.');
const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/runs/${runId}`, {
  headers: {
    Authorization: `Bearer ${process.env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
  },
});
if (!response.ok) throw new Error(`Consulta da execução falhou: HTTP ${response.status}.`);
const run = await response.json();
const target = process.env.RELEASE_TARGET;
const sha = requireSuccessfulRun(run, {
  path:
    target === 'production' ? '.github/workflows/deploy-preview.yml' : '.github/workflows/ci.yml',
  event: target === 'production' ? 'workflow_run' : 'push',
});
if (target !== 'production') {
  const headResponse = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/git/ref/heads/main`,
    {
      headers: { Authorization: `Bearer ${process.env.GH_TOKEN}` },
    },
  );
  if (!headResponse.ok) throw new Error('Não foi possível conferir main.');
  const head = await headResponse.json();
  if (head.object.sha !== sha)
    throw new Error('CI obsoleto: main já avançou. Aguarde o CI mais recente.');
}
appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\nrun_attempt=${run.run_attempt}\n`);
console.log(`Execução confiável: ${run.id}; revisão ${sha}.`);
