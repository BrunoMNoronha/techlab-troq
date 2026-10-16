import type { WebhookConfig } from './config';
import { verifyNotification, type NotificationInput } from './signature';

// Diagnostico TEMPORARIO de assinatura no Preview (#203). Nao e um perfil
// alternativo de autenticacao (DEC-052): o raw continua sendo a unica
// autenticacao, e o resultado nunca autoriza processamento.
//
// Ate #203 o diagnostico valia para uma unica Order sintetica fixa. Isso nao
// alcanca as orders reais da homologacao: a primeira notificacao chega segundos
// depois da criacao, antes de qualquer configuracao por order ser publicada.
// Agora uma flag liga a coleta para qualquer Order que corresponda a uma
// tentativa do TROQS, com no maximo um evento por tentativa (signature-diagnostic.ts).
export const PREVIEW_DIAGNOSTIC_ENV = 'MERCADO_PAGO_WEBHOOK_SIGNATURE_DIAGNOSTIC';

interface DiagnosticEnvironment {
  [name: string]: string | undefined;
  APP_ENV?: string;
  VERCEL_ENV?: string;
  MERCADO_PAGO_WEBHOOK_SIGNATURE_DIAGNOSTIC?: string;
}

export interface SignatureDiagnostic {
  /** `data.id` exato da query: so serve para achar a tentativa; nunca e gravado. */
  orderId: string;
  rawMatch: boolean;
  lowerMatch: boolean;
  casesDiffer: boolean;
  // Componentes do manifesto (#203): com tres chaves diferentes recusadas nos
  // dois perfis de caixa, falta saber se o que entra no manifesto chega como o
  // provedor o assinou. So fatos de presenca/forma; nenhum valor e gravado.
  /** `x-request-id` chegou a funcao (sem ele o componente e omitido). */
  requestIdPresent: boolean;
  /** `data.id` do corpo e exatamente o da query. */
  bodyIdMatchesQuery: boolean;
  /** A query trouxe mais de um `data.id` (URL configurada com query propria). */
  dataIdRepeated: boolean;
  /** `ts` de `x-signature` com 13 digitos (milissegundos). */
  tsInMilliseconds: boolean;
}

function bodyDataId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const data = (body as Record<string, unknown>).data;
  if (typeof data !== 'object' || data === null) return null;
  const id = (data as Record<string, unknown>).id;
  return typeof id === 'string' ? id : null;
}

function signatureTs(header: string | null): string | null {
  for (const part of (header ?? '').split(',')) {
    const separator = part.indexOf('=');
    if (separator >= 0 && part.slice(0, separator).trim() === 'ts')
      return part.slice(separator + 1).trim();
  }
  return null;
}

/** Ligado so com a flag exatamente `1` e Preview nos dois indicadores de ambiente. */
export function isPreviewSignatureDiagnosticEnabled(
  env: DiagnosticEnvironment = process.env,
): boolean {
  return (
    env.APP_ENV === 'preview' &&
    env.VERCEL_ENV === 'preview' &&
    env.MERCADO_PAGO_WEBHOOK_SIGNATURE_DIAGNOSTIC === '1'
  );
}

/**
 * Compara somente uma recusa signature_invalid, depois das guardas existentes.
 * Reusa parsing/omissao e a MESMA config capturada pelo receptor. A copia da
 * query serve apenas ao diagnostico; nenhum resultado autoriza processamento.
 * Retorna apenas booleanos e o `data.id` da query, que o chamador usa para
 * localizar a tentativa: nunca MAC, manifesto, ts, assinatura ou corpo.
 */
export function diagnoseRejectedSignature(
  input: NotificationInput,
  config: WebhookConfig,
  env: DiagnosticEnvironment = process.env,
): SignatureDiagnostic | null {
  if (!isPreviewSignatureDiagnosticEnabled(env)) return null;
  const dataId = input.query.get('data.id');
  if (!dataId) return null;

  const raw = verifyNotification(input, config);
  if (raw.valid || raw.reason !== 'signature_invalid') return null;

  const lowerId = dataId.toLowerCase();
  const query = new URLSearchParams(input.query);
  query.set('data.id', lowerId);
  const lower = verifyNotification({ ...input, query }, config);
  return {
    orderId: dataId,
    rawMatch: raw.valid,
    lowerMatch: lower.valid,
    casesDiffer: dataId !== lowerId,
    requestIdPresent: Boolean(input.headers.get('x-request-id')),
    bodyIdMatchesQuery: bodyDataId(input.body) === dataId,
    dataIdRepeated: input.query.getAll('data.id').length > 1,
    tsInMilliseconds: /^\d{13}$/.test(signatureTs(input.headers.get('x-signature')) ?? ''),
  };
}
