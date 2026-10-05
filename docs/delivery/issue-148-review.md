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

**CI aprovada em `93b471067229c4f61f5286e157e28a513ae94fb7`:** [run 37276214640](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37276214640), ambos os required checks `success`. Suíte unitária: 62 arquivos aprovados; integração: 31 arquivos aprovados e 3 pulados pelos pré-requisitos externos; testes do pipeline: 8/8. As provas desta entrega passaram: 22/22 de reservas (incluindo todos os backends exigidos), 10/10 HTTP e 1/1 de preservação na migration. Build, migrations, backup e restauração sintética do job também aprovados. A prova HTTP do ator real recusou `already_paid` sem efeito, inclusive após reversão/fim da negociação, e `unavailable` após encerramento do anúncio.

**Limite da validação local:** a primeira execução focada teve 22/23; a segunda, 18/23, com falhas nos testes de contenção. A suíte unitária local foi interrompida depois de uma falha em teste antigo de configuração de auth, sem resultado completo. As asserções não foram reduzidas, e as mesmas suítes passaram integralmente na CI acima. A inicialização do servidor HTTP local foi rejeitada pela revisão automática com `blocked by policy`, sem motivo adicional; não foi apresentada como validação local. O PostgreSQL descartável criado para esta tarefa foi removido após as provas, sem tocar outros contêineres/volumes.

**Revisão reforçada concluída:** caminhos de reserva/cobrança, atomicidade do guard, compatibilidade de dados, retornos sem contato e efeitos após reversão/encerramento revisados contra a decisão. Nenhum achado de escopo aberto; o merge exige os dois checks verdes no HEAD da PR #150. Esta atualização documental não altera o código validado no run acima.

Nenhuma migration foi aplicada a Neon/Preview/Production. Sem promoção de branch, deploy, cobrança real ou reembolso retroativo. Os gates de Fase 3 e de lançamento permanecem independentes desta entrega.
