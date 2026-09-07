# Roadmap macro — TROQ

Roadmap por fases do MVP. Registra objetivo, principais entregáveis, dependências e gate de saída de cada fase. **Não há datas:** o projeto não possui base para estimativas, e datas artificiais não serão atribuídas. A ordem das fases é lógica, não calendário; itens de fases diferentes podem se sobrepor quando as dependências permitirem.

Fontes: [../product/mvp-scope.md](../product/mvp-scope.md), [../product/requirements.md](../product/requirements.md), [../decisions/decision-log.md](../decisions/decision-log.md), [../decisions/open-decisions.md](../decisions/open-decisions.md), [risks.md](risks.md).

## Visão geral

| Fase | Nome | Estado |
| --- | --- | --- |
| 0 | Descoberta e definição | em andamento |
| 1 | Fundação técnica | não iniciada |
| 2 | Identidade e anúncios | não iniciada |
| 3 | Solicitações, pagamentos e contato | não iniciada |
| 4 | Encerramento, avaliações e moderação | não iniciada |
| 5 | Hardening e lançamento | não iniciada |
| — | Pós-MVP (candidatos) | não planejado |

## Fase 0 — Descoberta e definição

**Objetivo:** fechar produto e decisões críticas; provar a viabilidade da cobrança de R$ 0,99; concluir a documentação pré-implementação necessária.

**Principais entregáveis:**

- Baseline documental: escopo do MVP, regras RB-001 a RB-006, decisões abertas, riscos, ADRs 0001 a 0003 (concluído).
- Público-alvo completo, requisitos rastreáveis, decision log, roadmap, backlog e workflow de agentes (esta entrega).
- Spike do gateway Pix para exatamente R$ 0,99, com resultado registrado e decisão do gateway (OD-08, ADR-0004).
- Fechamento das decisões que bloqueiam o modelo de dados: ORM e migrations (OD-09), ciclo de vida do anúncio (OD-04), regras de imagens (OD-05).
- Fechamento das decisões de produto: encerramento (OD-01), avaliações (OD-02), itens proibidos (OD-03), desistência/reseleção (OD-06), exceções de pagamento (OD-07), retenção/exclusão (OD-10), elegibilidade etária (OD-11).
- Arquitetura de dados e de API necessária antes da implementação (`architecture/overview.md`, `architecture/data-model.md`, `architecture/payments-design.md`, `architecture/contact-release.md`).

**Dependências:** nenhuma externa; depende da disponibilidade de Bruno para decisões e do acesso a ambiente sandbox do gateway candidato para o spike.

**Gate de saída:**

- OD-08 e OD-09 fechadas, com ADRs correspondentes.
- OD-04 e OD-05 fechadas, ou explicitamente adiadas com registro de impacto no modelo de dados.
- Requisitos que a Fase 1 e a Fase 2 dependem com status `definido`.
- Backlog da Fase 0 ([backlog.md](backlog.md)) sem itens `próximo` ou `bloqueado` que impeçam a Fase 1.

## Fase 1 — Fundação técnica

**Objetivo:** criar a base técnica sobre a qual as funcionalidades serão construídas, sem funcionalidade de produto.

**Principais entregáveis:**

- Scaffold da aplicação Next.js + TypeScript com App Router e estrutura de módulos do monólito modular.
- Padrões de projeto: convenções de código, lint, formatação, estrutura de testes (`engineering/conventions.md`, `engineering/testing.md`).
- CI: lint, typecheck, testes e build em toda PR.
- Configuração de ambientes e segredos (`engineering/environments.md`).
- Banco PostgreSQL/Neon provisionado, ORM e migrations conforme OD-09 fechada, schema inicial derivado de `architecture/data-model.md`.
- Infraestrutura mínima: projeto Vercel, bucket R2, Resend, em ambientes de desenvolvimento e preview.
- Observabilidade básica: logs estruturados e rastreamento de erros, sem dados protegidos (RNF-018).

**Dependências:** gate da Fase 0; em particular OD-09 (ORM/migrations) e modelo de dados.

**Gate de saída:**

- CI verde em `main` com lint, typecheck, testes e build.
- Deploy de preview funcionando na Vercel a partir de PR.
- Migrations executáveis e reversíveis em ambiente de desenvolvimento.
- Nenhum segredo versionado (RNF-015).

## Fase 2 — Identidade e anúncios

**Objetivo:** permitir criar conta, publicar e consultar anúncios.

