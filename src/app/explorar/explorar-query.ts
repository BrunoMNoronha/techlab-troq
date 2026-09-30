import { normalizePage } from '@/modules/listing/public-query';

// Leitura da URL de /explorar (listing-contract.md, secao 9.1). A normalizacao
// que vale e a de `getPublicFeed`; aqui so se extrai o texto dos parametros e
// se montam os links, preservando os filtros entre paginas. `limit` nao e
// exposto na URL.

export type ExplorarSearchParams = Record<string, string | string[] | undefined>;

export interface ExplorarQuery {
  page: number;
  /** Texto do filtro como sera reenviado (apos trim); vazio = sem filtro. */
  city: string;
  state: string;
}

function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.trim() : '';
}

export function readExplorarQuery(params: ExplorarSearchParams): ExplorarQuery {
  return {
    page: normalizePage(first(params.page)),
    city: first(params.city),
    state: first(params.state).toUpperCase(),
  };
}

export function hasFilter(query: Pick<ExplorarQuery, 'city' | 'state'>): boolean {
  return query.city !== '' || query.state !== '';
}

/** Link interno de /explorar; pagina 1 e filtros vazios ficam fora da URL. */
export function explorarHref(query: ExplorarQuery): string {
  const search = new URLSearchParams();
  if (query.city !== '') search.set('city', query.city);
  if (query.state !== '') search.set('state', query.state);
  if (query.page > 1) search.set('page', String(query.page));
  const qs = search.toString();
  return qs === '' ? '/explorar' : `/explorar?${qs}`;
}
