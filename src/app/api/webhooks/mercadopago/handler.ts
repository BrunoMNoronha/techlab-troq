import {
  createMercadoPagoClient,
  markNotificationProcessed,
  MercadoPagoConfigError,
  readWebhookConfig,
  recordPreviewSignatureDiagnostic,
  recordRejectedNotification,
  registerNotification,
  verifyNotification,
  type MercadoPagoClient,
  type NotificationRejection,
} from '@/modules/payments';
import { confirmPaymentFlow, type PaymentConfirmationOutcome } from '@/modules/request';

// Receptor de notificacao do Mercado Pago (F3-006, #96; payments-design.md,
// PD-6.1 a PD-6.5 e PD-6.10; PD-11.4). Composicao de `payments` (autenticidade,
// registro) com `request` (efeito sobre a vaga), por isso vive em `src/app`
// (AR-3.2), fora do arquivo de rota para ser exercitado com provedor simulado.
//
// Publico: sem sessao e sem `CRON_SECRET`; a UNICA autorizacao e a assinatura.
// Ordem fixa, parando no primeiro passo que falhar: identificar (topico e
// aplicacao) -> assinatura sobre o manifesto unico -> so entao processar.
//
// Respostas, sempre sem corpo (nada ecoa o que chegou):
// - 401: aplicacao divergente ou assinatura ausente, malformada ou invalida
//   (o spike F0-010 usou 401 para o negativo);
// - 400: corpo que nao identifica uma notificacao (JSON invalido, sem `type`);
// - 200: topico diferente de `order` — reconhecido e ignorado, para o provedor
//   nao reenviar algo que este receptor nunca processara;
// - 503: configuracao ausente — falha fechada, e o provedor reenvia depois;
// - 500: falha ao REGISTRAR a notificacao valida — o provedor reenvia;
// - 200: notificacao valida registrada, confirmada ou nao dentro do orcamento.
//   Responder 200 sem concluir e deliberado e seguro (PD-6.5): a reconciliacao
//   reconstroi o estado sem notificacao.

/** Corpo maximo aceito; a notificacao real tem poucas centenas de bytes. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Orcamento da confirmacao dentro da requisicao (PD-6.3, PD-6.4: o provedor
 * espera 200 em ate 22 s). Duas consultas com tempo limite proprio cabem nele
 * com folga; passado o orcamento, a resposta sai e a reconciliacao converge.
 */
export const CONFIRMATION_BUDGET_MS = 10_000;
const GATEWAY_TIMEOUT_MS = 4_000;

export interface WebhookDeps {
  /** Somente para teste: provedor simulado e orcamento curto. */
  gateway?: MercadoPagoClient;
  budgetMs?: number;
}

function empty(status: number): Response {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
}

function statusFor(reason: NotificationRejection, body: unknown): number {
  if (reason !== 'unsupported_topic') return 401;
  const type =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>).type : undefined;
  return typeof type === 'string' && type.length > 0 ? 200 : 400;
}

async function readBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function withinBudget(
  work: Promise<PaymentConfirmationOutcome>,
  budgetMs: number,
): Promise<PaymentConfirmationOutcome | 'deferred'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'deferred'>((resolve) => {
    timer = setTimeout(() => resolve('deferred'), budgetMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function handleMercadoPagoWebhook(
  request: Request,
  deps: WebhookDeps = {},
): Promise<Response> {
  let config;
  try {
    config = readWebhookConfig();
  } catch (err) {
    if (err instanceof MercadoPagoConfigError) {
      console.error('[webhook] configuracao do Mercado Pago ausente');
      return empty(503);
    }
    throw err;
  }

  const body = await readBody(request);
  const query = new URL(request.url).searchParams;
  const verification = verifyNotification({ query, headers: request.headers, body }, config);
  if (!verification.valid) {
    await recordRejectedNotification({
      reason: verification.reason,
      providerRequestId: request.headers.get('x-request-id'),
      providerDataId: query.get('data.id'),
    });
    if (verification.reason === 'signature_invalid') {
      await recordPreviewSignatureDiagnostic({ query, headers: request.headers, body }, config);
    }
    return empty(statusFor(verification.reason, body));
  }

  let registered;
  try {
    registered = await registerNotification({
      providerOrderId: verification.providerOrderId,
      providerRequestId: verification.providerRequestId,
    });
  } catch (err) {
    console.error('[webhook] falha ao registrar a notificacao', {
      error: err instanceof Error ? err.name : 'unknown',
    });
    return empty(500);
  }
  if (!registered.attemptId) {
    await markNotificationProcessed(registered.notificationId, 'unknown_order');
    return empty(200);
  }

  const gateway = deps.gateway ?? createMercadoPagoClient({ timeoutMs: GATEWAY_TIMEOUT_MS });
  const work = confirmPaymentFlow(registered.attemptId, {
    origin: 'notificacao',
    deps: { gateway },
  }).catch((err: unknown) => {
    console.error('[webhook] falha na confirmacao', {
      error: err instanceof Error ? err.name : 'unknown',
    });
    return 'unavailable' as const;
  });
  const outcome = await withinBudget(work, deps.budgetMs ?? CONFIRMATION_BUDGET_MS);
  await markNotificationProcessed(registered.notificationId, outcome);
  return empty(200);
}
