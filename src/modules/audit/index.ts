// Modulo transversal `audit` (docs/architecture/overview.md, AR-3.3).
//
// Responsabilidade: Trilha imutavel de eventos criticos.
//
// Transversal, e nao modulo de dominio: nao possui regra de negocio propria
// nem entidade de dominio sob sua guarda (docs/architecture/overview.md, secao 9).
//
// Este arquivo e a API PUBLICA do modulo: o que nao for exportado aqui nao e
// importado de fora (docs/engineering/conventions.md, secao 2.2). Consumidores
// externos importam `@/modules/audit`; nunca um caminho interno do modulo.
//
// F2-010 (#48) acrescenta a unica operacao necessaria ate aqui: gravar um
// evento DENTRO da transacao do efeito que ele descreve (AR-9.4). A trilha e
// append-only (AR-9.3): este modulo nao expoe UPDATE nem DELETE. Se a gravacao
// falhar, a excecao desfaz a transacao inteira do chamador.
import type { Prisma } from '@/generated/prisma/client';

export interface AuditEventInput {
  /** Tipo discriminado do evento (data-model.md, DM-11.1). */
  eventType: string;
  actorId: string | null;
  targetType: string;
  targetId: string | null;
  result: string;
  /**
   * Somente identificadores e fatos tecnicos. Nunca telefone/WhatsApp, e-mail,
   * segredo ou payload capaz de reconstitui-los (AR-9.5, DM-11.2).
   */
  details?: Prisma.InputJsonValue;
  /** Instante do efeito auditado; sem ele, o do momento da gravacao. */
  occurredAt?: Date;
}

/** Grava um evento de auditoria na transacao recebida. */
export async function recordAuditEvent(
  tx: Prisma.TransactionClient,
  event: AuditEventInput,
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      eventType: event.eventType,
      actorId: event.actorId,
      targetType: event.targetType,
      targetId: event.targetId,
      result: event.result,
      details: event.details,
      occurredAt: event.occurredAt,
    },
  });
}
