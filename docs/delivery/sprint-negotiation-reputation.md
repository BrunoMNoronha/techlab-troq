# Sprint de encerramento e reputação — #163 e #164

Entrega iniciada em 2026-10-05, a partir de `main@9447b8af344201ac60d25721dbce78c7982ae01e`, na branch `codex/sprint-negociacoes-reputacao` e em checkout isolado. A [PR #182](https://github.com/BrunoMNoronha/techlab-troq/pull/182) permanece em rascunho. A última CI aprovada da Fase 4, para `6152506b2abb0d5141f66d54c53d6e03286fdf80`, é **histórica e anterior à nova base com a correção HMAC**. Após o registro documental `34758e790`, a branch incorporou `main@78e0035baa162b83bf00a433904605b05dacfc2c` sem conflitos, pelo merge `cc754c95832b32cb57ec73031acb5f2cd3a5754f`. Essa revisão da sprint precisará de nova CI; o resultado anterior não a aprova. As alterações locais do checkout principal foram preservadas.

**A Fase 4 ainda não foi homologada no Preview.** O ambiente continua no deployment C, SHA `373748fe16fa8fc5d92130397f24400e41ba69a4`, sem #163/#164 ou a correção da PR #198. A jornada de reserva, Pix sandbox, escolha e entrega de contato foi observada nessa base anterior; C-8 remota de #104 e o gate #105 continuam abertos. A preparação isolada não libera a integração da Fase 4.

## Comportamento implementado

- `/negociacoes/[id]` é privada para anunciante e escolhido. Mostra contraparte, estado e encerramento com confirmação explícita. Solicitações do anúncio e contatos liberados dão acesso à negociação; o histórico conserva as encerradas depois de uma reseleção.
- Qualquer participante elegível pode encerrar, inclusive com anúncio pausado, fechado ou removido. Travas de anúncio e negociação serializam o ato; instante, ator e auditoria são gravados na mesma transação. Repetição conserva o encerramento original. Pagamentos, vagas e autorizações anteriores são preservados.
- Cada participante pode enviar uma nota inteira de 1 a 5 após o encerramento e antes do fim dos 14 dias corridos. Uma nota ainda cega pode ser substituída pelo autor. A segunda direção publica ambas atomicamente; uma nota única passa a ser pública na leitura ao vencer o prazo, sem cron.
- O detalhe público mostra apenas média com uma casa decimal e quantidade de avaliações válidas do anunciante. A identidade é resolvida no servidor. A página privada envia somente a nota do próprio autor; nota da contraparte, contato e identificadores privados não entram no agregado público.
- A interface trata sessão expirada, recusa autoritativa e resposta de rede perdida. Diante de resultado ambíguo, pede releitura antes de repetir a ação. Confirmação, cancelamento e feedback recebem foco acessível.

Reutilizados `Negotiation`, `Rating`, restrições e auditoria existentes. Nenhuma migration, dependência, texto de avaliação, perfil público ou notificação foi acrescentada.

## Evidências locais

Banco PostgreSQL 17 exclusivo e descartável, com armazenamento temporário, porta local 55581 e as 11 migrations existentes. Better Auth e servidor Next.js são reais; emissão de e-mail e fatos financeiros das fixtures são sintéticos. Essas provas não homologam Mercado Pago, R2 ou Sentry remotos.

| Verificação | Resultado observado |
| --- | --- |
| Tipagem e build | `pnpm typecheck` e `pnpm build` aprovados; rota privada dinâmica, fora da pré-renderização |
| Lint | `pnpm lint` aprovado; UI final também aprovada em verificação focal |
| Suíte unitária completa | 71 arquivos, 1.165 testes aprovados; nova página privada também coberta pela rodada focal abaixo |
| Interface final | 39 testes aprovados em cinco arquivos, incluindo seis da nova página privada; ESLint e Prettier focais aprovados |
| Pipeline de publicação | `pnpm test:deployment`: 10 testes aprovados |
| Novas provas de banco e HTTP | 38 testes aprovados: 16 de encerramento, 11 de avaliações e 11 da jornada HTTP |
| Regressão completa de banco e HTTP | 510 testes aprovados, 19 pulados por pré-requisitos externos e um timeout de 5 s em teste antigo de recuperação de imagens |
| Diagnóstico focal de imagens | 31 testes aprovados com `--testTimeout=30000` na CLI, sem alterações no código ou na configuração do projeto |
| Navegador a 375 px | Aprovado em servidor Next.js de produção local, com contas e pagamentos sintéticos no banco descartável; não substitui homologação no Preview |
| Deployment da sprint | Pendente |

Falhas intermediárias foram investigadas sem relaxar os controles: `pg_sleep` passou a usar `$executeRaw`, pois o retorno `void` não é desserializável por Prisma; a observação de `pg_stat_activity` foi movida para autocommit fora da transação que segura a trava, evitando o snapshot estático; a prova RSC verifica as propriedades do componente cliente, enquanto o HTML verifica o botão renderizado. A primeira nota HTTP vem do escolhido para o anunciante, comprovando que o agregado correto permanece cego.

No navegador local, a largura efetiva e o `scrollWidth` foram conferidos como 375 px. A confirmação recebeu foco, abriu e cancelou por teclado, retornando o foco ao botão. Uma negociação foi encerrada pelo escolhido, outra pelo anunciante depois da reseleção; ambas continuaram no histórico. A primeira nota foi enviada como 2 e editada para 4, sem aparecer para o anunciante nem no agregado público. A segunda nota publicou ambas e bloqueou edição; o anúncio mostrou `4,0 de 5 estrelas · 1 avaliação`. Falhas de rede no encerramento e na edição exibiram aviso de resultado incerto e bloquearam repetição; a ação de atualizar, após reconexão, restaurou o estado confirmado no servidor. Capturas da confirmação, recuperação, cegamento, histórico e reputação foram guardadas fora do repositório, em `sprint-evidence` do checkout isolado.

## Evidência de CI

O [run 37357922701](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37357922701), evento `pull_request`, concluiu com sucesso para `6152506b2abb0d5141f66d54c53d6e03286fdf80`. Este é o registro histórico anterior ao merge da base com a correção HMAC. Os registros dos dois jobs dessa rodada mostram:

| Job | Resultado observado |
| --- | --- |
| Validação: formatação, lint, typecheck, testes e build | Aprovado; 72 arquivos e 1.201 testes unitários aprovados; 10 testes de segurança e invariantes do pipeline aprovados |
| Integração: PostgreSQL efêmero e HTTP | Aprovado; 35 arquivos aprovados e três pulados; 511 testes aprovados e 19 pulados, de 530 casos; inclui as 38 provas novas de #163/#164 |
| Backup e restauração | Etapa aprovada com dados sintéticos no banco isolado |

A CI histórica terminou sem falha de teste, incluindo o teste antigo de imagens que atingiu timeout na regressão local. Os 19 casos pulados continuam dependendo de R2 real ou Mercado Pago sandbox. A revisão atual da sprint, com a base `78e0035b` incorporada, ainda precisa de nova CI da Fase 4. O sucesso anterior não substitui essa revalidação, as provas funcionais no Preview ou o aceite de #104/#105.

## Preview e dependências externas

As provas remotas abaixo foram fornecidas nesta rodada a partir da inspeção de CI/deploy, navegador autenticado, banco do Preview e painel do Mercado Pago. Os contratos de status e de rejeição de webhook foram conferidos no código. Nenhum segredo, contato ou corpo bruto de notificação é reproduzido neste documento.

| Referência | Evidência da base publicada |
| --- | --- |
| Código no Preview atual | SHA `373748fe16fa8fc5d92130397f24400e41ba69a4`, deployment C; ainda não contém #163/#164 ou a correção da PR #198 |
| CI da base | [Run 37357575065](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37357575065) aprovado; 1.139 testes unitários, 10 testes do pipeline e 473 integrações aprovadas, com 19 puladas |
| Deployment A | `dpl_AfXEuRymK666Cdq1TsocjZNQyAeC`, [run 37358047154](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37358047154), no mesmo SHA da base |
| Deployment B | `dpl_AUn4Si38YimEM95EuPqwb9Uzx8L7`, [run 37359865041](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37359865041), republicação do mesmo SHA; reconciliação observada nesta execução |
| Deployment C | [Run 37366006692](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37366006692), tentativa 2 concluída com sucesso, no mesmo SHA `373748fe16fa8fc5d92130397f24400e41ba69a4`; a tentativa 1 falhou por infraestrutura do runner |

O gate vigente e seus limites estão em [phase-4-transition.md](phase-4-transition.md). Os registros históricos desse gate não transportam aprovação para a sprint nem substituem as pendências atuais descritas abaixo.

Após o provisionamento, a leitura dos metadados da Vercel confirmou o trio `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_APPLICATION_ID` e `MERCADO_PAGO_WEBHOOK_SECRET` no ambiente Preview, marcado como Sensitive, sem recuperar ou registrar valores. O preflight atual exige esse trio apenas em Production. A aplicação falha fechada sem configuração, e não há fallback para credenciais de outro ambiente. A prova funcional de Pix agora inclui os fatos reais de sandbox abaixo, além da presença de configuração e do smoke.

| Etapa em 2026-10-05 | Resultado observado e limite |
| --- | --- |
| Reserva | Criada às `18:46:19.252 UTC`, com limite às `19:16:19.252 UTC` |
| Acreditação no provedor | `18:46:21 UTC`, anterior ao limite da reserva; Order e transação Pix com `processed/accredited` |
| Reconhecimento no domínio | `18:59:49.241 UTC`, por `reconciliacao` no deployment B; job com `claimed=1` e `confirmed=1`; solicitação `paid` e tentativa `pagamento_confirmado` |
| Pagamento persistido | Canônico, exatamente 99 centavos; uma auditoria de aprovação |
| Escolha e autorização | Negociação ativa `12871d1d-dd0d-4a44-809f-6068d89e0063`, liberação `51593507-3c77-451e-b364-e9bd76e4e625`; verificações da cadeia de autorização verdadeiras |
| Interface autorizada | Anunciante escolheu às `19:13 UTC` (`16:13 BRT`); escolhido acionou “Ver contato” e recebeu a entrega; uma auditoria de entrega |
| Ator sem direito | Lista de contatos vazia e consulta privada da solicitação com HTTP 404 |
| Segunda leitura autorizada | Na captura de releitura às `19:41:41.402864 UTC`, a mesma cadeia continua válida: `paid`, 99 centavos, pagamento canônico e acreditação dentro da reserva; negociação ativa, mesma liberação, duas entregas e duas auditorias de entrega; zero notificações reais registradas |

A primeira entrega e a releitura são provas distintas de acesso autorizado. A segunda captura está em `preview-current-chain-after-reread-ui.txt`, fora do Git. A transcrição técnica `preview-current-chain-manual-transcription.json` é explicitamente rotulada `MANUAL_TRANSCRIPTION_FROM_UI`, sem contato ou credenciais; não é export de SQL nem execução independente de consulta pelo scanner.

A fonte da Orders API usa `provider_status='processed'` e `provider_status_detail='accredited'`. A consulta auxiliar da Payments API usa `approved/accredited` para comprovar o instante da acreditação. A projeção de prova que exigia somente `payments.provider_status='approved'` produzia um falso negativo para o espelho da Order; esse resultado não contradiz os estados `paid`/`pagamento_confirmado`, o pagamento canônico e a auditoria observados. Os contratos estão em `src/modules/payments/mercado-pago/classify.ts` e `src/modules/payments/confirmation.ts`.

**Recebimento autenticado de webhook continua sem prova.** O painel do Mercado Pago mostrou um evento real `order.processed` às `18:46:26 UTC`, de teste (`live_mode=false`), com `application_id=5878411684432009`; o painel humano estava na aplicação `2421731370448662`. A entrega anterior ao bypass autorizado falhou com HTTP 401, sem comprovar passagem pelo handler. O banco continua com zero notificações reais registradas; o reconhecimento financeiro acima veio da reconciliação.

Após o bypass autorizado, houve **uma requisição HTTP negativa**, com auditoria às `19:20:01.216 UTC`, sem HMAC, cuja auditoria registrou `application_mismatch`. A comparação da aplicação em `src/modules/payments/mercado-pago/signature.ts` ocorre antes da assinatura: esse negativo prova a recusa por aplicação divergente, sem provar recusa por HMAC inválido ou ausente. Ainda falta comprovar o vínculo entre a aplicação efetiva da Order, a aplicação aceita no ambiente e a chave correspondente, seguido de recebimento real com assinatura válida. Não se presume que os dois identificadores sejam equivalentes.

Os negativos adicionais, com auditorias às `19:47:00.562 UTC` e `19:47:00.790 UTC`, inclusive com a aplicação `2421731370448662`, também registraram `application_mismatch`; não comprovaram a validação de HMAC. Depois, somente `MERCADO_PAGO_APPLICATION_ID` no escopo Preview foi ajustada para `5878411684432009`, identificador da Order consultada de forma autenticada no Mercado Pago, preservando o escopo Preview e o tipo Sensitive. A republicação do mesmo SHA concluiu com sucesso na tentativa 2 do deployment C acima. O ajuste não comprova por si a correspondência da chave de assinatura; a prova de evento real autenticado continua pendente. O token de acesso e a chave de webhook não foram alterados nessa operação.

No deployment C, foi criado um segundo Pix sandbox para a solicitação `af086ad3-427c-4012-891f-a7c3e908cbf5`. A captura de banco às `20:20:31.349733 UTC` a mostra ainda `reserved`; esse instante é o da consulta, não o da criação da reserva. No recorte após `20:16:30 UTC`, aparecem duas auditorias `signature_invalid`, às `20:18:14.849 UTC` e `20:18:15.211 UTC`. A query de `recent_rejections` filtra o período, sem filtrar a tentativa individual: esses resultados não estabelecem, isoladamente, a correlação de cada recusa com o segundo Pix. O painel do Mercado Pago mostrou uma Order `action_required` da aplicação `5878411684432009` como controle desse período. As capturas `preview-second-pix-state-ui.txt`, `preview-second-pix-mp-event-ui.txt` e `preview-second-pix-mp-history-ui.txt` ficaram fora do Git. Esse recorte negativo não comprova assinatura válida nem pagamento reconhecido por webhook.

A [PR #198](https://github.com/BrunoMNoronha/techlab-troq/pull/198), na revisão original `06da77ab`, registra DEC-052 e uma correção limitada ao perfil de caixa do manifesto HMAC. O [SDK oficial Node 3.6.1](https://github.com/mercadopago/sdk-nodejs/blob/59a1f91e7c072cbda4e394267b24e7383ea3b1f3/src/utils/webhook/index.ts#L243-L248) preserva a caixa de `data.id`; a [receita oficial “Sem SDKs”](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications.md) ainda determina minúsculas. A decisão escolhe um único manifesto com a caixa original da query, mantendo parsing, omissão, guarda de aplicação antes do HMAC, correlação original e proibições de fallback, fonte alternativa no corpo ou chave alternativa. A CI de `06da77ab` concluiu com **falha em 14 casos de integração**, cujo diagnóstico identificou signers antigos nas fixtures; esse resultado histórico permanece registrado. A divergência das fontes não demonstra protocolo inequívoco, chave errada ou causa isolada das recusas.

A revisão posterior `05f90772` da PR #198 contém seis correções dos signers de fixtures em três arquivos. As validações locais fornecidas passaram: 49 testes focais, incluindo 12 HTTP; integração completa com 474 testes aprovados e 19 pulados, 32 arquivos aprovados e três pulados, em `289,22 s`; lint, tipagem e formatação aprovados. A [CI 37372049457](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37372049457) concluiu com sucesso para `05f90772`: integração com 474 aprovados/19 pulados em 32 arquivos aprovados/três pulados e backup/restauração comprovados na tentativa 1; validação aprovada na tentativa 2, após falha de infraestrutura do runner, com 1.141 testes unitários em 67 arquivos e 10 testes do pipeline aprovados. A PR #198 foi integrada em `2026-10-05T21:13:20Z`, formando `main@78e0035baa162b83bf00a433904605b05dacfc2c`. Essa CI é da correção de pagamentos, não da revisão atual da sprint após incorporar essa base. Ainda não há deployment D nem prova remota posterior do código corrigido. As provas B/C de `373748f` não homologam as revisões `06da77ab`, `05f90772`, a nova `main` ou #163/#164.

O runner real do deployment B aprovou **52 verificações da suíte HTTP negativa**, sem marcadores de contato detectados nas respostas examinadas. O relatório externo `http-negatives-bracketed-1791229807755.json` tem 15.769 bytes e SHA-256 `d8f693fcd32bd9146b22693d2f985ede6be00931d19488da65b4e808fdade66b`; sua estrutura, sucesso, SHA e método de identidade foram conferidos localmente, sem nova chamada HTTP nesta varredura. As seis actions usaram `bracketed_rsc`, com identidade exata nas leituras RSC antes/depois. As respostas POST das seis não ofereciam identidade direta: o relatório registra essa ausência e o método indireto, sem afirmar header de identidade confirmado na action. O executor também informou 21 testes offline aprovados do runner. Essa suíte não substitui a inspeção dos atributos remotos ocultos.

A varredura local das **capturas remotas iniciais parciais** reutilizou `phoneMarkers` e `markerMatches` do runner externo, com o contato privado somente em memória. Os 40 canários positivos passaram: oito grafias em texto, Unicode, percent encoding e entidades HTML decimais/hexadecimais; o controle sem contato teve zero correspondências. Os arquivos abaixo tiveram **zero categorias de marcador detectadas**, nas formas cobertas pelo scanner. Hashes e tamanhos fixam os bytes efetivamente inspecionados; o resultado não se estende a conteúdo oculto ou não capturado.

| Captura externa | Bytes | SHA-256 | Controle observado e limite |
| --- | --- | --- | --- |
| `preview-vercel-reconciliation-runtime.json` | 6.376 | `f151f60b0accfdef649178478ce0b94db14179e407d9016ead716462f47eb2d5` | 16 entradas HTTP parseadas do deployment B; reconciliação às `18:59:48` com `claimed=1`/`confirmed=1`, seguida de `18:59:56` com ambos zero; HTTP 200 em ambas. O resumo inicial de 15 entradas foi corrigido pela contagem do arquivo |
| `preview-sentry-contact-span-expanded-ui.txt` | 83.092 | `cbe4e552fcbd4cc5b52802bbabc7089932359ab0e4900ae427629b29434241b7` | Release do SHA `373748f`, ambiente Preview e `POST /contatos` reais; captura de 50 amostras dentre 66 exibidas e um span expandido |
| `preview-sentry-reconciliation-log-ui.txt` | 33.678 | `a81215d8feb5bd872551fa7aec314e480901967218be1da1c58fc8de21e48df3` | Release/ambiente e log `jobs.run` de `payments-reconcile`; expansão informada com `claimed=1` e `confirmed=1` |
| `preview-sentry-negative-webhook-log-ui.txt` | 37.047 | `08446b204ce9ae523962141af7aa7e26b770c2115ce68ce22bb12d11255e1c32` | Release/ambiente e rejeição real `application_mismatch`; assinatura não exercitada nesse negativo |
| `preview-sentry-email-failure-log-ui.txt` | 40.666 | `2e7001fe05bbff45eab06b1dc433047893169f9a1d8c8bafefdef0977c87df3c` | Release/ambiente e `email.delivery_failed` expandido, com endereço de servidor exibido como `[redacted]`; prova somente dessa captura de falha |
| `preview-browser-console-after-reveal.json` | 143 | `3891adc409ddd17767dcbdadd6dd9c11d440d720dbfdd78e45ccb1f96ce6972a` | Zero entradas; ausência honesta, sem uso como controle positivo |
| `preview-sentry-current-issues-ui.txt` | 5.836 | `82dcd8041709629e0e449d54431dceec48e595caf9e20ad265f03e413006695f` | Zero Issues nos filtros atuais observados; ausência, sem prova de sanitização de exceção real |

O relatório sanitizado `preview-telemetry-scan-report.json`, sua versão Markdown e o scanner ficaram fora do Git, no diretório externo da sprint. Há cinco controles de telemetria não vazios; console e Issues vazios permanecem separados. A interface positiva de contato e a releitura do banco não foram varridas como superfícies proibidas de telemetria. A contagem do scanner mede categorias de grafias com presença, não quantidade de eventos distintos.

Uma coleta posterior completou a expansão na UI dos 66 spans da entrega de contato, trace `f20d5692201940fb8e805a9ba8ec8f74`, release `373748fe16fa8fc5d92130397f24400e41ba69a4`, ambiente `preview`. O scanner final conferiu os três arquivos abaixo, totalizando 701.712 bytes, com **zero categorias de marcador detectadas**, 40 canários positivos aprovados e controle benigno sem correspondência.

| Captura final externa | Bytes | SHA-256 | Cobertura observada |
| --- | --- | --- | --- |
| `preview-sentry-contact-page1-complete-ui.txt` | 522.037 | `7083c01fbcda2a2258c6c094ffa959ad240533490d1d10f2eafff85cedca3ccf` | 50 linhas distintas, todas expandidas com descrição e `parent_span` próprios; 51 botões Hide brutos, 50 após excluir o apêndice de foco |
| `preview-sentry-contact-page2-complete-ui.txt` | 163.121 | `390ba841dfb3c38fc03b12e9bd1fc8f0aea99a8b12ac11b695150db0b5a5ab04` | 16 linhas distintas, todas expandidas com descrição e `parent_span` próprios; 17 botões Hide brutos, 16 após excluir o apêndice de foco |
| `preview-sentry-contact-root-span.json` | 16.554 | `32be87747dd782027c62959b9654f3e608de707311d77ffc4026c3b8a6342cb6` | JSON disponível da raiz `b36bed3f8515698c`, com 118 atributos e oito `event.contexts`; sem breadcrumbs |

Os relatórios externos `preview-sentry-contact-complete-scan-report.json` e `preview-sentry-contact-complete-scan-summary.json` registram 66 IDs curtos de ROW únicos e 66 blocos expandidos distintos, todos com os controles de release, trace e ambiente; nenhuma linha ficou sem descrição/pai ou com indicador de carregamento, inclusive as últimas das duas páginas. A identidade vem do link da ROW, sem inventar ID completo de filho. O `transaction.span_id` comum e o elemento de foco duplicado não entram na contagem. O JSON é da raiz já incluída: **uma raiz e 65 filhos**, não 67 spans. Os `SELECT`s de `user_contacts.phone_number` em duas linhas mostram placeholders `$1`, `$2` e `$3`, sem marcador detectado; não se infere redação dos bindings pela presença de `[redacted]` em outros atributos. Essa cobertura é dos atributos efetivamente exibidos pela UI e do JSON da raiz, sem afirmar JSON integral, contextos ou breadcrumbs de cada filho.

Na revisão do runtime, a agregação registra **cinco eventos de rewrite sem detalhes capturados**: três no recorte A e dois no B. `preview-runtime-coverage-report.json` e `preview-runtime-rewrite-followup-report.json`, fora do Git, distinguem os registros de funções capturados das contagens de roteamento. Isso é um limite da inspeção de metadados da plataforma, sem comprovar cinco payloads de aplicação faltantes. Não se afirma ausência de mensagens ou zero PII nos dados não capturados.

As fontes primárias sustentam essa distinção: [get_runtime_logs](https://vercel.com/docs/agent-resources/vercel-mcp/tools/observability/get_runtime_logs) documenta saídas de Functions e contagens por `group_by`, com enum de `source` que não oferece `rewrite`; [Observability, eventos rastreados](https://vercel.com/docs/observability#tracked-events) explica que uma requisição pode produzir vários eventos. A [referência de Log Drains](https://vercel.com/docs/drains/reference/logs) separa saídas `lambda`/`edge` da fonte `external`, torna `message` opcional e admite metadados como caminho e destino; o [dashboard de Runtime Logs](https://vercel.com/docs/logs/runtime) oferece o recurso Rewrite. Portanto, a limitação das consultas usadas não é uma afirmação de indisponibilidade universal desses detalhes. As cinco contagens, isoladamente, não criam exigência de capturar cada evento para C-8; filtros vazios e timeouts também não provam conteúdo ausente ou sanitizado.

C-8 remota permanece **pendente**. Os atributos visíveis dos 66 spans desse trace estão agora cobertos; as lacunas efetivas incluem campos ainda ocultos dos eventos/logs realmente emitidos, cobertura do período de runtime e prova remota do SHA final corrigido. Os cinco rewrites permanecem como limite de inspeção de metadados de roteamento, sem serem, por si, cinco payloads de aplicação faltantes ou uma reprovação automática de C-8. Exceções não exercitadas e breadcrumbs ausentes do JSON da raiz são classes não cobertas por essas capturas, sem alegação de sanitização; não criam requisito de forçar erro remoto ou obter campo que não foi emitido. Console e Issues vazios continuam sendo evidência de ausência nos filtros, sem prova de sanitização de exceções reais. Os controles capturados, os 52 negativos HTTP de B e as duas leituras autorizadas não fecham #104/#105 e não homologam #163/#164; também não validam remotamente a nova base `78e0035b` ou a sprint que a incorporou. A revogação do token temporário do Mercado Pago e a retirada do bypass usado na prova continuam pendentes.

Google foi aceito e [#133 encerrada](https://github.com/BrunoMNoronha/techlab-troq/issues/133) após a integração da [PR #180](https://github.com/BrunoMNoronha/techlab-troq/pull/180). O aceite foi registrado na revisão `a8acf2e4654c23db0a9b75db3ae0d91395d4d5ab`, em `google-sign-in-proof.md`. Na origem estável de Preview, o agente observou PKCE/callback, recusa de vinculação implícita, vinculação explícita, logout e nova entrada na conta verificada/ativa. No [registro final de aceite](https://github.com/BrunoMNoronha/techlab-troq/issues/133#issuecomment-5999419537), Bruno confirmou as duas provas restantes: novo cadastro Google com nome, 18+/termos e cancelamento/repetição, além de cadastro e entrada por email/senha com verificação por link. Essas etapas finais são homologação humana, sem reprodução independente pelo agente ou nova contagem de banco nesta rodada. Não foram expostos email, credenciais ou cookies; o aceite não comprova verificação de marca nem abertura comercial Google e não aprova #104/#105.

## Roteiro de homologação

1. Completar as pendências remotas de #104 no Preview identificado: vínculo de aplicação e assinatura do webhook, recebimento real correlacionado e varredura C-8 com controles não vazios. Registrar SHA/deployment/intervalo, reconciliar os contratos e registrar o gate #105.
2. Após integração autorizada e CI aprovada, publicar a revisão da sprint no Preview pelo pipeline existente.
3. Encerrar uma negociação como anunciante e outra como escolhido; confirmar retry e acesso ao histórico. Reselecionar uma solicitação paga elegível, com anúncio publicado, preservando contato e negociação anteriores.
4. Enviar e editar a primeira nota; conferir que a contraparte, HTML/RSC e agregado público não recebem a nota ainda cega. Enviar a segunda, verificar publicação e média/contagem; confirmar recusa de edição posterior.
5. Registrar a prova mobile de 375 px, teclado, falha de rede e recuperação. Registrar SHA, CI, run/tentativa, deployment e resultado de cada passo, sem dados pessoais ou segredos.

Até esse aceite, usar `Refs #104`, `Refs #105`, `Refs #163` e `Refs #164`. #133 já está encerrada pelo aceite específico acima. Não declarar concluída a sprint, a Fase 4 ou a abertura comercial. Denúncia/moderação, sanções, notificações e os gates seguintes permanecem nas entregas previstas.
