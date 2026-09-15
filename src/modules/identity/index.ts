// Modulo de dominio `identity` (docs/architecture/overview.md, AR-3.3).
//
// Responsabilidade: Conta, sessao, verificacao de email, declaracao etaria, exclusao de conta.
// Entidades proprias (docs/architecture/data-model.md): `User`, `TermsAcceptance`, `AccountDeletionRequest`.
//
// Este arquivo e a API PUBLICA do modulo: o que nao for exportado aqui nao e
// importado de fora (docs/engineering/conventions.md, secao 2.2). Consumidores
// externos importam `@/modules/identity`; nunca um caminho interno do modulo.
//
// F1-005 materializa apenas a fronteira: nao ha implementacao, e nenhuma
// entidade, servico, repositorio ou caso de uso e antecipado aqui. O `export {}`
// mantem o arquivo como modulo TypeScript sob `isolatedModules`, sem comportamento.
export {};
