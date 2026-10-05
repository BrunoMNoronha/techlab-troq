// Unidades federativas aceitas (listing-contract.md, secao 3; #90): os 26
// estados e o Distrito Federal, em ordem alfabetica pelo nome. Fonte unica para
// a validacao do servidor, o formulario de anuncio e o filtro de /explorar.

export interface BrazilianUf {
  /** Sigla gravada em `Listing.uf` e trafegada como `state`. */
  code: string;
  name: string;
}

export const BRAZILIAN_UFS: readonly BrazilianUf[] = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PR', name: 'Paraná' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'TO', name: 'Tocantins' },
];

const UF_CODES: ReadonlySet<string> = new Set(BRAZILIAN_UFS.map((uf) => uf.code));

/** Sigla ja normalizada (trim + maiusculas) pertence a lista. */
export function isBrazilianUf(code: string): boolean {
  return UF_CODES.has(code);
}

/** Texto da opcao: nome e sigla, como "São Paulo (SP)". */
export function ufOptionLabel(uf: BrazilianUf): string {
  return `${uf.name} (${uf.code})`;
}
