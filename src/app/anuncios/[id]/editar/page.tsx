import { productCategoryLabel } from '@/modules/listing/categories';
import { notFound, redirect } from 'next/navigation';
import { DescriptionList } from '@/components/data-display';
import { Alert, ErrorState } from '@/components/feedback';
import { PageContainer, PageHeader, Stack } from '@/components/layout';
import { BackLink } from '@/components/navigation';
import { Badge, ButtonLink, Text } from '@/components/ui';
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

// Retorno com recarga completa (`<a>` nativo), como antes da migracao visual.
const backToListings = (
  <BackLink href="/anuncios" reload>
    Meus anúncios
  </BackLink>
);

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
      <PageContainer width="content">
        <PageHeader navigation={backToListings} title="Anúncio" />
        <ErrorState
          title={res.error}
          action={
            <ButtonLink
              href={`/anuncios/${id}/editar`}
              reload
              variant="outline"
              iconStart="refresh"
            >
              Tentar novamente
            </ButtonLink>
          }
        />
      </PageContainer>
    );
  }

  const { listing } = res;
  const statusInfo = LISTING_STATUS_LABELS[listing.status];
  const editable = isEditableStatus(listing.status);
  const images = editable ? await getOwnerListingImages(listing.id) : null;

  return (
    <PageContainer width="content">
      <PageHeader
        navigation={backToListings}
        title={editable ? 'Editar anúncio' : 'Anúncio'}
        description={
          <>
            Estado atual: <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
            {listing.status === 'published' &&
              ' — as alterações aparecem na oferta pública ao salvar.'}
          </>
        }
      />

      <Stack gap={8}>
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
          <Alert tone="error" role="alert">
            Não foi possível carregar as imagens. Recarregue a página.
          </Alert>
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
          <Stack as="section" gap={6} aria-labelledby="historico">
            <Alert tone="neutral">
              <p id="historico">
                Este anúncio está <strong>{statusInfo.label.toLowerCase()}</strong> e fica no seu
                histórico somente para leitura.
              </p>
            </Alert>
            <DescriptionList
              items={[
                { term: 'Título', detail: listing.title },
                {
                  term: 'Descrição',
                  detail: (
                    <Text as="span" preserveLines>
                      {listing.description}
                    </Text>
                  ),
                },
                { term: 'Categoria', detail: productCategoryLabel(listing.category) },
                {
                  term: 'Aceita em troca',
                  detail: listing.tradeOptions.some(Boolean)
                    ? listing.tradeOptions.filter(Boolean).join('; ')
                    : 'Não informado',
                },
                { term: 'Localização', detail: `${listing.city} - ${listing.state}` },
              ]}
            />
          </Stack>
        )}
      </Stack>
    </PageContainer>
  );
}
