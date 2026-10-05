import { processPendingImages } from '@/modules/media/processor';
import { cronUnauthorized, isCronAuthorized } from '../_lib/cron-auth';
import { runJob } from '../_lib/run-job';

// Recuperacao do processamento de imagens (media-pipeline-contract.md, secao
// 8.1; ADR-0006, decisao 9). Chamada pelo agendador com
// `Authorization: Bearer <CRON_SECRET>` (../_lib/cron-auth.ts); nenhuma sessao
// de usuario substitui o segredo. Falha fechada: sem segredo, nada executa.
//
// A cadencia contratual e de 5 minutos. O agendamento (vercel.json `crons`)
// NAO e declarado aqui: exige plano com cron de minutos (ADR-0006, decisao 11).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Para de reclamar imagem nova com menos de 120 s restantes (8.2). */
const CLAIM_BUDGET_MS = (maxDuration - 120) * 1000;

export async function GET(request: Request): Promise<Response> {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const summary = await runJob('media-process', () =>
    processPendingImages({ stopClaimingAt: Date.now() + CLAIM_BUDGET_MS }),
  );
  return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
