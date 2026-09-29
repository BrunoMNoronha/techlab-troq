// @vitest-environment node
//
// Prova de F2-008 (#46) contra o Cloudflare R2 REAL (bucket de DEVELOPMENT),
// PostgreSQL REAL e descartavel e Better Auth REAL, sem simular a fronteira
// s3: presigned PUT, cabecalhos assinados, HeadObject, ETag, If-Match,
// derivados WebP e bucket privado.
//
// So roda com INTEGRATION_EPHEMERAL_DB=1 e R2_INTEGRATION=1, e RECUSA rodar se
// o bucket nao for de development. Nunca imprime URL presignada nem
// credencial. Todo objeto criado e apagado no fim.
import { randomBytes } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { getPrismaClient } from '@/persistence/prisma';
import { derivativeKeys, originalKey } from './keys';
import { processPendingImages } from './processor';
import { getR2Config } from './s3';
import { confirmImageUpload, requestImageUpload } from './upload';

let browserCookie = '';
vi.mock('next/headers', () => ({
  headers: async () => new Headers(browserCookie ? { cookie: browserCookie } : {}),
}));
vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

const enabled = process.env.INTEGRATION_EPHEMERAL_DB === '1' && process.env.R2_INTEGRATION === '1';

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const email = `it-r2-${RUN_ID}@example.test`;

function admin(): { client: S3Client; bucket: string } {
  const config = getR2Config();
  return {
    bucket: config.bucket,
    client: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    }),
  };
}

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 200;
  } catch (err) {
    return (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? -1;
  }
}

