// Deteccao preventiva de contato e endereco em texto livre do anuncio
// (listing-contract.md, secao 10.1; DEC-049, #86). Funcao pura e deterministica,
// sem servidor nem servico externo: a validacao a aplica no servidor como
// autoridade e o formulario a reutiliza so para antecipar a mensagem.
//
// E auxilio, nao moderacao (prohibited-items.md, secao 5, itens 3 e 5): cobre os
// formatos documentados na secao 10.1 e evasoes simples, sem prometer deteccao
// de qualquer texto. A normalizacao abaixo existe SO para detectar; o texto
// gravado continua o digitado (apenas aparado).
//
// Nada aqui devolve o trecho encontrado: quem chama recebe so as categorias, e
// nenhuma mensagem, log ou telemetria pode reproduzir o dado detectado.

export type ContactCategory = 'phone' | 'whatsapp' | 'email' | 'contact_link' | 'address';

/** Caracteres invisiveis usados para quebrar padroes ("11​9876..."). */
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁪-⁯﻿]/g;
/** Hifens e tracos Unicode que o NFKC nao converte em `-`. */
const DASHES = /[‐-―−⁃﹘﹣]/g;

/**
 * Forma usada so para detectar: NFKC (digitos de largura total, matematicos,
 * circulados e sobrescritos viram ASCII), sem invisiveis, tracos unificados,
 * sem acentos, minusculas e espacos colapsados.
 */
