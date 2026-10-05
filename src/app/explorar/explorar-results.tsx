import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { Grid, Stack } from '@/components/layout';
import { Pagination } from '@/components/navigation';
import { ButtonLink, Text, TextLink } from '@/components/ui';
import { getPublicFeed, type PublicFeedPage } from '@/modules/listing';
import { ListingCard } from '../_components/listing-card';
import { explorarHref, hasFilter, type ExplorarQuery } from './explorar-query';

// Resultados de /explorar: grade, paginacao e estados de vazio e erro
// (listing-contract.md, secoes 9 e 11). Renderizado dentro de um Suspense da
// propria pagina; nenhum loading.tsx envolve /explorar/[id], cujo 404 precisa
// continuar sendo status HTTP real (doc do Next, loading.md, Status Codes).

export async function ExplorarResults({ query }: { query: ExplorarQuery }) {
  const retryHref = explorarHref(query);
  let feed: PublicFeedPage;
  try {
    feed = await getPublicFeed({ page: query.page, city: query.city, state: query.state });
  } catch (err) {
    console.error('[Explorar] falha ao carregar anuncios publicos', err);
    return (
      <ErrorState
        title="Não foi possível carregar os anúncios agora."
        action={
          <ButtonLink href={retryHref} variant="outline" iconStart="refresh">
            Tentar novamente
          </ButtonLink>
        }
      />
    );
  }

  const filtered = hasFilter(query);
  const clearHref = explorarHref({ page: 1, city: '', state: '' });

  if (feed.total === 0) {
    return filtered ? (
      <EmptyState
        role="status"
        icon="search"
        title="Nenhum anúncio encontrado para esse filtro."
        action={<TextLink href={clearHref}>Remover o filtro e ver todos os anúncios</TextLink>}
      />
    ) : (
      <EmptyState
        role="status"
        title="Ainda não há anúncios publicados."
        description="Volte em breve."
      />
    );
  }

  const lastPage = Math.max(1, Math.ceil(feed.total / feed.limit));

  if (feed.listings.length === 0) {
    // Pagina alem da ultima: lista vazia com o total correto, sem erro (9.1).
    return (
      <EmptyState
        role="status"
        title="Esta página não tem anúncios."
        description={`Há ${feed.total} anúncio(s) em ${lastPage} página(s).`}
        action={
          <TextLink href={explorarHref({ ...query, page: lastPage })}>
            Ir para a última página
          </TextLink>
        }
      />
    );
  }

  return (
    <Stack gap={4}>
      <Text role="status" size="small" tone="muted">
        {feed.total} anúncio(s) disponível(is) · página {feed.page} de {lastPage}
      </Text>
      <Grid columns="md">
        {feed.listings.map((item) => (
          <ListingCard key={item.id} item={item} />
        ))}
      </Grid>
      {lastPage > 1 && (
        <Pagination
          previous={
            feed.page > 1 ? { href: explorarHref({ ...query, page: feed.page - 1 }) } : undefined
          }
          next={
            feed.page < lastPage
              ? { href: explorarHref({ ...query, page: feed.page + 1 }) }
              : undefined
          }
          status={
            <span aria-current="page">
              Página {feed.page} de {lastPage}
            </span>
          }
        />
      )}
    </Stack>
  );
}

export function ExplorarLoading() {
  return (
    <Stack role="status" aria-live="polite" gap={4}>
      <Text size="small" tone="muted">
        Carregando anúncios…
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
