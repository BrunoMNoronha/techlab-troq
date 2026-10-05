import { runPaymentReversalSweep } from '@/modules/request';
import { cronUnauthorized, isCronAuthorized } from '../_lib/cron-auth';
import { runJob } from '../_lib/run-job';

// Varredura diaria de reversoes de pagamentos confirmados (F3-011, #101;
// payments-design.md, PD-3.4, PD-9.1, PD-9.2 e PD-10). Protegida por
// `Authorization: Bearer <CRON_SECRET>` (../_lib/cron-auth.ts): nenhuma sessao
// de usuario a aciona (CI-11, PD-8.9, PD-11.4). A resposta e um resumo de
// contagens: nenhum id de order, de tentativa, chave, segredo ou detalhe do
// provedor.
//
// A cadencia contratual e DIARIA. O agendamento (vercel.json `crons`) fica fora
// desta entrega (#101, "Fora do escopo": DP-3 e #56); a prova da Fase 3 e a
// invocacao autenticada (DEC-042; ADR-0006, decisao 11).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Para de reclamar lotes com menos de 120 s restantes (PD-10.6). */
const CLAIM_BUDGET_MS = (maxDuration - 120) * 1000;

export async function GET(request: Request): Promise<Response> {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const started = Date.now();
  const summary = await runJob('payments-reversals', () =>
    runPaymentReversalSweep({ stopClaimingAt: started + CLAIM_BUDGET_MS }),
  );
  console.info('[payments] varredura de reversoes executada', {
    ...summary,
    durationMs: Date.now() - started,
  });
  return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
