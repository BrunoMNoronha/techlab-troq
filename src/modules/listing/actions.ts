'use server';

import { validateSession } from '@/modules/identity';
import { mediaPath } from '@/modules/media/media-path';
import { getPrismaClient } from '@/persistence/prisma';
import type { ListingStatus } from '@/generated/prisma/client';
import { isUuid } from './ids';
import { lockOwnedListing, transitionListing, type LifecycleResult } from './lifecycle';
import { publicDescription, publicTitle, publicTradeOption } from './public-content';
import { normalizePublicFeedQuery } from './public-query';
import {
  EMPTY_TRADE_OPTIONS,
  toTradeOptionSlots,
  validateListingContent,
  validateListingPatch,
  validateTradeOptions,
  type ListingFieldErrors,
  type TradeOptionSlots,
} from './validation';

export interface CreateListingInput {
  category?: string | null;
  title: string;
  description: string;
  city: string;
  state: string;
  /** As tres posicoes, na ordem do formulario; no rascunho podem ficar vazias. */
  tradeOptions?: string[];
}

export interface UpdateListingInput {
  /** Ausente preserva; null/vazio limpa apenas rascunhos. */
  category?: string | null;
  title?: string;
  description?: string;
  city?: string;
  state?: string;
  /** Ausente mantem as gravadas; presente substitui as tres posicoes. */
  tradeOptions?: string[];
}

export interface ListingDTO {
  category: string | null;
  id: string;
  title: string;
  description: string;
  city: string;
  state: string;
  /** As tres posicoes, na ordem gravada; `''` e posicao ainda nao preenchida. */
  tradeOptions: TradeOptionSlots;
  status: ListingStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Motivo de falha das actions privadas. `not_found` cobre, com a mesma
 * resposta, anuncio inexistente, identificador malformado e anuncio alheio
 * (listing-contract.md, secao 7): nenhuma resposta revela que um ID de outra
 * conta existe.
 */
export type ListingFailureReason =
  'unauthenticated' | 'validation' | 'not_found' | 'not_editable' | 'error';

export interface ListingMutationResult {
  success: boolean;
  reason?: ListingFailureReason;
  error?: string;
  fieldErrors?: ListingFieldErrors;
  listingId?: string;
}

/** Estados em que o dono edita o conteudo (listing-lifecycle.md, secao 3). */
const EDITABLE_STATUSES: ListingStatus[] = ['draft', 'published', 'paused'];

const MESSAGES = {
  unauthenticated: 'É necessário estar autenticado e com e-mail verificado.',
  validation: 'Revise os campos destacados.',
  notFound: 'Anúncio não encontrado.',
  notEditable: 'Anúncios encerrados ou removidos não podem ser editados.',
  emptyPatch: 'Nenhuma alteração informada.',
  createError: 'Não foi possível salvar o rascunho. Tente novamente.',
  updateError: 'Não foi possível salvar as alterações. Tente novamente.',
  loadError: 'Não foi possível carregar o anúncio. Tente novamente.',
  listError: 'Não foi possível carregar seus anúncios. Tente novamente.',
} as const;

function notFound(): { success: false; reason: 'not_found'; error: string } {
  return { success: false, reason: 'not_found', error: MESSAGES.notFound };
}

const TRADE_OPTIONS_SELECT = {
  orderBy: { position: 'asc' },
  select: { position: true, label: true },
} as const;

const OWNER_LISTING_SELECT = {
  id: true,
  title: true,
  description: true,
  city: true,
  uf: true,
  category: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  tradeOptions: TRADE_OPTIONS_SELECT,
} as const;

function toListingDTO(item: {
  id: string;
  title: string;
  description: string;
  city: string;
  uf: string;
  category: string | null;
  status: ListingStatus;
  createdAt: Date;
  updatedAt: Date;
  tradeOptions: { position: number; label: string }[];
}): ListingDTO {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    city: item.city,
    state: item.uf,
    category: item.category ?? null,
    tradeOptions: toTradeOptionSlots(item.tradeOptions),
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** `tradeOptions` da entrada, lida de objeto arbitrario (Server Action). */
function tradeOptionsInput(input: unknown): unknown {
  return input !== null && typeof input === 'object'
    ? (input as Record<string, unknown>).tradeOptions
    : undefined;
}

/** Linhas a gravar: so as posicoes preenchidas, com a posicao do formulario. */
function tradeOptionRows(slots: TradeOptionSlots): { position: number; label: string }[] {
  return slots
    .map((label, index) => ({ position: index + 1, label }))
    .filter((row) => row.label.length > 0);
}

/** Falha de dominio da edicao, lancada para desfazer a transacao inteira. */
class EditAbort extends Error {
  constructor(
    readonly reason: 'not_found' | 'not_editable' | 'validation',
    readonly fieldErrors?: ListingFieldErrors,
  ) {
    super(reason);
  }
}

/**
 * Cria um novo anuncio, sempre em `draft` (listing-contract.md, secao 4.1).
 * Dono vem da sessao; status e definido aqui; so os quatro campos de conteudo
 * e as alternativas de troca sao lidos da entrada. As alternativas podem ficar
 * incompletas no rascunho (secao 3.1). Exige sessao valida, e-mail verificado e
 * conta ativa.
 */
export async function createDraftListing(
  input: CreateListingInput,
): Promise<ListingMutationResult> {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, reason: 'unauthenticated', error: MESSAGES.unauthenticated };
  }