describe.skipIf(!enabled)('pipeline de imagens contra o R2 real (development)', () => {
  let userId: string;
  let listingId: string;
  const imageIds: string[] = [];

  beforeAll(async () => {
    const { bucket } = admin();
    if (!bucket.endsWith('-development')) {
      throw new Error('A prova de R2 so roda contra o bucket de development.');
    }
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');

    const res = await registerUser({
      displayName: 'Usuario Sintetico',
      email,
      password: PASSWORD,
      over18: true,
      termsAccepted: true,
    });
    expect(res.success).toBe(true);
    const prisma = getPrismaClient();
    ({ id: userId } = await prisma.user.findFirstOrThrow({ where: { email } }));
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });
    const { headers } = await getAuth().api.signInEmail({
      body: { email, password: PASSWORD },
      headers: new Headers({ 'user-agent': 'agente-sintetico/1.0' }),
      returnHeaders: true,
    });
    browserCookie = headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  });

  beforeEach(async () => {
    const prisma = getPrismaClient();
    await prisma.verification.deleteMany({ where: { identifier: `media-upload:${userId}` } });
    ({ id: listingId } = await prisma.listing.create({
      data: { ownerId: userId, title: 'R2 sintetico', description: 'x', city: 'Recife', uf: 'PE' },
      select: { id: true },
    }));
  });

  afterAll(async () => {
    const { client, bucket } = admin();
    const prisma = getPrismaClient();
    // Apaga TUDO o que a suite criou no bucket, pelas chaves conhecidas e por
    // listagem dos prefixos das imagens criadas.
    for (const id of imageIds) {
      for (const prefix of [`originals/${id}/`, `derivatives/${id}/`]) {
        const listed = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
        );
        for (const object of listed.Contents ?? []) {
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key! }));
        }
      }
    }
    for (const id of imageIds) {
      const left = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: `originals/${id}/` }),
      );
      const leftDerivatives = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: `derivatives/${id}/` }),
      );
      expect(left.KeyCount ?? 0).toBe(0);
      expect(leftDerivatives.KeyCount ?? 0).toBe(0);
    }
    await prisma.listingImage.deleteMany({ where: { listing: { ownerId: userId } } });
    await prisma.mediaObjectDeletion.deleteMany({
      where: { OR: imageIds.map((id) => ({ objectKey: { contains: id } })) },
    });
    await prisma.listing.deleteMany({ where: { ownerId: userId } });
    await prisma.termsAcceptance.deleteMany({ where: { userId } });
    await prisma.verification.deleteMany({
      where: { identifier: { in: [`email-verification:${userId}`, `media-upload:${userId}`] } },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  async function reserve(contentType: string, data: Buffer) {
    const res = await requestImageUpload(listingId, contentType, data.length);
    if (!res.success) throw new Error(`reserva falhou: ${res.reason}`);
    imageIds.push(res.data.imageId);
    return res.data;
  }

  function put(url: string, data: Buffer, headers: Record<string, string>) {
    return fetch(url, { method: 'PUT', body: new Uint8Array(data), headers });
  }

  it.each([
    ['image/jpeg', 'jpeg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ] as const)(
    '%s: PUT direto, confirmacao pelo HeadObject, tres derivados WebP no R2',
    async (type, format) => {
      const data = await sharp({
        create: { width: 1300, height: 700, channels: 3, background: { r: 10, g: 150, b: 90 } },
      })
        .withExif({ IFD0: { Copyright: 'sintetico' } })
        .toFormat(format)
        .toBuffer();
      const auth = await reserve(type, data);

      const upload = await put(auth.uploadUrl, data, auth.uploadHeaders);
      expect(upload.status).toBe(200);
      expect(await confirmImageUpload(auth.imageId)).toMatchObject({ data: { outcome: 'queued' } });
      const confirmed = await getPrismaClient().listingImage.findUniqueOrThrow({
        where: { id: auth.imageId },
      });
      const { client, bucket } = admin();
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: originalKey(auth.imageId, 1) }),
      );
      expect(confirmed.sourceEtag).toBe(head.ETag);

      expect(await processPendingImages({ imageId: auth.imageId })).toMatchObject({ ready: 1 });

      const expected = { thumb: [320, 172], medium: [768, 414], large: [1300, 700] } as const;
      for (const key of derivativeKeys(auth.imageId, 1)) {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        expect(object.ContentType).toBe('image/webp');
        const bytes = Buffer.from(await object.Body!.transformToByteArray());
        const meta = await sharp(bytes).metadata();
        const kind = key.split('/').pop()!.replace('.webp', '') as keyof typeof expected;
        expect([meta.format, meta.width, meta.height]).toEqual(['webp', ...expected[kind]]);
        expect(meta.exif).toBeUndefined();
      }
      expect(
        await getPrismaClient().imageDerivative.count({ where: { imageId: auth.imageId } }),
      ).toBe(3);
    },
  );

  it('a presigned PUT exige os cabecalhos assinados e nao sobrescreve', async () => {
    const data = await sharp({
      create: { width: 600, height: 600, channels: 3, background: 'blue' },
    })
      .png()
      .toBuffer();
    const auth = await reserve('image/png', data);
    // A URL assina content-type, content-length e if-none-match.
    const signed = new URL(auth.uploadUrl).searchParams.get('X-Amz-SignedHeaders');
    expect(signed?.split(';').sort()).toEqual([
      'content-length',
      'content-type',
      'host',
      'if-none-match',
    ]);
    expect(new URL(auth.uploadUrl).searchParams.get('X-Amz-Expires')).toBe('900');
    const params = [...new URL(auth.uploadUrl).searchParams.keys()];
    expect(params.filter((k) => k.toLowerCase().includes('checksum'))).toEqual([]);

    expect(
      (await put(auth.uploadUrl, data, { ...auth.uploadHeaders, 'Content-Type': 'image/jpeg' }))
        .status,
    ).toBe(403);
    expect(
      (await put(auth.uploadUrl, Buffer.concat([data, Buffer.from('x')]), auth.uploadHeaders))
        .status,
    ).toBe(403);
    expect((await put(auth.uploadUrl, data, { 'Content-Type': 'image/png' })).status).toBe(403);
    expect((await put(auth.uploadUrl, data, auth.uploadHeaders)).status).toBe(200);
    // Reutilizar a URL para trocar o objeto: 412, o original confirmado nao muda.
    expect((await put(auth.uploadUrl, data, auth.uploadHeaders)).status).toBe(412);
  });

  it('segunda barreira: objeto trocado depois da confirmacao falha fechado pelo If-Match', async () => {
    const data = await sharp({
      create: { width: 700, height: 700, channels: 3, background: 'green' },
    })
      .jpeg()
      .toBuffer();
    const auth = await reserve('image/jpeg', data);
    expect((await put(auth.uploadUrl, data, auth.uploadHeaders)).status).toBe(200);
    expect(await confirmImageUpload(auth.imageId)).toMatchObject({ data: { outcome: 'queued' } });

    // Troca feita pelo servidor, fora da URL (que ja recusaria com 412).
    const { client, bucket } = admin();
    const other = await sharp({
      create: { width: 900, height: 400, channels: 3, background: 'red' },
    })
      .jpeg()
      .toBuffer();
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: originalKey(auth.imageId, 1), Body: other }),
    );

    expect(await processPendingImages({ imageId: auth.imageId })).toMatchObject({ failed: 1 });
    expect(
      await getPrismaClient().listingImage.findUniqueOrThrow({ where: { id: auth.imageId } }),
    ).toMatchObject({ status: 'failed', failureCode: 'source_replaced' });
    for (const key of derivativeKeys(auth.imageId, 1)) {
      expect(await status(client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })))).toBe(
        404,
      );
    }
  });

  it('bucket privado: original e derivados nao respondem sem assinatura', async () => {
    const data = await sharp({
      create: { width: 640, height: 640, channels: 3, background: 'white' },
    })
      .webp()
      .toBuffer();
    const auth = await reserve('image/webp', data);
    expect((await put(auth.uploadUrl, data, auth.uploadHeaders)).status).toBe(200);
    await confirmImageUpload(auth.imageId);
    await processPendingImages({ imageId: auth.imageId });

    const { endpoint, bucket } = getR2Config();
    for (const key of [originalKey(auth.imageId, 1), ...derivativeKeys(auth.imageId, 1)]) {
      const res = await fetch(`${endpoint}/${bucket}/${key}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
    // A confirmacao nao confiou no cliente: o ETag gravado e o do R2.
    const row = await getPrismaClient().listingImage.findUniqueOrThrow({
      where: { id: auth.imageId },
    });
    expect(row.sourceEtag).toMatch(/^"[0-9a-f]{32}"$/);
  });
});
