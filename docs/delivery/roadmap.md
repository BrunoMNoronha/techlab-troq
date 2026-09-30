# Roadmap macro — TROQ

Roadmap por fases do MVP. Registra objetivo, principais entregáveis, dependências e gate de saída de cada fase. **Não há datas:** o projeto não possui base para estimativas, e datas artificiais não serão atribuídas. A ordem das fases é lógica, não calendário; itens de fases diferentes podem se sobrepor quando as dependências permitirem.

Fontes: [../product/mvp-scope.md](../product/mvp-scope.md), [../product/requirements.md](../product/requirements.md), [../decisions/decision-log.md](../decisions/decision-log.md), [../decisions/open-decisions.md](../decisions/open-decisions.md), [risks.md](risks.md).

## Visão geral

| Fase | Nome | Estado |
| --- | --- | --- |
| 0 | Descoberta e definição | concluída |
| 1 | Fundação técnica | concluída |
| 2 | Identidade e anúncios | concluída — gate de saída **aprovado** em 2026-09-30 |
| 3 | Solicitações, pagamentos e contato | liberada para execução pelo gate da Fase 2; não iniciada |
| 4 | Encerramento, avaliações e moderação | não iniciada |
| 5 | Hardening e lançamento | não iniciada |
| — | Pós-MVP (candidatos) | não planejado |

