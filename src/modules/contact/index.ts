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
// Excecao do mesmo tipo de `@/modules/listing/actions`: o Client Component do
// formulario importa `@/modules/contact/actions`, para nao levar ao bundle do
// navegador o codigo server-only deste arquivo.
//
// F3-002 (#92) entrega a primeira operacao de CR-2.2, "registrar ou alterar o
// proprio contato" (`registerOwnContact`), e a leitura booleana autorizada em
// 2026-10-01 (nota de CR-2.5): `getOwnContactStatus` para o proprio dono e
// `hasContact` para `request` aplicar a pre-condicao de DEC-040 sob a trava do
// anuncio. Nenhuma delas devolve o numero. A segunda operacao de CR-2.2 (obter
// o contato autorizado de uma negociacao) e de F3-010 (#100).
export { registerOwnContact } from './actions';
export type {
  RegisterContactFailureReason,
  RegisterContactInput,
  RegisterContactResult,
} from './actions';
export { getOwnContactStatus, hasContact } from './contact';
export type { ContactReader } from './contact';
// F3-009 (#99): a autorizacao de liberacao (CR-3), criada na transacao da
// escolha. Nao toca `UserContact` e nao devolve o numero.
export { authorizeContactReleaseInTx } from './release';
export type { ContactReleaseInput } from './release';
