import { redirect } from 'next/navigation';
import { validateSession, loginRedirectPath } from '@/modules/identity';
import { getOwnerListings } from '@/modules/listing';

export const dynamic = 'force-dynamic';

export default async function MeusAnunciosPage() {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    redirect(loginRedirectPath(sessionResult.reason));
  }

  const { listings } = await getOwnerListings();

  const statusLabels: Record<string, { label: string; bg: string; color: string }> = {
    draft: { label: 'Rascunho', bg: '#f3f4f6', color: '#374151' },
    published: { label: 'Publicado', bg: '#dcfce7', color: '#166534' },
    paused: { label: 'Pausado', bg: '#fef3c7', color: '#92400e' },
    closed: { label: 'Encerrado', bg: '#e5e7eb', color: '#4b5563' },
    removed: { label: 'Removido', bg: '#fee2e2', color: '#991b1b' },
  };

  return (
    <main
      style={{ maxWidth: '640px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Meus Anúncios</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
            Gerencie seus itens cadastrados.
          </p>
        </div>
        <a
          href="/anuncios/novo"
          style={{
            padding: '10px 16px',
            backgroundColor: '#2563eb',
            color: 'white',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: '600',
            fontSize: '14px',
          }}
        >
          + Novo Anúncio
        </a>
      </div>

      {!listings || listings.length === 0 ? (
        <div
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            backgroundColor: '#f9fafb',
            border: '1px border-dashed #d1d5db',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📦</div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
            Você ainda não publicou nenhum item
          </h2>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
            Crie seu primeiro rascunho de anúncio para começar a desapegar.
          </p>
          <a
            href="/anuncios/novo"
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              backgroundColor: '#2563eb',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: '600',
            }}
          >
            Criar meu primeiro anúncio
          </a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {listings.map((item) => {
            const statusInfo = statusLabels[item.status] || {
              label: item.status,
              bg: '#f3f4f6',
              color: '#374151',
            };
            const isTerminal = item.status === 'closed' || item.status === 'removed';

            return (
              <div
                key={item.id}
                style={{
                  padding: '20px',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
                    {item.title}
                  </h3>
                  <span
                    style={{
                      padding: '4px 8px',
                      backgroundColor: statusInfo.bg,
                      color: statusInfo.color,
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600',
                    }}
                  >
                    {statusInfo.label}
                  </span>
                </div>

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
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '8px',
                    fontSize: '13px',
                    color: '#6b7280',
                  }}
                >
                  <div>
                    📍 {item.city} - {item.state}
                  </div>
                  {!isTerminal && (
                    <a
                      href={`/anuncios/${item.id}/editar`}
                      style={{ color: '#2563eb', textDecoration: 'none', fontWeight: '600' }}
                    >
                      Editar
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
