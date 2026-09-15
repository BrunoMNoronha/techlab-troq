// Modulo de dominio `contact` (docs/architecture/overview.md, AR-3.3).
//
// Responsabilidade: Guarda do dado protegido, autorizacao e entrega do contato.
// Entidades proprias (docs/architecture/data-model.md): `UserContact`, `ContactRelease`, `ContactAccessEvent`.
//
// Separado de `identity` e de `listing` de proposito (AR-3.4): telefone/WhatsApp
// nao e campo de usuario nem de anuncio. Nenhum outro modulo le esse dado
// diretamente; o acesso passa por esta fronteira, que exige autorizacao
// (docs/architecture/contact-release.md).
//
// Este arquivo e a API PUBLICA do modulo: o que nao for exportado aqui nao e
// importado de fora (docs/engineering/conventions.md, secao 2.2). Consumidores
// externos importam `@/modules/contact`; nunca um caminho interno do modulo.
//
// F1-005 materializa apenas a fronteira: nao ha implementacao, e nenhuma
// entidade, servico, repositorio ou caso de uso e antecipado aqui. O `export {}`
// mantem o arquivo como modulo TypeScript sob `isolatedModules`, sem comportamento.
export {};
