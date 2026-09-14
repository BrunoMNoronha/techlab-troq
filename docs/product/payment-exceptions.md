# Exceções de pagamento — TROQ

Documento normativo que fecha [OD-07](../decisions/open-decisions.md) e registra DEC-037. Define, de forma implementável, o comportamento do TROQ diante das exceções do fluxo de pagamento Pix da solicitação de desbloqueio de contato.

Fontes internas: [business-rules.md](business-rules.md) (RB-001, RB-003, RB-004), [requirements.md](requirements.md) (RF-009 a RF-012, RF-020, RF-022), [interest-flow.md](interest-flow.md) (DEC-035), [listing-lifecycle.md](listing-lifecycle.md) (DEC-027), [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029), [reselection-policy.md](reselection-policy.md) (DEC-032), [prohibited-items.md](prohibited-items.md) (DEC-031), [data-retention-policy.md](data-retention-policy.md) (DEC-033), [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036) e [../delivery/spikes/f0-010-mercado-pago-pix-r099.md](../delivery/spikes/f0-010-mercado-pago-pix-r099.md).

## 1. Objetivo

Eliminar a ambiguidade sobre **o que o TROQ faz** quando o fluxo de pagamento sai do caminho feliz, de modo que o design de pagamentos (F0-022) e a implementação (Fase 3) não precisem inventar comportamento de negócio.

Cada exceção recebe aqui uma resposta a cinco perguntas: o pagamento vale? consome vaga? gera reembolso? torna o solicitante elegível à escolha? o que é auditado e reconciliado?

## 2. Escopo

Neste documento:

- duplicidade técnica de tentativa ou de pagamento;
- confirmação atrasada ou ausente;
- pagamento aprovado próximo ou depois do fim da janela de reserva;
- falha entre a confirmação no gateway e a persistência do efeito no TROQ;
- reembolso técnico;
- reversão posterior do pagamento;
- fraude e falha operacional no contexto Pix;
- indisponibilidade temporária do Mercado Pago;
- reconciliação entre o estado local e o estado autoritativo do gateway.

**Fora deste documento:**

| Tema | Onde está |
| --- | --- |
| Escolha do gateway, modelo de integração, manifesto HMAC, isolamento do domínio | [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036) |
| Schema, migrations, endpoints, jobs, locks, transações, tempos concretos de retry e de reserva | [../architecture/payments-design.md](../architecture/payments-design.md) e [../architecture/data-model.md](../architecture/data-model.md), produzidos por F0-022 em 2026-09-14 |
| Interface, textos de tela, emails e notificações | Fase 3 do [../delivery/roadmap.md](../delivery/roadmap.md) |
| Valor cobrado, definitividade da cobrança e limite de três | RB-003 e RB-004, **inalteradas** |
| Política comercial de reembolso por insatisfação | Não existe no MVP; ver seção 10.2 |

Este documento **não** altera nenhuma regra de negócio, **não** cria meio de pagamento, **não** muda o valor de R$ 0,99 e **não** implementa nada.

## 3. Terminologia

Termos usados com sentido estrito. O vocabulário do provedor fica confinado ao adaptador (ADR-0004, decisão 10); aqui ele aparece apenas para ancorar fatos externos.

| Termo | Definição |
| --- | --- |
| **Reserva de vaga** | Ocupação provisória e atômica de uma das três vagas de RB-003, criada **antes** da cobrança (DEC-019), com instante de início e instante de fim |
| **Janela de reserva** | Intervalo entre o início e o fim da reserva. Fora dela a reserva não pode mais produzir solicitação paga válida |
| **Tentativa de pagamento** | Operação lógica de cobrar R$ 0,99 por **uma** reserva específica. Tem identidade estável e é a unidade de idempotência |
| **Pagamento canônico** | O único pagamento efetivamente acreditado que uma reserva pode reconhecer como seu |
| **Solicitação paga válida** | Solicitação de desbloqueio com pagamento canônico acreditado dentro da janela da reserva que ela detinha. É o que conta para RB-003 e o que habilita a escolha (RF-013) |
| **Vaga consumida** | Vaga de RB-003 definitivamente ocupada por uma solicitação paga válida. Consumo é fato histórico |
| **Exceção técnica** | Situação em que houve dinheiro efetivamente acreditado sem que exista uma solicitação paga válida correspondente |
| **Reembolso técnico** | Devolução integral iniciada pelo TROQ ao pagador, por exceção técnica. Ver seção 10 |
| **Reversão externa** | Perda posterior do pagamento por ato de terceiro (pagador, PSP ou provedor), não iniciada pelo TROQ. Ver seção 11 |
| **Estado autoritativo** | O estado da cobrança tal como o Mercado Pago o reporta em consulta direta. Ver seção 5 |
| **Inconsistência** | Divergência conhecida entre o estado local e o estado autoritativo, ou estado local que não pode ser determinado |

Três expressões que **não** são sinônimas e não devem ser usadas como tal: **reembolso técnico**, **devolução Pix** e **chargeback**. A distinção é normativa e está na seção 11.

## 4. Pesquisa externa

Consultas realizadas em **2026-09-14**, contra fontes primárias. Nada nesta seção é inferência: cada linha é fato apurado na fonte indicada. Fatos já registrados por [ADR-0004](../adr/0004-mercado-pago-pix.md) não são repetidos aqui, salvo quando esta política depende deles.

### 4.1 Mercado Pago Developers

| # | Fonte oficial | Fato apurado |
| --- | --- | --- |
| MP-1 | *Pix — Checkout Transparente (via Orders API)*, `developers/pt/docs/checkout-api-orders/payment-integration/pix` | Criação por `POST /v1/orders` com `Authorization` e `X-Idempotency-Key`, esta última descrita como garantia de que cada solicitação seja processada apenas uma vez, evitando duplicidades. `transactions.payments[].expiration_time` em ISO 8601, padrão 24 horas, **mínimo 30 minutos e máximo 30 dias**. A resposta nasce com `status` `action_required` e `status_detail` `waiting_transfer` |
| MP-2 | *Status da order*, `developers/pt/docs/checkout-api-orders/payment-management/status/order-status` | Valores documentados de `status`/`status_detail`: `created`/`created`; `processing`/`in_process`; `action_required`/`waiting_payment`, `waiting_capture`, `waiting_transfer`, `waiting_retry`; `processed`/`accredited`; `processed`/`partially_refunded`; `refunded`/`refunded`; `canceled`/`canceled`; `expired`/`expired`; `failed`/`failed`; `charged_back`/`in_process`, `settled`, `reimbursed` |
| MP-3 | *Status da transação*, `developers/pt/docs/checkout-api-orders/payment-management/status/transaction-status` | `processed` com `accredited` é descrito como a transação processada com sucesso e o valor **efetivamente creditado**. `refunded`/`refunded` corresponde à devolução integral e `processed`/`partially_refunded` à devolução parcial |
| MP-4 | *Configurar notificações de orders*, `developers/pt/docs/checkout-api-orders/notifications`, e sua versão em inglês | Tópico `order`; a única `action` exibida na documentação consultada é `order.processed`. Header `X-Signature` no formato `ts=<timestamp>,v1=<hmac>`. O endpoint deve responder `HTTP 200` ou `201` em até **22 segundos**; sem essa confirmação, o reenvio ocorre **a cada 15 minutos nas três primeiras tentativas** e, depois da terceira, o prazo é estendido, mas os envios continuam |
| MP-5 | *Reembolsos e cancelamentos*, `developers/pt/docs/checkout-api-orders/payment-management/refunds-cancellations`, e a referência de `POST /v1/orders/{order_id}/refund` | Reembolso total (sem valor no corpo) ou parcial (com `transactions[].id` e `amount`), por `POST /v1/orders/{order_id}/refund`, com `Authorization` e `X-Idempotency-Key`. **Prazo de 180 dias a partir da data de aprovação** do pagamento. Exige **saldo suficiente disponível na conta**, sob pena de a transação não se realizar. Em Pix, o valor é devolvido **na conta do pagador**. Erros documentados incluem `refund_amount_exceeds`, `order_already_refunded` e `order_not_found`. A resposta traz `transactions.refunds[]` com `id`, `transaction_id`, `amount`, `status` e `e2e_id` |
| MP-6 | Referência de `POST /v1/orders/{order_id}/cancel` | Cancelamento da order e de suas transações; apenas orders com `status` `created` ou `action_required` podem ser canceladas. Também exige `X-Idempotency-Key` |
| MP-7 | *Get order by ID*, `GET /v1/orders/{id}` (registrado em ADR-0004) | Mecanismo oficial de consulta da order e base da reconciliação |

