# Transição para a Fase 1 — verificação do gate de saída da Fase 0

Documento produzido por **F0-023**. Ele **audita** o gate de saída da Fase 0 registrado em [roadmap.md](roadmap.md), verifica os requisitos dos quais a Fase 1 e a Fase 2 dependem, revisa os riscos à luz do encerramento da fase e registra formalmente a transição.

**Este documento não decide nada de produto.** Ele não altera regra de negócio, requisito, ADR ou decisão vigente; não fecha decisão aberta; não cria decisão nova; não implementa código, schema, migration ou integração; e não provisiona serviço externo. Onde uma fonte normativa já decide, ela é citada e obedecida.

## 1. Objetivo

Comprovar, item a item e com evidência verificável, se o gate de saída da Fase 0 está satisfeito; classificar o estado real dos entregáveis da Fase 1; e registrar o primeiro trabalho da Fase 1.

## 2. Baseline auditado

| Item | Valor observado |
| --- | --- |
| Repositório | `BrunoMNoronha/techlab-troq` |
| Remote `origin` | `https://github.com/BrunoMNoronha/techlab-troq.git` |
| Branch principal | `main` |
| `HEAD` local no início | `f5518a81edc29d9ed4b31197adaef1d99215306f` |
| `origin/main` no início | `f5518a81edc29d9ed4b31197adaef1d99215306f` |
| Divergência `HEAD` × `origin/main` | nenhuma |
| Árvore de trabalho | limpa |
| Stashes | nenhum |
| PRs abertas | nenhuma |
| Branch de trabalho desta tarefa | `docs/f0-023-phase1-transition` |

`f5518a8` é o squash merge da PR #23, que concluiu F0-022 e consolidou a baseline arquitetural. Nenhuma alteração local preexistente foi encontrada e, portanto, nenhuma foi descartada.

### 2.1 Governança real de `main`

Lida diretamente da API do GitHub, não presumida:

| Item | Estado real |
| --- | --- |
| Ruleset | `Protect main`, `enforcement: active`, escopo `refs/heads/main` |
| Regras | `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks` |
| Approvals exigidos | `0` |
| Métodos de merge permitidos | `squash`, `merge`, `rebase` |
| Required status check | `Validação (format, lint, typecheck, test, build)` |
| Política de checks | estrita (`strict_required_status_checks_policy: true`) |
| Bypass actors | nenhum; `current_user_can_bypass: never` |

Isso confere com o descrito em [../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md), seção 7, e com o job `validate` de [../../.github/workflows/ci.yml](../../.github/workflows/ci.yml).

## 3. Data da verificação

**2026-09-14.**

## 4. Matriz do gate de saída da Fase 0

O gate auditado é exatamente o registrado em [roadmap.md](roadmap.md), seção "Fase 0 — Descoberta e definição", subseção "Gate de saída". Ele foi decomposto em critérios verificáveis individualmente. Nenhum item é aprovado por inferência global.