**Principais entregáveis:**

- Autenticação com Better Auth: cadastro, verificação de email, login, logout, sessão (RF-001 a RF-003).
- Conta do usuário (dados mínimos necessários, sem contato exposto).
- Publicação de anúncio com ciclo de vida conforme OD-04 (RF-004).
- Upload e otimização de imagens no R2 conforme OD-05 (RF-006, RNF-005).
- Localização pública por cidade/UF (RF-007).
- Consulta de anúncios: listagem e detalhe sem contato (RF-005).
- Email transacional de verificação via Resend (RF-021).

**Dependências:** gate da Fase 1; OD-04, OD-05 e OD-11 fechadas ou adiadas com registro.

**Gate de saída:**

- Fluxo completo cadastro → verificação → login → publicar → consultar funcionando em preview, mobile-first.
- Nenhum payload público contém telefone/WhatsApp (RF-014 verificado por teste).
- Testes automatizados cobrindo autenticação e publicação.

## Fase 3 — Solicitações, pagamentos e contato

**Objetivo:** implementar o núcleo monetizado: solicitação paga, limite de 3, escolha e liberação de contato.

**Principais entregáveis:**

- Demonstração de interesse e solicitação de desbloqueio (RF-008, RF-009).
- Reserva atômica de vaga com expiração e limite de 3 solicitações pagas (RF-010, RNF-016).
- Cobrança de exatamente R$ 0,99 via Pix no gateway homologado (RF-011).
- Webhooks com idempotência e reconciliação (RF-012).
- Escolha do solicitante pelo anunciante (RF-013).
- Autorização server-side e liberação de contato ao escolhido com pagamento aprovado, com auditoria (RF-014, RF-015, RF-022).
- Design de pagamentos e de liberação de contato implementados conforme `architecture/payments-design.md` e `architecture/contact-release.md`.

**Dependências:** gate da Fase 2; OD-06, OD-07 e OD-08 fechadas; ADR-0004 (gateway) aceito.

**Gate de saída:**

- Testes de concorrência provando que nunca há mais de 3 solicitações pagas por anúncio.
- Testes de webhook duplicado, fora de ordem e atrasado sem inconsistência de estado.
- Liberação de contato só ocorre com as duas condições de RB-001 e gera auditoria.
- Revisão reforçada concluída para pagamentos, autorização e dados ([../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md)).

## Fase 4 — Encerramento, avaliações e moderação

**Objetivo:** fechar o ciclo da negociação e proteger a plataforma.

**Principais entregáveis:**

- Mecanismo de encerramento conforme OD-01 fechada (RF-016).
- Avaliações conforme OD-02 fechada, permitidas apenas após encerramento (RF-017).
- Denúncia de anúncios (RF-018).
- Moderação com auditoria (RF-019).
- Remoção de anúncios com itens proibidos conforme catálogo de OD-03 (RF-020).

**Dependências:** gate da Fase 3; OD-01, OD-02 e OD-03 fechadas.

**Gate de saída:**

- Nenhuma avaliação aceita antes do encerramento (RB-002 verificado por teste).
- Anúncio removido por moderação deixa de ser consultável e o efeito sobre solicitações existentes segue a decisão registrada.
- Catálogo de itens proibidos publicado (`product/prohibited-items.md`).

## Fase 5 — Hardening e lançamento

**Objetivo:** tornar a plataforma pronta para produção comercial.

**Principais entregáveis:**

- Segurança: revisão de autenticação, autorização, validação de entradas, proteção de segredos (RNF-007, RNF-014, RNF-015).
- Privacidade/LGPD: retenção e exclusão conforme OD-10, exclusão de conta (RF-023, RNF-008, RNF-009), política de privacidade e termos de uso (incluindo elegibilidade etária conforme OD-11).
- Performance em smartphones e redes 3G/4G, com métricas objetivas definidas neste gate (RNF-003, RNF-004).
- Acessibilidade com nível de conformidade definido neste gate (RNF-010).
- PWA com capacidades mínimas definidas (RNF-006).
- Auditoria e observabilidade revisadas (RNF-011, RNF-018).
- Preparação operacional: checklist de release (`delivery/release-checklist.md`), plano Vercel pago para produção, monitoramento de custos dos provedores (R-08, R-09).
- Deploy de produção.

**Dependências:** gate da Fase 4; OD-10 e OD-11 fechadas.

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
