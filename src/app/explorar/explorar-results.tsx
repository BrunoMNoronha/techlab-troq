import Link from 'next/link';
import { getPublicFeed, type PublicFeedPage } from '@/modules/listing';
import { ListingCard, listingGridStyle } from '../_components/listing-card';
import { explorarHref, hasFilter, type ExplorarQuery } from './explorar-query';

// Resultados de /explorar: grade, paginacao e estados de vazio e erro
// (listing-contract.md, secoes 9 e 11). Renderizado dentro de um Suspense da
// propria pagina; nenhum loading.tsx envolve /explorar/[id], cujo 404 precisa
// continuar sendo status HTTP real (doc do Next, loading.md, Status Codes).

const pageLink = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '44px',
  padding: '0 16px',
  border: '1px solid #bfdbfe',
  borderRadius: '6px',
  color: '#1d4ed8',
  fontWeight: 600,
  textDecoration: 'none',
} as const;

const inlineLink = { color: 'inherit', fontWeight: 600 } as const;

export async function ExplorarResults({ query }: { query: ExplorarQuery }) {
  const retryHref = explorarHref(query);
  let feed: PublicFeedPage;
  try {
    feed = await getPublicFeed({ page: query.page, city: query.city, state: query.state });
  } catch (err) {
    console.error('[Explorar] falha ao carregar anuncios publicos', err);
    return (
      <div role="alert" style={statusBox('#fef2f2', '#fecaca', '#991b1b')}>
        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
          Não foi possível carregar os anúncios agora.
        </p>
        <p style={{ margin: 0 }}>
          <Link href={retryHref} style={inlineLink}>
            Tentar novamente
          </Link>
        </p>
      </div>
    );
  }

  const filtered = hasFilter(query);
  const clearHref = explorarHref({ page: 1, city: '', state: '' });

  if (feed.total === 0) {
    return filtered ? (
      <div role="status" style={statusBox('#f9fafb', '#d1d5db', '#374151')}>
        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
          Nenhum anúncio encontrado para esse filtro.
        </p>
        <p style={{ margin: 0 }}>
          <Link href={clearHref} style={inlineLink}>
            Remover o filtro e ver todos os anúncios
          </Link>
        </p>
      </div>
    ) : (
      <div role="status" style={statusBox('#f9fafb', '#d1d5db', '#374151')}>
        Ainda não há anúncios publicados. Volte em breve.
      </div>
    );
  }

  const lastPage = Math.max(1, Math.ceil(feed.total / feed.limit));

  if (feed.listings.length === 0) {
    // Pagina alem da ultima: lista vazia com o total correto, sem erro (9.1).
    return (
      <div role="status" style={statusBox('#f9fafb', '#d1d5db', '#374151')}>
        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
          Esta página não tem anúncios. Há {feed.total} anúncio(s) em {lastPage} página(s).
        </p>
        <p style={{ margin: 0 }}>
          <Link href={explorarHref({ ...query, page: lastPage })} style={inlineLink}>
            Ir para a última página
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <p role="status" style={{ color: '#4b5563', fontSize: '14px', margin: '0 0 16px' }}>
        {feed.total} anúncio(s) disponível(is) · página {feed.page} de {lastPage}
      </p>
      <div style={listingGridStyle}>
        {feed.listings.map((item) => (
          <ListingCard key={item.id} item={item} />
        ))}
      </div>
      {lastPage > 1 && (
        <nav aria-label="Paginação" style={{ marginTop: '24px' }}>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            {feed.page > 1 && (
              <li>
                <Link
                  href={explorarHref({ ...query, page: feed.page - 1 })}
                  rel="prev"
                  style={pageLink}
                >
                  ← Anterior
                </Link>
              </li>
            )}
            <li>
              <span aria-current="page" style={{ fontSize: '14px', color: '#374151' }}>
                Página {feed.page} de {lastPage}
              </span>
            </li>
            {feed.page < lastPage && (
              <li>
                <Link
                  href={explorarHref({ ...query, page: feed.page + 1 })}
                  rel="next"
                  style={pageLink}
                >
                  Próxima →
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </>
  );
}

export function ExplorarLoading() {
  return (
    <div role="status" aria-live="polite" style={statusBox('#f9fafb', '#e5e7eb', '#374151')}>
      Carregando anúncios…
    </div>
  );
}

function statusBox(background: string, border: string, color: string) {
  return {
    padding: '24px',
    backgroundColor: background,
    border: `1px dashed ${border}`,
    borderRadius: '8px',
    color,
    fontSize: '15px',
  } as const;
}
