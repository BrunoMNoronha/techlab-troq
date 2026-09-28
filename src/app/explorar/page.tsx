import { getPublicFeed } from '@/modules/listing';

export const dynamic = 'force-dynamic';

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
      style={{ maxWidth: '720px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif' }}
    >
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
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
            border: '1px border-dashed #d1d5db',
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px',
          }}
        >
          {listings.map((item) => {
            const coverImage =
              item.images.length > 0
                ? item.images[0].derivatives.find((d) => d.kind === 'medium')?.url ||
                  item.images[0].derivatives[0]?.url
                : null;

            return (
              <a
                key={item.id}
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
                    <img
                      src={coverImage}
                      alt={item.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '32px', color: '#9ca3af' }}>📷</span>
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
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 }}>
                    {item.title}
                  </h3>
                  <p
                    style={{
                      color: '#4b5563',
                      fontSize: '14px',
                      margin: 0,
                      lineClamp: 2,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {item.description}
                  </p>
                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: '8px',
                      fontSize: '13px',
                      color: '#6b7280',
                    }}
                  >
                    📍 {item.city} - {item.state}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </main>
  );
}