  const validation = validateListingContent(input);
  const rawOptions = tradeOptionsInput(input);
  const options =
    rawOptions === undefined
      ? ({ ok: true, data: EMPTY_TRADE_OPTIONS } as const)
      : validateTradeOptions(rawOptions, false);
  if (!validation.ok || !options.ok) {
    return {
      success: false,
      reason: 'validation',
      error: MESSAGES.validation,
      fieldErrors: {
        ...(validation.ok ? {} : validation.fieldErrors),
        ...(options.ok ? {} : options.fieldErrors),
      },
    };
  }

  try {
    // Criacao aninhada: o anuncio e as alternativas entram juntos ou nada entra.
    const listing = await getPrismaClient().listing.create({
      data: {
        ...validation.data,
        ownerId: sessionResult.user.id,
        status: 'draft',
        tradeOptions: { create: tradeOptionRows(options.data) },
      },
      select: { id: true },
    });

    return { success: true, listingId: listing.id };
  } catch (err) {
    console.error('[Create Listing Error]', err);
    return { success: false, reason: 'error', error: MESSAGES.createError };
  }
}

/**
 * Atualiza o conteudo de um anuncio proprio em estado editavel.
 *
 * Tudo acontece numa transacao, sob a trava de linha do anuncio ja filtrada
 * pelo dono -- a mesma das transicoes (lifecycle.ts). Estado e alternativas sao
 * lidos depois da trava: nao ha janela em que uma transicao para
 * `closed`/`removed` permita escrever em estado terminal, nem em que publicar e
 * esvaziar uma alternativa se cruzem. Anuncio `published`/`paused` so aceita o
 * resultado com as tres alternativas preenchidas (secao 3.1). A forma da
 * entrada e validada antes de qualquer acesso ao banco, e anuncio alheio
 * responde como inexistente.
 */
