import { EmptyState, ErrorState } from '@/components/feedback';
import { Grid, Stack } from '@/components/layout';
import { ButtonLink, TextLink } from '@/components/ui';
import { getPublicFeed } from '@/modules/listing';
import { ListingCard } from './listing-card';

// Ofertas exibidas na landing: primeira pagina do feed publico (#43/#49), com a
// mesma ordenacao (mais recentes primeiro) e a mesma regra de visibilidade.
export const HOME_OFFERS_LIMIT = 6;

export async function LatestOffers() {
  let feed: Awaited<ReturnType<typeof getPublicFeed>>;
  try {
    feed = await getPublicFeed({ page: 1, limit: HOME_OFFERS_LIMIT });
  } catch (err) {
    console.error('[Home] falha ao carregar ofertas publicas', err);
    return (
      <ErrorState
        titleAs="h3"
        title="Não foi possível carregar as ofertas agora."
        action={
          <ButtonLink href="/explorar" variant="outline">
            Abrir a página de ofertas
          </ButtonLink>
        }
      />
    );
  }

  if (feed.listings.length === 0) {
    return (
      <EmptyState
        role="status"
        titleAs="h3"
        title="Ainda não há ofertas publicadas."
        description="Volte em breve ou crie uma conta para anunciar."
      />
    );
  }

  return (
    <Stack gap={4}>
      <Grid columns="md">
        {feed.listings.map((item) => (
          <ListingCard key={item.id} item={item} />
        ))}
      </Grid>
      {feed.total > feed.listings.length && (
        <TextLink href="/explorar">Ver todas as {feed.total} ofertas</TextLink>
      )}
    </Stack>
  );
}

export function OffersLoading() {
  return <EmptyState role="status" aria-live="polite" titleAs="h3" title="Carregando ofertas…" />;
}
