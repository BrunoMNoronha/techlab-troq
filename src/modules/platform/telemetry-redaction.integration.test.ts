// @vitest-environment node
//
// Prova de F2-012 (#50): credenciais, tokens, telefone/WhatsApp e chaves de
// original NAO saem na telemetria nem nos logs, com ERROS REAIS de fluxos
// reais contra PostgreSQL descartavel (docs/delivery/phase-2-security-
// verification.md).
//
// A SDK do Sentry e a REAL (`@sentry/nextjs`), inicializada com as opcoes de
// producao (`createTelemetryOptions`: beforeSend, beforeBreadcrumb, ...) e um
// transporte que so CAPTURA os envelopes: nada sai da maquina. Os erros vem de
// Server Actions executadas com a tabela de anuncios indisponivel, de uma
// conexao recusada por senha errada e de um login recusado.
//
// So roda com INTEGRATION_EPHEMERAL_DB=1. Dados sinteticos, removidos ao final.
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@/generated/prisma/client';
import { loginUser, registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { createDraftListing, getOwnerListings, updateListing } from '@/modules/listing/actions';
import { getOwnerListingImages } from '@/modules/media/actions';
import { originalKey } from '@/modules/media/keys';
import { getPrismaClient } from '@/persistence/prisma';
import { createTelemetryOptions } from './telemetry/sentry-options';

let browserCookie = '';
const setCookies: string[] = [];
vi.mock('next/headers', () => ({
  headers: async () => new Headers(browserCookie ? { cookie: browserCookie } : {}),
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    set: (...args: unknown[]) => setCookies.push(JSON.stringify(args)),
    delete: () => undefined,
    has: () => false,
  }),
}));
vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

const enabled = process.env.INTEGRATION_EPHEMERAL_DB === '1';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const WRONG_DB_PASSWORD = 'senha-banco-errada-sintetica';
const PHONE = '+55 11 90000-0000';
const email = `sintetico-telemetria-${RUN_ID}@example.test`;

const envelopes: string[] = [];

describe.skipIf(!enabled)('telemetria e logs sem segredo com erros reais (#50)', () => {
  let userId: string;
  let listingId: string;
  let secrets: string[];
  const logged: string[] = [];

  beforeAll(async () => {
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');

    Sentry.init({
      ...createTelemetryOptions(),
      // DSN sintetica: o transporte abaixo substitui a rede.
      dsn: 'https://public@o0.ingest.sentry.io/0',
      transport: () => ({
        send: async (envelope: unknown) => {
          envelopes.push(JSON.stringify(envelope));
          return {};
        },
        flush: async () => true,
      }),
    });

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
    await prisma.userContact.create({ data: { userId, phoneNumber: PHONE } });
    ({ id: listingId } = await prisma.listing.create({
      data: { ownerId: userId, title: 'Telemetria', description: 'x', city: 'Recife', uf: 'PE' },
      select: { id: true },
    }));
    const { headers } = await getAuth().api.signInEmail({
      body: { email, password: PASSWORD },
      headers: new Headers({ 'user-agent': 'agente-sintetico/1.0' }),
      returnHeaders: true,
    });
    browserCookie = headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');

    const account = await prisma.account.findFirstOrThrow({
      where: { userId },
      select: { password: true },
    });
    const sessions = await prisma.session.findMany({ where: { userId }, select: { token: true } });
    secrets = [
      PASSWORD,
      WRONG_DB_PASSWORD,
      account.password!,
      ...sessions.map((s) => s.token),
      ...browserCookie.split('; ').map((c) => c.split('=')[1]),
      process.env.BETTER_AUTH_SECRET!,
      PHONE,
      '90000-0000',
      originalKey(listingId, 1),
    ];
    const dbUrl = process.env.DATABASE_URL ?? '';
    const dbPassword = /:\/\/[^:]+:([^@]+)@/.exec(dbUrl)?.[1];
    if (dbPassword) secrets.push(`:${dbPassword}@`);
    secrets.push(dbUrl);

    for (const method of ['error', 'warn', 'log'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(
          args
            .map((a) =>
              a instanceof Error ? `${a.name}: ${a.message}\n${a.stack}` : JSON.stringify(a),
            )
            .join(' '),
        );
      });
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    const prisma = getPrismaClient();
    await prisma.$executeRawUnsafe(
      `ALTER TABLE IF EXISTS "listings_indisponivel_${RUN_ID.replace(/-/g, '_')}" RENAME TO "listings"`,
    );
    await prisma.listing.deleteMany({ where: { ownerId: userId } });
    await prisma.userContact.deleteMany({ where: { userId } });
    await prisma.termsAcceptance.deleteMany({ where: { userId } });
    await prisma.verification.deleteMany({
      where: { identifier: `email-verification:${userId}` },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    await Sentry.close(2000);
    vi.unstubAllEnvs();
  });

  it('erros reais passam pela SDK e pelos logs sem credencial, token, contato ou chave', async () => {
    const prisma = getPrismaClient();
    const hidden = `listings_indisponivel_${RUN_ID.replace(/-/g, '_')}`;

    // 1. Banco falhando no meio de Server Actions reais, com sessao valida.
    await prisma.$executeRawUnsafe(`ALTER TABLE "listings" RENAME TO "${hidden}"`);
    try {
      const results = [
        await getOwnerListings(),
        await createDraftListing({
          title: `Contato ${PHONE}`,
          description: `Me chame no WhatsApp ${PHONE}`,
          city: 'Recife',
          state: 'PE',
        }),
        await updateListing(listingId, { description: `WhatsApp ${PHONE}` }),
        await getOwnerListingImages(listingId),
      ];
      for (const result of results) {
        expect(result).toMatchObject({ success: false, reason: 'error' });
        const json = JSON.stringify(result);
        for (const secret of secrets) expect(json.includes(secret)).toBe(false);
      }
      try {
        await prisma.listing.findMany({ where: { ownerId: userId } });
        expect.unreachable('a consulta deveria falhar');
      } catch (err) {
        Sentry.captureException(err, {
          extra: { cookie: browserCookie, phone: PHONE },
        });
      }
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${hidden}" RENAME TO "listings"`);
    }

    // 2. Conexao recusada por senha errada: erro real do driver.
    const url = new URL(process.env.DATABASE_URL!);
    url.password = WRONG_DB_PASSWORD;
    const wrong = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
    try {
      await wrong.$queryRawUnsafe('SELECT 1');
      expect.unreachable('a conexao deveria ser recusada');
    } catch (err) {
      console.error('[teste] conexao recusada', err);
      Sentry.captureException(err);
    } finally {
      await wrong.$disconnect();
    }

    // 3. Login recusado por senha errada, pela Server Action real.
    const login = await loginUser(email, `${PASSWORD}-errada`);
    expect(login).toMatchObject({ success: false });
    Sentry.captureMessage(`login recusado para ${email} com cookie ${browserCookie}`);

    await Sentry.flush(2000);

    expect(envelopes.length).toBeGreaterThanOrEqual(3);
    const sent = envelopes.join('\n');
    for (const secret of secrets) {
      expect(sent.includes(secret), `telemetria contem segredo (${secret.length} chars)`).toBe(
        false,
      );
    }
    expect(sent).not.toContain(email);

    // Os logs do servidor (que vao para os logs da Vercel) tambem nao carregam
    // credencial, token nem contato.
    expect(logged.length).toBeGreaterThan(0);
    const logs = logged.join('\n');
    for (const secret of secrets) {
      expect(logs.includes(secret), `log contem segredo (${secret.length} chars)`).toBe(false);
    }
  });
});
