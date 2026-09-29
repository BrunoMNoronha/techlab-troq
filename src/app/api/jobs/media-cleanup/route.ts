import { runMediaCleanup } from '@/modules/media/cleanup';
import { cronUnauthorized, isCronAuthorized } from '../_lib/cron-auth';

// Limpeza de midia (media-pipeline-contract.md, secoes 11 e 13): reservas
// abandonadas, teto de 20 h e fila de exclusao de objetos. Protegida por
// `Authorization: Bearer <CRON_SECRET>` (../_lib/cron-auth.ts). A resposta e um
// resumo de contagens: nenhuma chave de objeto, segredo ou detalhe interno.
//
// A cadencia contratual e HORARIA. O agendamento (vercel.json `crons`) NAO e
// declarado aqui: exige plano com cron de minutos (ADR-0006, decisao 11).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Para de reclamar trabalho novo com menos de 120 s restantes. */
const CLAIM_BUDGET_MS = (maxDuration - 120) * 1000;

export async function GET(request: Request): Promise<Response> {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const started = Date.now();
  const summary = await runMediaCleanup({ stopClaimingAt: started + CLAIM_BUDGET_MS });
  console.info('[media] limpeza executada', { ...summary, durationMs: Date.now() - started });
  return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
