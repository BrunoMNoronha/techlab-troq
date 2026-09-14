# Documentação — TechLab+ TROQ

Índice da documentação do projeto. Documentos marcados como **existente** fazem parte do baseline da Fase 0. Documentos marcados como **futuro** ainda não existem e serão criados progressivamente nas fases seguintes; os nomes são indicativos e podem mudar.

Ponto de partida: [project-state.md](project-state.md). Decisões vigentes: [decisions/decision-log.md](decisions/decision-log.md). Backlog da Fase 0, encerrado: [delivery/backlog.md](delivery/backlog.md). Transição para a Fase 1 e próximo trabalho: [delivery/phase-1-transition.md](delivery/phase-1-transition.md). Modo operacional com agentes: [engineering/ai-agent-workflow.md](engineering/ai-agent-workflow.md).

## Grupos

### product — produto e regras de negócio

| Documento | Status | Conteúdo |
| --- | --- | --- |
| [product/mvp-scope.md](product/mvp-scope.md) | existente | Objetivo, público, fluxo central, capacidades obrigatórias e adiáveis do MVP |
| [product/business-rules.md](product/business-rules.md) | existente | Regras de negócio homologadas RB-001 a RB-006 |
| [product/requirements.md](product/requirements.md) | existente | Catálogo de requisitos rastreáveis RF-xxx/RNF-xxx, com rastreabilidade para RB e OD |
| [product/prohibited-items.md](product/prohibited-items.md) | existente | Política de itens proibidos: catálogo por categorias PI-01 a PI-12 com fundamento `ilegal`, `regulado` ou `política`, ausência de fluxo de autorização documental no MVP, regra de casos ambíguos, declaração de conformidade na publicação, fluxo de denúncia, fluxo de moderação, critérios e efeitos da remoção, prazos de decisão, reincidência, contestação, auditoria e privacidade do denunciante; fecha OD-03 (DEC-031) |
| [product/listing-lifecycle.md](product/listing-lifecycle.md) | existente | Ciclo de vida do anúncio: estados, matriz de transições, visibilidade pública e efeitos sobre interesses e solicitações; fecha OD-04 (DEC-027) |
| [product/image-policy.md](product/image-policy.md) | existente | Política de imagens do anúncio: quantidade, formatos, limites, upload, validação de segurança, processamento, derivados públicos, visibilidade e moderação; fecha OD-05 (DEC-028) |
| [product/negotiation-lifecycle.md](product/negotiation-lifecycle.md) | existente | Ciclo de vida da negociação: estados `active` e `closed`, atores autorizados, encerramento unilateral, confirmação e irreversibilidade, ausência de automação, relação com anúncio, pagamento, contato e avaliações, concorrência, idempotência e auditoria; fecha OD-01 (DEC-029) |
| [product/ratings.md](product/ratings.md) | existente | Política de avaliações: natureza bilateral sobre a contraparte, elegibilidade, nota de 1 a 5, janela de 14 dias, publicação cega, edição e imutabilidade, reputação pública, abuso e invalidação auditada; fecha OD-02 (DEC-030) |
| [product/reselection-policy.md](product/reselection-policy.md) | existente | Política de desistência e reseleção: pré-condições da reseleção, confirmação explícita, imutabilidade da escolha e da liberação anteriores, nova negociação e nova autorização auditada, exclusividade da negociação `active`, preservação literal de RB-003 e tratamento da desistência; fecha OD-06 (DEC-032) |
| [product/data-retention-policy.md](product/data-retention-policy.md) | existente | Política de retenção e exclusão de dados: categorias, exclusão de conta com efeito imediato e prazo de 30 dias, expurgo de imagens, logs de acesso, auditoria, moderação e abuso, metadados financeiros, backups e legal hold; fecha OD-10 (DEC-033) |
| [product/age-eligibility.md](product/age-eligibility.md) | existente | Elegibilidade etária: 18 anos completos ou mais por declaração explícita no cadastro, sem coleta documental ou biométrica e sem verificação externa, com bloqueio cautelar diante de evidência razoável de menoridade; fecha OD-11 (DEC-034) |
| [product/interest-flow.md](product/interest-flow.md) | existente | Natureza da demonstração de interesse: ação gratuita de interface, sem entidade persistida, sem cancelamento e sem visibilidade ao anunciante, com telemetria apenas agregada; fecha OD-12 (DEC-035) |
| [product/payment-exceptions.md](product/payment-exceptions.md) | existente | Exceções de pagamento: fonte de verdade do pagamento, identidade e idempotência da tentativa, duplicidade técnica, instante de acreditação como critério de tempestividade, piso de 30 minutos da janela de reserva, preservação de RB-003 sob concorrência, falhas de confirmação e de webhook, reembolso técnico, distinção entre reembolso técnico, devolução Pix, MED e chargeback de cartão, efeitos das reversões, reconciliação, auditoria e segurança, com matriz de cenários; fecha OD-07 (DEC-037) |

