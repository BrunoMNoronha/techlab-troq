// @vitest-environment node
//
// Prova de F2-009 (#47) contra PostgreSQL REAL e descartavel, Better Auth REAL
// e o Cloudflare R2 REAL (bucket de DEVELOPMENT), sem simular a fronteira s3:
//
// - matriz de autorizacao de GET /media/{imageId}/{kind} (publico, dono, terceiro);
// - 404 uniforme (status, corpo e cabecalhos identicos) para toda recusa;
// - bytes WebP em stream, identicos ao objeto; `private, no-store` e `nosniff`;
// - revogacao imediata na MESMA URL, depois de respostas 200 (cache aquecido);
// - fila de exclusao apagando objetos reais, falha mantendo a pendencia e
//   repeticao convergindo; bucket limpo ao final.
//
// So roda com INTEGRATION_EPHEMERAL_DB=1 e R2_INTEGRATION=1, e RECUSA rodar se
// o bucket nao for de development. Nunca imprime credencial nem endpoint.
import { randomBytes, randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListingStatus } from '@/generated/prisma/client';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { getPrismaClient } from '@/persistence/prisma';
import { GET as mediaRoute } from '@/app/media/[imageId]/[kind]/route';
import { consumeDeletionQueue } from './cleanup';
import { enqueueDeletions } from './deletions';
import { derivativeKey, originalKey } from './keys';
import { MEDIA_KINDS, mediaPath, type MediaKind } from './media-path';
import { getR2Config, putDerivative } from './s3';

let browserCookie = '';
vi.mock('next/headers', () => ({
  headers: async () => new Headers(browserCookie ? { cookie: browserCookie } : {}),
}));
vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

const enabled = process.env.INTEGRATION_EPHEMERAL_DB === '1' && process.env.R2_INTEGRATION === '1';

// Cada caso faz varias idas ao R2 real.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const emails = {
  a: `it-deliv-a-${RUN_ID}@example.test`,
  b: `it-deliv-b-${RUN_ID}@example.test`,
  c: `it-deliv-c-${RUN_ID}@example.test`,
};

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

