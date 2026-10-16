# Verificação de segurança da Fase 3 — F3-014 (#104)

Baseline da revisão de código: `23b503d` (inclui #147, #148 e #89), na branch `codex/issue-104-seguranca`. Revisão técnica inicial: Codex, no escopo da execução solicitada por Bruno. Status após a revisão documental de 2026-10-07: **parcial**. A varredura remota registrada em 2026-10-06 cobre as superfícies da seção "C-8 remoto no Preview"; faltam a captura do console da jornada e a rastreabilidade dos deployments para concluir C-8 remoto. Este documento não aprova #104/#105/#54 nem o lançamento #130.

## Método e matriz

As provas usam PostgreSQL 17 descartável e sessões Better Auth reais. A emissão de e-mail e o Mercado Pago são simulados; não há pagamento real. Mock de `next/headers` na chamada direta só fornece o cookie emitido pelo provedor real; a prova HTTP envia esse mesmo tipo de cookie para um servidor Next.js real.

`authorization-matrix.integration.test.ts` foi estendida com reserva, pagamento, escolha, reseleção e entrega. A fotografia de domínio inclui as tabelas financeiras, os guards de #148, negociações, autorizações e acessos, além das tabelas de anúncios e mídia. A negativa de entrega grava `contact.access_denied`: esse evento previsto no contrato é permitido, sem alteração dos fatos de negócio.

| Atores reais | Ações e leituras verificadas | Resultado exigido |
| --- | --- | --- |
| Anônimo, revogado, expirado, não verificado, `blocked_age`, `blocked_admin`, `deletion_requested` | Registrar contato; reservar; obter Pix; escolher; opções do dono; solicitação, lista de solicitações e lista de liberações | Recusa de sessão, sem gravação de negócio; nenhuma leitura privada |
| Terceiro, reserva, pago não escolhido, escolhido, escolhido anterior | Escolha e opções de anúncio alheio; Pix de reserva alheia; solicitação alheia | Recusa uniforme; inexistente e recurso alheio indistinguíveis; banco idêntico |
| Dono | Escolha idempotente; tentativa de reservar o próprio anúncio; Pix de terceiro; entrega ao próprio anunciante | Só a escolha autorizada funciona; não recebe contato do solicitante |
| Escolhido atual e anterior | Entrega e releitura das autorizações próprias e alheias | Cada um conserva sua autorização; a anterior não dá acesso à nova; cada entrega auditada |

`contact-delivery.http.integration.test.ts` amplia a prova por HTTP: HTML e RSC de `/contatos`, `/solicitacoes`, `/solicitacoes/[id]` e `/anuncios/[id]/solicitacoes`, cinco Server Actions e os três jobs de pagamento. Contas tornadas inválidas **depois** do login exercitam sessões remanescentes. Cookie de usuário, ausência de segredo, segredo errado e esquema Basic não autorizam jobs. Suítes existentes completam os controles positivos de dono/solicitante, o isolamento entre contas, a superfície pública, o fechamento do anúncio e a recusa `already_paid`.

## C-8: fluxo completo e erro real

Novo caso em `payment-confirmation.integration.test.ts`: reserva e Pix pelo fluxo real; aprovação observada no provedor simulado; webhook validado; escolha do dono; entrega ao escolhido; negativa a terceiro; erro real do PostgreSQL ao gravar o acesso, com rollback. A SDK real `@sentry/nextjs` usa `createTelemetryOptions` e transporte que captura os envelopes sem rede. A prova percorre breadcrumbs, mensagem, erro e log estruturado; captura cinco níveis de console, auditoria e respostas de erro. Contato só aparece na resposta autorizada, excluída da varredura das superfícies proibidas.

A captura tem controles não vazios: envelope com marcador diagnóstico conhecido, erro real e log real, além de um acesso gravado. Isso comprova a fronteira local da SDK; **não comprova recebimento nem busca no Sentry remoto do Preview**.

## C-8 remoto no Preview (2026-10-06)

Varredura registrada em 2026-10-06 sobre a jornada executada no Preview estável, de **2026-10-05 18:30 UTC a 2026-10-06 00:30 UTC**. Revisão técnica da coleta: Claude Code, a pedido de Bruno. Só leitura: nenhuma configuração, publicação, cobrança ou escrita no banco. A revisão documental de 2026-10-07 conferiu o diff, as fontes do contrato e a CI citada; não repetiu a coleta remota nem declara os resultados abaixo como uma nova execução.

**O fluxo observado.** A auditoria do banco de Preview registra a jornada inteira, pelas ações reais da interface:

| Evento | Quantidade |
| --- | --- |
| Tentativa, reserva e cobrança Pix sandbox | 4 de cada |
| Pagamento aprovado e solicitação paga | 4 |
| Escolha e autorização de liberação | 2 |
| Entrega de contato auditada | 6 |
| Acesso ao contato negado | 9 |
| Notificação do provedor recusada | 25 |

O registro da coleta atribui os deployments do intervalo à branch `production` nos SHAs `373748f`, `78e0035` e `f85fe73`; o último era a `main` no momento da coleta. O relatório não identifica cada deployment, seu run/tentativa e os eventos de cada SHA. Esses dados ainda precisam ser registrados para conferir o alvo efetivo Preview e correlacionar a jornada e os controles por deployment, como exige o [runbook](preview-pix-sandbox-runbook.md), seções "Pré-condições e isolamento" e "Execução e evidência". O nome da branch não comprova o ambiente publicado. O contato do anunciante é sintético e não é reproduzido aqui.

**Superfícies varridas.** A busca usou o número completo, o número sem DDI e variantes com separador.

| Superfície | Controle não vazio no intervalo | Ocorrências |
| --- | --- | --- |
| Sentry de Preview, eventos de erro (JSON completo de cada evento) | 8 eventos `signal:payments.notification_rejected` | 0 |
| Sentry de Preview, logs estruturados | 177 logs de sinais e jobs | 0 |
| Sentry de Preview, spans (busca no servidor) | 454 spans de `/contatos`, 12 deles do POST da entrega; a mesma busca curinga acha as rotas | 0 |
| Logs de runtime da Vercel, Preview | Requisições de todas as rotas da jornada, incluindo `/contatos`, `/solicitacoes`, o webhook e os jobs; a mesma busca acha "reconciliacao executada" em 8 deployments | 0 |
| Banco de Preview, todas as tabelas públicas, linha inteira como texto | 74 auditorias e 6 acessos ao contato | 0 fora de `user_contacts` |

A única ocorrência no banco é o próprio cadastro do contato, o armazenamento legítimo, e serve de controle positivo da busca. Os 82 registros de nível `error` da Vercel são todos o aviso de `sslmode` do driver `pg` escrito no stderr, sem dado de usuário.

**Receptor público sob rejeição real.** As 25 notificações recusadas correspondem exatamente às orders das tentativas do TROQS. Nenhuma criou `payment_notifications`, efeito financeiro, vaga ou liberação. A auditoria guarda só motivo e identificadores técnicos, sem o número. Isso cumpre a verificação pedida por F3-001 sobre volume de rejeições, agora com tráfego real do provedor.

**Limite.** O console do navegador da jornada de 2026-10-05 não foi capturado e não pode ser recuperado. As mensagens de erro da interface têm prova nas suítes HTTP da CI, em uma camada distinta da jornada remota. A varredura de console faz parte da execução definida pelo runbook; sua ausência impede declarar C-8 remoto integralmente aprovado. As quatro aprovações vieram da reconciliação autenticada, e não do webhook: isso é o achado F3-S2.

## Achados

| ID | Severidade | Evidência e correção | Limite |
| --- | --- | --- | --- |
| F3-S2 | Bloqueia a homologação do webhook; isolamento de configuração a conferir | Callbacks reais do sandbox no Preview recusados: 17 `signature_invalid`, 5 `application_mismatch` e 3 `signature_missing`. A recusa por assinatura persistiu depois da DEC-052 (`78e0035`), com o identificador em maiúsculas e a caixa preservada; essa correção não resolveu a recusa. A coleta diagnóstica da PR #200 não gravou nenhum evento. O receptor falhou fechado no fluxo observado | A [conferência do painel registrada em #203](https://github.com/BrunoMNoronha/techlab-troq/issues/203#issuecomment-6012565436) identificou credenciais de teste da aplicação de Production no Preview e a URL de teste dessa aplicação com bypass na query. A conferência não alterou a configuração. Ainda é necessário comprovar o isolamento e um callback legítimo aceito; a recusa não demonstra ausência de risco na configuração nem elimina toda hipótese de código. Não há evidência registrada de comprometimento. #203 continua condição do gate #105 |
| F3-S1 | Média | Webhook rejeitado com telefone em `x-request-id` e `data.id` persistia o número em `AuditEvent.details`. A regressão falhou antes da correção, mostrando os dois campos. `safeRejectedId` agora descarta identificadores que a redação compartilhada reconhece como sensíveis, antes de gravar a negativa. Prova também pela rota HTTP | Heurística conservadora pode descartar identificadores técnicos numéricos; não altera assinatura, resposta, correlação de notificações validadas, pagamentos ou vagas |

O prefixo dos identificadores sintéticos de rejeição foi ajustado para distinguir correlação técnica de uma sequência isolada semelhante a telefone. Os testes continuam exigindo o identificador técnico completo no registro legítimo; não foram relaxados. A rajada HTTP tem 32 requisições concorrentes, cada uma recusada e auditada, sem alteração dos fatos financeiros nem persistência do telefone enviado no corpo.

Na atualização com a interface de #152, a [CI 37282794615](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37282794615) encontrou quatro falhas de fixtures: um sufixo hexadecimal composto apenas de dígitos parecia telefone na correlação rejeitada; três provas de duplicidade tardia geravam ids com zero inicial, perdido pela serialização numérica da API simulada. Os segmentos aleatórios de correlação agora também têm prefixo alfabético, e os ids numéricos começam com `1`. As asserções de correlação completa, privacidade e duplicidade permanecem iguais; a correção não altera código de produção.

## Reexecução dos contratos no mesmo SHA

O job de integração aplica todas as migrations em PostgreSQL efêmero, faz o build e inicia o servidor HTTP. As suítes abaixo rodam no **mesmo checkout/SHA do job**. Execução em sandbox real do Mercado Pago e homologação de Preview são camadas separadas.

| Critério | Prova executável principal |
| --- | --- |
| T-1 | `reservation.integration.test.ts`: mais de três participantes e espera real observada em `pg_stat_activity` |
| T-2 | `payment-confirmation.integration.test.ts`: confirmações concorrentes da última vaga |
| T-3 | Mesma suíte: webhook repetido, um único efeito |
| T-4 | Mesma suíte: eventos fora de ordem |
| T-5 | `payment-reconciliation.integration.test.ts`: aprovação sem nenhuma notificação |
| T-6 | `payment-confirmation.integration.test.ts`: acreditação tempestiva, reconhecimento tardio |
| T-7 | `technical-refund.integration.test.ts`: aprovação fora da janela e RT-2 |
| T-8 | Mesma suíte: eleição canônica concorrente e RT-1; `late-duplicate.integration.test.ts` complementa #147 |
| T-9 | `technical-refund.integration.test.ts`: três vagas ocupadas, RT-3 |
| T-10 | `payment-confirmation.integration.test.ts`: falha de persistência e retomada |
| T-11 | Mesma suíte: consulta ao provedor indisponível |
| T-12 | Mesma suíte e classificadores unitários de pagamento: estado desconhecido |
| T-13 | Mesma suíte e `webhook.http.integration.test.ts`: autenticidade e registro mínimo |
| T-14 | Mesmas suítes: manifesto reconstruído do corpo recusado |
| T-15 | `charge.integration.test.ts`: criação retomada com a mesma chave |
| T-16 | `technical-refund.integration.test.ts`: reembolso repetido reconhecido como concluído |
| T-17 | `payment-reversal.integration.test.ts`: reversão preserva vaga e liberação, retira elegibilidade |
| T-18 | `payment-reconciliation.integration.test.ts`: trabalhos realmente sobrepostos, conjuntos disjuntos |
| C-1 | `public-surface.http.integration.test.ts`, contratos públicos e `contact.integration.test.ts` |
| C-2 | `contact-delivery.integration.test.ts` e prova HTTP: pago não escolhido |
| C-3 | Mesma suíte: solicitação fora de `paid` |
| C-4 | Mesma suíte e matriz: autorização alheia |
| C-5 | Mesma suíte: prova substituta de DV-13, ator real sem relação; reexecutar com moderador real em #55 |
| C-6 | Mesma suíte, matriz e HTTP: entrega e auditoria de cada acesso |
| C-7 | `contact-delivery.http.integration.test.ts`: cabeçalhos e manifesto sem pré-renderização |
| C-8 | Fluxo completo com SDK real e erro real na prova local; varredura remota registrada em 2026-10-06 na seção "C-8 remoto no Preview", parcial por ausência de console e rastreabilidade por deployment |
| C-9 | `selection.integration.test.ts`: escolhas concorrentes observadas no banco |
| C-10 | `payment-reversal.integration.test.ts` e entrega: contato anterior permanece após reversão |
| C-11 | `contact-reveal.test.tsx` e HTTP: número ausente de propriedades e payload antes da ação autorizada |

## Validações e revisão reforçada

- PostgreSQL local: 11 migrations aplicadas em banco vazio descartável.
- Matriz direta: **25/25 aprovados** na execução local, incluindo os 13 casos adicionados.
- Confirmação/C-8/F3-S1: **33/33 aprovados** na reexecução local após a correção.
- F3-S1: regressão inicialmente **reprovada** com os dois identificadores contendo telefone, antes da correção.
- Unitários locais focados em redação/opções de Sentry e componente de contato: **58/58 aprovados**. Formatação, lint e typecheck locais aprovados.
- **CI completa aprovada no SHA `cfe2c9b3c4180058f0d4d6e96f8962985eb60b57`**, [run 37281574190](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37281574190): ambos os required checks `success`; 63 arquivos e **1.085 testes unitários**; 32 arquivos e **471 testes de integração aprovados**; 3 arquivos/19 casos pulados pelos pré-requisitos externos de R2 real e sandbox Mercado Pago. A camada de provedor real não foi declarada aprovada por esses testes.
- No mesmo SHA: matriz **25/25**, confirmação/C-8/F3-S1 **33/33**, contato por HTTP **30/30**, webhook por HTTP **11/11**. Todos os contratos T/C da tabela rodaram nesse checkout, incluindo as provas realmente concorrentes. Na data desse run, **C-8 remoto permanecia pendente**; a coleta remota posterior e seus limites estão registrados acima. C-5 permanece substituto conforme DV-13.
- Build, aplicação de migrations, **8/8 testes do pipeline** e backup cifrado/restauração com dados sintéticos passaram no mesmo run. Isso não é deploy nem prova de recursos compartilhados.
- Revisão de fonte: validação de sessão por ação; autorização por titularidade; cadeia da entrega conferida a cada acesso; trava de anúncio e guard de pagamento; ausência de número nos DTOs, auditoria legítima, sinais e e-mails; receptor público com corpo limitado e assinatura obrigatória; jobs por segredo, sem substituição por cookie.

Na entrega inicial de código, nenhuma dependência nova ou migration foi criada. As mudanças de produção se limitaram à redação dos identificadores de webhook rejeitado e à exportação da função compartilhada de redação. Nenhuma nova política de negócio, perfil de moderação ou exceção a RB-001. A PR #204 altera somente este relatório e o estado de F3-014 no plano e no backlog.

A revisão reforçada de **código e CI** está registrada acima. O contêiner PostgreSQL descartável `troq-issue104-ephemeral` e seu volume anônimo foram removidos após as provas locais, sem tocar os demais recursos. As atualizações posteriores deste relatório alteram apenas documentação; a revisão documental de 2026-10-07 não executou testes locais nem alterou recursos de Preview.

## Reexecução na `main` em `f85fe73`

A [CI 37385633546](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37385633546) da `main` em `f85fe73` passou nos dois required checks. Foram 1.192 testes unitários e 483 de integração aprovados, com 21 pulados pelos pré-requisitos de R2 real e sandbox. No mesmo SHA passaram a matriz (25), confirmação/C-8/F3-S1 (33), contato por HTTP (30), webhook por HTTP (12), reserva (22), escolha (21), reconciliação (21), reembolso técnico (11), cobrança (10), reversão (9), entrega (9), contato (9), superfície pública (10) e duplicidade tardia (3).

## Pendências de aceite de #104

1. Executar a jornada autorizada em Preview com captura e varredura de console, mensagens de erro, runtime Vercel e Sentry remoto, com controles não vazios ligados ao mesmo fluxo e intervalo. A prova HTTP/local não substitui a captura remota ausente.
2. Registrar SHA, run/tentativa, identidade de cada deployment, alvo Preview e intervalo de seus eventos e controles, sem URLs com segredo ou dados pessoais. Os três SHAs históricos, sem esses vínculos, não comprovam toda a rastreabilidade exigida pelo runbook.

Até cumprir essas pendências, a PR usa **Refs #104**; a matriz e C-8 local têm evidência, mas #104 permanece parcial. Não se declara nova prova remota nesta revisão.

## Pendências de homologação e fase seguinte

1. F3-S2 ([#203](https://github.com/BrunoMNoronha/techlab-troq/issues/203)): confirmar a configuração isolada do Preview e comprovar um webhook legítimo aceito, com repetição idempotente. Continua exigido pelo gate #105 e pelo runbook da homologação Pix. A decisão e a configuração de aplicação/chave no painel são do Bruno; este relatório não as executa.
2. C-5 com moderador real, quando a Fase 4 introduzir o papel (#55).

A matriz exercita os atores reais, a prova local de C-8 passou, F3-S1 foi corrigido e F3-S2 está rastreado em #203 com dono e prazo. A coleta remota registrada não basta para encerrar #104 pelos limites acima. #105, #54 e #130 permanecem sem aprovação por esta entrega.