### decisions — decisões em aberto e registro de decisões de produto

| Documento | Status | Conteúdo |
| --- | --- | --- |
| [decisions/open-decisions.md](decisions/open-decisions.md) | existente | Questões ainda não decididas, separadas das decisões vigentes. **Nenhuma resta:** OD-07, a última, foi fechada por [product/payment-exceptions.md](product/payment-exceptions.md) (DEC-037) |
| [decisions/decision-log.md](decisions/decision-log.md) | existente | Registro conciso das decisões vigentes DEC-xxx, com fonte oficial e impacto |

### architecture — visão de arquitetura e design técnico

| Documento | Status | Conteúdo |
| --- | --- | --- |
| [architecture/overview.md](architecture/overview.md) | existente | Visão geral da arquitetura: objetivos, camadas, os nove módulos de domínio, fronteiras de confiança, jornadas, autenticação e autorização em três níveis, dados pessoais, auditoria, imagens, pagamentos em nível macro, mobile-first, desempenho, observabilidade mínima, trabalho assíncrono e política de evolução sem microserviços; produzido por F0-022 |
| [architecture/data-model.md](architecture/data-model.md) | existente | Modelo lógico de dados: entidades, relações, cardinalidades, estados, unicidades e invariantes, com a proteção de concorrência de RB-003 por índice único parcial e alocação de vaga sob trava de transação; produzido por F0-022 |
| [architecture/payments-design.md](architecture/payments-design.md) | existente | Desenho técnico de pagamentos: identidade e idempotência da tentativa, janela de reserva de 30 minutos, receptor de webhook, confirmação contra o estado autoritativo, eleição do pagamento canônico, reembolso técnico, reversões, reconciliação, cadências, rastreamento de CI-1 a CI-12 e contrato de teste; produzido por F0-022 |
| [architecture/contact-release.md](architecture/contact-release.md) | existente | Desenho técnico de RB-001: a fronteira entre armazenar, autorizar e retornar o contato, pré-condições da autorização, verificação server-side a cada acesso, superfícies proibidas, proibição de cache compartilhado, quem não recebe e contrato de teste; produzido por F0-022 |

### adr — registros de decisão arquitetural

| Documento | Status | Conteúdo |
| --- | --- | --- |
| [adr/0001-modular-monolith-nextjs.md](adr/0001-modular-monolith-nextjs.md) | existente | Monólito modular com Next.js + TypeScript (App Router) |
| [adr/0002-postgresql-neon.md](adr/0002-postgresql-neon.md) | existente | PostgreSQL com Neon como provedor preferencial |
| [adr/0003-object-storage-r2.md](adr/0003-object-storage-r2.md) | existente | Cloudflare R2 como armazenamento S3-compatible para imagens |
| [adr/0004-mercado-pago-pix.md](adr/0004-mercado-pago-pix.md) | existente | Mercado Pago como gateway Pix inicial homologado, por Checkout Transparente via Orders API: idempotência, validação de assinatura por manifesto único, webhook no nível da aplicação, processamento idempotente e reconciliável e isolamento do domínio; fecha OD-08 (DEC-036) |
| [adr/0005-prisma-orm-migrations.md](adr/0005-prisma-orm-migrations.md) | existente | Prisma ORM e Prisma Migrate; política de migrations em desenvolvimento, staging e produção |
| [adr/0006-async-work-scheduling-concurrency.md](adr/0006-async-work-scheduling-concurrency.md) | existente | Trabalho assíncrono, agendamento e concorrência: PostgreSQL como fila e autoridade de trava, agendamento da própria plataforma, nenhuma invariante dependente de job, reclamação de lotes por `SKIP LOCKED`, trava de transação em vez de sessão, restrição de banco como garantia e endpoints protegidos por segredo; registra DEC-038 |

