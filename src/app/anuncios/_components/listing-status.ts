import type { Tone } from '@/components/ui';
import type { ListingDTO } from '@/modules/listing';

type ListingStatus = ListingDTO['status'];

// Nomes de apresentacao dos cinco estados (listing-lifecycle.md, secao 2). O
// tom so reforca o rotulo no `Badge`; o significado esta no texto.
export const LISTING_STATUS_LABELS: Record<ListingStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  published: { label: 'Publicado', tone: 'success' },
  paused: { label: 'Pausado', tone: 'warning' },
  closed: { label: 'Encerrado', tone: 'neutral' },
  removed: { label: 'Removido', tone: 'error' },
};

/** `draft`, `published` e `paused` sao editaveis pelo dono; `closed`/`removed` sao historico. */
export function isEditableStatus(status: ListingStatus): boolean {
  return status === 'draft' || status === 'published' || status === 'paused';
}
