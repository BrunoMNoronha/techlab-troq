// Opções compartilhadas de inicialização da SDK de observabilidade.
//
// Arquivo INTERNO do módulo transversal `platform`. O contrato público está em
// `src/modules/platform/index.ts`.
//
// Uma única implementação serve aos três runtimes — navegador, Node e Edge —
// para que a fronteira de privacidade seja a mesma nos três. Duplicar a
// configuração seria criar três lugares onde ela pode divergir.
//
// Normas materializadas aqui:
//   - docs/adr/0007-observability-sentry.md, decisões 5, 6, 7, 9, 11 e 12;
//   - docs/engineering/environments.md, seções 5.1, 5.8 e 6.5;
//   - docs/engineering/conventions.md, seções 3.3 e 6, item 6.

import type { Breadcrumb, BrowserOptions, ErrorEvent, Event, EventHint, Log } from '@sentry/nextjs';
import { REDACTED, isForbiddenKey, redactText, sanitizeRecord, sanitizeUrl } from './redaction';

// `SpanJSON` e `TransactionEvent` nao sao reexportados pelo pacote da SDK nesta
// versao. Derivamos ambos das proprias opcoes de `init`, em vez de declarar
// `@sentry/core` como dependencia direta so para alcancar um tipo: assim o
// contrato permanece o da versao instalada e nao pode divergir dela.
type SpanJSON = Parameters<NonNullable<BrowserOptions['beforeSendSpan']>>[0];
type TransactionEvent = Parameters<NonNullable<BrowserOptions['beforeSendTransaction']>>[0];

/**
 * Amostragem de tracing da Fase 1 em `development` e `preview`.
 *
 * 100% é baseline operacional, não regra definitiva: só existem ambientes não
 * produtivos instrumentados, o volume é o de quem desenvolve e revisa, e uma
 * amostragem parcial tornaria a prova de diagnóstico não determinística.
 * Ajustável por medição, sem ADR (ADR-0007, política de evolução).
 */
const TRACES_SAMPLE_RATE = 1;

/** Rótulo usado quando `APP_ENV` não está definida: honesto, nunca um palpite. */
const UNKNOWN_ENVIRONMENT = 'unknown';

/**
 * Categorias de breadcrumb descartadas inteiras.
 *
 * `ui.input` carrega texto digitado pela pessoa usuária — exatamente a
 * superfície que a decisão 5 proíbe e que nenhum diagnóstico desta fase exige.
 */
const DROPPED_BREADCRUMB_CATEGORIES: readonly string[] = ['ui.input'];

/**
 * O rótulo do ambiente é `APP_ENV`, e só ele (ADR-0007, decisão 11). Não existe
 * `SENTRY_ENVIRONMENT` nem `NEXT_PUBLIC_SENTRY_ENVIRONMENT`.
 */
function resolveEnvironment(): string {
  const appEnv = process.env.APP_ENV;
  return appEnv !== undefined && appEnv.length > 0 ? appEnv : UNKNOWN_ENVIRONMENT;
}

function sanitizeTags(tags: Event['tags']): Event['tags'] {
  if (tags === undefined) {
    return undefined;
  }
  const sanitized: NonNullable<Event['tags']> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (isForbiddenKey(key)) {
      sanitized[key] = REDACTED;
    } else {
      sanitized[key] = typeof value === 'string' ? redactText(value) : value;
    }
  }
  return sanitized;
}

function sanitizeContexts(contexts: Event['contexts']): Event['contexts'] {
  if (contexts === undefined) {
    return undefined;
  }
  const sanitized: NonNullable<Event['contexts']> = {};
  for (const [key, context] of Object.entries(contexts)) {
    if (isForbiddenKey(key)) {
      sanitized[key] = { value: REDACTED };
    } else if (context !== undefined) {
      sanitized[key] = sanitizeRecord({ ...context });
    }
  }
  return sanitized;
}

function sanitizeExceptions(exception: Event['exception']): Event['exception'] {
  if (exception?.values === undefined) {
    return exception;
  }
  return {
    ...exception,
    values: exception.values.map((value) => ({
      ...value,
      type: value.type === undefined ? undefined : redactText(value.type),
      value: value.value === undefined ? undefined : redactText(value.value),
    })),
  };
}

/**
 * Reduz os dados de requisição ao mínimo diagnóstico: método e URL sem query.
 *
 * Cabeçalhos, cookies, corpo e query string saem inteiros. São entrada externa
 * arbitrária, capazes de conter qualquer item da decisão 5, e nenhum deles é
 * necessário à operação do MVP.
 */