| # | Critério | Fonte normativa | Evidência encontrada | Resultado |
| --- | --- | --- | --- | --- |
| G-1 | OD-08 fechada por ADR correspondente | [roadmap.md](roadmap.md), gate da Fase 0 | [../decisions/open-decisions.md](../decisions/open-decisions.md), tabela "Decisões fechadas": OD-08 → [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), DEC-036. A ADR existe, está com Status **Aceito — Fase 0 (2026-09-14)** e declara explicitamente que fecha OD-08 | **PASS** |
| G-2 | OD-09 fechada por ADR correspondente | [roadmap.md](roadmap.md), gate da Fase 0 | [../decisions/open-decisions.md](../decisions/open-decisions.md): OD-09 → [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md), DEC-026. A ADR existe, Status **Aceito — Fase 0 (2026-09-07)**, e declara que fecha OD-09 | **PASS** |
| G-3 | Demais decisões exigidas pelo gate fechadas (OD-01 a OD-07, OD-10, OD-11, OD-12) | [roadmap.md](roadmap.md), gate da Fase 0 | Tabela "Decisões fechadas" de [../decisions/open-decisions.md](../decisions/open-decisions.md), conferida item a item contra o arquivo que fecha cada uma: OD-01 → [../product/negotiation-lifecycle.md](../product/negotiation-lifecycle.md) (DEC-029); OD-02 → [../product/ratings.md](../product/ratings.md) (DEC-030); OD-03 → [../product/prohibited-items.md](../product/prohibited-items.md) (DEC-031); OD-04 → [../product/listing-lifecycle.md](../product/listing-lifecycle.md) (DEC-027); OD-05 → [../product/image-policy.md](../product/image-policy.md) (DEC-028); OD-06 → [../product/reselection-policy.md](../product/reselection-policy.md) (DEC-032); OD-07 → [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037); OD-10 → [../product/data-retention-policy.md](../product/data-retention-policy.md) (DEC-033); OD-11 → [../product/age-eligibility.md](../product/age-eligibility.md) (DEC-034); OD-12 → [../product/interest-flow.md](../product/interest-flow.md) (DEC-035). Os doze arquivos existem no repositório | **PASS** |
| G-4 | Nenhuma OD da Fase 0 permanece aberta | [../decisions/open-decisions.md](../decisions/open-decisions.md) | A seção "Lista de decisões abertas" contém literalmente **"Nenhuma. Não resta nenhuma decisão aberta na Fase 0."** Os IDs OD-01 a OD-12 estão todos na tabela de fechadas; não há OD-13 ou posterior | **PASS** |
| G-5 | F0-010 concluído com evidência preservada | [backlog.md](backlog.md); [roadmap.md](roadmap.md) | [backlog.md](backlog.md) marca F0-010 como `concluído (10 de 10 critérios comprovados na 6ª execução, 2026-09-14)`. A evidência das seis execuções está versionada em [spikes/f0-010-mercado-pago-pix-r099.md](spikes/f0-010-mercado-pago-pix-r099.md), arquivo presente na árvore | **PASS** |
| G-6 | F0-022 concluído e os quatro documentos arquiteturais existentes | [roadmap.md](roadmap.md), entregáveis da Fase 0 | [backlog.md](backlog.md) marca F0-022 como `concluído`. Os quatro arquivos existem e declaram, no cabeçalho, terem sido produzidos por F0-022: [../architecture/overview.md](../architecture/overview.md) (310 linhas), [../architecture/data-model.md](../architecture/data-model.md) (425), [../architecture/payments-design.md](../architecture/payments-design.md) (390) e [../architecture/contact-release.md](../architecture/contact-release.md) (265). A decisão arquitetural que o trabalho exigiu está em [../adr/0006-async-work-scheduling-concurrency.md](../adr/0006-async-work-scheduling-concurrency.md), Status **Aceito**, DEC-038 | **PASS** |
| G-7 | Requisitos dos quais a Fase 1 e a Fase 2 dependem em status adequado para implementação | [roadmap.md](roadmap.md), gate da Fase 0 | Verificação individual na seção 5 deste documento. Dos 12 requisitos citados pelo roadmap como dependência da Fase 1 e da Fase 2, **9 estão `definido`** e **3 estão `parcialmente definido`** (RF-004, RF-021, RNF-018). **Nenhum** está `aberto`, `bloqueado por decisão aberta` ou sem fonte. Ver a observação O-1 abaixo, que é parte integrante deste resultado | **PASS** |
| G-8 | Nenhum item `próximo` ou `bloqueado` da Fase 0 além da própria F0-023 | [roadmap.md](roadmap.md), gate da Fase 0; [backlog.md](backlog.md) | Varredura da coluna "Estado" de [backlog.md](backlog.md): F0-001 a F0-022 e F0-024 estão todos `concluído`; o único item não concluído era **F0-023**, em estado `próximo`. Nenhum item `bloqueado` e nenhum item `pendente` restavam | **PASS** |
| G-9 | Arquitetura necessária antes da implementação versionada | [roadmap.md](roadmap.md), entregáveis e gate da Fase 0 | Além dos quatro documentos de G-6, estão versionados os seis ADRs ([../adr/0001-modular-monolith-nextjs.md](../adr/0001-modular-monolith-nextjs.md) a [../adr/0006-async-work-scheduling-concurrency.md](../adr/0006-async-work-scheduling-concurrency.md), todos com Status **Aceito**) e as bases de engenharia [../engineering/conventions.md](../engineering/conventions.md) e [../engineering/testing.md](../engineering/testing.md), ambas declaradas preparatórias da Fase 1. [../architecture/data-model.md](../architecture/data-model.md) entrega o quadro de invariantes com a indicação de onde cada uma é protegida, que é o insumo direto do schema da Fase 1 | **PASS** |
| G-10 | Nenhuma contradição normativa conhecida impede abrir a Fase 1 | [../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md), seção 2 (hierarquia de verdade) | Conferência cruzada entre os níveis 2 a 6 da hierarquia: decision log (DEC-001 a DEC-038, sem lacuna de ID), open decisions (vazia), mvp-scope, business-rules (RB-001 a RB-006 inalteradas), requirements, ADRs, architecture, engineering, roadmap e backlog. Nenhuma contradição normativa **material** foi encontrada. Foram encontradas duas defasagens **factuais e datadas** de redação, registradas em O-2 e O-3, que não alteram norma e foram corrigidas nesta entrega | **PASS** |

