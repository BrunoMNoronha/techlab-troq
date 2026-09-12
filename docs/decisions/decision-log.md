# Registro de decisões vigentes (decision log)

Registro conciso das decisões **já vigentes** do TROQ, para que qualquer pessoa ou agente descubra rapidamente o que já foi decidido sem depender de conversas. Cada entrada aponta para a fonte oficial; este documento não substitui os ADRs nem as regras de negócio e não replica seu conteúdo.

Decisões **abertas** não aparecem aqui como vigentes. Elas estão em [open-decisions.md](open-decisions.md) e só entram neste registro quando forem fechadas por documento próprio.

## Convenções

- IDs sequenciais `DEC-xxx`. Um ID nunca é reutilizado.
- **Data:** data em que a decisão foi registrada formalmente no repositório. Decisões tomadas antes do baseline e registradas em 2026-09-07 usam essa data.
- **Status:** `vigente`, `vigente (direcionamento)` para orientações que ainda serão detalhadas em design, ou `substituída por DEC-xxx` quando uma decisão for revogada. Nenhuma decisão é apagada.
- **Fonte oficial:** documento que formaliza a decisão. Em caso de divergência, a fonte oficial prevalece sobre este resumo, e a hierarquia de verdade em [../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md) prevalece sobre ambos.

## Regras de negócio

| ID | Data | Decisão | Status | Fonte oficial | Impacto resumido |
| --- | --- | --- | --- | --- | --- |
| DEC-001 | 2026-09-07 | RB-001: WhatsApp/telefone só pode ser liberado ao solicitante escolhido e com pagamento aprovado | vigente | [../product/business-rules.md](../product/business-rules.md) | Liberação de contato exige duas condições simultâneas; ver RF-013 a RF-015 |
| DEC-002 | 2026-09-07 | RB-002: avaliação somente após encerramento da negociação no sistema | vigente | [../product/business-rules.md](../product/business-rules.md) | Avaliações bloqueadas até o encerramento; mecanismo de encerramento segue aberto (OD-01) |
| DEC-003 | 2026-09-07 | RB-003: cada anúncio aceita no máximo 3 solicitações pagas | vigente | [../product/business-rules.md](../product/business-rules.md) | Exige proteção contra concorrência; ver DEC-019 |
| DEC-004 | 2026-09-07 | RB-004: a cobrança de R$ 0,99 é definitiva, mesmo quando o solicitante não for escolhido | vigente | [../product/business-rules.md](../product/business-rules.md) | Sem reembolso por não escolha; valor exato de R$ 0,99 condiciona o spike do gateway |
| DEC-005 | 2026-09-07 | RB-005: localização pública limitada a cidade/UF | vigente | [../product/business-rules.md](../product/business-rules.md) | Modelo de dados e interface não expõem localização mais precisa |
| DEC-006 | 2026-09-07 | RB-006: anúncios com itens proibidos devem ser removidos | vigente | [../product/business-rules.md](../product/business-rules.md) | Exige denúncia e moderação; catálogo segue aberto (OD-03) |

## Arquitetura e stack