function sanitizeRequest(request: Event['request']): Event['request'] {
  if (request === undefined) {
    return undefined;
  }
  return {
    ...(request.method === undefined ? {} : { method: request.method }),
    ...(request.url === undefined ? {} : { url: sanitizeUrl(request.url) }),
  };
}

function sanitizeSpans(spans: Event['spans']): Event['spans'] {
  return spans?.map((span) => sanitizeSpan(span));
}

/** Sanea um span: descrição e atributos. Usado por `beforeSendSpan`. */
export function sanitizeSpan(span: SpanJSON): SpanJSON {
  return {
    ...span,
    description: span.description === undefined ? undefined : redactText(span.description),
    data: sanitizeRecord({ ...span.data }),
  };
}

/** Sanea um breadcrumb; `null` descarta a categoria inteira. */
export function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (
    breadcrumb.category !== undefined &&
    DROPPED_BREADCRUMB_CATEGORIES.includes(breadcrumb.category)
  ) {
    return null;
  }
  return {
    ...breadcrumb,
    message: breadcrumb.message === undefined ? undefined : redactText(breadcrumb.message),
    data: breadcrumb.data === undefined ? undefined : sanitizeRecord({ ...breadcrumb.data }),
  };
}

/** Sanea um log estruturado: corpo da mensagem e atributos. */
export function sanitizeLog(log: Log): Log {
  return {
    ...log,
    message: redactText(log.message),
    attributes: log.attributes === undefined ? undefined : sanitizeRecord({ ...log.attributes }),
  };
}

/**
 * Sanea um evento inteiro — de erro ou de transação — antes do envio.
 *
 * Remove `user` sempre: nenhuma correlação desta fase precisa de identidade, e
 * telefone/WhatsApp jamais é chave de correlação, nem derivado (decisão 6).
 * Anexos são descartados pelo `hint`: nada nesta fase os produz, e o que não é
 * produzido deliberadamente não deve poder sair.
 */
export function sanitizeEvent<T extends Event>(event: T, hint?: EventHint): T {
  if (hint !== undefined) {
    hint.attachments = [];
  }
  const sanitized: T = {
    ...event,
    message: event.message === undefined ? undefined : redactText(event.message),
    transaction: event.transaction === undefined ? undefined : redactText(event.transaction),
    exception: sanitizeExceptions(event.exception),
    request: sanitizeRequest(event.request),
    tags: sanitizeTags(event.tags),
    extra: event.extra === undefined ? undefined : sanitizeRecord({ ...event.extra }),
    contexts: sanitizeContexts(event.contexts),
    breadcrumbs: event.breadcrumbs
      ?.map((breadcrumb) => sanitizeBreadcrumb(breadcrumb))
      .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null),
    spans: sanitizeSpans(event.spans),
  };
  delete sanitized.user;
  return sanitized;
}

/** Opções de telemetria comuns aos três runtimes da aplicação. */
export interface TelemetryOptions {
  readonly dsn: string | undefined;
  readonly environment: string;
  readonly tracesSampleRate: number;
  readonly enableLogs: true;
  readonly beforeSend: (event: ErrorEvent, hint: EventHint) => ErrorEvent | null;
  readonly beforeSendTransaction: (
    event: TransactionEvent,
    hint: EventHint,
  ) => TransactionEvent | null;
  readonly beforeSendSpan: (span: SpanJSON) => SpanJSON;
  readonly beforeBreadcrumb: (breadcrumb: Breadcrumb) => Breadcrumb | null;
  readonly beforeSendLog: (log: Log) => Log | null;
}

/**
 * Monta as opções de `Sentry.init` usadas por cliente, servidor e Edge.
 *
 * A DSN vem exclusivamente de `NEXT_PUBLIC_SENTRY_DSN`, referenciada de forma
 * explícita nos dois lados (ADR-0007, decisão 12). Sem DSN a SDK não envia
 * nada, e nada quebra: desenvolvimento, testes, lint, typecheck e build seguem.
 *
 * O que NÃO está aqui é tão normativo quanto o que está: `sendDefaultPii` — e a
 * sua sucessora `dataCollection` — fica no padrão do provedor, que é não
 * coletar; e nenhuma integração de Session Replay é registrada (decisões 7 e 9).
 */
export function createTelemetryOptions(): TelemetryOptions {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: resolveEnvironment(),
    tracesSampleRate: TRACES_SAMPLE_RATE,
    enableLogs: true,
    beforeSend: (event, hint) => sanitizeEvent(event, hint),
    beforeSendTransaction: (event, hint) => sanitizeEvent(event, hint),
    beforeSendSpan: (span) => sanitizeSpan(span),
    beforeBreadcrumb: (breadcrumb) => sanitizeBreadcrumb(breadcrumb),
    beforeSendLog: (log) => sanitizeLog(log),
  };
}
