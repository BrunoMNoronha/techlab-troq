// Validacao do conteudo do anuncio (docs/architecture/listing-contract.md,
// secao 3). Funcao pura, sem dependencia de servidor: as actions a aplicam como
// autoridade e o formulario a reutiliza apenas para antecipar a mensagem.

export const LISTING_FIELDS = ['title', 'description', 'city', 'state'] as const;

export type ListingField = (typeof LISTING_FIELDS)[number];

export type ListingFieldErrors = Partial<Record<ListingField, string>>;

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
