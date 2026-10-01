// Conversoes entre os valores do TROQ e os formatos do provedor.
//
// Dinheiro (DM-1.3, PD-4.5): o TROQ trabalha em CENTAVOS INTEIROS; o provedor,
// em string decimal com duas casas ("0.99"). Nenhum `number` de ponto flutuante
// participa da conversao.
//
// Expiracao: `transactions.payments[].expiration_time` e uma DURACAO ISO 8601
// contada da criacao do pagamento, com minimo documentado de 30 minutos (MP-1;
// spike F0-010, experimento 6). Ver a nota de F3-004 em payments-design.md, PD-3.1.

const DECIMAL = /^(0|[1-9]\d*)\.(\d{2})$/;

/** 99 -> "0.99". Recusa valor nao inteiro, negativo ou inseguro. */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError('valor em centavos invalido');
  }
  const units = Math.trunc(cents / 100);
  const rest = cents % 100;
  return `${units}.${rest.toString().padStart(2, '0')}`;
}

/** "0.99" -> 99. Formato fora de "N.NN" devolve `null`: nunca adivinha. */
export function decimalToCents(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = DECIMAL.exec(value);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number(match[2]);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Minimo documentado de `expiration_time` (MP-1). */
export const MIN_EXPIRATION_MS = 30 * 60 * 1000;

/**
 * Duracao ISO 8601 em segundos inteiros, arredondada PARA CIMA e nunca abaixo
 * do minimo documentado. O sandbox aceitou `PT29M` (spike, experimento 6), mas
 * o TROQ nao depende de tolerancia nao documentada.
 */
export function toIsoDuration(ms: number): string {
  if (!Number.isFinite(ms)) throw new RangeError('duracao invalida');
  const seconds = Math.ceil(Math.max(ms, MIN_EXPIRATION_MS) / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `PT${minutes}M` : `PT${minutes}M${rest}S`;
}

/** Instante ISO 8601 do provedor -> Date, ou `null` se ausente ou invalido. */
export function parseInstant(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
