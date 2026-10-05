import * as Sentry from '@sentry/nextjs';

// Sinais operacionais (F3-013, #103; docs/architecture/overview.md, AR-14.3 e
// AR-14.4; docs/adr/0007-observability-sentry.md, decisoes 3 a 6).
//
// Arquivo INTERNO do modulo transversal `platform`. O contrato publico esta em
// `src/modules/platform/index.ts`.
//
// Um sinal e DERIVADO do estado persistido e enviado como telemetria; nunca e
// estado de negocio, nunca e auditoria e nada o le de volta (decisoes 4 e 8).
//
// A fronteira de privacidade e estrutural, nao so de disciplina: o nome do
// sinal e fechado (`OperationalSignal`) e os atributos so aceitam numero,
// booleano ou um codigo fechado curto. Nao ha campo para texto livre, id de
// pessoa, email, telefone, payload ou mensagem de erro. Por cima disso, o
// `beforeSendLog`/`beforeSend` de ./sentry-options.ts continua saneando tudo.

/** Catalogo fechado dos sinais. Acrescentar um nome e decisao de design, nao de chamada. */
export type OperationalSignal =
  | 'payments.refund_pending'
  | 'payments.inconsistent_open'
  | 'payments.attempt_stale'
  | 'payments.notification_rejected'
  | 'jobs.run'
  | 'jobs.failure'
  | 'email.delivery_failed';

/** Codigo fechado: minusculas, digitos, `_`, `-`, `.` e `:`, ate 64 caracteres. */
const CODE_PATTERN = /^[a-z0-9_.:-]{1,64}$/;

export type SignalAttributes = Readonly<Record<string, number | boolean | string>>;

export interface SignalOptions {
  /**
   * `true` vira tambem um evento de issue no Sentry, agrupado por sinal
   * (fingerprint estavel), para alerta. Sem isso, e so log estruturado.
   */
  alert?: boolean;
  level?: 'info' | 'warning' | 'error';
}

/**
 * Mantem so atributos seguros: numero finito, booleano ou codigo fechado. Um
 * valor fora disso vira `invalid`, sem eco do conteudo.
 */
export function sanitizeSignalAttributes(
  attributes: SignalAttributes,
): Record<string, number | boolean | string> {
  const safe: Record<string, number | boolean | string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (!CODE_PATTERN.test(key)) continue;
    if (typeof value === 'boolean') safe[key] = value;
    else if (typeof value === 'number') safe[key] = Number.isFinite(value) ? value : 'invalid';
    else safe[key] = CODE_PATTERN.test(value) ? value : 'invalid';
  }
  return safe;
}

/**
 * Emite um sinal operacional. Nunca lanca: telemetria indisponivel degrada o
 * diagnostico, nunca a operacao (ADR-0007, decisao 13). Sem DSN, a SDK nao
 * envia nada.
 */
export function reportSignal(
  name: OperationalSignal,
  attributes: SignalAttributes = {},
  options: SignalOptions = {},
): void {
  const level = options.level ?? (options.alert ? 'warning' : 'info');
  const safe = { signal: name, ...sanitizeSignalAttributes(attributes) };
  try {
    const message = `signal:${name}`;
    if (level === 'error') Sentry.logger.error(message, safe);
    else if (level === 'warning') Sentry.logger.warn(message, safe);
    else Sentry.logger.info(message, safe);

    if (options.alert) {
      Sentry.captureMessage(message, {
        level,
        fingerprint: ['troq-signal', name],
        tags: { signal: name },
        extra: safe,
      });
    }
  } catch {
    // Telemetria nunca interrompe o fluxo que a emite.
  }
}
