// @vitest-environment node
//
// Prova de F2-011 (#49), D-13: as superficies publicas servidas por um
// servidor Next.js REAL (`pnpm build` + `pnpm start`) sobre PostgreSQL REAL e
// descartavel, por requisicoes HTTP reais (listing-contract.md, secoes 6.2, 7,
// 9 e 11). Nada de DTO simulado:
//
// - HTML e payload RSC de `/`, `/explorar` (filtro e paginas) e do detalhe,
//   para anonimo, dono e terceiro, sem contato, email, ids do dono, estado,
//   termo, chaves de objeto nem imagem nao `ready`;
// - 404 identico (status e corpo normalizado) para todo anuncio nao visivel,
//   inexistente e malformado, inclusive para o proprio dono;
// - `Cache-Control` nunca publico;
// - depois de T3 (pausa) e T5 (encerramento) com o detalhe e a midia ja
//   requisitados, a proxima requisicao e 404, e /media deixa de servir;
// - C-1 (contact-release.md; F3-002, #92): o contato dos donos e gravado pela
//   operacao real de `contact`, na forma canonica E.164, e nenhuma resposta
//   publica -- corpo nem cabecalhos de HTML, RSC, metadados e /media -- contem
//   o numero em nenhuma variante de escrita.
//
// Execucao (docs/engineering/testing.md): o servidor e o teste usam o MESMO
// banco efemero e o MESMO BETTER_AUTH_SECRET. So roda com
// INTEGRATION_EPHEMERAL_DB=1 e PUBLIC_SURFACE_BASE_URL; a parte de /media com
// bytes reais exige tambem R2_INTEGRATION=1 e o bucket de development.
import { randomBytes, randomUUID } from 'node:crypto';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ListingStatus, UserStatus } from '@/generated/prisma/client';
import { registerOwnContact } from '@/modules/contact';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { closeListing } from '@/app/anuncios/actions';
import { pauseListing } from '@/modules/listing/actions';
import { derivativeKey, originalKey } from '@/modules/media/keys';
import { MEDIA_KINDS } from '@/modules/media/media-path';
import { getR2Config, putDerivative } from '@/modules/media/s3';
import { getPrismaClient } from '@/persistence/prisma';

let actionCookie = '';
vi.mock('next/headers', () => ({
  headers: async () => new Headers(actionCookie ? { cookie: actionCookie } : {}),
}));
vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

const BASE_URL = process.env.PUBLIC_SURFACE_BASE_URL?.replace(/\/$/, '') ?? '';
const enabled = process.env.INTEGRATION_EPHEMERAL_DB === '1' && BASE_URL !== '';
const withR2 = enabled && process.env.R2_INTEGRATION === '1';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const CITY = `Cidade Http ${RUN_ID}`;
const PASSWORD = 'senha-sintetica-123';
// Alternativas de troca (#76) do anuncio visivel; a terceira traz marcacao,
// que precisa voltar escapada no HTML.
const TRADE_OPTIONS = ['Notebook sintetico', 'Videogame sintetico', 'Camera <b>e um radio</b>'];
const TRADE_OPTIONS_HTML = [
  TRADE_OPTIONS[0],
  TRADE_OPTIONS[1],
  'Camera &lt;b&gt;e um radio&lt;/b&gt;',
];
// Contato sintetico (PD-13.3). PHONE e a entrada; PHONE_E164, o que o banco guarda.
const PHONE = '+55 11 90000-0000';
const PHONE_E164 = '+5511900000000';
const PHONE_DIGITS = '11900000000';
/** C-1: toda forma de escrita do numero que uma resposta poderia carregar. */
const PHONE_VARIANTS = [
  PHONE,
  PHONE_E164,
  PHONE_E164.slice(1),
  PHONE_DIGITS,
  '(11) 90000-0000',
  '(11) 900000000',
  '11 90000-0000',
  '90000-0000',
  '%2B5511900000000',
  // `+` escapado como em JSON/RSC.
  '\\u002B5511900000000',
];
const emails = {
  owner: `sintetico-dono-${RUN_ID}@example.test`,
  third: `sintetico-terceiro-${RUN_ID}@example.test`,
};

