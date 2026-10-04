// Modulo de dominio `negotiation` (docs/architecture/overview.md, AR-3.3).
//
// Responsabilidade: Escolha, reselecao, negociacao e encerramento.
// Entidades proprias (docs/architecture/data-model.md): `Selection`, `Negotiation`.
//
// Este arquivo e a API PUBLICA do modulo: o que nao for exportado aqui nao e
// importado de fora (docs/engineering/conventions.md, secao 2.2). Consumidores
// externos importam `@/modules/negotiation`; nunca um caminho interno do modulo.
//
// F3-009 (#99) entrega a escolha e a reselecao, que abrem a negociacao `active`
// e criam a autorizacao de liberacao num unico ato (CR-3.3), e os dados da tela
// do dono. Dependencia direcional: `negotiation` -> `listing`, `request`,
// `contact`; nunca o inverso. O encerramento da negociacao e da Fase 4 (#55).
export { chooseRequester } from './actions';
export { getSelectionOptions, selectForOwner, selectRequester } from './selection';
export type {
  SelectionCandidate,
  SelectionFailureReason,
  SelectionKind,
  SelectionOptions,
  SelectionOptionsResult,
  SelectionResult,
  SelectRequesterInput,
} from './selection';
