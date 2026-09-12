# Ciclo de vida da negociação

Fonte oficial do ciclo mínimo e do encerramento da negociação no MVP do TROQ. Este documento fecha **OD-01** e é registrado como **DEC-029** em [../decisions/decision-log.md](../decisions/decision-log.md).

## 1. Propósito e escopo

Define o que é uma negociação no sistema, quais estados ela possui, quem pode encerrá-la, o que o encerramento significa e o que ele explicitamente **não** produz.

Este documento **não** define regras de avaliação (OD-02), desistência ou reseleção (OD-06), exceções financeiras (OD-07), retenção de dados (OD-10) nem qualquer detalhe de implementação (schema, endpoints, telas, notificações).

Preserva integralmente RB-001 a RB-006 e o ciclo de vida do anúncio definido em [listing-lifecycle.md](listing-lifecycle.md) (DEC-027).

## 2. Identidade da negociação

No MVP, uma **negociação** representa a relação entre:

- o **anunciante** do anúncio; e
- o **solicitante pago escolhido** naquele anúncio.

Ela é uma entidade conceitual distinta de:

| Não é | Motivo |
| --- | --- |
| O anúncio | O anúncio é a oferta pública e tem ciclo próprio (DEC-027) |
| A solicitação paga | A solicitação é o pedido de desbloqueio de contato, cobrado conforme RB-004 |
| A escolha | A escolha é o ato do anunciante que seleciona uma solicitação paga |
| A liberação de contato | A liberação é o evento autorizado por RB-001 |
| O pagamento | O pagamento é o fato financeiro de R$ 0,99 |

Uma negociação **passa a existir conceitualmente** quando uma solicitação paga é escolhida e a liberação de contato fica autorizada conforme RB-001 (solicitante escolhido **e** pagamento aprovado).

Cada eventual nova escolha futura, caso OD-06 venha a permitir reseleção, corresponderá a uma **relação de negociação distinta**. Este documento **não** define se ou quando a reseleção é permitida.

## 3. Estados

No MVP existem exatamente dois estados.

| Estado | Significado | Terminal |
| --- | --- | --- |
| `active` | A relação de negociação entre anunciante e solicitante escolhido está aberta no sistema | Não |
| `closed` | Aquela relação de negociação foi encerrada no sistema | Sim |

Não existem, e não devem ser criados no MVP: `pending_closure`, `awaiting_confirmation`, `completed`, `cancelled`, `failed`, `disputed`, `expired` ou qualquer outro estado intermediário.

O que `closed` significa e o que não significa:

| `closed` significa | `closed` **não** significa |
| --- | --- |
| A relação não está mais ativa no sistema | Que a troca foi concluída com sucesso |
| A pré-condição temporal de RB-002 está satisfeita | Entrega, satisfação ou transferência de propriedade |
| Nenhuma transição posterior de negociação é possível | Pagamento pelo bem ou qualquer resultado externo ao TROQ |

Sucesso ou fracasso da troca **não** é modelado nesta decisão.

## 4. Criação — entrada em `active`

A negociação nasce em `active` quando a escolha do solicitante pago ocorre e a liberação de contato fica autorizada por RB-001. Não há estado anterior a `active`, e não há criação de negociação por qualquer outro caminho.

## 5. Encerramento — `active -> closed`

Única transição existente no ciclo.

| Origem | Destino | Quem aciona | Condição | Efeito |
| --- | --- | --- | --- | --- |
| `active` | `closed` | Anunciante **ou** solicitante escolhido daquela negociação | Ação explícita e confirmada pelo próprio ator; autorização verificada server-side | Negociação encerrada de forma imediata e irreversível; registro de auditoria |
| `closed` | — | — | — | Nenhuma transição possível; `closed` é terminal |

Não existe transição `closed -> active`. Não existe reabertura.

## 6. Atores autorizados

Uma negociação `active` pode ser encerrada por **qualquer uma das duas partes**:

- o anunciante daquela negociação;
- o solicitante escolhido daquela negociação.

