import { readFileSync } from 'node:fs';
import { requirePreviewProof, REPOSITORY } from './policy.mjs';

const response = await fetch(
  `https://api.github.com/repos/${REPOSITORY}/actions/runs/${process.env.SOURCE_RUN_ID}`,
  { headers: { Authorization: `Bearer ${process.env.GH_TOKEN}` } },
);
if (!response.ok) throw new Error('Não foi possível verificar a execução de Preview.');
const run = await response.json();
const proof = JSON.parse(readFileSync('release-proof/release.json', 'utf8'));
requirePreviewProof(proof, run);
if (proof.sha !== process.env.RELEASE_SHA) throw new Error('SHA diferente da revisão selecionada.');
console.log(`Evidência de Preview aprovada para ${proof.sha}.`);
