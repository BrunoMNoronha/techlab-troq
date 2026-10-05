// Validacao do conteudo do anuncio (docs/architecture/listing-contract.md,
// secao 3). Funcao pura, sem dependencia de servidor: as actions a aplicam como
// autoridade e o formulario a reutiliza apenas para antecipar a mensagem.

import { CONTACT_DATA_MESSAGE, containsContactData } from './contact-detection';
import { isBrazilianUf } from './uf';
import { isProductCategory } from './categories';

export { CONTACT_DATA_MESSAGE };

export const LISTING_FIELDS = ['title', 'description', 'city', 'state'] as const;

export type ListingField = (typeof LISTING_FIELDS)[number];

/**
 * Alternativas de troca (DEC-046, #76; listing-contract.md, secao 3.1): um campo
 * por posicao, na ordem do formulario. `tradeOptions` e o erro da lista inteira
 * (forma errada do payload); os demais, de cada campo.
 */
export const TRADE_OPTION_FIELDS = ['tradeOption1', 'tradeOption2', 'tradeOption3'] as const;

export type TradeOptionField = (typeof TRADE_OPTION_FIELDS)[number];

export type ListingFieldErrors = Partial<
  Record<ListingField | TradeOptionField | 'tradeOptions' | 'category', string>
>;

/** Conteudo normalizado, com o nome fisico `uf` para a UF. */
export interface ListingContent {
  category: string | null;
  title: string;
  description: string;
  city: string;
  uf: string;
}

export const TITLE_MIN_LENGTH = 5;
export const TITLE_MAX_LENGTH = 60;
export const DESCRIPTION_MAX_LENGTH = 1000;

export const LISTING_FIELD_MESSAGES: Record<ListingField, string> = {
  title: `Informe um título entre ${TITLE_MIN_LENGTH} e ${TITLE_MAX_LENGTH} caracteres.`,
  description: `Informe a descrição, com até ${DESCRIPTION_MAX_LENGTH} caracteres.`,
  city: 'Informe a cidade.',
  state: 'Selecione o estado.',
};

type FieldCheck = (value: string) => boolean;

const CHECKS: Record<ListingField, FieldCheck> = {
  title: (v) => v.length >= TITLE_MIN_LENGTH && v.length <= TITLE_MAX_LENGTH,
  description: (v) => v.length >= 1 && v.length <= DESCRIPTION_MAX_LENGTH,
  city: (v) => v.length >= 1,
  // Uma das 27 UFs (uf.ts), nao apenas duas letras: `ZZ` e recusada.
  state: (v) => isBrazilianUf(v),
};

/**
 * Campos de texto livre exibidos publicamente em que telefone, WhatsApp, e-mail
 * e endereco sao recusados (secao 10.1, DEC-049). Cidade e UF ficam de fora:
 * tem regra propria de formato.
 */
const CONTACT_CHECKED_FIELDS: readonly ListingField[] = ['title', 'description'];

function normalize(field: ListingField, value: string): string {
  const trimmed = value.trim();
  return field === 'state' ? trimmed.toUpperCase() : trimmed;
}

export type ListingValidationResult<T> =
  { ok: true; data: T } | { ok: false; fieldErrors: ListingFieldErrors };

function validate(
  input: unknown,
  requireAll: boolean,
  requireCategory = false,
): ListingValidationResult<Partial<ListingContent>> {
  const source: Record<string, unknown> =
    input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const fieldErrors: ListingFieldErrors = {};
  const data: Partial<ListingContent> = {};

  // Somente os quatro campos de conteudo sao lidos; qualquer outra chave
  // (ownerId, status, timestamps, relacoes) e ignorada.
  for (const field of LISTING_FIELDS) {
    const raw = source[field];
    if (raw === undefined && !requireAll) continue;

    const value = typeof raw === 'string' ? normalize(field, raw) : null;
    if (value === null || !CHECKS[field](value)) {
      fieldErrors[field] = LISTING_FIELD_MESSAGES[field];
      continue;
    }
    if (CONTACT_CHECKED_FIELDS.includes(field) && containsContactData(value)) {
      fieldErrors[field] = CONTACT_DATA_MESSAGE;
      continue;
    }
    data[field === 'state' ? 'uf' : field] = value;
  }

  if (requireAll || source.category !== undefined) {
    const category = validateListingCategory(source.category, requireCategory);
    if (category.ok) data.category = category.data;
    else Object.assign(fieldErrors, category.fieldErrors);
  }
  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: true, data };
}

/** Categoria opcional no rascunho; completude na publicacao e reativacao. */
export function validateListingCategory(
  input: unknown,
  required = false,
): ListingValidationResult<string | null> {
  const value = typeof input === 'string' ? input.trim() : input;
  if (value === undefined || value === null || value === '') {
    return required
      ? { ok: false, fieldErrors: { category: 'Selecione a categoria do produto.' } }
      : { ok: true, data: null };
  }
  return typeof value === 'string' && isProductCategory(value)
    ? { ok: true, data: value }
    : { ok: false, fieldErrors: { category: 'Selecione uma categoria válida.' } };
}

