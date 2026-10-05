import { productCategoryLabel } from '@/modules/listing/categories';
import { redirect } from 'next/navigation';
import { getOwnContactStatus } from '@/modules/contact';
import { validateSession, loginRedirectPath } from '@/modules/identity';
import { getOwnerListings } from '@/modules/listing';
import { isEditableStatus, LISTING_STATUS_LABELS } from './_components/listing-status';

export const dynamic = 'force-dynamic';

const primaryLinkStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 16px',
  backgroundColor: '#2563eb',
  color: 'white',
  borderRadius: '6px',
  textDecoration: 'none',
  fontWeight: '600',
  fontSize: '14px',
};

const panelStyle: React.CSSProperties = {
  padding: '40px 24px',
  textAlign: 'center',
  backgroundColor: '#f9fafb',
  border: '1px dashed #d1d5db',
  borderRadius: '8px',
};

export default async function MeusAnunciosPage() {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    redirect(loginRedirectPath(sessionResult.reason));
  }

  const result = await getOwnerListings();

  if (result.reason === 'unauthenticated') {
    redirect(loginRedirectPath('no_session'));
  }

  // DEC-040: anuncio publicado de dono sem contato continua visivel, mas nao
  // aceita solicitacao. O painel orienta o cadastro; so o booleano e lido.
  const contactStatus = await getOwnContactStatus();
  const missingContact =
    contactStatus?.hasContact === false &&
    (result.listings ?? []).some((item) => item.status === 'published');

  return (
    <main
      style={{ maxWidth: '640px', margin: '24px auto', padding: '16px', fontFamily: 'sans-serif' }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Meus anúncios</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
            Rascunhos, anúncios ativos e histórico. Só você vê esta página.
          </p>
        </div>
        <a href="/anuncios/novo" style={primaryLinkStyle}>
          + Novo anúncio
        </a>
      </div>

      {missingContact && (
        <div
          role="status"
          style={{
            padding: '16px',
            marginBottom: '24px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            color: '#92400e',
            fontSize: '14px',
          }}
        >
          <p style={{ margin: '0 0 8px', fontWeight: '600' }}>
            Seus anúncios publicados não estão aceitando solicitações.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            Cadastre seu telefone ou WhatsApp para receber solicitações. Ele fica protegido e só é
            entregue a quem você escolher.
          </p>
          <a href="/conta" style={{ color: '#92400e', fontWeight: '600' }}>
            Cadastrar contato
          </a>
        </div>
      )}

      {!result.success || !result.listings ? (
        <div
          role="alert"
          style={{ ...panelStyle, borderColor: '#fecaca', backgroundColor: '#fef2f2' }}
        >
          <h2
            style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#991b1b' }}
          >
            Não foi possível carregar seus anúncios
          </h2>
          <p style={{ color: '#991b1b', fontSize: '14px', marginBottom: '20px' }}>
            Seus anúncios não foram perdidos. Tente novamente em instantes.
          </p>
          <a href="/anuncios" style={primaryLinkStyle}>
            Tentar novamente
          </a>
        </div>
      ) : result.listings.length === 0 ? (
        <div style={panelStyle}>
          <div aria-hidden="true" style={{ fontSize: '40px', marginBottom: '12px' }}>
            📦
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
            Você ainda não tem anúncios
          </h2>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
            Comece por um rascunho: ele fica visível só para você até ser publicado.
          </p>
          <a href="/anuncios/novo" style={primaryLinkStyle}>
            Criar meu primeiro anúncio
          </a>
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {result.listings.map((item) => {
            const statusInfo = LISTING_STATUS_LABELS[item.status];
            const editable = isEditableStatus(item.status);

            return (
              <li
                key={item.id}
                style={{
                  padding: '16px',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '12px',
                  }}
                >
                  <h2
                    style={{
                      fontSize: '18px',
                      fontWeight: '600',
                      color: '#111827',
                      margin: 0,
                      minWidth: 0,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {item.title}
                  </h2>
                  <span
                    style={{
                      flexShrink: 0,
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
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {item.description}
                </p>
                <p style={{ color: '#4b5563', fontSize: '13px' }}>
                  {productCategoryLabel(item.category)}
                </p>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '13px',
                    color: '#6b7280',
                  }}
                >
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    📍 {item.city} - {item.state}
                  </span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', flexShrink: 0 }}>
                    {/* F3-012 (#102): solicitacoes pagas e escolha. Rascunho nunca
                        recebeu solicitacao; removido nao admite escolha (P5). */}
                    {item.status !== 'draft' && item.status !== 'removed' && (
                      <a
                        href={`/anuncios/${item.id}/solicitacoes`}
                        aria-label={`Solicitações pagas de ${item.title}`}
                        style={{ color: '#2563eb', textDecoration: 'none', fontWeight: '600' }}
                      >
                        Solicitações
                      </a>
                    )}
                    <a
                      href={`/anuncios/${item.id}/editar`}
                      aria-label={`${editable ? 'Editar' : 'Ver histórico de'} ${item.title}`}
                      style={{ color: '#2563eb', textDecoration: 'none', fontWeight: '600' }}
                    >
                      {editable ? 'Editar' : 'Ver'}
                    </a>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
