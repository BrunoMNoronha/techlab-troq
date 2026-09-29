import type { ListingDTO } from '@/modules/listing';

type ListingStatus = ListingDTO['status'];

// Nomes de apresentacao dos cinco estados (listing-lifecycle.md, secao 2).
export const LISTING_STATUS_LABELS: Record<
  ListingStatus,
  { label: string; bg: string; color: string }
> = {
  draft: { label: 'Rascunho', bg: '#f3f4f6', color: '#374151' },
  published: { label: 'Publicado', bg: '#dcfce7', color: '#166534' },
  paused: { label: 'Pausado', bg: '#fef3c7', color: '#92400e' },
  closed: { label: 'Encerrado', bg: '#e5e7eb', color: '#374151' },
  removed: { label: 'Removido', bg: '#fee2e2', color: '#991b1b' },
};

/** `draft`, `published` e `paused` sao editaveis pelo dono; `closed`/`removed` sao historico. */
export function isEditableStatus(status: ListingStatus): boolean {
  return status === 'draft' || status === 'published' || status === 'paused';
}
