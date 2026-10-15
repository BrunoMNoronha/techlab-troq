// @vitest-environment node
//
// Vagas livres por anuncio (DEC-056) contra PostgreSQL REAL e descartavel. A
// contagem usa o mesmo criterio da reserva (reservation.ts): ocupam vaga as
// solicitacoes `paid` e as `reserved` ainda dentro da janela; `expired`,
// `failed` e reserva vencida nao ocupam.
//
// ESCREVE no banco: so roda com INTEGRATION_EPHEMERAL_DB=1 (docs/engineering/
// testing.md, secao 2.2). Dados sinteticos, inseridos direto (sem sessao: a
// funcao so le) e removidos ao final.
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ContactRequestStatus } from '@/generated/prisma/client';
import { getPrismaClient } from '@/persistence/prisma';
import { countFreeSlots, SLOTS_PER_LISTING } from './slots';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const RUN_ID = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const prisma = () => getPrismaClient();

const userIds: string[] = [];
const listingIds: string[] = [];

async function user(tag: string): Promise<string> {
  const { id } = await prisma().user.create({
    data: { displayName: 'Pessoa Sintetica', email: `it-vagas-${tag}-${RUN_ID}@example.test` },
  });
  userIds.push(id);
  return id;
}

async function publishedListing(ownerId: string): Promise<string> {
  const { id } = await prisma().listing.create({
    data: {
      ownerId,
      title: 'Bicicleta sintetica',
      description: 'Anuncio sintetico de integracao.',
      city: 'Recife',
      uf: 'PE',
    },
  });
  await prisma().listing.update({ where: { id }, data: { status: 'published' } });
  listingIds.push(id);
  return id;
}

const MINUTE = 60_000;

/** Solicitacao numa vaga, no estado pedido; `vencida` poe a janela no passado. */
async function request(
  listingId: string,
  requesterId: string,
  slotIndex: number,
  status: ContactRequestStatus,
  { vencida = false } = {},
) {
  const now = Date.now();
  const reservedFrom = new Date(vencida ? now - 60 * MINUTE : now);
  const reservedUntil = new Date(reservedFrom.getTime() + 30 * MINUTE);
  await prisma().contactRequest.create({
    data: {
      listingId,
      requesterId,
      slotIndex,
      status,
      reservedFrom,
      reservedUntil,
      paidAt: status === 'paid' ? new Date(now) : null,
    },
  });
}

describe.skipIf(process.env.INTEGRATION_EPHEMERAL_DB !== '1')(
  'vagas livres por anuncio contra PostgreSQL descartavel (DEC-056)',
  () => {
    let livre: string;
    let mista: string;
    let cheia: string;

    beforeAll(async () => {
      const owner = await user('owner');
      const [a, b, c, d] = await Promise.all(['a', 'b', 'c', 'd'].map((tag) => user(tag)));

      livre = await publishedListing(owner);

      // Uma paga, uma reserva viva e, fora da conta, uma vencida, uma expirada
      // e uma falha: sobra 1 vaga livre.
      mista = await publishedListing(owner);
      await request(mista, a, 1, 'paid');
      await request(mista, b, 2, 'reserved');
      await request(mista, c, 3, 'expired');
      await request(mista, d, 3, 'failed');

      cheia = await publishedListing(owner);
      await request(cheia, a, 1, 'paid');
      await request(cheia, b, 2, 'paid');
      await request(cheia, c, 3, 'reserved');
    });

    afterAll(async () => {
      await prisma().contactRequest.deleteMany({ where: { listingId: { in: listingIds } } });
      await prisma().listing.deleteMany({ where: { id: { in: listingIds } } });
      await prisma().user.deleteMany({ where: { id: { in: userIds } } });
      await prisma().$disconnect();
    });

    it('conta por anuncio numa unica chamada, com varios ids', async () => {
      const free = await countFreeSlots([livre, mista, cheia]);
      expect(free.get(livre)).toBe(SLOTS_PER_LISTING);
      expect(free.get(mista)).toBe(1);
      expect(free.get(cheia)).toBe(0);
    });

    it('reserva vencida ainda `reserved` nao ocupa vaga (expiracao preguicosa)', async () => {
      const owner = userIds[0];
      const listingId = await publishedListing(owner);
      await request(listingId, userIds[1], 1, 'reserved', { vencida: true });
      expect((await countFreeSlots([listingId])).get(listingId)).toBe(SLOTS_PER_LISTING);
    });

    it('id sem solicitacao nenhuma devolve o total; lista vazia nao consulta', async () => {
      const ausente = randomUUID();
      expect((await countFreeSlots([ausente])).get(ausente)).toBe(SLOTS_PER_LISTING);
      expect((await countFreeSlots([])).size).toBe(0);
    });
  },
);