export function normalizeForDetection(text: string): string {
  return text
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(DASHES, '-')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// --- Telefone -------------------------------------------------------------

/**
 * Formas de telefone brasileiro sobre os digitos: com DDD (de 11 a 99, sem
 * zero), opcionalmente precedido de `55` e/ou do `0` de longa distancia, e
 * numero de 9 digitos comecando por 9 (celular) ou de 8 comecando por 2 a 9.
 */
const PHONE_WITH_AREA = /^(?:55)?0?[1-9]{2}(?:9\d{8}|[2-9]\d{7})$/;
const MOBILE_WITHOUT_AREA = /^9\d{8}$/;

/** Separadores aceitos entre grupos de digitos de um telefone. */
const SEP = '[\\s.\\-]?';

/**
 * Telefone formatado: `+55`, DDD (com ou sem parenteses e `0`), grupo de 4 ou 5
 * digitos (ou `9` isolado + 4) e grupo final de 4.
 */
const FORMATTED_PHONE = new RegExp(
  '(?<![\\d])' +
    `(?:\\+?\\s?55${SEP})?` +
    `(?:\\(\\s?0?\\d{2}\\s?\\)\\s?|0?\\d{2}${SEP})?` +
    `(?:9${SEP}\\d{4}|\\d{4,5})` +
    '([\\s.\\-]?)' +
    '\\d{4}' +
    '(?![\\d])',
  'g',
);

/**
 * Evasao por digitos espalhados ("1 1 9 8 7 6 ..."): digitos isolados separados
 * por espaco, ponto, hifen, `_` ou `*`, com o DDD opcionalmente agrupado.
 */
const SPREAD_PHONE =
  /(?<!\d)(?:\+?55[\s.\-_*]{0,3})?(?:\(?0?\d{2}\)?[\s.\-_*]{1,3})?\d(?:[\s.\-_*]{1,3}\d){7,10}(?!\d)/g;

const YEAR = /^(?:19|20)\d{2}$/;

function digitsOf(text: string): string {
  return text.replace(/\D/g, '');
}

function isPhoneMatch(match: string, separator: string): boolean {
  const digits = digitsOf(match);
  if (PHONE_WITH_AREA.test(digits) || MOBILE_WITHOUT_AREA.test(digits)) return true;
  // Fixo sem DDD so com a formatacao tipica `XXXX-XXXX`/`XXXX.XXXX`, e nunca um
  // intervalo de anos ("2019-2020"): oito digitos soltos sao comuns demais.
  if (digits.length === 8 && /^[2-9]/.test(digits) && (separator === '-' || separator === '.')) {
    return !(YEAR.test(digits.slice(0, 4)) && YEAR.test(digits.slice(4)));
  }
  return false;
}

/** `O` no lugar de zero entre digitos ("9876-54o1") ou colado ao fim ("...432o"). */
function letterOToZero(text: string): string {
  return text.replace(/(?<=\d[\s.\-]?)o(?=[\s.\-]?\d)|(?<=\d)o(?![a-z])/g, '0');
}

function hasPhone(normalized: string): boolean {
  const text = letterOToZero(normalized);
  for (const m of text.matchAll(FORMATTED_PHONE)) {
    if (isPhoneMatch(m[0], m[1] ?? '')) return true;
  }
  for (const m of text.matchAll(SPREAD_PHONE)) {
    const digits = digitsOf(m[0]);
    if (PHONE_WITH_AREA.test(digits) || MOBILE_WITHOUT_AREA.test(digits)) return true;
  }
  return false;
}

// --- Links de contato -----------------------------------------------------

/**
 * Esquemas de link que abrem um canal de contato (`mailto:x`, `tel:+55...`).
 * Exige o alvo colado aos dois-pontos: o rotulo "Tel: a combinar" nao e link.
 */
const CONTACT_SCHEME = /\b(?:mailto|tel|callto|sms)\s?:(?=[^\s])|\bwhatsapp\s?:\s?\/\//;

/** Links do WhatsApp, tolerando espacos em volta de `.` e `/`. */
const WHATSAPP_LINK =
  /\bwa\s?\.\s?me\s?\/|\bwa\s?\.\s?link\s?\/|\b(?:api|web|chat)\s?\.\s?whatsapp\s?\.\s?com\b|\bwhatsapp\s?\.\s?com\s?\/\s?(?:send|message|channel)\b/;

// --- E-mail ---------------------------------------------------------------

/**
 * Ofuscacoes simples de e-mail: `arroba`, `(at)`/`[at]`/`{at}`, `(dot)`/`[ponto]`
 * e espacos em volta de `@` e de `.`.
 */
function deobfuscateEmail(normalized: string): string {
  return normalized
    .replace(/\s?[([{]\s?(?:at|arroba)\s?[)\]}]\s?/g, '@')
    .replace(/\s?\barroba\b\s?/g, '@')
    .replace(/\s?[([{]\s?(?:dot|ponto)\s?[)\]}]\s?/g, '.')
    .replace(/(?<=@[a-z0-9.\-]*[a-z0-9])\s(?:ponto|dot)\s(?=[a-z])/g, '.')
    .replace(/\s?@\s?/g, '@')
    .replace(/(?<=@[a-z0-9.\-]+)\s?\.\s?(?=[a-z])/g, '.');
}

const EMAIL = /[a-z0-9._%+\-]+@[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.[a-z]{2,}/;
/** Provedor conhecido sem o dominio de topo ("fulano@gmail"). */
const EMAIL_PROVIDER =
  /[a-z0-9._%+\-]+@(?:gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|bol|uol|terra|ig|globo|protonmail|proton)\b/;

function hasEmail(normalized: string): boolean {
  const text = deobfuscateEmail(normalized);
  return EMAIL.test(text) || EMAIL_PROVIDER.test(text);
}

// --- Endereco -------------------------------------------------------------

/** CEP com hifen (`01310-100`, `01.310-100`) ou precedido da palavra CEP. */
const CEP = /(?<!\d)\d{2}\.?\d{3}-\d{3}(?!\d)|\bcep\b[\s:.\-]{0,3}\d{2}\.?\d{3}-?\d{3}(?!\d)/;

/** Coordenadas decimais (`-23.5505, -46.6333`) ou em graus/minutos. */
const COORDINATES =
  /(?<![\d.])-?\d{1,2}\.\d{4,}\s?,\s?-?\d{1,3}\.\d{4,}(?![\d.])|\d{1,3}\s?°\s?\d{1,2}\s?['’′]\s?(?:\d{1,2}(?:[.,]\d+)?\s?(?:["”]|''|′′)\s?)?[nsweol]\b/;

/** Links de mapa, que localizam o endereco sem escreve-lo. */
const MAP_LINK =
  /\b(?:maps\s?\.\s?app\s?\.\s?goo\s?\.\s?gl|goo\s?\.\s?gl\s?\/\s?maps|maps\s?\.\s?google\s?\.\s?[a-z.]+|google\s?\.\s?[a-z.]+\s?\/\s?maps|waze\s?\.\s?com\s?\/\s?(?:ul|live-map))\b/;

/**
 * Tipos de logradouro por extenso e abreviacoes sem ambiguidade com o
 * vocabulario de anuncios. Abreviacoes curtas exigem o ponto (`al.` nao e a UF
 * AL); `TV` (travessa) e `R.` ficam de fora: colidem com "TV 55 polegadas" e
 * com preco.
 */
const STREET_TYPE =
  '(?:rua|avenida|av\\.?|al\\.|alameda|travessa|trav\\.|estrada|estr\\.|rodovia|rod\\.|praca|largo|viela|beco|servidao|ladeira)';
/**
 * "de rua", "para estrada", "rua e esteira": o tipo usado como adjetivo ou
 * seguido de conjuncao nao inicia endereco ("bike de rua aro 29, 21 marchas").
 */
const NOT_ADJECTIVE = '(?<!\\b(?:de|para|pra|e|ou)\\s)';
const NOT_CONJUNCTION = '(?!(?:e|ou|com|sem|para|pra)\\b)';
const STREET_NAME = "(?:[a-z0-9'’.\\-]+\\s){0,5}?[a-z0-9'’.\\-]+";
const NUMBER_MARK =
  '(?:\\s?,\\s?(?:(?:n|no|n°|num|numero)\\.?\\s?)?|\\s(?:n|no|n°|num|numero)\\.?\\s?)';
/** Numero seguido de unidade e medida ou quantidade, nao numero de imovel. */
const NOT_UNIT =
  '(?!\\s?(?:x|cm|mm|m|km|kg|g|gb|tb|mb|l|ml|w|v|mah|pol|polegadas|anos?|mes|meses|dias|unidades?|un|pecas?|pares?|marchas|lugares|portas|vezes|horas|h)\\b)';
const COMPLEMENT =
  '(?:apto|apt|apartamento|ap|bloco|bl|casa|sala|conj|conjunto|andar|fundos|lote|lt|quadra|qd|cj)';
const STREET_START = `${NOT_ADJECTIVE}\\b${STREET_TYPE}\\s${NOT_CONJUNCTION}${STREET_NAME}`;

/**
 * Logradouro com identificacao e numero: tipo + nome + numero marcado por
 * virgula ou `nº`, ou numero seguido de complemento ("Rua Augusta 500 apto 12").
 * Sem a marca do numero ou o complemento, nao basta ("Rua Augusta 500").
 */
const STREET_ADDRESS = new RegExp(
  `${STREET_START}${NUMBER_MARK}\\d{1,5}\\b${NOT_UNIT}` +
    `|${STREET_START}\\s\\d{1,5}\\s?,?\\s?${COMPLEMENT}\\.?\\s?\\d*\\b`,
);

/** Quadra/lote e similares, comuns em enderecos sem logradouro nomeado. */
const BLOCK_LOT =
  /\b(?:quadra|qd)\.?\s?[a-z0-9]{1,4}\s?,?\s?(?:lote|lt|conjunto|conj|cj|casa)\.?\s?\d{1,4}\b/;

function hasAddress(normalized: string): boolean {
  return (
    CEP.test(normalized) ||
    COORDINATES.test(normalized) ||
    MAP_LINK.test(normalized) ||
    STREET_ADDRESS.test(normalized) ||
    BLOCK_LOT.test(normalized)
  );
}

/** Categorias detectadas, sem o trecho que as revelou. */
export function detectContactCategories(text: string): ContactCategory[] {
  const normalized = normalizeForDetection(text);
  const found: ContactCategory[] = [];
  if (hasPhone(normalized)) found.push('phone');
  if (WHATSAPP_LINK.test(normalized)) found.push('whatsapp');
  if (hasEmail(normalized)) found.push('email');
  if (CONTACT_SCHEME.test(normalized)) found.push('contact_link');
  if (hasAddress(normalized)) found.push('address');
  return found;
}

export function containsContactData(text: string): boolean {
  return detectContactCategories(text).length > 0;
}

/** Mensagem unica do campo; nunca repete o que foi detectado. */
export const CONTACT_DATA_MESSAGE =
  'Não inclua telefone, WhatsApp, e-mail ou endereço neste campo.';