**Consequência direta de MP-4 para esta política:** a documentação consultada expõe `order.processed` como ação de notificação e **não** documenta notificação própria para reembolso ou reversão. Portanto o TROQ **não pode** depender de webhook para descobrir uma reversão: a descoberta é responsabilidade da reconciliação por consulta (seção 12).

### 4.2 Banco Central do Brasil

Fonte: *Guia de implementação dos procedimentos de devolução no Pix, com ênfase no Mecanismo Especial de Devolução*, versão 4.3, publicado pelo Banco Central do Brasil em `bcb.gov.br/content/estabilidadefinanceira/pix/Guia_MED.pdf`, consultado em 2026-09-14. O próprio documento anuncia a versão 4.4, com vigências a partir de 2026-09-01 e 2026-10-26. A base normativa que ele cita é o **Regulamento do Pix, anexo à Resolução BCB nº 1, de 12 de agosto de 2020**, em especial o Capítulo XI, a Seção III do Capítulo XIII e o art. 39-B.

| # | Fato apurado |
| --- | --- |
| BC-1 | **Devolução por iniciativa do usuário recebedor:** dentro do prazo de **90 dias** contados da data da transação original, qualquer usuário pode devolver, por iniciativa própria e a seu critério, recursos creditados em sua conta provenientes de um Pix, no valor total ou parcial, admitidas múltiplas devoluções parciais |
| BC-2 | **MED** é o mecanismo que permite que a devolução de um Pix seja iniciada pelo **próprio participante** (PSP), debitando recursos da conta de seu cliente sem pedir autorização a cada devolução |
| BC-3 | **Hipóteses do MED:** falha operacional do PSP do pagador; falha operacional do PSP do recebedor; fundada suspeita de fraude cometida pelo usuário recebedor, após solicitação de devolução pelo PSP do pagador, após bloqueio cautelar do PSP do recebedor ou em caso de abertura fraudulenta de MED pelo pagador; e erro do PSP do pagador em ordem de Pix Automático |
| BC-4 | **Hipóteses que o MED não alcança:** controvérsias relacionadas a aspectos do negócio jurídico subjacente à transação, isto é, **desacordo comercial**; recursos destinados à conta de **terceiro de boa-fé**; e erros do próprio usuário pagador, como enviar o Pix ao destinatário errado ou repetir o Pix. O guia é explícito ao dizer que desacordos comerciais devem ser resolvidos no âmbito do Poder Judiciário |
| BC-5 | O guia afirma que a devolução comandada pelo PSP do recebedor por fundada suspeita de fraude é **completamente diferente do chargeback dos arranjos de cartão de pagamento**: no Pix não basta o pagador não reconhecer uma compra; é necessário provar que o vendedor foi o agente da fraude, do golpe ou do crime, e vendedores de boa-fé não podem ter suas contas debitadas |
| BC-6 | **Recuperação de Valores** é o processo de abertura do MED nos casos de fraude, com rastreamento além da primeira conta de destino. A transação raiz precisa ter ocorrido há no máximo **80 dias**, ou **30 dias** quando se tratar de transação de devolução |
| BC-7 | **Bloqueio cautelar:** bloqueio de valores realizado pelo PSP do recebedor por até **72 horas** quando houver suspeita de fraude, para avaliação mais detalhada do caso |

**Consequência direta de BC-4 e BC-5 para esta política:** "chargeback" é vocabulário de arranjos de cartão e **não** descreve o Pix. Nenhum documento do TROQ deve usá-lo como termo genérico para reversão de Pix, e o TROQ **não** pode documentar desacordo comercial como hipótese de MED.

### 4.3 Divergências e limites da pesquisa

1. **Reenvio de notificações.** ADR-0004 registrou "reenvio a cada 15 minutos até a confirmação". A documentação consultada hoje é mais precisa: a cada 15 minutos **nas três primeiras tentativas** e, depois, com prazo estendido, mantidos os envios. É refinamento, não contradição, e **não** altera nenhuma decisão de ADR-0004. Esta política não depende do número de tentativas: depende de a reconciliação funcionar sem nenhuma delas.
2. **Ações de notificação.** Só `order.processed` foi encontrada documentada para o tópico `order`. Esta política **não** afirma que não existam outras; afirma que o TROQ não pode depender de nenhuma além dessa.
3. **Comportamento do MED na prática.** O MED é executado entre PSPs. O TROQ é usuário recebedor de um provedor, não participante do Pix, e **não** controla o resultado de um MED. Esta política define o que o TROQ faz com o **efeito** de uma reversão, não como o MED é decidido.
4. **Nenhuma verificação foi feita contra conta de produção.** Nenhum pagamento real, nenhum reembolso real e nenhum acesso a painel produtivo ocorreram nesta tarefa.

## 5. Fonte de verdade do pagamento

**PE-1.1** — O estado autoritativo do pagamento é o que o Mercado Pago reporta em consulta direta à order pela integração homologada (`GET /v1/orders/{id}`, ADR-0004 e MP-7). Nenhuma outra fonte é autoritativa.

**PE-1.2** — Um payload recebido **não** é, por si, prova de pagamento. Receber uma notificação afirmando que houve pagamento **não** produz efeito de negócio.

**PE-1.3** — A notificação válida é **gatilho** de processamento e de reconciliação, nunca a fonte do estado. O sistema deve ser capaz de reconstruir integralmente o estado a partir da consulta autoritativa, **como se nenhuma notificação tivesse chegado**.

