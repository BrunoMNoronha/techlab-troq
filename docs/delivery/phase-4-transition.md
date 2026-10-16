# Auditoria do gate da Fase 3 e transição para a Fase 4 — F3-015 (#105)

Auditoria documental em 2026-10-05, durante a sprint de encerramento e reputação autorizada por Bruno. **Gate da Fase 3: NÃO APROVADO.** A implementação e as provas de PostgreSQL/HTTP foram verificadas na CI; C-8 e a conclusão remota de [#104](https://github.com/BrunoMNoronha/techlab-troq/issues/104) permanecem pendentes. A autorização para implementar a sprint não equivale a homologação nem encerra [#105](https://github.com/BrunoMNoronha/techlab-troq/issues/105), #54 ou os gates posteriores.

## Base e método

| Item | Evidência verificada |
| --- | --- |
| Código auditado | `main@9447b8af344201ac60d25721dbce78c7982ae01e` |
| CI | [37296179216](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37296179216): jobs Validação e Integração `success`; logs e metadados lidos nesta auditoria |
| Camadas executadas pela CI | 1.109 unitários; 473 integrações aprovadas e 19 puladas; servidor Next.js real e PostgreSQL 17 efêmero; 10 testes do pipeline e restauração cifrada sintética |
| Preview disponível | [37332427023](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37332427023), tentativa 1; SHA igual ao auditado; deployment `dpl_H2coTZhL45V7t52PTzJtfNcGM4hj` |
| Origem estável | `https://techlab-troq-git-preview-bruno-m-noronha.vercel.app` |
| Método desta auditoria | Leitura da fonte e contratos, GitHub issues/PRs e logs da CI; sem testes locais novos, escrita no banco compartilhado ou declaração de recebimento remoto não observado |

Provedores simulados, PostgreSQL descartável, sandbox real e navegador de Preview são camadas distintas. Os 19 testes pulados por pré-requisitos externos de R2 e Mercado Pago não recebem aprovação de provedor real. Resultados de implementações anteriores permanecem históricos quando não pertencem ao SHA desta tabela.

## Matriz do gate

Critérios preservados do [roadmap](roadmap.md), Fase 3. `PASS` indica apenas a condição e a camada descritas na linha; o resultado global exige todos os critérios atendidos.

| Critério | Prova e resultado | Estado |
| --- | --- | --- |
| Concorrência: nunca mais de três pagas por anúncio | T-1/T-2/T-18 em PostgreSQL real na CI do SHA auditado; reservas, confirmações da última vaga e jobs sobrepostos. Inspeção da fonte confirma espera real em `pg_stat_activity`, efeitos finais e conjuntos disjuntos | **PASS** |
| Contratos de pagamentos T-1 a T-18 e de contato C-1 a C-11 | Suítes principais executadas e aprovadas na CI conforme [relatório de segurança](phase-3-security-verification.md). C-5 tem substituição técnica aprovada por DV-13; C-8 local é aprovado, mas a varredura Preview/Sentry exigida por #104 não foi comprovada nesta auditoria | **PARCIAL** |
| Webhook duplicado, fora de ordem e atrasado; acreditação fora da janela não cria vaga | T-3/T-4/T-6/T-7; mesma notificação repetida, observação autoritativa, instante de acreditação e reembolso técnico. Confirmação (33), reembolso técnico (11) e duplicidade tardia (3) aprovados no mesmo job | **PASS** |
| Liberação somente sob RB-001, com auditoria | Escolha (21), entrega direta (9), contato HTTP (30) e matriz (25) aprovados. Controles incluem pago não escolhido, terceiro, escolhido anterior, conta invalidada após login e auditoria de cada entrega; autorização não é contornada por cookie de usuário nos jobs | **PASS** |
| Revisão reforçada de pagamentos, autorização e dados concluída | Achado F3-S1 corrigido e revisão de código/CI registrada; falta observação e varredura C-8 remota do fluxo completo. PR #154 foi entrega parcial, e a PR #161 ainda não contém alteração de arquivos na leitura desta auditoria | **PARCIAL** |

**Resultado global: NÃO APROVADO.** Os critérios automáticos acima não substituem o aceite remoto de #104. Até concluir essa prova e reconciliar o SHA final, a entrega usa `Refs #104`, `Refs #105` e `Refs #54`; não fecha esses gates nem #55/#56/#130.

## Pendências para homologação

1. Executar jornada controlada no Preview identificado: reserva, Pix sandbox aprovado, escolha e contato entregue apenas ao escolhido, incluindo ator sem direito recusado. Registrar ambiente, SHA, run/tentativa, deployment e intervalo sem dados pessoais ou segredos.
2. Concluir C-8 com mensagens de erro da interface, console, runtime Vercel e Sentry remoto. O número sintético e suas grafias devem ter zero ocorrências nas superfícies proibidas, com controles não vazios ligados ao fluxo. Presença de DSN, sucesso de deploy ou consulta vazia não satisfazem a condição.
3. Reconciliar a homologação histórica de #102 em `dc51132` com as mudanças posteriores; revalidar os critérios afetados no SHA final da sprint. Provas de Google em #133 continuam separadas: configurar o par não comprova cadastro legal, login/logout e links de e-mail.
4. Registrar a revisão reforçada final e as evidências de cada critério antes de atualizar roadmap/backlog e os acompanhamentos #54/#55 para gate aprovado. Não houve edição de issues nesta auditoria.

DEC-042 encerrou OD-15: o Preview admite invocação autenticada dos jobs, sem cron. Não é necessário reabrir essa decisão. A inclusão de #86 como condição adicional do gate permanece recomendação sujeita à decisão registrada; sua implementação/fechamento não cria a decisão por inferência. C-5 deve ser reexecutado com moderador real na entrega que introduzir esse perfil (#166); a substituição de DV-13 continua válida para a Fase 3.

## Revisão dos riscos

| Risco | Resultado e limite nesta auditoria |
| --- | --- |
| R-02 — exceder três vagas pagas | Mitigado tecnicamente por trava/constraints e concorrência real comprovada na CI; reseleção e encerramento da sprint devem preservar vagas e fatos financeiros |
| R-03 — vazamento de contato | DTOs, HTTP, cache, autorização e redação com SDK real comprovados localmente/CI; observação do fluxo completo em Preview/Sentry segue pendente. Retenção e exclusão continuam no escopo da Fase 5 |
| R-04 — inconsistência entre webhook e estado interno | Duplicidade, ordem, atraso, falhas e reconciliação sem notificação testados em PostgreSQL; provedor real e homologação atual não se inferem do simulador. Cadência operacional continua distinta da invocação de Preview |
| R-11 — reembolso técnico impossível | Backoff, prazo de 180 dias, pendência operacional e retentativa idempotente testados com provedor simulado; saldo e capacidade reais da conta, tratamento humano e desfecho financeiro não foram verificados nesta auditoria |

A homologação da sprint de encerramento/reputação deve registrar sua própria CI e Preview. Alterações em seleção, acesso ao contato ou regras compartilhadas exigem reexecução dos critérios afetados; aprovação do gate não pode ser transportada automaticamente para outro SHA. O lançamento comercial permanece em #56/#179 e exige seus próprios critérios.
