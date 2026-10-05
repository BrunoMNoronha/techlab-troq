# Contato do anunciante como pré-condição da solicitação — TROQS

Documento normativo que fecha [OD-13](../decisions/open-decisions.md) e registra **DEC-040**. Decisão do Bruno em 2026-10-01, registrada por F3-002 ([#92](https://github.com/BrunoMNoronha/techlab-troq/issues/92)).

Fontes: [business-rules.md](business-rules.md) (RB-001, RB-003, RB-004), [listing-lifecycle.md](listing-lifecycle.md) (DEC-027), [interest-flow.md](interest-flow.md) (DEC-035), [../architecture/contact-release.md](../architecture/contact-release.md) (CR-2), [../architecture/data-model.md](../architecture/data-model.md) (DM-4, DM-6.12), [../architecture/payments-design.md](../architecture/payments-design.md) (PD-4.1).

**Escopo de regra (DEC-053, 2026-10-05).** Este documento rege a regra de troca **solicitação paga** (`paid_request`) e não foi alterado. Na regra **proposta de troca**, o mesmo princípio — ninguém paga por um contato que não existe — vale para as duas partes ([trade-proposal.md](trade-proposal.md), DEC-054, TP-3.4).

## 1. Problema

RB-001 libera ao escolhido, com pagamento aprovado, o contato do anunciante. Até F3-002, nada impedia que um anúncio publicado recebesse solicitações pagas sem que o anunciante tivesse cadastrado contato (`UserContact`). O escolhido pagaria R$ 0,99 e não teria o que receber, e RB-004 não trata esse caso.

## 2. Decisão

**AC-1.** Ter contato cadastrado é **pré-condição para aceitar nova solicitação** de desbloqueio no anúncio. A verificação é do servidor, na mesma transação que reserva a vaga e **sob a trava do anúncio** ([../architecture/data-model.md](../architecture/data-model.md), DM-6.12), antes de qualquer alocação, tentativa de pagamento ou cobrança. Anúncio cujo dono não tem contato recusa a reserva e nada é criado.

**AC-2.** **Não** é pré-condição de publicar (T1) nem de reativar (T4). A máquina de estados do anúncio ([listing-lifecycle.md](listing-lifecycle.md)) **não** muda.

**AC-3.** Anúncio já publicado cujo dono não tem contato **continua visível** em todas as superfícies públicas e continua `published`. Não há pausa automática nem qualquer transição de estado: o anúncio só deixa de aceitar solicitação até que o dono cadastre o contato.

**AC-4.** O solicitante vê uma mensagem **neutra** ("Este anúncio não está aceitando solicitações no momento") e nunca é informado de que falta contato ao anunciante. Nenhuma solicitação é criada e nada é cobrado.

**AC-5.** O anunciante é orientado no painel de anúncios a cadastrar o contato em `/conta` quando tem anúncio publicado e não tem contato.

**AC-6.** A pré-condição só olha se **existe** contato. Ela não lê o número e não o expõe: a consulta é a leitura booleana do módulo `contact` ([../architecture/contact-release.md](../architecture/contact-release.md), nota de CR-2.5).

## 3. O que não muda

- Reservas e solicitações pagas já existentes não são afetadas. Hoje não existe operação de remoção do contato pela pessoa usuária, só de substituição (CR-2.2); a eliminação na exclusão de conta segue DEC-033.
- A escolha, a negociação e a liberação (F3-009 e F3-010) não ganham pré-condição nova: a solicitação só existe se o contato existia quando a vaga foi reservada.
- RB-001 a RB-006 e o limite de três vagas. As decisões OD-14 a OD-16, abertas quando este documento foi escrito, foram fechadas depois por DEC-041 a DEC-043.
- Nenhum evento novo de auditoria: [../architecture/data-model.md](../architecture/data-model.md), DM-11.1 não lista a recusa por falta de contato nem o cadastro do contato.

## 4. Alternativas rejeitadas

| Alternativa | Motivo |
| --- | --- |
| Exigir contato para publicar e reativar | Muda T1/T4, colide com a evolução das pré-condições de publicação (#76) e obriga a decidir o destino dos anúncios já publicados |
| Exigir na publicação e na solicitação | A verificação na solicitação já protege o solicitante sozinha; a exigência na publicação só acrescentaria fricção |
| Pausar automaticamente os anúncios sem contato | Transição de estado sem ação do dono, com auditoria de T5 e risco de surpresa; a recusa da solicitação basta |
| Dizer ao solicitante que falta contato | Expõe um fato sobre a conta do anunciante sem utilidade para quem solicita |

## 5. Rastreabilidade

| Item | Onde |
| --- | --- |
| Verificação sob a trava | `src/modules/request/reservation.ts` (`not_accepting`) |
| Estado da entrada no detalhe público | `src/modules/request/entry.ts`, `src/app/explorar/[id]/contact-request-entry.tsx` |
| Leitura booleana | `src/modules/contact/contact.ts` (`hasContact`) |
| Orientação ao anunciante | `src/app/anuncios/page.tsx`, `src/app/conta/` |
| Provas | `src/modules/request/reservation.integration.test.ts` (recusa sem criar nada; verificação sob a trava), `src/modules/request/entry.test.ts` |
