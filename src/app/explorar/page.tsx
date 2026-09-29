import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicFeed } from '@/modules/listing';
import { ListingCard, listingGridStyle } from '../_components/listing-card';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ofertas — TROQ',
  description: 'Ofertas publicadas no TROQ, abertas sem login.',
};

export default async function ExplorarPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; state?: string }>;
}) {
  const resolvedParams = await searchParams;
  const { listings, total } = await getPublicFeed({
    city: resolvedParams.city,
    state: resolvedParams.state,
  });

  return (
    <main
      style={{
        maxWidth: '1040px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'sans-serif',
      }}
    >
      <Link
        href="/"
        style={{ color: '#1d4ed8', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}
      >
        ← Início
      </Link>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: '12px 0 8px' }}>
        Anúncios no TROQ
      </h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
        Total de {total} anúncio(s) disponível(is).
      </p>

      {listings.length === 0 ? (
        <div
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            backgroundColor: '#f9fafb',
            border: '1px dashed #d1d5db',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
            Nenhum anúncio encontrado
          </h2>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            Tente remover ou alterar os filtros de região.
          </p>
        </div>
      ) : (
        <div style={listingGridStyle}>
          {listings.map((item) => (
            <ListingCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
