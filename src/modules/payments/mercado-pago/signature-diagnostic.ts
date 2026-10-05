import type { WebhookConfig } from './config';
import { verifyNotification, type NotificationInput } from './signature';

// Diagnostico TEMPORARIO, explicitamente autorizado para esta unica Order
// sintetica. Nao e um perfil alternativo de autenticacao (DEC-052).
export const PREVIEW_DIAGNOSTIC_ORDER_ID = 'ORDTST01M470XYBP4A7H1CNTX4Y3D4F0';
export const PREVIEW_DIAGNOSTIC_ENV = 'MERCADO_PAGO_WEBHOOK_DIAGNOSTIC_ORDER_ID';

interface DiagnosticEnvironment {
  [name: string]: string | undefined;
  APP_ENV?: string;
  VERCEL_ENV?: string;
  MERCADO_PAGO_WEBHOOK_DIAGNOSTIC_ORDER_ID?: string;
}

export interface SignatureDiagnostic {
  rawMatch: boolean;
  lowerMatch: boolean;
  casesDiffer: boolean;
}

/** Ausencia, valor divergente ou qualquer ambiente fora de Preview desligam. */
export function readPreviewDiagnosticOrderId(
  env: DiagnosticEnvironment = process.env,
): typeof PREVIEW_DIAGNOSTIC_ORDER_ID | null {
  return env.APP_ENV === 'preview' &&
    env.VERCEL_ENV === 'preview' &&
    env.MERCADO_PAGO_WEBHOOK_DIAGNOSTIC_ORDER_ID === PREVIEW_DIAGNOSTIC_ORDER_ID
    ? PREVIEW_DIAGNOSTIC_ORDER_ID
    : null;
}

/**
 * Compara somente uma recusa signature_invalid, depois das guardas existentes.
 * Reusa parsing/omissao e a MESMA config capturada pelo receptor. A copia da
 * query serve apenas ao diagnostico; nenhum resultado autoriza processamento.
 * Retorna apenas booleanos: nunca MAC, manifesto, ts, assinatura ou corpo.
 */
export function diagnoseRejectedSignature(
  input: NotificationInput,
  config: WebhookConfig,
  env: DiagnosticEnvironment = process.env,
): SignatureDiagnostic | null {
  const orderId = readPreviewDiagnosticOrderId(env);
  const dataId = input.query.get('data.id');
  if (orderId === null || dataId !== orderId) return null;

  const raw = verifyNotification(input, config);
  if (raw.valid || raw.reason !== 'signature_invalid') return null;

  const lowerId = dataId.toLowerCase();
  const query = new URLSearchParams(input.query);
  query.set('data.id', lowerId);
  const lower = verifyNotification({ ...input, query }, config);
  return { rawMatch: raw.valid, lowerMatch: lower.valid, casesDiffer: dataId !== lowerId };
}