### engineering — convenções e práticas de engenharia

| Documento | Status | Conteúdo |
| --- | --- | --- |
| [engineering/ai-agent-workflow.md](engineering/ai-agent-workflow.md) | existente | Papéis, hierarquia de verdade, ciclo operacional, prompts, relatório obrigatório, Git e revisão para Bruno, ChatGPT, Claude Code e Antigravity |
| [engineering/conventions.md](engineering/conventions.md) | existente | Convenções de engenharia: runtime Node.js 24.x LTS, Next.js 16.3.x Active LTS, TypeScript `strict`, App Router, pinning e lockfile, política de dependências, organização de código e fronteiras de módulo, fronteira servidor/cliente, dados protegidos, autorização server-side, validação de entrada, TypeScript, comandos padronizados de qualidade e princípios de segurança |
| engineering/environments.md | futuro | Ambientes, variáveis e segredos. Será criado por **F1-001** ([delivery/prompts/f1-001-environments-and-secrets.md](delivery/prompts/f1-001-environments-and-secrets.md)) |
| [engineering/testing.md](engineering/testing.md) | existente | Estratégia de testes: níveis (unitário, integração, componentes, E2E, contrato), Vitest 5.x e React Testing Library, Playwright previsto para E2E futuro, prioridade por risco, invariantes a provar para RB-001 a RB-006, requisitos futuros de concorrência e idempotência e política de test doubles |

### delivery — entrega, riscos e planejamento

| Documento | Status | Conteúdo |
| --- | --- | --- |
| [delivery/risks.md](delivery/risks.md) | existente | Riscos conhecidos, impacto e mitigação inicial |
| [delivery/roadmap.md](delivery/roadmap.md) | existente | Roadmap macro por fases: objetivo, entregáveis, dependências e gate de saída, sem datas |
| [delivery/backlog.md](delivery/backlog.md) | existente | Backlog de alto nível da Fase 0 (F0-xxx). Todos os itens estão concluídos; a fase foi encerrada em 2026-09-14 |
| [delivery/phase-1-transition.md](delivery/phase-1-transition.md) | existente | Verificação formal do gate de saída da Fase 0 e transição para a Fase 1: baseline auditado, matriz de dez critérios com fonte, evidência e resultado (todos `PASS`), verificação dos requisitos dos quais a Fase 1 e a Fase 2 dependem, revisão dos riscos R-01 a R-11, resultado **APROVADO**, condições de entrada da Fase 1 e classificação factual dos seus sete entregáveis entre `já existente`, `parcial` e `não iniciado`; produzido por F0-023 |
| [delivery/prompts/f1-001-environments-and-secrets.md](delivery/prompts/f1-001-environments-and-secrets.md) | existente | Prompt executor de **F1-001**, o primeiro trabalho da Fase 1: contrato de ambientes e segredos, sem provisionar serviço externo e sem iniciar o schema de domínio. É um prompt, não uma implementação; produzido por F0-023 |
| [delivery/spikes/f0-010-mercado-pago-pix-r099.md](delivery/spikes/f0-010-mercado-pago-pix-r099.md) | existente | Evidências das seis execuções do spike F0-010 do gateway Pix para exatamente R$ 0,99 (Mercado Pago); a sexta é `CONCLUSIVO`, com 10 de 10 critérios comprovados, e encerra o spike; a homologação decorrente está em [adr/0004-mercado-pago-pix.md](adr/0004-mercado-pago-pix.md) |
| delivery/release-checklist.md | futuro | Checklist de release |

## Convenções

- Regras de negócio usam o prefixo `RB-` e não têm sua semântica alterada sem decisão registrada.
- Requisitos usam `RF-` (funcionais) e `RNF-` (não funcionais); decisões vigentes usam `DEC-`; decisões abertas usam `OD-`; riscos usam `R-`; itens do backlog da Fase 0 usam `F0-`. IDs nunca são reutilizados.
- ADRs seguem a estrutura: Status, Contexto, Decisão, Consequências, Alternativas consideradas.
- Toda decisão listada em [decisions/open-decisions.md](decisions/open-decisions.md) permanece aberta até ser fechada por documento próprio (ADR ou documento de produto).
