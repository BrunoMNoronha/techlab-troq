# Limite de solicitações por conta em cada anúncio — TROQS

Documento normativo que fecha [OD-14](../decisions/open-decisions.md) e registra **DEC-041** (2026-10-01) e **DEC-051** (2026-10-05). Decisões do Bruno.

Fontes: [business-rules.md](business-rules.md) (RB-003), [requirements.md](requirements.md) (RF-010), [../architecture/data-model.md](../architecture/data-model.md) (DM-6.2, DM-6.3, DM-6.11, DM-6.12), [../architecture/payments-design.md](../architecture/payments-design.md) (PD-3.1, PD-4.1), [../adr/0006-async-work-scheduling-concurrency.md](../adr/0006-async-work-scheduling-concurrency.md) (DEC-038).

**Escopo de regra (DEC-053, 2026-10-05).** Este documento rege a regra de troca **solicitação paga** (`paid_request`) e não foi alterado. Os limites da regra **proposta de troca** são os de RB-008 ([trade-proposal.md](trade-proposal.md), DEC-054, seção 4) e são contagens independentes das vagas tratadas aqui.

## 1. Problema

A reserva ocupa uma das três vagas do anúncio por 30 minutos sem pagamento (RF-010, PD-3.1). Sem limite por conta, uma mesma pessoa podia ocupar as três vagas com reservas não pagas, deixá-las expirar e repetir, impedindo que outras pessoas solicitassem. DM-6.11 registrava que nenhuma decisão vigente proibia isso.

## 2. Decisão

**RL-1.** Cada conta tem **no máximo uma reserva viva** (`reserved`, ainda dentro da janela) **em cada anúncio**. Uma nova solicitação da mesma conta no mesmo anúncio, enquanto a anterior estiver viva, é recusada; nada é criado e nada é cobrado. A pessoa conclui o Pix já gerado ou espera o prazo terminar.

**RL-2.** A verificação é do servidor, na transação da reserva, **sob a trava do anúncio** (DM-6.12) e **depois** de expirar as reservas vencidas do anúncio (DM-6.3). Reserva vencida não conta: vencida a janela, a mesma conta pode reservar de novo.

**RL-3.** A **garantia** é do banco (DEC-038): índice único parcial `contact_requests_live_reservation_per_requester_key` sobre `(listing_id, requester_id)` restrito a `status = 'reserved'`. A verificação sob a trava dá a recusa limpa; o índice impede a segunda linha mesmo se a verificação falhar.

**RL-4.** A regra não olha outros anúncios. Reservas `expired` e `failed` permitem nova tentativa, se o anúncio aceitar solicitações e houver vaga. Solicitações `paid` seguem RL-5 a RL-7 (DEC-051).

**RL-5.** Se já existe qualquer solicitação `paid` da conta no anúncio, uma nova solicitação é recusada sem criar reserva, tentativa ou cobrança. O bloqueio permanece após reversão, perda de elegibilidade, não escolha ou encerramento da negociação: `paid` e a vaga consumida continuam existindo (DM-6.7). Anúncio encerrado ou removido continua indisponível pelas regras próprias.

**RL-6.** A verificação roda no servidor, sob a trava do anúncio e depois de expirar reservas vencidas, antes da alocação da vaga. A recusa `already_paid` orienta a acompanhar a solicitação existente. A interface reutiliza `own_request`, inclusive quando a solicitação paga perdeu elegibilidade.

**RL-7.** A garantia adicional é do banco. A tabela auxiliar `contact_request_paid_guards`, com chave primária `(listing_id, requester_id)`, serializa a admissão de novas linhas e o registro do pagamento via UPSERT atômico em triggers. O marcador `has_paid` torna-se verdadeiro ao inserir uma linha paga ou confirmar uma reserva existente. Nova linha `reserved` ou `paid` não é admitida quando o marcador já é verdadeiro. A confirmação de reservas aceitas anteriormente continua permitida; a regra não cancela cobranças em andamento.

O backfill usa os pares distintos já pagos e não altera nem apaga solicitações, tentativas ou pagamentos, inclusive duplicidades históricas. Um índice único sobre todas as linhas `paid` impediria essa compatibilidade. Os marcadores acompanham a retenção do anúncio/conta por FK; não são uma nova trilha financeira. O índice parcial de RL-3 continua protegendo reservas pendentes. Nenhum reembolso retroativo é criado.

## 3. O que não muda

- RB-003 e o limite de três vagas por anúncio (DM-6.2).
- DM-6.11 permite histórico de tentativas expiradas/falhas e preserva duplicidades anteriores; a admissão de novas solicitações segue DEC-051.
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