**PE-1.4** — Somente um estado oficialmente documentado que represente pagamento **efetivamente processado e acreditado** transforma a solicitação em paga. Conforme MP-2 e MP-3, esse estado é `processed` com `status_detail` `accredited`, verificado tanto na order quanto na transação Pix correspondente.

**PE-1.5** — Nenhum outro valor documentado — `created`, `processing`/`in_process`, qualquer `action_required`, `expired`, `canceled`, `failed`, `refunded`, `partially_refunded` ou qualquer `charged_back` — autoriza efeito de negócio. Valor desconhecido, ausente ou não documentado é tratado como **não aprovado** e leva a inconsistência (seção 12), nunca a aprovação.

**PE-1.6** — Estado incerto **nunca** é resolvido a favor da aprovação. Na dúvida, o pagamento não está aprovado e nenhum direito é concedido.

## 6. Identidade da tentativa, idempotência e duplicidade

### 6.1 Identidade estável

**PE-2.1** — Toda tentativa de pagamento pertence a **exatamente uma** reserva de vaga e possui identidade estável derivada dela. A mesma reserva, retentada, é a **mesma** tentativa lógica; reservas diferentes são tentativas diferentes.

**PE-2.2** — A chave enviada em `X-Idempotency-Key` na criação da cobrança é derivada de forma determinística dessa identidade (ADR-0004, decisão 7), de modo que uma retentativa da mesma tentativa reaproveite a chave e uma tentativa diferente nunca a reaproveite. A forma concreta de derivação é design de F0-022.

**PE-2.3** — Uma mesma operação lógica **não pode** gerar duas cobranças por causa de: retentativa HTTP, timeout, duplo clique, retentativa do backend, repetição de job, notificação duplicada ou reprocessamento. Nenhuma dessas causas é motivo legítimo para uma segunda cobrança.

**PE-2.4** — Idempotência não é exclusiva da criação. São idempotentes também: o processamento de notificações, as transições internas de estado, o reembolso técnico e o cancelamento. As chamadas de reembolso e de cancelamento também carregam `X-Idempotency-Key` (MP-5, MP-6).

**PE-2.5** — Processar N vezes a mesma notificação produz o **mesmo** estado final que processá-la uma vez, e gera efeito de negócio no máximo uma vez.

### 6.2 Duplicidade apesar das proteções

Se, apesar de PE-2.1 a PE-2.5, dois pagamentos efetivamente acreditados forem vinculados à mesma solicitação ou reserva por anomalia técnica:

**PE-3.1** — Apenas **um** deles é o pagamento canônico da solicitação. O critério de eleição é determinístico e definido em F0-022; a única exigência normativa aqui é que ele seja determinístico, aplicado uma única vez e registrado.

**PE-3.2** — **Nunca** surgem duas solicitações pagas a partir da mesma reserva.

**PE-3.3** — **Nunca** são consumidas duas das três vagas por causa de duplicidade.

**PE-3.4** — O pagamento excedente é **exceção técnica** e entra em fluxo de **reembolso técnico integral** (seção 10).

**PE-3.5** — O evento é auditável: os dois pagamentos, a eleição do canônico, a identificação do excedente e o desfecho do reembolso ficam registrados.

**PE-3.6** — Falha do reembolso **não** pode ser ocultada. O caso permanece em `reembolso_pendente` para reconciliação e ação operacional, e nunca é resolvido convertendo o excedente em solicitação paga válida, em crédito, em vaga extra ou em qualquer benefício.

**PE-3.7** — Duplicidade técnica **jamais** é tratada como cobrança válida definitiva de RB-004. RB-004 qualifica **uma solicitação paga válida**; ela não legitima uma segunda cobrança que nunca deveria ter existido. Ver seção 17.

## 7. Reserva, expiração e o instante decisivo

### 7.1 Três relógios distintos

Não confundir:

| Relógio | O que é | Quem controla |
| --- | --- | --- |
| **Fim da janela de reserva** | Instante em que a reserva de vaga do TROQ deixa de poder produzir solicitação paga válida | TROQ |
| **Expiração da order/Pix** | `expiration_time` da cobrança no gateway (MP-1) | Mercado Pago, dentro dos limites de 30 minutos a 30 dias |
| **Chegada da notificação** | Instante em que o TROQ recebeu — ou reprocessou — o aviso | Rede, filas e retentativas do provedor |

**PE-4.1** — O instante decisivo é o **instante em que o pagamento foi efetivamente acreditado segundo o estado autoritativo do gateway**. Não é o instante de chegada da notificação, não é o instante de processamento pelo TROQ e não é o instante em que a reconciliação descobriu o fato.

**PE-4.2** — Uma notificação atrasada **não** transforma pagamento feito a tempo em pagamento atrasado. Se o instante de acreditação está dentro da janela da reserva, o pagamento é tempestivo, ainda que o TROQ só tome conhecimento dele muito depois. Nesse caso, a solicitação torna-se paga válida e a vaga que estava reservada é consumida.

**PE-4.3** — Por simetria, um pagamento cuja acreditação ocorreu **depois** do fim da janela da reserva **não** ressuscita a reserva perdida, **não** cria vaga e **não** pode violar RB-003.

### 7.2 Alinhamento entre a janela de reserva e a validade da order

**PE-4.4** — A janela de reserva do TROQ tem duração **mínima de 30 minutos**. O piso é normativo e existe para que a validade da cobrança no gateway possa ser alinhada à janela: 30 minutos é o menor `expiration_time` que a Orders API aceita (MP-1). A duração concreta acima desse piso é design de F0-022 e **não** é fixada por este documento.

**PE-4.5** — O `expiration_time` da order é definido de modo que a cobrança **não sobreviva** à janela de reserva. Isso reduz a incidência de pagamento tardio; não a elimina.

**PE-4.6** — A validação da janela **não** é delegada ao gateway. F0-010 registrou que o comportamento real da expiração não pôde ser observado e que a validação não é delegável; o TROQ verifica a tempestividade por conta própria, comparando o instante de acreditação autoritativo com o fim da janela, e o `expiration_time` é apenas defesa adicional.

**PE-4.7** — Não existe extensão automática, prorrogação silenciosa nem reabertura de reserva expirada. Indisponibilidade do provedor **não** prorroga a janela.

### 7.3 Pagamento aprovado que não pode virar solicitação válida

Quando um pagamento estiver efetivamente acreditado mas não puder legitimamente tornar-se solicitação paga válida — por janela encerrada, por reserva já liberada, por capacidade de RB-003 já esgotada ou por inexistência de reserva válida —, o TROQ:

**PE-4.8** — **não** cria solicitação paga;

**PE-4.9** — **não** consome vaga;

**PE-4.10** — classifica o caso como **exceção técnica**;

**PE-4.11** — inicia **reembolso técnico integral** (seção 10);

**PE-4.12** — mantém auditoria do fato e o caso sob reconciliação até desfecho terminal;

**PE-4.13** — **não** torna o solicitante elegível à escolha em nenhum momento desse percurso.

## 8. Concorrência e o limite de três

