# Uma reserva viva por conta em cada anúncio — TROQ

Documento normativo que fecha [OD-14](../decisions/open-decisions.md) e registra **DEC-041**. Decisão do Bruno em 2026-10-01.

Fontes: [business-rules.md](business-rules.md) (RB-003), [requirements.md](requirements.md) (RF-010), [../architecture/data-model.md](../architecture/data-model.md) (DM-6.2, DM-6.3, DM-6.11, DM-6.12), [../architecture/payments-design.md](../architecture/payments-design.md) (PD-3.1, PD-4.1), [../adr/0006-async-work-scheduling-concurrency.md](../adr/0006-async-work-scheduling-concurrency.md) (DEC-038).

## 1. Problema

A reserva ocupa uma das três vagas do anúncio por 30 minutos sem pagamento (RF-010, PD-3.1). Sem limite por conta, uma mesma pessoa podia ocupar as três vagas com reservas não pagas, deixá-las expirar e repetir, impedindo que outras pessoas solicitassem. DM-6.11 registrava que nenhuma decisão vigente proibia isso.

## 2. Decisão

**RL-1.** Cada conta tem **no máximo uma reserva viva** (`reserved`, ainda dentro da janela) **em cada anúncio**. Uma nova solicitação da mesma conta no mesmo anúncio, enquanto a anterior estiver viva, é recusada; nada é criado e nada é cobrado. A pessoa conclui o Pix já gerado ou espera o prazo terminar.

**RL-2.** A verificação é do servidor, na transação da reserva, **sob a trava do anúncio** (DM-6.12) e **depois** de expirar as reservas vencidas do anúncio (DM-6.3). Reserva vencida não conta: vencida a janela, a mesma conta pode reservar de novo.

**RL-3.** A **garantia** é do banco (DEC-038): índice único parcial `contact_requests_live_reservation_per_requester_key` sobre `(listing_id, requester_id)` restrito a `status = 'reserved'`. A verificação sob a trava dá a recusa limpa; o índice impede a segunda linha mesmo se a verificação falhar.

**RL-4.** A regra não olha outros anúncios, solicitações pagas nem o histórico: `paid`, `expired` e `failed` ficam fora dela.

## 3. O que não muda

- RB-003 e o limite de três vagas por anúncio (DM-6.2).
- DM-6.11 continua valendo para solicitações **não vivas**: o modelo não proíbe que a mesma pessoa tenha mais de uma solicitação, ao longo do tempo, no mesmo anúncio.
- A cobrança, a expiração e o encerramento das reservas (T5/T6).
- Nenhum evento de auditoria novo: a recusa não cria reserva nem tentativa (DM-11.1).

## 4. Alternativas rejeitadas

| Alternativa | Motivo |
| --- | --- |
| Sem limite | Deixava uma conta bloquear as três vagas indefinidamente, repetindo reservas não pagas |
| Teto de reservas expiradas por período | Exige escolher números e janela sem dado de uso; a regra por anúncio já fecha o abuso descrito |
| Só a verificação sob a trava, sem índice | Contraria DEC-038: trava é comportamento, restrição de banco é garantia |

## 5. Rastreabilidade

| Item | Onde |
| --- | --- |
| Verificação sob a trava | `src/modules/request/reservation.ts` (`active_reservation`) |
| Garantia | `prisma/migrations/20261001160818_reservation_per_requester/migration.sql` |
| Provas | `src/modules/request/reservation.integration.test.ts`: recusa, nova reserva após vencer, N pedidos simultâneos da mesma conta com a trava segurada e violação direta do índice |
| Interface | A jornada de solicitação (F3-012, [#102](https://github.com/BrunoMNoronha/techlab-troq/issues/102)) apresenta a recusa e leva ao Pix já gerado |
