// Validacao do destino interno de retorno apos o login (#59).
//
// O destino chega por query string (`?next=`) e e dado externo: so e aceito um
// caminho relativo do proprio app. URL absoluta, protocolo relativo (`//host`),
// barra invertida (`/\host`, que navegadores tratam como `//`) e caracteres de
// controle sao rejeitados, evitando Open Redirect (identity-contract.md, secao 7).
const INTERNAL_ORIGIN = 'https://troq.invalid';
const MAX_LENGTH = 512;

export function sanitizeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH) {
    return null;
  }

  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }

  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return null;
  }

  if (url.origin !== INTERNAL_ORIGIN) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
