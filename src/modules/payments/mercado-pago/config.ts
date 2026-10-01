// Configuracao do Mercado Pago (environments.md, secao 5.6; ADR-0004, decisao 6).
// Lida a CADA operacao e com FALHA FECHADA: sem a variavel, nao ha chamada nem
// validacao. A mensagem nomeia a variavel e nunca o valor (PD-11.1).
//
// - `MERCADO_PAGO_ACCESS_TOKEN` (segredo): cria, consulta, cancela e reembolsa.
// - `MERCADO_PAGO_WEBHOOK_SECRET` (segredo): HMAC da notificacao.
// - `MERCADO_PAGO_APPLICATION_ID` (configuracao, nao segredo): a aplicacao cuja
//   notificacao este ambiente aceita, conferida ANTES do HMAC (PD-6.10).

export const MERCADO_PAGO_ENV = {
  accessToken: 'MERCADO_PAGO_ACCESS_TOKEN',
  webhookSecret: 'MERCADO_PAGO_WEBHOOK_SECRET',
  applicationId: 'MERCADO_PAGO_APPLICATION_ID',
} as const;

export class MercadoPagoConfigError extends Error {
  constructor(missing: string[]) {
    super(`Configuracao do Mercado Pago ausente: ${missing.join(', ')}`);
    this.name = 'MercadoPagoConfigError';
  }
}

function read(names: readonly string[]): string[] {
  const missing: string[] = [];
  const values = names.map((name) => {
    const value = process.env[name]?.trim();
    if (!value) missing.push(name);
    return value ?? '';
  });
  if (missing.length > 0) throw new MercadoPagoConfigError(missing);
  return values;
}

export function readAccessToken(): string {
  return read([MERCADO_PAGO_ENV.accessToken])[0];
}

export interface WebhookConfig {
  secret: string;
  applicationId: string;
}

export function readWebhookConfig(): WebhookConfig {
  const [secret, applicationId] = read([
    MERCADO_PAGO_ENV.webhookSecret,
    MERCADO_PAGO_ENV.applicationId,
  ]);
  return { secret, applicationId };
}