### Observações da matriz

**O-1 — os três requisitos `parcialmente definido` de G-7.** O critério do roadmap está redigido como "Requisitos que a Fase 1 e a Fase 2 dependem com status `definido`". Lido ao pé da letra, RF-004, RF-021 e RNF-018 não satisfariam a redação. A escolha de registrar **PASS** é deliberada e explícita, e está fundamentada — não inferida — em três fontes normativas:

1. [../product/requirements.md](../product/requirements.md) define `parcialmente definido` como "núcleo definido, mas há lacunas apontadas **para uma decisão aberta**". Como não resta nenhuma decisão aberta (G-4), nenhuma das três lacunas aponta para decisão: elas são trabalho de design ou métrica.
2. [../decisions/open-decisions.md](../decisions/open-decisions.md) é explícita: "Detalhe que apenas aguarda design — tempos, mecanismos, schema — **não** é decisão aberta e não deve ser registrado aqui." Portanto essas lacunas, por norma do próprio projeto, não são decisão pendente.
3. Em dois dos três casos a própria fonte atribui a resolução à fase em questão: RNF-018 tem como critério de aceite "ferramentas e escopo definidos **na Fase 1**", reafirmado por [../architecture/overview.md](../architecture/overview.md) (AR-14.1); e RF-021 remete a lista completa de emails ao "design de cada fluxo". Exigir que estejam `definido` **antes** de abrir a Fase 1 seria uma condição circular criada pela própria redação do roadmap.

O que **não** foi feito, por proibição expressa do escopo de F0-023: nenhum dos três requisitos teve conteúdo normativo, critério de aceite ou rótulo de status alterado para fazer o gate passar. A tensão de redação permanece registrada como pendência documental na seção 10.2, para tratamento em trabalho próprio se o orquestrador julgar necessário.

**O-2 — `README.md` descrevia a Fase 0 como "em andamento".** Fato datado, verdadeiro até esta auditoria e falso depois dela. Corrigido nesta entrega, sem alteração de norma.

**O-3 — `docs/project-state.md`, seção 3, afirmava que "nada de código existe".** Isso era verdadeiro em 2026-09-07, data de registro do documento, e deixou de ser quando a fundação técnica mínima foi criada. A seção foi reorganizada nesta entrega para distinguir **baseline histórica** de **estado atual**, sem apagar o registro original.

## 5. Requisitos necessários à Fase 1 e à Fase 2

Conjunto obtido dos requisitos **efetivamente citados** por [roadmap.md](roadmap.md) nos entregáveis e gates da Fase 1 e da Fase 2 — não de uma leitura livre do catálogo. Status lido de [../product/requirements.md](../product/requirements.md).

### 5.1 Dependências da Fase 1

| Requisito | Onde o roadmap o exige | Status | Adequado para implementação? |
| --- | --- | --- | --- |
| RNF-015 — Proteção de segredos | Gate da Fase 1: "Nenhum segredo versionado (RNF-015)" | `definido` | Sim. É a dependência direta de F1-001 |
| RNF-018 — Observabilidade básica | Entregável da Fase 1: "logs estruturados e rastreamento de erros, sem dados protegidos (RNF-018)" | `parcialmente definido` | Sim, com ressalva. A lacuna é a ferramenta concreta, que o próprio requisito e AR-14.1 atribuem à Fase 1. Os sinais mínimos já estão fixados em AR-14.3 |

### 5.2 Dependências da Fase 2

