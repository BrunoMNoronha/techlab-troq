// Modulo de dominio `payments` (docs/architecture/overview.md, AR-3.3).
//
// Responsabilidade: Tentativa, cobranca, confirmacao, reembolso, reconciliacao.
// Entidades proprias (docs/architecture/data-model.md): `PaymentAttempt`, `Payment`, `TechnicalRefund`, `PaymentNotification`, `ReconciliationCase`.
//
// Dono do dinheiro e distinto de `request` (AR-3.5): informa fatos de pagamento
// e nunca cria, devolve nem reabre vaga por conta propria.
//
// Este arquivo e a API PUBLICA do modulo: o que nao for exportado aqui nao e
// importado de fora (docs/engineering/conventions.md, secao 2.2). Consumidores
// externos importam `@/modules/payments`; nunca um caminho interno do modulo.
//
// F1-005 materializa apenas a fronteira: nao ha implementacao, e nenhuma
// entidade, servico, repositorio ou caso de uso e antecipado aqui. O `export {}`
// mantem o arquivo como modulo TypeScript sob `isolatedModules`, sem comportamento.
export {};