/** Conteudo textual obrigatorio; categoria conforme a completude do estado. */
export function validateListingContent(
  input: unknown,
  requireCategory = false,
): ListingValidationResult<ListingContent> {
  const result = validate(input, true, requireCategory);
  if (!result.ok) return result;

  const { title, description, city, uf } = result.data;
  if (title === undefined || description === undefined || city === undefined || uf === undefined) {
    // Inalcancavel com requireAll: todo campo ausente ja virou erro acima.
    return { ok: false, fieldErrors: { ...LISTING_FIELD_MESSAGES } };
  }
  return {
    ok: true,
    data: { title, description, city, uf, category: result.data.category ?? null },
  };
}

/** Edicao: os campos informados seguem exatamente a regra da criacao. */
export function validateListingPatch(
  input: unknown,
): ListingValidationResult<Partial<ListingContent>> {
  return validate(input, false);
}

export const TRADE_OPTION_COUNT = 3;
export const TRADE_OPTION_MAX_LENGTH = 60;

/**
 * As tres posicoes, aparadas, na ordem do formulario; `''` e posicao vazia.
 * Vazio so e aceito enquanto a completude nao e exigida (rascunho).
 */
export type TradeOptionSlots = [string, string, string];

export const EMPTY_TRADE_OPTIONS: TradeOptionSlots = ['', '', ''];

export const TRADE_OPTION_MESSAGES = {
  list: `Informe exatamente ${TRADE_OPTION_COUNT} alternativas de troca.`,
  field: `Informe esta alternativa de troca, com até ${TRADE_OPTION_MAX_LENGTH} caracteres.`,
} as const;

/**
 * Valida as alternativas de troca. A forma e sempre exigida: uma lista de
 * exatamente tres textos, cada um com ate 60 caracteres apos `trim`. Com
 * `requireComplete`, nenhuma pode ficar vazia ou so com espacos -- e a regra de
 * publicar, reativar e editar anuncio `published`/`paused`.
 */
export function validateTradeOptions(
  input: unknown,
  requireComplete: boolean,
): ListingValidationResult<TradeOptionSlots> {
  if (!Array.isArray(input) || input.length !== TRADE_OPTION_COUNT) {
    return { ok: false, fieldErrors: { tradeOptions: TRADE_OPTION_MESSAGES.list } };
  }

  const fieldErrors: ListingFieldErrors = {};
  const slots: string[] = [];
  TRADE_OPTION_FIELDS.forEach((field, index) => {
    const raw: unknown = input[index];
    const value = typeof raw === 'string' ? raw.trim() : null;
    const invalid =
      value === null ||
      value.length > TRADE_OPTION_MAX_LENGTH ||
      (requireComplete && value.length === 0);
    if (invalid) fieldErrors[field] = TRADE_OPTION_MESSAGES.field;
    // Texto livre publico no detalhe: mesma regra do titulo (secao 3.1).
    else if (value !== null && value.length > 0 && containsContactData(value))
      fieldErrors[field] = CONTACT_DATA_MESSAGE;
    slots.push(value ?? '');
  });

  return Object.keys(fieldErrors).length > 0
    ? { ok: false, fieldErrors }
    : { ok: true, data: slots as TradeOptionSlots };
}

/**
 * So os erros de contato/endereco do conteudo ja gravado. A edicao os mostra ao
 * abrir o formulario de um anuncio anterior a DEC-049, para o dono corrigir o
 * campo antes de salvar (secao 10.2).
 */
export function contactFieldErrors(values: {
  title: string;
  description: string;
  tradeOptions: readonly string[];
}): ListingFieldErrors {
  const errors: ListingFieldErrors = {};
  if (containsContactData(values.title)) errors.title = CONTACT_DATA_MESSAGE;
  if (containsContactData(values.description)) errors.description = CONTACT_DATA_MESSAGE;
  TRADE_OPTION_FIELDS.forEach((field, index) => {
    const label = values.tradeOptions[index] ?? '';
    if (label && containsContactData(label)) errors[field] = CONTACT_DATA_MESSAGE;
  });
  return errors;
}

/** Posicoes gravadas (1..3) de volta para as tres posicoes do formulario. */
export function toTradeOptionSlots(rows: { position: number; label: string }[]): TradeOptionSlots {
  const slots: TradeOptionSlots = [...EMPTY_TRADE_OPTIONS];
  for (const row of rows) {
    if (row.position >= 1 && row.position <= TRADE_OPTION_COUNT)
      slots[row.position - 1] = row.label;
  }
  return slots;
}
