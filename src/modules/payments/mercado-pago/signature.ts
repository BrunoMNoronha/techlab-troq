import { createHmac, timingSafeEqual } from 'node:crypto';

// Autenticidade da notificacao de order (payments-design.md, PD-6.1 e PD-6.10;
// ADR-0004, decisoes 8 e 9; spike F0-010). Funcao PURA: recebe o que chegou e a
// configuracao do ambiente, e devolve o veredito com um motivo codificado.
//
// Ordem obrigatoria, parando no primeiro passo que falhar:
// 1. identificar: topico `order` e a APLICACAO configurada no ambiente — chaves
//    de webhook sao por aplicacao e nao sao intercambiaveis;
// 2. extrair `ts` e `v1` de `x-signature`;
// 3. montar o UNICO manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
//    com `data.id` lido da QUERY e em minusculas, omitindo componente ausente;
// 4. HMAC-SHA256 com a chave secreta e comparacao em tempo constante.
//
// Nunca ha fallback entre variantes, e o manifesto NUNCA e montado a partir do
// corpo (achado C do F0-010). O corpo so serve para identificar topico e
// aplicacao. Nenhum retorno ecoa assinatura, `ts` ou segredo.

export type NotificationRejection =
  | 'unsupported_topic'
  | 'application_mismatch'
  | 'signature_missing'
  | 'signature_malformed'
  | 'signature_invalid';

export type NotificationVerification =
  | { valid: true; providerOrderId: string | null; providerRequestId: string | null }
  | { valid: false; reason: NotificationRejection };

export interface NotificationInput {
  /** Query string da URL recebida (fonte UNICA de `data.id`). */
  query: URLSearchParams;
  headers: Headers;
  /** Corpo ja parseado; usado so para topico e aplicacao. */
  body: unknown;
}

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

function bodyField(body: unknown, field: string): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)[field];
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return null;
}

function parseSignature(header: string): { ts: string; v1: string } | null {
  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 'ts') ts = value;
    if (key === 'v1') v1 = value;
  }
  if (!ts || !v1 || !/^\d+$/.test(ts) || !HEX_SHA256.test(v1)) return null;
  return { ts, v1 };
}

/** O manifesto oficial, unico. Exposto para os testes de contrato. */
export function buildManifest(parts: {
  dataId: string | null;
  requestId: string | null;
  ts: string;
}): string {
  const id = parts.dataId ? `id:${parts.dataId.toLowerCase()};` : '';
  const requestId = parts.requestId ? `request-id:${parts.requestId};` : '';
  return `${id}${requestId}ts:${parts.ts};`;
}

export function verifyNotification(
  input: NotificationInput,
  config: { secret: string; applicationId: string },
): NotificationVerification {
  if (bodyField(input.body, 'type') !== 'order') {
    return { valid: false, reason: 'unsupported_topic' };
  }
  if (bodyField(input.body, 'application_id') !== config.applicationId) {
    return { valid: false, reason: 'application_mismatch' };
  }

  const header = input.headers.get('x-signature');
  if (!header) return { valid: false, reason: 'signature_missing' };
  const signature = parseSignature(header);
  if (!signature) return { valid: false, reason: 'signature_malformed' };

  const dataId = input.query.get('data.id');
  const requestId = input.headers.get('x-request-id');
  const manifest = buildManifest({ dataId, requestId, ts: signature.ts });
  const expected = createHmac('sha256', config.secret).update(manifest).digest();
  const received = Buffer.from(signature.v1, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { valid: false, reason: 'signature_invalid' };
  }
  // A minuscula e so do manifesto: a correlacao usa o identificador como veio,
  // no mesmo caixa que a criacao da order devolveu.
  return { valid: true, providerOrderId: dataId, providerRequestId: requestId };
}