async function existsInR2(key: string): Promise<boolean> {
  const { client, bucket } = admin();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

async function createVerifiedUser(email: string): Promise<string> {
  const res = await registerUser({
    displayName: 'Usuario Sintetico',
    email,
    password: PASSWORD,
    over18: true,
    termsAccepted: true,
  });
  expect(res.success).toBe(true);
  const prisma = getPrismaClient();
  const { id } = await prisma.user.findFirstOrThrow({ where: { email } });
  await prisma.user.update({
    where: { id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  return id;
}

async function signIn(email: string): Promise<string> {
  const { headers } = await getAuth().api.signInEmail({
    body: { email, password: PASSWORD },
    headers: new Headers({ 'user-agent': 'agente-sintetico/1.0' }),
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

const PATH_TO: Record<ListingStatus, ListingStatus[]> = {
  draft: [],
  published: ['published'],
  paused: ['published', 'paused'],
  closed: ['closed'],
  removed: ['removed'],
};

async function listingOf(ownerId: string, status: ListingStatus): Promise<string> {
  const prisma = getPrismaClient();
  const { id } = await prisma.listing.create({
    data: { ownerId, title: 'Midia sintetica', description: 'x', city: 'Recife', uf: 'PE' },
    select: { id: true },
  });
  for (const step of PATH_TO[status]) {
    await prisma.listing.update({ where: { id }, data: { status: step } });
  }
  return id;
}

async function setListingStatus(id: string, status: ListingStatus) {
  await getPrismaClient().listing.update({ where: { id }, data: { status } });
}

const imageIds: string[] = [];
let webp: Buffer;

/** Imagem `ready` com os tres derivados gravados de verdade no R2. */
async function seedReadyImage(listingId: string): Promise<string> {
  const prisma = getPrismaClient();
  const id = randomUUID();
  imageIds.push(id);
  await prisma.listingImage.create({
    data: {
      id,
      listingId,
      position: 1,
      status: 'ready',
      objectKey: originalKey(id, 1),
      width: 400,
      height: 300,
      sourceEtag: '"sintetico"',
      sourceConfirmedAt: new Date(),
      processedAt: new Date(),
    },
  });
  for (const kind of MEDIA_KINDS) {
    const key = derivativeKey(id, 1, kind);
    await putDerivative(key, webp);
    await prisma.imageDerivative.create({
      data: { imageId: id, kind, objectKey: key, width: 400, height: 300 },
    });
  }
  return id;
}

async function get(imageId: string, kind: string, cookie = ''): Promise<Response> {
  browserCookie = cookie;
  return mediaRoute(new Request(`http://localhost:3000${`/media/${imageId}/${kind}`}`), {
    params: Promise.resolve({ imageId, kind }),
  });
}

function headerSnapshot(res: Response): Record<string, string> {
  return Object.fromEntries([...res.headers.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

describe.skipIf(!enabled)('entrega de midia e fila de exclusao contra o R2 real', () => {
  let userA: string;
  let userB: string;
  let userC: string;
  let cookieA: string;
  let cookieB: string;
  let cookieC: string;
  let reference404: { status: number; body: string; headers: Record<string, string> };

  beforeAll(async () => {
    const { bucket } = admin();
    if (!bucket.endsWith('-development')) {
      throw new Error('A prova de R2 so roda contra o bucket de development.');
    }
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
    userA = await createVerifiedUser(emails.a);
    userB = await createVerifiedUser(emails.b);
    userC = await createVerifiedUser(emails.c);
    cookieA = await signIn(emails.a);
    cookieB = await signIn(emails.b);
    cookieC = await signIn(emails.c);
    webp = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 60, b: 90 } },
    })
      .webp({ quality: 80 })
      .toBuffer();

    const res = await get(randomUUID(), 'thumb');
    reference404 = { status: res.status, body: await res.text(), headers: headerSnapshot(res) };
  });

  beforeEach(async () => {
    // Pendencias de outras suites (chaves sinteticas) ficam fora do alcance
    // desta: so as desta suite vencem. Banco descartavel; nada e apagado.
    await getPrismaClient().$executeRaw`
      UPDATE "media_object_deletions" SET "due_at" = 'infinity'
      WHERE "completed_at" IS NULL AND "due_at" <> 'infinity'`;
  });

  afterAll(async () => {
    const { client, bucket } = admin();
    const prisma = getPrismaClient();
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
      for (const prefix of [`originals/${id}/`, `derivatives/${id}/`]) {
        const left = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
        );
        expect(left.KeyCount ?? 0).toBe(0);
      }
    }
    const users = [userA, userB, userC];
    await prisma.listingImage.deleteMany({ where: { listing: { ownerId: { in: users } } } });
    await prisma.mediaObjectDeletion.deleteMany({
      where: { OR: imageIds.map((id) => ({ objectKey: { contains: id } })) },
    });
    await prisma.listing.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.termsAcceptance.deleteMany({ where: { userId: { in: users } } });
    await prisma.verification.deleteMany({
      where: { identifier: { in: users.map((u) => `email-verification:${u}`) } },
    });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  async function expectUniform404(res: Response) {
    expect(res.status).toBe(404);
    expect(await res.text()).toBe(reference404.body);
    expect(headerSnapshot(res)).toEqual(reference404.headers);
  }

  async function expectImage(res: Response) {
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(webp)).toBe(true);
  }

  it('o 404 de referencia nao pode ser guardado em cache e nao revela nada', () => {
    expect(reference404.status).toBe(404);
    expect(reference404.body).toBe('Not Found');
    expect(reference404.headers['cache-control']).toBe('private, no-store');
    expect(reference404.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sucesso: stream com os mesmos bytes do objeto e cabecalhos sem cache compartilhado', async () => {
    const image = await seedReadyImage(await listingOf(userA, 'published'));
    for (const kind of MEDIA_KINDS) {
      const res = await get(image, kind);
      const headers = headerSnapshot(res);
      await expectImage(res);
      expect(headers['content-length']).toBe(String(webp.length));
      for (const forbidden of [
        'etag',
        'cdn-cache-control',
        'vercel-cdn-cache-control',
        'x-amz-request-id',
        'last-modified',
      ]) {
        expect(headers[forbidden]).toBeUndefined();
      }
      expect(JSON.stringify(headers)).not.toMatch(/s-maxage|public|immutable|r2|derivatives/i);
    }
  });

  it('matriz de autorizacao: publico, dono e terceiro, em cada estado', async () => {
    const cases: {
      name: string;
      status: ListingStatus;
      cookie: () => string;
      expected: 200 | 404;
    }[] = [
      { name: 'anonimo + published', status: 'published', cookie: () => '', expected: 200 },
      {
        name: 'outro autenticado + published',
        status: 'published',
        cookie: () => cookieB,
        expected: 200,
      },
      { name: 'dono + draft', status: 'draft', cookie: () => cookieA, expected: 200 },
      { name: 'outro + draft', status: 'draft', cookie: () => cookieB, expected: 404 },
      { name: 'anonimo + draft', status: 'draft', cookie: () => '', expected: 404 },
      { name: 'anonimo + paused', status: 'paused', cookie: () => '', expected: 404 },
      { name: 'dono + paused', status: 'paused', cookie: () => cookieA, expected: 200 },
      { name: 'outro + paused', status: 'paused', cookie: () => cookieB, expected: 404 },
      { name: 'anonimo + closed', status: 'closed', cookie: () => '', expected: 404 },
      { name: 'dono + closed', status: 'closed', cookie: () => cookieA, expected: 200 },
      { name: 'outro + closed', status: 'closed', cookie: () => cookieB, expected: 404 },
      { name: 'anonimo + removed', status: 'removed', cookie: () => '', expected: 404 },
      { name: 'dono ativo + removed', status: 'removed', cookie: () => cookieA, expected: 200 },
      { name: 'outro + removed', status: 'removed', cookie: () => cookieB, expected: 404 },
    ];
    for (const c of cases) {
      const image = await seedReadyImage(await listingOf(userA, c.status));
      const res = await get(image, 'medium', c.cookie());
      if (c.expected === 200) await expectImage(res);
      else await expectUniform404(res);
    }
  });

  it('dono com conta nao `active`: nem publico nem privado', async () => {
    const published = await seedReadyImage(await listingOf(userC, 'published'));
    const draft = await seedReadyImage(await listingOf(userC, 'draft'));
    await expectImage(await get(published, 'thumb'));
    await expectImage(await get(draft, 'thumb', cookieC));

    await getPrismaClient().user.update({
      where: { id: userC },
      data: { status: 'blocked_admin' },
    });
    try {
      await expectUniform404(await get(published, 'thumb'));
      await expectUniform404(await get(published, 'thumb', cookieB));
      await expectUniform404(await get(published, 'thumb', cookieC));
      await expectUniform404(await get(draft, 'thumb', cookieC));
    } finally {
      await getPrismaClient().user.update({ where: { id: userC }, data: { status: 'active' } });
    }
  });

  it('imagem processing/failed, UUID inexistente ou invalido, kind invalido e objeto ausente: o mesmo 404', async () => {
    const prisma = getPrismaClient();
    const listing = await listingOf(userA, 'published');
    const processing = await seedReadyImage(listing);
    await prisma.$executeRaw`
      UPDATE "listing_images" SET "status" = 'processing', "processed_at" = NULL,
        "lease_expires_at" = now() + interval '5 minutes'
      WHERE "id" = ${processing}::uuid`;
    const failed = await seedReadyImage(await listingOf(userA, 'published'));
    await prisma.$executeRaw`
      UPDATE "listing_images" SET "status" = 'failed', "failure_code" = 'corrupt'
      WHERE "id" = ${failed}::uuid`;
    const missingObject = await seedReadyImage(await listingOf(userA, 'published'));
    const { client, bucket } = admin();
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: derivativeKey(missingObject, 1, 'large') }),
    );

    for (const cookie of ['', cookieA]) {
      await expectUniform404(await get(processing, 'thumb', cookie));
      await expectUniform404(await get(failed, 'thumb', cookie));
      await expectUniform404(await get(randomUUID(), 'thumb', cookie));
      await expectUniform404(await get('nao-e-uuid', 'thumb', cookie));
      await expectUniform404(await get(`${processing}'--`, 'thumb', cookie));
      await expectUniform404(await get(missingObject, 'original', cookie));
      await expectUniform404(await get(missingObject, 'THUMB', cookie));
      await expectUniform404(await get(missingObject, 'large', cookie));
    }
    // O mesmo derivado, em outro kind existente, continua sendo servido.
    await expectImage(await get(missingObject, 'thumb'));
  });

  it('revogacao imediata na MESMA URL, com respostas 200 anteriores (cache aquecido)', async () => {
    const listing = await listingOf(userA, 'published');
    const image = await seedReadyImage(listing);
    const url = mediaPath(image, 'large');
    const kind = url.split('/').pop() as MediaKind;

    await expectImage(await get(image, kind));
    await expectImage(await get(image, kind));

    await setListingStatus(listing, 'paused');
    await expectUniform404(await get(image, kind));
    await expectUniform404(await get(image, kind, cookieB));

    await setListingStatus(listing, 'published');
    await expectImage(await get(image, kind));

    await setListingStatus(listing, 'closed');
    for (let i = 0; i < 3; i += 1) await expectUniform404(await get(image, kind));
    await expectImage(await get(image, kind, cookieA));

    const removedListing = await listingOf(userA, 'published');
    const removedImage = await seedReadyImage(removedListing);
    await expectImage(await get(removedImage, 'thumb'));
    await setListingStatus(removedListing, 'removed');
    await expectUniform404(await get(removedImage, 'thumb'));

    const accountListing = await listingOf(userC, 'published');
    const accountImage = await seedReadyImage(accountListing);
    await expectImage(await get(accountImage, 'thumb'));
    await getPrismaClient().user.update({
      where: { id: userC },
      data: { status: 'deletion_requested' },
    });
    try {
      await expectUniform404(await get(accountImage, 'thumb'));
    } finally {
      await getPrismaClient().user.update({ where: { id: userC }, data: { status: 'active' } });
    }
  });

  it('fila de exclusao apaga objetos reais; falha mantem a pendencia; repeticao converge', async () => {
    const prisma = getPrismaClient();
    const orphanId = randomUUID();
    imageIds.push(orphanId);
    const orphanKeys = [derivativeKey(orphanId, 1, 'thumb'), derivativeKey(orphanId, 1, 'large')];
    for (const key of orphanKeys) await putDerivative(key, webp);
    const absentKey = originalKey(orphanId, 1); // nunca existiu no bucket
    await prisma.$transaction((tx) =>
      enqueueDeletions(tx, [...orphanKeys, absentKey], 'derivative_orphan'),
    );
    // Uma pendencia com prazo futuro nao e tocada.
    const futureKey = derivativeKey(orphanId, 1, 'medium');
    await putDerivative(futureKey, webp);
    await prisma.$transaction((tx) => enqueueDeletions(tx, [futureKey], 'retention_purge'));
    await prisma.$executeRaw`
      UPDATE "media_object_deletions" SET "due_at" = now() + interval '29 days'
      WHERE "object_key" = ${futureKey} AND "completed_at" IS NULL`;

    // 1) Credencial recusada pelo R2 (chave de acesso invalida): nada concluido.
    const realKeyId = process.env.R2_ACCESS_KEY_ID ?? '';
    vi.stubEnv('R2_ACCESS_KEY_ID', 'chave-sintetica-invalida');
    const failedRun = await consumeDeletionQueue();
    vi.stubEnv('R2_ACCESS_KEY_ID', realKeyId);
    expect(failedRun).toMatchObject({ claimed: 3, completed: 0, retried: 3 });
    const pending = await prisma.mediaObjectDeletion.findMany({
      where: { objectKey: { in: [...orphanKeys, absentKey] } },
    });
    expect(pending).toHaveLength(3);
    for (const row of pending) {
      expect(row.completedAt).toBeNull();
      expect(row.attempts).toBe(1);
      // R2 responde 400 (InvalidArgument) para chave de acesso inexistente.
      expect(row.lastErrorCode).toBe('r2_rejected');
    }
    for (const key of orphanKeys) expect(await existsInR2(key)).toBe(true);

    // 2) Recuo vencido: a proxima execucao apaga de verdade e conclui.
    await prisma.$executeRaw`
      UPDATE "media_object_deletions" SET "due_at" = now() - interval '1 second'
      WHERE "object_key" = ANY(${[...orphanKeys, absentKey]}) AND "completed_at" IS NULL`;
    const run = await consumeDeletionQueue();
    expect(run).toMatchObject({ claimed: 3, completed: 3, retried: 0 });
    for (const key of orphanKeys) expect(await existsInR2(key)).toBe(false);
    const done = await prisma.mediaObjectDeletion.findMany({
      where: { objectKey: { in: [...orphanKeys, absentKey] } },
    });
    expect(done.every((r) => r.completedAt !== null && r.lastErrorCode === null)).toBe(true);

    // 3) Repeticao: nada a fazer; reenfileirar chave ja apagada converge.
    expect(await consumeDeletionQueue()).toMatchObject({ claimed: 0 });
    await prisma.$transaction((tx) => enqueueDeletions(tx, [orphanKeys[0]], 'derivative_orphan'));
    expect(await consumeDeletionQueue()).toMatchObject({ claimed: 1, completed: 1 });

    // 4) Prazo futuro: intocado.
    expect(await existsInR2(futureKey)).toBe(true);
    const future = await prisma.mediaObjectDeletion.findFirstOrThrow({
      where: { objectKey: futureKey },
    });
    expect(future.completedAt).toBeNull();
    expect(future.attempts).toBe(0);
  });

  it('derivado vivo nunca e apagado pela fila, mesmo enfileirado', async () => {
    const prisma = getPrismaClient();
    const image = await seedReadyImage(await listingOf(userA, 'published'));
    const live = derivativeKey(image, 1, 'thumb');
    await prisma.$transaction((tx) => enqueueDeletions(tx, [live], 'derivative_orphan'));
    const run = await consumeDeletionQueue();
    expect(run).toMatchObject({ claimed: 1, completed: 0, protected: 1 });
    expect(await existsInR2(live)).toBe(true);
    await expectImage(await get(image, 'thumb'));
    const row = await prisma.mediaObjectDeletion.findFirstOrThrow({
      where: { objectKey: live, completedAt: null },
    });
    expect(row.lastErrorCode).toBe('live_reference');
  });
});
