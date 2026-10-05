import { reportPaymentSignals } from '@/modules/payments';
import { runPaymentReconciliation } from '@/modules/request';
import { cronUnauthorized, isCronAuthorized } from '../_lib/cron-auth';
import { runJob } from '../_lib/run-job';

// Reconciliacao periodica de tentativas de pagamento (F3-008, #98;
// payments-design.md, PD-3.4 e PD-10). Protegida por
// `Authorization: Bearer <CRON_SECRET>` (../_lib/cron-auth.ts): nenhuma sessao
// de usuario a aciona (CI-11, PD-8.9, PD-11.4). A resposta e um resumo de
// contagens: nenhum id de order, chave, segredo ou detalhe do provedor.
//
// A cadencia contratual e de 5 MINUTOS. O agendamento (vercel.json `crons`) NAO
// e declarado: no Hobby essa cadencia faria o deployment falhar, e o criterio
// de prova da Fase 3 e a invocacao autenticada (DEC-042; ADR-0006, decisao 11).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Para de reclamar lotes com menos de 120 s restantes (PD-10.6). */
const CLAIM_BUDGET_MS = (maxDuration - 120) * 1000;

export async function GET(request: Request): Promise<Response> {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const started = Date.now();
  const summary = await runJob('payments-reconcile', () =>
    runPaymentReconciliation({ stopClaimingAt: started + CLAIM_BUDGET_MS }),
  );
  // Sinais de AR-14.3 derivados do estado persistido (F3-013): reembolso
  // pendente por idade, `inconsistente` aberto, tentativa parada e rejeicoes.
  await reportPaymentSignals();
  console.info('[payments] reconciliacao executada', {
    ...summary,
    durationMs: Date.now() - started,
  });
  return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
