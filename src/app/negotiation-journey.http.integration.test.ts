// @vitest-environment node
// HTTP real, sessoes Better Auth reais e PostgreSQL descartavel. Os fatos
// financeiros sao fixtures sinteticas; este teste nao homologa Mercado Pago.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { getPrismaClient } from '@/persistence/prisma';

vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

const BASE = process.env.PRIVATE_SURFACE_BASE_URL?.replace(/\/$/, '') ?? '';
const enabled = process.env.INTEGRATION_EPHEMERAL_DB === '1' && BASE !== '';
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
const RUN = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const PHONE = '+5511987650163';
const userIds: string[] = [];
const ids: Record<string, string> = {};
const cookies: Record<string, string> = {};
const prisma = () => getPrismaClient();
let listingId = '';
let negotiationId = '';

function actionId(name: string, filename: string) {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), '.next/server/server-reference-manifest.json'), 'utf8'),
  ) as { node: Record<string, { exportedName?: string; filename?: string }> };
  const entry = Object.entries(manifest.node).find(
    ([, value]) => value.exportedName === name && value.filename === filename,
  );
  if (!entry) throw new Error(`Action ${name} ausente: execute pnpm build.`);
  return entry[0];
}

async function page(path: string, actor: string, rsc = false) {
  const headers: Record<string, string> = {};
  if (cookies[actor]) headers.cookie = cookies[actor];
  if (rsc) headers.RSC = '1';
  const response = await fetch(`${BASE}${path}${rsc ? '?_rsc' : ''}`, {
    headers,
    redirect: 'manual',
  });
  return {
    status: response.status,
    body: await response.text(),
    cache: response.headers.get('cache-control') ?? '',
    location: response.headers.get('location') ?? '',
  };
}

async function action(
  name: string,
  filename: string,
  actor: string,
  input: unknown,
  path?: string,
) {
  const response = await fetch(`${BASE}${path ?? `/negociacoes/${negotiationId}`}`, {
    method: 'POST',
    headers: {
      cookie: cookies[actor] ?? '',
      accept: 'text/x-component',
      'content-type': 'text/plain;charset=UTF-8',
      'next-action': actionId(name, filename),
    },
    body: JSON.stringify([input]),
    redirect: 'manual',
  });
  return await response.text();
}

function noSecrets(body: string) {
  for (const marker of [PHONE, PHONE.slice(1), '11987650163', '98765-0163', '@example.test']) {
    expect(body).not.toContain(marker);
  }
}

