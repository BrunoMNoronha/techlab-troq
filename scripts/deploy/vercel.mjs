import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  PROJECT_ID,
  TEAM_ID,
  PREVIEW_URL,
  PRODUCTION_URL,
  RELEASE_BRANCH,
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
async function api(path, init = {}) {
  const response = await fetch(`https://api.vercel.com${path}`, { headers, ...init });
  if (!response.ok) {
    // O corpo de erro da Vercel traz código e mensagem do provedor, nunca o
    // token; sai só isso, curto, para a falha não ficar muda.
    const body = await response.json().catch(() => ({}));
    const detail = [body.error?.code, body.error?.message].filter(Boolean).join(': ');
    throw new Error(
      `Vercel: acesso recusado ou recurso indisponível (HTTP ${response.status})` +
        (detail ? ` — ${detail.slice(0, 300)}` : '') +
        '.',
    );
  }
  return response.status === 204 ? {} : response.json().catch(() => ({}));
}
function post(path, body) {
  return api(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
}
/**
 * Deploy pela API REST, a partir do commit no GitHub (`gitSource`): o build
 * remoto usa as variáveis do escopo na Vercel e nada é enviado do runner. A
 * CLI deixou de servir porque recusa o token ao carregar o usuário ("User not
 * found", run 37259818575), embora o mesmo token funcione na API do projeto.
 */
async function createDeployment() {
  const created = await post(`/v13/deployments?teamId=${TEAM_ID}&forceNew=1`, {
    name: 'techlab-troq',
    project: PROJECT_ID,
    gitSource: {
      type: 'github',
      org: 'BrunoMNoronha',
      repo: 'techlab-troq',
      // Os dois alvos publicam o mesmo SHA da branch de release; o alvo é
      // explícito e checkDeployment recusa qualquer inferência divergente.
      ref: RELEASE_BRANCH,
      sha: process.env.RELEASE_SHA,
    },
    ...(target === 'production' ? { target: 'production', autoAssignCustomDomains: false } : {}),
  });
  if (!/^dpl_[a-zA-Z0-9]+$/.test(created.id ?? '')) throw new Error('Vercel não criou deployment.');
  const deadline = Date.now() + 20 * 60 * 1000;
  for (;;) {
    const item = await api(`/v13/deployments/${created.id}?teamId=${TEAM_ID}`);
    if (item.readyState === 'READY') return { item, url: `https://${item.url}` };
    if (['ERROR', 'CANCELED'].includes(item.readyState))
      throw new Error(`Build ${created.id} terminou em ${item.readyState}; ver logs na Vercel.`);
    if (Date.now() > deadline) throw new Error(`Build ${created.id} não ficou pronto em 20 min.`);
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
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
  const { item, url } = await createDeployment();
  checkDeployment(item);
  await smoke(url);
  mkdirSync('release-proof', { recursive: true });
  writeFileSync(
    'release-proof/candidate.json',
    JSON.stringify({ deploymentId: item.id, url, sha: process.env.RELEASE_SHA, target }),
  );
  if (target === 'preview') {
    await post(`/v2/deployments/${item.id}/aliases?teamId=${TEAM_ID}`, {
      alias: new URL(PREVIEW_URL).hostname,
    });
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
  await post(`/v10/projects/${PROJECT_ID}/promote/${item.id}?teamId=${TEAM_ID}`);
  await smoke(PRODUCTION_URL);
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `Production: ${PRODUCTION_URL}\n\nSHA: ${process.env.RELEASE_SHA}\n\nDeployment: ${item.id}\n`,
  );
} else if (command === 'rollback') {
  if (!/^dpl_[a-zA-Z0-9]+$/.test(process.env.PREVIOUS_ID ?? ''))
    throw new Error('Deployment anterior inválido.');
  await post(`/v1/projects/${PROJECT_ID}/rollback/${process.env.PREVIOUS_ID}?teamId=${TEAM_ID}`);
  console.log('Deployment anterior restaurado; nenhuma migration foi revertida.');
} else {
  throw new Error('Comando de release desconhecido.');
}
