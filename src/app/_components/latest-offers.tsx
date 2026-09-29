import Link from 'next/link';
import { getPublicFeed } from '@/modules/listing';
import { ListingCard, listingGridStyle } from './listing-card';

// Ofertas exibidas na home: primeira pagina do feed publico (#43/#49), com a
// mesma ordenacao (mais recentes primeiro) e a mesma regra de visibilidade.
export const HOME_OFFERS_LIMIT = 12;

const navLink = { color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' } as const;

export async function LatestOffers() {
  let feed: Awaited<ReturnType<typeof getPublicFeed>>;
  try {
    feed = await getPublicFeed({ page: 1, limit: HOME_OFFERS_LIMIT });
  } catch (err) {
    console.error('[Home] falha ao carregar ofertas publicas', err);
    return (
      <div role="alert" style={statusBox('#fef2f2', '#fecaca', '#991b1b')}>
        Não foi possível carregar as ofertas agora. Tente novamente em instantes ou{' '}
        <Link href="/explorar" style={{ color: '#991b1b', fontWeight: 600 }}>
          abra a página de ofertas
        </Link>
        .
      </div>
    );
  }

  if (feed.listings.length === 0) {
    return (
      <div role="status" style={statusBox('#f9fafb', '#e5e7eb', '#374151')}>
        Ainda não há ofertas publicadas. Volte em breve ou crie uma conta para anunciar.
      </div>
    );
  }

  return (
    <>
      <div style={listingGridStyle}>
        {feed.listings.map((item) => (
          <ListingCard key={item.id} item={item} />
        ))}
      </div>
      {feed.total > feed.listings.length && (
        <p style={{ margin: '20px 0 0' }}>
          <Link href="/explorar" style={navLink}>
            Ver todas as {feed.total} ofertas
          </Link>
        </p>
      )}
    </>
  );
}

export function OffersLoading() {
  return (
    <div role="status" aria-live="polite" style={statusBox('#f9fafb', '#e5e7eb', '#374151')}>
      Carregando ofertas…
    </div>
  );
}

function statusBox(background: string, border: string, color: string) {
  return {
    padding: '24px',
    backgroundColor: background,
    border: `1px solid ${border}`,
    borderRadius: '8px',
    color,
    fontSize: '15px',
  } as const;
}
