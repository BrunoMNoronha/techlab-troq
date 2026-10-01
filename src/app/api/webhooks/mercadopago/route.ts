import { handleMercadoPagoWebhook } from './handler';

// Notificacoes do Mercado Pago (F3-006, #96). A regra inteira — autenticidade,
// registro, confirmacao e orcamento de tempo — esta em ./handler.ts.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  return handleMercadoPagoWebhook(request);
}
