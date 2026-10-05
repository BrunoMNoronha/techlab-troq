# Plano das Fases 4 e 5 — TROQS

**Decomposição em 2026-10-05.** Baseline de código: `main@f6d3ae51fb480d0b77f713dbfbd63f0c6fe92214`. As 17 issues abaixo estão abertas e vinculadas como subissues dos épicos [#55](https://github.com/BrunoMNoronha/techlab-troq/issues/55) e [#56](https://github.com/BrunoMNoronha/techlab-troq/issues/56). Esta entrega organiza o trabalho; não implementa as fases nem aprova os seus gates.

## Estado de entrada

- O gate da Fase 3 ([#105](https://github.com/BrunoMNoronha/techlab-troq/issues/105)) permanece aberto. A existência de implementação e CI não substitui a homologação do gate por SHA.
- `Negotiation`, `Rating`, `Report`, `ModerationDecision`, `Sanction`, `Appeal` e `AccountDeletionRequest` já existem no modelo. A criação de negociação está implementada; encerramento público, avaliações, moderação e exclusão de conta ainda precisam das entregas abaixo.
- As páginas públicas de termos e privacidade e o Speed Insights já existem. Sua existência não prova revisão jurídica, metas de desempenho, acessibilidade ou disponibilidade.
- [#135](https://github.com/BrunoMNoronha/techlab-troq/issues/135) está encerrada: houve release operacional para `https://troqs.app`, com [Deploy Production 37273766162](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37273766162). A operação comercial continua sujeita aos gates das Fases 3, 4 e 5 e à autorização correspondente.
- A configuração de Google está em [#133](https://github.com/BrunoMNoronha/techlab-troq/issues/133) e [google-sign-in-proof.md](google-sign-in-proof.md). Publicar o consentimento externo não aprova os demais fluxos do MVP.

## Fase 4 — encerramento, avaliações e moderação

| ID / issue | Entrega | Dependências |
| --- | --- | --- |
| F4-001 / [#163](https://github.com/BrunoMNoronha/techlab-troq/issues/163) | Implementar encerramento unilateral e auditado da negociação | #105 |
| F4-002 / [#164](https://github.com/BrunoMNoronha/techlab-troq/issues/164) | Implementar avaliações cegas e reputação pública | [#163](https://github.com/BrunoMNoronha/techlab-troq/issues/163) |
| F4-003 / [#165](https://github.com/BrunoMNoronha/techlab-troq/issues/165) | Implementar denúncia confidencial de anúncios | #105 |
| F4-004 / [#166](https://github.com/BrunoMNoronha/techlab-troq/issues/166) | Implementar decisão de moderação e remoção administrativa | [#165](https://github.com/BrunoMNoronha/techlab-troq/issues/165) |
| F4-005 / [#167](https://github.com/BrunoMNoronha/techlab-troq/issues/167) | Implementar sanções, contestação e invalidação de avaliações | [#164](https://github.com/BrunoMNoronha/techlab-troq/issues/164), [#166](https://github.com/BrunoMNoronha/techlab-troq/issues/166) |
| F4-006 / [#168](https://github.com/BrunoMNoronha/techlab-troq/issues/168) | Completar notificações e acompanhamento dos prazos da Fase 4 | [#163](https://github.com/BrunoMNoronha/techlab-troq/issues/163), [#164](https://github.com/BrunoMNoronha/techlab-troq/issues/164), [#166](https://github.com/BrunoMNoronha/techlab-troq/issues/166), [#167](https://github.com/BrunoMNoronha/techlab-troq/issues/167) |
| F4-007 / [#169](https://github.com/BrunoMNoronha/techlab-troq/issues/169) | Auditar segurança e homologar o gate da Fase 4 | #105, [#163](https://github.com/BrunoMNoronha/techlab-troq/issues/163), [#164](https://github.com/BrunoMNoronha/techlab-troq/issues/164), [#165](https://github.com/BrunoMNoronha/techlab-troq/issues/165), [#166](https://github.com/BrunoMNoronha/techlab-troq/issues/166), [#167](https://github.com/BrunoMNoronha/techlab-troq/issues/167), [#168](https://github.com/BrunoMNoronha/techlab-troq/issues/168) |

Após #105, duas frentes podem começar em paralelo: encerramento (#163 → #164) e denúncia/moderação (#165 → #166). Elas convergem em sanções, contestação e invalidação (#167). O catálogo das notificações pode ser preparado antes; a homologação de #168 espera os eventos de domínio de #163, #164, #166 e #167. #169 reúne as evidências no mesmo SHA antes de encerrar #55.

Os contratos de [encerramento](../product/negotiation-lifecycle.md), [avaliações](../product/ratings.md), [itens proibidos](../product/prohibited-items.md) e [ciclo do anúncio](../product/listing-lifecycle.md) continuam vigentes. As issues explicitam idempotência, concorrência, autorização, auditoria e prova em Preview. Pontos que exigem atenção:

- A avaliação cega só se publica bilateralmente ou ao terminar a janela de 14 dias; a leitura deriva a publicação conforme DM-9.4, sem depender de cron.
- A denúncia permanece confidencial e não remove o anúncio por si. A remoção revoga imediatamente consultas e mídia públicas, preservando os efeitos financeiros e de contato já autorizados.
- Sanção de publicação não deve se tornar bloqueio global de login por reutilização indevida de `User.status`. Contestação revisada permite nova publicação, sem restaurar automaticamente conteúdo removido.
- Os prazos e sua classe original são mensuráveis pela auditoria; o sistema não decide denúncias automaticamente pelo vencimento.

## Fase 5 — hardening e operação comercial

Todas as entregas têm o gate da Fase 4 como dependência para homologação final. A tabela mostra as dependências adicionais.

| ID / issue | Entrega | Dependências adicionais |
| --- | --- | --- |
| F5-001 / [#170](https://github.com/BrunoMNoronha/techlab-troq/issues/170) | Definir métricas e capacidades exigidas no gate da Fase 5 | Preparação independente; homologação após #55 |
| F5-002 / [#171](https://github.com/BrunoMNoronha/techlab-troq/issues/171) | Implementar solicitação de exclusão de conta com efeitos imediatos | Preparação independente; homologação após #55 |
| F5-003 / [#172](https://github.com/BrunoMNoronha/techlab-troq/issues/172) | Implementar retenção, legal hold e expurgo seletivo | [#171](https://github.com/BrunoMNoronha/techlab-troq/issues/171) |
| F5-004 / [#173](https://github.com/BrunoMNoronha/techlab-troq/issues/173) | Reconciliar termos, privacidade e revisão jurídica e contábil | Preparação independente; homologação após #55 |
| F5-005 / [#174](https://github.com/BrunoMNoronha/techlab-troq/issues/174) | Executar revisão final de segurança do MVP | [#169](https://github.com/BrunoMNoronha/techlab-troq/issues/169), [#171](https://github.com/BrunoMNoronha/techlab-troq/issues/171), [#172](https://github.com/BrunoMNoronha/techlab-troq/issues/172) |
| F5-006 / [#175](https://github.com/BrunoMNoronha/techlab-troq/issues/175) | Atingir desempenho mobile e acessibilidade definidos | [#170](https://github.com/BrunoMNoronha/techlab-troq/issues/170), [#169](https://github.com/BrunoMNoronha/techlab-troq/issues/169) |
| F5-007 / [#176](https://github.com/BrunoMNoronha/techlab-troq/issues/176) | Implementar e verificar capacidades mínimas de PWA | [#170](https://github.com/BrunoMNoronha/techlab-troq/issues/170) |
| F5-008 / [#177](https://github.com/BrunoMNoronha/techlab-troq/issues/177) | Verificar auditoria, observabilidade e disponibilidade operacional | [#169](https://github.com/BrunoMNoronha/techlab-troq/issues/169), [#170](https://github.com/BrunoMNoronha/techlab-troq/issues/170), [#172](https://github.com/BrunoMNoronha/techlab-troq/issues/172) |
| F5-009 / [#178](https://github.com/BrunoMNoronha/techlab-troq/issues/178) | Validar recuperação, custos e checklist de operação comercial | [#170](https://github.com/BrunoMNoronha/techlab-troq/issues/170), [#172](https://github.com/BrunoMNoronha/techlab-troq/issues/172), [#173](https://github.com/BrunoMNoronha/techlab-troq/issues/173) |
| F5-010 / [#179](https://github.com/BrunoMNoronha/techlab-troq/issues/179) | Homologar gate comercial e conferir a release final | #105, [#169](https://github.com/BrunoMNoronha/techlab-troq/issues/169), [#170](https://github.com/BrunoMNoronha/techlab-troq/issues/170), [#171](https://github.com/BrunoMNoronha/techlab-troq/issues/171), [#172](https://github.com/BrunoMNoronha/techlab-troq/issues/172), [#173](https://github.com/BrunoMNoronha/techlab-troq/issues/173), [#174](https://github.com/BrunoMNoronha/techlab-troq/issues/174), [#175](https://github.com/BrunoMNoronha/techlab-troq/issues/175), [#176](https://github.com/BrunoMNoronha/techlab-troq/issues/176), [#177](https://github.com/BrunoMNoronha/techlab-troq/issues/177), [#178](https://github.com/BrunoMNoronha/techlab-troq/issues/178) |

Métricas (#170), desenho da exclusão (#171) e revisão das páginas/políticas (#173) podem ser preparados em paralelo à Fase 4. A implementação deve revalidar os contratos integrados antes de homologar. Exclusão imediata vem antes do expurgo (#171 → #172); #170 fixa os critérios antes de otimizar ou implementar PWA (#175 e #176). Segurança (#174), observabilidade (#177) e recuperação/custos (#178) convergem na homologação comercial #179.

[#173](https://github.com/BrunoMNoronha/techlab-troq/issues/173) inclui a divergência concreta entre a política pública, que atribui o nome ao Google, e o contrato atual, que usa apenas `openid` e `email` e pede o nome no TROQS. A correção precisa corresponder ao comportamento verificado.

A retenção segue [data-retention-policy.md](../product/data-retention-policy.md), com efeitos imediatos na exclusão, expurgo seletivo, legal hold mínimo e reaplicação de exclusões após restore. Os períodos financeiros precisam da revisão jurídica e contábil prevista; a publicação da política não substitui essa revisão. Nenhum expurgo de dados reais de Production, pagamento real ou contratação de plano está autorizado por esta decomposição.

## Decisões e validação

Continuam **TBD**: responsáveis, datas, prioridades, valores e protocolo das metas de desempenho/acessibilidade/disponibilidade (#170), RPO/RTO e orçamento (#178), responsáveis pela revisão jurídica/contábil (#173) e aprovação da operação comercial (#179). As issues indicam onde cada decisão deve ser registrada antes da homologação.

Cada entrega usa `pnpm`, segue a [revisão reforçada](../engineering/ai-agent-workflow.md) quando trata de autorização, pagamentos ou dados e registra testes relevantes com banco real para concorrência. A evidência de Preview identifica SHA, deployment, jornada e resultado, sem dados pessoais ou segredos.

PRs parciais usam `Refs #55` ou `Refs #56`. Somente a homologação completa de #169 pode encerrar #55. #179 confere a release efetiva e só encerra #56 e [#130](https://github.com/BrunoMNoronha/techlab-troq/issues/130) depois de todos os critérios e autorizações. A release operacional já comprovada em #135 é reaproveitada e verificada; não é recriada como tarefa pendente.

## Fontes

[Roadmap](roadmap.md), [requisitos](../product/requirements.md), [modelo de dados](../architecture/data-model.md), [retenção](../product/data-retention-policy.md), [notificações](../product/transactional-emails.md), [riscos](risks.md) e critérios detalhados das issues vinculadas acima.
