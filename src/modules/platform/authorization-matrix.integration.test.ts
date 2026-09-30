// @vitest-environment node
//
// Prova de F2-012 (#50): matriz de autorizacao por CHAMADA DIRETA das Server
// Actions de anuncios e de midia, contra PostgreSQL REAL e descartavel e
// sessoes Better Auth REAIS (docs/delivery/phase-2-security-verification.md).
//
// Atores: anonimo, sessao revogada, sessao expirada, e-mail nao verificado,
// `blocked_age`, `blocked_admin`, `deletion_requested` (todos com sessao
// remanescente), terceiro e dono.
//
// - ator invalido: TODA action (leitura e escrita, anuncio e midia, sobre
//   recursos que seriam dele) recebe `unauthenticated` e o banco inteiro fica
//   identico (fotografia antes/depois de todas as tabelas de dominio);
// - terceiro sobre recursos do dono: `not_found`, igual a resposta de um UUID
//   inexistente, e banco identico;
// - nenhuma resposta carrega telefone persistido em `user_contacts`, email ou
//   id de outro usuario, chave de objeto, ETag ou URL pre-assinada.
//
// So roda com INTEGRATION_EPHEMERAL_DB=1. Nao fala com o R2: toda recusa
// acontece antes de qualquer chamada ao armazenamento. Dados sinteticos,
// removidos ao final.
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ListingStatus } from '@/generated/prisma/client';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import {
  closeListing,
  createDraftListing,
  discardDraft,
  getListingForEdit,
  getOwnerListings,
  pauseListing,
  publishListing,
  reactivateListing,
  updateListing,
} from '@/modules/listing/actions';
import {
  confirmImageUpload,
  deleteListingImage,
  getOwnerListingImages,
  reorderListingImages,
  requestImageReupload,
  requestImageUpload,
} from '@/modules/media/actions';
import { originalKey } from '@/modules/media/keys';
import { getPrismaClient } from '@/persistence/prisma';

let browserCookie = '';
vi.mock('next/headers', () => ({
  headers: async () => new Headers(browserCookie ? { cookie: browserCookie } : {}),
}));
vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

const enabled = process.env.INTEGRATION_EPHEMERAL_DB === '1';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const PHONE = '+55 11 90000-0000';

/** Tabelas de dominio fotografadas antes e depois de cada recusa. */
const DOMAIN_TABLES = [
  'users',
  'accounts',
  'user_contacts',
  'terms_acceptances',
  'account_deletion_requests',
  'listings',
  'listing_transitions',
  'listing_images',
  'image_derivatives',
  'media_object_deletions',
  'audit_events',
] as const;

async function snapshot(): Promise<Record<string, string>> {
  const prisma = getPrismaClient();
  const out: Record<string, string> = {};
  for (const table of DOMAIN_TABLES) {
    const [row] = await prisma.$queryRawUnsafe<{ digest: string | null; n: bigint }[]>(
      `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS digest,
              count(*) AS n FROM "${table}" t`,
    );
    out[table] = `${row.n}:${row.digest}`;
  }
  return out;
}

const PATH_TO: Record<ListingStatus, ListingStatus[]> = {
  draft: [],
  published: ['published'],
  paused: ['published', 'paused'],
  closed: ['closed'],
  removed: ['removed'],
};

type ActorKind =
  | 'anonimo'
  | 'revogada'
  | 'expirada'
  | 'nao_verificado'
  | 'blocked_age'
  | 'blocked_admin'
  | 'deletion_requested'
  | 'terceiro'
  | 'dono';

interface Resources {
  draft: string;
  published: string;
  paused: string;
  readyImage: string;
  uploadedImage: string;
  failedImage: string;
  draftImages: string[];
}

interface Actor {
  kind: ActorKind;
  email: string;
  userId: string | null;
  cookie: string;
  res: Resources | null;
}

const userIds: string[] = [];

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
  await prisma.userContact.create({ data: { userId: id, phoneNumber: PHONE } });
  userIds.push(id);
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

