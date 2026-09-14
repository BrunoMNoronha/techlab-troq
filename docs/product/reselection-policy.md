# Política de desistência e reseleção — TROQ

Documento normativo que fecha [OD-06](../decisions/open-decisions.md) e registra DEC-032. Define o que acontece quando o solicitante escolhido desiste, e se e sob quais condições o anunciante pode escolher outro solicitante.

Fontes: [business-rules.md](business-rules.md) (RB-001, RB-003, RB-004), [listing-lifecycle.md](listing-lifecycle.md) (DEC-027), [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029), [requirements.md](requirements.md) (RF-013, RF-015, RF-022).

## 1. Escopo

Este documento define:

- se existe reseleção e sob quais pré-condições;
- os efeitos da reseleção sobre a escolha anterior, a liberação de contato já concedida, a negociação, o limite de RB-003 e o estado do anúncio;
- o tratamento da desistência do escolhido.

Este documento **não** define:

| Assunto | Onde permanece |
| --- | --- |
| Chargeback, duplicidade, pagamento tardio, reembolso e demais exceções financeiras | [OD-07](../decisions/open-decisions.md) |
| Escolha e homologação do gateway de pagamento | [OD-08](../decisions/open-decisions.md) |
| Schema, migrations, endpoints, Server Actions, telas, notificações e emails | Fases 1 a 3 do [roadmap](../delivery/roadmap.md) |
| Motivo, culpado ou resultado do encerramento da negociação | Rejeitado por DEC-029, seção 9.3 |

## 2. Decisão

**A reseleção é permitida, de forma estritamente controlada.**

O anunciante pode selecionar outro solicitante somente quando **todas** as cinco condições abaixo forem simultaneamente verdadeiras, verificadas server-side no instante da ação:

| # | Pré-condição | Verificação |
| --- | --- | --- |
| RS-1 | Já existiu uma escolha anterior nesse anúncio | Existe ao menos um registro histórico de escolha |
| RS-2 | A negociação correspondente à escolha anterior está `closed` | Estado da negociação conforme [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029) |
| RS-3 | O anúncio está atualmente no estado `published` | Estado do anúncio conforme [listing-lifecycle.md](listing-lifecycle.md) (DEC-027) |
| RS-4 | O novo candidato possui solicitação com pagamento previamente aprovado | Mesma elegibilidade de RF-013; solicitação não paga ou expirada nunca é elegível |
| RS-5 | Esse candidato ainda não foi selecionado anteriormente nesse anúncio | Cada solicitação paga pode ser escolhida no máximo uma vez |

Faltando qualquer uma delas, a tentativa é rejeitada no servidor.

A reseleção exige **confirmação explícita do anunciante**. Não existe reseleção automática, sugerida pelo sistema, por job, por inatividade ou por decorrência de qualquer outro evento.

## 3. A escolha anterior é fato histórico imutável

A reseleção **não** desfaz nada do que já ocorreu. A liberação de contato já concedida:

- **não** é revogada;
- **não** é apagada;
- **não** é revertida;
- continua auditada (RF-022).

Isso é consequência direta de DEC-029, que já estabelece que uma negociação encerrada é fato histórico imutável e que seu encerramento não revoga contato já liberado, e de DEC-027, que já estabelece que nenhuma transição do anúncio revoga liberação já autorizada.

O escolhido anterior mantém o contato que recebeu. O produto **não** tem mecanismo de "retirar" um contato já entregue, e este documento não cria um.

## 4. Efeitos da nova escolha

A nova escolha:

- cria uma **nova negociação**, distinta da anterior, nascendo `active` conforme DEC-029, seção 4;
- gera uma **nova autorização de liberação de contato**, sujeita integralmente a RB-001 (escolhido **e** pagamento aprovado), verificada server-side;
- é **auditada independentemente** (RF-022), com ator, alvo, instante e resultado próprios, sem telefone/WhatsApp em texto claro fora da própria liberação autorizada;
- exige confirmação explícita do anunciante.

### 4.1 Exclusividade da negociação `active`

**Nunca existe mais de uma negociação `active` originada por escolhas sequenciais do mesmo anúncio ao mesmo tempo.**

Antes da reseleção, a negociação anterior precisa estar `closed` (RS-2). Essa é a garantia de exclusividade: o anúncio tem, em qualquer instante, no máximo uma negociação viva originada de sua cadeia de escolhas.

Como o encerramento da negociação é unilateral, imediato e irreversível (DEC-029), a transição para `closed` é o único caminho que habilita RS-2. Não há atalho, aceite bilateral, aprovação administrativa nem prazo de espera.

