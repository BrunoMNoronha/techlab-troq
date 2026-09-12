# Decisões abertas

Registro das questões que **ainda não foram decididas** na Fase 0. Nenhum item desta lista deve ser tratado como homologado. Uma decisão aberta só é fechada quando um documento próprio (ADR ou documento de produto) a registrar e este arquivo for atualizado.

## Como distinguir decisão aberta de decisão vigente

| | Onde está registrada | Pode ser assumida na implementação? |
| --- | --- | --- |
| Decisão vigente | [../project-state.md](../project-state.md), ADRs em [../adr/](../adr/), [../product/business-rules.md](../product/business-rules.md) | Sim |
| Decisão aberta | Este documento | Não; a implementação dependente deve aguardar o fechamento |

## Lista de decisões abertas

### OD-01 — Mecanismo de encerramento da negociação

- **Contexto:** o fluxo central prevê que a negociação pode ser encerrada e que avaliações só são permitidas após o encerramento (RB-002).
- **O que falta decidir:** como o encerramento é tecnicamente confirmado no sistema (quem aciona, se exige confirmação de uma ou ambas as partes, prazos, estados intermediários).
- **Bloqueia:** implementação de encerramento e de avaliações.

### OD-02 — Regras detalhadas de avaliação

- **Contexto:** RB-002 define apenas o momento em que a avaliação é permitida.
- **O que falta decidir:** quem avalia quem, formato, prazo, visibilidade, possibilidade de edição/resposta, tratamento de abuso.
- **Bloqueia:** implementação de avaliações.

### OD-03 — Catálogo/política de itens proibidos

- **Contexto:** RB-006 exige remoção de anúncios com itens proibidos.
- **O que falta decidir:** lista de categorias proibidas, critérios de moderação, fluxo de denúncia e prazos de resposta.
- **Bloqueia:** implementação de moderação.

### OD-06 — Política de desistência e reseleção

- **Contexto:** o anunciante escolhe uma solicitação entre até 3 pagas (RB-001, RB-003).
- **O que falta decidir:** o que ocorre se o escolhido desistir ou se o anunciante quiser escolher outro solicitante; se há reseleção e sob quais condições.
- **Bloqueia:** fluxo de escolha e liberação de contato.

### OD-07 — Chargebacks, duplicidade e exceções de pagamento

- **Contexto:** RB-004 estabelece que a cobrança é definitiva quando o solicitante não é escolhido.
- **O que falta decidir:** tratamento de chargebacks, pagamentos duplicados, pagamentos aprovados após expiração da reserva de vaga, falhas de confirmação e demais exceções.
- **Bloqueia:** design de pagamentos.

### OD-08 — Validação do gateway para R$ 0,99

- **Contexto:** pagamentos são Pix-first. Mercado Pago é apenas o primeiro candidato de gateway, **não** decisão final.
- **O que falta decidir:** escolha do gateway, condicionada a um spike que prove cobrança de exatamente R$ 0,99, confirmação, webhook, idempotência e tarifas.
- **Bloqueia:** implementação de pagamentos e criação de ADR de pagamento.

### OD-10 — Retenção e exclusão de dados

- **Contexto:** a plataforma trata dados pessoais, incluindo telefone/WhatsApp (dado protegido), o que sujeita o projeto à LGPD.
- **O que falta decidir:** prazos de retenção, exclusão de conta, anonimização, retenção de trilhas de auditoria de liberação de contato.
- **Bloqueia:** política de privacidade e implementação de exclusão de conta.

### OD-11 — Elegibilidade etária formal

- **O que falta decidir:** idade mínima para uso da plataforma e forma de declaração/verificação.
- **Bloqueia:** regras de cadastro e termos de uso.

### OD-12 — Natureza da demonstração de interesse

- **Contexto:** o fluxo central vigente ([../product/mvp-scope.md](../product/mvp-scope.md)) contém três passos conceitualmente separados: o interessado demonstra interesse (passo 3), depois solicita desbloqueio de contato (passo 4), depois paga R$ 0,99 (passo 5). A existência de passos separados não define suficientemente a implementação nem a persistência dessa demonstração de interesse. RF-008 registra apenas o núcleo (interesse por usuário autenticado e verificado, em anúncio consultável, sem liberar contato).
- **O que falta decidir:**
  - se "demonstrar interesse" é uma ação funcional própria;
  - se existe antes da solicitação paga como entidade/estado persistido;
  - se é gratuita;
  - se pode ser cancelada;
  - se o anunciante visualiza interesses ainda não convertidos em solicitação paga;
  - ou se o passo deve ser tratado apenas como início da solicitação de desbloqueio, sem entidade separada.
- **Impacto:** RF-008; experiência do interessado; modelo de dados; métricas/funil; arquitetura/API da Fase 3.
- **Bloqueia:** fechamento do status de RF-008 e a arquitetura de dados/API pré-implementação no que se refere ao interesse. Não é gate do spike de pagamento (OD-08).

## Decisões fechadas

Itens que já constaram desta lista e foram fechados por documento próprio. O ID **não** é reutilizado.

| ID | Tema | Fechada por | Registro |
| --- | --- | --- | --- |
| OD-04 | Ciclo de vida completo do anúncio | [../product/listing-lifecycle.md](../product/listing-lifecycle.md) | DEC-027 em [decision-log.md](decision-log.md) |
| OD-05 | Quantidade e regras das imagens | [../product/image-policy.md](../product/image-policy.md) | DEC-028 em [decision-log.md](decision-log.md) |
| OD-09 | ORM e estratégia de migrations | [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md) | DEC-026 em [decision-log.md](decision-log.md) |

## Itens explicitamente fora desta lista

Já decididos e registrados como vigentes: arquitetura, stack, banco, deploy, autenticação inicial, armazenamento de imagens, email transacional, a recomendação de reserva atômica de vaga, o ORM/estratégia de migrations, o ciclo de vida do anúncio e a política de imagens do anúncio. Ver [../project-state.md](../project-state.md).