**PE-5.1** — Nenhuma exceção de pagamento pode permitir que um anúncio ultrapasse **3 solicitações pagas válidas**. RB-003 é preservada literalmente.

**PE-5.2** — A vaga é ocupada provisoriamente pela reserva, **antes** da cobrança (DEC-019), e consumida definitivamente quando — e somente quando — a solicitação se torna paga válida.

**PE-5.3** — Reserva que termina sem pagamento acreditado tempestivo libera a vaga. Liberação de vaga **não** cria cobrança, **não** cancela pagamento já acreditado e **não** produz crédito.

**PE-5.4** — A implementação futura deve resolver **atomicamente** a corrida entre reserva, pagamento, expiração, liberação da vaga, confirmação atrasada e uma terceira solicitação concorrente, de modo que nunca exista um instante observável com mais de três solicitações pagas válidas no mesmo anúncio. O mecanismo — transação, restrição de banco, lock — é design de F0-022 e **não** é escolhido aqui.

**PE-5.5** — Havendo corrida entre um pagamento tardio e uma nova reserva legítima que já ocupou a vaga liberada, prevalece a **reserva legítima vigente**. O pagamento tardio segue a seção 7.3.

**PE-5.6** — Consumo de vaga é **fato histórico**. Reseleção não devolve vaga (DEC-032), encerramento de negociação não devolve vaga (DEC-029), remoção do anúncio não reinicia o limite (DEC-031) e reversão externa posterior também não devolve vaga (seção 11.4).

## 9. Falhas de confirmação e de webhook

### 9.1 Assinatura inválida

**PE-6.1** — Notificação que não passe na validação de autenticidade **não** produz efeito de negócio algum, **não** marca pagamento como aprovado e **não** altera estado.

**PE-6.2** — A validação segue a **única** regra oficial de manifesto HMAC de ADR-0004, decisão 9, sem fallback entre variantes e sem remontar o manifesto a partir do corpo. A ordem obrigatória é identificar, validar e só então processar (ADR-0004, decisão 8).

**PE-6.3** — Registra-se apenas o mínimo necessário para segurança e auditoria: ocorrência, instante, motivo da rejeição e correlação técnica. **Nunca** segredo, token, chave de webhook ou payload capaz de reconstituí-los.

### 9.2 Notificação duplicada

**PE-6.4** — Processamento idempotente (PE-2.5). Nenhum efeito duplicado, nenhuma segunda cobrança, nenhuma segunda vaga e nenhum segundo registro de aprovação para o mesmo fato.

### 9.3 Notificação perdida

**PE-6.5** — A perda de notificações **não** pode impedir o reconhecimento do pagamento. O estado é recuperável pela reconciliação contra a API autoritativa (seção 12), e essa é a rota primária de garantia, não a exceção.

**PE-6.6** — Se a reconciliação apurar acreditação tempestiva, aplica-se PE-4.2: a solicitação torna-se paga válida, com o instante de acreditação como referência, ainda que nenhuma notificação tenha chegado.

### 9.4 Gateway confirmou, persistência local falhou

**PE-6.7** — A operação é **retomável e idempotente**. A confirmação já obtida não se perde por falha local.

**PE-6.8** — **Não** se cobra novamente.

**PE-6.9** — **Não** se cria nova order para "resolver" a falha. Criar uma segunda cobrança para contornar erro de persistência é proibido.

**PE-6.10** — Reconcilia-se a **mesma** operação, pela mesma identidade de tentativa, até que o efeito local corresponda ao estado autoritativo.

**PE-6.11** — Enquanto o efeito não estiver persistido, nenhum direito de negócio é concedido: não há elegibilidade à escolha nem liberação de contato.

### 9.5 Consulta ao gateway indisponível

**PE-6.12** — Indisponibilidade **não** converte estado incerto em aprovado (PE-1.6).

**PE-6.13** — A tentativa permanece pendente e sob reconciliação até que a consulta autoritativa seja possível.

**PE-6.14** — Nenhum direito de negócio é concedido prematuramente.

**PE-6.15** — Não se cria cobrança nova para a mesma reserva enquanto a tentativa anterior não tiver desfecho terminal conhecido.

### 9.6 Tempos

**PE-6.16** — Este documento **não** fixa tempos de retentativa, periodicidade de reconciliação ou prazos operacionais: eles são design de F0-022. O que é normativo é o **invariante**: nenhum limite de tempo, esgotamento de tentativas ou conveniência operacional pode converter estado incerto em aprovado, nem encerrar um caso de reembolso pendente sem desfecho real.

## 10. Reembolso técnico

### 10.1 Definição e hipóteses

**PE-7.1** — Reembolso técnico é a devolução **integral** iniciada pelo TROQ ao pagador, por meio do gateway, de valor acreditado que **nunca deveria ter se tornado** uma solicitação paga válida.

**PE-7.2** — As hipóteses de reembolso técnico no MVP são, exaustivamente:

| # | Hipótese |
| --- | --- |
| RT-1 | Pagamento excedente em duplicidade técnica, isto é, o não canônico (PE-3.4) |
| RT-2 | Pagamento acreditado depois do fim da janela de reserva (PE-4.3) |
| RT-3 | Pagamento acreditado sem reserva válida vigente, inclusive quando a vaga já foi legitimamente ocupada por outra solicitação (PE-5.5) |
| RT-4 | Cobrança criada por defeito técnico do TROQ, sem correspondência a uma tentativa legítima da pessoa usuária |

**PE-7.3** — O reembolso técnico é sempre **integral**. Ainda que a API admita devolução parcial (MP-5), o MVP não a utiliza: R$ 0,99 é indivisível neste modelo e não existe hipótese de devolução parcial.

**PE-7.4** — Quando a cobrança ainda não estiver acreditada e a order estiver em `created` ou `action_required`, o caminho correto é o **cancelamento** (MP-6), não o reembolso. Cancelar cobrança não acreditada não é reembolso e não é exceção técnica.

### 10.2 O que não gera reembolso

**PE-7.5** — **Não** geram reembolso, estorno, crédito ou compensação de nenhuma natureza:

- o solicitante não ter sido escolhido pelo anunciante — **RB-004, literal**;
- desistência do escolhido e reseleção (DEC-032);
- encerramento da negociação por qualquer das partes (DEC-029);
- anúncio pausado, encerrado ou removido, inclusive por moderação (DEC-027, DEC-031);
- bloqueio cautelar de conta por evidência de inelegibilidade etária (DEC-034);
- insatisfação com o resultado da negociação, com o item ou com a contraparte;
- arrependimento depois de a solicitação paga válida ter se constituído.

**PE-7.6** — O MVP **não** cria política comercial de reembolso. Nenhuma hipótese além de RT-1 a RT-4 é autorizada, e criar outra exige decisão registrada.

### 10.3 Execução e limites externos

**PE-7.7** — A execução usa `POST /v1/orders/{order_id}/refund` com reembolso total e `X-Idempotency-Key` (MP-5), pelo módulo adaptador (ADR-0004, decisão 10).