## 5. Limite máximo — RB-003 é preservada literalmente

**RB-003 continua imutável: máximo de 3 solicitações pagas por anúncio.**

Somente as solicitações pagas existentes podem participar de reseleção. Consequências normativas:

- cada solicitação paga pode ser escolhida **no máximo uma vez** (RS-5);
- no máximo **três pessoas** podem ser escolhidas sequencialmente no ciclo inteiro do anúncio, porque no máximo três solicitações pagas existem;
- a reseleção **não** cria nova vaga;
- a reseleção **não** reinicia nem devolve o limite de três;
- a reseleção **não** permite uma quarta solicitação paga.

Esgotadas as três solicitações pagas e já escolhidas as três, não há mais reseleção possível nesse anúncio. O anúncio pode permanecer `published`, mas não aceita nova solicitação paga (RB-003) e não tem candidato elegível restante (RS-5).

## 6. Estado do anúncio

A tabela abaixo vale **para a reseleção**, ou seja, para a segunda escolha em diante na cadeia do mesmo anúncio.

| Estado do anúncio | Reseleção |
| --- | --- |
| `draft` | Nenhuma escolha |
| `published` | Pode ocorrer, observadas RS-1 a RS-5 |
| `paused` | Nenhuma escolha enquanto estiver pausado; o anunciante precisa reativar para `published` (T4) |
| `closed` | Nenhuma nova escolha |
| `removed` | Nenhuma nova escolha |

### 6.1 Fronteira com DEC-027 — primeira escolha e reseleção

DEC-027 é preservada integralmente. Para evitar leitura ambígua, a fronteira é explícita:

- A **primeira escolha** de um anúncio continua governada por [listing-lifecycle.md](listing-lifecycle.md): o anunciante pode escolher entre as solicitações pagas de um anúncio `paused` ou `closed`, porque a negociação é um ciclo distinto e a cobrança já foi definitiva. Este documento **não** altera isso.
- A **reseleção** exige adicionalmente `published` (RS-3). A restrição é mais estrita por decisão de produto: a reseleção é um ato novo e voluntário, e exigir que a oferta esteja no ar impede que uma cadeia de escolhas continue avançando sobre um anúncio que o próprio anunciante tirou de circulação.

Em `removed`, DEC-027 já bloqueia nova escolha e nova liberação de contato; este documento não afrouxa esse bloqueio.

Nada aqui faz o anúncio mudar de estado por causa de um evento de negociação, nem o contrário. Os dois ciclos permanecem independentes (DEC-027, seção 8).

## 7. Desistência

Se o escolhido desistir:

1. ele **ou** o anunciante podem encerrar a negociação, unilateralmente, conforme DEC-029;
2. após a negociação estar `closed`, o anunciante pode selecionar outro solicitante pago elegível, observadas RS-1 a RS-5;
3. **não** há reseleção automática;
4. **não** há reembolso automático;
5. **não** há alteração automática do anúncio.

A desistência **não** é um estado, um evento, um motivo registrado nem um campo do sistema. DEC-029, seção 9.3, já rejeitou expressamente motivo, culpado e resultado de encerramento; este documento não os reintroduz. O que o sistema observa é apenas a transição `active -> closed` e, eventualmente, uma nova escolha explícita do anunciante.

### 7.1 RB-004 permanece integralmente válida

A cobrança de R$ 0,99 é definitiva, mesmo quando o solicitante não for escolhido — e igualmente quando for escolhido e a negociação for encerrada, com ou sem desistência.

Nada neste documento cria reembolso, estorno, crédito, compensação, devolução de vaga ou qualquer inferência nesse sentido. Exceções financeiras continuam pertencendo **exclusivamente** a [OD-07](../decisions/open-decisions.md).

## 8. Cenários de consistência

