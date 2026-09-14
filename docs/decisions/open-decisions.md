# Decisões abertas

Registro das questões que **ainda não foram decididas** na Fase 0. Nenhum item desta lista deve ser tratado como homologado. Uma decisão aberta só é fechada quando um documento próprio (ADR ou documento de produto) a registrar e este arquivo for atualizado.

## Como distinguir decisão aberta de decisão vigente

| | Onde está registrada | Pode ser assumida na implementação? |
| --- | --- | --- |
| Decisão vigente | [../project-state.md](../project-state.md), ADRs em [../adr/](../adr/), [../product/business-rules.md](../product/business-rules.md) | Sim |
| Decisão aberta | Este documento | Não; a implementação dependente deve aguardar o fechamento |

## Lista de decisões abertas

**Nenhuma.** Não resta nenhuma decisão aberta na Fase 0.

OD-07 era a última. Foi fechada em **2026-09-14** por [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037), na execução de F0-019, depois que F0-010 concluiu a validação técnica do gateway e F0-011 fechou OD-08 com [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036).

Isto **não** significa que a Fase 0 esteja concluída. O que resta dela é execução documental, não decisão. A arquitetura pré-implementação (F0-022) foi **concluída** em 2026-09-14, em [../architecture/overview.md](../architecture/overview.md), [../architecture/data-model.md](../architecture/data-model.md), [../architecture/payments-design.md](../architecture/payments-design.md) e [../architecture/contact-release.md](../architecture/contact-release.md); resta a transição para a Fase 1 (F0-023), em [../delivery/backlog.md](../delivery/backlog.md). A decisão arquitetural que F0-022 precisou tomar foi registrada como DEC-038 em [../adr/0006-async-work-scheduling-concurrency.md](../adr/0006-async-work-scheduling-concurrency.md), e não reabriu nenhuma questão de produto.

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
