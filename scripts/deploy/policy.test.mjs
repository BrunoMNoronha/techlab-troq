import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  REPOSITORY,
  PROJECT_ID,
  PREVIEW_URL,
  RUNTIME_KEYS,
  requirePreviewCiSha,
  requireSuccessfulRun,
  requirePreviewProof,
  requireDirectConnection,
  requireEnvironmentMetadata,
} from './policy.mjs';

const sha = 'a'.repeat(40);
const GOOGLE_CLIENT_ID = 'cliente.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = 'segredo-sintetico-do-google';
const SENSITIVE_KEYS = new Set([
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'RESEND_API_KEY',
  'CRON_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'MERCADO_PAGO_ACCESS_TOKEN',
  'MERCADO_PAGO_WEBHOOK_SECRET',
]);

const previewValues = {
  APP_ENV: 'preview',
  DATABASE_URL: 'postgresql://user:pass@ep-preview-pooler.aws.neon.tech/troq',
  BETTER_AUTH_SECRET: 'segredo-sintetico-do-better-auth',
  BETTER_AUTH_URL: PREVIEW_URL,
  NEXT_PUBLIC_APP_URL: PREVIEW_URL,
  R2_S3_ENDPOINT: 'https://example.r2.test',
  R2_REGION: 'auto',
  R2_BUCKET: 'troq-media-preview',
  R2_ACCESS_KEY_ID: 'acesso-sintetico',
  R2_SECRET_ACCESS_KEY: 'segredo-sintetico-r2',
  RESEND_API_KEY: 'resend-sintetico',
  EMAIL_FROM: 'TROQS <no-reply@troqs.test>',
  CRON_SECRET: 'cron-sintetico',
  NEXT_PUBLIC_SENTRY_DSN: 'https://public.example.com/1',
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
};