const userIds: string[] = [];
const imageIds: string[] = [];

const PATH_TO: Record<ListingStatus, ListingStatus[]> = {
  draft: [],
  published: ['published'],
  paused: ['published', 'paused'],
  closed: ['closed'],
  removed: ['removed'],
};

async function registerVerified(email: string): Promise<string> {
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
  userIds.push(id);
  return id;
}

/** Contato pela operacao real de `contact` (CR-2.2), com a sessao do proprio dono. */
async function registerContact(cookie: string) {
  actionCookie = cookie;
  try {
    expect(await registerOwnContact({ phone: PHONE })).toEqual({
      success: true,
      hasContact: true,
    });
  } finally {
    actionCookie = '';
  }
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

async function createBlockedOwner(status: UserStatus): Promise<string> {
  const prisma = getPrismaClient();
  const { id } = await prisma.user.create({
    data: {
      displayName: `Dono ${status}`,
      email: `sintetico-${status}-${RUN_ID}@example.test`,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
    select: { id: true },
  });
  userIds.push(id);
  // Conta inelegivel nao tem sessao para a operacao: fixture ja canonica.
  await prisma.userContact.create({ data: { userId: id, phoneNumber: PHONE_E164 } });
  await prisma.user.update({ where: { id }, data: { status } });
  return id;
}

async function createListing(ownerId: string, status: ListingStatus, title: string) {
  const prisma = getPrismaClient();
  const { id } = await prisma.listing.create({
    data: { ownerId, title, description: 'Descricao sintetica.', city: CITY, uf: 'PE' },
    select: { id: true },
  });
  for (const step of PATH_TO[status]) {
    await prisma.listing.update({ where: { id }, data: { status: step } });
  }
  return id;
}

let webp: Buffer;

/** Imagem com derivados; no R2 real quando habilitado, senao so no banco. */
async function addImage(listingId: string, position: number, status: 'ready' | 'uploaded') {
  const prisma = getPrismaClient();
  const id = randomUUID();
  imageIds.push(id);
  await prisma.listingImage.create({
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
    },
  });
  if (status === 'ready') {
    for (const kind of MEDIA_KINDS) {
      const key = derivativeKey(id, 1, kind);
      if (withR2) await putDerivative(key, webp);
      await prisma.imageDerivative.create({
        data: { imageId: id, kind, objectKey: key, width: 400, height: 300 },
      });
    }
  }
  return id;
}

interface Snapshot {
  status: number;
  body: string;
  cacheControl: string;
}

async function fetchPage(path: string, opts: { cookie?: string; rsc?: boolean } = {}) {
  const headers: Record<string, string> = { 'user-agent': 'agente-sintetico/1.0' };
  if (opts.cookie) headers.cookie = opts.cookie;
  // Payload RSC da navegacao no cliente: cabecalho `RSC: 1`
  // (next/dist/client/components/app-router-headers.js) e o parametro `_rsc`.
  // No Next 16, `_rsc` e o hash dos cabecalhos de roteamento; sem nenhum deles
  // o valor esperado e vazio, e sem o parametro a resposta e 307 para `?_rsc`.
  let url = `${BASE_URL}${path}`;
  if (opts.rsc) {
    headers.rsc = '1';
    url += `${path.includes('?') ? '&' : '?'}_rsc`;
  }
  const res = await fetch(url, { headers, redirect: 'manual' });
  return {
    status: res.status,
    body: await res.text(),
    cacheControl: res.headers.get('cache-control') ?? '',
    contentType: res.headers.get('content-type') ?? '',
    headerText: serializeHeaders(res.headers),
  };
}

function serializeHeaders(headers: Headers): string {
  return [...headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
}

/** C-1: nenhuma variante do numero, em nenhum campo nem nivel de aninhamento. */
function expectNoContact(label: string, ...parts: string[]) {
  const all = parts.join('\n');
  for (const variant of PHONE_VARIANTS) {
    expect(all.includes(variant), `${label} contem o contato (${variant.length} caracteres)`).toBe(
      false,
    );
  }
}

/** Texto sem os separadores `<!-- -->` que o React insere entre nos de texto. */
function text(body: string): string {
  return body.replaceAll('<!-- -->', '');
}

// Marcador que o Next 16.3.5 grava no payload RSC quando a pagina chama
// `notFound()`: a resposta de navegacao no cliente e HTTP 200 por construcao do
// framework, e o 404 vai no conteudo. Rota inexistente qualquer faz o mesmo.
const RSC_NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';

// Linha do payload com o digest do 404, no HTML (escapada) ou no RSC. Sua
// posicao no stream depende de quando `notFound()` ocorre: ID malformado e
// recusado antes da consulta, e a linha sai mais cedo. O conteudo e o mesmo.
// A linha comeca depois de um separador de linha (`\n` literal no HTML) ou no
// inicio da string do chunk, e seu id e hexadecimal.
const NOT_FOUND_ROW =
  /(?<=\\n|\n|")[0-9a-f]+:E\{\\?"digest\\?":\\?"NEXT_HTTP_ERROR_FALLBACK;404\\?"\}(?:\\n|\n)/g;

// ID malformado com o comprimento de um UUID (36). O payload RSC do layout e
// dividido em linhas por orcamento de bytes, e o ponto de corte muda com o
// tamanho da URL: um ID de outro comprimento da o mesmo conteudo com outra
// divisao em linhas, sem carregar dado (listing-contract.md, secao 16.3). A
// comparacao byte a byte usa por isso um malformado de mesmo comprimento; o
// curto continua provado como 404 limpo, sem a comparacao.
const MALFORMED_SAME_LENGTH = 'nao-e-uuid-nao-e-uuid-nao-e-uuid-zzz';
const MALFORMED_SHORT = 'nao-uuid';

/**
 * Remove o que varia por requisicao: o proprio ID, rastros do Sentry e a
 * posicao da linha do 404 (cuja presenca e conferida a parte).
 */
function normalize(body: string, id: string): string {
  return (
    body
      .split(id)
      .join('<ID>')
      .replace(NOT_FOUND_ROW, '')
      // Chaves por requisicao que o Next deriva do `requestId` (nanoid de 21
      // caracteres + sufixo) nos elementos de metadata/viewport do payload RSC:
      // variam ate para o mesmo ID e nao carregam dado do anuncio.
      .replace(/(\\?")[A-Za-z0-9_-]{21}([vm])(\\?")/g, '$1<REQ>$2$3')
      .replace(/self\.__next_r=\\?"[^"\\]*\\?"/g, 'self.__next_r=<REQ>')
      .replace(/sentry-trace[^>]*>/g, '')
      .replace(/baggage[^>]*>/g, '')
      .replace(/"(?:sentry-trace|baggage)":"[^"]*"/g, '')
  );
}

describe.skipIf(!enabled)('superficies publicas por HTTP real (#49, D-13)', () => {
  let owner: string;
  let ownerCookie: string;
  let thirdCookie: string;
  let visible: string;
  let toPause: string;
  let toClose: string;
  let readyImage: string;
  let pendingImage: string;
  let pauseImage: string;
  const hidden: Record<string, string> = {};
  let forbidden: string[];

  beforeAll(async () => {
    if (!process.env.BETTER_AUTH_SECRET) {
      throw new Error('Defina o mesmo BETTER_AUTH_SECRET do servidor em teste.');
    }
    if (withR2 && !getR2Config().bucket.endsWith('-development')) {
      throw new Error('A prova de midia so roda contra o bucket de development.');
    }
    webp = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 30, g: 120, b: 200 } },
    })
      .webp({ quality: 80 })
      .toBuffer();

    owner = await registerVerified(emails.owner);
    const third = await registerVerified(emails.third);
    ownerCookie = await signIn(emails.owner);
    thirdCookie = await signIn(emails.third);
    await registerContact(ownerCookie);
    await registerContact(thirdCookie);
    // Sanidade de C-1: o que esta no banco e a forma canonica, e e ela que se procura.
    const stored = await getPrismaClient().userContact.findMany({
      where: { userId: { in: [owner, third] } },
      select: { phoneNumber: true },
    });
    expect(stored.map((c) => c.phoneNumber)).toEqual([PHONE_E164, PHONE_E164]);

    visible = await createListing(owner, 'published', `Visivel ${RUN_ID}`);
    // Alternativas de troca (#76): gravadas fora de ordem; o detalhe as mostra
    // pela posicao do anunciante.
    for (const [position, label] of TRADE_OPTIONS.map((l, i) => [i + 1, l] as const).reverse()) {
      await getPrismaClient().listingTradeOption.create({
        data: { listingId: visible, position, label },
      });
    }
    readyImage = await addImage(visible, 1, 'ready');
    pendingImage = await addImage(visible, 2, 'uploaded');
    toPause = await createListing(owner, 'published', `Para pausar ${RUN_ID}`);
    pauseImage = await addImage(toPause, 1, 'ready');
    toClose = await createListing(owner, 'published', `Para encerrar ${RUN_ID}`);
    // Mais 20 publicados: 23 no total, duas paginas de 20 em /explorar.
    for (let i = 0; i < 20; i++) {
      await createListing(owner, 'published', `Lote ${i} ${RUN_ID}`);
    }
    for (const status of ['draft', 'paused', 'closed', 'removed'] as const) {
      hidden[status] = await createListing(owner, status, `Oculto ${status} ${RUN_ID}`);
    }
    for (const status of ['blocked_age', 'blocked_admin', 'deletion_requested'] as const) {
      hidden[status] = await createListing(
        await createBlockedOwner(status),
        'published',
        `Oculto ${status} ${RUN_ID}`,
      );
    }

    forbidden = [
      ...PHONE_VARIANTS,
      ...userIds,
      ...Object.values(hidden),
      pendingImage,
      'ownerId',
      'owner_id',
      'termsVersion',
      'termsAcceptance',
      'updatedAt',
      'publishedAt',
      'objectKey',
      'originals/',
      'derivatives/',
      'blocked_age',
      'blocked_admin',
      'deletion_requested',
    ];
  });

  afterAll(async () => {
    const prisma = getPrismaClient();
    if (withR2) {
      const config = getR2Config();
      const client = new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      });
      for (const id of imageIds) {
        const listed = await client.send(
          new ListObjectsV2Command({ Bucket: config.bucket, Prefix: `derivatives/${id}/` }),
        );
        for (const object of listed.Contents ?? []) {
          await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: object.Key! }));
        }
        const left = await client.send(
          new ListObjectsV2Command({ Bucket: config.bucket, Prefix: `derivatives/${id}/` }),
        );
        expect(left.KeyCount ?? 0).toBe(0);
      }
    }
    await prisma.imageDerivative.deleteMany({
      where: { image: { listing: { ownerId: { in: userIds } } } },
    });
    await prisma.listingImage.deleteMany({ where: { listing: { ownerId: { in: userIds } } } });
    await prisma.mediaObjectDeletion.deleteMany({
      where: { OR: imageIds.map((id) => ({ objectKey: { contains: id } })) },
    });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.listingTransition.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.listing.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.userContact.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.verification.deleteMany({
      where: { identifier: { in: userIds.map((u) => `email-verification:${u}`) } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  function expectClean(label: string, body: string, allowOwnIdentity = false, requested = '') {
    for (const marker of forbidden) {
      if (allowOwnIdentity && marker === owner) continue;
      // O ID pedido na URL volta como eco do proprio caminho, e nao revela nada.
      if (marker === requested) continue;
      expect(body.includes(marker), `${label} contem ${marker}`).toBe(false);
    }
    // Emails: so o proprio dono poderia ver o seu (nenhuma destas paginas o exibe).
    expect(body, label).not.toContain(emails.third);
    if (!allowOwnIdentity) expect(body, label).not.toContain(emails.owner);
    expect(body, label).not.toMatch(/"status":"(draft|published|paused|closed|removed)"/);
  }

  function expectNotPublicCache(label: string, page: Snapshot) {
    expect(page.cacheControl, label).not.toMatch(/public|s-maxage|stale-while-revalidate/);
    expect(page.cacheControl, label).toMatch(/no-store|private/);
  }

  const viewers = () =>
    [
      ['anonimo', undefined],
      ['terceiro', thirdCookie],
      ['dono', ownerCookie],
    ] as const;

  // A entrada do site e a landing publica (pagina inicial do consentimento do
  // Google), com a vitrine e os links legais; nunca carrega dado privado.
  it('/ abre a landing publica, com ou sem sessao, sem dado privado', async () => {
    for (const [who, cookie] of viewers()) {
      for (const rsc of [false, true]) {
        const label = `${who} ${rsc ? 'RSC' : 'HTML'} /`;
        const page = await fetchPage('/', { cookie, rsc });
        expect(page.status, label).toBe(200);
        expectClean(label, page.body, who === 'dono');
        expectNoContact(label, page.body, page.headerText);
        expectNotPublicCache(label, page);
        if (!rsc) {
          expect(page.body, label).toContain('href="/privacidade"');
          expect(page.body, label).toContain('href="/termos"');
        }
      }
    }
  });

  it('/privacidade e /termos abrem sem sessao', async () => {
    for (const path of ['/privacidade', '/termos']) {
      const page = await fetchPage(path);
      expect(page.status, path).toBe(200);
      expectNoContact(path, page.body, page.headerText);
    }
  });

  it('HTML e RSC de /explorar e detalhe nao carregam dado privado', async () => {
    const paths = [
      '/explorar',
      `/explorar?city=${encodeURIComponent(CITY)}`,
      `/explorar?city=${encodeURIComponent(CITY)}&page=2`,
      `/explorar/${visible}`,
    ];
    for (const [who, cookie] of viewers()) {
      for (const path of paths) {
        for (const rsc of [false, true]) {
          const label = `${who} ${rsc ? 'RSC' : 'HTML'} ${path}`;
          const page = await fetchPage(path, { cookie, rsc });
          expect(page.status, label).toBe(200);
          if (rsc) expect(page.contentType, label).toContain('text/x-component');
          expectClean(label, page.body, who === 'dono');
          expectNoContact(label, page.body, page.headerText);
          expectNotPublicCache(label, page);
        }
      }
    }
  });

  it('/explorar pagina e filtra pela URL real', async () => {
    const q = `city=${encodeURIComponent(CITY).replaceAll('%20', '+')}`;
    const first = await fetchPage(`/explorar?city=${encodeURIComponent(CITY)}`);
    expect(text(first.body)).toContain('23 anúncio(s) disponível(is) · página 1 de 2');
    expect(first.body).toContain(`href="/explorar?${q}&amp;page=2"`);
    expect(first.body).toContain('aria-current="page"');
    const second = await fetchPage(`/explorar?city=${encodeURIComponent(CITY)}&page=2`);
    expect(text(second.body)).toContain('23 anúncio(s) disponível(is) · página 2 de 2');
    expect(second.body).toContain(`href="/explorar?${q}"`);
    const firstIds = [...first.body.matchAll(/href="\/explorar\/([0-9a-f-]{36})"/g)].map(
      (m) => m[1],
    );
    const secondIds = [...second.body.matchAll(/href="\/explorar\/([0-9a-f-]{36})"/g)].map(
      (m) => m[1],
    );
    expect(firstIds).toHaveLength(20);
    expect(secondIds).toHaveLength(3);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(23);
    const beyond = await fetchPage(`/explorar?city=${encodeURIComponent(CITY)}&page=9`);
    expect(beyond.status).toBe(200);
    expect(text(beyond.body)).toContain('Há 23 anúncio(s) em 2 página(s)');
    const badUf = await fetchPage(`/explorar?city=${encodeURIComponent(CITY)}&state=XX1`);
    expect(text(badUf.body)).toContain('Nenhum anúncio encontrado para esse filtro');
  });

  it('detalhe visivel: metadata e imagens so da projecao publica', async () => {
    const page = await fetchPage(`/explorar/${visible}`);
    expect(page.body).toContain(`<title>Visivel ${RUN_ID} — TROQ</title>`);
    expect(page.body).toContain(`/media/${readyImage}/large`);
    expect(page.body).toContain(`Imagem 1 de 1: Visivel ${RUN_ID}`);
    expect(page.body).not.toContain(pendingImage);
    // C-1 nos metadados: <head> inteiro (title, description, og:*, viewport).
    const head = page.body.slice(0, page.body.indexOf('</head>'));
    expect(head.length).toBeGreaterThan(0);
    expectNoContact('metadados do detalhe', head);
  });

  it('detalhe visivel mostra as alternativas de troca ao anonimo, em ordem e como texto (#76)', async () => {
    const page = await fetchPage(`/explorar/${visible}`);
    expect(page.status).toBe(200);
    const body = text(page.body);
    expect(body).toContain('Aceita em troca');
    const positions = TRADE_OPTIONS_HTML.map((label) => body.indexOf(label));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // A marcacao gravada como texto volta escapada, nunca como elemento.
    expect(page.body).not.toContain('<b>e um radio</b>');
    // A listagem nao carrega o campo (allowlist, listing-contract.md 6.1).
    expect((await fetchPage(`/explorar?city=${encodeURIComponent(CITY)}`)).body).not.toContain(
      TRADE_OPTIONS[0],
    );
  });

  // Anuncio publicado antes de DEC-049 (#86; listing-contract.md, 10.2), com
  // contato e endereco gravados no texto livre: continua publico, mas nenhum
  // canal -- HTML, RSC, metadata, alt das imagens e listagem -- carrega o
  // texto. Cidade propria para nao mudar a paginacao de CITY.
  it('legado com contato no texto livre: nenhuma superficie publica divulga o texto (#86)', async () => {
    const prisma = getPrismaClient();
    const legacyCity = `Legado Http ${RUN_ID}`;
    const { id } = await prisma.listing.create({
      data: {
        ownerId: owner,
        title: 'Bike 11 98765-4321',
        description: 'Retirar na Rua Augusta, 500. Escreva para fulano@exemplo.test',
        city: legacyCity,
        uf: 'PE',
        tradeOptions: {
          create: [
            { position: 1, label: 'Um notebook' },
            { position: 2, label: 'wa.me/5511987654321' },
            { position: 3, label: 'Uma camera' },
          ],
        },
      },
      select: { id: true },
    });
    await prisma.listing.update({ where: { id }, data: { status: 'published' } });
    await addImage(id, 1, 'ready');
    const leaked = ['98765', '987654321', 'Augusta', 'fulano', 'exemplo.test', 'wa.me'];

    const paths = [`/explorar?city=${encodeURIComponent(legacyCity)}`, `/explorar/${id}`];
    for (const [who, cookie] of viewers()) {
      for (const path of paths) {
        for (const rsc of [false, true]) {
          const label = `${who} ${rsc ? 'RSC' : 'HTML'} ${path}`;
          const page = await fetchPage(path, { cookie, rsc });
          expect(page.status, label).toBe(200);
          for (const marker of leaked) {
            expect(page.body.includes(marker), `${label} contem ${marker}`).toBe(false);
            expect(page.headerText.includes(marker), `${label} cabecalho ${marker}`).toBe(false);
          }
          expectNotPublicCache(label, page);
        }
      }
    }

    const detail = await fetchPage(`/explorar/${id}`);
    const body = text(detail.body);
    expect(detail.body).toContain('<title>Anúncio em revisão — TROQ</title>');
    expect(body).toContain('A descrição deste anúncio está em revisão pelo anunciante.');
    expect(body).toContain('Alternativa em revisão');
    expect(body).toContain('Imagem 1 de 1: Anúncio em revisão');
    const list = text((await fetchPage(`/explorar?city=${encodeURIComponent(legacyCity)}`)).body);
    expect(list).toContain('Anúncio em revisão');
  });

  it('C-1: /media do anuncio do dono com contato nao carrega o numero', async () => {
    for (const [who, cookie] of viewers()) {
      for (const kind of MEDIA_KINDS) {
        const res = await fetch(`${BASE_URL}/media/${readyImage}/${kind}`, {
          headers: cookie ? { cookie } : {},
          redirect: 'manual',
        });
        const label = `${who} /media ${kind}`;
        // Sem R2 nao ha bytes para servir; com R2 a imagem e servida. Nos dois
        // casos, nem o corpo nem os cabecalhos carregam o contato.
        if (withR2) expect(res.status, label).toBe(200);
        const body = Buffer.from(await res.arrayBuffer()).toString('latin1');
        expectNoContact(label, body, serializeHeaders(res.headers));
      }
    }
  });

  it('404 identico para nao visivel, inexistente e malformado, para qualquer visitante', async () => {
    const targets = [
      ...Object.entries(hidden),
      ['inexistente', randomUUID()],
      ['malformado', MALFORMED_SAME_LENGTH],
      ['malformado curto', MALFORMED_SHORT],
    ];
    for (const rsc of [false, true]) {
      let reference: string | null = null;
      for (const [who, cookie] of viewers()) {
        for (const [label, id] of targets) {
          const page = await fetchPage(`/explorar/${id}`, { cookie, rsc });
          const tag = `${who} ${rsc ? 'RSC' : 'HTML'} ${label}`;
          if (rsc) {
            expect(page.status, tag).toBe(200);
            expect(page.body, tag).toContain(RSC_NOT_FOUND);
          } else {
            expect(page.status, tag).toBe(404);
          }
          expect(page.body, tag).not.toContain('Oculto');
          expectClean(tag, page.body, who === 'dono', id);
          expectNotPublicCache(tag, page);
          expect(page.body.match(NOT_FOUND_ROW), tag).toHaveLength(1);
          // No RSC cada linha e uma linha do stream, e a ordem em que elas
          // chegam depende do tempo de cada consulta: compara-se o conjunto
          // de linhas (mesmo conteudo), e nao a ordem.
          const normalized = rsc
            ? normalize(page.body, id).split('\n').sort().join('\n')
            : normalize(page.body, id);
          if (id === MALFORMED_SHORT) continue;
          reference ??= normalized;
          expect(normalized, tag).toBe(reference);
        }
      }
    }
  });

  it('T3 e T5 retiram o anuncio na requisicao seguinte, com cache ja aquecido', async () => {
    for (const id of [toPause, toClose]) {
      for (let i = 0; i < 2; i++) {
        expect((await fetchPage(`/explorar/${id}`)).status).toBe(200);
      }
    }
    const mediaUrl = `${BASE_URL}/media/${pauseImage}/medium`;
    if (withR2) {
      for (let i = 0; i < 2; i++) {
        const res = await fetch(mediaUrl);
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('private, no-store');
        await res.arrayBuffer();
      }
    }

    actionCookie = ownerCookie;
    expect(await pauseListing(toPause)).toMatchObject({ success: true });
    expect(await closeListing(toClose)).toMatchObject({ success: true });
    actionCookie = '';

    for (const id of [toPause, toClose]) {
      expect((await fetchPage(`/explorar/${id}`)).status).toBe(404);
      const rsc = await fetchPage(`/explorar/${id}`, { rsc: true });
      expect(rsc.body).toContain(RSC_NOT_FOUND);
      expect(rsc.body).not.toContain(RUN_ID);
      const list = await fetchPage(`/explorar?city=${encodeURIComponent(CITY)}`);
      expect(list.body).not.toContain(id);
    }
    const media = await fetch(mediaUrl);
    expect(media.status).toBe(404);
    expect(media.headers.get('cache-control')).toBe('private, no-store');
  });
});
