import { productCategoryLabel } from '@/modules/listing/categories';
import { notFound, redirect } from 'next/navigation';
import { loginRedirectPath, validateSession } from '@/modules/identity';
import { getListingForEdit } from '@/modules/listing';
import { getOwnerListingImages } from '@/modules/media/upload';
import { ListingForm } from '../../_components/listing-form';
import { isEditableStatus, LISTING_STATUS_LABELS } from '../../_components/listing-status';
import { ImageManager } from './_components/image-manager';
import { LifecyclePanel } from './_components/lifecycle-panel';

export const dynamic = 'force-dynamic';
// Server Actions desta pagina (confirmacao do upload) agendam o processamento
// com after(), que herda este limite (media-pipeline-contract.md, secao 6).
export const maxDuration = 300;

const mainStyle: React.CSSProperties = {
  maxWidth: '540px',
  margin: '24px auto',
  padding: '16px',
  fontFamily: 'sans-serif',
};

const backLinkStyle: React.CSSProperties = {
  color: '#1d4ed8',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: '600',
};

export default async function EditarAnuncioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    redirect(loginRedirectPath(sessionResult.reason));
  }

  const res = await getListingForEdit(id);

  // Anuncio alheio, inexistente ou com ID malformado: a mesma resposta 404,
  // sem nenhum dado do anuncio (listing-contract.md, secao 7).
  if (res.reason === 'not_found') {
    notFound();
  }

  if (res.reason === 'unauthenticated') {
    redirect(loginRedirectPath('no_session'));
  }

  if (!res.success || !res.listing) {
    return (
      <main style={mainStyle}>
        <a href="/anuncios" style={backLinkStyle}>
          ← Meus anúncios
        </a>
        <div
          role="alert"
          style={{
            marginTop: '16px',
            padding: '16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#991b1b',
            fontSize: '14px',
          }}
        >
          <p style={{ margin: '0 0 8px' }}>{res.error}</p>
          <a href={`/anuncios/${id}/editar`} style={{ color: '#991b1b', fontWeight: '600' }}>
            Tentar novamente
          </a>
        </div>
      </main>
    );
  }

  const { listing } = res;
  const statusInfo = LISTING_STATUS_LABELS[listing.status];
  const editable = isEditableStatus(listing.status);
  const images = editable ? await getOwnerListingImages(listing.id) : null;

  return (
    <main style={mainStyle}>
      <a href="/anuncios" style={backLinkStyle}>
        ← Meus anúncios
      </a>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '12px 0 8px' }}>
        {editable ? 'Editar anúncio' : 'Anúncio'}
      </h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
        Estado atual: <strong>{statusInfo.label}</strong>
        {listing.status === 'published' && ' — as alterações aparecem na oferta pública ao salvar.'}
      </p>

      {editable ? (
        <ListingForm
          mode="edit"
          listingId={listing.id}
          requireTradeOptions={listing.status !== 'draft'}
          initialValues={{
            title: listing.title,
            description: listing.description,
            city: listing.city,
            state: listing.state,
            tradeOptions: listing.tradeOptions,
            category: listing.category,
          }}
        />
      ) : null}

      {editable && images?.success ? (
        <ImageManager listingId={listing.id} initialImages={images.data.images} />
      ) : null}

      {editable && images && !images.success ? (
        <p role="alert" style={{ marginTop: '24px', color: '#991b1b', fontSize: '14px' }}>
          Não foi possível carregar as imagens. Recarregue a página.
        </p>
      ) : null}

      {listing.status === 'draft' ||
      listing.status === 'published' ||
      listing.status === 'paused' ? (
        <LifecyclePanel
          listingId={listing.id}
          status={listing.status}
          readyImageCount={
            images?.success ? images.data.images.filter((i) => i.state === 'ready').length : 0
          }
        />
      ) : null}

      {editable ? null : (
        <section aria-labelledby="historico">
          <p
            id="historico"
            style={{
              padding: '12px 16px',
              backgroundColor: '#f3f4f6',
              borderRadius: '6px',
              color: '#374151',
              fontSize: '14px',
            }}
          >
            Este anúncio está <strong>{statusInfo.label.toLowerCase()}</strong> e fica no seu
            histórico somente para leitura.
          </p>
          <dl style={{ fontSize: '15px', color: '#111827', overflowWrap: 'anywhere' }}>
            <dt style={{ fontWeight: '600', marginTop: '16px' }}>Título</dt>
            <dd style={{ margin: '4px 0 0' }}>{listing.title}</dd>
            <dt style={{ fontWeight: '600', marginTop: '16px' }}>Descrição</dt>
            <dd style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{listing.description}</dd>
            <dt>Categoria</dt>
            <dd>{productCategoryLabel(listing.category)}</dd>
            <dt style={{ fontWeight: '600', marginTop: '16px' }}>Aceita em troca</dt>
            <dd style={{ margin: '4px 0 0' }}>
              {listing.tradeOptions.some(Boolean)
                ? listing.tradeOptions.filter(Boolean).join('; ')
                : 'Não informado'}
            </dd>
            <dt style={{ fontWeight: '600', marginTop: '16px' }}>Localização</dt>
            <dd style={{ margin: '4px 0 0' }}>
              {listing.city} - {listing.state}
            </dd>
          </dl>
        </section>
      )}
    </main>
  );
}
