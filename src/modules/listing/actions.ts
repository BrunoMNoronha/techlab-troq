'use server';

import { validateSession } from '@/modules/identity';
import { getPrismaClient } from '@/persistence/prisma';
import type { ListingStatus } from '@/generated/prisma/client';
import { isUuid } from './ids';

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
 * Cria um novo anuncio obrigatoriamente no status DRAFT.
 * Exige sessao autenticada e e-mail verificado.
 */
export async function createDraftListing(
  input: CreateListingInput,
): Promise<{ success: boolean; error?: string; listingId?: string }> {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    return {
      success: false,
      error: 'É necessário estar autenticado e com e-mail verificado para criar anúncios.',
    };
  }

  const { title, description, city, state } = input;

  if (!title || title.trim().length < 5 || title.trim().length > 60) {
    return { success: false, error: 'O título deve ter entre 5 e 60 caracteres.' };
  }

  if (!description || description.trim().length > 1000) {
    return { success: false, error: 'A descrição não pode ter mais de 1000 caracteres.' };
  }

  const cleanCity = city ? city.trim() : '';
  const cleanUf = state ? state.trim().toUpperCase() : '';

  if (!cleanCity || !cleanUf || cleanUf.length !== 2) {
    return { success: false, error: 'Informe a Cidade e a UF (2 letras).' };
  }

  const prisma = getPrismaClient();

  try {
    const listing = await prisma.listing.create({
      data: {
        ownerId: sessionResult.user.id,
        title: title.trim(),
        description: description.trim(),
        city: cleanCity,
        uf: cleanUf,
        status: 'draft',
      },
    });

    return { success: true, listingId: listing.id };
  } catch (err) {
    console.error('[Create Listing Error]', err);
    return { success: false, error: 'Erro ao salvar rascunho do anúncio.' };
  }
}

/**
 * Atualiza os campos editaveis de um anuncio.
 * Restrito ao proprietario do anuncio. Estados terminais (CLOSED, REMOVED) sao estritamente somente-leitura.
 */
export async function updateListing(
  listingId: string,
  input: UpdateListingInput,
): Promise<{ success: boolean; error?: string }> {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, error: 'Não autorizado.' };
  }

  const prisma = getPrismaClient();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing) {
    return { success: false, error: 'Anúncio não encontrado.' };
  }

  if (listing.ownerId !== sessionResult.user.id) {
    return { success: false, error: 'Você não tem permissão para editar este anúncio.' };
  }

  if (listing.status === 'closed' || listing.status === 'removed') {
    return { success: false, error: 'Anúncios encerrados ou removidos não podem ser editados.' };
  }

  const updateData: {
    title?: string;
    description?: string;
    city?: string;
    uf?: string;
  } = {};

  if (input.title !== undefined) {
    if (input.title.trim().length < 5 || input.title.trim().length > 60) {
      return { success: false, error: 'O título deve ter entre 5 e 60 caracteres.' };
    }
    updateData.title = input.title.trim();
  }

  if (input.description !== undefined) {
    if (input.description.trim().length > 1000) {
      return { success: false, error: 'A descrição não pode ter mais de 1000 caracteres.' };
    }
    updateData.description = input.description.trim();
  }

  if (input.city !== undefined) {
    updateData.city = input.city.trim();
  }

  if (input.state !== undefined) {
    updateData.uf = input.state.trim().toUpperCase();
  }

  try {
    await prisma.listing.update({
      where: { id: listingId },
      data: updateData,
    });

    return { success: true };
  } catch (err) {
    console.error('[Update Listing Error]', err);
    return { success: false, error: 'Erro ao atualizar o anúncio.' };
  }
}

/**
 * Consulta todos os anuncios pertencentes ao usuario autenticado ("Meus Anuncios").
 */
export async function getOwnerListings(): Promise<{
  success: boolean;
  listings?: ListingDTO[];
  error?: string;
}> {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, error: 'Não autorizado.' };
  }

  const prisma = getPrismaClient();

  const dbListings = await prisma.listing.findMany({
    where: { ownerId: sessionResult.user.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      city: true,
      uf: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const listings: ListingDTO[] = dbListings.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    city: item.city,
    state: item.uf,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  return { success: true, listings };
}

/**
 * Consulta um anuncio especifico para edicao, garantindo propriedade.
 */
export async function getListingForEdit(
  listingId: string,
): Promise<{ success: boolean; listing?: ListingDTO; error?: string }> {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, error: 'Não autorizado.' };
  }

  const prisma = getPrismaClient();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      ownerId: true,
      title: true,
      description: true,
      city: true,
      uf: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!listing) {
    return { success: false, error: 'Anúncio não encontrado.' };
  }

  if (listing.ownerId !== sessionResult.user.id) {
    return { success: false, error: 'Você não tem permissão para acessar este anúncio.' };
  }

  const listingDto: ListingDTO = {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    city: listing.city,
    state: listing.uf,
    status: listing.status,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  };

  return { success: true, listing: listingDto };
}

/**
 * Publica um anuncio em rascunho (T1: draft -> published).
 * Exige aceite de termos de conformidade e pelo menos 1 imagem pronta.
 */
