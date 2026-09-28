import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ENDPOINT = process.env.R2_S3_ENDPOINT || 'https://example.r2.cloudflarestorage.com';
const R2_REGION = process.env.R2_REGION || 'auto';
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID || 'mock-access-key';
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY || 'mock-secret-key';
export const R2_BUCKET = process.env.R2_BUCKET || 'troq-media-development';

export function getS3Client(): S3Client {
  return new S3Client({
    region: R2_REGION,
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
    },
  });
}

/**
 * Gera URL pre-assinada para upload direto do cliente para pasta temp/ do R2.
 */
export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
): Promise<string> {
  const s3 = getS3Client();
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  // Validade de 15 minutos (900s)
  return getSignedUrl(s3, command, { expiresIn: 900 });
}

/**
 * Deleta objeto do bucket R2.
 */
export async function deleteR2Object(key: string): Promise<void> {
  try {
    const s3 = getS3Client();
    await s3.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      }),
    );
  } catch (err) {
    console.error(`[R2 Delete Error] Key: ${key}`, err);
  }
}
