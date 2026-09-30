// Declaracao de conformidade da publicacao (T1) e a versao que a identifica
// (listing-contract.md, secoes 2.3 e 4.4; prohibited-items.md, secao 5, item 1).
//
// A MESMA constante e exibida na tela e gravada em `TermsAcceptance.termsVersion`,
// entao a versao aceita e sempre a do texto mostrado. A versao combina a
// decisao normativa (DEC-031), a data da revisao de prohibited-items.md que o
// texto deriva e o numero da redacao desta declaracao. Mudou o texto abaixo ou
// a politica? Suba a versao: o teste compliance.test.ts fixa o hash do texto
// para que uma alteracao sem nova versao quebre a suite.

/** Texto exibido ao anunciante; derivado de prohibited-items.md, secao 5, item 1. */
export const LISTING_COMPLIANCE_DECLARATION =
  'Declaro que o item deste anúncio não pertence a nenhuma das categorias proibidas da Política de itens proibidos do TROQ.';

/** Identificador gravado em `terms_acceptances.terms_version` a cada publicacao. */
export const LISTING_COMPLIANCE_TERMS_VERSION = 'DEC-031/2026-09-14/declaracao-1';

/** Pagina publica da politica, acessivel a partir do aceite (secao 5, item 2). */
export const PROHIBITED_ITEMS_POLICY_PATH = '/politica/itens-proibidos';
