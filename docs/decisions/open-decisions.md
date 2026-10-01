# Decisões abertas

Registro das questões que **ainda não foram decididas** (criado na Fase 0; reaberto com OD-13 a OD-16 na Fase 3). Nenhum item desta lista deve ser tratado como homologado. Uma decisão aberta só é fechada quando um documento próprio (ADR ou documento de produto) a registrar e este arquivo for atualizado.

## Como distinguir decisão aberta de decisão vigente

| | Onde está registrada | Pode ser assumida na implementação? |
| --- | --- | --- |
| Decisão vigente | [../project-state.md](../project-state.md), ADRs em [../adr/](../adr/), [../product/business-rules.md](../product/business-rules.md) | Sim |
| Decisão aberta | Este documento | Não; a implementação dependente deve aguardar o fechamento |

## Lista de decisões abertas

**Quatro decisões abertas desde 2026-10-01**: OD-13 a OD-15, registradas por F3-001 ([#91](https://github.com/BrunoMNoronha/techlab-troq/issues/91)) a partir do inventário de [../delivery/phase-3-plan.md](../delivery/phase-3-plan.md), e OD-16, registrada por F3-004 ([#94](https://github.com/BrunoMNoronha/techlab-troq/issues/94)). Nenhuma delas reabre decisão vigente: cada uma é uma questão que as fontes atuais não respondem e que muda o que a Fase 3 implementa ou como o seu gate é provado. Todas são do Bruno.

### OD-13 — Contato do anunciante como pré-condição

- **Contexto:** RB-001 libera o contato do anunciante ao escolhido com pagamento aprovado. Nada impede hoje que um anúncio seja publicado, receba solicitações pagas e tenha um escolhido sem que o anunciante tenha cadastrado contato (`UserContact`, [../architecture/data-model.md](../architecture/data-model.md), DM-4.1). O escolhido pagaria R$ 0,99 e não receberia nada. RB-004 diz que a cobrança é definitiva quando o solicitante **não** é escolhido; não trata o escolhido sem contato a receber.
- **O que falta decidir:** se o contato cadastrado é pré-condição e de quê — publicar (T1) e reativar (T4), aceitar nova solicitação, escolher, ou combinação —, e o que acontece com anúncios já publicados sem contato.
- **Recomendação (F3-000):** exigir contato cadastrado, no servidor, antes de aceitar nova solicitação no anúncio, e orientar o anunciante no painel. Isso protege o solicitante sem mudar a máquina de estados do anúncio. Se preferir exigir na publicação, a regra entra em T1/T4 de [../product/listing-lifecycle.md](../product/listing-lifecycle.md).
- **Bloqueia:** a parte de pré-condição de [#92](https://github.com/BrunoMNoronha/techlab-troq/issues/92) (F3-002); o cadastro do contato não depende dela.

### OD-14 — Limite de reservas não pagas por conta

- **Contexto:** a reserva ocupa uma das três vagas por 30 minutos sem pagamento (RF-010, [../architecture/payments-design.md](../architecture/payments-design.md), PD-3.1). Uma mesma conta pode ocupar as três vagas, deixá-las expirar e repetir, impedindo que outros solicitem. [../architecture/data-model.md](../architecture/data-model.md), DM-6.11, registra que nenhuma decisão vigente restringe solicitações por solicitante e que criar a restrição seria inventar requisito.
- **O que falta decidir:** se existe limite e qual — por exemplo, no máximo uma reserva `reserved` ativa por conta em cada anúncio, um teto de reservas expiradas por período, ou nenhum.
- **Recomendação (F3-000):** no máximo uma reserva `reserved` ativa por conta em cada anúncio, verificada sob a trava do anúncio (DM-6.12). Não altera RB-003 nem o limite de três pagas.
- **Bloqueia:** a regra de limite em [#93](https://github.com/BrunoMNoronha/techlab-troq/issues/93) (F3-003). Sem decisão, #93 implementa DM-6.11 como está e o risco fica registrado.

### OD-15 — Critério de prova da Fase 3 sem agendamento

- **Contexto:** a reconciliação de pagamentos tem cadência de 5 minutos (PD-3.4). [../adr/0006-async-work-scheduling-concurrency.md](../adr/0006-async-work-scheduling-concurrency.md) registra que o Hobby limita o cron a uma execução diária (V-4), que o cron só dispara no deployment de **produção** (V-5) e, na decisão 11, que "qualquer ambiente em que se pretenda exercitar o fluxo de pagamento de ponta a ponta precisa de plano que permita a cadência real". Em `preview` não há cron em plano nenhum. A Fase 2 provou os trabalhos de mídia por invocação autenticada com `CRON_SECRET`, e o plano pago já está rastreado em [#56](https://github.com/BrunoMNoronha/techlab-troq/issues/56) (R-09).
- **O que falta decidir:** se o gate da Fase 3 aceita a convergência provada por invocação autenticada dos trabalhos em `preview`, mais os testes T-5 e T-18 sobre banco real, deixando o plano pago para a preparação de produção, ou se o plano pago é contratado agora.
- **Recomendação (F3-000):** aceitar a invocação autenticada para o gate da Fase 3. A cadência real só existe em produção, de modo que contratar o plano agora não tornaria o `preview` agendado. Isso não enfraquece PD-3.4 nem dispensa o plano pago antes do lançamento.
- **Bloqueia:** a homologação de [#102](https://github.com/BrunoMNoronha/techlab-troq/issues/102) (F3-012) e o gate em [#105](https://github.com/BrunoMNoronha/techlab-troq/issues/105) (F3-015). Não bloqueia a implementação.

### OD-16 — Fonte do instante de acreditação autoritativo

- **Contexto:** a tempestividade do pagamento compara o **instante de acreditação autoritativo** com o fim da reserva (PE-4.1, PE-4.2; CI-4; [../architecture/data-model.md](../architecture/data-model.md), DM-7.5; [../architecture/payments-design.md](../architecture/payments-design.md), PD-6.6 passo 4). F3-004 ([#94](https://github.com/BrunoMNoronha/techlab-troq/issues/94)) verificou em 2026-10-01 que a **Orders API não documenta** esse instante no pagamento da order: os tipos do SDK oficial trazem `created_date` e `last_updated_date` da order e `date_of_expiration` do pagamento, mas não `date_approved`, que pertence à **Payments API**. [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), decisão 3, exige ADR própria para usar a Payments API como superfície principal. `last_updated_date` não serve, porque muda em qualquer atualização posterior. O adaptador hoje devolve o instante como indisponível e não adivinha campo.
- **O que falta decidir:** de onde vem o instante autoritativo. Opções identificadas:
  1. ADR complementar que autorize **ler** `GET /v1/payments/{id}` apenas para obter `date_approved`, mantendo a Orders API como superfície principal. Depende de confirmar com credencial de teste (PX-2) que o identificador do pagamento da order é consultável ali; o spike já leu `GET /v1/payments/{id}` com credencial de teste para obter tarifas;
  2. confirmar com PX-2 se `GET /v1/orders/{id}` devolve, na prática, um campo de aprovação não documentado — opção frágil, porque dependeria de comportamento fora do contrato;
  3. usar como cota superior o primeiro instante em que o TROQ **observou** a acreditação. Isso prova a tempestividade quando a observação ocorre dentro da janela, mas transforma em exceção técnica a acreditação tempestiva reconhecida tarde (T-6), o que **altera o efeito de PE-4.2** e por isso exige decisão de negócio.
- **Recomendação (F3-004):** opção 1, validada com PX-2 antes de F3-006. A opção 3 só como regime provisório, se o Bruno aceitar o efeito sobre PE-4.2.
- **Bloqueia:** a verificação de tempestividade da confirmação em [#96](https://github.com/BrunoMNoronha/techlab-troq/issues/96) (F3-006) e, por consequência, T-5 a T-8. Não bloqueia F3-005 nem o adaptador.

**Fora desta lista, por ser configuração e não decisão de produto ou de arquitetura:** o alvo do webhook do Mercado Pago em `preview` (DP-4 de F3-000), registrado como pré-requisito pendente em [../engineering/environments.md](../engineering/environments.md), seção 5.6.

**Registro anterior (2026-09-14 a 2026-09-30):** nenhuma decisão aberta. OD-07 era a última. Foi fechada em **2026-09-14** por [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037), na execução de F0-019, depois que F0-010 concluiu a validação técnica do gateway e F0-011 fechou OD-08 com [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036).

A arquitetura pré-implementação (F0-022) foi **concluída** em 2026-09-14, em [../architecture/overview.md](../architecture/overview.md), [../architecture/data-model.md](../architecture/data-model.md), [../architecture/payments-design.md](../architecture/payments-design.md) e [../architecture/contact-release.md](../architecture/contact-release.md). A decisão arquitetural que F0-022 precisou tomar foi registrada como DEC-038 em [../adr/0006-async-work-scheduling-concurrency.md](../adr/0006-async-work-scheduling-concurrency.md), e não reabriu nenhuma questão de produto.

A **Fase 0 foi encerrada** na mesma data por F0-023, que verificou o gate de saída em [../delivery/phase-1-transition.md](../delivery/phase-1-transition.md) e o declarou **APROVADO**. A ausência de decisão aberta é uma das condições comprovadas nessa verificação (critério G-4), não a sua única causa.

Uma nova questão só entra nesta lista se for efetivamente uma decisão de produto ou de arquitetura ainda não tomada. Detalhe que apenas aguarda design — tempos, mecanismos, schema — **não** é decisão aberta e não deve ser registrado aqui.

## Decisões fechadas

Itens que já constaram desta lista e foram fechados por documento próprio. O ID **não** é reutilizado.

| ID | Tema | Fechada por | Registro |
| --- | --- | --- | --- |
| OD-01 | Mecanismo de encerramento da negociação | [../product/negotiation-lifecycle.md](../product/negotiation-lifecycle.md) | DEC-029 em [decision-log.md](decision-log.md) |
| OD-02 | Regras detalhadas de avaliação | [../product/ratings.md](../product/ratings.md) | DEC-030 em [decision-log.md](decision-log.md) |
| OD-03 | Catálogo/política de itens proibidos | [../product/prohibited-items.md](../product/prohibited-items.md) | DEC-031 em [decision-log.md](decision-log.md) |
| OD-04 | Ciclo de vida completo do anúncio | [../product/listing-lifecycle.md](../product/listing-lifecycle.md) | DEC-027 em [decision-log.md](decision-log.md) |
| OD-05 | Quantidade e regras das imagens | [../product/image-policy.md](../product/image-policy.md) | DEC-028 em [decision-log.md](decision-log.md) |
| OD-06 | Política de desistência e reseleção | [../product/reselection-policy.md](../product/reselection-policy.md) | DEC-032 em [decision-log.md](decision-log.md) |
| OD-07 | Duplicidade, pagamento após a expiração da reserva, falhas de confirmação, reembolso técnico e reversões | [../product/payment-exceptions.md](../product/payment-exceptions.md) | DEC-037 em [decision-log.md](decision-log.md) |
| OD-08 | Validação e escolha do gateway para R$ 0,99 | [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) | DEC-036 em [decision-log.md](decision-log.md) |
| OD-09 | ORM e estratégia de migrations | [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md) | DEC-026 em [decision-log.md](decision-log.md) |
| OD-10 | Retenção e exclusão de dados | [../product/data-retention-policy.md](../product/data-retention-policy.md) | DEC-033 em [decision-log.md](decision-log.md) |
| OD-11 | Elegibilidade etária formal | [../product/age-eligibility.md](../product/age-eligibility.md) | DEC-034 em [decision-log.md](decision-log.md) |
| OD-12 | Natureza da demonstração de interesse | [../product/interest-flow.md](../product/interest-flow.md) | DEC-035 em [decision-log.md](decision-log.md) |

## Itens explicitamente fora desta lista

Já decididos e registrados como vigentes: arquitetura, stack, banco, deploy, autenticação inicial, armazenamento de imagens, email transacional, o **gateway de pagamento Pix inicial homologado** ([../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), DEC-036), a recomendação de reserva atômica de vaga, o ORM/estratégia de migrations, o ciclo de vida do anúncio, a política de imagens do anúncio, o ciclo de vida e encerramento da negociação, a política de avaliações, a política de itens proibidos, denúncia, moderação e remoção, a política de desistência e reseleção, a política de retenção e exclusão de dados, a elegibilidade etária de 18 anos completos ou mais, a natureza da demonstração de interesse e as **exceções de pagamento** ([../product/payment-exceptions.md](../product/payment-exceptions.md), DEC-037). Ver [../project-state.md](../project-state.md).