| Requisito | Onde o roadmap o exige | Status | Adequado para implementação? |
| --- | --- | --- | --- |
| RF-001 — Cadastro de conta | Entregável "Autenticação com Better Auth (RF-001 a RF-003)" | `definido` | Sim |
| RF-002 — Verificação de email | idem | `definido` | Sim |
| RF-003 — Autenticação e sessão | idem | `definido` | Sim |
| RF-004 — Publicação de anúncio | Entregável "Publicação de anúncio com ciclo de vida (RF-004)" | `parcialmente definido` | Sim, com ressalva. Núcleo definido (estado inicial `draft`, publicação explícita, mínimo de uma imagem processada, declaração de conformidade); a lacuna é o conjunto de campos além de título, descrição, imagens e cidade/UF — design de Fase 2, não decisão |
| RF-005 — Consulta de anúncios | Entregável "Consulta de anúncios: listagem e detalhe sem contato (RF-005)" | `definido` | Sim |
| RF-006 — Imagens do anúncio | Entregável "Upload e otimização de imagens no R2 (RF-006, RNF-005)" | `definido` | Sim |
| RF-007 — Localização pública por cidade/UF | Entregável "Localização pública por cidade/UF (RF-007)" | `definido` | Sim |
| RF-014 — Proteção do contato do anunciante | Gate da Fase 2: "Nenhum payload público contém telefone/WhatsApp (RF-014 verificado por teste)" | `definido` | Sim |
| RF-021 — Email transacional | Entregável "Email transacional de verificação via Resend (RF-021)" | `parcialmente definido` | Sim, com ressalva. O email de verificação — o único que a Fase 2 exige — é obrigatório e está definido, inclusive por RF-002, que está `definido`. A lacuna é o catálogo completo de notificações, que pertence ao design de cada fluxo |
| RNF-005 — Otimização de imagens | Entregável "(RF-006, RNF-005)" | `definido` | Sim |

### 5.3 Resultado da verificação de requisitos

- Requisitos verificados: **12**.
- `definido`: **9**.
- `parcialmente definido`: **3** (RF-004, RF-021, RNF-018).
- `bloqueado por decisão aberta`: **0**.
- Sem fonte normativa suficiente: **0**.
- Com contradição entre fontes: **0**.

Nenhum requisito necessário à Fase 1 ou à Fase 2 está aberto, bloqueado ou sem fonte. As três lacunas residuais são de design ou de métrica e nenhuma delas bloqueia o primeiro trabalho da Fase 1 (F1-001), cuja dependência de requisito é RNF-015, `definido`. Ver O-1.

> **Nota de atualização — 2026-09-15, F1-008.** Este resultado é o **registro da auditoria de F0-023** e é preservado como tal. Uma das três lacunas deixou de existir desde então: **RNF-018 passou a `definido`**, porque [../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md) (DEC-039) escolheu a ferramenta de observabilidade e o seu escopo — exatamente a lacuna que a linha de RNF-018 na seção 5.2 nomeava e que AR-14.1 atribuía à Fase 1, condição que O-1 registrou como circular. Restam `parcialmente definido` **RF-004** e **RF-021**. `definido` é definição do requisito: o entregável **E-7** permanece `não iniciado` (seção 10). O estado corrente dos requisitos vive em [../product/requirements.md](../product/requirements.md).

## 6. Revisão de riscos

Revisão integral de [risks.md](risks.md) à luz do encerramento da Fase 0. **Nenhuma probabilidade foi atribuída** — o documento não as usa e não há base para estimá-las. **Nenhum risco foi encerrado por ter design definido:** design não é implementação, e vários riscos só se fecham com teste, ambiente real, operação, tarifa comercial, revisão jurídica/contábil ou comportamento de fornecedor.