function normalize(body: string, id: string, rsc: boolean) {
  const out = body
    .split(id)
    .join('<ID>')
    .replace(
      /(?<=\\n|\n|")[0-9a-f]+:E\{\\?"digest\\?":\\?"NEXT_HTTP_ERROR_FALLBACK;404\\?"\}(?:\\n|\n)/g,
      '',
    )
    .replace(/(\\?")[A-Za-z0-9_-]{21}([vm])(\\?")/g, '$1<REQ>$2$3')
    .replace(/self\.__next_r=\\?"[^"\\]*\\?"/g, 'self.__next_r=<REQ>')
    .replace(/sentry-trace[^>]*>/g, '')
    .replace(/baggage[^>]*>/g, '')
    .replace(/"(?:sentry-trace|baggage)":"[^"]*"/g, '');
  return rsc ? out.split('\n').sort().join('\n') : out;
}

describe.skipIf(!enabled)('encerramento e avaliacao por HTTP real (#163/#164)', () => {
  beforeAll(async () => {
    if (!process.env.BETTER_AUTH_SECRET)
      throw new Error('Use o mesmo segredo sintetico do servidor.');
    for (const actor of ['owner', 'chosen', 'stranger']) {
      const email = `http-negotiation-${actor}-${RUN}@example.test`;
      expect(
        await registerUser({
          displayName: `Pessoa ${actor}`,
          email,
          password: PASSWORD,
          over18: true,
          termsAccepted: true,
        }),
      ).toMatchObject({ success: true });
      const user = await prisma().user.findFirstOrThrow({ where: { email } });
      ids[actor] = user.id;
      userIds.push(user.id);
      await prisma().user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      });
      const signed = await getAuth().api.signInEmail({
        body: { email, password: PASSWORD },
        returnHeaders: true,
      });
      cookies[actor] = signed.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; ');
    }
    await prisma().userContact.create({ data: { userId: ids.owner, phoneNumber: PHONE } });
    const listing = await prisma().listing.create({
      data: {
        ownerId: ids.owner,
        title: 'Bicicleta da jornada sintetica',
        description: 'Dados controlados para prova HTTP.',
        city: 'Recife',
        uf: 'PE',
      },
    });
    listingId = listing.id;
    await prisma().listing.update({ where: { id: listingId }, data: { status: 'published' } });
    const now = new Date();
    const request = await prisma().contactRequest.create({
      data: {
        listingId,
        requesterId: ids.chosen,
        slotIndex: 1,
        status: 'paid',
        reservedFrom: new Date(now.getTime() - 60_000),
        reservedUntil: new Date(now.getTime() + 29 * 60_000),
        paidAt: now,
      },
    });
    const attempt = await prisma().paymentAttempt.create({
      data: {
        contactRequestId: request.id,
        idempotencyKey: randomUUID(),
        externalReference: `http-sprint-${RUN}`,
        status: 'pagamento_confirmado',
        accreditedAt: now,
        recognizedAt: now,
      },
    });
    await prisma().payment.create({
      data: {
        paymentAttemptId: attempt.id,
        providerPaymentId: `http-sprint-${RUN}`,
        amountCents: 99,
        providerStatus: 'processed',
        accreditedAt: now,
        isCanonical: true,
      },
    });
    const selected = await action(
      'chooseRequester',
      'src/modules/negotiation/actions.ts',
      'owner',
      { listingId, contactRequestId: request.id, confirmed: true },
      `/anuncios/${listingId}/solicitacoes`,
    );
    expect(selected).toContain('"success":true');
    negotiationId = (await prisma().negotiation.findFirstOrThrow({ where: { listingId } })).id;
  });

  afterAll(async () => {
    if (userIds.length === 0) return;
    await prisma().auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma().rating.deleteMany({ where: { negotiation: { listingId } } });
    await prisma().contactAccessEvent.deleteMany({ where: { contactRelease: { listingId } } });
    await prisma().contactRelease.deleteMany({ where: { listingId } });
    await prisma().negotiation.deleteMany({ where: { listingId } });
    await prisma().selection.deleteMany({ where: { listingId } });
    await prisma().payment.deleteMany({ where: { providerPaymentId: `http-sprint-${RUN}` } });
    await prisma().paymentAttempt.deleteMany({ where: { contactRequest: { listingId } } });
    await prisma().contactRequest.deleteMany({ where: { listingId } });
    await prisma().listingTransition.deleteMany({ where: { listingId } });
    await prisma().listing.deleteMany({ where: { id: listingId } });
    await prisma().userContact.deleteMany({ where: { userId: { in: userIds } } });
    await prisma().termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma().verification.deleteMany({
      where: { identifier: { in: userIds.map((id) => `email-verification:${id}`) } },
    });
    await prisma().user.deleteMany({ where: { id: { in: userIds } } });
    await prisma().$disconnect();
  });

  it('ambas as partes recebem pagina privada/no-store sem contato ou nota', async () => {
    for (const actor of ['owner', 'chosen'])
      for (const rsc of [false, true]) {
        const response = await page(`/negociacoes/${negotiationId}`, actor, rsc);
        expect(response.status).toBe(200);
        expect(response.cache).toContain('private');
        expect(response.cache).toContain('no-store');
        if (rsc) {
          expect(response.body).toContain('NegotiationPanel');
          expect(response.body).toContain('"status":"active"');
          expect(response.body).toContain('"rating":null');
        } else expect(response.body).toContain('Encerrar negociação');
        noSecrets(response.body);
      }
  });

  it('terceiro recebe o mesmo recurso inexistente em HTML e RSC; anonimo vai ao login', async () => {
    const ghost = randomUUID();
    for (const rsc of [false, true]) {
      const denied = await page(`/negociacoes/${negotiationId}`, 'stranger', rsc);
      const missing = await page(`/negociacoes/${ghost}`, 'stranger', rsc);
      expect(denied.status).toBe(missing.status);
      expect(missing.status).toBe(rsc ? 200 : 404);
      expect(normalize(denied.body, negotiationId, rsc)).toBe(normalize(missing.body, ghost, rsc));
      noSecrets(denied.body);
      expect(denied.body).not.toContain('Pessoa chosen');
    }
    const anonymous = await page(`/negociacoes/${negotiationId}`, 'anon');
    expect(anonymous.status).toBe(307);
    expect(decodeURIComponent(anonymous.location)).toContain(`next=/negociacoes/${negotiationId}`);
  });

  it('as entradas privadas ligam a negociacao sem incluir contato', async () => {
    const owner = await page(`/anuncios/${listingId}/solicitacoes`, 'owner');
    const chosen = await page('/contatos', 'chosen');
    for (const response of [owner, chosen]) {
      expect(response.body).toContain(`/negociacoes/${negotiationId}`);
      noSecrets(response.body);
    }
  });

  it('avaliar active e encerrar por terceiro ou sem confirmacao nao alteram negocio', async () => {
    const deniedRating = await action(
      'submitRating',
      'src/modules/reputation/actions.ts',
      'owner',
      { negotiationId, score: 1 },
    );
    expect(deniedRating).toContain('"success":false');
    noSecrets(deniedRating);
    for (const [actor, confirmed] of [
      ['stranger', true],
      ['anon', true],
      ['owner', false],
    ] as const) {
      const denied = await action('closeNegotiation', 'src/modules/negotiation/actions.ts', actor, {
        negotiationId,
        confirmed,
      });
      expect(denied).toContain('"success":false');
      noSecrets(denied);
    }
    expect(
      (await prisma().negotiation.findUniqueOrThrow({ where: { id: negotiationId } })).status,
    ).toBe('active');
    expect(await prisma().rating.count({ where: { negotiationId } })).toBe(0);
  });

  it('escolhido encerra; retry do dono nao duplica auditoria nem altera pagamento', async () => {
    for (const actor of ['chosen', 'owner']) {
      const response = await action(
        'closeNegotiation',
        'src/modules/negotiation/actions.ts',
        actor,
        { negotiationId, confirmed: true },
      );
      expect(response).toContain('"success":true');
      noSecrets(response);
    }
    const closed = await prisma().negotiation.findUniqueOrThrow({ where: { id: negotiationId } });
    expect(closed).toMatchObject({ status: 'closed', closedById: ids.chosen });
    expect(
      await prisma().auditEvent.count({
        where: { eventType: 'negotiation.closed', targetId: negotiationId },
      }),
    ).toBe(1);
    expect((await prisma().contactRequest.findFirstOrThrow({ where: { listingId } })).status).toBe(
      'paid',
    );
    expect(await prisma().contactRelease.count({ where: { negotiationId } })).toBe(1);
  });

  it.each(['unverified', 'blocked_age', 'blocked_admin', 'deletion_requested'] as const)(
    'sessao remanescente de conta %s recusa leituras e comandos sem alterar fatos',
    async (state) => {
      await prisma().user.update({
        where: { id: ids.chosen },
        data: state === 'unverified' ? { emailVerified: false } : { status: state },
      });
      try {
        for (const rsc of [false, true]) {
          const response = await page(`/negociacoes/${negotiationId}`, 'chosen', rsc);
          expect(response.status).toBe(rsc ? 200 : 307);
          noSecrets(response.body);
          expect(response.body).not.toContain('Pessoa owner');
          expect(response.body).not.toContain('ownRating');
        }
        const expectedReason = state === 'unverified' ? 'email_unverified' : 'account_restricted';
        for (const [name, filename, input] of [
          [
            'closeNegotiation',
            'src/modules/negotiation/actions.ts',
            { negotiationId, confirmed: true },
          ],
          ['submitRating', 'src/modules/reputation/actions.ts', { negotiationId, score: 3 }],
        ] as const) {
          const response = await action(name, filename, 'chosen', input);
          expect(response).toContain('"success":false');
          expect(response).toContain(`"reason":"${expectedReason}"`);
          noSecrets(response);
        }
        expect(await prisma().rating.count({ where: { negotiationId } })).toBe(0);
        expect(
          await prisma().auditEvent.count({
            where: { eventType: 'negotiation.closed', targetId: negotiationId },
          }),
        ).toBe(1);
        expect(
          (await prisma().contactRequest.findFirstOrThrow({ where: { listingId } })).status,
        ).toBe('paid');
      } finally {
        await prisma().user.update({
          where: { id: ids.chosen },
          data: { status: 'active', emailVerified: true },
        });
      }
    },
  );

  it('primeira nota fica cega; autor pode substituir sem afetar reputacao publica', async () => {
    for (const score of [1, 4]) {
      const response = await action('submitRating', 'src/modules/reputation/actions.ts', 'chosen', {
        negotiationId,
        score,
      });
      expect(response).toContain('"success":true');
    }
    for (const rsc of [false, true]) {
      const owner = await page(`/negociacoes/${negotiationId}`, 'owner', rsc);
      const unescaped = owner.body.replaceAll('\\"', '"');
      expect(unescaped).toContain('"ownRating":null');
      expect(unescaped).not.toMatch(/"score":4/);
      noSecrets(owner.body);
      const publicPage = await page(`/explorar/${listingId}`, 'anon', rsc);
      expect(publicPage.body).toContain('Este anunciante ainda não tem avaliações publicadas.');
      noSecrets(publicPage.body);
    }
    expect(await prisma().rating.count({ where: { negotiationId } })).toBe(1);
  });

  it('segunda nota publica ambas; agregado aparece sem identificar avaliador e edicao posterior e recusada', async () => {
    const published = await action('submitRating', 'src/modules/reputation/actions.ts', 'owner', {
      negotiationId,
      score: 5,
    });
    expect(published).toContain('"success":true');
    noSecrets(published);
    const rows = await prisma().rating.findMany({ where: { negotiationId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.publishedAt !== null)).toBe(true);
    expect(rows[0].publishedAt!.getTime()).toBe(rows[1].publishedAt!.getTime());
    for (const rsc of [false, true]) {
      const publicPage = await page(`/explorar/${listingId}`, 'anon', rsc);
      expect(publicPage.body).toContain('Reputação do anunciante');
      expect(publicPage.body).toContain('4,0');
      expect(publicPage.body).not.toContain(negotiationId);
      expect(publicPage.body).not.toContain(ids.chosen);
      noSecrets(publicPage.body);
    }
    const denied = await action('submitRating', 'src/modules/reputation/actions.ts', 'chosen', {
      negotiationId,
      score: 2,
    });
    expect(denied).toContain('"success":false');
    noSecrets(denied);
    expect(
      (
        await prisma().rating.findUniqueOrThrow({
          where: { negotiationId_evaluatorId: { negotiationId, evaluatorId: ids.chosen } },
        })
      ).score,
    ).toBe(4);
  });
});