O encerramento é **unilateral**. Não exige aceite da contraparte, confirmação bilateral, aprovação administrativa nem prazo de espera.

**Fundamentação.** A negociação real ocorre fora da plataforma, após a liberação de WhatsApp/telefone. Exigir confirmação das duas partes criaria possibilidade permanente de *deadlock* quando uma delas abandona o contato ou deixa de usar o sistema. Se uma das partes declara que não continuará a relação, a negociação não precisa permanecer artificialmente ativa.

Nenhum terceiro — outro usuário, outro solicitante não escolhido — pode encerrar a negociação.

## 7. Confirmação e irreversibilidade

Embora não haja confirmação da contraparte, deve existir **confirmação explícita do próprio usuário** que executa a ação, porque o encerramento é irreversível.

A interface futura deve comunicar claramente que:

- a negociação será encerrada;
- a ação **não** poderá ser desfeita;
- o encerramento poderá tornar avaliações elegíveis conforme as regras que serão definidas em OD-02.

Layout, modal específico e copy final **não** são definidos nesta etapa.

## 8. Prazos e ausência de automação

No MVP:

- não existe prazo mínimo antes de encerrar;
- não existe prazo máximo para manter a negociação ativa;
- não existe encerramento automático por inatividade;
- não existe *timeout*;
- não existe *job* de expiração;
- não existe autoencerramento pela passagem do tempo.

O encerramento ocorre **somente** por ação explícita de uma das partes.

**Consequência aceita:** negociações abandonadas podem permanecer `active` indefinidamente. Nenhum mecanismo de limpeza é definido nesta etapa.

## 9. Relação com anúncio, pagamento, contato e escolha

### 9.1 Anúncio

DEC-027 é preservada. O ciclo do anúncio e o ciclo da negociação são **independentes**.

- Encerrar a negociação **não** encerra o anúncio.
- Fechar, pausar ou remover o anúncio **não** encerra automaticamente uma negociação já ativa.
- Uma negociação já ativa pode ser encerrada pelas partes mesmo que o anúncio esteja posteriormente `paused`, `closed` ou `removed`.
- Nenhuma transição da negociação altera automaticamente o estado do anúncio.

Após encerrar a negociação, a interface poderá futuramente sugerir ao anunciante que encerre seu anúncio, mas isso será uma ação separada e voluntária dele.

### 9.2 Efeitos que o encerramento NÃO produz

O encerramento da negociação **não**:

- cancela pagamento;
- gera reembolso;
- altera RB-004;
- revoga contato já liberado;
- apaga solicitações;
- devolve vaga das três solicitações pagas (RB-003);
- altera o solicitante escolhido;
- autoriza automaticamente uma reseleção;
- remove ou encerra o anúncio;
- altera imagens;
- apaga dados;
- define sucesso ou fracasso da troca.

OD-06 continua sendo a única decisão aberta responsável por desistência e reseleção. OD-07 continua responsável por exceções financeiras. OD-10 continua responsável por retenção e exclusão de dados.

### 9.3 Sem motivo e sem resultado de encerramento

Esta decisão **não** cria motivo obrigatório, texto livre de justificativa, resultado "troca concluída", resultado "troca não concluída", culpado, desistente nem motivo de cancelamento.

A única afirmação normativa do evento é: **a negociação não está mais ativa**.

Razões: "desistência" interfere em OD-06; sucesso/fracasso não é necessário para RB-002; texto livre adicionaria dados e superfície de moderação sem necessidade; detalhes sobre a experiência pertencem a OD-02.

## 10. Relação com avaliações

RB-002 é preservada literalmente: *avaliação somente após encerramento da negociação no sistema*.

Consequências:

- enquanto a negociação estiver `active`, **nenhuma** avaliação pode ser registrada;
- após `closed`, a condição temporal de RB-002 está satisfeita.

`closed` é a **pré-condição obrigatória** de RB-002, não uma garantia de que uma avaliação será necessariamente permitida. OD-02 continua responsável por quem avalia quem, notas, comentários, prazo, publicação, edição, resposta, denúncias, abuso e eventuais restrições adicionais de elegibilidade.

