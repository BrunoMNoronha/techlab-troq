// Protecao das superficies publicas contra conteudo gravado antes de DEC-049
// (listing-contract.md, secao 10.2; #86). Fica fora de `actions.ts` porque um
// modulo 'use server' so exporta funcoes assincronas.
//
// O anuncio publicado cujo titulo, descricao ou alternativa de troca contenha
// contato ou endereco detectavel continua publico, sem mudar de estado -- como o
// legado de DEC-046 (secao 17.3) --, mas o campo afetado sai da consulta publica
// substituido por um texto neutro. Feed, detalhe, home, metadata e payload RSC
// usam estes DTOs, entao o texto proibido nunca chega ao HTML nem ao JSON. Nada
// e registrado: o log reproduziria o dado.

import { containsContactData } from './contact-detection';

export const PUBLIC_CONTENT_PLACEHOLDERS = {
  title: 'Anúncio em revisão',
  description: 'A descrição deste anúncio está em revisão pelo anunciante.',
  tradeOption: 'Alternativa em revisão',
} as const;

/** Titulo publico: o gravado, ou o texto neutro se contiver contato. */
export function publicTitle(title: string): string {
  return containsContactData(title) ? PUBLIC_CONTENT_PLACEHOLDERS.title : title;
}

export function publicDescription(description: string): string {
  return containsContactData(description) ? PUBLIC_CONTENT_PLACEHOLDERS.description : description;
}

export function publicTradeOption(label: string): string {
  return containsContactData(label) ? PUBLIC_CONTENT_PLACEHOLDERS.tradeOption : label;
}
