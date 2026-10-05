# Revisão reforçada — limite de solicitações pagas (#148)

Data: 2026-10-05. Responsável pela decisão de produto: Bruno. Revisão técnica: Codex, no escopo de executar #148. Baseline: `dc51132`; branch `codex/issue-148-limite-solicitacao-paga`.

## Decisão e comportamento

Bruno adotou as recomendações nesta execução: qualquer `paid` da mesma conta no anúncio impede nova solicitação, mesmo após reversão, perda de elegibilidade ou não escolha. A verificação roda no servidor e a garantia adicional vive no banco, preservando o histórico. DEC-051 está em `reservation-limit.md`, `decision-log.md` e DM-6.11.

O servidor recusa com `already_paid` sob a trava do anúncio, depois de expirar vencidas e antes de alocar vaga, tentativa ou cobrança. A transação aborta sem escrita parcial; `requestContactUnlockFlow` propaga a recusa antes do provedor. A interface mantém `own_request` e trata a recusa em uma página aberta antes de outro pagamento ser confirmado, orientando a pessoa para suas solicitações.

## Banco e compatibilidade

A migration `20261005140000_paid_request_per_requester` é aditiva. O backfill por pares distintos pagos não reescreve nenhuma solicitação, tentativa ou pagamento. Um guard por conta/anúncio, com UPSERT condicional, serializa novas admissões contra confirmações em andamento, sem depender de uma leitura de snapshot antigo. Confirmações de reservas já admitidas permanecem válidas, inclusive do legado com duplicidades. O índice de uma reserva pendente continua vigente.

O guard acompanha a exclusão física do anúncio/conta por FK, depois da retenção; não registra contato, dinheiro ou nova autorização. Triggers não chamam provedores. A recusa não registra dados pessoais nem ecoa o payload. Não há mudança em limite de três vagas, elegibilidade financeira, reembolso, escolha ou liberação de contato.

## Provas executáveis

| Critério | Prova |
| --- | --- |
| Chamada direta pelo ator que já pagou, sem nova reserva/tentativa/pagamento/auditoria | `request-journey.http.integration.test.ts`: POST real da Server Action, cookie da conta real sintética e snapshots do banco |
| Reversão, não escolha após encerrar negociação e anúncio encerrado | Mesma prova HTTP: `already_paid` continua após reversão/fim da negociação; anúncio encerrado retorna `unavailable` |
| N participantes efetivamente esperando pela trava | `reservation.integration.test.ts`: 8 backends distintos observados em `pg_stat_activity`; zero admissões após pagamento; prova existente admite só uma reserva da mesma conta antes do pagamento |
| Garantia independente do chamador | Inserção SQL direta disputa o guard com uma confirmação sem commit e é recusada depois da espera |
| Tentativas expiradas/falhas e isolamento por conta/anúncio | Suíte de reservas: nova tentativa permitida, outra conta/outro anúncio permitidos |
| Preservação de dados na migration | `paid-request-migration.integration.test.ts`: aplica histórico SQL real em schema isolado com duas pagas do mesmo par e uma reserva; compara todas as linhas antes/depois e confirma a reserva anterior |
| Recusa na interface sem botão para repetir a cobrança | `interest-flow.test.tsx`: recusa definitiva e link para as solicitações |

## Validação e limites

Migrations aplicadas em PostgreSQL 17 descartável local, incluindo banco vazio e schema com histórico duplicado. Formatação, lint, typecheck e build locais aprovados. A aprovação técnica final exige os dois checks do mesmo SHA na PR: `Validação (format, lint, typecheck, test, build)` e `Integração (PostgreSQL efêmero)`. A prova HTTP usa o servidor real do job de CI e provedor ausente/simulado; não é homologação de sandbox nem de Preview.

Na primeira execução local focada, 22 testes passaram e um teste antigo de contenção observou 3 dos 8 backends exigidos. A prova não foi enfraquecida: a asserção exige 8. A nova execução e a CI precisam resolver esse resultado antes do merge. A inicialização do servidor HTTP local foi rejeitada pela revisão automática com `blocked by policy`, sem motivo adicional; não foi apresentada como validação local.

Nenhuma migration foi aplicada a Neon/Preview/Production. Sem promoção de branch, deploy, cobrança real ou reembolso retroativo. Os gates de Fase 3 e de lançamento permanecem independentes desta entrega.
