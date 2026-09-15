// Modulo transversal `audit` (docs/architecture/overview.md, AR-3.3).
//
// Responsabilidade: Trilha imutavel de eventos criticos.
//
// Transversal, e nao modulo de dominio: nao possui regra de negocio propria
// nem entidade de dominio sob sua guarda (docs/architecture/overview.md, secao 9).
//
// Este arquivo e a API PUBLICA do modulo: o que nao for exportado aqui nao e
// importado de fora (docs/engineering/conventions.md, secao 2.2). Consumidores
// externos importam `@/modules/audit`; nunca um caminho interno do modulo.
//
// F1-005 materializa apenas a fronteira: nao ha implementacao, e nenhuma
// abstracao e antecipada aqui. O `export {}` mantem o arquivo como modulo
// TypeScript sob `isolatedModules`, sem comportamento.
export {};