export async function updateListing(
  listingId: string,
  input: UpdateListingInput,
): Promise<ListingMutationResult> {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, reason: 'unauthenticated', error: MESSAGES.unauthenticated };
  }

  const validation = validateListingPatch(input);
  const rawOptions = tradeOptionsInput(input);
  const options = rawOptions === undefined ? undefined : validateTradeOptions(rawOptions, false);
  if (!validation.ok || (options && !options.ok)) {
    return {
      success: false,
      reason: 'validation',
      error: MESSAGES.validation,
      fieldErrors: {
        ...(validation.ok ? {} : validation.fieldErrors),
        ...(options && !options.ok ? options.fieldErrors : {}),
      },
    };
  }

  const newOptions = options?.ok ? options.data : undefined;
  if (Object.keys(validation.data).length === 0 && newOptions === undefined) {
    return { success: false, reason: 'validation', error: MESSAGES.emptyPatch };
  }

  if (!isUuid(listingId)) {
    return notFound();
  }

  const ownerId = sessionResult.user.id;

  try {
    await getPrismaClient().$transaction(async (tx) => {
      const listing = await lockOwnedListing(tx, listingId, ownerId);
      if (!listing) throw new EditAbort('not_found');
      if (!EDITABLE_STATUSES.includes(listing.status)) throw new EditAbort('not_editable');

      // Anuncio publico ou pausado nunca fica sem as tres alternativas,
      // inclusive o anterior a #76, que as completa na primeira edicao. O
      // conteudo RESULTANTE inteiro e revalidado: o legado com contato gravado
      // antes de DEC-049 (#86) corrige o campo na primeira edicao, mesmo que
      // ela so mude outro campo (secao 10.2).
      if (listing.status !== 'draft') {
        const resulting =
          newOptions ??
          toTradeOptionSlots(
            await tx.listingTradeOption.findMany({
              where: { listingId },
              select: { position: true, label: true },
            }),
          );
        const complete = validateTradeOptions(resulting, true);
        const content = validateListingContent(
          {
            title: validation.data.title ?? listing.title,
            description: validation.data.description ?? listing.description,
            city: validation.data.city ?? listing.city,
            state: validation.data.uf ?? listing.uf,
            category:
              validation.data.category === undefined ? listing.category : validation.data.category,
          },
          true,
        );
        if (!complete.ok || !content.ok) {
          throw new EditAbort('validation', {
            ...(content.ok ? {} : content.fieldErrors),
            ...(complete.ok ? {} : complete.fieldErrors),
          });
        }
      }

      await tx.listing.update({
        where: { id: listingId },
        data: { ...validation.data, updatedAt: new Date() },
      });

      if (newOptions) {
        await tx.listingTradeOption.deleteMany({ where: { listingId } });
        await tx.listingTradeOption.createMany({
          data: tradeOptionRows(newOptions).map((row) => ({ ...row, listingId })),
        });
      }
    });

    return { success: true, listingId };
  } catch (err) {
    if (err instanceof EditAbort) {
      if (err.reason === 'not_found') return notFound();
      if (err.reason === 'not_editable') {
        return { success: false, reason: 'not_editable', error: MESSAGES.notEditable };
      }
      return {
        success: false,
        reason: 'validation',
        error: MESSAGES.validation,
        fieldErrors: err.fieldErrors,
      };
    }
    console.error('[Update Listing Error]', err);
    return { success: false, reason: 'error', error: MESSAGES.updateError };
  }
}

/**
 * Consulta todos os anuncios do usuario autenticado ("Meus anuncios"), em
 * qualquer dos cinco estados. Falha de consulta e erro, nunca lista vazia.
 */
export async function getOwnerListings(): Promise<{
  success: boolean;
  listings?: ListingDTO[];
  reason?: ListingFailureReason;
  error?: string;
}> {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, reason: 'unauthenticated', error: MESSAGES.unauthenticated };
  }

  try {
    const dbListings = await getPrismaClient().listing.findMany({
      where: { ownerId: sessionResult.user.id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: OWNER_LISTING_SELECT,
    });

    return { success: true, listings: dbListings.map(toListingDTO) };
  } catch (err) {
    console.error('[Owner Listings Error]', err);
    return { success: false, reason: 'error', error: MESSAGES.listError };
  }
}

/**
 * Consulta um anuncio proprio para a area privada (edicao ou historico).
 * A busca ja e filtrada pelo dono: anuncio alheio, inexistente ou com ID
 * malformado recebem exatamente a mesma resposta `not_found`.
 */
