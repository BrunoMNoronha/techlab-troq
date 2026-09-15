// Fronteira de saída da telemetria: redação de dados proibidos.
//
// Arquivo INTERNO do módulo transversal `platform`
// (docs/engineering/conventions.md, seção 2.5). O que é público está em
// `src/modules/platform/index.ts`.
//
// Por que isto existe. O *data scrubbing* do provedor já está habilitado e
// reforçado (docs/engineering/environments.md, seção 5.8), mas ele age DEPOIS
// do dado sair do processo. A decisão 5 de docs/adr/0007-observability-sentry.md
// proíbe que o dado saia — em qualquer campo, sob qualquer forma. Esta camada é
// a primeira barreira, dentro da aplicação, e não depende de configuração de
// painel nem de disciplina de quem escrever o próximo log.
//
// Princípio: conservador por construção. Preferimos perder diagnóstico a deixar
// passar dado protegido. Onde a heurística é ampla demais — `name` é chave
// proibida, e por isso `contexts.runtime.name` também é redigido —, a perda é
// deliberada e está documentada aqui; não é efeito colateral.

/** Substituto genérico de um valor removido por nome de campo. */
export const REDACTED = '[redacted]';

/** Profundidade máxima percorrida ao sanear uma estrutura aninhada. */
const MAX_DEPTH = 8;

/**
 * Fragmentos de nome de campo que tornam o valor proibido, sem exceção.
 *
 * A comparação é feita sobre o nome NORMALIZADO (minúsculas, sem acento e sem
 * separadores), de modo que `e-mail`, `E_Mail` e `email` são o mesmo nome.
 *
 * Cobertura deliberadamente mais ampla que a lista literal da decisão 5:
 * `conta` casa com `contact`, e `name` casa com `username`, `fullName` e também
 * com `runtime.name`. Redigir demais é o modo de falha aceitável.
 */
const FORBIDDEN_KEY_FRAGMENTS: readonly string[] = [
  // Contato — RB-001, DEC-023. Nunca sai, em nenhuma forma derivada.
  'phone',
  'telefone',
  'celular',
  'whatsapp',
  'conta', // cobre `contact`, `contactId`
  'account',
  // Identificação pessoal.
  'mail', // cobre `email`, `e_mail`, `mailAddress`
  'cpf',
  'cnpj',
  'passaporte',
  'passport',
  'name', // cobre `nome`, `username`, `fullName`, `firstName`, `lastName`
  'nome', // cobre `sobrenome`, `nomeCompleto`
  'apelido',
  'nickname',
  'birth',
  'nascimento',
  // Localização — RB-005 limita o público a cidade/UF; telemetria não precisa nem disso.
  'address',
  'endereco',
  'postal',
  'zipcode',
  'latitude',
  'longitude',
  'geo',
  // Credenciais e segredos — decisão 5; environments.md, seção 6.5.
  'token',
  'secret',
  'senha',
  'password',
  'passwd',
  'credential',
  'auth', // cobre `authorization`, `authToken`
  'apikey',
  'privatekey',
  'cookie',
  'session',
  'bearer',
  'signature',
  'assinatura',
  // Dado financeiro sensível.
  'card',
  'cartao',
  'cvv',
  'cvc',
  'iban',
  'pix',
  'agencia',
  // Superfícies de requisição que carregam qualquer um dos anteriores.
  'querystring',
  'body',
  'payload',
];

/** Nomes de campo proibidos por igualdade exata (fragmento seria amplo demais). */
const FORBIDDEN_EXACT_KEYS: readonly string[] = [
  'ip',
  'ipaddress',
  'remoteaddr',
  'rg',
  'cep',
  'user',
];

/**
 * Prefixo de atributo gerado pela propria SDK (`sentry.sdk.name`,
 * `sentry.trace.parent_span_id`). Nao e dado da aplicacao e nunca carrega dado
 * de pessoa; redigi-lo por nome quebraria correlacao de trace sem proteger
 * ninguem. O valor continua passando pelas regras de valor.
 */
const SDK_RESERVED_KEY_PREFIX = 'sentry.';

/**
 * Padrões de VALOR. Aplicados a toda string que sobrevive à regra de nome,
 * porque dado protegido chega com frequência dentro de uma mensagem livre —
 * `Error: falha ao notificar +55 11 91234-5678` não tem nome de campo nenhum.
 *
 * A ordem importa: o mais específico vem antes do mais genérico.
 */