| Risco | Revisão de F0-023 | Mudança no documento |
| --- | --- | --- |
| R-01 — Inviabilidade da cobrança de R$ 0,99 | Parte técnica fechada por F0-010 e homologada por ADR-0004. **Residual comercial permanece vigente:** a tarifa de R$ 0,01 é de ambiente de teste; o percentual da conta de produção só pode ser conferido antes do lançamento comercial. Permanece também a pendência operacional de limpeza da aplicação de teste na conta real do titular | Nenhuma. O texto já distingue risco técnico fechado de residual comercial |
| R-02 — Corrida para exceder três solicitações pagas | Plano normativo (DEC-037) e mecanismo (DM-6: índice único parcial, trava de escopo de transação, expiração resolvida na transação que aloca) definidos. **Não encerrado:** a prova é o teste de concorrência real do gate da Fase 3 (T-1, T-2) | Nenhuma |
| R-03 — Vazamento de telefone/WhatsApp | Ganhou mecanismo estrutural em F0-022: `contact` é módulo próprio com ponto de entrada autorizado (AR-3.4) e projeção explícita de campos públicos (AR-8.3). **Não encerrado:** depende de implementação e de teste (gate da Fase 2, RF-014) | Nenhuma |
| R-04 — Inconsistência entre webhook e estado interno | Normativa (DEC-037) e mecanismo (PD-5.4, PD-6.3, PD-10.3) definidos. **Não encerrado:** permanece o residual explícito de que o provedor não expõe notificação de reembolso ou reversão, e a verificação é por teste (T-3 a T-5, T-17, T-18) | Nenhuma |
| R-05 — Moderação de itens proibidos insuficiente | Revisado por completude, embora fora da lista de reavaliação obrigatória desta tarefa: política completa em DEC-031; o residual operacional de capacidade e a aplicabilidade regulatória ainda indefinida permanecem | Nenhuma |
| R-06 — Não conformidade com a LGPD | Retenção (DEC-033) e elegibilidade etária (DEC-034) definidas. **Não encerrado:** o baseline de 5 anos de metadados financeiros depende de revisão jurídica e contábil antes da produção comercial | Nenhuma |
| R-07 — Migrations aplicadas fora da estratégia | Estratégia definida em ADR-0005. **Não encerrado, e passa a ser exercitável na Fase 1:** enquanto não existiam schema nem migrations o risco era teórico; a Fase 1 cria o schema inicial e o job de `migrate deploy`, e é aí que a estratégia passa a ser testada na prática | Nenhuma. A observação fica registrada aqui |
| R-08 — Dependência de serviços externos | Permanece integralmente vigente. **Aumenta de exposição prática na Fase 1**, que é quando Neon, R2 e Resend deixam de ser escolha documental e passam a ser dependência operacional | Nenhuma |
| R-09 — Custo de produção comercial na Vercel | Permanece vigente, com o fundamento técnico acrescentado por DEC-038 (o plano Hobby limita o agendamento a uma execução diária). Observação de F0-023: o projeto Vercel já existe e serve preview a partir de PR; isso **não** altera o risco, que é sobre o plano de produção comercial | Nenhuma |
| R-10 — Desempenho mobile em 3G/4G | Permanece vigente. Mitigações de design definidas (derivados de imagem, ausência de entidade de interesse persistida). **Não encerrado:** as metas numéricas continuam sem homologação, por decisão registrada, e pertencem ao gate da Fase 5 (RNF-003, RNF-004) | Nenhuma |
| R-11 — Reembolso técnico impossível de executar | Permanece vigente. Os dois limites (saldo insuficiente e prazo de 180 dias) são do provedor e não estão sob controle do TROQ | Nenhuma |

**Resultado da revisão de riscos:** revisão executada sobre os onze riscos; **nenhuma alteração factual se justificou** em [risks.md](risks.md). Nenhum risco foi encerrado, nenhum foi criado e nenhum teve texto alterado artificialmente. Todos os residuais listados acima permanecem vigentes e seguem registrados nas suas fontes.

## 7. Resultado formal

### **APROVADO**

Os dez critérios da matriz da seção 4 resultaram `PASS`, cada um com evidência própria. O gate de saída da Fase 0 está satisfeito.

A aprovação vale para o **gate de saída da Fase 0** e é o que habilita a entrada na Fase 1. Ela **não** afirma, e nada neste documento deve ser lido como afirmando, que o gate da Fase 1 esteja satisfeito.

## 8. Estado da Fase 0 após a análise

- **Fase 0: concluída.**
- **F0-023: concluído** — este documento é a sua entrega, junto do prompt da seção 11.
- Nenhum item `F0-xxx` permanece `próximo`, `pendente` ou `bloqueado`.
- Nenhuma decisão aberta resta.
- Nenhum novo item `F0-xxx` foi criado: trabalhos da Fase 1 recebem IDs da Fase 1.

