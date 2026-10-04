'use server';

import { selectRequester, type SelectionResult, type SelectRequesterInput } from './selection';

// Fronteira chamavel pelo cliente da escolha do solicitante (F3-009, #99). A
// regra inteira -- sessao, confirmacao explicita, travas, P1 a P7 e auditoria --
// vive em selection.ts. A leitura das opcoes (`getSelectionOptions`) NAO e
// Server Action: e lida pelo Server Component da tela (F3-012, #102), para nao
// virar endpoint de consulta.

/** Escolhe uma solicitacao paga do proprio anuncio, com confirmacao explicita. */
export async function chooseRequester(input: SelectRequesterInput): Promise<SelectionResult> {
  return selectRequester(input);
}
