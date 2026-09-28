import sharp from 'sharp';
import { validateSession } from '@/modules/identity';
import { getPrismaClient } from '@/persistence/prisma';
import { generatePresignedUploadUrl, deleteR2Object, getS3Client, R2_BUCKET } from './s3';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const MAX_IMAGES_PER_LISTING = 6;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MIN_DIMENSION_PX = 320;
const MAX_MEGAPIXELS = 50;

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface UploadRequestInput {
  listingId: string;
  contentType: string;
  fileSize: number;
}

export interface ImageDerivativeDTO {
  kind: 'thumb' | 'medium' | 'large';
  url: string;
  width: number;
  height: number;
}

export interface ListingImageDTO {
  id: string;
  position: number;
  status: string;
  derivatives: ImageDerivativeDTO[];
}

/**
 * Emite autorizacao de upload pre-assinado para o R2.
 */
export async function requestImageUpload(
  input: UploadRequestInput,
): Promise<{ success: boolean; error?: string; uploadUrl?: string; imageId?: string }> {
  const sessionResult = await validateSession();
  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, error: 'Não autorizado.' };
  }

  const { listingId, contentType, fileSize } = input;

  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    return { success: false, error: 'Formato de imagem não suportado. Use JPEG, PNG ou WebP.' };
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return { success: false, error: 'O tamanho da imagem não pode exceder 10 MB.' };
  }

  const prisma = getPrismaClient();

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { images: true },
  });

  if (!listing) {
    return { success: false, error: 'Anúncio não encontrado.' };
  }

  if (listing.ownerId !== sessionResult.user.id) {
    return {
      success: false,
      error: 'Você não tem permissão para adicionar imagens a este anúncio.',
    };
  }

  if (listing.status === 'closed' || listing.status === 'removed') {
    return { success: false, error: 'Anúncios encerrados ou removidos não admitem novas imagens.' };
  }

  if (listing.images.length >= MAX_IMAGES_PER_LISTING) {
    return {
      success: false,
      error: `Limite máximo de ${MAX_IMAGES_PER_LISTING} imagens atingido.`,
    };
  }

  const nextPosition = listing.images.length + 1;
  const imageId = crypto.randomUUID();
  const tempKey = `temp/${imageId}`;

  const listingImage = await prisma.listingImage.create({
    data: {
      id: imageId,
      listingId,
      position: nextPosition,
      status: 'uploaded',
      objectKey: tempKey,
    },
  });

  const uploadUrl = await generatePresignedUploadUrl(tempKey, contentType);

  return {
    success: true,
    uploadUrl,
    imageId: listingImage.id,
  };
}

/**
 * Confirma o upload e dispara o processamento de derivados via Sharp e R2.
 */