| ID | Data | Decisão | Status | Fonte oficial | Impacto resumido |
| --- | --- | --- | --- | --- | --- |
| DEC-007 | 2026-09-07 | Monólito modular como arquitetura inicial; sem microserviços nem API Node separada no MVP sem necessidade comprovada | vigente | [../adr/0001-modular-monolith-nextjs.md](../adr/0001-modular-monolith-nextjs.md) | Um único deploy; fronteiras de módulo internas; autorização e auditoria dentro do mesmo processo |
| DEC-008 | 2026-09-07 | Next.js + TypeScript com App Router para frontend e backend | vigente | [../adr/0001-modular-monolith-nextjs.md](../adr/0001-modular-monolith-nextjs.md) | Backend em Route Handlers/Server Actions; nenhuma outra tecnologia de framework será avaliada sem ADR |
| DEC-009 | 2026-09-07 | PostgreSQL como banco relacional, usando PostgreSQL padrão | vigente | [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md) | Garantias de consistência via transações e restrições; ORM e migrations definidos em DEC-026 |
| DEC-010 | 2026-09-07 | Neon como provedor PostgreSQL preferencial | vigente | [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md) | Decisão de provedor, não de dialeto; troca deve permanecer viável |
| DEC-011 | 2026-09-07 | Vercel como plataforma de deploy; produção comercial não pode depender do plano Hobby | vigente | [../project-state.md](../project-state.md) | Custo de plano pago previsto para produção (R-09) |
| DEC-012 | 2026-09-07 | Better Auth como solução de autenticação inicial | vigente | [../project-state.md](../project-state.md) | Base de RF-001 a RF-003 |
| DEC-013 | 2026-09-07 | Autenticação inicial por email/senha com verificação de email; login social fora do núcleo inicial | vigente | [../project-state.md](../project-state.md), [../product/mvp-scope.md](../product/mvp-scope.md) | Login social é candidato pós-MVP |
| DEC-014 | 2026-09-07 | Cloudflare R2 como armazenamento de objetos preferencial para imagens, acessado via API S3-compatible | vigente | [../adr/0003-object-storage-r2.md](../adr/0003-object-storage-r2.md) | Dados protegidos nunca em objetos públicos; as regras de imagem estão definidas em DEC-028 ([../product/image-policy.md](../product/image-policy.md)) |
| DEC-015 | 2026-09-07 | Resend como provedor inicial de email transacional | vigente | [../project-state.md](../project-state.md) | Base de RF-002 e RF-021 |
| DEC-026 | 2026-09-07 | Prisma ORM (linha 7.x estável, versão pinada) como camada de acesso a dados e Prisma Migrate como mecanismo oficial de migrations; migrations versionadas no Git e imutáveis após aplicação em ambiente compartilhado; `migrate dev` restrito a desenvolvimento; `migrate deploy` por job controlado de CI/CD em staging/produção, nunca no startup nem em Serverless Function; `db push` proibido fora de desenvolvimento; mudanças destrutivas por expand/contract | vigente | [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md) | Fecha OD-09 e mitiga R-07; desbloqueia criação de schema e migrations na Fase 1; migrations usam conexão direta (não pooled) do Neon |

## Pagamentos

| ID | Data | Decisão | Status | Fonte oficial | Impacto resumido |
| --- | --- | --- | --- | --- | --- |
| DEC-016 | 2026-09-07 | Pagamentos Pix-first | vigente | [../project-state.md](../project-state.md) | Cobrança de R$ 0,99 via Pix (RF-011) |
| DEC-017 | 2026-09-07 | Mercado Pago é apenas o **primeiro candidato** a gateway; **não** é decisão final | vigente | [../project-state.md](../project-state.md), [open-decisions.md](open-decisions.md) | A escolha do gateway permanece aberta (OD-08); nenhuma integração deve assumir Mercado Pago |
| DEC-018 | 2026-09-07 | Spike obrigatório antes de homologar o gateway e implementar pagamentos, provando cobrança de exatamente R$ 0,99, confirmação, webhook, idempotência e tarifas | vigente | [../project-state.md](../project-state.md), [../delivery/risks.md](../delivery/risks.md) (R-01) | Próximo trabalho crítico da Fase 0 ([../delivery/backlog.md](../delivery/backlog.md), F0-010); gera ADR-0004 ao fechar OD-08 |
| DEC-019 | 2026-09-07 | Reserva atômica de vaga antes da cobrança, com expiração, como direcionamento para garantir RB-003 sob concorrência | vigente (direcionamento) | [../project-state.md](../project-state.md), [../product/business-rules.md](../product/business-rules.md) | Detalhamento no design de pagamentos; exceções seguem abertas (OD-07) |

## Mobile, PWA e dados protegidos

| ID | Data | Decisão | Status | Fonte oficial | Impacto resumido |
| --- | --- | --- | --- | --- | --- |
| DEC-020 | 2026-09-07 | PWA faz parte do direcionamento mobile | vigente (direcionamento) | [../project-state.md](../project-state.md) | RNF-006; capacidades mínimas definidas na Fase 5 |
| DEC-021 | 2026-09-07 | Web Push não bloqueia o MVP | vigente | [../project-state.md](../project-state.md), [../product/mvp-scope.md](../product/mvp-scope.md) | Web Push é candidato pós-MVP |
| DEC-022 | 2026-09-07 | Localização precisa não deve ser coletada nem exposta no MVP sem necessidade posteriormente documentada; localização pública é cidade/UF | vigente | [../project-state.md](../project-state.md), RB-005 | RF-007, RNF-008 |
| DEC-023 | 2026-09-07 | Telefone/WhatsApp é dado protegido: nunca em payload público, cache público ou logs; liberação exige autorização server-side e auditoria | vigente | [../project-state.md](../project-state.md), [../product/business-rules.md](../product/business-rules.md) | RF-014, RF-015, RF-022, RNF-007, RNF-011 |

## Produto e governança