**Estado em 2026-09-30.** A **Fase 2 está concluída**: o seu gate de saída foi reverificado por F2-013 (Issue #51) e **APROVADO** em 2026-09-30, com G1, G2 e G3 `PASS` ([phase-3-transition.md](phase-3-transition.md), seção V). A **Fase 3 está liberada para execução** e ainda não foi iniciada; o seu acompanhamento está em [#54](https://github.com/BrunoMNoronha/techlab-troq/issues/54). Nada neste roadmap afirma produção ou deploy atual. O parágrafo seguinte é o registro de 2026-09-29.

**Estado em 2026-09-29.** A **Fase 0 está concluída**: o seu gate de saída foi verificado item a item por F0-023 em [phase-1-transition.md](phase-1-transition.md). A **Fase 1 está concluída**: o seu gate de saída foi verificado e aprovado por F1-011 em [phase-2-transition.md](phase-2-transition.md). A **Fase 2 está em andamento**: há implementação parcial integrada (PRs #52, #53, #57, #58 e #60), mas o **gate de saída não está aprovado**. A aprovação registrada em 2026-09-28 por F2-013 (Issue #51) foi **retificada em 2026-09-29** em [phase-3-transition.md](phase-3-transition.md): G1 `NÃO ATENDIDO`, G2 `NÃO COMPROVADO`, G3 `PARCIAL`, sem nenhum `PASS`, e, das issues #38 a #51, só #39 a #42 (identidade) foram encerradas, em 2026-09-29. A **Fase 3 permanece condicionada ao gate** e não está implementada; o seu acompanhamento está em [#54](https://github.com/BrunoMNoronha/techlab-troq/issues/54). Nada neste roadmap afirma produção ou deploy atual.


## Fase 0 — Descoberta e definição

**Objetivo:** fechar produto e decisões críticas; provar a viabilidade da cobrança de R$ 0,99; concluir a documentação pré-implementação necessária.

**Principais entregáveis:**

- Baseline documental: escopo do MVP, regras RB-001 a RB-006, decisões abertas, riscos, ADRs 0001 a 0003 (concluído).
- Público-alvo completo, requisitos rastreáveis, decision log, roadmap, backlog e workflow de agentes (esta entrega).
- Spike do gateway Pix para exatamente R$ 0,99, com resultado registrado e decisão do gateway (OD-08, fechada por [ADR-0004](../adr/0004-mercado-pago-pix.md), DEC-036).
- Fechamento das decisões que bloqueiam o modelo de dados: ORM e migrations (OD-09, fechada por [ADR-0005](../adr/0005-prisma-orm-migrations.md)), ciclo de vida do anúncio (OD-04, fechada por [../product/listing-lifecycle.md](../product/listing-lifecycle.md)), regras de imagens (OD-05, fechada por [../product/image-policy.md](../product/image-policy.md)).
- Fechamento das decisões de produto: encerramento da negociação (OD-01, fechada por [../product/negotiation-lifecycle.md](../product/negotiation-lifecycle.md)), avaliações (OD-02, fechada por [../product/ratings.md](../product/ratings.md)), itens proibidos (OD-03, fechada por [../product/prohibited-items.md](../product/prohibited-items.md)), desistência/reseleção (OD-06, fechada por [../product/reselection-policy.md](../product/reselection-policy.md)), retenção/exclusão (OD-10, fechada por [../product/data-retention-policy.md](../product/data-retention-policy.md)), elegibilidade etária (OD-11, fechada por [../product/age-eligibility.md](../product/age-eligibility.md)), natureza da demonstração de interesse (OD-12, fechada por [../product/interest-flow.md](../product/interest-flow.md)) e exceções de pagamento (OD-07, fechada por [../product/payment-exceptions.md](../product/payment-exceptions.md), DEC-037; sua dependência OD-08 havia sido fechada por [ADR-0004](../adr/0004-mercado-pago-pix.md)).
- Arquitetura de dados e de API necessária antes da implementação: **concluída** por F0-022 em 2026-09-14 — [../architecture/overview.md](../architecture/overview.md), [../architecture/data-model.md](../architecture/data-model.md), [../architecture/payments-design.md](../architecture/payments-design.md) e [../architecture/contact-release.md](../architecture/contact-release.md), mais [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md) (DEC-038).

**Dependências:** nenhuma externa; depende da disponibilidade de Bruno para decisões e do acesso a ambiente sandbox do gateway candidato para o spike.

**Gate de saída:**

- OD-08 e OD-09 fechadas, com ADRs correspondentes. **Ambas estão fechadas:** OD-09 por [ADR-0005](../adr/0005-prisma-orm-migrations.md) e OD-08 por [ADR-0004](../adr/0004-mercado-pago-pix.md) (DEC-036), em 2026-09-14.
- OD-04 já está fechada por [../product/listing-lifecycle.md](../product/listing-lifecycle.md), OD-05 por [../product/image-policy.md](../product/image-policy.md), OD-01 por [../product/negotiation-lifecycle.md](../product/negotiation-lifecycle.md), OD-02 por [../product/ratings.md](../product/ratings.md), OD-03 por [../product/prohibited-items.md](../product/prohibited-items.md), OD-06 por [../product/reselection-policy.md](../product/reselection-policy.md), OD-10 por [../product/data-retention-policy.md](../product/data-retention-policy.md), OD-11 por [../product/age-eligibility.md](../product/age-eligibility.md), OD-12 por [../product/interest-flow.md](../product/interest-flow.md) e OD-07 por [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037).
- **Nenhuma decisão aberta bloqueia mais este gate.** A validação real do gateway (F0-010) foi concluída em 2026-09-14, a escolha foi formalizada no mesmo dia por F0-011, que fechou OD-08 com [ADR-0004](../adr/0004-mercado-pago-pix.md) (DEC-036), F0-019 fechou OD-07 com [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037) e **F0-022 concluiu a arquitetura pré-implementação** na mesma data.
- Requisitos que a Fase 1 e a Fase 2 dependem com status `definido`.
- Backlog da Fase 0 ([backlog.md](backlog.md)) sem itens `próximo` ou `bloqueado` que impeçam a Fase 1.

**Verificação do gate — APROVADO em 2026-09-14.** F0-023 auditou cada condição acima contra a sua fonte, com evidência registrada, e todas resultaram `PASS`. A matriz completa, a verificação dos requisitos dos quais a Fase 1 e a Fase 2 dependem e a revisão dos riscos estão em [phase-1-transition.md](phase-1-transition.md). Os critérios deste gate ficam preservados como registro do que foi exigido e comprovado.

## Fase 1 — Fundação técnica

**Objetivo:** criar a base técnica sobre a qual as funcionalidades serão construídas, sem funcionalidade de produto.

**Principais entregáveis:**

- Scaffold da aplicação Next.js + TypeScript com App Router e estrutura de módulos do monólito modular.
- Padrões de projeto: convenções de código, lint, formatação, estrutura de testes (`engineering/conventions.md`, `engineering/testing.md`).
- CI: lint, typecheck, testes e build em toda PR.
- Configuração de ambientes e segredos (`engineering/environments.md`).
- Banco PostgreSQL/Neon provisionado, Prisma ORM e Prisma Migrate conforme [ADR-0005](../adr/0005-prisma-orm-migrations.md), incluindo o job de CI/CD que aplica `prisma migrate deploy`, e schema inicial derivado de `architecture/data-model.md`.
- Infraestrutura mínima: projeto Vercel, bucket R2, Resend, em ambientes de desenvolvimento e preview.
- Observabilidade básica: logs estruturados e rastreamento de erros, sem dados protegidos (RNF-018). **Concluída.** A ferramenta e o escopo foram decididos por [../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md) (DEC-039, F1-008): Sentry SaaS, um projeto e um DSN por ambiente, Session Replay fora do MVP; os projetos de `development` e `preview` foram provisionados por F1-009; e a aplicação foi instrumentada por **F1-010**, que a colocou em operação nesses dois ambientes. Os **seis sinais de AR-14.3** continuam por criar: cada um deriva de um fluxo de domínio que ainda não existe, e a infraestrutura está pronta para recebê-los quando esses fluxos forem construídos.

**Dependências:** gate da Fase 0 — **satisfeito e verificado** em 2026-09-14 ([phase-1-transition.md](phase-1-transition.md)); em particular [ADR-0005](../adr/0005-prisma-orm-migrations.md) (ORM/migrations, OD-09 fechada) e modelo de dados.

**Estado dos entregáveis.** Parte desta lista já existe no repositório, criada de forma antecipada e isolada, e **não deve ser recriada**: os padrões de projeto e o CI estão `já existente`; a observabilidade passou a `concluído` com **F1-010** (2026-09-16), como detalhado adiante neste parágrafo; a infraestrutura mínima passou a `concluído` com **F1-006** e **F1-007** (2026-09-15), como detalhado adiante neste parágrafo; o scaffold passou a `concluído` com **F1-005** (2026-09-15), que materializou em `src/modules/<module>/index.ts` os nove módulos de domínio de [../architecture/overview.md](../architecture/overview.md) (AR-3.3) e os dois transversais `audit` e `platform`, cada um com fronteira pública e **sem lógica funcional**, e registrou a convenção física em [../engineering/conventions.md](../engineering/conventions.md), seção 2.5 — **E-1 concluído**; o banco com Prisma e schema inicial passou a `parcial` com **F1-002** (2026-09-14), que materializou o schema e a migration inicial em [../engineering/database.md](../engineering/database.md), avançou com **F1-003** (2026-09-14), que criou o runtime do Prisma Client — fronteira server-side `src/persistence/prisma.ts` com `@prisma/adapter-pg` sobre `DATABASE_URL`, provada contra PostgreSQL descartável (seção 13 daquele documento) — e foi **concluído por F1-004** (2026-09-15), que provisionou o Neon de `preview` (São Paulo, PostgreSQL 17, branch `preview`, database `troq`), guardou as conexões como secrets do GitHub Environment `preview` restrito a `main`, configurou `DATABASE_URL` e `APP_ENV` somente no escopo Preview da Vercel e criou o workflow `.github/workflows/migrate-preview.yml`, que aplica `prisma migrate deploy` somente a partir de `main`, serializado, e cuja primeira execução aplicou a migration inicial e aprovou a suíte de integração (seção 15 daquele documento). **E-5 está concluído por F1-002, F1-003 e F1-004.** Nenhum recurso de `production` existe, e a Fase 1 continua em andamento. O **contrato de ambientes** foi **concluído em 2026-09-14 por F1-001**, o primeiro trabalho da fase ([prompts/f1-001-environments-and-secrets.md](prompts/f1-001-environments-and-secrets.md)), em [../engineering/environments.md](../engineering/environments.md). A classificação item a item, com a evidência da auditoria de F0-023 e a nota de atualização, está em [phase-1-transition.md](phase-1-transition.md), seção 10. **Nenhum critério do gate de saída abaixo havia sido verificado até F1-011**, que o aprovou em 2026-09-16 (verificação ao fim desta seção). A **infraestrutura mínima (E-6) foi concluída**: o projeto Vercel já existia, **F1-006** (2026-09-15) provisionou o Cloudflare R2 de `development` e `preview` — buckets isolados, `Standard`, privados, com credencial *Object Read & Write* por ambiente limitada ao seu bucket ([../engineering/environments.md](../engineering/environments.md), seção 5.3) — e **F1-007** (2026-09-15) provisionou o Resend dos mesmos dois ambientes — subdomínios remetentes verificados `dev.troqs.app` e `preview.troqs.app`, com API key *Sending access* por ambiente restrita ao seu domínio (seção 5.4 daquele documento). Depois de F1-007, o único entregável pendente da fase é a **observabilidade** (E-7, `não iniciado`), além do banco de `production`, que nenhum item cobriu até aqui. **F1-008** (2026-09-15) avançou a parte **decisória** desse entregável sem concluí-lo: escolheu o Sentry SaaS em [../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md) (DEC-039), com um projeto e um DSN por ambiente, escopo funcional cobrindo erro de browser e de servidor, logs estruturados, tracing e os sinais de AR-14.3, Session Replay fora do MVP e fronteiras de privacidade explícitas, e registrou o contrato das quatro variáveis em [../engineering/environments.md](../engineering/environments.md), seção 5.8, todas `previsto`. Com isso **RNF-018** passou a `definido` — definição, não implementação. **F1-009** (2026-09-15) avançou a parte de **provisionamento**, também sem concluir o entregável: criou na organização `techlab-bt` os dois projetos isolados `techlab-troq-development` e `techlab-troq-preview`, com client key e DSN próprias por ambiente, *data scrubbing* server-side habilitado com os scrubbers padrão preservados e campos sensíveis do domínio acrescentados, sem *safe field*, sem armazenamento de IP, sem Session Replay e sem `sendDefaultPii`, e custodiou `NEXT_PUBLIC_SENTRY_DSN` em `.env.local` (`development`) e somente no escopo Preview da plataforma de deploy (`preview`), sem nada em `production` e sem criar `SENTRY_AUTH_TOKEN`. **F1-010** (2026-09-16) fechou a parte de **instrumentação** e com ela o entregável: `@sentry/nextjs` em versão exata, sem wizard, integrado manualmente ao App Router em `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/sentry.server.config.ts`, `src/sentry.edge.config.ts` e `src/app/global-error.tsx`; DSN lida exclusivamente de `NEXT_PUBLIC_SENTRY_DSN` e ambiente passado explicitamente a partir de `APP_ENV`; tracing e logs estruturados nativos da SDK; e uma fronteira de redação em `src/modules/platform`, coberta por testes, que remove dado proibido por nome de campo, por padrão de valor e por superfície inteira. **E-7 está concluído**, comprovado nos dois ambientes com dados fictícios e isolamento verificado entre eles. Continuam fora: `production`, source maps, release, `SENTRY_AUTH_TOKEN`, dashboards, alertas e os seis sinais de AR-14.3, que dependem de fluxos de domínio ainda inexistentes.

**Gate de saída:**

- CI verde em `main` com lint, typecheck, testes e build.
- Deploy de preview funcionando na Vercel a partir de PR.
- Migrations executáveis e reversíveis em ambiente de desenvolvimento.
- Nenhum segredo versionado (RNF-015).
- As invariantes que [../architecture/data-model.md](../architecture/data-model.md) atribui a **restrição de banco** (quadro da seção 12) estão materializadas no schema inicial.

**Verificação do gate — APROVADO em 2026-09-16.** F1-011 auditou cada critério acima contra a sua fonte e todos resultaram `PASS`: CI verde em `main` e reproduzido localmente; deployment de preview da própria PR de F1-011 em estado concluído e respondendo `HTTP 200`; migrations aplicadas a PostgreSQL descartável vazio e revertidas pelos dois mecanismos que [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md) e [../engineering/database.md](../engineering/database.md) definem — recriação do banco de desenvolvimento a partir do histórico e reversão por nova migration, sem migration `down`; nenhum segredo em `HEAD` nem no histórico; e I-1, I-2, I-5, I-6 e I-8 presentes no catálogo do banco migrado e provadas por caso negativo. A matriz, as evidências, a conferência dos entregáveis, as dependências da Fase 2 e a revisão dos riscos estão em [phase-2-transition.md](phase-2-transition.md). Os critérios ficam preservados como registro do que foi exigido e comprovado.

## Fase 2 — Identidade e anúncios

**Objetivo:** permitir criar conta, publicar e consultar anúncios.

**Principais entregáveis:**

- Autenticação com Better Auth: cadastro, verificação de email, login, logout, sessão (RF-001 a RF-003).
- Conta do usuário (dados mínimos necessários, sem contato exposto).
- Publicação de anúncio com ciclo de vida conforme [../product/listing-lifecycle.md](../product/listing-lifecycle.md) (RF-004).
- Upload e otimização de imagens no R2 conforme [../product/image-policy.md](../product/image-policy.md) (RF-006, RNF-005).
- Localização pública por cidade/UF (RF-007).
- Consulta de anúncios: listagem e detalhe sem contato (RF-005).
- Email transacional de verificação via Resend (RF-021).

**Dependências:** gate da Fase 1; OD-04, OD-05 e OD-11 fechadas. **Todas satisfeitas:** o gate da Fase 1 foi aprovado em 2026-09-16 ([phase-2-transition.md](phase-2-transition.md)) e as três decisões estão fechadas. RF-021 segue `parcialmente definido`, com lacuna de design que pertence à própria Fase 2 e não a bloqueia (seção 8 daquele documento); RF-004 passou a `definido` em 2026-09-29, quando F2-005 reconciliou o [contrato de anúncios](../architecture/listing-contract.md) com o conjunto mínimo de campos.

**Gate de saída:**

- Fluxo completo cadastro → verificação → login → publicar → consultar funcionando em preview, mobile-first.
- Nenhum payload público contém telefone/WhatsApp (RF-014 verificado por teste).
- Testes automatizados cobrindo autenticação e publicação.

**Estado do gate — APROVADO em 2026-09-30.** F2-013 (#51) reverificou os três critérios com evidência verificável e todos resultaram `PASS`: **G1** pela jornada completa, a 375 px, no deployment de `preview` `dpl_GGU1oNG7CGQ48V93Gn5gupZTsEqS`, cujo código é idêntico ao de `main` em `eedd686`; **G2** pelas suítes de PostgreSQL efêmero e servidor real que rodam na CI desde a PR #85, mais a consulta anônima ao Preview; **G3** pela CI verde em `main` (`validate` e `integration`, run `36785554918`) e por cinco rodadas locais completas seguidas com R2 real e provas HTTP. Matriz e evidências em [phase-3-transition.md](phase-3-transition.md), seção V. O parágrafo seguinte é o registro de 2026-09-29.

**Estado do gate em 2026-09-29 — NÃO APROVADO.** A verificação de 2026-09-28 (F2-013) declarou os três critérios aprovados; a retificação de 2026-09-29 retirou essa aprovação como estado vigente, porque as evidências citadas eram testes simulados e a fase tinha uma falha de autenticação, depois corrigida por #57 e #58. Resultado vigente, sem nenhum `PASS`: **G1** (fluxo em `preview`) `NÃO ATENDIDO`, porque publicar e enviar imagem não têm caminho na interface e não há prova em `preview`; **G2** (nenhum payload público com contato) `NÃO COMPROVADO`, com evidência apenas parcial; **G3** (testes automatizados de autenticação e publicação) `PARCIAL`, com CI verde mas provas de banco real só para autenticação e fora da CI. Matriz, evidências e o que falta estão em [phase-3-transition.md](phase-3-transition.md). Os critérios acima ficam preservados como o que é exigido; a revalidação era o escopo de [#51](https://github.com/BrunoMNoronha/techlab-troq/issues/51).

## Fase 3 — Solicitações, pagamentos e contato

**Objetivo:** implementar o núcleo monetizado: solicitação paga, limite de 3, escolha e liberação de contato.

**Estado em 2026-09-29:** nenhuma entrega implementada. `payments` e `contact` são fronteiras vazias; `request` tem apenas a entrada de leitura integrada por #60, que exige login e elegibilidade e devolve `request_unavailable`, **sem** criar solicitação, reservar vaga, cobrar ou liberar contato.

**Principais entregáveis:**

- Demonstração de interesse e solicitação de desbloqueio (RF-008, RF-009), conforme [../product/interest-flow.md](../product/interest-flow.md) (DEC-035): o interesse é ação gratuita de interface, sem entidade persistida, e a persistência funcional começa na solicitação.
- Reserva atômica de vaga com expiração e limite de 3 solicitações pagas (RF-010, RNF-016).
- Cobrança de exatamente R$ 0,99 via Pix no gateway homologado (RF-011).
- Webhooks com idempotência e reconciliação (RF-012), e o tratamento das exceções conforme [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037): duplicidade, pagamento tardio, falha de confirmação, reembolso técnico, reversões e reconciliação autoritativa.
- Escolha do solicitante pelo anunciante, incluindo desistência e reseleção conforme [../product/reselection-policy.md](../product/reselection-policy.md) (DEC-032) (RF-013).
- Autorização server-side e liberação de contato ao escolhido com pagamento aprovado, com auditoria (RF-014, RF-015, RF-022).
- Design de pagamentos e de liberação de contato implementados conforme `architecture/payments-design.md` e `architecture/contact-release.md`.

**Dependências:** gate da Fase 2; OD-07 e OD-08 fechadas e ADR-0004 (gateway) aceito. **O gate da Fase 2 foi aprovado em 2026-09-30 (ver a Fase 2 acima): a execução da Fase 3 está liberada e é acompanhada em [#54](https://github.com/BrunoMNoronha/techlab-troq/issues/54).** As decisões estão **satisfeitas:** OD-08 está fechada e [ADR-0004](../adr/0004-mercado-pago-pix.md) aceito (DEC-036), OD-07 está fechada por [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037), OD-06 por [../product/reselection-policy.md](../product/reselection-policy.md) e OD-12 por [../product/interest-flow.md](../product/interest-flow.md).

**Gate de saída:**

- Testes de concorrência provando que nunca há mais de 3 solicitações pagas por anúncio.
- Contrato de teste de [../architecture/payments-design.md](../architecture/payments-design.md) (seção 13) e de [../architecture/contact-release.md](../architecture/contact-release.md) (seção 10) executado, sobre banco real e com execução simultânea onde o caso exigir.
- Testes de webhook duplicado, fora de ordem e atrasado sem inconsistência de estado, e de pagamento acreditado fora da janela de reserva sem criar vaga nem solicitação paga.
- Liberação de contato só ocorre com as duas condições de RB-001 e gera auditoria.
- Revisão reforçada concluída para pagamentos, autorização e dados ([../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md)).

## Fase 4 — Encerramento, avaliações e moderação

**Objetivo:** fechar o ciclo da negociação e proteger a plataforma.

**Principais entregáveis:**

- Mecanismo de encerramento conforme [../product/negotiation-lifecycle.md](../product/negotiation-lifecycle.md) (DEC-029, OD-01 fechada): estados `active` e `closed`, encerramento unilateral por qualquer uma das partes, irreversível e auditado (RF-016).
- Avaliações conforme [../product/ratings.md](../product/ratings.md) (DEC-030), permitidas apenas após o encerramento da negociação (RF-017).
- Denúncia de anúncios conforme [../product/prohibited-items.md](../product/prohibited-items.md) (DEC-031, OD-03 fechada): usuário autenticado, unicidade por par (denunciante, anúncio), categoria obrigatória, estado inicial `recebida` e identidade do denunciante confidencial (RF-018).
- Moderação com auditoria conforme a mesma fonte: decisão `procedente`, `improcedente` ou `sem_acao`, perfil único, decisão de ofício, prazos de 24 horas corridas na classe crítica e 5 dias úteis na comum, reincidência progressiva e contestação administrativa (RF-019).
- Remoção de anúncios com itens proibidos conforme o catálogo PI-01 a PI-12 de [../product/prohibited-items.md](../product/prohibited-items.md), usando exclusivamente as transições administrativas de [../product/listing-lifecycle.md](../product/listing-lifecycle.md) (RF-020).

**Dependências:** gate da Fase 3. OD-01 já está fechada por [../product/negotiation-lifecycle.md](../product/negotiation-lifecycle.md) (DEC-029), OD-02 por [../product/ratings.md](../product/ratings.md) (DEC-030) e OD-03 por [../product/prohibited-items.md](../product/prohibited-items.md) (DEC-031).

**Gate de saída:**

- Nenhuma avaliação aceita antes do encerramento (RB-002 verificado por teste).
- Anúncio removido por moderação deixa de ser consultável e o efeito sobre solicitações existentes segue a decisão registrada.
- Catálogo de itens proibidos publicado em [../product/prohibited-items.md](../product/prohibited-items.md) e implementado: denúncia, moderação e remoção operando com auditoria, e prazos de decisão mensuráveis pela trilha de auditoria.

## Fase 5 — Hardening e lançamento

**Objetivo:** tornar a plataforma pronta para produção comercial.

**Principais entregáveis:**

- Segurança: revisão de autenticação, autorização, validação de entradas, proteção de segredos (RNF-007, RNF-014, RNF-015).
- Privacidade/LGPD: retenção e exclusão conforme [../product/data-retention-policy.md](../product/data-retention-policy.md) (DEC-033), exclusão de conta (RF-023, RNF-008, RNF-009), política de privacidade e termos de uso, incluindo a elegibilidade etária de [../product/age-eligibility.md](../product/age-eligibility.md) (DEC-034) e a revisão jurídica e contábil do período e do conjunto mínimo de registros financeiros antes da produção comercial.
- Performance em smartphones e redes 3G/4G, com métricas objetivas definidas neste gate (RNF-003, RNF-004).
- Acessibilidade com nível de conformidade definido neste gate (RNF-010).
- PWA com capacidades mínimas definidas (RNF-006).
- Auditoria e observabilidade revisadas (RNF-011, RNF-018).
- Preparação operacional: checklist de release (`delivery/release-checklist.md`), plano Vercel pago para produção, monitoramento de custos dos provedores (R-08, R-09).
- Deploy de produção.

**Dependências:** gate da Fase 4. OD-10 e OD-11 já estão fechadas por [../product/data-retention-policy.md](../product/data-retention-policy.md) e [../product/age-eligibility.md](../product/age-eligibility.md).

**Gate de saída:**

- Métricas de performance, acessibilidade e disponibilidade definidas e atingidas.
- Checklist de release concluído.
- Produção comercial em plano Vercel pago.
- Riscos R-01 a R-10 revisados com estado atualizado.

## Pós-MVP — candidatos

Itens **não planejados** e **não comprometidos**. Entram no roadmap apenas por decisão registrada após o lançamento do MVP:

- Web Push (DEC-021: não bloqueia o MVP).
- Login social (DEC-013: fora do núcleo inicial).
- Recomendações de anúncios.
- Melhorias avançadas de marketplace.

## Revisão

Este roadmap é revisado ao fim de cada fase, quando uma decisão aberta é fechada ou quando um risco se materializa. Mudanças de ordem ou de escopo de fase são registradas em [../decisions/decision-log.md](../decisions/decision-log.md).