export async function confirmAndProcessImage(
  imageId: string,
  syntheticBuffer?: Buffer,
): Promise<{ success: boolean; error?: string }> {
  const sessionResult = await validateSession();
  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, error: 'Não autorizado.' };
  }

  const prisma = getPrismaClient();

  const listingImage = await prisma.listingImage.findUnique({
    where: { id: imageId },
    include: { listing: true },
  });

  if (!listingImage) {
    return { success: false, error: 'Registro de imagem não encontrado.' };
  }

  if (listingImage.listing.ownerId !== sessionResult.user.id) {
    return { success: false, error: 'Não autorizado.' };
  }

  await prisma.listingImage.update({
    where: { id: imageId },
    data: { status: 'processing' },
  });

  try {
    let inputBuffer: Buffer;

    if (syntheticBuffer) {
      inputBuffer = syntheticBuffer;
    } else {
      const s3 = getS3Client();
      const tempKey = listingImage.objectKey;
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: tempKey,
        }),
      );

      const byteArray = await response.Body?.transformToByteArray();
      if (!byteArray) {
        throw new Error('Falha ao baixar imagem temporária do R2.');
      }
      inputBuffer = Buffer.from(byteArray);
    }

    const imagePipeline = sharp(inputBuffer);
    const metadata = await imagePipeline.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Não foi possível decodificar as dimensões da imagem.');
    }

    if (metadata.pages && metadata.pages > 1) {
      throw new Error('Imagens animadas ou multipáginas não são permitidas.');
    }

    if (metadata.width < MIN_DIMENSION_PX || metadata.height < MIN_DIMENSION_PX) {
      throw new Error(
        `A imagem deve ter no mínimo ${MIN_DIMENSION_PX}x${MIN_DIMENSION_PX} pixels.`,
      );
    }

    const megapixels = (metadata.width * metadata.height) / 1_000_000;
    if (megapixels > MAX_MEGAPIXELS) {
      throw new Error(`Resolução excede o limite máximo de ${MAX_MEGAPIXELS} Megapixels.`);
    }

    const variants: { kind: 'thumb' | 'medium' | 'large'; maxDim: number }[] = [
      { kind: 'thumb', maxDim: 320 },
      { kind: 'medium', maxDim: 768 },
      { kind: 'large', maxDim: 1600 },
    ];

    const s3 = getS3Client();

    for (const variant of variants) {
      const resizedBuffer = await sharp(inputBuffer)
        .rotate() // Auto-orientacao EXIF
        .resize({
          width: variant.maxDim,
          height: variant.maxDim,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();

      const resizedMeta = await sharp(resizedBuffer).metadata();
      const key = `public/${imageId}/${variant.kind}.webp`;

      if (!syntheticBuffer) {
        await s3.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: resizedBuffer,
            ContentType: 'image/webp',
          }),
        );
      }

      await prisma.imageDerivative.create({
        data: {
          imageId,
          kind: variant.kind,
          objectKey: key,
          width: resizedMeta.width || variant.maxDim,
          height: resizedMeta.height || variant.maxDim,
        },
      });
    }

    // Deletar arquivo temporario
    if (!syntheticBuffer) {
      await deleteR2Object(listingImage.objectKey);
    }

    // Atualizar status para ready e salvar dimensoes originais
    await prisma.listingImage.update({
      where: { id: imageId },
      data: {
        status: 'ready',
        width: metadata.width,
        height: metadata.height,
        processedAt: new Date(),
      },
    });

    return { success: true };
  } catch (err) {
    console.error(`[Image Processing Failed] ImageId: ${imageId}`, err);
    await prisma.listingImage.update({
      where: { id: imageId },
      data: { status: 'failed' },
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Falha no processamento da imagem.',
    };
  }
}

/**
 * Remove uma imagem do anuncio e reordena as posicoes (1..N).
 */
export async function deleteListingImage(
  imageId: string,
): Promise<{ success: boolean; error?: string }> {
  const sessionResult = await validateSession();
  if (!sessionResult.isValid || !sessionResult.user) {
    return { success: false, error: 'Não autorizado.' };
  }

  const prisma = getPrismaClient();

  const listingImage = await prisma.listingImage.findUnique({
    where: { id: imageId },
    include: { listing: true, derivatives: true },
  });

  if (!listingImage) {
    return { success: false, error: 'Imagem não encontrada.' };
  }

  if (listingImage.listing.ownerId !== sessionResult.user.id) {
    return { success: false, error: 'Não autorizado.' };
  }

  for (const derivative of listingImage.derivatives) {
    await deleteR2Object(derivative.objectKey);
  }

  const listingId = listingImage.listingId;

  await prisma.$transaction([
    prisma.imageDerivative.deleteMany({ where: { imageId } }),
    prisma.listingImage.delete({ where: { id: imageId } }),
  ]);

  const remainingImages = await prisma.listingImage.findMany({
    where: { listingId },
    orderBy: { position: 'asc' },
  });

  for (let i = 0; i < remainingImages.length; i++) {
    await prisma.listingImage.update({
      where: { id: remainingImages[i].id },
      data: { position: i + 1 },
    });
  }

  return { success: true };
}

/**
 * Issue #47: Consulta as imagens publicas de um anuncio.
 * Retorna derivados SOMENTE quando o anuncio estiver PUBLISHED e a conta do proprietario estiver ACTIVE.
 */
export async function getPublicListingImages(listingId: string): Promise<ListingImageDTO[]> {
  const prisma = getPrismaClient();
  const mediaBaseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || 'https://media.example.invalid';

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      owner: { select: { status: true } },
      images: {
        where: { status: 'ready' },
        orderBy: { position: 'asc' },
        include: { derivatives: true },
      },
    },
  });

  if (!listing || listing.status !== 'published' || listing.owner.status !== 'active') {
    return [];
  }

  return listing.images.map((img) => ({
    id: img.id,
    position: img.position,
    status: img.status,
    derivatives: img.derivatives.map((d) => ({
      kind: d.kind as 'thumb' | 'medium' | 'large',
      url: `${mediaBaseUrl}/${d.objectKey}`,
      width: d.width,
      height: d.height,
    })),
  }));
}
