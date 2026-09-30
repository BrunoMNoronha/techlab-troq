'use server';

import { validateSession } from '@/modules/identity';
import { mediaPath } from '@/modules/media/media-path';
import { getPrismaClient } from '@/persistence/prisma';
import type { ListingStatus } from '@/generated/prisma/client';
import { isUuid } from './ids';
import { transitionListing, type LifecycleResult } from './lifecycle';
import {
  validateListingContent,
  validateListingPatch,
  type ListingFieldErrors,
} from './validation';

export interface CreateListingInput {
  title: string;
  description: string;
  city: string;
  state: string;
}

export interface UpdateListingInput {
  title?: string;
  description?: string;
  city?: string;
  state?: string;
}

export interface ListingDTO {
  id: string;
  title: string;
  description: string;
  city: string;
  state: string;
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

const OWNER_LISTING_SELECT = {
  id: true,
  title: true,
  description: true,
  city: true,
  uf: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toListingDTO(item: {
  id: string;
  title: string;
  description: string;
  city: string;
  uf: string;
  status: ListingStatus;
  createdAt: Date;
  updatedAt: Date;
}): ListingDTO {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    city: item.city,
    state: item.uf,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/**
 * Cria um novo anuncio, sempre em `draft` (listing-contract.md, secao 4.1).
 * Dono vem da sessao; status e definido aqui; so os quatro campos de conteudo
 * sao lidos da entrada. Exige sessao valida, e-mail verificado e conta ativa.
 */
export async function createDraftListing(
  input: CreateListingInput,
): Promise<ListingMutationResult> {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, reason: 'unauthenticated', error: MESSAGES.unauthenticated };
  }

  const validation = validateListingContent(input);
  if (!validation.ok) {
    return {
      success: false,
      reason: 'validation',
      error: MESSAGES.validation,
      fieldErrors: validation.fieldErrors,
    };
  }

  try {
    const listing = await getPrismaClient().listing.create({
      data: { ...validation.data, ownerId: sessionResult.user.id, status: 'draft' },
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
 * Posse e estado sao condicoes do proprio UPDATE (`id`, `ownerId` e `status`
 * no WHERE): nao ha janela entre verificar e gravar em que uma transicao para
 * `closed`/`removed` permita escrever em estado terminal. A validacao roda antes
 * de qualquer acesso ao banco, e anuncio alheio responde como inexistente.
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
  if (!validation.ok) {
    return {
      success: false,
      reason: 'validation',
      error: MESSAGES.validation,
      fieldErrors: validation.fieldErrors,
    };
  }

  if (Object.keys(validation.data).length === 0) {
    return { success: false, reason: 'validation', error: MESSAGES.emptyPatch };
  }

  if (!isUuid(listingId)) {
    return notFound();
  }

  const ownerId = sessionResult.user.id;
  const prisma = getPrismaClient();

  try {
    const { count } = await prisma.listing.updateMany({
      where: { id: listingId, ownerId, status: { in: EDITABLE_STATUSES } },
      data: validation.data,
    });

    if (count === 1) {
      return { success: true, listingId };
    }

    // Nada foi gravado. A consulta e restrita ao dono: so distingue o proprio
    // anuncio terminal; anuncio alheio e inexistente caem na mesma resposta not_found.
    const own = await prisma.listing.findFirst({
      where: { id: listingId, ownerId },
      select: { id: true },
    });

    return own
      ? { success: false, reason: 'not_editable', error: MESSAGES.notEditable }
      : notFound();
  } catch (err) {
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

/** T5/T6 `published`|`paused` -> `closed`. Irreversivel; a tela exige confirmacao. */
export async function closeListing(listingId: string): Promise<LifecycleResult> {
  return transitionListing(listingId, 'close');
}

/** T2 `draft` -> `closed` (descarte). Irreversivel; a tela exige confirmacao. */
export async function discardDraft(listingId: string): Promise<LifecycleResult> {
  return transitionListing(listingId, 'discard');
}

export interface PublicListingFeedItem {
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
 * Retorna o feed publico de anuncios (somente PUBLISHED de contas ACTIVE).
 * Garantia estrita RF-014: zero vazamento de dados de contato ou identificadores privados.
 */
export async function getPublicFeed(options?: {
  page?: number;
  limit?: number;
  city?: string;
  state?: string;
}): Promise<{ listings: PublicListingFeedItem[]; total: number }> {
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const skip = (page - 1) * limit;

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

  if (options?.city) {
    whereClause.city = { equals: options.city.trim(), mode: 'insensitive' };
  }

  if (options?.state) {
    whereClause.uf = { equals: options.state.trim().toUpperCase(), mode: 'insensitive' };
  }

  const [dbListings, total] = await prisma.$transaction([
    prisma.listing.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        city: true,
        uf: true,
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

  const listings: PublicListingFeedItem[] = dbListings.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    city: item.city,
    state: item.uf,
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

  return { listings, total };
}

/**
 * Consulta a pagina publica de detalhe de um anuncio.
 * Se o anuncio nao estiver published ou a conta do dono estiver inativa, retorna null.
 */
export async function getPublicListingDetail(
  listingId: string,
): Promise<PublicListingFeedItem | null> {
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
  });

  if (!item) {
    return null;
  }

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    city: item.city,
    state: item.uf,
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
