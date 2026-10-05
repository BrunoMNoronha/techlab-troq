import type { ListingStatus } from '@/generated/prisma/client';
import { validateSession } from '@/modules/identity';
import { getListingGate, getListingTitles } from '@/modules/listing';
import { getPrismaClient } from '@/persistence/prisma';

// Acompanhamento da solicitacao pelo PROPRIO solicitante (F3-012, #102).
//
// Somente leitura e so do ator: a solicitacao de outra pessoa, inexistente ou
// com ID malformado devolve `null`, sem distinguir os casos (PD-11.3). Nada
// daqui revela vagas, outras solicitacoes, o anunciante ou dado de pagamento:
// a tela mostra a fase, o prazo e o estado do anuncio de quem ja tem relacao
// com ele. As instrucoes Pix NAO sao lidas aqui: vem do provedor, sob a trava,
// por `getPixPayment` (charge-flow.ts), que recusa anuncio `paused` (PD-6.11).
//
// A fase e derivada do estado persistido e do relogio do BANCO (DM-6.12):
// - `awaiting_payment`: `reserved` e dentro da janela;
// - `window_closed`: ainda `reserved`, mas a janela acabou. A expiracao so e
//   gravada na proxima alocacao (DM-6.3); ate la, um pagamento acreditado DENTRO
//   da janela ainda pode ser reconhecido (PE-4.2);
// - `paid`, `expired` e `failed`: o estado gravado.

export type OwnRequestPhase = 'awaiting_payment' | 'window_closed' | 'paid' | 'expired' | 'failed';

export interface OwnContactRequestView {
  contactRequestId: string;
  listingId: string;
  /** `null` para anuncio removido pela moderacao (o conteudo nao volta a ser exibido). */
  listingTitle: string | null;
  listingStatus: ListingStatus | null;
  phase: OwnRequestPhase;
  /** ISO 8601. */
  reservedUntil: string;
  /** ISO 8601, so em `paid`. */
  paidAt: string | null;
  /** `now()` do banco, ISO 8601, para a contagem do prazo na tela. */
  now: string;
}

export interface OwnContactRequestSummary {
  contactRequestId: string;
  listingId: string;
  listingTitle: string | null;
  phase: OwnRequestPhase;
  /** ISO 8601. */
  createdAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestRow {
  id: string;
  listingId: string;
  status: string;
  reservedUntil: Date;
  paidAt: Date | null;
  createdAt: Date;
  now: Date;
}

export function phaseOf(status: string, reservedUntil: Date, now: Date): OwnRequestPhase {
  switch (status) {
    case 'reserved':
      return reservedUntil > now ? 'awaiting_payment' : 'window_closed';
    case 'paid':
      return 'paid';
    case 'expired':
      return 'expired';
    default:
      return 'failed';
  }
}

/**
 * A solicitacao do ator autenticado, ou `null` sem sessao valida, para ID
 * malformado, inexistente ou de outra pessoa.
 */
export async function getOwnContactRequest(
  contactRequestId: string,
): Promise<OwnContactRequestView | null> {
  if (typeof contactRequestId !== 'string' || !UUID.test(contactRequestId)) return null;
  const session = await validateSession();
  if (!session.isValid || !session.user) return null;

  const [row] = await getPrismaClient().$queryRaw<RequestRow[]>`
    SELECT "id"::text AS "id", "listing_id"::text AS "listingId", "status"::text AS "status",
           "reserved_until" AS "reservedUntil", "paid_at" AS "paidAt",
           "created_at" AS "createdAt", now() AS "now"
    FROM "contact_requests"
    WHERE "id" = ${contactRequestId}::uuid AND "requester_id" = ${session.user.id}::uuid`;
  if (!row) return null;

  const [gate, titles] = await Promise.all([
    getListingGate(row.listingId),
    getListingTitles([row.listingId]),
  ]);
  return {
    contactRequestId: row.id,
    listingId: row.listingId,
    listingTitle: titles.get(row.listingId) ?? null,
    listingStatus: gate?.status ?? null,
    phase: phaseOf(row.status, row.reservedUntil, row.now),
    reservedUntil: row.reservedUntil.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    now: row.now.toISOString(),
  };
}

/** Solicitacoes do ator autenticado, da mais recente para a mais antiga; `null` sem sessao. */
export async function listOwnContactRequests(): Promise<OwnContactRequestSummary[] | null> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return null;

  const rows = await getPrismaClient().$queryRaw<RequestRow[]>`
    SELECT "id"::text AS "id", "listing_id"::text AS "listingId", "status"::text AS "status",
           "reserved_until" AS "reservedUntil", "paid_at" AS "paidAt",
           "created_at" AS "createdAt", now() AS "now"
    FROM "contact_requests"
    WHERE "requester_id" = ${session.user.id}::uuid
    ORDER BY "created_at" DESC
    LIMIT 50`;
  const titles = await getListingTitles([...new Set(rows.map((r) => r.listingId))]);
  return rows.map((row) => ({
    contactRequestId: row.id,
    listingId: row.listingId,
    listingTitle: titles.get(row.listingId) ?? null,
    phase: phaseOf(row.status, row.reservedUntil, row.now),
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Solicitacao ABERTA do ator no anuncio — `reserved` dentro da janela ou
 * `paid` —, para a entrada da jornada levar ao Pix ja gerado em vez de oferecer
 * outra (DEC-041; reservation-limit.md). Sem trava: so orienta a tela.
 */
export async function findOpenRequestOf(
  listingId: string,
  requesterId: string,
): Promise<string | null> {
  const [row] = await getPrismaClient().$queryRaw<{ id: string }[]>`
    SELECT "id"::text AS "id" FROM "contact_requests"
    WHERE "listing_id" = ${listingId}::uuid AND "requester_id" = ${requesterId}::uuid
      AND ("status" = 'paid' OR ("status" = 'reserved' AND "reserved_until" > now()))
    ORDER BY ("status" = 'reserved') DESC, "created_at" DESC
    LIMIT 1`;
  return row?.id ?? null;
}
