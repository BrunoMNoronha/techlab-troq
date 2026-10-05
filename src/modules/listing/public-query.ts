// Normalizacao server-side dos parametros da listagem publica
// (listing-contract.md, secao 9.1). Fica fora de `actions.ts` porque um modulo
// 'use server' so exporta funcoes assincronas, e porque `getPublicFeed` pode ser
// chamada como Server Action com argumentos arbitrarios: nada aqui confia no
// tipo declarado.

import { isBrazilianUf } from './uf';

export const PUBLIC_FEED_DEFAULT_LIMIT = 20;
/** Limite tecnico do contrato (nao e regra de negocio): impede payload arbitrario. */
export const PUBLIC_FEED_MAX_LIMIT = 50;

const DIGITS = /^\d+$/;

export interface PublicFeedQuery {
  page: number;
  limit: number;
  city?: string;
  /** UF normalizada. `null` quando informada fora da lista: nao corresponde a nada. */
  state?: string | null;
}

function toInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null;
  }
  // Parametro de URL: somente digitos. "1e3", "2.0", " 2" e "-1" nao sao inteiros aqui.
  if (typeof value === 'string' && DIGITS.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

/** `page`: inteiro >= 1; ausente, nao numerico, fracionario ou < 1 vale 1. */
export function normalizePage(value: unknown): number {
  const page = toInteger(value);
  return page !== null && page >= 1 ? page : 1;
}

/** `limit`: inteiro de 1 a 50; ausente ou invalido vale 20; acima de 50 vale 50. */
export function normalizeLimit(value: unknown): number {
  const limit = toInteger(value);
  if (limit === null || limit < 1) return PUBLIC_FEED_DEFAULT_LIMIT;
  return Math.min(limit, PUBLIC_FEED_MAX_LIMIT);
}

/** `city`: trim; vazio (ou nao texto) e ignorado. */
export function normalizeCity(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const city = value.trim();
  return city === '' ? undefined : city;
}

/**
 * `state`: trim + maiusculas; vazio e ignorado (`undefined`); sigla fora da
 * lista de UFs (uf.ts) vira `null`, que nao corresponde a nenhum anuncio -- o
 * filtro nunca e removido em silencio para devolver a vitrine inteira.
 */
export function normalizeState(value: unknown): string | null | undefined {
  if (typeof value !== 'string') return undefined;
  const state = value.trim().toUpperCase();
  if (state === '') return undefined;
  return isBrazilianUf(state) ? state : null;
}

export function normalizePublicFeedQuery(options: unknown): PublicFeedQuery {
  const raw = (typeof options === 'object' && options !== null ? options : {}) as Record<
    string,
    unknown
  >;
  return {
    page: normalizePage(raw.page),
    limit: normalizeLimit(raw.limit),
    city: normalizeCity(raw.city),
    state: normalizeState(raw.state),
  };
}
