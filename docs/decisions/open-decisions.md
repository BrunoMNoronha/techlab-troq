# Decisões abertas

Registro das questões que **ainda não foram decididas** (criado na Fase 0; reaberto com OD-13 a OD-16 na Fase 3 e com OD-17 e OD-18 pela frente proposta de troca, em 2026-10-05). Nenhum item desta lista deve ser tratado como homologado. Uma decisão aberta só é fechada quando um documento próprio (ADR ou documento de produto) a registrar e este arquivo for atualizado.

## Como distinguir decisão aberta de decisão vigente

| | Onde está registrada | Pode ser assumida na implementação? |
| --- | --- | --- |
| Decisão vigente | [../project-state.md](../project-state.md), ADRs em [../adr/](../adr/), [../product/business-rules.md](../product/business-rules.md) | Sim |
| Decisão aberta | Este documento | Não; a implementação dependente deve aguardar o fechamento |

## Lista de decisões abertas

Duas decisões abertas, registradas por PT-00 ([#186](https://github.com/BrunoMNoronha/techlab-troq/issues/186)) em 2026-10-05. As duas pertencem à regra de troca **proposta de troca** ([../product/trade-proposal.md](../product/trade-proposal.md), DEC-054) e **não** afetam a solicitação paga.

| ID | Decisão aberta | O que já está decidido | O que falta decidir | O que depende dela |
| --- | --- | --- | --- | --- |
| OD-17 | Preço final da cobrança na proposta de troca | Só o proponente paga, depois do aceite, e a cobrança é definitiva (RB-009). R$ 2,99 é o preço **candidato**, para o spike e o primeiro teste ([#185](https://github.com/BrunoMNoronha/techlab-troq/issues/185), decisão 11) | O valor final. Ele sai da prova de PT-01 ([#187](https://github.com/BrunoMNoronha/techlab-troq/issues/187)) — aceitação do valor e tarifa no sandbox — e do resultado do primeiro teste | A homologação de PT-11 ([#197](https://github.com/BrunoMNoronha/techlab-troq/issues/197)) e a abertura da regra a usuários reais. **Não** bloqueia código: o valor é gravado por fluxo (ADR-0009, decisão 9) |
| OD-18 | Aviso prévio de troca de regra e forma final do consentimento | Cada regra tem o seu texto de Termos e de Privacidade, e o consentimento é gravado no próprio fluxo, ao propor e ao aceitar (#185, decisão 19) | O prazo e o canal do aviso que os Termos 1.0 prometem antes de mudança relevante, e a forma final do consentimento. Dependem da revisão jurídica de [#173](https://github.com/BrunoMNoronha/techlab-troq/issues/173) | Os textos legais de PT-09 ([#195](https://github.com/BrunoMNoronha/techlab-troq/issues/195)) e a homologação de PT-11 |

**Registro anterior (2026-10-01 a 2026-10-05):** nenhuma decisão aberta. OD-13 a OD-16 foram abertas na Fase 3 e fechadas em 2026-10-01 por decisão do Bruno: OD-13 por [../product/advertiser-contact.md](../product/advertiser-contact.md) (DEC-040), OD-14 por [../product/reservation-limit.md](../product/reservation-limit.md) (DEC-041), OD-15 por [../delivery/phase-3-plan.md](../delivery/phase-3-plan.md), seção 5.1 (DEC-042), e OD-16 por [../adr/0008-accreditation-instant-payments-api.md](../adr/0008-accreditation-instant-payments-api.md) (DEC-043), depois da validação no sandbox com a credencial PX-2.

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
| OD-13 | Contato do anunciante como pré-condição | [../product/advertiser-contact.md](../product/advertiser-contact.md) | DEC-040 em [decision-log.md](decision-log.md) |
| OD-14 | Limite de reservas não pagas por conta | [../product/reservation-limit.md](../product/reservation-limit.md) | DEC-041 em [decision-log.md](decision-log.md) |
| OD-15 | Critério de prova da Fase 3 sem agendamento | [../delivery/phase-3-plan.md](../delivery/phase-3-plan.md), seção 5.1 | DEC-042 em [decision-log.md](decision-log.md) |
| OD-16 | Fonte do instante de acreditação autoritativo | [../adr/0008-accreditation-instant-payments-api.md](../adr/0008-accreditation-instant-payments-api.md) | DEC-043 em [decision-log.md](decision-log.md) |

## Itens explicitamente fora desta lista

Já decididos e registrados como vigentes: arquitetura, stack, banco, deploy, autenticação inicial, armazenamento de imagens, email transacional, o **gateway de pagamento Pix inicial homologado** ([../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), DEC-036), a recomendação de reserva atômica de vaga, o ORM/estratégia de migrations, o ciclo de vida do anúncio, a política de imagens do anúncio, o ciclo de vida e encerramento da negociação, a política de avaliações, a política de itens proibidos, denúncia, moderação e remoção, a política de desistência e reseleção, a política de retenção e exclusão de dados, a elegibilidade etária de 18 anos completos ou mais, a natureza da demonstração de interesse e as **exceções de pagamento** ([../product/payment-exceptions.md](../product/payment-exceptions.md), DEC-037). Ver [../project-state.md](../project-state.md).
