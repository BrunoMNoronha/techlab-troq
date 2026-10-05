import { appendFileSync } from 'node:fs';
import {
  PREVIEW_EVENTS,
  RELEASE_BRANCH,
  REPOSITORY,
  requirePreviewCiSha,
  requireSuccessfulRun,
} from './policy.mjs';

const target = process.env.RELEASE_TARGET;
if (!['preview', 'production'].includes(target)) throw new Error('Ambiente de release inválido.');
if (process.env.GITHUB_REF !== `refs/heads/${RELEASE_BRANCH}`)
  throw new Error(`Execute apenas a partir de ${RELEASE_BRANCH}.`);

async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!response.ok) throw new Error(`Consulta ao GitHub falhou: HTTP ${response.status}.`);
  return response.json();
}

// A revisão publicada é sempre o HEAD atual da branch de release: uma execução
// atrasada, cuja branch já avançou, é recusada em vez de publicar código velho.
const head = (await github(`/git/ref/heads/${RELEASE_BRANCH}`)).object.sha;

let run;
if (target === 'preview') {
  if (process.env.GITHUB_SHA !== head)
    throw new Error(`Execução obsoleta: ${RELEASE_BRANCH} já avançou. Aguarde a mais recente.`);
  const comparison = await github(`/compare/${head}...main`);
  const ciSha = requirePreviewCiSha(comparison, head);
  const { workflow_runs: runs } = await github(
    `/actions/workflows/ci.yml/runs?head_sha=${ciSha}&event=push&branch=main&status=success&per_page=1`,
  );
  if (!runs?.length) throw new Error('Revisão sem CI aprovado de push em main.');
  run = runs[0];
  requireSuccessfulRun(run, { path: '.github/workflows/ci.yml', event: 'push', sha: ciSha });
} else {
  let runId = process.env.SOURCE_RUN_ID?.trim();
  if (!runId) {
    const { workflow_runs: runs } = await github(
      `/actions/workflows/deploy-preview.yml/runs?head_sha=${head}&branch=${RELEASE_BRANCH}&status=success&per_page=1`,
    );
    if (!runs?.length)
      throw new Error(`Nenhum Deploy Preview aprovado para o HEAD de ${RELEASE_BRANCH}.`);
    runId = String(runs[0].id);
  }
  if (!/^\d+$/.test(runId)) throw new Error('Identificador de execução inválido.');
  run = await github(`/actions/runs/${runId}`);
  requireSuccessfulRun(run, {
    path: '.github/workflows/deploy-preview.yml',
    event: PREVIEW_EVENTS,
    branch: RELEASE_BRANCH,
    sha: head,
  });
}
appendFileSync(
  process.env.GITHUB_OUTPUT,
  `sha=${head}\nrun_id=${run.id}\nrun_attempt=${run.run_attempt}\n`,
);
console.log(`Execução confiável: ${run.id}; revisão ${head}.`);
