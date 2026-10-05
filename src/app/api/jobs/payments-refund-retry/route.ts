import { runRefundRetry } from '@/modules/payments';
import { cronUnauthorized, isCronAuthorized } from '../_lib/cron-auth';
import { runJob } from '../_lib/run-job';

// Retentativa de reembolso tecnico (F3-008, #98; payments-design.md, PD-3.4,
// PD-3.5, PD-8.5). Protegida por `Authorization: Bearer <CRON_SECRET>`
// (../_lib/cron-auth.ts): nenhuma sessao de usuario a aciona (CI-11, PD-8.9,
// PD-11.4). A resposta e um resumo de contagens: nenhum id de order, chave de
// idempotencia, segredo ou detalhe do provedor.
//
// A cadencia contratual e HORARIA, com recuo exponencial por caso persistido.
// O agendamento (vercel.json `crons`) NAO e declarado (DEC-042; ADR-0006,
// decisao 11).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Para de reclamar lotes com menos de 120 s restantes (PD-10.6). */
const CLAIM_BUDGET_MS = (maxDuration - 120) * 1000;

export async function GET(request: Request): Promise<Response> {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const started = Date.now();
  const summary = await runJob('payments-refund-retry', () =>
    runRefundRetry({ stopClaimingAt: started + CLAIM_BUDGET_MS }),
  );
  console.info('[payments] retentativa de reembolso executada', {
    ...summary,
    durationMs: Date.now() - started,
  });
  return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