**PE-7.8** — Dois limites externos são conhecidos e **não** estão sob controle do TROQ: o prazo de **180 dias** a partir da aprovação e a exigência de **saldo suficiente** na conta (MP-5). Ambos são condições do provedor, não políticas do TROQ, e ambos podem fazer uma tentativa de reembolso falhar.

**PE-7.9** — Diante de falha, o caso entra em `reembolso_pendente`, permanece visível para a operação, é reconciliado e **não** é encerrado sem desfecho real. Falha de reembolso **nunca** é convertida em receita reconhecida, em vaga, em elegibilidade ou em silêncio.

**PE-7.10** — Esgotadas as tentativas automáticas sem sucesso, o caso permanece aberto como pendência operacional. Ele **não** muda de natureza: continua sendo dinheiro que o TROQ não tem direito de reter.

**PE-7.11** — Tentar reembolsar o mesmo pagamento mais de uma vez é seguro por construção: a chamada é idempotente e o erro `order_already_refunded` (MP-5) é desfecho de sucesso do ponto de vista do TROQ, não erro a repetir.

**PE-7.12** — RB-004 **não** autoriza o TROQ a reter dinheiro recebido por erro técnico. Este é o limite exato da regra e está detalhado na seção 17.

## 11. Reversões posteriores, devolução Pix e MED

### 11.1 Quatro coisas diferentes

| Fenômeno | Quem inicia | Como se aplica ao TROQ |
| --- | --- | --- |
| **Reembolso técnico** | O próprio TROQ, via gateway | Seção 10. É o único que o TROQ decide |
| **Devolução Pix por iniciativa do recebedor** | O usuário recebedor, em até 90 dias (BC-1) | É o instrumento regulatório subjacente ao reembolso técnico; o TROQ o exerce **através** do provedor, não diretamente |
| **MED** | O participante do Pix, isto é, o PSP (BC-2) | Hipóteses de fraude e de falha operacional (BC-3). O TROQ **sofre** o efeito; não o comanda |
| **Chargeback de cartão** | Arranjo de cartão de pagamento | **Não se aplica ao Pix** (BC-5) |

**PE-8.1** — O termo **chargeback** não descreve reversão de Pix e **não** deve ser usado como termo genérico em documentos do TROQ. Quando um valor de `status` do provedor usar a palavra — `charged_back` em MP-2 —, trata-se de valor técnico da API, não de afirmação de que o Pix tenha chargeback.

**PE-8.2** — Desacordo comercial **não** é hipótese de MED (BC-4) e o TROQ **não** o documenta como tal. Insatisfação com a negociação, com o item ou com a contraparte é matéria das partes, não do arranjo de pagamento.

**PE-8.3** — Fraude e falha operacional seguem a semântica real do Pix e do provedor. O TROQ **não** promete à pessoa usuária resultado que depende de instituições financeiras: não afirma que um MED será aceito, não estima prazo de devolução e não se coloca como decisor de mérito.

### 11.2 Detecção

**PE-8.4** — A reversão é detectada pela **reconciliação** (seção 12), porque a documentação consultada não expõe notificação própria para reembolso ou reversão (seção 4.1). Qualquer estado autoritativo que deixe de representar pagamento efetivamente acreditado — por exemplo `refunded`, `partially_refunded` ou qualquer `charged_back` de MP-2 — caracteriza reversão e dispara este tratamento, independentemente de qual valor específico o provedor use para Pix.

### 11.3 Efeitos sobre o histórico e sobre a elegibilidade

**PE-8.5** — A aprovação original é **fato histórico**. Preservam-se o histórico e a auditoria da aprovação; **não** se apagam registros para fingir que o pagamento nunca existiu. A reversão é registrada como **evento novo**, com instante e origem, sobre um fato anterior que permanece.

**PE-8.6** — Se a solicitação **ainda não foi escolhida**, ela deixa de estar habilitada a produzir liberação de contato: RB-001 exige pagamento aprovado, e o pagamento deixou de estar aprovado. A solicitação torna-se inelegível à escolha e deixa de ser apresentada ao anunciante como opção.

**PE-8.7** — Se o **contato já foi liberado**, a liberação é fato consumado e irreversível. Registra-se que a divulgação ocorreu e **não** se finge que ela pode ser desfeita. Isso é coerente com RB-001 e com DEC-032, que já estabelecem que liberação concedida nunca é revogada. A negociação existente segue governada por DEC-029 e não é encerrada por efeito da reversão.

**PE-8.8** — A reversão **não** gera nova cobrança automática, **não** gera cobrança de recuperação e **não** cria dívida da pessoa usuária perante o TROQ no MVP.

### 11.4 Efeito sobre RB-003

**PE-8.9** — Uma solicitação legitimamente aceita como uma das até três solicitações pagas **continua contando historicamente** para o limite do anúncio, mesmo que sofra reversão depois. A vaga permanece consumida.

**PE-8.10** — Reversão **não** abre silenciosamente uma quarta oportunidade paga.

**PE-8.11** — Pagamentos técnicos que nunca deveriam ter produzido solicitação válida — duplicata, cobrança fora de reserva válida, cobrança por defeito — **não** contam para o limite, porque nunca consumiram vaga (PE-3.3, PE-4.9).

**PE-8.12** — A distinção é, portanto: **o que já foi válido continua contando; o que nunca foi válido nunca contou.**

## 12. Reconciliação

**PE-9.1** — Fonte autoritativa da reconciliação: consulta à order no Mercado Pago (`GET /v1/orders/{id}`, MP-7).

**PE-9.2** — A reconciliação deve ser capaz de reconstruir o estado correto **sem nenhuma notificação**. Notificação perdida é hipótese normal de operação, não incidente.

**PE-9.3** — Entram em reconciliação, no mínimo: toda tentativa em estado não terminal; toda divergência entre estado local e estado autoritativo; todo caso de `reembolso_pendente`; toda inconsistência aberta; e, periodicamente, os pagamentos já confirmados, para detectar reversão (PE-8.4).

**PE-9.4** — A reconciliação é **idempotente**: executá-la N vezes sobre o mesmo caso produz o mesmo resultado.

**PE-9.5** — A reconciliação **corrige o estado local para refletir o autoritativo**; ela nunca inventa estado, nunca resolve ambiguidade a favor da aprovação e nunca fecha um caso sem desfecho real.

**PE-9.6** — Caso a reconciliação encontre situação que nenhuma regra desta política cubra, o caso vai para `inconsistente`, com registro, e **não** recebe tratamento por analogia nem concessão de direito.

**PE-9.7** — Periodicidade, janelas, filas e mecanismo concreto são design de F0-022.

## 13. Auditoria

**PE-10.1** — São eventos auditados do fluxo de pagamento, com ator, alvo, instante e resultado, na forma de RF-022:

