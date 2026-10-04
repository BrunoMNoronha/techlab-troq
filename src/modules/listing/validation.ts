// Validacao do conteudo do anuncio (docs/architecture/listing-contract.md,
// secao 3). Funcao pura, sem dependencia de servidor: as actions a aplicam como
// autoridade e o formulario a reutiliza apenas para antecipar a mensagem.

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
  Record<ListingField | TradeOptionField | 'tradeOptions', string>
>;

/** Conteudo normalizado, com o nome fisico `uf` para a UF. */
export interface ListingContent {
  title: string;
  description: string;
  city: string;
  uf: string;
}

export const TITLE_MIN_LENGTH = 5;
export const TITLE_MAX_LENGTH = 60;
export const DESCRIPTION_MAX_LENGTH = 1000;

const UF_PATTERN = /^[A-Z]{2}$/;

export const LISTING_FIELD_MESSAGES: Record<ListingField, string> = {
  title: `Informe um título entre ${TITLE_MIN_LENGTH} e ${TITLE_MAX_LENGTH} caracteres.`,
  description: `Informe a descrição, com até ${DESCRIPTION_MAX_LENGTH} caracteres.`,
  city: 'Informe a cidade.',
  state: 'Use duas letras, como SP.',
};

type FieldCheck = (value: string) => boolean;

const CHECKS: Record<ListingField, FieldCheck> = {
  title: (v) => v.length >= TITLE_MIN_LENGTH && v.length <= TITLE_MAX_LENGTH,
  description: (v) => v.length >= 1 && v.length <= DESCRIPTION_MAX_LENGTH,
  city: (v) => v.length >= 1,
  state: (v) => UF_PATTERN.test(v),
};

function normalize(field: ListingField, value: string): string {
  const trimmed = value.trim();
  return field === 'state' ? trimmed.toUpperCase() : trimmed;
}

export type ListingValidationResult<T> =
  { ok: true; data: T } | { ok: false; fieldErrors: ListingFieldErrors };

function validate(
  input: unknown,
  requireAll: boolean,
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
    data[field === 'state' ? 'uf' : field] = value;
  }

  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: true, data };
}

/** Criacao: os quatro campos sao obrigatorios. */
export function validateListingContent(input: unknown): ListingValidationResult<ListingContent> {
  const result = validate(input, true);
  if (!result.ok) return result;

  const { title, description, city, uf } = result.data;
  if (title === undefined || description === undefined || city === undefined || uf === undefined) {
    // Inalcancavel com requireAll: todo campo ausente ja virou erro acima.
    return { ok: false, fieldErrors: { ...LISTING_FIELD_MESSAGES } };
  }
  return { ok: true, data: { title, description, city, uf } };
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
    slots.push(value ?? '');
  });

  return Object.keys(fieldErrors).length > 0
    ? { ok: false, fieldErrors }
    : { ok: true, data: slots as TradeOptionSlots };
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
