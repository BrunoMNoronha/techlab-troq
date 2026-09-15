# Roadmap macro — TROQ

Roadmap por fases do MVP. Registra objetivo, principais entregáveis, dependências e gate de saída de cada fase. **Não há datas:** o projeto não possui base para estimativas, e datas artificiais não serão atribuídas. A ordem das fases é lógica, não calendário; itens de fases diferentes podem se sobrepor quando as dependências permitirem.

Fontes: [../product/mvp-scope.md](../product/mvp-scope.md), [../product/requirements.md](../product/requirements.md), [../decisions/decision-log.md](../decisions/decision-log.md), [../decisions/open-decisions.md](../decisions/open-decisions.md), [risks.md](risks.md).

## Visão geral

| Fase | Nome | Estado |
| --- | --- | --- |
| 0 | Descoberta e definição | concluída |
| 1 | Fundação técnica | em andamento |
| 2 | Identidade e anúncios | não iniciada |
| 3 | Solicitações, pagamentos e contato | não iniciada |
| 4 | Encerramento, avaliações e moderação | não iniciada |
| 5 | Hardening e lançamento | não iniciada |
| — | Pós-MVP (candidatos) | não planejado |

**Estado em 2026-09-14.** A **Fase 0 está concluída**: o seu gate de saída foi verificado item a item por F0-023, com matriz de critério, fonte, evidência e resultado em [phase-1-transition.md](phase-1-transition.md), e o resultado formal foi **APROVADO**. A **Fase 1 está `em andamento`** desde 2026-09-14, quando **F1-001 — contrato de ambientes e segredos** foi concluído; o seu gate de entrada estava satisfeito. Parte do que a Fase 1 lista como entregável já existia no repositório antes disso, criada de forma antecipada e isolada; a classificação factual de cada entregável, entre `já existente`, `parcial` e `não iniciado`, está na seção 10 daquele documento, com a nota de atualização de F1-001. O gate de **saída** da Fase 1 continua **integralmente por satisfazer**.

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
- Observabilidade básica: logs estruturados e rastreamento de erros, sem dados protegidos (RNF-018).

**Dependências:** gate da Fase 0 — **satisfeito e verificado** em 2026-09-14 ([phase-1-transition.md](phase-1-transition.md)); em particular [ADR-0005](../adr/0005-prisma-orm-migrations.md) (ORM/migrations, OD-09 fechada) e modelo de dados.

**Estado dos entregáveis.** Parte desta lista já existe no repositório, criada de forma antecipada e isolada, e **não deve ser recriada**: os padrões de projeto e o CI estão `já existente`; o scaffold e a infraestrutura mínima estão `parcial`; a observabilidade está `não iniciado`; o banco com Prisma e schema inicial passou a `parcial` com **F1-002** (2026-09-14), que materializou o schema e a migration inicial em [../engineering/database.md](../engineering/database.md), avançou com **F1-003** (2026-09-14), que criou o runtime do Prisma Client — fronteira server-side `src/persistence/prisma.ts` com `@prisma/adapter-pg` sobre `DATABASE_URL`, provada contra PostgreSQL descartável (seção 13 daquele documento) — e com **F1-004** (2026-09-15, em andamento), que provisionou o Neon de `preview` (São Paulo, PostgreSQL 17, branch `preview`, database `troq`), guardou as conexões como secrets do GitHub Environment `preview` restrito a `main` e criou o workflow `.github/workflows/migrate-preview.yml`, que aplica `prisma migrate deploy` somente a partir de `main`, serializado (seção 15 daquele documento); continua `parcial` porque a primeira execução do workflow ocorre após o merge da PR de F1-004 e porque `DATABASE_URL` ainda não foi configurada na Vercel Preview, por falta de acesso do executor ao projeto. Nenhum recurso de `production` existe. O **contrato de ambientes** foi **concluído em 2026-09-14 por F1-001**, o primeiro trabalho da fase ([prompts/f1-001-environments-and-secrets.md](prompts/f1-001-environments-and-secrets.md)), em [../engineering/environments.md](../engineering/environments.md). A classificação item a item, com a evidência da auditoria de F0-023 e a nota de atualização, está em [phase-1-transition.md](phase-1-transition.md), seção 10. **Nenhum critério do gate de saída abaixo foi verificado**, e a conclusão de F1-001 não altera isso: o contrato de ambientes é documento, e Neon, R2 e Resend continuam **não provisionados**.

**Gate de saída:**

- CI verde em `main` com lint, typecheck, testes e build.
- Deploy de preview funcionando na Vercel a partir de PR.
- Migrations executáveis e reversíveis em ambiente de desenvolvimento.
- Nenhum segredo versionado (RNF-015).
- As invariantes que [../architecture/data-model.md](../architecture/data-model.md) atribui a **restrição de banco** (quadro da seção 12) estão materializadas no schema inicial.

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

**Dependências:** gate da Fase 1; OD-04, OD-05 e OD-11 fechadas.

**Gate de saída:**

- Fluxo completo cadastro → verificação → login → publicar → consultar funcionando em preview, mobile-first.
- Nenhum payload público contém telefone/WhatsApp (RF-014 verificado por teste).
- Testes automatizados cobrindo autenticação e publicação.

## Fase 3 — Solicitações, pagamentos e contato

**Objetivo:** implementar o núcleo monetizado: solicitação paga, limite de 3, escolha e liberação de contato.

**Principais entregáveis:**

- Demonstração de interesse e solicitação de desbloqueio (RF-008, RF-009), conforme [../product/interest-flow.md](../product/interest-flow.md) (DEC-035): o interesse é ação gratuita de interface, sem entidade persistida, e a persistência funcional começa na solicitação.
- Reserva atômica de vaga com expiração e limite de 3 solicitações pagas (RF-010, RNF-016).
- Cobrança de exatamente R$ 0,99 via Pix no gateway homologado (RF-011).
- Webhooks com idempotência e reconciliação (RF-012), e o tratamento das exceções conforme [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037): duplicidade, pagamento tardio, falha de confirmação, reembolso técnico, reversões e reconciliação autoritativa.
- Escolha do solicitante pelo anunciante, incluindo desistência e reseleção conforme [../product/reselection-policy.md](../product/reselection-policy.md) (DEC-032) (RF-013).
- Autorização server-side e liberação de contato ao escolhido com pagamento aprovado, com auditoria (RF-014, RF-015, RF-022).
- Design de pagamentos e de liberação de contato implementados conforme `architecture/payments-design.md` e `architecture/contact-release.md`.

**Dependências:** gate da Fase 2; OD-07 e OD-08 fechadas e ADR-0004 (gateway) aceito. **Todas satisfeitas:** OD-08 está fechada e [ADR-0004](../adr/0004-mercado-pago-pix.md) aceito (DEC-036), OD-07 está fechada por [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037), OD-06 por [../product/reselection-policy.md](../product/reselection-policy.md) e OD-12 por [../product/interest-flow.md](../product/interest-flow.md).

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
