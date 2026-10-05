import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  PROJECT_ID,
  TEAM_ID,
  PREVIEW_URL,
  PRODUCTION_URL,
  REPOSITORY,
  SHA_PATTERN,
  requireEnvironmentMetadata,
} from './policy.mjs';

const target = process.env.RELEASE_TARGET;
if (!['preview', 'production'].includes(target)) throw new Error('Ambiente de release inválido.');
if (!SHA_PATTERN.test(process.env.RELEASE_SHA ?? '')) throw new Error('SHA inválido.');
if (!process.env.VERCEL_TOKEN) throw new Error('Secret VERCEL_TOKEN ausente.');
const command = process.argv[2];
const headers = {
  Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
  'Content-Type': 'application/json',
};
async function api(path) {
  const response = await fetch(`https://api.vercel.com${path}`, { headers });
  if (!response.ok)
    throw new Error(`Vercel: acesso recusado ou recurso indisponível (HTTP ${response.status}).`);
  return response.json();
}
async function cli(args) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['dlx', 'vercel@62.2.0', ...args, '--token', process.env.VERCEL_TOKEN],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error(
              `CLI Vercel falhou (código ${code}); consultar logs do deployment no provedor.`,
            ),
          ),
    );
  });
  return result.trim();
}
async function deployment(url) {
  return api(
    `/v13/deployments/${encodeURIComponent(url.replace('https://', ''))}?teamId=${TEAM_ID}`,
  );
}
function checkDeployment(item) {
  if (
    item.projectId !== PROJECT_ID ||
    item.meta?.githubCommitSha !== process.env.RELEASE_SHA ||
    (item.target === 'production') !== (target === 'production') ||
    item.readyState !== 'READY'
  ) {
    throw new Error('Deployment não corresponde ao projeto, ambiente ou SHA esperado.');
  }
}
async function smoke(url) {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypass) throw new Error('Secret VERCEL_AUTOMATION_BYPASS_SECRET ausente.');
  for (const path of ['/', '/login', '/explorar', '/api/auth/get-session']) {
    const response = await fetch(`${url}${path}`, {
      headers: { 'x-vercel-protection-bypass': bypass },
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });
    if (response.status !== 200)
      throw new Error(`Smoke falhou em ${path}: HTTP ${response.status}.`);
    if (path === '/api/auth/get-session' && (await response.text()) !== 'null')
      throw new Error('Sessão anônima incoerente.');
  }
  const denied = await fetch(`${url}/api/jobs/media-process`, {
    headers: { 'x-vercel-protection-bypass': bypass },
    redirect: 'manual',
  });
  if (denied.status !== 401)
    throw new Error('Job aceitou requisição sem autenticação ou ficou inacessível.');
  if (target === 'preview') {
    if (!process.env.CRON_SECRET) throw new Error('CRON_SECRET ausente para a prova de Preview.');
    for (const job of [
      'media-process',
      'media-cleanup',
      'payments-reconcile',
      'payments-refund-retry',
    ]) {
      const response = await fetch(`${url}/api/jobs/${job}`, {
        headers: {
          'x-vercel-protection-bypass': bypass,
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(300000),
      });
      if (response.status !== 200) throw new Error(`Job ${job} recusou chamada autenticada.`);
    }
  }
  console.log('Smoke HTTP aprovado: páginas, consulta pública, sessão anônima e proteção de job.');
}

