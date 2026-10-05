import { productCategoryLabel } from '@/modules/listing/categories';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { MediaFrame } from '@/components/data-display';
import { Grid, GridItem, PageContainer, PageHeader, Section, Stack } from '@/components/layout';
import { BackLink } from '@/components/navigation';
import { Card, Prose, Text } from '@/components/ui';
import { getPublicListingDetail } from '@/modules/listing';
import { getContactRequestEntryView } from '@/modules/request';
import { getPublicListingReputation } from '@/modules/reputation';
import { HowItWorks } from '../../_components/how-it-works';
import { derivativeSrcSet, listingImageAlt, pickDerivative } from '../../_components/listing-image';
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

  const [entry, reputation] = await Promise.all([
    getContactRequestEntryView(listing.id),
    getPublicListingReputation(listing.id),
  ]);
  const entryState = entry.state;
  if (entryState === 'listing_unavailable') {
    notFound();
  }

  // Imagens pela rota autorizada /media, sem Image Optimization (9.2): todas as
  // `ready`, na ordem de `position` (listing-contract.md, 9.4).
  const images = listing.images;

  return (
    <PageContainer width="content">
      <PageHeader
        navigation={<BackLink href="/explorar">Ver todas as ofertas</BackLink>}
        title={listing.title}
        meta={
          <Text as="span" size="small" tone="muted" icon="map-pin">
            {listing.city} - {listing.state}
          </Text>
        }
      />

      <Stack gap={6}>
        {reputation ? (
          <Card variant="muted">
            <Section title="Reputação do anunciante" titleId="reputacao-anunciante" gap={2}>
              <Text>
                {reputation.count > 0 && reputation.average !== null
                  ? `${reputation.average.toFixed(1).replace('.', ',')} de 5 estrelas · ${reputation.count} ${reputation.count === 1 ? 'avaliação' : 'avaliações'}`
                  : 'Este anunciante ainda não tem avaliações publicadas.'}
              </Text>
            </Section>
          </Card>
        ) : (
          <Text tone="muted">Reputação indisponível no momento.</Text>
        )}
        {images.length > 0 ? (
          <Grid as="ul" columns="sm" gap={2} aria-label="Imagens do anúncio">
            {images.map((image, index) => {
              const src = pickDerivative(image.derivatives, index === 0 ? 'large' : 'medium');
              if (!src) return null;
              return (
                <GridItem as="li" key={image.id} full={index === 0}>
                  <MediaFrame
                    ratio={index === 0 ? 'photo' : 'square'}
                    fit={index === 0 ? 'contain' : 'cover'}
                    rounded
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src.url}
                      srcSet={derivativeSrcSet(image.derivatives)}
                      sizes={
                        index === 0
                          ? '(min-width: 672px) 640px, 100vw'
                          : '(min-width: 672px) 210px, 50vw'
                      }
                      width={src.width}
                      height={src.height}
                      alt={listingImageAlt(listing.title, index, images.length)}
                      loading={index === 0 ? 'eager' : 'lazy'}
                    />
                  </MediaFrame>
                </GridItem>
              );
            })}
          </Grid>
        ) : (
          <MediaFrame ratio="wide" rounded />
        )}

        <Card variant="muted">
          <Section title="Descrição do produto" gap={2}>
            <Text wrapAnywhere preserveLines>
              {listing.description}
            </Text>
          </Section>
        </Card>

        {/* Alternativas de troca (listing-contract.md, 3.1 e 9.4): texto puro, na
            ordem do anunciante. Anuncio anterior a #76 ainda sem elas nao mostra
            a secao (secao 17.3). */}
        <Text tone="muted">Categoria: {productCategoryLabel(listing.category)}</Text>
        {listing.tradeOptions.length > 0 ? (
          <Card variant="muted">
            <Section
              title="Aceita em troca"
              titleId="alternativas-de-troca"
              description="Qualquer uma destas alternativas; não é preciso oferecer todas."
              gap={3}
            >
              <Prose>
                <ul>
                  {listing.tradeOptions.map((option, index) => (
                    <li key={index}>
                      <Text as="span" wrapAnywhere>
                        {option}
                      </Text>
                    </li>
                  ))}
                </ul>
              </Prose>
            </Section>
          </Card>
        ) : null}

        {/* Garantia RF-014: nenhum telefone/WhatsApp transita nesta resposta. */}
        <ContactRequestEntry
          listingId={listing.id}
          state={entryState}
          ownRequestId={entry.ownRequestId}
        />

        <HowItWorks />
      </Stack>
    </PageContainer>
  );
}
