import { timingSafeEqual } from 'node:crypto';
import { processPendingImages } from '@/modules/media/processor';

// Recuperacao do processamento de imagens (media-pipeline-contract.md, secao
// 8.1; ADR-0006, decisao 9). Chamada pelo agendador com
// `Authorization: Bearer <CRON_SECRET>`; nenhuma sessao de usuario substitui o
// segredo. Falha fechada: sem segredo configurado, nada executa.
//
// A cadencia contratual e de 5 minutos. O agendamento (vercel.json `crons`)
// NAO e declarado aqui: exige plano com cron de minutos (ADR-0006, decisao 11).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Para de reclamar imagem nova com menos de 120 s restantes (8.2). */
const CLAIM_BUDGET_MS = (maxDuration - 120) * 1000;

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request.headers.get('authorization'))) {
    return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const summary = await processPendingImages({ stopClaimingAt: Date.now() + CLAIM_BUDGET_MS });
  return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } });
}
