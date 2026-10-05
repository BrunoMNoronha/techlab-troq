import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  REPOSITORY,
  PROJECT_ID,
  PREVIEW_URL,
  RUNTIME_KEYS,
  requireSuccessfulRun,
  requirePreviewProof,
  requireDirectConnection,
  requireEnvironmentMetadata,
} from './policy.mjs';

const sha = 'a'.repeat(40);
function run(overrides = {}) {
  return {
    id: 123,
    run_attempt: 1,
    repository: { full_name: REPOSITORY },
    head_repository: { full_name: REPOSITORY },
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    head_sha: sha,
    path: '.github/workflows/deploy-preview.yml',
    event: 'workflow_run',
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
  for (const overrides of [
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
  assert.throws(() => requireSuccessfulRun(run({ event: 'pull_request' }), { event: 'push' }));
  assert.throws(() => requireSuccessfulRun(run(), { sha: 'b'.repeat(40) }));
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
  const publicValues = {
    APP_ENV: 'preview',
    BETTER_AUTH_URL: PREVIEW_URL,
    NEXT_PUBLIC_APP_URL: PREVIEW_URL,
  };
  const envs = RUNTIME_KEYS.map((key) => ({
    key,
    target: ['preview'],
    type: key in publicValues ? 'plain' : 'sensitive',
    value: publicValues[key],
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
          gitBranch: 'preview',
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
      [...envs, { key: 'GOOGLE_CLIENT_ID', target: ['preview'], type: 'plain', value: 'example' }],
      'preview',
    ),
  );
});
test('Production permanece manual e sem acionamento por push', () => {
  const production = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
  assert.match(production, /workflow_dispatch:/);
  assert.doesNotMatch(production, /^\s+(push|workflow_run|pull_request):/m);
  assert.match(production, /verify-proof\.mjs/);
  assert.ok(production.indexOf('vercel.mjs preflight') < production.indexOf('backup.sh'));
  assert.ok(production.indexOf('backup.sh') < production.indexOf('prisma migrate deploy'));
  assert.ok(production.indexOf('prisma migrate deploy') < production.indexOf('vercel.mjs deploy'));
  const preview = readFileSync('.github/workflows/deploy-preview.yml', 'utf8');
  assert.match(preview, /workflow_run:/);
  assert.match(preview, /git ls-remote --exit-code --heads origin refs\/heads\/preview/);
  assert.match(preview, /if \[ "\$status" -ne 2 \]; then exit "\$status"; fi/);
  assert.match(preview, /git merge-base --is-ancestor origin\/preview "\$RELEASE_SHA"/);
  assert.doesNotMatch(preview, /git fetch origin main preview/);
  assert.doesNotMatch(preview, /git push[^\n]*(--force|-f\b)/);
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
