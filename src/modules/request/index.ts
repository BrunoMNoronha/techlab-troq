// Modulo de dominio `request` (docs/architecture/overview.md, AR-3.3).
//
// Responsabilidade: Solicitacao de desbloqueio e reserva de vaga (RB-003).
// Entidades proprias (docs/architecture/data-model.md): `ContactRequest`.
//
// Dono da vaga de RB-003 e distinto de `payments` (AR-3.5): a vaga e reservada
// antes da cobranca, e este modulo decide o efeito de um fato de pagamento
// sobre a vaga.
//
// Este arquivo e a API PUBLICA do modulo: o que nao for exportado aqui nao e
// importado de fora (docs/engineering/conventions.md, secao 2.2). Consumidores
// externos importam `@/modules/request`; nunca um caminho interno do modulo.
//
// F1-005 materializa apenas a fronteira: nao ha implementacao, e nenhuma
// entidade, servico, repositorio ou caso de uso e antecipado aqui. O `export {}`
// mantem o arquivo como modulo TypeScript sob `isolatedModules`, sem comportamento.
export {};
