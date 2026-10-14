import { productCategoryLabel } from '@/modules/listing/categories';
import { MediaFrame } from '@/components/data-display';
import { Progress } from '@/components/feedback';
import { Cluster, Stack } from '@/components/layout';
import { Badge, Card, CardBody, CardFooter, CardLink, Heading, Text } from '@/components/ui';
import type { PublicListingFeedItem } from '@/modules/listing';
import { SLOTS_PER_LISTING } from '@/modules/request';
import { ContactRequestCardAction } from './contact-request-card-action';
import { derivativeSrcSet, listingImageAlt, pickDerivative } from './listing-image';

// Card de oferta publica, compartilhado pela home e por /explorar. Recebe apenas
// a projecao publica do anuncio (sem dono, sem contato) e, desde DEC-056, as
// vagas livres e a solicitacao de contato no proprio card.
//
// O titulo e o link do card (CardLink cobre o cartao inteiro); o botao de
// solicitacao fica no rodape, fora do link, sem interativo aninhado.
export function ListingCard({
  item,
  freeSlots,
}: {
  item: PublicListingFeedItem;
  /** Vagas livres agora (DEC-056); ausente quando a contagem falhou. */
  freeSlots?: number;
}) {
  // Imagem pela rota autorizada /media (sem Image Optimization: o cache
  // transformado sobreviveria a revogacao; media-pipeline-contract.md, 9.2).
  const cover = item.images[0];
  const coverImage = cover ? pickDerivative(cover.derivatives, 'medium') : null;
  const category = item.category ? productCategoryLabel(item.category) : null;

  return (
    <Card as="article" interactive media>
      <MediaFrame ratio="wide">
        {cover && coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage.url}
            srcSet={derivativeSrcSet(cover.derivatives)}
            sizes="(min-width: 1040px) 330px, (min-width: 600px) 50vw, 100vw"
            width={coverImage.width}
            height={coverImage.height}
            alt={listingImageAlt(item.title, 0, item.images.length)}
            loading="lazy"
          />
        ) : null}
      </MediaFrame>

      <CardBody>
        <Cluster justify="between" align="start" gap={2}>
          <Heading level={3} size="h4" wrapAnywhere>
            <CardLink href={`/explorar/${item.id}`}>{item.title}</CardLink>
          </Heading>
          {category && <Badge>{category}</Badge>}
        </Cluster>
        <Text size="small" tone="muted" clamp={2} wrapAnywhere>
          {item.description}
        </Text>
        <Text size="small" tone="muted" icon="map-pin">
          {item.city} - {item.state}
        </Text>

        {item.tradeOptions.length > 0 && (
          <Stack gap={1}>
            <Text size="small" weight="semibold">
              Aceita em troca
            </Text>
            <Cluster as="ul" gap={1}>
              {item.tradeOptions.map((option, index) => (
                <li key={index}>
                  <Badge tone="accent">{option}</Badge>
                </li>
              ))}
            </Cluster>
          </Stack>
        )}

        <CardFooter>
          <Stack gap={3}>
            {freeSlots !== undefined && (
              <Progress
                label="Vagas livres"
                value={freeSlots}
                max={SLOTS_PER_LISTING}
                valueText={`${freeSlots} de ${SLOTS_PER_LISTING}`}
              />
            )}
            <ContactRequestCardAction
              listingId={item.id}
              listingTitle={item.title}
              freeSlots={freeSlots}
            />
          </Stack>
        </CardFooter>
      </CardBody>
    </Card>
  );
}
