'use server';

import { validateSession } from '@/modules/identity';
import { getPrismaClient } from '@/persistence/prisma';
import type { ListingStatus } from '@/generated/prisma/client';

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