export async function publishListing(
  listingId: string,
  complianceAccepted: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (!complianceAccepted) {
    return {
      success: false,
      error: 'É necessário declarar conformidade com os Termos e Itens Proibidos.',
    };
  }

  const sessionResult = await validateSession();
  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, error: 'Não autorizado.' };
  }

  const prisma = getPrismaClient();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { images: { where: { status: 'ready' } } },
  });

  if (!listing) {
    return { success: false, error: 'Anúncio não encontrado.' };
  }

  if (listing.ownerId !== sessionResult.user.id) {
    return { success: false, error: 'Não autorizado.' };
  }

  if (listing.status !== 'draft') {
    return { success: false, error: 'Apenas rascunhos podem ser publicados.' };
  }

  if (listing.images.length === 0) {
    return {
      success: false,
      error: 'É necessário ter pelo menos uma imagem processada para publicar o anúncio.',
    };
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.listing.update({
      where: { id: listingId },
      data: {
        status: 'published',
        publishedAt: now,
      },
    }),
    prisma.termsAcceptance.create({
      data: {
        userId: sessionResult.user.id,
        listingId,
        type: 'listing_compliance',
        termsVersion: '1.0',
        acceptedAt: now,
      },
    }),
    prisma.listingTransition.create({
      data: {
        listingId,
        actorId: sessionResult.user.id,
        fromStatus: 'draft',
        toStatus: 'published',
        occurredAt: now,
      },
    }),
  ]);

  return { success: true };
}

/**
 * Pausa um anuncio publicado (T3: published -> paused).
 */
export async function pauseListing(
  listingId: string,
): Promise<{ success: boolean; error?: string }> {
  const sessionResult = await validateSession();
  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, error: 'Não autorizado.' };
  }

  const prisma = getPrismaClient();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing || listing.ownerId !== sessionResult.user.id) {
    return { success: false, error: 'Anúncio não encontrado ou acesso não autorizado.' };
  }

  if (listing.status !== 'published') {
    return { success: false, error: 'Apenas anúncios publicados podem ser pausados.' };
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.listing.update({
      where: { id: listingId },
      data: { status: 'paused', pausedAt: now },
    }),
    prisma.listingTransition.create({
      data: {
        listingId,
        actorId: sessionResult.user.id,
        fromStatus: 'published',
        toStatus: 'paused',
        occurredAt: now,
      },
    }),
  ]);

  return { success: true };
}

/**
 * Reativa um anuncio pausado (T4: paused -> published).
 */
export async function reactivateListing(
  listingId: string,
): Promise<{ success: boolean; error?: string }> {
  const sessionResult = await validateSession();
  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, error: 'Não autorizado.' };
  }

  const prisma = getPrismaClient();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing || listing.ownerId !== sessionResult.user.id) {
    return { success: false, error: 'Anúncio não encontrado ou acesso não autorizado.' };
  }

  if (listing.status !== 'paused') {
    return { success: false, error: 'Apenas anúncios pausados podem ser reativados.' };
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.listing.update({
      where: { id: listingId },
      data: { status: 'published' },
    }),
    prisma.listingTransition.create({
      data: {
        listingId,
        actorId: sessionResult.user.id,
        fromStatus: 'paused',
        toStatus: 'published',
        occurredAt: now,
      },
    }),
  ]);

  return { success: true };
}

/**
 * Encerra um anuncio (T5: published/paused -> closed).
 */
export async function closeListing(
  listingId: string,
): Promise<{ success: boolean; error?: string }> {
  const sessionResult = await validateSession();
  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, error: 'Não autorizado.' };
  }

  const prisma = getPrismaClient();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing || listing.ownerId !== sessionResult.user.id) {
    return { success: false, error: 'Anúncio não encontrado ou acesso não autorizado.' };
  }

  if (listing.status !== 'published' && listing.status !== 'paused') {
    return {
      success: false,
      error: 'Apenas anúncios publicados ou pausados podem ser encerrados.',
    };
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.listing.update({
      where: { id: listingId },
      data: { status: 'closed', closedAt: now },
    }),
    prisma.listingTransition.create({
      data: {
        listingId,
        actorId: sessionResult.user.id,
        fromStatus: listing.status,
        toStatus: 'closed',
        occurredAt: now,
      },
    }),
  ]);

  return { success: true };
}

/**
 * Descarta um rascunho de anuncio (T2: draft -> removed).
 */
export async function discardDraft(
  listingId: string,
): Promise<{ success: boolean; error?: string }> {
  const sessionResult = await validateSession();
  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, error: 'Não autorizado.' };
  }

  const prisma = getPrismaClient();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
  });

  if (!listing || listing.ownerId !== sessionResult.user.id) {
    return { success: false, error: 'Anúncio não encontrado ou acesso não autorizado.' };
  }

  if (listing.status !== 'draft') {
    return { success: false, error: 'Apenas rascunhos podem ser descartados.' };
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.listing.update({
      where: { id: listingId },
      data: { status: 'removed', removedAt: now },
    }),
    prisma.listingTransition.create({
      data: {
        listingId,
        actorId: sessionResult.user.id,
        fromStatus: 'draft',
        toStatus: 'removed',
        occurredAt: now,
      },
    }),
  ]);

  return { success: true };
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
  const mediaBaseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || 'https://media.example.invalid';

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
                objectKey: true,
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
        url: `${mediaBaseUrl}/${d.objectKey}`,
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
  const mediaBaseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || 'https://media.example.invalid';

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
              objectKey: true,
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
        url: `${mediaBaseUrl}/${d.objectKey}`,
        width: d.width,
        height: d.height,
      })),
    })),
  };
}
