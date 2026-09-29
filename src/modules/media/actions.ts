'use server';

import { after } from 'next/server';
import { processPendingImages } from './processor';
import {
  confirmImageUpload as confirmImageUploadCore,
  deleteListingImage as deleteListingImageCore,
  getOwnerListingImages as getOwnerListingImagesCore,
  reorderListingImages as reorderListingImagesCore,
  requestImageReupload as requestImageReuploadCore,
  requestImageUpload as requestImageUploadCore,
} from './upload';

// Server Actions da gestao privada de imagens. Toda regra (sessao, posse,
// trava, estado) vive em upload.ts; aqui so ha a fronteira chamavel pelo
// cliente. Nenhuma action recebe bytes de imagem: o binario vai do navegador
// direto ao R2 pela presigned PUT.

export async function requestImageUpload(listingId: string, contentType: string, fileSize: number) {
  return requestImageUploadCore(listingId, contentType, fileSize);
}

export async function requestImageReupload(imageId: string, contentType: string, fileSize: number) {
  return requestImageReuploadCore(imageId, contentType, fileSize);
}

/**
 * Confirma o upload e agenda, depois da resposta, UMA tentativa de processar
 * aquela imagem (caminho rapido). A corretude nao depende dela: a recuperacao
 * periodica reclama a mesma linha (media-pipeline-contract.md, secao 6, item 7).
 */
export async function confirmImageUpload(imageId: string) {
  const result = await confirmImageUploadCore(imageId);
  if (result.success && result.data.outcome === 'queued') {
    after(async () => {
      try {
        await processPendingImages({ imageId });
      } catch (err) {
        console.error('[media] caminho rapido falhou; a recuperacao periodica retoma', {
          imageId,
          error: err instanceof Error ? err.name : 'unknown',
        });
      }
    });
  }
  return result;
}

export async function deleteListingImage(imageId: string) {
  return deleteListingImageCore(imageId);
}

export async function reorderListingImages(listingId: string, orderedImageIds: string[]) {
  return reorderListingImagesCore(listingId, orderedImageIds);
}

export async function getOwnerListingImages(listingId: string) {
  return getOwnerListingImagesCore(listingId);
}
