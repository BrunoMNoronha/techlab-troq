// Modulo transversal `platform` (docs/architecture/overview.md, AR-3.3).
//
// Responsabilidade: Configuracao, relogio, identificadores, log estruturado.
//
// Transversal, e nao modulo de dominio: nao possui regra de negocio propria
// nem entidade de dominio sob sua guarda.
//
// Este arquivo e a API PUBLICA do modulo: o que nao for exportado aqui nao e
// importado de fora (docs/engineering/conventions.md, secao 2.2). Consumidores
// externos importam `@/modules/platform`; nunca um caminho interno do modulo.
//
// F1-005 materializou apenas a fronteira. F1-010 acrescentou a configuracao da
// telemetria — inclusive a redacao de dados proibidos na fronteira de saida,
// exigida por docs/adr/0007-observability-sentry.md, decisoes 5 e 6.
export type { TelemetryOptions } from './telemetry/sentry-options';
export { createTelemetryOptions } from './telemetry/sentry-options';
