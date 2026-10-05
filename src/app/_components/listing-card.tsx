import { productCategoryLabel } from '@/modules/listing/categories';
import Link from 'next/link';
import { MediaFrame } from '@/components/data-display';
import { Card, CardBody, CardFooter, Heading, Text } from '@/components/ui';
import type { PublicListingFeedItem } from '@/modules/listing';
import { derivativeSrcSet, listingImageAlt, pickDerivative } from './listing-image';

// Card de oferta publica, compartilhado pela home e por /explorar. Recebe apenas
// a projecao publica do anuncio (sem dono, sem contato).
export function ListingCard({ item }: { item: PublicListingFeedItem }) {
  // Imagem pela rota autorizada /media (sem Image Optimization: o cache
  // transformado sobreviveria a revogacao; media-pipeline-contract.md, 9.2).
  const cover = item.images[0];
  const coverImage = cover ? pickDerivative(cover.derivatives, 'medium') : null;

  return (
    <Card as={Link} href={`/explorar/${item.id}`} interactive media>
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
        <Heading level={3} size="h4" wrapAnywhere>
          {item.title}
        </Heading>
        <Text size="small" tone="muted" clamp={2} wrapAnywhere>
          {item.description}
        </Text>
        <Text size="small" tone="muted">
          {productCategoryLabel(item.category)}
        </Text>
        <CardFooter>
          <Text size="small" tone="muted" icon="map-pin">
            {item.city} - {item.state}
          </Text>
        </CardFooter>
      </CardBody>
    </Card>
  );
}