async function listingOf(ownerId: string, status: ListingStatus): Promise<string> {
  const prisma = getPrismaClient();
  const { id } = await prisma.listing.create({
    data: {
      ownerId,
      title: `Matriz ${status} ${RUN_ID}`,
      description: 'Descricao sintetica.',
      city: 'Recife',
      uf: 'PE',
    },
    select: { id: true },
  });
  for (const step of PATH_TO[status]) {
    await prisma.listing.update({ where: { id }, data: { status: step } });
  }
  return id;
}

async function imageOf(
  listingId: string,
  position: number,
  status: 'ready' | 'uploaded' | 'failed',
): Promise<string> {
  const id = randomUUID();
  await getPrismaClient().listingImage.create({
    data: {
      id,
      listingId,
      position,
      status,
      objectKey: originalKey(id, 1),
      ...(status === 'ready'
        ? {
            width: 400,
            height: 300,
            sourceEtag: '"sintetico"',
            sourceConfirmedAt: new Date(),
            processedAt: new Date(),
          }
        : {}),
      ...(status === 'failed' ? { sourceConfirmedAt: new Date(), failureCode: 'corrupt' } : {}),
    },
  });
  return id;
}

async function resourcesOf(ownerId: string): Promise<Resources> {
  const draft = await listingOf(ownerId, 'draft');
  const readyImage = await imageOf(draft, 1, 'ready');
  const uploadedImage = await imageOf(draft, 2, 'uploaded');
  const failedImage = await imageOf(draft, 3, 'failed');
  const published = await listingOf(ownerId, 'published');
  await imageOf(published, 1, 'ready');
  const paused = await listingOf(ownerId, 'paused');
  await imageOf(paused, 1, 'ready');
  return {
    draft,
    published,
    paused,
    readyImage,
    uploadedImage,
    failedImage,
    draftImages: [readyImage, uploadedImage, failedImage],
  };
}

/** Recursos inexistentes com a mesma forma: a resposta de referencia. */
function missingResources(): Resources {
  return {
    draft: randomUUID(),
    published: randomUUID(),
    paused: randomUUID(),
    readyImage: randomUUID(),
    uploadedImage: randomUUID(),
    failedImage: randomUUID(),
    draftImages: [randomUUID(), randomUUID(), randomUUID()],
  };
}

type Operation = [name: string, run: (r: Resources) => Promise<unknown>];

/** Toda Server Action de anuncio e de midia, com os recursos de um dono. */
const OPERATIONS: Operation[] = [
  [
    'createDraftListing',
    () =>
      createDraftListing({
        title: `Novo ${RUN_ID}`,
        description: 'Descricao.',
        city: 'Recife',
        state: 'PE',
      }),
  ],
  ['getOwnerListings', () => getOwnerListings()],
  ['getListingForEdit', (r) => getListingForEdit(r.draft)],
  ['updateListing', (r) => updateListing(r.draft, { title: `Alterado ${RUN_ID}` })],
  ['publishListing', (r) => publishListing(r.draft, true)],
  ['pauseListing', (r) => pauseListing(r.published)],
  ['reactivateListing', (r) => reactivateListing(r.paused)],
  ['closeListing', (r) => closeListing(r.published)],
  ['discardDraft', (r) => discardDraft(r.draft)],
  ['getOwnerListingImages', (r) => getOwnerListingImages(r.draft)],
  ['requestImageUpload', (r) => requestImageUpload(r.draft, 'image/jpeg', 1000)],
  ['requestImageReupload', (r) => requestImageReupload(r.failedImage, 'image/jpeg', 1000)],
  ['confirmImageUpload', (r) => confirmImageUpload(r.uploadedImage)],
  ['deleteListingImage', (r) => deleteListingImage(r.readyImage)],
  ['reorderListingImages', (r) => reorderListingImages(r.draft, [...r.draftImages].reverse())],
];

/** Actions que so fazem sentido sobre um recurso (o terceiro cria o proprio anuncio). */
const RESOURCE_OPERATIONS = OPERATIONS.filter(
  ([name]) => name !== 'createDraftListing' && name !== 'getOwnerListings',
);