export async function getListingForEdit(listingId: string): Promise<{
  success: boolean;
  listing?: ListingDTO;
  reason?: ListingFailureReason;
  error?: string;
}> {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, reason: 'unauthenticated', error: MESSAGES.unauthenticated };
  }

  if (!isUuid(listingId)) {
    return notFound();
  }

  try {
    const listing = await getPrismaClient().listing.findFirst({
      where: { id: listingId, ownerId: sessionResult.user.id },
      select: OWNER_LISTING_SELECT,
    });

    return listing ? { success: true, listing: toListingDTO(listing) } : notFound();
  } catch (err) {
    console.error('[Get Listing For Edit Error]', err);
    return { success: false, reason: 'error', error: MESSAGES.loadError };
  }
}

/*
 * Ciclo de vida pelo dono, T1 a T6 (F2-010, #48). Toda regra -- sessao, posse,
 * trava, estado, conteudo, imagem pronta, aceite e auditoria -- vive em
 * lifecycle.ts; aqui so ha a fronteira chamavel pelo cliente.
 */

/** T1 `draft` -> `published`, com o aceite expresso da declaracao de conformidade. */
export async function publishListing(
  listingId: string,
  complianceAccepted: boolean,
): Promise<LifecycleResult> {
  return transitionListing(listingId, 'publish', { complianceAccepted });
}

/** T3 `published` -> `paused`. */
export async function pauseListing(listingId: string): Promise<LifecycleResult> {
  return transitionListing(listingId, 'pause');
}

/** T4 `paused` -> `published`; exige ao menos uma imagem pronta. */
export async function reactivateListing(listingId: string): Promise<LifecycleResult> {
  return transitionListing(listingId, 'reactivate');
}

// T5/T6 nao fica aqui: o encerramento precisa do efeito do modulo `request`
// sobre as reservas (DM-6.10), e `listing` nao importa `request`. A action
// exposta e `closeListing`, de src/app/anuncios/actions.ts (F3-003).

/** T2 `draft` -> `closed` (descarte). Irreversivel; a tela exige confirmacao. */
export async function discardDraft(listingId: string): Promise<LifecycleResult> {
  return transitionListing(listingId, 'discard');
}

export interface PublicListingFeedItem {
  category: string | null;
  id: string;
  title: string;
  description: string;
  city: string;
  state: string;
  createdAt: Date;
  images: {
    id: string;
    position: number;
    derivatives: {
      kind: 'thumb' | 'medium' | 'large';
      url: string;
      width: number;
      height: number;
    }[];
  }[];
}

/**
 * Detalhe publico: o item do feed mais as alternativas de troca, so os textos e
 * na ordem do anunciante (listing-contract.md, 6.1). Anuncio anterior a #76
 * ainda nao completado vem com lista vazia (secao 17.3).
 */
export interface PublicListingDetail extends PublicListingFeedItem {
  tradeOptions: string[];
}

export interface PublicFeedPage {
  listings: PublicListingFeedItem[];
  /** Somente anuncios visiveis (secao 7), com os mesmos filtros. */
  total: number;
  /** Valores aplicados apos a normalizacao (9.3). */
  page: number;
  limit: number;
}

const MAX_PUBLIC_FEED_OFFSET = 2_147_483_647;

/**
 * Retorna o feed publico de anuncios (somente PUBLISHED de contas ACTIVE).
 * Garantia estrita RF-014: zero vazamento de dados de contato ou identificadores privados.
 *
 * Os parametros sao normalizados AQUI (listing-contract.md, secao 9.1), e nao so
 * na pagina: esta funcao e exportada de um modulo 'use server' e pode ser
 * chamada como Server Action com argumentos arbitrarios. A resposta devolve
 * `page`/`limit` efetivamente aplicados (9.3).
 */
