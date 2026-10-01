// Formato canonico do contato (data-model.md, DM-4.5; contact-release.md,
// CR-2.5 item 2): telefone brasileiro em E.164.
//
// `+55`, DDD de dois digitos (cada um de 1 a 9) e assinante de 9 digitos
// comecando por 9 (celular) ou de 8 digitos comecando por 2 a 5 (fixo). A
// entrada aceita espacos, parenteses, pontos, hifens e o prefixo `+55` ou `55`
// opcional; qualquer outra forma e recusada. E regra de formato, nao de
// titularidade: o MVP nao verifica posse do numero.
//
// Funcao pura e sem efeitos: o resultado de recusa nao carrega a entrada, para
// que nenhuma camada acima consiga ecoa-la (CR-2.5 item 2).

/** Teto da entrada bruta: `+55 (11) 91234-5678` tem 19 caracteres. */
const MAX_INPUT_LENGTH = 32;

/** So digitos e separadores aceitos; `+` apenas no inicio. */
const ALLOWED_INPUT = /^\+?[\d\s().-]+$/;

/** DDD (dois digitos de 1 a 9) + celular (9 + 8 digitos) ou fixo (2-5 + 7 digitos). */
const NATIONAL_NUMBER = /^[1-9]{2}(?:9\d{8}|[2-5]\d{7})$/;

const COUNTRY_CODE = '55';

export type PhoneNormalization = { ok: true; e164: string } | { ok: false; empty: boolean };

export function normalizeBrazilianPhone(raw: unknown): PhoneNormalization {
  if (typeof raw !== 'string') return { ok: false, empty: true };

  const input = raw.trim();
  if (input === '') return { ok: false, empty: true };
  if (input.length > MAX_INPUT_LENGTH || !ALLOWED_INPUT.test(input)) {
    return { ok: false, empty: false };
  }

  const digits = input.replace(/\D/g, '');
  // O numero nacional tem 10 (fixo) ou 11 (celular) digitos; com o DDI, 12 ou
  // 13. Os comprimentos nao se sobrepoem, entao o DDD 55 nao e confundido com
  // o prefixo do pais. Com `+`, o DDI e obrigatorio e tem de ser o do Brasil.
  let national: string;
  if (digits.length === 10 || digits.length === 11) {
    if (input.startsWith('+')) return { ok: false, empty: false };
    national = digits;
  } else if ((digits.length === 12 || digits.length === 13) && digits.startsWith(COUNTRY_CODE)) {
    national = digits.slice(COUNTRY_CODE.length);
  } else {
    return { ok: false, empty: false };
  }

  if (!NATIONAL_NUMBER.test(national)) return { ok: false, empty: false };
  return { ok: true, e164: `+${COUNTRY_CODE}${national}` };
}