## 9. Condições de entrada da Fase 1

Satisfeitas por esta verificação:

1. Gate de saída da Fase 0 `APROVADO` (seção 7).
2. Decisões de stack, dados, pagamentos, produto e trabalho assíncrono fechadas — ADR-0001 a ADR-0006, DEC-001 a DEC-038.
3. Arquitetura pré-implementação versionada — os quatro documentos de `architecture/`.
4. Convenções de engenharia e estratégia de testes versionadas e declaradas preparatórias da Fase 1.
5. Governança de `main` ativa e verificada: PR obrigatória, required status check verde, sem bypass.

Permanece **não satisfeito**, e por definição não é condição de entrada e sim de saída: o gate da Fase 1, cujos critérios em [roadmap.md](roadmap.md) ficam preservados integralmente.

## 10. Entregáveis da Fase 1 — estado factual

Classificação item a item dos entregáveis listados por [roadmap.md](roadmap.md) para a Fase 1. A classificação é **factual**: a existência de um arquivo ou de uma configuração parcial não torna o entregável concluído.

> **Nota de atualização — 2026-09-14, F1-001.** O quadro abaixo é o **registro da auditoria de F0-023** e é preservado como tal. Um item já mudou de estado desde então: **E-4 deixou de ser `não iniciado`** e foi **concluído por F1-001**, que criou [../engineering/environments.md](../engineering/environments.md) e `.env.example` e passou o documento a **existente** no índice de [../README.md](../README.md). Os demais itens permanecem como auditados. O estado corrente vive em [../project-state.md](../project-state.md) e em [backlog.md](backlog.md); este documento não é atualizado a cada trabalho da Fase 1.

