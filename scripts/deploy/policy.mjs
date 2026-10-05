export const REPOSITORY = 'BrunoMNoronha/techlab-troq';
export const PROJECT_ID = 'prj_mpILJv4OGXwsW3boJdXBPx3PSJGT';
export const TEAM_ID = 'team_ICY1aaLTQI5BmxlyrSjpRTJC';
export const PREVIEW_URL = 'https://techlab-troq-git-preview-bruno-m-noronha.vercel.app';
export const PRODUCTION_URL = 'https://troqs.app';
/** Branch de release: espelho por fast-forward de commits de main já aprovados no CI. */
export const RELEASE_BRANCH = 'production';
export const PREVIEW_EVENTS = ['push', 'workflow_dispatch'];
export const SHA_PATTERN = /^[a-f0-9]{40}$/;
export const RUNTIME_KEYS = [
  'APP_ENV',
  'DATABASE_URL',
  'BETTER_AUTH_URL',
  'BETTER_AUTH_SECRET',
  'NEXT_PUBLIC_APP_URL',
  'R2_S3_ENDPOINT',
  'R2_REGION',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'CRON_SECRET',
  'NEXT_PUBLIC_SENTRY_DSN',
];

const GOOGLE_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];

export function requireEnvironmentMetadata(envs, target) {
  const scoped = new Map();
  for (const env of envs.filter((item) => item.target?.includes(target) && !item.gitBranch)) {
    scoped.set(env.key, env);
  }
  if (target === 'preview') {
    for (const env of envs.filter(
      (item) => item.target?.includes(target) && item.gitBranch === RELEASE_BRANCH,
    )) {
      scoped.set(env.key, env);
    }
  }
  const keys = [
    ...RUNTIME_KEYS,
    ...(target === 'preview' || target === 'production' ? GOOGLE_KEYS : []),
    ...(target === 'production'
      ? ['MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET', 'MERCADO_PAGO_APPLICATION_ID']
      : []),
  ];
  for (const key of keys) {
    const entry = scoped.get(key);
    if (
      !entry ||
      (!['sensitive', 'encrypted'].includes(entry.type) &&
        (!entry.value || /SUBSTITUIR_|example\.invalid/.test(entry.value)))
    ) {
      throw new Error(`Variável Vercel ausente ou fictícia: ${key}.`);
    }
    if (
      (key.includes('SECRET') ||
        key.includes('TOKEN') ||
        key === 'DATABASE_URL' ||
        key === 'RESEND_API_KEY' ||
        key === 'R2_ACCESS_KEY_ID') &&
      entry.type !== 'sensitive'
    ) {
      throw new Error(`Variável deve ser sensível: ${key}.`);
    }
  }
  const url = target === 'production' ? PRODUCTION_URL : PREVIEW_URL;
  for (const [key, expected] of Object.entries({
    APP_ENV: target,
    BETTER_AUTH_URL: url,
    NEXT_PUBLIC_APP_URL: url,
  })) {
    if (scoped.get(key)?.value !== expected || scoped.get(key)?.type !== 'plain') {
      throw new Error(`Configuração pública incoerente: ${key}.`);
    }
  }
  if (scoped.has('DIRECT_URL')) throw new Error('DIRECT_URL não deve estar na Vercel.');
  if (target === 'preview' || target === 'production') {
    if (!scoped.has('GOOGLE_CLIENT_ID') || !scoped.has('GOOGLE_CLIENT_SECRET')) {
      throw new Error('Cliente Google ausente ou incompleto.');
    }
  }
}

export function requireSuccessfulRun(run, { path, event, sha, branch = 'main' } = {}) {
  const events = Array.isArray(event) ? event : event ? [event] : [];
  if (
    run.repository?.full_name !== REPOSITORY ||
    run.head_repository?.full_name !== REPOSITORY ||
    run.head_branch !== branch ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    !SHA_PATTERN.test(run.head_sha ?? '') ||
    (path && run.path !== path) ||
    (events.length && !events.includes(run.event)) ||
    (sha && run.head_sha !== sha)
  ) {
    throw new Error('Execução recusada: origem, revisão ou resultado não confiável.');
  }
  return run.head_sha;
}

export function requirePreviewCiSha(comparison, releaseSha) {
  if (['ahead', 'identical'].includes(comparison.status)) return releaseSha;
  const mergeBase = comparison.merge_base_commit;
  const releaseTree = comparison.base_commit?.commit?.tree?.sha;
  if (
    comparison.status === 'behind' &&
    comparison.base_commit?.sha === releaseSha &&
    SHA_PATTERN.test(mergeBase?.sha ?? '') &&
    SHA_PATTERN.test(releaseTree ?? '') &&
    mergeBase.commit?.tree?.sha === releaseTree
  ) {
    return mergeBase.sha;
  }
  throw new Error(`${RELEASE_BRANCH} contém commits fora de main; a release foi recusada.`);
}

export function requirePreviewProof(proof, run) {
  const sha = requireSuccessfulRun(run, {
    path: '.github/workflows/deploy-preview.yml',
    event: PREVIEW_EVENTS,
    branch: RELEASE_BRANCH,
  });
  if (
    proof.repository !== REPOSITORY ||
    proof.sha !== sha ||
    proof.runId !== run.id ||
    proof.runAttempt !== run.run_attempt ||
    proof.environment !== 'preview' ||
    proof.projectId !== PROJECT_ID ||
    proof.url !== PREVIEW_URL ||
    proof.smoke !== 'passed' ||
    !/^dpl_[a-zA-Z0-9]+$/.test(proof.deploymentId ?? '')
  ) {
    throw new Error('Evidência de Preview recusada: metadados inconsistentes.');
  }
  return sha;
}

export function requireDirectConnection(directUrl, pooledUrl) {
  const direct = new URL(directUrl);
  const pooled = new URL(pooledUrl);
  if (
    direct.hostname.includes('-pooler') ||
    !pooled.hostname.includes('-pooler') ||
    direct.hostname !== pooled.hostname.replace('-pooler', '') ||
    direct.pathname !== pooled.pathname ||
    direct.username !== pooled.username
  ) {
    throw new Error('DIRECT_URL e DATABASE_URL não identificam o mesmo banco Neon.');
  }
}
