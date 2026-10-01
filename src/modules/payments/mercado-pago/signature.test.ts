// @vitest-environment node
import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildManifest, verifyNotification, type NotificationInput } from './signature';

// Autenticidade da notificacao (PD-6.1, PD-6.10; ADR-0004, decisoes 8 e 9).
// Prova unitaria do validador; T-13 e T-14 na rota real sao de F3-006 (#96).
// Segredo SINTETICO gerado por execucao: nunca uma chave do Mercado Pago.

const SECRET = randomBytes(32).toString('hex');
const APP = '4982497380871264';
const DATA_ID = 'ORD01M28P44G5FG8RJPM579EH56FV';
const REQUEST_ID = 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e';
const TS = '1742505638683';

function hmac(manifest: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

/** Manifesto oficial escrito a mao, sem passar por `buildManifest`. */
const OFFICIAL = `id:${DATA_ID.toLowerCase()};request-id:${REQUEST_ID};ts:${TS};`;

function input(overrides: {
  dataId?: string | null;
  requestId?: string | null;
  signature?: string | null;
  body?: unknown;
}): NotificationInput {
  const query = new URLSearchParams({ type: 'order' });
  const dataId = overrides.dataId === undefined ? DATA_ID : overrides.dataId;
  if (dataId !== null) query.set('data.id', dataId);
  const headers = new Headers();
  const requestId = overrides.requestId === undefined ? REQUEST_ID : overrides.requestId;
  if (requestId !== null) headers.set('x-request-id', requestId);
  const signature =
    overrides.signature === undefined ? `ts=${TS},v1=${hmac(OFFICIAL)}` : overrides.signature;
  if (signature !== null) headers.set('x-signature', signature);
  return {
    query,
    headers,
    body:
      'body' in overrides
        ? overrides.body
        : { type: 'order', action: 'order.processed', application_id: APP, data: { id: DATA_ID } },
  };
}

const config = { secret: SECRET, applicationId: APP };

describe('buildManifest', () => {
  it('reproduz o manifesto oficial, com data.id em minusculas', () => {
    expect(buildManifest({ dataId: DATA_ID, requestId: REQUEST_ID, ts: TS })).toBe(OFFICIAL);
  });

  it('omite os componentes ausentes, sem inventar substituto', () => {
    expect(buildManifest({ dataId: null, requestId: REQUEST_ID, ts: TS })).toBe(
      `request-id:${REQUEST_ID};ts:${TS};`,
    );
    expect(buildManifest({ dataId: DATA_ID, requestId: null, ts: TS })).toBe(
      `id:${DATA_ID.toLowerCase()};ts:${TS};`,
    );
  });
});

describe('verifyNotification', () => {
  it('aceita a assinatura do manifesto oficial e correlaciona pelo data.id como veio', () => {
    expect(verifyNotification(input({}), config)).toEqual({
      valid: true,
      providerOrderId: DATA_ID,
      providerRequestId: REQUEST_ID,
    });
  });

  it('aplicacao numerica no corpo e equivalente a string', () => {
    const body = { type: 'order', application_id: Number(APP), data: { id: DATA_ID } };
    expect(verifyNotification(input({ body }), config).valid).toBe(true);
  });

  it('aplicacao divergente e recusada ANTES do HMAC, mesmo com assinatura valida', () => {
    const body = { type: 'order', application_id: '1495841611175733', data: { id: DATA_ID } };
    expect(verifyNotification(input({ body }), config)).toEqual({
      valid: false,
      reason: 'application_mismatch',
    });
  });

  it.each([
    [{ type: 'payment', application_id: APP }],
    [{ application_id: APP }],
    [null],
    ['texto'],
  ])('topico que nao e order e recusado: %j', (body) => {
    expect(verifyNotification(input({ body }), config)).toEqual({
      valid: false,
      reason: 'unsupported_topic',
    });
  });

  it('sem x-signature: signature_missing', () => {
    expect(verifyNotification(input({ signature: null }), config)).toEqual({
      valid: false,
      reason: 'signature_missing',
    });
  });

  it.each([
    'v1=abc',
    `ts=${TS}`,
    `ts=agora,v1=${hmac(OFFICIAL)}`,
    `ts=${TS},v1=nao-e-hex`,
    `ts=${TS},v1=${hmac(OFFICIAL).slice(0, 63)}`,
  ])('x-signature malformado e recusado: %s', (signature) => {
    expect(verifyNotification(input({ signature }), config)).toEqual({
      valid: false,
      reason: 'signature_malformed',
    });
  });

  it('assinatura com outro segredo: signature_invalid', () => {
    const signature = `ts=${TS},v1=${hmac(OFFICIAL, 'outro-segredo')}`;
    expect(verifyNotification(input({ signature }), config)).toEqual({
      valid: false,
      reason: 'signature_invalid',
    });
  });

  it.each([
    ['data.id', { dataId: 'ORD01OUTRAORDEM00000000000' }],
    ['x-request-id', { requestId: 'aaaaaaaa-0000-4000-8000-000000000000' }],
    ['ts', { signature: `ts=${Number(TS) + 1},v1=${hmac(OFFICIAL)}` }],
    ['v1', { signature: `ts=${TS},v1=${'0'.repeat(64)}` }],
  ])('cada campo do manifesto adulterado (%s) e recusado', (_field, overrides) => {
    expect(verifyNotification(input(overrides), config)).toEqual({
      valid: false,
      reason: 'signature_invalid',
    });
  });

  it('manifesto remontado a partir do CORPO e recusado (achado C do F0-010)', () => {
    // O emissor assina com o data.id do corpo; a query traz outro. O validador
    // so le a query, entao a assinatura nao confere e nao ha segunda tentativa.
    const bodyId = 'ORD01CORPODIFERENTE000000000';
    const signedFromBody = `id:${bodyId.toLowerCase()};request-id:${REQUEST_ID};ts:${TS};`;
    const body = { type: 'order', application_id: APP, data: { id: bodyId } };
    expect(
      verifyNotification(input({ body, signature: `ts=${TS},v1=${hmac(signedFromBody)}` }), config),
    ).toEqual({ valid: false, reason: 'signature_invalid' });
  });

  it('sem data.id na query nao usa o do corpo como substituto', () => {
    const signedFromBody = `id:${DATA_ID.toLowerCase()};request-id:${REQUEST_ID};ts:${TS};`;
    expect(
      verifyNotification(
        input({ dataId: null, signature: `ts=${TS},v1=${hmac(signedFromBody)}` }),
        config,
      ),
    ).toEqual({ valid: false, reason: 'signature_invalid' });
  });

  it('nenhum veredito ecoa a assinatura, o ts ou o segredo', () => {
    const results = [
      verifyNotification(input({}), config),
      verifyNotification(input({ signature: `ts=${TS},v1=${'0'.repeat(64)}` }), config),
    ];
    const text = JSON.stringify(results);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(hmac(OFFICIAL));
    expect(text).not.toContain(TS);
  });
});