const productionValues = {
  ...previewValues,
  APP_ENV: 'production',
  BETTER_AUTH_URL: 'https://troqs.app',
  NEXT_PUBLIC_APP_URL: 'https://troqs.app',
  R2_BUCKET: 'troq-media-production',
  EMAIL_FROM: 'TROQS <no-reply@troqs.app>',
  MERCADO_PAGO_ACCESS_TOKEN: 'mercado-pago-token',
  MERCADO_PAGO_WEBHOOK_SECRET: 'mercado-pago-webhook',
  MERCADO_PAGO_APPLICATION_ID: '1234567890',
};
function run(overrides = {}) {
  return {
    id: 123,
    run_attempt: 1,
    repository: { full_name: REPOSITORY },
    head_repository: { full_name: REPOSITORY },
    head_branch: 'production',
    status: 'completed',
    conclusion: 'success',
    head_sha: sha,
    path: '.github/workflows/deploy-preview.yml',
    event: 'workflow_dispatch',
    ...overrides,
  };
}
function proof(overrides = {}) {
  return {
    repository: REPOSITORY,
    sha,
    runId: 123,
    runAttempt: 1,
    environment: 'preview',
    projectId: PROJECT_ID,
    deploymentId: 'dpl_123ABC',
    url: PREVIEW_URL,
    smoke: 'passed',
    ...overrides,
  };
}
test('promove apenas SHA exato de Preview aprovado no repositório correto', () => {
  assert.equal(requirePreviewProof(proof(), run()), sha);
  assert.equal(requirePreviewProof(proof(), run({ event: 'push' })), sha);
  for (const overrides of [
    { head_branch: 'main' },
    { head_branch: 'preview' },
    { event: 'workflow_run' },
    { head_repository: { full_name: 'attacker/fork' } },
    { repository: { full_name: 'attacker/fork' } },
    { head_branch: 'feature' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { conclusion: 'skipped' },
    { path: '.github/workflows/ci.yml' },
    { event: 'pull_request' },
  ])
    assert.throws(() => requirePreviewProof(proof(), run(overrides)));
});
test('recusa artefato de outra tentativa, revisão, ambiente ou deployment', () => {
  for (const overrides of [
    { sha: 'b'.repeat(40) },
    { runId: 124 },
    { runAttempt: 2 },
    { environment: 'production' },
    { projectId: 'other' },
    { url: 'https://attacker.invalid' },
    { smoke: 'failed' },
    { deploymentId: '' },
  ])
    assert.throws(() => requirePreviewProof(proof(overrides), run()));
});
test('CI de PR não autoriza deploy com secrets', () => {
  const ci = { head_branch: 'main', path: '.github/workflows/ci.yml', event: 'push' };
  assert.equal(requireSuccessfulRun(run(ci), { event: 'push', sha }), sha);
  assert.throws(() =>
    requireSuccessfulRun(run({ ...ci, event: 'pull_request' }), { event: 'push' }),
  );
  assert.throws(() =>
    requireSuccessfulRun(run({ ...ci, head_branch: 'feature' }), { event: 'push' }),
  );
  assert.throws(() => requireSuccessfulRun(run(ci), { sha: 'b'.repeat(40) }));
});
test('merge commit em production só usa CI de main com árvore idêntica', () => {
  const releaseSha = 'a'.repeat(40);
  const mergeBaseSha = 'b'.repeat(40);
  const treeSha = 'c'.repeat(40);
  const comparison = {
    status: 'behind',
    base_commit: { sha: releaseSha, commit: { tree: { sha: treeSha } } },
    merge_base_commit: { sha: mergeBaseSha, commit: { tree: { sha: treeSha } } },
  };
  assert.equal(requirePreviewCiSha({ status: 'ahead' }, releaseSha), releaseSha);
  assert.equal(requirePreviewCiSha({ status: 'identical' }, releaseSha), releaseSha);
  assert.equal(requirePreviewCiSha(comparison, releaseSha), mergeBaseSha);
  assert.throws(() =>
    requirePreviewCiSha(
      {
        ...comparison,
        base_commit: { ...comparison.base_commit, commit: { tree: { sha: 'd'.repeat(40) } } },
      },
      releaseSha,
    ),
  );
  assert.throws(() => requirePreviewCiSha({ ...comparison, status: 'diverged' }, releaseSha));
  assert.throws(() =>
    requirePreviewCiSha(
      { ...comparison, base_commit: { ...comparison.base_commit, sha: 'e'.repeat(40) } },
      releaseSha,
    ),
  );
});
test('conexões direta e pooled devem identificar o mesmo banco', () => {
  const direct = 'postgresql://test:fake@ep-example.aws.neon.tech/troq?sslmode=require';
  const pooled = 'postgresql://test:fake@ep-example-pooler.aws.neon.tech/troq?sslmode=require';
  assert.doesNotThrow(() => requireDirectConnection(direct, pooled));
  assert.throws(() => requireDirectConnection(pooled, pooled));
  assert.throws(() => requireDirectConnection(direct, pooled.replace('ep-example', 'ep-other')));
  assert.throws(() => requireDirectConnection(direct, pooled.replace('/troq?', '/another?')));
});
test('preflight não precisa recuperar secrets sensíveis e respeita overrides da branch', () => {
  const envs = [...RUNTIME_KEYS, 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].map((key) => ({
    key,
    target: ['preview'],
    type: SENSITIVE_KEYS.has(key) ? 'sensitive' : 'plain',
    value: previewValues[key],
  }));
  assert.doesNotThrow(() => requireEnvironmentMetadata(envs, 'preview'));
  assert.throws(() =>
    requireEnvironmentMetadata(
      envs.filter((entry) => entry.key !== 'CRON_SECRET'),
      'preview',
    ),
  );
  assert.throws(() =>
    requireEnvironmentMetadata(
      [
        ...envs,
        {
          key: 'APP_ENV',
          target: ['preview'],
          gitBranch: 'production',
          type: 'plain',
          value: 'production',
        },
      ],
      'preview',
    ),
  );
  assert.throws(() =>
    requireEnvironmentMetadata(
      [...envs, { key: 'DIRECT_URL', target: ['preview'], type: 'sensitive' }],
      'preview',
    ),
  );
  assert.throws(() =>
    requireEnvironmentMetadata(
      envs.filter((entry) => entry.key !== 'GOOGLE_CLIENT_SECRET'),
      'preview',
    ),
  );
  assert.throws(() =>
    requireEnvironmentMetadata(
      envs.filter((entry) => entry.key !== 'GOOGLE_CLIENT_ID'),
      'preview',
    ),
  );
  const productionEnvs = [...RUNTIME_KEYS, 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].map(
    (key) => ({
      key,
      target: ['production'],
      type: SENSITIVE_KEYS.has(key) ? 'sensitive' : 'plain',
      value: productionValues[key],
    }),
  );
  productionEnvs.push(
    ...[
      { key: 'MERCADO_PAGO_ACCESS_TOKEN', value: productionValues.MERCADO_PAGO_ACCESS_TOKEN },
      { key: 'MERCADO_PAGO_WEBHOOK_SECRET', value: productionValues.MERCADO_PAGO_WEBHOOK_SECRET },
      { key: 'MERCADO_PAGO_APPLICATION_ID', value: productionValues.MERCADO_PAGO_APPLICATION_ID },
    ].map((entry) => ({
      key: entry.key,
      target: ['production'],
      type: SENSITIVE_KEYS.has(entry.key) ? 'sensitive' : 'plain',
      value: entry.value,
    })),
  );
  assert.doesNotThrow(() => requireEnvironmentMetadata(productionEnvs, 'production'));
  assert.throws(() =>
    requireEnvironmentMetadata(
      productionEnvs.filter((entry) => entry.key !== 'GOOGLE_CLIENT_ID'),
      'production',
    ),
  );
  assert.throws(() =>
    requireEnvironmentMetadata(
      productionEnvs.filter((entry) => entry.key !== 'GOOGLE_CLIENT_SECRET'),
      'production',
    ),
  );
});
test('Google exige par efetivo em cada target sem depender do valor dos secrets', () => {
  for (const target of ['preview', 'production']) {
    const values = target === 'preview' ? previewValues : productionValues;
    const envs = Object.entries(values).map(([key, value]) => ({
      key,
      target: [target],
      type: SENSITIVE_KEYS.has(key) || key === 'GOOGLE_CLIENT_ID' ? 'sensitive' : 'plain',
      value: SENSITIVE_KEYS.has(key) || key === 'GOOGLE_CLIENT_ID' ? '' : value,
    }));
    assert.doesNotThrow(() => requireEnvironmentMetadata(envs, target));
    const withoutGoogle = envs.filter((entry) => !entry.key.startsWith('GOOGLE_'));
    assert.throws(
      () => requireEnvironmentMetadata(withoutGoogle, target),
      /Variável Vercel ausente ou fictícia: GOOGLE_CLIENT_ID/,
    );
    // Um par só no outro target ou em uma branch de prova não habilita a release.
    for (const googleEntries of [
      envs
        .filter((entry) => entry.key.startsWith('GOOGLE_'))
        .map((entry) => ({ ...entry, target: [target === 'preview' ? 'production' : 'preview'] })),
      envs
        .filter((entry) => entry.key.startsWith('GOOGLE_'))
        .map((entry) => ({ ...entry, gitBranch: 'proof/81-google-preview' })),
    ]) {
      assert.throws(() => requireEnvironmentMetadata([...withoutGoogle, ...googleEntries], target));
    }
    assert.throws(
      () =>
        requireEnvironmentMetadata(
          envs.map((entry) =>
            entry.key === 'GOOGLE_CLIENT_SECRET'
              ? { ...entry, type: 'plain', value: 'sintetico' }
              : entry,
          ),
          target,
        ),
      /Variável deve ser sensível: GOOGLE_CLIENT_SECRET/,
    );
    if (target === 'preview') {
      const scopedGoogle = envs
        .filter((entry) => entry.key.startsWith('GOOGLE_'))
        .map((entry) => ({ ...entry, gitBranch: 'production' }));
      assert.doesNotThrow(() =>
        requireEnvironmentMetadata([...withoutGoogle, ...scopedGoogle], target),
      );
    }
  }
});

test('Production permanece manual e sem acionamento por push', () => {
  const production = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
  assert.match(production, /workflow_dispatch:/);
  assert.doesNotMatch(production, /^\s+(push|workflow_run|pull_request):/m);
  assert.match(production, /verify-proof\.mjs/);
  assert.ok(production.indexOf('vercel.mjs preflight') < production.indexOf('backup.sh'));
  assert.ok(production.indexOf('backup.sh') < production.indexOf('prisma migrate deploy'));
  assert.ok(production.indexOf('prisma migrate deploy') < production.indexOf('vercel.mjs deploy'));
  assert.match(production, /if: github\.ref == 'refs\/heads\/production'/);
  const preview = readFileSync('.github/workflows/deploy-preview.yml', 'utf8');
  assert.match(preview, /push:\s+branches: \[production\]/);
  assert.match(preview, /workflow_dispatch:/);
  assert.doesNotMatch(preview, /^\s+(workflow_run|pull_request):/m);
  assert.doesNotMatch(preview, /contents: write/);
  assert.match(preview, /if: github\.ref == 'refs\/heads\/production'/);
  assert.ok(preview.indexOf('resolve-run.mjs') < preview.indexOf('prisma migrate deploy'));
  assert.equal(JSON.parse(readFileSync('vercel.json')).git.deploymentEnabled, false);
});

test('runner prepara Node sem exigir pnpm antes de fixar a revisão', () => {
  for (const path of [
    '.github/workflows/deploy-preview.yml',
    '.github/workflows/deploy-production.yml',
  ]) {
    const workflow = readFileSync(path, 'utf8');
    assert.match(workflow, /node-version: 24\s+package-manager-cache: false/);
    assert.ok(workflow.indexOf('actions/setup-node@') < workflow.indexOf('pnpm/action-setup@'));
  }
});

test('promoção main → production é manual, só por fast-forward e exige CI de main', () => {
  const promote = readFileSync('.github/workflows/promote-production.yml', 'utf8');
  assert.match(promote, /^on:\s+workflow_dispatch:/m);
  assert.doesNotMatch(promote, /^\s+(push|workflow_run|pull_request|schedule):/m);
  assert.match(promote, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(
    promote,
    /actions\/workflows\/ci\.yml\/runs\?head_sha=\$\{sha\}&event=push&branch=main&status=success/,
  );
  assert.match(promote, /git merge-base --is-ancestor origin\/production "\$RELEASE_SHA"/);
  assert.doesNotMatch(promote, /git push[^\n]*(--force|-f\b|\+)/);
  assert.doesNotMatch(promote, /environment:/);
  assert.match(promote, /gh workflow run deploy-preview\.yml --ref production/);
});
