# Backlog da Fase 0 — TROQ

Backlog de **alto nível** da Fase 0 (Descoberta e definição) e do caminho de execução até a transição para a Fase 1. Este documento **não** é o backlog técnico da aplicação: tarefas de implementação das fases seguintes serão detalhadas quando cada fase for aberta ([roadmap.md](roadmap.md)).

Fontes: [roadmap.md](roadmap.md), [../decisions/open-decisions.md](../decisions/open-decisions.md), [../decisions/decision-log.md](../decisions/decision-log.md), [../product/requirements.md](../product/requirements.md), [risks.md](risks.md).

## Convenções

- IDs `F0-xxx`, sequenciais, nunca reutilizados.
- **Estados:** `concluído`, `próximo` (o próximo trabalho a executar), `pendente` (pode ser executado assim que houver capacidade, sem bloqueio) e `bloqueado` (depende de outro item ainda não concluído).
- Cada item resulta em documento versionado ou em decisão registrada em [../decisions/decision-log.md](../decisions/decision-log.md) e no fechamento da OD correspondente em [../decisions/open-decisions.md](../decisions/open-decisions.md).
- Ordem de execução segue a hierarquia de dependências; itens `pendente` sem dependência entre si podem correr em paralelo.

## Concluído

| ID | Título | Objetivo | Dependências | Estado |
| --- | --- | --- | --- | --- |
| F0-001 | Inspeção inicial do repositório | Registrar o estado factual do repositório antes de qualquer alteração | — | concluído |
| F0-002 | Baseline documental inicial | README, índice, estado do projeto, escopo do MVP, RB-001 a RB-006, OD-01 a OD-11, R-01 a R-10 (PR #1, squash em `main`) | F0-001 | concluído |
| F0-003 | ADRs 0001 a 0003 | Formalizar monólito modular/Next.js, PostgreSQL/Neon e Cloudflare R2 | F0-001 | concluído |

## Trabalho desta entrega (estruturação do baseline)

| ID | Título | Objetivo | Dependências | Estado |
| --- | --- | --- | --- | --- |
| F0-004 | Correção do público-alvo | Registrar o perfil completo do público-alvo em [../product/mvp-scope.md](../product/mvp-scope.md), separando perfil de papéis e preservando OD-11 | F0-002 | concluído |
| F0-005 | Requisitos rastreáveis | Catálogo RF/RNF com rastreabilidade para RB e OD em [../product/requirements.md](../product/requirements.md) | F0-002, F0-003 | concluído |
| F0-006 | Decision log | Registro de decisões vigentes em [../decisions/decision-log.md](../decisions/decision-log.md) | F0-002, F0-003 | concluído |
| F0-007 | Roadmap macro | Fases, entregáveis, dependências e gates em [roadmap.md](roadmap.md) | F0-005 | concluído |
| F0-008 | Workflow de agentes | Governança entre Bruno, ChatGPT, Claude Code e Antigravity em [../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md) | — | concluído |
| F0-009 | Backlog da Fase 0 e índice documental | Este documento e atualização de [../README.md](../README.md) | F0-004 a F0-008 | concluído |

## Próximos trabalhos

Ordem lógica. F0-010 está `bloqueado` por falta de credenciais de teste do gateway (bloqueio externo, ver abaixo). F0-013 foi concluído e fechou OD-04, o que desbloqueou F0-014, F0-015 e F0-018. O item `próximo` passa a ser F0-014; F0-015 e F0-018 ficam `pendente`, sem bloqueio.

| ID | Título | Objetivo | Dependências | Estado |
| --- | --- | --- | --- | --- |
| F0-010 | Spike do gateway Pix para exatamente R$ 0,99 | Provar, em sandbox do primeiro candidato (Mercado Pago) e, se necessário, de alternativas, a cobrança de exatamente R$ 0,99, confirmação, webhook, idempotência e tarifas (DEC-018, R-01). O spike é descartável e não entra no código do produto | F0-005; credenciais de teste do gateway e endpoint HTTPS público para webhook | bloqueado |
| F0-011 | Registrar resultado e decisão do gateway | Documentar evidências do spike, fechar OD-08 com ADR-0004 e atualizar decision log, riscos e requisitos RF-011 e RF-012 | F0-010 | bloqueado |
| F0-012 | Fechar ORM e estratégia de migrations | Fechar OD-09 com [ADR-0005](../adr/0005-prisma-orm-migrations.md): Prisma ORM 7.x, Prisma Migrate, política dev/staging/produção, `db push` e migrations destrutivas (DEC-026) | F0-003 | concluído |
| F0-013 | Detalhar ciclo de vida do anúncio | Fechar OD-04 em [../product/listing-lifecycle.md](../product/listing-lifecycle.md): estados, transições, visibilidade pública e efeitos sobre interesses e solicitações (DEC-027) | F0-005 | concluído |
| F0-014 | Definir regras de imagens | Fechar OD-05: quantidade, formatos, tamanho, processamento e moderação de imagens; atualizar RF-006 e RNF-005 | F0-013 | próximo |
| F0-015 | Definir mecanismo de encerramento | Fechar OD-01: quem aciona, confirmação, prazos e estados intermediários; atualizar RF-016 | F0-013 | pendente |
| F0-016 | Definir avaliações | Fechar OD-02 em `product/ratings.md`; atualizar RF-017 | F0-015 | bloqueado |
| F0-017 | Definir catálogo/política de itens proibidos | Fechar OD-03 em `product/prohibited-items.md`, incluindo fluxo de denúncia e prazos; atualizar RF-018 a RF-020 | F0-005 | pendente |
| F0-018 | Definir política de desistência e reseleção | Fechar OD-06; atualizar RF-013 e RF-015 | F0-013 | pendente |
| F0-019 | Definir tratamento de exceções de pagamento | Fechar OD-07: chargebacks, duplicidade, pagamento após expiração da reserva, falhas de confirmação; atualizar RF-009 a RF-012 | F0-011 | bloqueado |
| F0-020 | Definir retenção e exclusão de dados | Fechar OD-10: prazos, exclusão de conta, anonimização, retenção de auditoria; atualizar RF-023, RNF-009 e RNF-011 | F0-005 | pendente |
| F0-021 | Definir elegibilidade etária formal | Fechar OD-11: idade mínima, declaração/verificação, critérios jurídicos e operacionais; atualizar RF-001. O público-alvo de 18 a 50 anos não determina esta decisão | F0-005 | pendente |
| F0-022 | Produzir arquitetura de dados e API pré-implementação | `architecture/overview.md`, `architecture/data-model.md`, `architecture/payments-design.md` e `architecture/contact-release.md`, com base nas decisões fechadas | F0-011, F0-012, F0-013, F0-014, F0-015, F0-018, F0-019, F0-020, F0-024 | bloqueado |
| F0-023 | Preparar transição para a Fase 1 | Verificar o gate de saída da Fase 0 em [roadmap.md](roadmap.md), revisar riscos e produzir o prompt inicial da Fase 1 | F0-022 | bloqueado |
| F0-024 | Definir natureza da demonstração de interesse | Fechar OD-12 e atualizar RF-008, definindo se a demonstração de interesse é uma ação independente (com ou sem entidade persistida, gratuita ou não) ou apenas parte da solicitação paga | F0-005 | pendente |

### Bloqueio externo de F0-010

A primeira execução de F0-010 foi registrada em [spikes/f0-010-mercado-pago-pix-r099.md](spikes/f0-010-mercado-pago-pix-r099.md) e classificada como `INCONCLUSIVO`: não havia credenciais de teste do Mercado Pago nem endpoint HTTPS público para receber webhook. O item **não** está concluído e deve ser reexecutado quando essas duas condições existirem. Enquanto isso, OD-08 permanece aberta, nenhuma decisão de gateway pode ser inferida e F0-011 permanece `bloqueado`.

## Fora deste backlog

- Tarefas de implementação da Fase 1 em diante (scaffold, CI, schema, telas, integrações): detalhadas somente quando a respectiva fase for aberta.
- Candidatos pós-MVP listados em [roadmap.md](roadmap.md).

## Revisão

Atualizar este documento a cada item concluído, sempre na mesma PR que registra o resultado, e ao fechar cada decisão aberta.
