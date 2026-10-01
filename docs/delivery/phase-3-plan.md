# Plano de execução da Fase 3 — solicitações, pagamentos e contato

Documento produzido por **F3-000** em 2026-10-01, sobre `main` em `2a50712`. Decompõe a Fase 3 ([roadmap.md](roadmap.md)) em issues executoras e registra o desvio entre os contratos da fase e o código entregue pela Fase 2. Acompanhamento em [#54](https://github.com/BrunoMNoronha/techlab-troq/issues/54).

**Esta entrega é planejamento.** Não altera código, schema, migration, contrato de arquitetura, regra de negócio, ambiente nem provedor. A Fase 3 continua **não iniciada**; a próxima entrega era [#91](https://github.com/BrunoMNoronha/techlab-troq/issues/91) (F3-001), concluída em 2026-10-01 (seção 2.1); agora F3-002, F3-003 e F3-004 podem correr em paralelo.

Classificação usada: **CONFIRMADO** (verificado no código ou documento citado), **AMBIGUIDADE** (as fontes admitem mais de uma leitura), **DECISÃO PENDENTE** (escolha do Bruno, não do agente), **RECOMENDAÇÃO** (proposta sem efeito até ser adotada).

## 1. Base

| Item | Valor |
| --- | --- |
| Commit | `2a50712` (`main`), árvore limpa |
| Fontes de contrato | [payments-design.md](../architecture/payments-design.md), [contact-release.md](../architecture/contact-release.md), [data-model.md](../architecture/data-model.md) (seções 4, 6 a 8 e 11), [ADR-0004](../adr/0004-mercado-pago-pix.md), [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md) |
| Fontes de produto | [interest-flow.md](../product/interest-flow.md), [payment-exceptions.md](../product/payment-exceptions.md), [reselection-policy.md](../product/reselection-policy.md), [listing-lifecycle.md](../product/listing-lifecycle.md), [requirements.md](../product/requirements.md) |
| Código conferido | `prisma/schema.prisma` e migration inicial (SQL customizado), `src/modules/{request,payments,contact,negotiation,listing,audit}`, `src/app/api/jobs/`, `next.config.ts`, `.github/workflows/ci.yml` |
| Estado de partida | `payments`, `contact` e `negotiation` são fronteiras vazias; `request/entry.ts` só lê. O schema da Fase 3 (`ContactRequest`, `PaymentAttempt`, `Payment`, `TechnicalRefund`, `PaymentNotification`, `ReconciliationCase`, `Selection`, `Negotiation`, `ContactRelease`, `ContactAccessEvent`, `UserContact`) existe desde `20260914210926_initial_schema`, com o índice único parcial de vagas, o gatilho de imutabilidade de `paid`, o índice de canônico e o de negociação `active` |

## 2. Inventário de desvio

| # | Classificação | Evidência | Achado | Destino |
| --- | --- | --- | --- | --- |
| DV-1 | CONFIRMADO | `UserContact` só aparece em código gerado e testes; [contact-release.md](../architecture/contact-release.md), CR-2.2 | Nenhum fluxo cadastra o contato do anunciante. Sem ele, o escolhido pagaria e não teria o que receber | F3-002; DP-1 |
| DV-2 | CONFIRMADO | `src/modules/listing/lifecycle.ts` não toca `contact_requests`; DM-6.10; [listing-lifecycle.md](../product/listing-lifecycle.md), seção 5 | T5/T6 ainda não encerram reservas `reserved` nem liberam a vaga, e a order Pix dessas reservas continuaria pagável | F3-003 (efeito), F3-007 (cancelamento) |
| DV-3 | AMBIGUIDADE | [listing-lifecycle.md](../product/listing-lifecycle.md), seção 5 (T3: "não avançam enquanto pausado"); PD-6.6, passo 4; PD-8.8 | A confirmação de PD-6.6 não olha o estado do anúncio, e o Pix emitido segue pagável durante a pausa. Não está dito se pagamento tempestivo durante a pausa confirma, é exceção técnica ou se a pausa encerra a reserva | F3-001; se as fontes não resolverem, DP-2 |
| DV-4 | CONFIRMADO | `ContactAccessEvent` no schema: `contactReleaseId`, `actorId`, `accessedAt`; CR-5.5 | O contrato pede ator, negociação, instante, **resultado** e registro das negativas; o schema não tem resultado e uma negativa por A3 não tem liberação a referenciar | F3-001 (decisão técnica), F3-010 |
| DV-5 | AMBIGUIDADE | PD-2.4, PD-6.2; `PaymentNotification` só guarda notificação validada | Não está definido onde fica o "registro mínimo de segurança" da notificação rejeitada | F3-001, F3-006 |
| DV-6 | CONFIRMADO | DM-6.3, DM-6.5; `lifecycle.ts:11` e `media/upload.ts` usam `SELECT … FOR UPDATE` na linha do anúncio | O contrato fala em "trava de escopo de transação do anúncio" sem nomear o mecanismo. A trava de linha da Fase 2 é de escopo de transação e serve; reserva, confirmação e T5/T6 precisam adquirir **a mesma** trava | F3-001, F3-003, F3-006 |
| DV-7 | CONFIRMADO | `lifecycle.ts:224-226`; `@default(now())` e `@updatedAt` do Prisma são preenchidos no cliente | Janela, expiração no ato da alocação e tempestividade precisam do `now()` do banco dentro da transação | F3-001, F3-003, F3-006 |
| DV-8 | CONFIRMADO | PD-10.3; jobs de mídia usam lease por `due_at` (F2-009) | Os trabalhos de pagamento seguem `FOR UPDATE SKIP LOCKED` em lotes, e não o padrão da mídia | F3-001, F3-008 |
| DV-9 | CONFIRMADO | Não há `vercel.json`; [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md), V-4, V-5 e decisão 11; [media-pipeline-contract.md](../architecture/media-pipeline-contract.md), 21.4 | Cron só roda no deployment de produção; no Hobby, uma vez por dia. Em `preview` não há cron em plano nenhum: as provas usam invocação autenticada, como em F2-008/F2-009. O plano pago já está rastreado em [#56](https://github.com/BrunoMNoronha/techlab-troq/issues/56) | F3-008, F3-011, F3-015; DP-3 |
| DV-10 | CONFIRMADO | [environments.md](../engineering/environments.md), 5.6; ADR-0004, decisão 11; prova de F2-010/F2-013 (acesso anônimo ao `preview` exige `_vercel_jwt`) | A URL de webhook é **uma por aplicação**, configurada no painel. Os deployments de `preview` têm URL por branch e estão sob a proteção da Vercel, que barraria o `POST` do Mercado Pago | F3-012; DP-4, PX-3 |
| DV-11 | CONFIRMADO | [environments.md](../engineering/environments.md), 5.6 (`previsto`) | `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET` não têm consumidor nem valor em nenhum ambiente | F3-004; PX-2 |
| DV-12 | CONFIRMADO | ADR-0004, decisão 8 ("identificar a aplicação"); [spike F0-010](spikes/f0-010-mercado-pago-pix-r099.md) | PD-6.1, passo 1, não explicita a conferência do `application_id` antes do HMAC, que o spike mostrou necessária (chaves por aplicação não são intercambiáveis) | F3-001, F3-004 |
| DV-13 | AMBIGUIDADE | `User` não tem papel de moderação; moderação é Fase 4 ([#55](https://github.com/BrunoMNoronha/techlab-troq/issues/55)); C-5 | C-5 ("moderador tenta acessar") não pode ser exercitado com moderador real na Fase 3 | F3-001, F3-010 |
| DV-14 | DECISÃO PENDENTE | DM-6.11; nenhum documento trata reserva não paga em série | Uma mesma conta pode reservar as três vagas por 30 minutos, repetidamente, e travar o anúncio sem pagar. DM-6.11 proíbe inventar a restrição | DP-5; F3-003 |
| DV-15 | CONFIRMADO | CR-7.2; `next.config.ts` sem `cacheComponents`; Next.js 16.3.5 | O contrato descreve "rota dinâmica, sem cache" em termos genéricos; o mecanismo concreto precisa ser fixado a partir de `node_modules/next/dist/docs/`, reaproveitando o `no-store` da rota `/media` | F3-001, F3-010 |
| DV-16 | CONFIRMADO | [requirements.md](../product/requirements.md), RF-021 (`parcialmente definido`) | Não há catálogo de e-mails da Fase 3 | F3-013 |
| DV-17 | CONFIRMADO | `src/modules/request/entry.ts:40-44` | A entrada já recusa o dono (`own_listing`), coerente com o CHECK `owner_id <> chosen_id`; `request_unavailable` é o ponto de ligação da jornada | F3-012 |
| DV-18 | CONFIRMADO | [risks.md](risks.md), R-07; `.github/workflows/ci.yml` | O job `Integração (PostgreSQL efêmero)`, que executa T-1, T-2 e T-18, ainda não é required check | PX-1 |
| DV-19 | CONFIRMADO | `UserContact.phoneNumber` é texto livre no schema | Formato, normalização e o que a escrita devolve ao dono não estão definidos (CR-2.2: "confirmação, nunca o valor") | F3-001, F3-002 |

Nenhum item exige alterar RB-001 a RB-006, DEC-027 a DEC-038 ou as ADRs. As correções de contrato ficam para F3-001; esta entrega não as aplica.

### 2.1 Desfechos de F3-001 (2026-10-01)

[#91](https://github.com/BrunoMNoronha/techlab-troq/issues/91) encerrou os itens que lhe cabiam. Nenhuma regra de negócio, decisão registrada ou teste de contrato foi alterado, e **nenhuma migration** se mostrou necessária.

| # | Desfecho | Classificação | Onde ficou | Issue afetada |
| --- | --- | --- | --- | --- |
| DV-2 | DM-6.10 já cobria o encerramento das reservas em T5 a T9. Faltava o destino da order ainda pagável: cancelamento por PD-8.3, fora da transação do ciclo de vida, com RT-3 se a acreditação ocorrer mesmo assim | DECISÃO TÉCNICA (mecanismo, por PE-4.5) | [payments-design.md](../architecture/payments-design.md), PD-8.10 | #93, #97 |
| DV-3 | Resolvido pelas fontes: a pausa recusa nova reserva, nova cobrança e reapresentação do QR, mas a acreditação tempestiva de reserva viva é confirmada e consome a vaga. A leitura oposta deixaria dinheiro retido sem hipótese de reembolso (PE-7.2, PE-12.2). Por isso **DP-2 não foi aberta** | CONFIRMADO | PD-6.11 | #93, #95, #96 |
| DV-4 | `ContactAccessEvent` só registra entregas efetivas; as negativas vão para `AuditEvent`. Sem migration | DECISÃO TÉCNICA | [data-model.md](../architecture/data-model.md), notas de DM-4.4 e DM-11.3; [contact-release.md](../architecture/contact-release.md), nota de CR-5.5 | #100 |
| DV-5 | DM-11.1 já previa a "rejeição de notificação por autenticidade" na trilha: evento `AuditEvent` mínimo, sem assinatura nem corpo | CONFIRMADO | Nota de PD-6.2; nota de DM-11.3 | #96, #103, #104 |
| DV-6 | A trava do anúncio é a de linha (`FOR UPDATE`), e não `pg_advisory_xact_lock` como dizia DM-6.3: duas travas diferentes não serializariam alocação e encerramento | DECISÃO TÉCNICA | DM-6.3, DM-6.12; PD-4.6 | #93, #96, #99 |
| DV-7 | Relógio do banco (`now()` da transação) para janela, expiração e tempestividade | DECISÃO TÉCNICA | DM-6.12, PD-4.6 | #93, #96 |
| DV-8 | Trabalhos de pagamento com `FOR UPDATE SKIP LOCKED`, diferentes do lease da mídia | CONFIRMADO | PD-10.7 | #98, #101 |
| DV-9 | Sem cron; critério de prova | DECISÃO (2026-10-01) | OD-15 fechada por **DEC-042** (seção 5.1) | #98, #101, #102, #105 |
| DV-12 | Conferir a aplicação antes do HMAC; o simulador é rejeitado quando `data.id` tem maiúsculas | DECISÃO TÉCNICA | PD-6.10 | #94, #96 |
| DV-13 | C-5 provado por ator autenticado sem relação com a negociação, com reexecução por moderador real na Fase 4 | DECISÃO TÉCNICA | Nota da seção 10 de contact-release | #100, #55 |
| DV-14 | Limite de reservas não pagas | DECISÃO (2026-10-01) | OD-14 fechada por **DEC-041** ([../product/reservation-limit.md](../product/reservation-limit.md)): uma reserva viva por conta em cada anúncio | #93 |
| DV-15 | `force-dynamic`, `runtime = 'nodejs'`, sem `revalidate`, `Cache-Control: private, no-store` explícito em route handler, sem `unstable_cache`/`'use cache'` | DECISÃO TÉCNICA | CR-7.4 | #100 |
| DV-19 | E.164 brasileiro normalizado no servidor; a escrita devolve só confirmação e a interface não exibe dígitos | DECISÃO TÉCNICA | DM-4.5, CR-2.5 | #92 |
| DV-1 | Contato como pré-condição | DECISÃO (2026-10-01) | OD-13 fechada por **DEC-040** ([../product/advertiser-contact.md](../product/advertiser-contact.md)): exigido antes de aceitar nova solicitação, não na publicação | #92 |

## 3. Decisões pendentes e pré-requisitos externos

**Decisões do Bruno.** Nenhuma foi tomada por esta entrega. _Atualização de F3-001 (2026-10-01):_ DP-1, DP-5 e DP-3 foram registradas em [../decisions/open-decisions.md](../decisions/open-decisions.md) como **OD-13**, **OD-14** e **OD-15**. DP-2 **não** foi aberta, porque as fontes resolvem a questão (PD-6.11). DP-4 é configuração e foi registrada como pré-requisito em [../engineering/environments.md](../engineering/environments.md), seção 5.6.

| # | Decisão | Por que é do Bruno | Efeito sobre as issues | Recomendação |
| --- | --- | --- | --- | --- |
| DP-1 | Exigir contato cadastrado antes de publicar (T1/T4) ou antes de aceitar solicitação | Acrescenta pré-condição de negócio ao ciclo de vida | F3-002 aplica a pré-condição; sem decisão, F3-002 entrega só o cadastro | Exigir antes de aceitar nova solicitação, no servidor, e orientar o anunciante no painel |
| DP-2 | Efeito da pausa sobre reserva com Pix já emitido (só se F3-001 não resolver DV-3 pelas fontes) | Pode gerar ou evitar reembolso e consumo de vaga | F3-003, F3-006, F3-007 | — (F3-001 tenta resolver primeiro) |
| DP-3 | Critério de prova da Fase 3 sem cron: aceitar convergência por invocação autenticada em `preview` e manter o plano pago em #56, ou contratar o plano agora | Custo recorrente (R-09) e leitura de ADR-0006, decisão 11 ("qualquer ambiente em que se pretenda exercitar o fluxo de pagamento de ponta a ponta") | F3-008, F3-011, F3-012, F3-015 | Aceitar a invocação autenticada para o gate da Fase 3: em `preview` não há cron em plano nenhum (V-5)  **Decidida em 2026-10-01: DEC-042 (seção 5.1).** |
| DP-4 | Alvo do webhook do Mercado Pago em `preview`: URL estável e como atravessar a proteção da Vercel | Configuração em painel externo e exposição de endpoint | F3-012 | Alias estável de `preview` com *Protection Bypass for Automation* ou projeto de validação dedicado, como no F0-010; avaliar o risco de segredo em URL antes de escolher |
| DP-5 | Limite de reservas não pagas por conta (por anúncio e por tempo) | Nova regra de produto (DM-6.11) | F3-003 | No máximo uma reserva `reserved` ativa por conta em cada anúncio  **Decidida em 2026-10-01: DEC-041.** |

**Pré-requisitos externos.**

| # | Pré-requisito | Responsável | Necessário para |
| --- | --- | --- | --- |
| PX-1 | Tornar `Integração (PostgreSQL efêmero)` required check em `main` | Bruno (configuração do repositório) | Recomendado antes do merge de F3-003 |
| PX-2 | Credencial de **teste** do Mercado Pago e aplicação de teste com chave de webhook, cadastradas em `development` e `preview` | Bruno (painel); agente registra em `environments.md` | F3-012 (obrigatório); suíte opcional de F3-004  A Orders API não aceita `TEST-`: são as credenciais `APP_USR` de uma aplicação de usuário de teste vendedor ([../engineering/environments.md](../engineering/environments.md), seção 5.6). Também valida OD-16 antes de F3-006 completa. |
| PX-3 | URL de webhook alcançável no `preview` configurada no painel (depois de DP-4) | Bruno | F3-012 |

## 4. Issues executoras

| ID | Issue | Entrega | Dependências | Testes do contrato | Prova | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| F3-001 | [#91](https://github.com/BrunoMNoronha/techlab-troq/issues/91) | Reconciliar os contratos da Fase 3 com o código da Fase 2 | — | — | Documental | concluído (2026-10-01, seção 2.1) |
| F3-002 | [#92](https://github.com/BrunoMNoronha/techlab-troq/issues/92) | Cadastrar e proteger o contato do anunciante | #91; OD-13 (só a pré-condição) | C-1 | PostgreSQL efêmero + HTTP | concluído (2026-10-01; OD-13 fechada por DEC-040) |
| F3-003 | [#93](https://github.com/BrunoMNoronha/techlab-troq/issues/93) | Solicitação com reserva atômica e limite de três | #91; OD-14 (só o limite; fechada por DEC-041 e aplicada em 2026-10-01) | T-1 | PostgreSQL efêmero, concorrente | concluído (2026-10-01; limite de OD-14 pendente) |
| F3-004 | [#94](https://github.com/BrunoMNoronha/techlab-troq/issues/94) | Adaptador do Mercado Pago | #91; PX-2 (opcional) | Contrato do adaptador | Simulado; sandbox opcional | concluído (2026-10-01; abriu OD-16) |
| F3-005 | [#95](https://github.com/BrunoMNoronha/techlab-troq/issues/95) | Cobrança Pix de R$ 0,99 | #93, #94 | T-15 | PostgreSQL efêmero + simulado | concluído (2026-10-01) |
| F3-006 | [#96](https://github.com/BrunoMNoronha/techlab-troq/issues/96) | Webhook e confirmação autoritativa | #95; OD-16 | T-2, T-3, T-4, T-6, T-10, T-11, T-12, T-13, T-14 | PostgreSQL efêmero + HTTP | bloqueado |
| F3-007 | [#97](https://github.com/BrunoMNoronha/techlab-troq/issues/97) | Duplicidade, fora da janela e reembolso técnico | #96 | T-7, T-8, T-9, T-16 | PostgreSQL efêmero + simulado | bloqueado |
| F3-008 | [#98](https://github.com/BrunoMNoronha/techlab-troq/issues/98) | Reconciliação periódica e retentativa de reembolso | #97 | T-5, T-18 | PostgreSQL efêmero; `preview` por invocação | bloqueado |
| F3-009 | [#99](https://github.com/BrunoMNoronha/techlab-troq/issues/99) | Escolha, negociação e autorização | #92, #96 | C-9 | PostgreSQL efêmero, concorrente | bloqueado |
| F3-010 | [#100](https://github.com/BrunoMNoronha/techlab-troq/issues/100) | Entrega do contato ao escolhido | #99 | C-2 a C-7, C-11 | PostgreSQL efêmero + HTTP + componentes | bloqueado |
| F3-011 | [#101](https://github.com/BrunoMNoronha/techlab-troq/issues/101) | Reversões e seus efeitos | #98, #100 | T-17, C-10 | PostgreSQL efêmero; `preview` por invocação | bloqueado |
| F3-012 | [#102](https://github.com/BrunoMNoronha/techlab-troq/issues/102) | Jornada de interface e homologação em `preview` | #98, #100; PX-2, PX-3, OD-15, DP-4 | — | `preview` + sandbox do Mercado Pago | bloqueado |
| F3-013 | [#103](https://github.com/BrunoMNoronha/techlab-troq/issues/103) | E-mails transacionais e observabilidade | #96, #99 | — | Simulado + Sentry de `preview` | bloqueado |
| F3-014 | [#104](https://github.com/BrunoMNoronha/techlab-troq/issues/104) | Verificação de segurança e revisão reforçada | #101, #102, #103 | C-8 (e reexecução de todos) | PostgreSQL efêmero + `preview` | bloqueado |
| F3-015 | [#105](https://github.com/BrunoMNoronha/techlab-troq/issues/105) | Gate de saída da Fase 3 | #104; OD-15; RECOMENDAÇÃO #86 | — | Auditoria por SHA | bloqueado |

**Ordem por dependência.** O grafo é acíclico: toda dependência aponta para uma issue de número menor.

1. F3-001.
2. Em paralelo: F3-002, F3-003 e F3-004.
3. F3-005 (depois de F3-003 e F3-004), seguida de F3-006.
4. Em paralelo, depois de F3-006: a cadeia de pagamento F3-007 → F3-008 e a cadeia de contato F3-009 (que também exige F3-002) → F3-010. F3-013 entra quando F3-006 e F3-009 estiverem prontas.
5. F3-011 (depois de F3-008 e F3-010) e F3-012 (depois de F3-008 e F3-010, mais os pré-requisitos externos).
6. F3-014 (depois de F3-011, F3-012 e F3-013) e, por fim, F3-015.

## 5. Rastreabilidade do gate

Cada teste do contrato pertence a exatamente uma issue executora; F3-014 reexecuta todos no mesmo SHA, e F3-015 audita.

| Teste | Issue | Teste | Issue |
| --- | --- | --- | --- |
| T-1 | #93 (F3-003) | T-13 | #96 (F3-006) |
| T-2 | #96 (F3-006) | T-14 | #96 (F3-006) |
| T-3 | #96 (F3-006) | T-15 | #95 (F3-005) |
| T-4 | #96 (F3-006) | T-16 | #97 (F3-007) |
| T-5 | #98 (F3-008) | T-17 | #101 (F3-011) |
| T-6 | #96 (F3-006) | T-18 | #98 (F3-008) |
| T-7 | #97 (F3-007) | C-1 | #92 (F3-002) |
| T-8 | #97 (F3-007) | C-2 a C-7 | #100 (F3-010) |
| T-9 | #97 (F3-007) | C-8 | #104 (F3-014) |
| T-10 | #96 (F3-006) | C-9 | #99 (F3-009) |
| T-11 | #96 (F3-006) | C-10 | #101 (F3-011) |
| T-12 | #96 (F3-006) | C-11 | #100 (F3-010) |

| Item do gate ([roadmap.md](roadmap.md)) | Onde é produzido |
| --- | --- |
| Concorrência: nunca mais de 3 pagas por anúncio | T-1 (#93), T-2 (#96), T-18 (#98) |
| Contratos PD-13 e de contato (seção 10) sobre banco real | Issues da tabela acima; reexecução em #104 |
| Webhook duplicado, fora de ordem e atrasado; pagamento fora da janela sem vaga | T-3, T-4, T-6 (#96); T-7 (#97) |
| Liberação só sob RB-001, com auditoria | #99, #100, C-6 |
| Revisão reforçada de pagamentos, autorização e dados | #104 |

| Entregável do roadmap | Issue |
| --- | --- |
| Interesse e solicitação (RF-008, RF-009) | #93, #102 |
| Reserva atômica e limite de 3 (RF-010, RNF-016) | #93 |
| Cobrança de R$ 0,99 (RF-011) | #94, #95 |
| Webhooks, idempotência, reconciliação e exceções (RF-012, DEC-037) | #96, #97, #98, #101 |
| Escolha, desistência e reseleção (RF-013, DEC-032) | #99 |
| Autorização e liberação ao escolhido com auditoria (RF-014, RF-015, RF-022) | #92, #99, #100 |
| Notificações RF-021 e observabilidade | #103 |

### 5.1 Critério de prova sem agendamento (DEC-042, fecha OD-15)

Decisão do Bruno em 2026-10-01. O gate da Fase 3 aceita a convergência dos trabalhos de pagamento — reconciliação e retentativa de reembolso (F3-008), reversões (F3-011) — provada por **invocação autenticada** com `CRON_SECRET` em `preview`, no mesmo padrão dos trabalhos de mídia da Fase 2, mais os testes **T-5** e **T-18** sobre PostgreSQL real. Em `preview` não existe cron em plano nenhum, e no Hobby a cadência de 5 minutos é impossível ([../adr/0006-async-work-scheduling-concurrency.md](../adr/0006-async-work-scheduling-concurrency.md), V-4 e V-5). Por isso o plano pago fica para a preparação de produção, rastreada em [#56](https://github.com/BrunoMNoronha/techlab-troq/issues/56) (R-09). A decisão **não** enfraquece PD-3.4 nem a decisão 11 de ADR-0006: nenhum ambiente de produção opera sem a cadência real.

## 6. Issues abertas fora da fase

| Issue | Relação com o gate da Fase 3 | Justificativa |
| --- | --- | --- |
| [#86](https://github.com/BrunoMNoronha/techlab-troq/issues/86) — contato no título e na descrição | **RECOMENDAÇÃO: condição do gate** (F3-015), não da implementação | Contato escrito no texto público contorna a liberação paga e anula RB-001 na prática (R-03). Pode correr em paralelo desde já. A issue não foi alterada |
| [#59](https://github.com/BrunoMNoronha/techlab-troq/issues/59) — home e entrada da solicitação | **Acompanha** | A entrada já está em `main` (PR #60); a jornada completa é entregue e fechada por F3-012 (#102) |
| [#76](https://github.com/BrunoMNoronha/techlab-troq/issues/76) — três alternativas de troca | Fora do gate | Muda as pré-condições de publicação. Sem conflito com F3-002: DEC-040 não alterou a publicação (`lifecycle.ts`, `validation.ts`) |
| [#89](https://github.com/BrunoMNoronha/techlab-troq/issues/89) — categoria do produto | Fora do gate | Campo novo de anúncio; mesmo ponto de conflito de arquivos que #76 |
| [#90](https://github.com/BrunoMNoronha/techlab-troq/issues/90) — UF em lista | Fora do gate | Validação e formulário de anúncio; sem efeito sobre pagamento ou contato |
| [#81](https://github.com/BrunoMNoronha/techlab-troq/issues/81) — login com Google | Fora do gate | Identidade; a Fase 3 depende apenas da sessão Better Auth existente |
| [#77](https://github.com/BrunoMNoronha/techlab-troq/issues/77) — domínio na Vercel | Fora do gate | Produção (Fase 5). Só toca a Fase 3 se DP-4 escolher um subdomínio próprio para o webhook de `preview` |

## 7. O que esta entrega não faz

Não implementa nenhuma issue, não corrige contratos (isso é F3-001), não cria migration, não configura cron, não provisiona credencial nem webhook, não altera as issues fora da fase e não decide DP-1 a DP-5.
