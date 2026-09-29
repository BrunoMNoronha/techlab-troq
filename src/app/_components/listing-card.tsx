import Link from 'next/link';
import type { PublicListingFeedItem } from '@/modules/listing';

// Card de oferta publica, compartilhado pela home e por /explorar. Recebe apenas
// a projecao publica do anuncio (sem dono, sem contato).
export function ListingCard({ item }: { item: PublicListingFeedItem }) {
  const coverImage =
    item.images.length > 0
      ? item.images[0].derivatives.find((d) => d.kind === 'medium')?.url ||
        item.images[0].derivatives[0]?.url
      : null;

  return (
    <Link
      href={`/explorar/${item.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        overflow: 'hidden',
        textDecoration: 'none',
        color: 'inherit',
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '180px',
          backgroundColor: '#f3f4f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage}
            alt={item.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span aria-hidden="true" style={{ fontSize: '32px', color: '#6b7280' }}>
            📷
          </span>
        )}
      </div>

      <div
        style={{
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          flex: 1,
        }}
      >
        <h3
          style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#111827',
            margin: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {item.title}
        </h3>
        <p
          style={{
            color: '#4b5563',
            fontSize: '14px',
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {item.description}
        </p>
        <div style={{ marginTop: 'auto', paddingTop: '8px', fontSize: '13px', color: '#4b5563' }}>
          <span aria-hidden="true">📍 </span>
          {item.city} - {item.state}
        </div>
      </div>
    </Link>
  );
}

export const listingGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
  gap: '20px',
} as const;