export async function getPublicFeed(options?: {
  page?: number;
  limit?: number;
  city?: string;
  state?: string;
}): Promise<PublicFeedPage> {
  const { page, limit, city, state } = normalizePublicFeedQuery(options);

  // UF fora do formato de duas letras nao corresponde a nenhum anuncio (9.1).
  if (state === null) {
    return { listings: [], total: 0, page, limit };
  }

  const prisma = getPrismaClient();

  const whereClause: {
    status: 'published';
    owner: { status: 'active' };
    city?: { equals: string; mode: 'insensitive' };
    uf?: { equals: string; mode: 'insensitive' };
  } = {
    status: 'published',
    owner: { status: 'active' },
  };

  if (city !== undefined) {
    whereClause.city = { equals: city, mode: 'insensitive' };
  }

  if (state !== undefined) {
    whereClause.uf = { equals: state, mode: 'insensitive' };
  }

  // Deslocamento acima de int32 esta, por construcao, alem da ultima pagina:
  // basta a contagem, sem mandar ao banco um OFFSET que ele poderia recusar.
  if (page - 1 > Math.floor(MAX_PUBLIC_FEED_OFFSET / limit)) {
    const total = await prisma.listing.count({ where: whereClause });
    return { listings: [], total, page, limit };
  }

  const [dbListings, total] = await prisma.$transaction([
    prisma.listing.findMany({
      where: whereClause,
      // Ordem total e deterministica (9.2): o desempate por id impede que a
      // paginacao repita ou omita anuncios com o mesmo createdAt.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        city: true,
        uf: true,
        category: true,
        createdAt: true,
        images: {
          where: { status: 'ready' },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            position: true,
            derivatives: {
              select: {
                kind: true,
                width: true,
                height: true,
              },
            },
          },
        },
      },
    }),
    prisma.listing.count({ where: whereClause }),
  ]);

  // Conteudo legado com contato sai mascarado, campo a campo (secao 10.2).
  const listings: PublicListingFeedItem[] = dbListings.map((item) => ({
    id: item.id,
    title: publicTitle(item.title),
    description: publicDescription(item.description),
    city: item.city,
    state: item.uf,
    category: item.category ?? null,
    createdAt: item.createdAt,
    images: item.images.map((img) => ({
      id: img.id,
      position: img.position,
      derivatives: img.derivatives.map((d) => ({
        kind: d.kind as 'thumb' | 'medium' | 'large',
        url: mediaPath(img.id, d.kind),
        width: d.width,
        height: d.height,
      })),
    })),
  }));

  return { listings, total, page, limit };
}

/**
 * Consulta a pagina publica de detalhe de um anuncio.
 * Se o anuncio nao estiver published ou a conta do dono estiver inativa, retorna null.
 */
export async function getPublicListingDetail(
  listingId: string,
): Promise<PublicListingDetail | null> {
  // ID fora do formato UUID (URL adulterada) e tratado como anuncio inexistente,
  // em vez de erro de consulta na coluna uuid.
  if (!isUuid(listingId)) {
    return null;
  }

  const prisma = getPrismaClient();

  const item = await prisma.listing.findFirst({
    where: {
      id: listingId,
      status: 'published',
      owner: { status: 'active' },
    },
    select: {
      id: true,
      title: true,
      description: true,
      city: true,
      uf: true,
      category: true,
      createdAt: true,
      tradeOptions: TRADE_OPTIONS_SELECT,
      images: {
        where: { status: 'ready' },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          position: true,
          derivatives: {
            select: {
              kind: true,
              width: true,
              height: true,
            },
          },
        },
      },
    },
  });

  if (!item) {
    return null;
  }

  return {
    id: item.id,
    title: publicTitle(item.title),
    description: publicDescription(item.description),
    city: item.city,
    state: item.uf,
    category: item.category ?? null,
    tradeOptions: item.tradeOptions.map((option) => publicTradeOption(option.label)),
    createdAt: item.createdAt,
    images: item.images.map((img) => ({
      id: img.id,
      position: img.position,
      derivatives: img.derivatives.map((d) => ({
        kind: d.kind as 'thumb' | 'medium' | 'large',
        url: mediaPath(img.id, d.kind),
        width: d.width,
        height: d.height,
      })),
    })),
  };
}
