// Modulo de dominio `negotiation` (docs/architecture/overview.md, AR-3.3).
//
// Responsabilidade: Escolha, reselecao, negociacao e encerramento.
// Entidades proprias (docs/architecture/data-model.md): `Selection`, `Negotiation`.
//
// Este arquivo e a API PUBLICA do modulo: o que nao for exportado aqui nao e
// importado de fora (docs/engineering/conventions.md, secao 2.2). Consumidores
// externos importam `@/modules/negotiation`; nunca um caminho interno do modulo.
//
// F1-005 materializa apenas a fronteira: nao ha implementacao, e nenhuma
// entidade, servico, repositorio ou caso de uso e antecipado aqui. O `export {}`
// mantem o arquivo como modulo TypeScript sob `isolatedModules`, sem comportamento.
export {};