## 11. Concorrência, idempotência e auditoria

### 11.1 Concorrência e idempotência

- A primeira transição válida `active -> closed` vence.
- Uma tentativa concorrente posterior encontra a negociação já fechada.
- Repetir a mesma intenção sobre negociação já `closed` resulta no estado já fechado, **sem** criar nova transição de negócio.
- Não se criam múltiplos registros de encerramento para *retries* técnicos.
- Tentativa feita por usuário que não participa da negociação é **rejeitada**.
- Não existe transição `closed -> active`.

O desenho concreto de endpoint, *constraint* e transação pertence à arquitetura e à implementação posteriores.

### 11.2 Autorização e auditoria

Toda ação de encerramento é autorizada **server-side**. Somente os participantes daquela negociação podem encerrá-la. A ausência ou presença de botão na interface **nunca** é controle de autorização.

O encerramento gera registro de auditoria contendo, no mínimo conceitualmente:

| Campo | Conteúdo |
| --- | --- |
| Alvo | A negociação encerrada |
| Ator | Qual das duas partes executou a ação |
| Instante | Momento do encerramento |
| Estado anterior | `active` |
| Estado resultante | `closed` |
| Resultado | Sucesso ou rejeição da operação |

O log de encerramento **não** registra telefone/WhatsApp (DEC-023). A auditoria do encerramento integra RF-022; sua retenção permanece em OD-10.

## 12. Decisões explicitamente fora do escopo

| Tema | Onde permanece |
| --- | --- |
| Regras de avaliação (quem avalia quem, notas, prazo, publicação, moderação) | OD-02 |
| Desistência e reseleção | OD-06 |
| Chargebacks e exceções de pagamento | OD-07 |
| Escolha do gateway | OD-08 |
| Retenção e exclusão de dados e trilhas de auditoria | OD-10 |
| Schema, migrations, API, telas, notificações e emails | Fases posteriores |

## 13. Alternativas rejeitadas

| Alternativa | Decisão | Motivo |
| --- | --- | --- |
| Confirmação bilateral do encerramento | **Rejeitada** no MVP | Permite *deadlock* permanente se uma das partes abandonar a plataforma ou não responder |
| Encerramento automático por tempo (*timeout*, expiração, job) | **Rejeitado** | O TROQ não observa a negociação realizada por WhatsApp/telefone e não possui sinal confiável para concluir que ela terminou |
| Estados de sucesso/falha (`completed`, `failed`, `cancelled`) | **Rejeitados** nesta etapa | Misturam encerramento da relação com resultado da troca e antecipariam regras de desistência, avaliação ou pós-negociação |
| Reabertura de negociação encerrada | **Rejeitada** | Uma negociação encerrada é fato histórico imutável; qualquer relação futura será nova negociação, se as regras de reseleção permitirem |
| Motivo ou resultado obrigatório no encerramento | **Rejeitados** | Ver seção 9.3 |

## 14. Rastreabilidade

| Item | Relação |
| --- | --- |
| OD-01 | **Fechada** por este documento (DEC-029) |
| DEC-029 | Registro da decisão em [../decisions/decision-log.md](../decisions/decision-log.md) |
| RB-002 | Preservada literalmente; `closed` satisfaz sua pré-condição temporal |
| RB-001, RB-003, RB-004, RB-005, RB-006 | Inalteradas |
| RF-016 | **Definido** por este documento |
| RF-017 | Deixa de depender de OD-01; regras detalhadas seguem OD-02 |
| RF-022 | Passa a incluir o encerramento da negociação entre as operações críticas auditadas |
| DEC-027 / [listing-lifecycle.md](listing-lifecycle.md) | Preservada; ciclos do anúncio e da negociação permanecem independentes |
| OD-02, OD-06, OD-07, OD-08, OD-10, OD-11, OD-12 | Permanecem abertas; nada aqui as fecha ou antecipa |
| F0-015 | Concluído por esta entrega |