const VALUE_RULES: ReadonlyArray<{ readonly pattern: RegExp; readonly replacement: string }> = [
  // String de conexão com credencial embutida (`postgresql://user:senha@host/db`).
  {
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@\S+/gi,
    replacement: '[redacted:credential]',
  },
  // DSN de ingestão (`https://<key>@<org>.ingest.<host>/<id>`).
  { pattern: /\bhttps?:\/\/[0-9a-z]+@[^\s/]*ingest[^\s/]*\/\d+/gi, replacement: '[redacted:dsn]' },
  // JWT.
  {
    pattern: /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g,
    replacement: '[redacted:token]',
  },
  // Credencial em texto livre.
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: '[redacted:token]' },
  {
    pattern:
      /\b(authorization|api[_-]?key|token|secret|senha|password|passwd|credential)\b\s*[:=]\s*("[^"]*"|'[^']*'|\S+)/gi,
    replacement: '$1=[redacted]',
  },
  // Email.
  { pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replacement: '[redacted:email]' },
  // CPF, com ou sem máscara. Sem máscara são 11 dígitos seguidos.
  { pattern: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, replacement: '[redacted:cpf]' },
  { pattern: /\b\d{11}\b/g, replacement: '[redacted:cpf]' },
  // Cartão: 13 a 19 dígitos, tolerando espaço e hífen.
  { pattern: /\b(?:\d[ -]?){12,18}\d\b/g, replacement: '[redacted:card]' },
  // Telefone/WhatsApp em qualquer formatação usual.
  {
    pattern: /(?<![A-Za-z0-9])\+?\d[\d\s().-]{7,}\d(?![A-Za-z0-9])/g,
    replacement: '[redacted:phone]',
  },
];

/** Minúsculas, sem acento e sem separador: `E-Mail` e `e_mail` viram `email`. */
function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** `true` quando o nome do campo, por si só, torna o valor proibido. */
export function isForbiddenKey(key: string): boolean {
  if (key.startsWith(SDK_RESERVED_KEY_PREFIX)) {
    return false;
  }
  const normalized = normalizeKey(key);
  if (normalized.length === 0) {
    return false;
  }
  if (FORBIDDEN_EXACT_KEYS.includes(normalized)) {
    return true;
  }
  return FORBIDDEN_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

/**
 * Redige, dentro de uma string livre, todo padrão de dado proibido.
 *
 * Efeito colateral conhecido e aceito: uma sequência longa de dígitos que não
 * seja telefone — um carimbo de tempo em texto, por exemplo — também é redigida.
 */
export function redactText(value: string): string {
  return VALUE_RULES.reduce((text, rule) => text.replace(rule.pattern, rule.replacement), value);
}

/**
 * Reduz uma URL ao que é seguro: esquema, host e caminho redigido.
 *
 * Query string e fragmento saem inteiros — são entrada externa arbitrária e
 * podem conter qualquer coisa —, e credencial embutida em `user:senha@host`
 * nunca sobrevive.
 */
export function sanitizeUrl(value: string): string {
  const withoutQuery = value.split(/[?#]/u)[0] ?? '';
  try {
    const url = new URL(withoutQuery);
    url.username = '';
    url.password = '';
    return `${url.origin}${redactText(url.pathname)}`;
  } catch {
    return redactText(withoutQuery);
  }
}

/**
 * Sanea recursivamente qualquer valor: campo proibido vira `[redacted]`, string
 * é redigida por padrão de valor, e o resto é preservado.
 */
export function sanitizeValue(value: unknown): unknown {
  return sanitizeInternal(value, 0, new WeakSet<object>());
}

/** Sanea um dicionário de telemetria (tags, extras, contexts, atributos). */
export function sanitizeRecord<T extends Record<string, unknown>>(record: T): T;
export function sanitizeRecord(record: undefined): undefined;
export function sanitizeRecord(
  record: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (record === undefined) {
    return undefined;
  }
  return sanitizeObject(record, 0, new WeakSet<object>());
}

function sanitizeInternal(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return REDACTED;
  }
  if (value instanceof Date) {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return REDACTED;
  }
  if (seen.has(value as object)) {
    return REDACTED;
  }
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeInternal(item, depth + 1, seen));
  }
  return sanitizeObject(value as Record<string, unknown>, depth, seen);
}

function sanitizeObject(
  record: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    result[key] = isForbiddenKey(key) ? REDACTED : sanitizeInternal(entry, depth + 1, seen);
  }
  return result;
}