| Evento | Registro mínimo |
| --- | --- |
| Criação da reserva e da tentativa | solicitação, anúncio, reserva, janela, identidade da tentativa |
| Aprovação do pagamento | tentativa, instante de acreditação autoritativo, instante de reconhecimento pelo TROQ, origem do reconhecimento (notificação ou reconciliação) |
| Recusa, expiração ou falha | tentativa, estado autoritativo observado, instante |
| Duplicidade detectada | pagamentos envolvidos, canônico eleito, excedente |
| Reembolso técnico | hipótese RT aplicada, solicitação, instante, resultado de cada tentativa, desfecho |
| Reembolso pendente | motivo da falha e permanência do caso em aberto |
| Reversão externa | estado autoritativo que a caracterizou, instante, efeito sobre elegibilidade e sobre vaga |
| Abertura e fechamento de inconsistência | o que divergia e como foi resolvido |
| Rejeição de notificação por autenticidade | ocorrência, instante, motivo, correlação técnica |

**PE-10.2** — A trilha **não** contém telefone/WhatsApp em texto claro fora da própria liberação autorizada (DEC-023), nem segredos, nem dados do pagador além do mínimo necessário.

**PE-10.3** — Retenção por categoria, conforme DEC-033: metadados financeiros mínimos por **5 anos** após a transação, como baseline a revisar por responsável jurídico e contábil antes da produção comercial; trilhas de auditoria por **24 meses**. Este documento **não** altera esses prazos.

**PE-10.4** — Com esta seção, a extensão da trilha de RF-022 à aprovação de pagamento deixa de depender de decisão aberta.

## 14. Segurança

**PE-11.1** — Access Token, chave secreta de webhook e qualquer credencial do provedor permanecem exclusivamente server-side, por ambiente, e nunca entram em bundle de cliente, Git, log, mensagem de erro, telemetria ou documentação (ADR-0004, decisão 6; RNF-015).

**PE-11.2** — Nenhum dado pessoal do pagador além do estritamente necessário é persistido no contexto de pagamento (RNF-008, DEC-033).

**PE-11.3** — O registro de notificação rejeitada é minimalista (PE-6.3) e não serve como canal indireto de vazamento de segredo.

**PE-11.4** — Estado de pagamento e existência de solicitação paga não são expostos em superfície pública nem a terceiros; a visibilidade ao anunciante segue RF-013 e limita-se às solicitações pagas válidas do seu anúncio.

**PE-11.5** — Nenhum caminho de exceção — reembolso, reconciliação, resolução de inconsistência — é acionável pela pessoa usuária final. Todos são server-side e autorizados.

## 15. Modelo conceitual mínimo

Conceitos suficientes para a implementação futura distinguir as situações desta política. **Não** é schema, **não** é máquina de estados completa e **não** antecipa a modelagem de F0-022.

| Estado da tentativa | Significado |
| --- | --- |
| `tentativa_criada` | Reserva ativa; cobrança sendo criada no gateway |
| `aguardando_pagamento` | Cobrança criada; nenhum pagamento acreditado ainda |
| `em_confirmacao` | Há indício de pagamento — notificação recebida ou consulta em curso — e o estado autoritativo ainda não foi confirmado, ou foi confirmado e o efeito local ainda não está persistido |
| `pagamento_confirmado` | Estado autoritativo `processed`/`accredited`, acreditação tempestiva e efeito local persistido. A solicitação é paga válida |
| `expirada` | Janela de reserva encerrada sem pagamento acreditado tempestivo; vaga liberada |
| `falha` | Estado autoritativo terminal sem acreditação, por exemplo `canceled` ou `failed`; vaga liberada |
| `reembolso_pendente` | Há valor acreditado a devolver e a devolução ainda não se concluiu |
| `reembolsada_ou_revertida` | O valor não está mais com o TROQ, por reembolso técnico concluído ou por reversão externa |
| `inconsistente` | Divergência conhecida, ou situação não coberta, aguardando reconciliação ou ação operacional |

Regras de leitura:

- **Solicitação paga válida** existe se, e somente se, a tentativa da reserva correspondente está em `pagamento_confirmado`.
- `reembolso_pendente` e `inconsistente` **nunca** conferem direito de negócio.
- `reembolsada_ou_revertida` sobre uma solicitação que **foi** válida preserva o consumo da vaga (PE-8.9); sobre uma exceção técnica, nunca houve vaga a preservar (PE-8.11).
- Os estados descrevem a **tentativa**, não a pessoa: uma solicitação tem no máximo uma tentativa vigente por reserva.

## 16. Matriz das exceções

Leitura das colunas: **consome vaga?** refere-se a RB-003; **reembolso?** refere-se exclusivamente ao reembolso técnico da seção 10; **elegível à escolha?** refere-se a RF-013 e a RB-001.