| ID | Data | Decisão | Status | Fonte oficial | Impacto resumido |
| --- | --- | --- | --- | --- | --- |
| DEC-024 | 2026-09-07 | Público-alvo principal: adultos entre 18 e 50 anos, principalmente de grandes centros urbanos, familiarizados com marketplaces, uso prioritário em smartphones, experiência adequada em redes 3G/4G. O intervalo etário descreve público-alvo, **não** regra técnica de cadastro | vigente | [../product/mvp-scope.md](../product/mvp-scope.md) | Fundamenta RNF-001 a RNF-005; elegibilidade etária formal segue aberta (OD-11) |
| DEC-025 | 2026-09-07 | Modo operacional com Bruno como responsável final, ChatGPT como orquestrador e Claude Code/Antigravity como executores de tarefas delimitadas, com hierarquia de verdade e relatório obrigatório | vigente | [../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md) | Todo prompt executor e todo relatório seguem esse documento |
| DEC-027 | 2026-09-10 | Ciclo de vida do anúncio no MVP: cinco estados (`draft`, `published`, `paused`, `closed`, `removed`), estado inicial `draft`, somente `published` é público e aceita novos interesses e novas solicitações, `closed` e `removed` são terminais, `removed` é exclusivo da moderação e bloqueia nova escolha e nova liberação de contato, nenhuma transição cancela solicitação paga nem revoga liberação já autorizada, e **não** há expiração automática no MVP | vigente | [../product/listing-lifecycle.md](../product/listing-lifecycle.md) | Fecha OD-04; desbloqueia o modelo de dados do anúncio e F0-014, F0-015 e F0-018; atualiza RF-004, RF-005, RF-006, RF-008, RF-019 e RF-020; preserva RB-003, RB-004 e RB-006; anúncio e negociação seguem ciclos distintos (encerramento da negociação permanece em OD-01) |
| DEC-028 | 2026-09-12 | Política de imagens do anúncio no MVP: mínimo de 1 imagem processada com sucesso para publicar e máximo de 6 por anúncio, primeira imagem como capa; allowlist de entrada JPEG/PNG/WebP estático, com SVG, GIF, animados/multipágina, TIFF, BMP, AVIF e HEIC/HEIF rejeitados; máximo de 10 MB, mínimo de 320 px por lado e máximo de 50 megapixels por arquivo; upload direto do cliente ao R2 por operação S3-compatible de curta duração autorizada server-side, sem trafegar o binário por Vercel Function; validação por conteúdo com decodificação efetiva, chave gerada pela aplicação, regravação da imagem, auto-orientação antes da remoção de EXIF e remoção de metadados incluindo GPS; derivados públicos `thumb` 320 px, `medium` 768 px e `large` 1600 px em WebP qualidade 80, sem ampliação e com dimensões conhecidas; original temporário nunca público, descartado após processamento e limpo em no máximo 24 horas; imagens seguem a visibilidade do estado do anúncio; **sem** pré-moderação automática por IA e **sem** estado de moderação por imagem | vigente | [../product/image-policy.md](../product/image-policy.md) | Fecha OD-05 e mitiga R-10; desbloqueia RF-006 e F0-014; define critérios objetivos de RNF-005; atualiza RF-004 e RF-020; complementa ADR-0003 (DEC-014) sem alterá-lo; preserva RB-001 a RB-006 e DEC-027; moderação de conteúdo permanece em OD-03 e retenção/expurgo definitivo em OD-10 |

## Decisões que permanecem abertas

Nenhuma das questões abaixo foi fechada e nenhuma deve ser inferida a partir deste registro:

| Decisão aberta | Tema |
| --- | --- |
| OD-01 | Mecanismo de encerramento da negociação |
| OD-02 | Regras detalhadas de avaliação |
| OD-03 | Catálogo/política de itens proibidos |
| OD-06 | Política de desistência e reseleção |
| OD-07 | Chargebacks, duplicidade e exceções de pagamento |
| OD-08 | Validação e escolha do gateway para R$ 0,99 |
| OD-10 | Retenção e exclusão de dados |
| OD-11 | Elegibilidade etária formal |
| OD-12 | Natureza da demonstração de interesse |

OD-04 foi fechada por [../product/listing-lifecycle.md](../product/listing-lifecycle.md) (DEC-027) e OD-05 foi fechada por [../product/image-policy.md](../product/image-policy.md) (DEC-028); ambas deixaram esta lista.

Detalhes em [open-decisions.md](open-decisions.md). Quando uma delas for fechada, adiciona-se uma entrada `DEC-xxx` aqui, atualiza-se [open-decisions.md](open-decisions.md) e, se aplicável, cria-se o ADR correspondente.
