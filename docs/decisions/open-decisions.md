# Decisões abertas

Registro das questões que **ainda não foram decididas** na Fase 0. Nenhum item desta lista deve ser tratado como homologado. Uma decisão aberta só é fechada quando um documento próprio (ADR ou documento de produto) a registrar e este arquivo for atualizado.

## Como distinguir decisão aberta de decisão vigente

| | Onde está registrada | Pode ser assumida na implementação? |
| --- | --- | --- |
| Decisão vigente | [../project-state.md](../project-state.md), ADRs em [../adr/](../adr/), [../product/business-rules.md](../product/business-rules.md) | Sim |
| Decisão aberta | Este documento | Não; a implementação dependente deve aguardar o fechamento |

## Lista de decisões abertas

Restam **duas** decisões abertas, ambas relacionadas a pagamentos e ambas dependentes, direta ou indiretamente, da validação real do gateway.

### OD-07 — Chargebacks, duplicidade e exceções de pagamento

- **Contexto:** RB-004 estabelece que a cobrança é definitiva quando o solicitante não é escolhido.
- **O que falta decidir:** tratamento de chargebacks, pagamentos duplicados, pagamentos aprovados após expiração da reserva de vaga, falhas de confirmação e demais exceções.
- **Bloqueia:** design de pagamentos.

### OD-08 — Validação do gateway para R$ 0,99

- **Contexto:** pagamentos são Pix-first. Mercado Pago é apenas o primeiro candidato de gateway, **não** decisão final.
- **O que falta decidir:** escolha do gateway, condicionada a um spike que prove cobrança de exatamente R$ 0,99, confirmação, webhook, idempotência e tarifas.
- **Estado do spike:** 9 dos 10 critérios comprovados após a quarta execução de F0-010 em 2026-09-14, registrada em [../delivery/spikes/f0-010-mercado-pago-pix-r099.md](../delivery/spikes/f0-010-mercado-pago-pix-r099.md). Falta apenas validar a assinatura HMAC de uma notificação real, o que depende da chave secreta de webhook obtenível somente no painel do gateway.
- **Bloqueia:** implementação de pagamentos e criação de ADR de pagamento.

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
| OD-09 | ORM e estratégia de migrations | [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md) | DEC-026 em [decision-log.md](decision-log.md) |
| OD-10 | Retenção e exclusão de dados | [../product/data-retention-policy.md](../product/data-retention-policy.md) | DEC-033 em [decision-log.md](decision-log.md) |
| OD-11 | Elegibilidade etária formal | [../product/age-eligibility.md](../product/age-eligibility.md) | DEC-034 em [decision-log.md](decision-log.md) |
| OD-12 | Natureza da demonstração de interesse | [../product/interest-flow.md](../product/interest-flow.md) | DEC-035 em [decision-log.md](decision-log.md) |

## Itens explicitamente fora desta lista

Já decididos e registrados como vigentes: arquitetura, stack, banco, deploy, autenticação inicial, armazenamento de imagens, email transacional, a recomendação de reserva atômica de vaga, o ORM/estratégia de migrations, o ciclo de vida do anúncio, a política de imagens do anúncio, o ciclo de vida e encerramento da negociação, a política de avaliações, a política de itens proibidos, denúncia, moderação e remoção, a política de desistência e reseleção, a política de retenção e exclusão de dados, a elegibilidade etária de 18 anos completos ou mais e a natureza da demonstração de interesse. Ver [../project-state.md](../project-state.md).
