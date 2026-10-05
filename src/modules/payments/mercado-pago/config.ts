// Configuracao do Mercado Pago (environments.md, secao 5.6; ADR-0004, decisao 6).
// Lida a CADA operacao e com FALHA FECHADA: sem a variavel, nao ha chamada nem
// validacao. A mensagem nomeia a variavel e nunca o valor (PD-11.1).
//
// - `MERCADO_PAGO_ACCESS_TOKEN` (segredo): cria, consulta, cancela e reembolsa.
// - `MERCADO_PAGO_WEBHOOK_SECRET` (segredo): HMAC da notificacao.
// - `MERCADO_PAGO_APPLICATION_ID` (configuracao, nao segredo): a aplicacao cuja
//   notificacao este ambiente aceita, conferida ANTES do HMAC (PD-6.10).
// - `MERCADO_PAGO_PIX_SANDBOX_AUTO_APPROVE`: homologacao explicita, desligada
//   por padrao; nunca autoriza producao nem substitui a consulta ao provedor.

export const MERCADO_PAGO_ENV = {
  accessToken: 'MERCADO_PAGO_ACCESS_TOKEN',
  webhookSecret: 'MERCADO_PAGO_WEBHOOK_SECRET',
  applicationId: 'MERCADO_PAGO_APPLICATION_ID',
  pixSandboxAutoApprove: 'MERCADO_PAGO_PIX_SANDBOX_AUTO_APPROVE',
} as const;

export class MercadoPagoConfigError extends Error {
  constructor(names: string[], reason: 'ausente' | 'invalida' = 'ausente') {
    super(`Configuracao do Mercado Pago ${reason}: ${names.join(', ')}`);
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

/** Leitura server-side por criacao: valores desconhecidos falham fechados. */
export function readPixSandboxAutoApprove(): boolean {
  const flag = process.env[MERCADO_PAGO_ENV.pixSandboxAutoApprove]?.trim();
  if (!flag || flag === '0') return false;
  if (flag !== '1') {
    throw new MercadoPagoConfigError([MERCADO_PAGO_ENV.pixSandboxAutoApprove], 'invalida');
  }
  const appEnv = process.env.APP_ENV?.trim();
  if (
    (appEnv !== 'development' && appEnv !== 'preview') ||
    process.env.VERCEL_ENV?.trim() === 'production'
  ) {
    throw new MercadoPagoConfigError(
      [MERCADO_PAGO_ENV.pixSandboxAutoApprove, 'APP_ENV', 'VERCEL_ENV'],
      'invalida',
    );
  }
  return true;
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
