import { Alert, EmptyState, Skeleton } from '@/components/feedback';
import { Grid, Stack } from '@/components/layout';
import { Text, TextLink } from '@/components/ui';
import { getPublicFeed } from '@/modules/listing';
import { ListingCard } from './listing-card';

// Ofertas exibidas na home: primeira pagina do feed publico (#43/#49), com a
// mesma ordenacao (mais recentes primeiro) e a mesma regra de visibilidade.
export const HOME_OFFERS_LIMIT = 12;

export async function LatestOffers() {
  let feed: Awaited<ReturnType<typeof getPublicFeed>>;
  try {
    feed = await getPublicFeed({ page: 1, limit: HOME_OFFERS_LIMIT });
  } catch (err) {
    console.error('[Home] falha ao carregar ofertas publicas', err);
    return (
      <Alert tone="error" role="alert">
        <p>
          Não foi possível carregar as ofertas agora. Tente novamente em instantes ou{' '}
          <TextLink href="/explorar">abra a página de ofertas</TextLink>.
        </p>
      </Alert>
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
    <Stack gap={6}>
      <Grid columns="md">
        {feed.listings.map((item) => (
          <ListingCard key={item.id} item={item} />
        ))}
      </Grid>
      {feed.total > feed.listings.length && (
        <p>
          <TextLink href="/explorar" iconEnd="arrow-right">
            Ver todas as {feed.total} ofertas
          </TextLink>
        </p>
      )}
    </Stack>
  );
}

export function OffersLoading() {
  return (
    <Stack role="status" aria-live="polite" gap={4}>
      <Text size="small" tone="muted">
        Carregando ofertas…
      </Text>
      <Grid columns="md">
        {[0, 1, 2].map((slot) => (
          <Stack key={slot} gap={2}>
            <Skeleton variant="media" />
            <Skeleton variant="title" />
            <Skeleton lines={2} />
          </Stack>
        ))}
      </Grid>
    </Stack>
  );
}
