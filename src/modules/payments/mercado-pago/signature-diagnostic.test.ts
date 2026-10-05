// @vitest-environment node
import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyNotification, type NotificationInput } from './signature';
import {
  diagnoseRejectedSignature,
  PREVIEW_DIAGNOSTIC_ORDER_ID as ORDER,
  readPreviewDiagnosticOrderId,
} from './signature-diagnostic';

const config = { secret: randomBytes(32).toString('hex'), applicationId: '9900000000000001' };
const env = {
  APP_ENV: 'preview',
  VERCEL_ENV: 'preview',
  MERCADO_PAGO_WEBHOOK_DIAGNOSTIC_ORDER_ID: ORDER,
};
const REQUEST_ID = 'diagnostic-synthetic-request';
const TS = '1742505638683';

function input(profile: 'raw' | 'lower' | 'other' = 'lower'): NotificationInput {
  const id = profile === 'raw' ? ORDER : ORDER.toLowerCase();
  const secret = profile === 'other' ? 'different-synthetic-key' : config.secret;
  const mac = createHmac('sha256', secret)
    .update(`id:${id};request-id:${REQUEST_ID};ts:${TS};`)
    .digest('hex');
  return {
    query: new URLSearchParams({ 'data.id': ORDER }),
    headers: new Headers({ 'x-request-id': REQUEST_ID, 'x-signature': `ts=${TS},v1=${mac}` }),
    body: { type: 'order', application_id: config.applicationId, data: { id: ORDER } },
  };
}

describe('diagnostico temporario, sem perfil alternativo de autenticacao', () => {
  it.each([
    {},
    { ...env, MERCADO_PAGO_WEBHOOK_DIAGNOSTIC_ORDER_ID: undefined },
    { ...env, MERCADO_PAGO_WEBHOOK_DIAGNOSTIC_ORDER_ID: '0' },
    { ...env, MERCADO_PAGO_WEBHOOK_DIAGNOSTIC_ORDER_ID: 'ORDTST-OUTRA' },
    { ...env, MERCADO_PAGO_WEBHOOK_DIAGNOSTIC_ORDER_ID: ` ${ORDER}` },
    { ...env, APP_ENV: 'development' },
    { ...env, APP_ENV: 'production' },
    { ...env, VERCEL_ENV: 'production' },
    { ...env, VERCEL_ENV: undefined },
    { ...env, APP_ENV: 'unknown' },
  ])('configuracao ausente/incoerente desliga sem alterar autenticacao (%j)', (disabled) => {
    expect(readPreviewDiagnosticOrderId(disabled)).toBeNull();
    expect(diagnoseRejectedSignature(input(), config, disabled)).toBeNull();
    expect(verifyNotification(input(), config)).toEqual({
      valid: false,
      reason: 'signature_invalid',
    });
  });

  it('compara a mesma chave, deixa raw rejeitado e nao modifica query, headers ou corpo', () => {
    const notification = input();
    const query = notification.query.toString();
    const signature = notification.headers.get('x-signature');
    const body = JSON.stringify(notification.body);
    expect(diagnoseRejectedSignature(notification, config, env)).toEqual({
      rawMatch: false,
      lowerMatch: true,
      casesDiffer: true,
    });
    expect(notification.query.toString()).toBe(query);
    expect(notification.headers.get('x-signature')).toBe(signature);
    expect(JSON.stringify(notification.body)).toBe(body);
    expect(verifyNotification(notification, config)).toEqual({
      valid: false,
      reason: 'signature_invalid',
    });
  });

  it('outra chave nao confere em nenhum dos perfis; resultado tem somente tres booleanos', () => {
    expect(diagnoseRejectedSignature(input('other'), config, env)).toEqual({
      rawMatch: false,
      lowerMatch: false,
      casesDiffer: true,
    });
  });

  it('assinatura raw valida segue autenticacao normal e nao e diagnosticada', () => {
    expect(diagnoseRejectedSignature(input('raw'), config, env)).toBeNull();
    expect(verifyNotification(input('raw'), config).valid).toBe(true);
  });

  it.each([null, ORDER.toLowerCase(), `${ORDER}X`, 'ORDTST-OUTRA'])(
    'somente query exata, nunca body (%s)',
    (id) => {
      const notification = input();
      if (id === null) notification.query.delete('data.id');
      else notification.query.set('data.id', id);
      expect(diagnoseRejectedSignature(notification, config, env)).toBeNull();
    },
  );

  it.each(['wrong_application', 'wrong_topic', 'missing_signature', 'malformed_signature'])(
    'nao ultrapassa guarda %s',
    (guard) => {
      const notification = input();
      if (guard === 'wrong_application') notification.body = { type: 'order', application_id: '1' };
      if (guard === 'wrong_topic')
        notification.body = { type: 'payment', application_id: config.applicationId };
      if (guard === 'missing_signature') notification.headers.delete('x-signature');
      if (guard === 'malformed_signature')
        notification.headers.set('x-signature', 'ts=invalid,v1=invalid');
      expect(diagnoseRejectedSignature(notification, config, env)).toBeNull();
    },
  );
});