| # | Entregável da Fase 1 | Classificação | Evidência |
| --- | --- | --- | --- |
| E-1 | Scaffold Next.js + TypeScript com App Router **e estrutura de módulos do monólito modular** | **parcial** | O scaffold existe e é funcional: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/page.test.tsx`, `next.config.ts`, `tsconfig.json` com `"strict": true`, Next.js `16.3.5`, React `19.3.0`, Node `24.x` em `engines` e `.nvmrc`. **O que falta:** a estrutura de módulos de AR-3.3 (`identity`, `contact`, `listing`, `media`, `request`, `payments`, `negotiation`, `reputation`, `moderation`, mais os transversais `audit` e `platform`) **não** existe — `src/` contém apenas `app/`. **Não recriar o scaffold** |
| E-2 | Padrões de projeto: convenções, lint, formatação, estrutura de testes | **já existente** | Normas versionadas em [../engineering/conventions.md](../engineering/conventions.md) e [../engineering/testing.md](../engineering/testing.md); materialização em `eslint.config.mjs`, `prettier.config.mjs`, `.prettierignore`, `vitest.config.mts`, `vitest.setup.ts`. Os sete scripts de `package.json` (`format`, `format:check`, `lint`, `typecheck`, `test`, `test:ci`, `build`) correspondem exatamente ao contrato de conventions, seção 5.1. **Não recriar** |
| E-3 | CI: lint, typecheck, testes e build em toda PR | **já existente** | [../../.github/workflows/ci.yml](../../.github/workflows/ci.yml) dispara em `pull_request` e em `push` para `main`; o job `validate` roda `npm ci`, `format:check`, `lint`, `typecheck`, `test:ci` e `build` em Node 24. O nome do job é exatamente o required status check do ruleset, e o check está verde no SHA da baseline. **Não recriar e não renomear** — a seção 7 de [../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md) descreve o acoplamento entre o nome do job e o ruleset |
| E-4 | Configuração de ambientes e segredos (`engineering/environments.md`) | **não iniciado** na auditoria; **concluído por F1-001** em 2026-09-14 | **Como estava na auditoria:** `docs/engineering/environments.md` não existia e [../README.md](../README.md) o indexava como `futuro`; não existia `.env.example`. O `.gitignore` já ignorava `.env` e `.env.*` com exceção para `!.env.example`, o que é pré-condição, não o entregável. **Era o próximo trabalho: F1-001.** **Como está hoje:** F1-001 foi executado e o entregável existe — [../engineering/environments.md](../engineering/environments.md) e `.env.example`, com o índice atualizado para `existente`. Nenhum serviço foi provisionado e nenhuma variável é lida por código |
| E-5 | PostgreSQL/Neon provisionado, Prisma ORM e Prisma Migrate, job de CI/CD de `migrate deploy`, schema inicial | **não iniciado** | Não existe diretório `prisma/`, nem `schema.prisma`, nem migration. `prisma` não consta de `package.json`. Nenhum banco foi provisionado. A escolha está decidida por [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md), mas decisão documental **não** é provisionamento |
| E-6 | Infraestrutura mínima: projeto Vercel, bucket R2, Resend, em desenvolvimento e preview | **parcial** | **Projeto Vercel: existe.** As PRs recentes publicam os checks `Vercel` e `Vercel Preview Comments`, com deployment concluído com sucesso, no projeto `bruno-m-noronha/techlab-troq`. **R2: não provisionado.** **Resend: não provisionado.** Ambos são escolha registrada em ADR-0003 e DEC-015, o que não os torna provisionados |
| E-7 | Observabilidade básica: logs estruturados e rastreamento de erros, sem dados protegidos (RNF-018) | **não iniciado** | Nenhuma implementação existe no repositório. Os sinais mínimos estão especificados em [../architecture/overview.md](../architecture/overview.md) (AR-14.3) e a ferramenta concreta é, por AR-14.1, escolha da Fase 1 |

### 10.1 Resumo

- **já existente:** E-2, E-3.
- **parcial:** E-1, E-6.
- **não iniciado:** E-4, E-5, E-7.
- **bloqueado:** nenhum.

**A Fase 1 não está implementada.** Cinco dos sete entregáveis estão total ou parcialmente ausentes, e nenhum dos critérios do gate de saída da Fase 1 foi verificado por esta tarefa.

**Atualização de 2026-09-14 (F1-001).** Desde a auditoria, **E-4 passou a existir**. Restam `não iniciado` E-5 e E-7, e `parcial` E-1 e E-6. **A Fase 1 continua não concluída** e nenhum critério do seu gate de saída foi verificado.

**Atualização de 2026-09-15 (F1-005).** **E-5 foi concluído** por F1-002, F1-003 e F1-004, e **E-1 foi concluído** por F1-005: a única lacuna que esta seção nomeava para E-1 — a estrutura de módulos de AR-3.3 — foi materializada em `src/modules/<module>/index.ts`, com os nove módulos de domínio e os transversais `audit` e `platform`, sem lógica funcional e sem recriar o scaffold. Permanecem `parcial` **E-6** (projeto Vercel existe; R2 e Resend não foram provisionados) e `não iniciado` **E-7**. **A Fase 1 continua não concluída** e nenhum critério do seu gate de saída foi verificado.

**Atualização de 2026-09-15 (F1-006).** **E-6 avançou, e continua `parcial`.** O Cloudflare R2, que esta seção registrava como `não provisionado`, foi provisionado em `development` e em `preview`: buckets isolados `troq-media-development` e `troq-media-preview`, ambos em classe `Standard` e **privados**, com uma Account API Token *Object Read & Write* por ambiente, restrita ao bucket daquele ambiente, e custódia das cinco variáveis em `.env.local` e **somente** no escopo Preview da Vercel ([../engineering/environments.md](../engineering/environments.md), seção 5.3). O projeto Vercel já existia, como esta auditoria registrou. **E-6 permanece `parcial` porque o Resend continua não provisionado**, e essa é agora a sua única lacuna. Permanece `não iniciado` **E-7**, e nada de `production` foi criado. **A Fase 1 continua não concluída** e nenhum critério do seu gate de saída foi verificado.

**Atualização de 2026-09-15 (F1-007).** **E-6 está concluído.** O Resend, que esta seção registrava como `não provisionado` e que era a última lacuna de E-6, foi provisionado em `development` e em `preview`: os subdomínios remetentes **verificados** `dev.troqs.app` e `preview.troqs.app`, sob o domínio `troqs.app` já pertencente ao TROQ, com DKIM, SPF e MX publicados na zona da Cloudflare, e uma API key *Sending access* por ambiente, restrita ao domínio daquele ambiente, custodiada em `.env.local` e **somente** no escopo Preview da Vercel ([../engineering/environments.md](../engineering/environments.md), seção 5.4). Com o projeto Vercel preexistente e o R2 de F1-006, os três componentes que esta auditoria nomeava para E-6 existem. Permanece `não iniciado` **E-7**, e nada de `production` foi criado. **A Fase 1 continua não concluída** e nenhum critério do seu gate de saída foi verificado.

**Atualização de 2026-09-15 (F1-008).** **E-7 continua `não iniciado`**, e esta atualização existe justamente para que isso não seja lido de outra forma. F1-008 fechou a parte **decisória** que esta seção nomeava para E-7 — "a ferramenta concreta é, por AR-14.1, escolha da Fase 1" —, adotando o **Sentry SaaS** em [../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md) (DEC-039), com um projeto e um DSN por ambiente, escopo funcional cobrindo erro não tratado de browser e de servidor, logs estruturados, tracing, associação ao ambiente e à release e os **seis sinais de AR-14.3 preservados sem redução**, Session Replay **fora do MVP**, lista explícita de dados proibidos na telemetria e reafirmação de que observabilidade **não** é auditoria (AR-14.2); e registrou o contrato das quatro variáveis em [../engineering/environments.md](../engineering/environments.md), seção 5.8, todas `previsto`. **Nenhuma implementação passou a existir:** não há projeto Sentry provisionado, `@sentry/nextjs` não está instalado, não há arquivo de instrumentação e nenhuma telemetria é emitida. O próximo item é **F1-009**, o provisionamento em `development` e `preview`. Nada de `production` foi criado. **A Fase 1 continua não concluída** e nenhum critério do seu gate de saída foi verificado.

### 10.2 Pendências documentais residuais

Registradas para visibilidade, sem ação nesta entrega:

1. A definição de `parcialmente definido` em [../product/requirements.md](../product/requirements.md) vincula a lacuna a "uma decisão aberta". Como nenhuma resta, o rótulo hoje descreve lacunas de design e de métrica. Corrigir essa redação é trabalho próprio, de conteúdo normativo, e foi deliberadamente **não** executado aqui: alterar o critério no mesmo trabalho que o audita confundiria auditoria com ajuste de régua. Ver O-1.
2. `delivery/release-checklist.md` continua `futuro`, como previsto para a Fase 5.

## 11. Próximo trabalho recomendado e prompt inicial da Fase 1

**Próximo trabalho: F1-001 — Contrato de ambientes e segredos.**

Prompt versionado: [prompts/f1-001-environments-and-secrets.md](prompts/f1-001-environments-and-secrets.md).

**Objetivo de F1-001:** definir e materializar o contrato de ambientes e segredos da aplicação, **sem provisionar serviços externos e sem iniciar o schema de domínio**.

**Por que este é o primeiro passo, e não o schema.** O scaffold (E-1), os comandos de qualidade (E-2) e o CI (E-3) já existem; recriá-los seria retrabalho e risco. O contrato de ambientes (E-4) é o único entregável da Fase 1 em estado `não iniciado` que também é pré-requisito seguro de todos os demais: conectar Neon, produzir a variável de conexão que o Prisma consome, assinar requisições ao R2, autenticar no Resend, configurar Better Auth e guardar o Access Token e a chave de webhook do Mercado Pago — todos exigem que já esteja decidido e escrito quais variáveis existem, em que ambiente, quais são públicas e quais são exclusivamente server-side. Começar pelo schema obrigaria a improvisar essa fronteira sob pressão, exatamente no ponto em que [../engineering/conventions.md](../engineering/conventions.md), seção 3.2, e RNF-015 são mais rígidos.

## 12. Referências

- [roadmap.md](roadmap.md) — fases, entregáveis e gates
- [backlog.md](backlog.md) — itens `F0-xxx`
- [risks.md](risks.md) — R-01 a R-11
- [../project-state.md](../project-state.md) — estado corrente
- [../decisions/open-decisions.md](../decisions/open-decisions.md) — decisões abertas; nenhuma
- [../decisions/decision-log.md](../decisions/decision-log.md) — DEC-001 a DEC-039
- [../product/requirements.md](../product/requirements.md) — RF-xxx e RNF-xxx
- [../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md) — hierarquia de verdade, Git e governança de `main`
- [../architecture/overview.md](../architecture/overview.md) — camadas, módulos de domínio e observabilidade mínima
