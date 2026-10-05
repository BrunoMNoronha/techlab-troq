# Plano da frente proposta de troca — TROQS

Documento produzido por **PT-00** ([#186](https://github.com/BrunoMNoronha/techlab-troq/issues/186)) em 2026-10-05, sobre `main` em `373748f`. Decompõe a frente [#185](https://github.com/BrunoMNoronha/techlab-troq/issues/185) em issues executoras e é a fonte oficial de **DEC-055** (escopo e ordem da frente).

**Esta entrega é documentação.** Não altera código, schema, migration, ambiente nem provedor, e não muda o comportamento da regra solicitação paga. A regra proposta de troca continua **não implementada**.

Classificação usada: **CONFIRMADO** (verificado no código ou no documento citado), **DECISÃO** (do Bruno, com a data), **DECISÃO PENDENTE** (escolha do Bruno, ainda não feita), **DECISÃO TÉCNICA** (desta entrega, sujeita à homologação dele).

## 1. Base

| Item | Valor |
| --- | --- |
| Commit | `373748f` (`main`) |
| Decisões do Bruno | 24, de 2026-10-05, em [#185](https://github.com/BrunoMNoronha/techlab-troq/issues/185), seção "Decisões do Bruno em 2026-10-05" |
| Registro | DEC-053 ([../adr/0009-trade-rules-environment-selector.md](../adr/0009-trade-rules-environment-selector.md)), DEC-054 ([../product/trade-proposal.md](../product/trade-proposal.md)) e DEC-055 (este documento), em [../decisions/decision-log.md](../decisions/decision-log.md) |
| Numeração | As decisões desta frente são DEC-053 a DEC-055. DEC-052 foi usada no mesmo dia por outra entrega ([#198](https://github.com/BrunoMNoronha/techlab-troq/pull/198), perfil de caixa do manifesto HMAC), mesclada antes desta |
| Contratos | [../product/trade-proposal.md](../product/trade-proposal.md) (`TP-x`), [../architecture/trade-proposal-design.md](../architecture/trade-proposal-design.md) (`TD-x`, `TT-n`) |
| Estado de partida | CONFIRMADO: não há seletor de regra, módulo `proposal`, entidade de proposta nem compromisso de anúncio; `PaymentAttempt` não guarda valor; a variável `TRADE_RULE` não existe em nenhum ambiente |

## 2. Escopo e ordem (DEC-055)

DECISÃO do Bruno em 2026-10-05 (#185, decisões 20 e 21):

1. **PT-00 e PT-01 começam agora.** São documentação e spike, sem código de produto.
2. **O código espera o gate da Fase 3** ([#105](https://github.com/BrunoMNoronha/techlab-troq/issues/105)). A homologação da Fase 3 é por SHA, e nada que toque `payments`, `request`, `contact` ou a escolha entra antes dela.
3. **Depois do gate, a frente anda em paralelo à Fase 4.** Ela não é pré-requisito de nenhuma fase e não altera os gates das Fases 3 a 5.
4. **O lançamento comercial não espera a regra nova.** Ele segue com a solicitação paga ([#130](https://github.com/BrunoMNoronha/techlab-troq/issues/130)).
5. **A faixa de valor no anúncio fica fora desta frente.**

Fora da frente, por decisão registrada em #185: remover ou substituir a solicitação paga; tela administrativa e papel de operador; as duas regras abertas para fluxos novos no mesmo ambiente; intermediar a "volta"; compra e venda; chat; texto livre na proposta; casamento automático de anúncios.

## 3. Pendências

**Decisões abertas**, em [../decisions/open-decisions.md](../decisions/open-decisions.md):

| ID | Tema | Quem resolve | Efeito sobre as issues |
| --- | --- | --- | --- |
| OD-17 | Preço final da proposta de troca. R$ 2,99 é o candidato | Bruno, depois de PT-01 e do primeiro teste | Não bloqueia código: o valor é gravado por fluxo (ADR-0009, decisão 9). Condiciona PT-11 |
| OD-18 | Aviso prévio de troca de regra e forma final do consentimento | Bruno, com a revisão jurídica de [#173](https://github.com/BrunoMNoronha/techlab-troq/issues/173) | Bloqueia os textos legais de PT-09. Condiciona PT-11 |

**Decisões de produto que cada entrega precisa levar ao Bruno.** Nenhuma foi tomada aqui.

| # | DECISÃO PENDENTE | Entrega |
| --- | --- | --- |
| PP-1 | Quais e-mails a regra envia, a quem e por qual transição | PT-09 |
| PP-2 | Efeitos de remoção administrativa, sanção e exclusão de conta sobre proposta aceita, compromisso e negociação ativa | PT-10 |

**Homologação pendente desta entrega.** DECISÃO TÉCNICA sujeita à revisão do Bruno em #186:

- as decisões 5 a 13 de [ADR-0009](../adr/0009-trade-rules-environment-selector.md);
- os itens derivados listados em [../product/trade-proposal.md](../product/trade-proposal.md), seção 15;
- o desenho de [../architecture/trade-proposal-design.md](../architecture/trade-proposal-design.md), em especial TD-5.6.

**Pré-requisitos externos.**

| Pré-requisito | Responsável | Necessário para |
| --- | --- | --- |
| Valor `paid_request` de `TRADE_RULE` definido em `development`, `preview` e `production`, antes de o preflight exigir a variável | Bruno | PT-02 |
| Autorização para trocar a variável do ambiente `preview` | Bruno | PT-11 |
| Gate da Fase 3 aprovado | [#105](https://github.com/BrunoMNoronha/techlab-troq/issues/105) | PT-02 em diante |

## 4. Issues executoras

| ID | Issue | Entrega | Dependências | Testes do contrato | Prova | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| PT-00 | [#186](https://github.com/BrunoMNoronha/techlab-troq/issues/186) | Registro das decisões, ADR e contratos das duas regras | — | — | Documental | em revisão |
| PT-01 | [#187](https://github.com/BrunoMNoronha/techlab-troq/issues/187) | Provar no sandbox a cobrança de R$ 2,99 com validade de 24 horas | — | — | Sandbox do Mercado Pago | próximo |
| PT-02 | [#188](https://github.com/BrunoMNoronha/techlab-troq/issues/188) | Seletor de regra de troca, ainda só com a solicitação paga | #186; #105 | TT-24 (parte) | PostgreSQL efêmero + HTTP | bloqueado por #105 |
| PT-03 | [#189](https://github.com/BrunoMNoronha/techlab-troq/issues/189) | Critério único de vitrine, compromisso do anúncio e trava ordenada | #186; #105; PR #182 | TT-17, TT-23, TT-27 | PostgreSQL efêmero, concorrente + HTTP | bloqueado por #105 |
| PT-04 | [#190](https://github.com/BrunoMNoronha/techlab-troq/issues/190) | Valor próprio da tentativa e fato de pagamento roteado pelo sujeito | #186; #187; #105 | TT-25 | PostgreSQL efêmero + simulado | bloqueado por #105 |
| PT-05 | [#191](https://github.com/BrunoMNoronha/techlab-troq/issues/191) | Proposta: propor, recusar, retirar e expirar | #188, #189 | TT-1 a TT-4, TT-16 | PostgreSQL efêmero, concorrente + HTTP | pendente |
| PT-06 | [#192](https://github.com/BrunoMNoronha/techlab-troq/issues/192) | Aceite, revogação, desistência e Pix da proposta | #190, #191 | TT-5 a TT-7, TT-21, TT-22, TT-28 | PostgreSQL efêmero, concorrente + simulado | pendente |
| PT-07 | [#193](https://github.com/BrunoMNoronha/techlab-troq/issues/193) | Efeito do pagamento: negociação e contato nos dois sentidos | #192; #163 | TT-8 a TT-15, TT-26 | PostgreSQL efêmero, concorrente + HTTP | pendente |
| PT-08 | [#194](https://github.com/BrunoMNoronha/techlab-troq/issues/194) | Desfecho por declaração e avaliação | #193; #163, #164 | TT-18 a TT-20 | PostgreSQL efêmero, concorrente + HTTP | pendente |
| PT-09 | [#195](https://github.com/BrunoMNoronha/techlab-troq/issues/195) | Jornada, textos públicos, Termos, Privacidade e e-mails | #191 a #194; #168, #173; PP-1; OD-18 | — | Componentes + HTTP + navegador | pendente |
| PT-10 | [#196](https://github.com/BrunoMNoronha/techlab-troq/issues/196) | Remoção, sanção e exclusão de conta sobre propostas e negociações | #193; #166, #167, #171; PP-2 | Definidos na entrega | PostgreSQL efêmero + HTTP | pendente |
| PT-11 | [#197](https://github.com/BrunoMNoronha/techlab-troq/issues/197) | Verificação de segurança e homologação em Preview | #187 a #196; OD-17, OD-18 | TT-24 e reexecução de todos | PostgreSQL efêmero + `preview` | pendente |

**Ordem por dependência.**

1. PT-00 e PT-01, já.
2. Depois de #105, em paralelo: PT-02, PT-03 e PT-04. As três não mudam comportamento e valem pela regressão do contrato da Fase 3.
3. PT-05, depois de PT-02 e PT-03.
4. PT-06, depois de PT-04 e PT-05.
5. PT-07, depois de PT-06 e de #163; PT-08, depois de PT-07 e de #164.
6. PT-09 em fatias, à medida que PT-05 a PT-08 entregam as ações de servidor; PT-10 quando #166 e #171 existirem.
7. PT-11, por último.

## 5. Rastreabilidade do contrato de teste

Cada teste do contrato pertence a uma issue executora. PT-11 reexecuta todos no mesmo SHA.

| Teste | Issue | Teste | Issue |
| --- | --- | --- | --- |
| TT-1 | #191 (PT-05) | TT-15 | #193 (PT-07) |
| TT-2 | #191 (PT-05) | TT-16 | #191 (PT-05) |
| TT-3 | #191 (PT-05) | TT-17 | #189 (PT-03) |
| TT-4 | #191 (PT-05) | TT-18 | #194 (PT-08) |
| TT-5 | #192 (PT-06) | TT-19 | #194 (PT-08) |
| TT-6 | #192 (PT-06) | TT-20 | #194 (PT-08) |
| TT-7 | #192 (PT-06) | TT-21 | #192 (PT-06) |
| TT-8 | #193 (PT-07) | TT-22 | #192 (PT-06) |
| TT-9 | #193 (PT-07) | TT-23 | #189 (PT-03) |
| TT-10 | #193 (PT-07) | TT-24 | #197 (PT-11), com parte em #188 |
| TT-11 | #193 (PT-07) | TT-25 | #190 (PT-04) |
| TT-12 | #193 (PT-07) | TT-26 | #193 (PT-07) |
| TT-13 | #193 (PT-07) | TT-27 | #189 (PT-03) |
| TT-14 | #193 (PT-07) | TT-28 | #192 (PT-06) |

O contrato da solicitação paga (T-1 a T-18, C-1 a C-11) é reexecutado, sem alteração de comportamento, em PT-02, PT-03, PT-04, PT-06, PT-07 e PT-11.

| Critério de aceite de #185 | Onde é produzido |
| --- | --- |
| Decisões registradas e as duas regras descritas como estratégias cadastradas | PT-00 |
| Issues executoras criadas e vinculadas | PT-00 |
| Seletor com conjunto fechado e falha fechada; mesmo build serve as duas regras | PT-02, PT-11 (TT-24) |
| Com a variável na regra vigente, o comportamento não muda | PT-02, PT-03, PT-04 |
| Troca da variável com fluxos em andamento | PT-11 |
| Regra nova de ponta a ponta, com limites no banco e concorrência real | PT-05 a PT-08 |
| Nenhum contato antes do pagamento aprovado | PT-07 (TT-15), PT-11 |
| Textos, Termos, Privacidade e e-mails correspondem à regra do ambiente | PT-09 |
| Homologação em Preview e ensaio de troca de regra | PT-11 |

## 6. Relação com o trabalho em andamento

| Item | Relação |
| --- | --- |
| [#105](https://github.com/BrunoMNoronha/techlab-troq/issues/105) — gate da Fase 3 | Pré-requisito de todo código da frente. PT-00 não altera critério nenhum do gate |
| PR #182, [#163](https://github.com/BrunoMNoronha/techlab-troq/issues/163) e [#164](https://github.com/BrunoMNoronha/techlab-troq/issues/164) — encerramento e avaliações | PT-03, PT-07 e PT-08 editam os mesmos arquivos e entram depois |
| [#166](https://github.com/BrunoMNoronha/techlab-troq/issues/166), [#167](https://github.com/BrunoMNoronha/techlab-troq/issues/167) e [#171](https://github.com/BrunoMNoronha/techlab-troq/issues/171) — moderação, sanções e exclusão de conta | PT-10 depende deles; a porta de encerramento do anúncio é compartilhada |
| [#168](https://github.com/BrunoMNoronha/techlab-troq/issues/168) — notificações da Fase 4 | Mesmo catálogo de e-mails que PT-09 |
| [#173](https://github.com/BrunoMNoronha/techlab-troq/issues/173) — termos, privacidade e revisão jurídica | Dona da revisão que fecha OD-18 |
| [#130](https://github.com/BrunoMNoronha/techlab-troq/issues/130) e [#179](https://github.com/BrunoMNoronha/techlab-troq/issues/179) — lançamento e gate comercial | Não dependem desta frente (seção 2, item 4) |

## 7. O que esta entrega não faz

Não implementa nenhuma issue, não cria a variável em ambiente nenhum, não cria migration, não altera o preflight de deploy, não muda Termos nem Privacidade públicos, não decide OD-17, OD-18, PP-1 nem PP-2 e não troca a regra de ambiente nenhum.
