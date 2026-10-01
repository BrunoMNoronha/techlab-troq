// Guarda de `UserContact` (contact-release.md, CR-2.1 a CR-2.5). Server-only e
// fora de actions.ts ('use server') de proposito: la toda funcao exportada vira
// endpoint chamavel pelo cliente, e `hasContact` recebe um `userId` arbitrario.
//
// Nada aqui devolve o numero. A leitura booleana existe por decisao do Bruno
// (2026-10-01, nota de CR-2.5): o dono ve se ha contato cadastrado, e `request`
// verifica, sob a trava do anuncio, se o anunciante tem contato (DEC-040).
import type { Prisma } from '@/generated/prisma/client';
import { validateSession } from '@/modules/identity';
import { getPrismaClient } from '@/persistence/prisma';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cliente do Prisma ou transacao em curso: so o delegate de `UserContact` e usado. */
export type ContactReader = Pick<Prisma.TransactionClient, 'userContact'>;

/**
 * Se `userId` tem contato cadastrado. So o booleano, nunca o valor. Aceita a
 * transacao do chamador para que a verificacao aconteca sob a trava dele.
 */
export async function hasContact(db: ContactReader, userId: string): Promise<boolean> {
  if (!UUID_PATTERN.test(userId)) return false;
  const count = await db.userContact.count({ where: { userId } });
  return count > 0;
}

/** Estado do contato do PROPRIO ator, para a area privada. `null` sem sessao valida. */
export async function getOwnContactStatus(): Promise<{ hasContact: boolean } | null> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return null;
  return { hasContact: await hasContact(getPrismaClient(), session.user.id) };
}

/** Grava ou substitui o contato canonico do titular. Sem retorno de valor. */
export async function saveContact(userId: string, e164: string): Promise<void> {
  await getPrismaClient().userContact.upsert({
    where: { userId },
    create: { userId, phoneNumber: e164 },
    update: { phoneNumber: e164 },
    select: { id: true },
  });
}