| Cenário | Comportamento esperado |
| --- | --- |
| Anúncio `published`, 3 pagas, nenhuma escolha ainda | Primeira escolha normal (RF-013). Não é reseleção; RS-1 não se aplica |
| Escolhido desiste, negociação `closed`, anúncio `published`, 2 pagas restantes nunca escolhidas | Reseleção permitida sobre qualquer uma das 2 |
| Negociação ainda `active` e anunciante tenta escolher outro | Rejeitado: RS-2 falha |
| Negociação `closed`, mas anúncio `paused` | Rejeitado: RS-3 falha. O anunciante pode reativar (T4) e então reselecionar |
| Negociação `closed`, anúncio `closed` | Rejeitado: RS-3 falha. `closed` é terminal (DEC-027); não há caminho de volta |
| Anúncio `removed` por moderação após liberação de contato | Liberação anterior permanece válida e auditada; nenhuma nova escolha ou liberação é autorizada |
| Tentativa de reselecionar alguém já escolhido antes nesse anúncio | Rejeitado: RS-5 falha |
| Tentativa de reselecionar solicitante sem pagamento aprovado | Rejeitado: RS-4 falha |
| Três pagas, três já escolhidas sequencialmente, todas as negociações `closed` | Nenhuma reseleção resta; RS-5 falha para todos. RB-003 impede uma quarta solicitação paga |
| Escolhido anterior alega que "perdeu o direito" ao contato após a reseleção | Improcedente: a liberação anterior não é revogada (seção 3) |
| Duas tentativas concorrentes de reseleção sobre o mesmo anúncio | No máximo uma cria negociação `active`; a segunda falha por RS-2 ou RS-5, conforme o caso. A garantia é server-side (RNF-016) |
| Repetir a mesma intenção de reseleção sobre o mesmo candidato já selecionado | Idempotente; não cria nova negociação nem nova autorização |

## 9. Alternativas rejeitadas

| Alternativa | Decisão | Razão |
| --- | --- | --- |
| Proibir qualquer reseleção | **Rejeitada** | Deixaria o anúncio permanentemente travado após uma desistência, com até duas solicitações pagas legítimas sem qualquer utilidade, apesar de RB-004 já ter tornado a cobrança definitiva |
| Reseleção livre, sem exigir negociação anterior `closed` | **Rejeitada** | Permitiria múltiplas negociações vivas no mesmo anúncio, múltiplos contatos liberados em paralelo e ambiguidade sobre quem é a contraparte para RB-002 e para as avaliações (DEC-030) |
| Revogar o contato do escolhido anterior ao reselecionar | **Rejeitada** | Tecnicamente inexequível (o contato já foi entregue) e contrário a DEC-027 e DEC-029, que preservam liberações já autorizadas |
| Reseleção automática ao encerrar a negociação | **Rejeitada** | Transformaria o encerramento em decisão de escolha; DEC-029 é explícita em que o encerramento **não** autoriza reseleção |
| Permitir uma quarta solicitação paga para repor o desistente | **Rejeitada** | Violaria RB-003, que é preservada literalmente |
| Registrar "desistência" como estado ou motivo | **Rejeitada** | DEC-029, seção 9.3, já rejeitou motivo, culpado e resultado; reintroduzi-los criaria superfície de disputa e de moderação sem necessidade |
| Reembolso ou crédito ao anunciante ou ao desistente | **Rejeitada** | Violaria RB-004; exceções financeiras são exclusivas de OD-07 |
| Permitir reseleção com anúncio `paused` | **Rejeitada** | A oferta fora do ar não deve originar nova relação; o anunciante tem o caminho explícito de reativar (T4) |

## 10. Rastreabilidade

| Item | Efeito desta decisão |
| --- | --- |
| RF-013 | Passa a `definido`. Reseleção definida por RS-1 a RS-5, com confirmação explícita e auditoria |
| RF-015 | Permanece `definido`. Sai a menção a OD-06: liberações já feitas não são revogadas; cada nova escolha gera nova autorização sujeita a RB-001 |
| RF-022 | Cada escolha e cada reseleção são auditadas independentemente. A retenção da trilha está definida em [data-retention-policy.md](data-retention-policy.md) (DEC-033) |
| RB-001 | Preservada literalmente. Toda nova liberação exige as duas condições simultâneas |
| RB-003 | Preservada literalmente. Reseleção não cria vaga, não reinicia o limite e não permite a quarta paga |
| RB-004 | Preservada literalmente. Nenhum reembolso, estorno ou compensação é criado |
| DEC-027 | Preservada integralmente. Fronteira entre primeira escolha e reseleção explicitada na seção 6.1 |
| DEC-029 | Preservada integralmente. `closed` unilateral e irreversível é a pré-condição RS-2 |
| DEC-030 | Preservada. Cada negociação origina no máximo duas avaliações; negociações sequenciais são independentes para efeito de avaliação |
| OD-06 | **Fechada** por este documento (DEC-032) |
| OD-07, OD-08, OD-10, OD-11, OD-12 | Não são tratadas aqui. OD-07 e OD-08 permanecem abertas; OD-10, OD-11 e OD-12 foram fechadas na mesma entrega por DEC-033, DEC-034 e DEC-035 |
