import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPublicListingDetail } from '@/modules/listing';

export const dynamic = 'force-dynamic';

export default async function DetalheAnuncioPublicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const listing = await getPublicListingDetail(resolvedParams.id);

  if (!listing) {
    notFound();
  }

  const coverImage =
    listing.images.length > 0
      ? listing.images[0].derivatives.find((d) => d.kind === 'large')?.url ||
        listing.images[0].derivatives[0]?.url
      : null;

  return (
    <main
      style={{ maxWidth: '640px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif' }}
    >
      <Link
        href="/explorar"
        style={{ color: '#2563eb', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}
      >
        ← Voltar para todos os anúncios
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
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
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

        {/* Garantia RF-014: Nenhum telefone/WhatsApp transita na resposta ou tela. Opcional de solicitacao via R$ 0,99 entra na Fase 3. */}
        <div
          style={{
            padding: '20px',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            color: '#1e40af',
          }}
        >
          🔒 <strong>Proteção de Contato (RF-014):</strong> Os dados diretos do anunciante são
          protegidos pela plataforma.
        </div>
      </div>
    </main>
  );
}