describe.skipIf(!enabled)('matriz de autorizacao por chamada direta (#50)', () => {
  const actors = new Map<ActorKind, Actor>();
  let forbiddenMarkers: string[];

  async function actor(kind: ActorKind, withResources: boolean): Promise<Actor> {
    const email = `sintetico-${kind}-${RUN_ID}@example.test`;
    const userId = await createVerifiedUser(email);
    const res = withResources ? await resourcesOf(userId) : null;
    const cookie = await signIn(email);
    return { kind, email, userId, cookie, res };
  }

  beforeAll(async () => {
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
    const prisma = getPrismaClient();

    actors.set('dono', await actor('dono', true));
    actors.set('terceiro', await actor('terceiro', true));

    // Sessao valida emitida ANTES da mudanca de estado: a sessao remanescente
    // e o caso dificil (o login ja recusa conta nao ativa ou nao verificada).
    for (const kind of [
      'revogada',
      'expirada',
      'nao_verificado',
      'blocked_age',
      'blocked_admin',
      'deletion_requested',
    ] as const) {
      const a = await actor(kind, true);
      if (kind === 'revogada') {
        await prisma.session.deleteMany({ where: { userId: a.userId! } });
      } else if (kind === 'expirada') {
        await prisma.session.updateMany({
          where: { userId: a.userId! },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        });
      } else if (kind === 'nao_verificado') {
        await prisma.user.update({
          where: { id: a.userId! },
          data: { emailVerified: false, emailVerifiedAt: null },
        });
      } else {
        await prisma.user.update({ where: { id: a.userId! }, data: { status: kind } });
      }
      actors.set(kind, a);
    }
    actors.set('anonimo', { kind: 'anonimo', email: '', userId: null, cookie: '', res: null });

    forbiddenMarkers = [
      PHONE,
      '90000-0000',
      'objectKey',
      'object_key',
      'originals/',
      'derivatives/',
      'sourceEtag',
      'X-Amz-Signature',
      'ownerId',
      'owner_id',
      'passwordHash',
    ];
  });

  afterAll(async () => {
    browserCookie = '';
    const prisma = getPrismaClient();
    const listings = { listing: { ownerId: { in: userIds } } };
    await prisma.imageDerivative.deleteMany({ where: { image: listings } });
    await prisma.mediaObjectDeletion.deleteMany({
      where: { objectKey: { contains: RUN_ID } },
    });
    const imageIds = (
      await prisma.listingImage.findMany({ where: listings, select: { id: true } })
    ).map((i) => i.id);
    await prisma.mediaObjectDeletion.deleteMany({
      where: { OR: imageIds.map((id) => ({ objectKey: { contains: id } })) },
    });
    await prisma.listingImage.deleteMany({ where: listings });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.listingTransition.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.listing.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.userContact.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.verification.deleteMany({
      where: { identifier: { in: userIds.map((u) => `email-verification:${u}`) } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  function expectNoLeak(label: string, result: unknown, others: Actor[]) {
    const json = JSON.stringify(result) ?? '';
    for (const marker of forbiddenMarkers) {
      expect(json.includes(marker), `${label} contem ${marker}`).toBe(false);
    }
    for (const other of others) {
      if (other.userId) expect(json, label).not.toContain(other.userId);
      if (other.email) expect(json, label).not.toContain(other.email);
    }
  }

  const invalidKinds = [
    'anonimo',
    'revogada',
    'expirada',
    'nao_verificado',
    'blocked_age',
    'blocked_admin',
    'deletion_requested',
  ] as const;

  it.each(invalidKinds)(
    '%s: toda action de anuncio e de midia e recusada como unauthenticated, sem efeito',
    async (kind) => {
      const a = actors.get(kind)!;
      // Anonimo ataca os recursos do dono; os demais, os proprios recursos.
      const target = a.res ?? actors.get('dono')!.res!;
      browserCookie = a.cookie;
      const before = await snapshot();
      for (const [name, run] of OPERATIONS) {
        const result = await run(target);
        expect(result, `${kind} ${name}`).toMatchObject({
          success: false,
          reason: 'unauthenticated',
        });
        expectNoLeak(`${kind} ${name}`, result, [...actors.values()]);
      }
      expect(await snapshot(), `${kind}: banco alterado`).toEqual(before);
    },
  );

  it('terceiro sobre recursos do dono: mesma resposta de inexistente, sem efeito', async () => {
    const owner = actors.get('dono')!;
    const third = actors.get('terceiro')!;
    browserCookie = third.cookie;
    const before = await snapshot();
    for (const [name, run] of RESOURCE_OPERATIONS) {
      const onOwner = await run(owner.res!);
      const onMissing = await run(missingResources());
      expect(onOwner, `terceiro ${name}`).toMatchObject({ success: false, reason: 'not_found' });
      expect(onOwner, `terceiro ${name} difere de inexistente`).toEqual(onMissing);
      expectNoLeak(`terceiro ${name}`, onOwner, [owner]);
    }
    const mine = await getOwnerListings();
    const ids = (mine.listings ?? []).map((l) => l.id);
    for (const id of [owner.res!.draft, owner.res!.published, owner.res!.paused]) {
      expect(ids).not.toContain(id);
    }
    expect(await snapshot(), 'terceiro: banco alterado').toEqual(before);
  });

  it('identificador malformado: a mesma resposta de inexistente para o dono', async () => {
    const owner = actors.get('dono')!;
    browserCookie = owner.cookie;
    const malformed: Resources = {
      draft: 'nao-uuid',
      published: 'nao-uuid',
      paused: 'nao-uuid',
      readyImage: 'nao-uuid',
      uploadedImage: 'nao-uuid',
      failedImage: 'nao-uuid',
      draftImages: ['nao-uuid'],
    };
    const before = await snapshot();
    for (const [name, run] of RESOURCE_OPERATIONS) {
      const bad = await run(malformed);
      const missing = await run(missingResources());
      expect(bad, `malformado ${name}`).toEqual(missing);
    }
    expect(await snapshot()).toEqual(before);
  });

  it('dono: leituras privadas funcionam e nao carregam contato, dono nem chave', async () => {
    const owner = actors.get('dono')!;
    browserCookie = owner.cookie;
    const listings = await getOwnerListings();
    expect(listings.success).toBe(true);
    expect((listings.listings ?? []).map((l) => l.id)).toEqual(
      expect.arrayContaining([owner.res!.draft, owner.res!.published, owner.res!.paused]),
    );
    const edit = await getListingForEdit(owner.res!.draft);
    expect(edit).toMatchObject({ success: true, listing: { id: owner.res!.draft } });
    const images = await getOwnerListingImages(owner.res!.draft);
    expect(images).toMatchObject({ success: true });
    const others = [...actors.values()].filter((a) => a.kind !== 'dono');
    for (const [label, result] of [
      ['getOwnerListings', listings],
      ['getListingForEdit', edit],
      ['getOwnerListingImages', images],
    ] as const) {
      expectNoLeak(`dono ${label}`, result, others);
    }
  });

  it('dono: escrita valida funciona (a matriz nao e vacua) e so toca o proprio anuncio', async () => {
    const owner = actors.get('dono')!;
    const third = actors.get('terceiro')!;
    browserCookie = owner.cookie;
    const prisma = getPrismaClient();
    const thirdBefore = await prisma.listing.findMany({
      where: { ownerId: third.userId! },
      orderBy: { id: 'asc' },
    });
    expect(await updateListing(owner.res!.draft, { title: `Dono ${RUN_ID}` })).toMatchObject({
      success: true,
    });
    expect(await pauseListing(owner.res!.published)).toMatchObject({ success: true });
    expect(
      await prisma.listing.findMany({ where: { ownerId: third.userId! }, orderBy: { id: 'asc' } }),
    ).toEqual(thirdBefore);
  });

  it('sessao revogada depois do uso deixa de valer na chamada seguinte', async () => {
    const email = `sintetico-revogada-tarde-${RUN_ID}@example.test`;
    const userId = await createVerifiedUser(email);
    const draft = await listingOf(userId, 'draft');
    browserCookie = await signIn(email);
    expect(await getListingForEdit(draft)).toMatchObject({ success: true });
    await getPrismaClient().session.deleteMany({ where: { userId } });
    const before = await snapshot();
    expect(await updateListing(draft, { title: 'Depois da revogacao' })).toMatchObject({
      success: false,
      reason: 'unauthenticated',
    });
    expect(await getListingForEdit(draft)).toMatchObject({
      success: false,
      reason: 'unauthenticated',
    });
    expect(await snapshot()).toEqual(before);
  });
});