| # | Cenário | Estado autoritativo observado | Ação do TROQ | Consome vaga? | Reembolso? | Elegível à escolha? | Auditoria / reconciliação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Fluxo normal: pagamento acreditado dentro da janela | `processed`/`accredited` | Torna a solicitação paga válida | **Sim** | Não | **Sim** | Auditoria de aprovação; reconciliação periódica para detectar reversão |
| 2 | Cobrança criada, ninguém pagou ainda | `action_required`/`waiting_transfer` | Aguarda; nenhum direito concedido | Reserva ocupa provisoriamente | Não | Não | Em reconciliação até desfecho |
| 3 | Janela encerrada sem pagamento | `expired`/`expired`, ou qualquer estado sem acreditação | Libera a vaga; encerra a tentativa | Não | Não | Não | Auditoria de expiração |
| 4 | Notificação com assinatura inválida | irrelevante: não é consultado por causa dela | Rejeita; nenhum efeito; log mínimo de segurança | Sem alteração | Não | Sem alteração | Auditoria de rejeição, sem segredo |
| 5 | Notificação duplicada do mesmo fato | `processed`/`accredited` | Processa idempotentemente; efeito único | Sem alteração | Não | Sem alteração | Nenhum registro duplicado de aprovação |
| 6 | Notificação perdida, pagamento tempestivo | `processed`/`accredited` apurado por consulta | Reconhece pelo instante de acreditação (PE-4.2) | **Sim** | Não | **Sim** | Descoberta pela reconciliação, registrada como tal |
| 7 | Confirmação atrasada de pagamento feito a tempo | `processed`/`accredited`, acreditação dentro da janela | Trata como tempestivo | **Sim** | Não | **Sim** | Registra os dois instantes: acreditação e reconhecimento |
| 8 | Gateway confirmou, persistência local falhou | `processed`/`accredited` | Retoma a **mesma** operação; não recobra; não cria order nova | **Sim**, ao concluir | Não | Só depois de persistido | Caso permanece em reconciliação até convergir |
| 9 | Consulta ao gateway indisponível | desconhecido | Mantém pendente; nenhum direito | Reserva ocupa provisoriamente | Não | Não | Reconciliação insiste; incerteza nunca vira aprovação |
| 10 | Retentativa, duplo clique ou repetição de job na criação | uma única order | Idempotência evita a segunda cobrança | Sem alteração | Não | Sem alteração | Nada anômalo a registrar |
| 11 | Dois pagamentos acreditados para a mesma reserva | dois `processed`/`accredited` | Elege o canônico; o excedente é exceção técnica | **Uma** vaga apenas | **Sim**, do excedente (RT-1) | Sim, pelo canônico | Auditoria da duplicidade e do reembolso |
| 12 | Pagamento acreditado depois do fim da janela | `processed`/`accredited`, acreditação fora da janela | Não cria solicitação paga | Não | **Sim** (RT-2) | Não | Exceção técnica auditada e reconciliada |
| 13 | Pagamento acreditado, mas as três vagas já estão consumidas | `processed`/`accredited` | Não cria solicitação paga; RB-003 prevalece | Não | **Sim** (RT-3) | Não | Exceção técnica auditada |
| 14 | Corrida: pagamento tardio contra reserva legítima que tomou a vaga | `processed`/`accredited` | Prevalece a reserva legítima vigente | Não, para o tardio | **Sim** (RT-3) | Não, para o tardio | Auditoria da corrida resolvida |
| 15 | Cobrança criada por defeito técnico do TROQ | `processed`/`accredited` | Reconhece o erro; devolve | Não | **Sim** (RT-4) | Não | Exceção técnica; causa registrada |
| 16 | Reembolso técnico falha por saldo ou por prazo | valor ainda com o TROQ | Mantém `reembolso_pendente`; não oculta | Inalterado | **Pendente** | Não | Permanece aberto para reconciliação e ação operacional |
| 17 | Reversão externa antes da escolha | `refunded`, `partially_refunded` ou `charged_back` | Solicitação deixa de habilitar liberação de contato | **Sim**, permanece (PE-8.9) | Não: o valor já saiu | **Não** | Reversão registrada como evento novo; aprovação original preservada |
| 18 | Reversão externa depois da escolha e da liberação | idem | Registra que a divulgação ocorreu; não revoga o já liberado | **Sim**, permanece | Não | Escolha já consumada | Reversão auditada; negociação segue DEC-029 |
| 19 | MED ou suspeita de fraude sobre o pagamento recebido | reversão reportada pelo provedor | Preserva evidências; trata como reversão externa; não promete resultado | **Sim**, se a solicitação era válida | Não | Não, se ainda não escolhido | Evento de segurança e abuso, retido conforme DEC-033 |
| 20 | Indisponibilidade do Mercado Pago na criação da cobrança | nenhuma order confirmada | Não concede direito; não duplica tentativa; janela não é prorrogada | Reserva ocupa provisoriamente | Não | Não | Reconciliação apura se alguma order chegou a existir |
| 21 | Divergência entre estado local e autoritativo | qualquer | Corrige o local para refletir o autoritativo | Conforme o resultado | Conforme o resultado | Conforme o resultado | `inconsistente` até convergir |
| 22 | Estado autoritativo desconhecido ou não documentado | não mapeado | Trata como **não aprovado**; abre inconsistência | Não | Não, até apurar | Não | Nunca tratado por analogia |
| 23 | Solicitante pagou e **não foi escolhido** | `processed`/`accredited` | Nada a fazer: cobrança definitiva (RB-004) | **Sim** | **Não** | Não, por decisão do anunciante | Nenhuma exceção; não é caso desta política |
| 24 | Anúncio removido, negociação encerrada ou desistência | `processed`/`accredited` | Nada a fazer financeiramente (DEC-027, DEC-029, DEC-031, DEC-032) | **Sim**, permanece | **Não** | Conforme cada política citada | Nenhuma exceção financeira criada |

## 17. Relação com RB-003 e RB-004

### 17.1 RB-004 e o limite exato da definitividade

RB-004 é preservada **literalmente**: a cobrança de R$ 0,99 é definitiva, mesmo quando o solicitante não é escolhido.

**PE-12.1** — RB-004 qualifica **uma solicitação paga válida**. Ela responde à pergunta "o solicitante tem direito a reembolso por não ter sido escolhido?" — e a resposta é **não**, inclusive em desistência e reseleção, em encerramento de negociação e em remoção do anúncio.

**PE-12.2** — RB-004 **não** responde à pergunta "o TROQ pode reter dinheiro que recebeu por erro técnico?". A resposta a essa outra pergunta é **não**, e é o que esta política estabelece.

**PE-12.3** — Portanto, RB-004 **não** justifica: cobrança duplicada; cobrança sem vaga ou sem reserva válida; cobrança criada por defeito operacional; nem qualquer outra cobrança que nunca deveria ter se tornado solicitação paga válida. Confundir as duas perguntas transformaria uma regra de definitividade comercial em autorização para reter recebimento indevido, e isso **não** está em RB-004.

**PE-12.4** — A fronteira é objetiva e verificável: **existe solicitação paga válida?** Se sim, RB-004 governa e não há reembolso. Se não, é exceção técnica e há reembolso técnico.

### 17.2 RB-003 e o histórico de vagas

RB-003 é preservada **literalmente**: cada anúncio aceita no máximo 3 solicitações pagas.

**PE-12.5** — Nenhum caminho desta política produz uma quarta solicitação paga válida.

**PE-12.6** — Vaga consumida por solicitação que foi legitimamente válida permanece consumida, mesmo após reversão (PE-8.9). Reversão externa não é mecanismo de liberação de vaga.

**PE-12.7** — Exceção técnica nunca consumiu vaga e, portanto, nada há a devolver ao limite.

## 18. Critérios necessários para a implementação futura

O design de pagamentos (F0-022) e a implementação (Fase 3) devem satisfazer, no mínimo:

| # | Critério |
| --- | --- |
| CI-1 | Toda tentativa de pagamento tem identidade estável derivada da reserva, e a chave de idempotência da criação é derivada dela de forma determinística |
| CI-2 | Criação, notificação, transições, reembolso e cancelamento são idempotentes |
| CI-3 | O estado pode ser reconstruído integralmente por consulta autoritativa, sem nenhuma notificação |
| CI-4 | O instante de acreditação autoritativo é persistido separadamente do instante de reconhecimento pelo TROQ |
| CI-5 | A janela de reserva tem ao menos 30 minutos e o `expiration_time` da order não a excede |
| CI-6 | Reserva, pagamento, expiração, liberação de vaga e confirmação tardia são resolvidos atomicamente, sem instante observável com mais de três solicitações pagas válidas |
| CI-7 | Existe estado explícito de reembolso pendente, visível à operação e não encerrável sem desfecho |
| CI-8 | Reversões são detectadas por reconciliação periódica sobre pagamentos já confirmados |
| CI-9 | Estado autoritativo não mapeado abre inconsistência e nunca concede direito |
| CI-10 | Todos os eventos da seção 13 são auditados, sem segredo e sem contato em texto claro |
| CI-11 | Nenhuma superfície de cliente aciona reembolso, reconciliação ou resolução de inconsistência |
| CI-12 | Testes provam: não exceder três pagas válidas sob concorrência; notificação duplicada, fora de ordem e atrasada sem inconsistência; pagamento tardio sem criar vaga; e não concessão de direito com estado incerto |

## 19. Alternativas rejeitadas

