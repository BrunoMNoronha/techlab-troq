// @vitest-environment node
//
// Prova de integracao de F3-002 (#92): registrar ou alterar o proprio contato
// contra o Better Auth REAL e PostgreSQL REAL e descartavel (contact-release.md,
// CR-2.2 e CR-2.5; data-model.md, DM-4.5 e DM-11.2).
//
// Cada ator recusado e EXERCITADO (PD-13.2): anonimo, e-mail nao verificado,
// conta bloqueada e conta com exclusao solicitada tentam gravar, e o banco e
// conferido depois. Sessoes reais; o unico mock e `headers()` do Next.js.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1 (docs/engineering/
// testing.md, secao 2.2). Dados sinteticos, removidos ao final.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerUser } from '@/modules/identity/actions';
import { getAuth } from '@/modules/identity/auth';
import { getPrismaClient } from '@/persistence/prisma';
import { getOwnContactStatus, hasContact, registerOwnContact } from '.';

const cookieStore = new AsyncLocalStorage<string>();

vi.mock('next/headers', () => ({
  headers: async () => {
    const cookie = cookieStore.getStore() ?? '';
    return new Headers(cookie ? { cookie } : {});
  },
}));

vi.mock('@/modules/identity/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const PASSWORD = 'senha-sintetica-123';
const FIRST = { raw: '(11) 91234-5678', e164: '+5511912345678' };
const SECOND = { raw: '+55 81 3456-7890', e164: '+558134567890' };
/** Canonica, sem `+` e sem DDI. Os 4 ultimos digitos ficam de fora: UUIDs os contem por acaso. */
const VARIANTS = (e164: string) => [e164, e164.slice(1), e164.slice(3)];

const email = (tag: string) => `it-contato-${tag}-${RUN_ID}@example.test`;
const prisma = () => getPrismaClient();

const ids: Record<string, string> = {};
const cookies: Record<string, string> = {};

async function createUser(tag: string): Promise<void> {
  const res = await registerUser({
    displayName: 'Pessoa Sintetica',
    email: email(tag),
    password: PASSWORD,
    over18: true,
    termsAccepted: true,
  });
  expect(res.success).toBe(true);
  const { id } = await prisma().user.findFirstOrThrow({ where: { email: email(tag) } });
  await prisma().user.update({
    where: { id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  ids[tag] = id;
}

async function signIn(tag: string): Promise<string> {
  const { headers } = await getAuth().api.signInEmail({
    body: { email: email(tag), password: PASSWORD },
    headers: new Headers({ 'user-agent': 'agente-sintetico/1.0' }),
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  expect(cookie).toContain('session_token=');
  return cookie;
}

function as<T>(tag: string, fn: () => Promise<T>): Promise<T> {
  return cookieStore.run(cookies[tag] ?? '', fn);
}

function expectNoNumber(value: unknown, e164: string) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const variant of VARIANTS(e164)) expect(text).not.toContain(variant);
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'contato do proprio dono: Better Auth real contra PostgreSQL descartavel (#92)',
  () => {
    const log = { error: vi.spyOn(console, 'error'), warn: vi.spyOn(console, 'warn') };

    beforeAll(async () => {
      vi.stubEnv('APP_ENV', 'development');
      vi.stubEnv('BETTER_AUTH_SECRET', randomBytes(32).toString('base64'));
      vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');

      for (const tag of ['owner', 'other', 'unverified', 'blocked', 'deleting']) {
        await createUser(tag);
        cookies[tag] = await signIn(tag);
      }
      // Sessoes validas emitidas antes; a conta perde a condicao depois do login.
      await prisma().user.update({
        where: { id: ids.unverified },
        data: { emailVerified: false, emailVerifiedAt: null },
      });
      await prisma().user.update({ where: { id: ids.blocked }, data: { status: 'blocked_admin' } });
      await prisma().user.update({
        where: { id: ids.deleting },
        data: { status: 'deletion_requested' },
      });
    });

    afterAll(async () => {
      const userIds = Object.values(ids);
      await prisma().userContact.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma().verification.deleteMany({
        where: {
          OR: [
            { identifier: { in: userIds.map((id) => `email-verification:${id}`) } },
            { identifier: { startsWith: 'login-failure:' } },
          ],
        },
      });
      await prisma().termsAcceptance.deleteMany({ where: { userId: { in: userIds } } });
      await prisma().user.deleteMany({ where: { id: { in: userIds } } });
      await prisma().$disconnect();
      vi.unstubAllEnvs();
      log.error.mockRestore();
      log.warn.mockRestore();
    });

    it('dono registra: grava a forma canonica sob o proprio id e responde so a confirmacao', async () => {
      expect(await as('owner', () => getOwnContactStatus())).toEqual({ hasContact: false });

      const res = await as('owner', () => registerOwnContact({ phone: FIRST.raw }));

      expect(res).toEqual({ success: true, hasContact: true });
      expectNoNumber(res, FIRST.e164);
      const rows = await prisma().userContact.findMany({ where: { userId: ids.owner } });
      expect(rows.map((r) => r.phoneNumber)).toEqual([FIRST.e164]);
      expect(await as('owner', () => getOwnContactStatus())).toEqual({ hasContact: true });
      expect(await hasContact(prisma(), ids.owner)).toBe(true);
    });

    it('dono altera: substitui na mesma linha, sem criar outra', async () => {
      const before = await prisma().userContact.findUniqueOrThrow({
        where: { userId: ids.owner },
      });

      const res = await as('owner', () => registerOwnContact({ phone: SECOND.raw }));

      expect(res).toEqual({ success: true, hasContact: true });
      expectNoNumber(res, SECOND.e164);
      const rows = await prisma().userContact.findMany({ where: { userId: ids.owner } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: before.id, phoneNumber: SECOND.e164 });
    });

    it('entrada invalida nao altera o contato e o erro nao ecoa o valor', async () => {
      const res = await as('owner', () => registerOwnContact({ phone: '(11) 6234-5678' }));

      expect(res).toMatchObject({ success: false, reason: 'validation' });
      expect(JSON.stringify(res)).not.toMatch(/6234/);
      const row = await prisma().userContact.findUniqueOrThrow({ where: { userId: ids.owner } });
      expect(row.phoneNumber).toBe(SECOND.e164);
    });

    it('outro usuario grava o PROPRIO contato, nunca o do dono', async () => {
      const res = await as('other', () =>
        registerOwnContact({ phone: FIRST.raw, userId: ids.owner } as unknown as {
          phone: string;
        }),
      );

      expect(res).toEqual({ success: true, hasContact: true });
      const owner = await prisma().userContact.findUniqueOrThrow({ where: { userId: ids.owner } });
      expect(owner.phoneNumber).toBe(SECOND.e164);
      const other = await prisma().userContact.findUniqueOrThrow({ where: { userId: ids.other } });
      expect(other.phoneNumber).toBe(FIRST.e164);
    });

    it.each([
      ['anonimo', 'anon', 'login_required'],
      ['nao verificado', 'unverified', 'email_unverified'],
      ['bloqueado', 'blocked', 'account_restricted'],
      ['com exclusao solicitada', 'deleting', 'account_restricted'],
    ])('%s e recusado e nada e gravado', async (_c, tag, reason) => {
      const res = await as(tag, () => registerOwnContact({ phone: FIRST.raw }));

      expect(res).toMatchObject({ success: false, reason });
      expectNoNumber(res, FIRST.e164);
      expect(await as(tag, () => getOwnContactStatus())).toBeNull();
      if (ids[tag]) {
        expect(await prisma().userContact.count({ where: { userId: ids[tag] } })).toBe(0);
      }
    });

    it('nenhum log nem evento de auditoria recebeu o numero (CR-2.5 item 4, DM-11.2)', async () => {
      const logged = JSON.stringify([...log.error.mock.calls, ...log.warn.mock.calls]);
      expectNoNumber(logged, FIRST.e164);
      expectNoNumber(logged, SECOND.e164);

      const audits = await prisma().auditEvent.findMany({
        where: { actorId: { in: Object.values(ids) } },
      });
      expectNoNumber(audits, FIRST.e164);
      expectNoNumber(audits, SECOND.e164);
      // DM-11.1 nao lista registro/alteracao de contato: nenhum evento proprio.
      expect(audits.filter((a) => a.eventType.startsWith('contact.'))).toHaveLength(0);
    });
  },
);