if (command === 'preflight') {
  if (!process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
    throw new Error('Validação HTTP protegida indisponível: secret de automação ausente.');
  if (target === 'preview' && !process.env.CRON_SECRET) throw new Error('CRON_SECRET ausente.');
  const project = await api(`/v9/projects/${PROJECT_ID}?teamId=${TEAM_ID}`);
  if (project.accountId !== TEAM_ID || project.nodeVersion !== '24.x')
    throw new Error('Projeto ou runtime incoerente.');
  const { envs } = await api(`/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}&decrypt=false`);
  requireEnvironmentMetadata(envs, target);
  if (target === 'production') {
    const data = await api(`/v2/teams/${TEAM_ID}`);
    if (!['pro', 'enterprise'].includes((data.team ?? data).billing?.plan))
      throw new Error('Plano não comprovado para cron de minutos. Nenhum upgrade será realizado.');
    const domains = await api(`/v9/projects/${PROJECT_ID}/domains?teamId=${TEAM_ID}`);
    if (!domains.domains?.some((item) => item.name === 'troqs.app' && item.verified))
      throw new Error('Domínio Production não verificado.');
    // A liberação comercial exige aprovação explícita dos pré-requisitos externos.
    if (process.env.PRODUCTION_READY !== 'true')
      throw new Error(
        'Production bloqueada: credenciais, cron e homologação precisam estar comprovados (PRODUCTION_READY).',
      );
    const active = await deployment(PRODUCTION_URL);
    if (active.projectId !== PROJECT_ID) throw new Error('Domínio aponta para outro projeto.');
    const previousId = active.id;
    appendFileSync(process.env.GITHUB_OUTPUT, `previous_id=${previousId ?? ''}\n`);
  }
  console.log(`Preflight ${target} aprovado. Nenhum segredo foi recuperado da Vercel.`);
} else if (command === 'deploy') {
  mkdirSync('.vercel', { recursive: true });
  writeFileSync('.vercel/project.json', JSON.stringify({ projectId: PROJECT_ID, orgId: TEAM_ID }));
  const args = [
    'deploy',
    '--yes',
    '--scope',
    'bruno-m-noronha',
    '--meta',
    'githubDeployment=1',
    '--meta',
    `githubCommitSha=${process.env.RELEASE_SHA}`,
    '--meta',
    `githubCommitRef=${target === 'preview' ? 'preview' : 'main'}`,
    '--meta',
    'githubCommitOrg=BrunoMNoronha',
    '--meta',
    'githubCommitRepo=techlab-troq',
  ];
  if (target === 'production') args.push('--prod', '--skip-domain');
  const output = await cli(args);
  const url = output.match(/https:\/\/[^\s]+\.vercel\.app/g)?.at(-1);
  if (!url) throw new Error('CLI não retornou URL de deployment válida.');
  const item = await deployment(url);
  checkDeployment(item);
  await smoke(url);
  mkdirSync('release-proof', { recursive: true });
  writeFileSync(
    'release-proof/candidate.json',
    JSON.stringify({ deploymentId: item.id, url, sha: process.env.RELEASE_SHA, target }),
  );
  if (target === 'preview') {
    await cli(['alias', 'set', url, new URL(PREVIEW_URL).hostname, '--scope', 'bruno-m-noronha']);
    await smoke(PREVIEW_URL);
    writeFileSync(
      'release-proof/release.json',
      JSON.stringify(
        {
          repository: REPOSITORY,
          sha: process.env.RELEASE_SHA,
          runId: Number(process.env.GITHUB_RUN_ID),
          runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
          environment: 'preview',
          projectId: PROJECT_ID,
          deploymentId: item.id,
          url: PREVIEW_URL,
          smoke: 'passed',
        },
        null,
        2,
      ),
    );
  }
  console.log(`Deployment ${item.id}: ${url}; SHA ${process.env.RELEASE_SHA}.`);
} else if (command === 'promote') {
  const candidate = JSON.parse(readFileSync('release-proof/candidate.json', 'utf8'));
  const item = await deployment(candidate.url);
  checkDeployment(item);
  await cli(['promote', item.id, '--yes', '--scope', 'bruno-m-noronha']);
  await smoke(PRODUCTION_URL);
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `Production: ${PRODUCTION_URL}\n\nSHA: ${process.env.RELEASE_SHA}\n\nDeployment: ${item.id}\n`,
  );
} else if (command === 'rollback') {
  if (!/^dpl_[a-zA-Z0-9]+$/.test(process.env.PREVIOUS_ID ?? ''))
    throw new Error('Deployment anterior inválido.');
  await cli(['rollback', process.env.PREVIOUS_ID, '--yes', '--scope', 'bruno-m-noronha']);
  console.log('Deployment anterior restaurado; nenhuma migration foi revertida.');
} else {
  throw new Error('Comando de release desconhecido.');
}