| Alternativa | Decisão | Razão |
| --- | --- | --- |
| Aceitar o payload da notificação como prova de pagamento | **Rejeitada** | Transformaria qualquer emissor capaz de forjar um corpo em fonte de verdade; ADR-0004 já exige validar antes de processar, e esta política acrescenta que nem a notificação válida é fonte de estado |
| Usar a chegada da notificação como instante decisivo da tempestividade | **Rejeitada** | Puniria a pessoa usuária por atraso de rede ou de fila do provedor, e faria o mesmo pagamento ser válido ou inválido conforme a sorte da entrega |
| Aceitar pagamento tardio criando uma quarta solicitação paga | **Rejeitada** | Violaria RB-003 |
| Aceitar pagamento tardio ressuscitando a reserva expirada | **Rejeitada** | Tornaria a expiração ficção e criaria corrida insolúvel com a reserva legítima que ocupou a vaga |
| Reter o valor do pagamento tardio ou duplicado, invocando RB-004 | **Rejeitada** | RB-004 qualifica solicitação paga válida; usá-la aqui converteria erro técnico em receita (PE-12.2) |
| Criar nova cobrança quando a persistência local falha | **Rejeitada** | Duplicaria a cobrança para resolver um problema que é local, exatamente o oposto do que a idempotência existe para impedir |
| Marcar pagamento como aprovado após N tentativas de consulta sem resposta | **Rejeitada** | Converteria indisponibilidade em aprovação e poderia liberar contato sem pagamento, violando RB-001 |
| Estender a janela de reserva automaticamente quando o gateway estiver indisponível | **Rejeitada** | Tornaria o limite de RB-003 dependente da saúde de terceiro e abriria caminho para reserva indefinida |
| Encerrar silenciosamente casos de reembolso que falharam | **Rejeitada** | Esconderia dinheiro retido indevidamente; o caso precisa permanecer visível |
| Devolver a vaga quando houver reversão externa | **Rejeitada** | Abriria uma quarta oportunidade paga por caminho indireto e tornaria o limite manipulável |
| Apagar o registro da aprovação quando houver reversão | **Rejeitada** | Falsificaria o histórico e destruiria a auditoria justamente no caso em que ela mais importa |
| Revogar contato já liberado após reversão | **Rejeitada** | Tecnicamente impossível — o dado já foi divulgado — e contrário a RB-001 e a DEC-032 |
| Tratar desacordo comercial como hipótese de MED | **Rejeitada** | Contraria o guia do Banco Central (BC-4), que remete desacordo comercial ao Poder Judiciário |
| Usar "chargeback" como termo genérico para reversão de Pix | **Rejeitada** | Contraria BC-5 e importaria para o Pix a semântica de outro arranjo de pagamento |
| Criar política comercial de reembolso por insatisfação | **Rejeitada** | Fora do escopo desta decisão e contrária a RB-004; exigiria decisão própria |
| Usar reembolso parcial | **Rejeitada** | R$ 0,99 é indivisível neste modelo; a parcialidade só criaria estados intermediários sem finalidade |
| Fixar aqui tempos de retry, periodicidade de reconciliação e duração da reserva | **Rejeitada** | São design (F0-022); fixá-los aqui confundiria regra de negócio com detalhe operacional. O que é normativo é o piso de 30 minutos, que existe para evitar incompatibilidade com o gateway |

## 20. Rastreabilidade

| Item | Efeito desta decisão |
| --- | --- |
| OD-07 | **Fechada** por este documento (DEC-037) |
| RF-009 | Passa a `definido`. A solicitação só é paga válida com pagamento canônico acreditado dentro da janela; não paga ou expirada não ocupa vaga |
| RF-010 | Passa a `definido`. O tratamento de exceções está aqui e a janela de reserva tem piso normativo de 30 minutos; a duração concreta acima do piso é design de F0-022, não decisão aberta |
| RF-011 | Passa a `definido`. Falha, duplicidade, pagamento após a expiração e reversão têm tratamento normativo |
| RF-012 | Passa a `definido`. Confirmação, assinatura inválida, duplicidade, perda, falha de persistência, indisponibilidade e reconciliação têm tratamento normativo |
| RF-020 | Permanece `definido`. O tratamento financeiro de solicitação paga de anúncio removido deixa de ser lacuna: **não** há reembolso, por PE-7.5 |
| RF-022 | Passa a `definido`. Os eventos auditados do pagamento estão enumerados na seção 13 |
| RB-001 | Preservada. Sem pagamento aprovado vigente não há liberação; liberação concedida não é revogada |
| RB-003 | Preservada literalmente. Nenhum caminho produz uma quarta solicitação paga válida; vaga consumida é fato histórico |
| RB-004 | Preservada literalmente, com sua fronteira explicitada: definitiva para solicitação paga válida, e não autorização para reter recebimento indevido |
| DEC-019 | Preservada. Reserva atômica antes da cobrança, com expiração, continua sendo o direcionamento; esta política diz o que acontece nas bordas |
| DEC-027, DEC-029, DEC-031, DEC-032, DEC-033, DEC-034, DEC-035 | Preservadas integralmente. Nenhuma delas gera reembolso, e nenhuma tem seu texto alterado por esta política |
| ADR-0004 (DEC-036) | Preservada integralmente. Esta política **usa** suas decisões 7 a 12 e não altera nenhuma. A seção 4.3 registra um refinamento factual sobre o reenvio de notificações, sem efeito normativo |
| F0-019 | Concluído por esta entrega |
| F0-022 | Deixou de estar bloqueado e foi **concluído** em 2026-09-14. O desenho correspondente está em [../architecture/payments-design.md](../architecture/payments-design.md), que rastreia CI-1 a CI-12 um a um e **não** altera nenhuma regra desta política |
| R-02 | Mitigado no plano normativo: a regra de não exceder três está explícita para todas as exceções. O mecanismo atômico foi definido por F0-022 em [../architecture/data-model.md](../architecture/data-model.md) (DM-6) |
| R-04 | Mitigado no plano normativo: notificação perdida, duplicada, fora de ordem e tardia têm tratamento definido, com reconciliação autoritativa |
| R-11 | **Novo.** O reembolso técnico pode falhar por saldo insuficiente ou pelo prazo de 180 dias do provedor (MP-5) |

## 21. Revisão

Este documento é revisado quando: o Mercado Pago alterar estados, endpoints, prazos ou política de notificações; o Banco Central alterar as regras de devolução ou do MED — a versão 4.4 do guia já está anunciada, com vigências em 2026-09-01 e 2026-10-26; ou antes do lançamento comercial, junto com a conferência da tarifa contratada prevista em R-01.

A condição "F0-022 produzir `architecture/payments-design.md`" foi **satisfeita em 2026-09-14**. A revisão decorrente foi feita e o resultado é que **nada aqui mudou**: o desenho converteu esta política em mecanismo, sem alterar nenhuma regra, sem criar hipótese de reembolso e sem afrouxar nenhum invariante. As delegações a F0-022 que este documento fazia — critério de eleição do canônico (PE-3.1), duração da janela acima do piso (PE-4.4), mecanismo atômico (PE-5.4), tempos (PE-6.16) e periodicidade da reconciliação (PE-9.7) — estão atendidas em [../architecture/payments-design.md](../architecture/payments-design.md) e [../architecture/data-model.md](../architecture/data-model.md).
