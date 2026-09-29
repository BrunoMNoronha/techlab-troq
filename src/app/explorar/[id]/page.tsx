import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cache } from 'react';
import { getPublicListingDetail } from '@/modules/listing';
import { getContactRequestEntry } from '@/modules/request';
import { HowItWorks } from '../../_components/how-it-works';
import { ContactRequestEntry } from './contact-request-entry';

export const dynamic = 'force-dynamic';

// Uma consulta por requisicao, compartilhada entre generateMetadata e a pagina.
const getListing = cache(getPublicListingDetail);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  // Metadata so com campos da projecao publica; anuncio indisponivel nao revela nada.
  return listing
    ? { title: `${listing.title} — TROQ`, description: `${listing.city} - ${listing.state}` }
    : { title: 'Anúncio indisponível — TROQ' };
}

export default async function DetalheAnuncioPublicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const listing = await getListing(resolvedParams.id);

  if (!listing) {
    notFound();
  }

  const entryState = await getContactRequestEntry(listing.id);
  if (entryState === 'listing_unavailable') {
    notFound();
  }

  const coverImage =
    listing.images.length > 0
      ? listing.images[0].derivatives.find((d) => d.kind === 'large')?.url ||
        listing.images[0].derivatives[0]?.url
      : null;

  return (
    <main
      style={{
        maxWidth: '640px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'sans-serif',
      }}
    >
      <Link
        href="/explorar"
        style={{ color: '#1d4ed8', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}
      >
        ← Ver todas as ofertas
      </Link>

      <div
        style={{
          marginTop: '16px',
          width: '100%',
          height: '320px',
          backgroundColor: '#f3f4f6',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage}
            alt={listing.title}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <span style={{ fontSize: '48px', color: '#9ca3af' }}>📷</span>
        )}
      </div>

      <div style={{ marginTop: '24px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#111827',
            marginBottom: '8px',
            overflowWrap: 'anywhere',
          }}
        >
          {listing.title}
        </h1>
        <div style={{ color: '#4b5563', fontSize: '14px', marginBottom: '16px' }}>
          📍 {listing.city} - {listing.state}
        </div>

        <div
          style={{
            padding: '16px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            marginBottom: '24px',
          }}
        >
          <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
            Descrição do produto
          </h2>
          <p
            style={{
              color: '#374151',
              fontSize: '15px',
              lineHeight: '1.6',
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            {listing.description}
          </p>
        </div>

        {/* Garantia RF-014: nenhum telefone/WhatsApp transita nesta resposta. */}
        <ContactRequestEntry listingId={listing.id} state={entryState} />

        <div style={{ marginTop: '24px' }}>
          <HowItWorks />
        </div>
      </div>
    </main>
  );
}
