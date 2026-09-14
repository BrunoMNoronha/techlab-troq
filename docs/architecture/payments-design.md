# Desenho técnico de pagamentos — TROQ

Desenho de pagamentos pré-implementação do MVP. Produzido por **F0-022**, junto com [overview.md](overview.md), [data-model.md](data-model.md) e [contact-release.md](contact-release.md).

Este documento **converte a política em mecanismo**. A política normativa é [product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037) e o gateway homologado é o de [ADR-0004](../adr/0004-mercado-pago-pix.md) (DEC-036). Nenhum comportamento de negócio é inventado aqui: onde este documento decide, ele decide **mecanismo, tempos e estrutura** — exatamente o que aquelas fontes deixaram expressamente para F0-022.

Não implementa nada: nenhum endpoint, nenhum SDK, nenhum schema, nenhuma migration, nenhum segredo, nenhuma configuração de painel e nenhum pagamento real.

Os itens são identificados como `PD-x`.

## 1. A regra que governa todo o desenho

**PD-1.1 (normativa).** A notificação do provedor é **gatilho de processamento**. O estado autoritativo é o que o Mercado Pago reporta em consulta direta à order. Estado incerto **nunca** produz aprovação local (PE-1.1 a PE-1.6).

**PD-1.2 (decisão arquitetural).** Disso decorre o critério de aceite interno do desenho, ao qual todas as decisões seguintes se submetem:

> **O sistema deve produzir o estado correto se nenhuma notificação chegar, se toda notificação chegar duas vezes, se as notificações chegarem fora de ordem, e se o trabalho periódico deixar de disparar em alguma execução.**

Cada uma dessas quatro condições é uma hipótese **normal** de operação, não um incidente: as três primeiras por PE-9.2 e por MP-4, e a quarta porque o agendamento da plataforma é declaradamente best effort (AR-15.2).

## 2. Entidades

Lugar no modelo em [data-model.md](data-model.md), seção 7. Aqui, o conteúdo de cada uma.

### 2.1 `PaymentAttempt` — a unidade de idempotência

| Campo lógico | Conteúdo |
| --- | --- |
| Solicitação | A `ContactRequest` (reserva) à qual a tentativa pertence — **exatamente uma** (PE-2.1) |
| Chave de idempotência | O valor enviado em `X-Idempotency-Key`, persistido (PD-2) |
| Referência externa da order | O identificador da order no provedor, quando conhecido |
| Referência externa própria | O `external_reference` enviado ao provedor, derivado da identidade da tentativa |
| Estado | Conforme PD-3.2 |
| Pagamento canônico | Referência ao `Payment` eleito, quando houver (PE-3.1) |
| Instante de acreditação autoritativo | Do provedor (CI-4) |
| Instante de reconhecimento pelo TROQ | Quando o TROQ tomou conhecimento (CI-4) |
| Origem do reconhecimento | `notificacao` ou `reconciliacao` (PE-10.1) |

**PD-2.1 (invariante).** Uma tentativa por solicitação, garantida por restrição de banco (DM-7.1). Retentar a **mesma** solicitação é a **mesma** tentativa lógica; solicitações diferentes são tentativas diferentes (PE-2.1).

### 2.2 `Payment` — um pagamento reportado pelo provedor

Identificador do pagamento no provedor (único, DM-7.3), valor, estado autoritativo observado, `status_detail`, instante de acreditação, instantes de observação, e se é o canônico da tentativa.

**PD-2.2.** `Payment` é um **espelho do que o provedor reportou**, não uma afirmação do TROQ. Ele existe para que a decisão de negócio seja tomada contra um fato registrado e auditável, e para que a duplicidade seja detectável.

### 2.3 `TechnicalRefund`

Pagamento alvo, hipótese aplicada (`RT-1` a `RT-4`, exaustivas por PE-7.2), estado (`pendente`, `concluido`, `falhou_retentando`, `pendente_operacional`), número e resultado de cada tentativa, instante do desfecho.

**PD-2.3 (invariante).** Um reembolso por pagamento. Reembolso é sempre **integral**; não existe reembolso parcial no MVP (PE-7.3).

### 2.4 `PaymentNotification`

Cada notificação recebida, **depois de validada**: identificador de requisição do provedor, `data.id` normalizado, instante de recebimento, resultado do processamento. Notificações **rejeitadas** por autenticidade geram apenas registro mínimo de segurança — ocorrência, instante, motivo e correlação técnica —, **nunca** segredo nem payload capaz de reconstituí-lo (PE-6.3).

### 2.5 `ReconciliationCase`

Tentativa alvo, tipo (`pendente`, `divergencia`, `reembolso_pendente`, `inconsistente`), motivo, instante de abertura, instante e desfecho do fechamento.

**PD-2.4 (invariante).** Caso aberto **nunca** confere direito de negócio e **não** pode ser fechado sem desfecho real (PE-7.9, PE-9.5, PE-9.6, CI-7).

## 3. Tempos — as decisões que a política delegou

### 3.1 Janela de reserva

**PD-3.1 (decisão arquitetural).** A janela de reserva do TROQ é de **exatamente 30 minutos**.

Fundamento: PE-4.4 fixa o piso normativo de 30 minutos e delega a duração concreta a F0-022; MP-1 registra que 30 minutos é o **menor** `expiration_time` que a Orders API aceita. Escolher exatamente o piso produz a única configuração em que a validade da cobrança no gateway pode ser **idêntica** ao fim da janela, sem que a cobrança sobreviva à reserva (PE-4.5) e sem que a reserva sobreviva à cobrança. Qualquer valor acima do piso obrigaria a cobrança a expirar antes da reserva — o que amplia, em vez de reduzir, a janela em que existe reserva viva sem cobrança válida.

Efeitos concretos:

- `reservedUntil` = `reservedFrom` + 30 minutos;
- o `expiration_time` enviado em `POST /v1/orders` é **exatamente** `reservedUntil`;
- **não** há prorrogação automática, extensão silenciosa nem reabertura, inclusive em indisponibilidade do provedor (PE-4.7);
- a validação da tempestividade **não** é delegada ao gateway: o TROQ compara o instante de acreditação autoritativo com `reservedUntil` por conta própria, e o `expiration_time` é apenas defesa adicional (PE-4.6).

**PD-3.2 (detalhe de implementação).** Se a operação futura demonstrar, com dados, que 30 minutos é curto demais para o comportamento real do Pix do público-alvo, aumentar a janela é ajuste de design, não decisão aberta — desde que o `expiration_time` continue igual ao fim da janela e o piso de 30 minutos seja respeitado.

### 3.2 Estados da tentativa

Os estados são os de DEC-037, seção 15, sem acréscimo, sem renomeação e sem estado intermediário novo:

`tentativa_criada`, `aguardando_pagamento`, `em_confirmacao`, `pagamento_confirmado`, `expirada`, `falha`, `reembolso_pendente`, `reembolsada_ou_revertida`, `inconsistente`.

**PD-3.3 (invariante).** A solicitação está em `paid` **se e somente se** a tentativa da sua reserva está em `pagamento_confirmado` (DM-6.1). Nenhum outro estado — em especial `em_confirmacao`, `reembolso_pendente` e `inconsistente` — concede elegibilidade à escolha ou à liberação de contato (PE-6.11, PE-6.14).

### 3.3 Cadências dos trabalhos periódicos

**PD-3.4 (decisão arquitetural).** Quatro trabalhos periódicos, todos idempotentes, todos convergentes e **nenhum deles fonte de invariante** (AR-15.3). As cadências abaixo são decisão de design e podem ser ajustadas por medição, sem nova decisão registrada.

| Trabalho | Cadência | O que faz | Por que essa cadência |
| --- | --- | --- | --- |
| Reconciliação de tentativas ativas | **a cada 5 minutos** | Consulta o estado autoritativo de toda tentativa em estado não terminal e converge o estado local | Dentro de uma janela de 30 minutos, dá ~6 oportunidades de convergir; o provedor reenvia notificação a cada 15 minutos nas três primeiras tentativas (MP-4), e a reconciliação precisa ser mais frequente que isso para não depender dele |
| Varredura de reversões | **diária** | Reconsulta pagamentos já confirmados para detectar reembolso ou reversão | A documentação consultada **não** expõe notificação própria para reembolso ou reversão (PE-8.4): a detecção só existe por consulta. A cadência diária é suficiente porque o efeito da reversão é sobre elegibilidade futura, não sobre um fato a desfazer |
| Retentativa de reembolso | **de hora em hora**, com recuo exponencial por caso | Retenta reembolsos em `falhou_retentando` | As duas causas documentadas de falha — saldo insuficiente e prazo de 180 dias (MP-5) — mudam em escala de horas e dias, não de minutos. Retentar mais rápido apenas gastaria chamadas |
| Higiene | **diária** | Materializa `publishedAt` de avaliações com janela vencida, expurga originais temporários de imagem com mais de 24 horas, aplica os prazos de retenção de DEC-033 | Nenhuma invariante depende dela (AR-15.3, DM-9.4) |

**PD-3.5 (decisão arquitetural).** Um caso em `reembolso_pendente` **nunca** é encerrado por esgotamento de tentativas. Depois de um número de tentativas automáticas sem sucesso, ele passa a `pendente_operacional` e **permanece aberto e visível** (AR-14.3), porque continua sendo dinheiro que o TROQ não tem direito de reter (PE-7.10).

**PD-3.6 (decisão arquitetural).** Nenhum limite de tempo, esgotamento de tentativas ou conveniência operacional converte estado incerto em aprovado (PE-6.16). Não existe, em nenhum ponto deste desenho, um caminho que leve a `pagamento_confirmado` sem um estado autoritativo `processed`/`accredited` observado por consulta.

## 4. Criar a solicitação e a cobrança

**PD-4.1 (decisão arquitetural — ordem obrigatória).** O fluxo de criação tem **três passos, em três transações distintas**, nesta ordem. A ordem é o que torna o sistema recuperável.

**Passo 1 — reservar a vaga e registrar a intenção (uma transação).**

1. Verifica sessão autenticada e verificada, e anúncio `published` (DM-6.9).
2. Adquire a trava de escopo de transação do anúncio (DM-6.3, DM-6.5).
3. Expira as reservas vencidas daquele anúncio que não tenham pagamento acreditado tempestivo reconhecido.
4. Aloca o menor `slotIndex` livre; **se não houver, recusa** (RB-003, RF-010).
5. Cria a `ContactRequest` em `reserved`, com `reservedUntil` = agora + 30 minutos.
6. Cria a `PaymentAttempt` em `tentativa_criada`, com a chave de idempotência **já persistida** (PD-5).
7. Grava a auditoria de criação da reserva e da tentativa.
8. **Commita.**

**Passo 2 — criar a cobrança no provedor (fora de transação).**

Chama `POST /v1/orders` com Pix, `total_amount` exatamente `0.99`, `expiration_time` = `reservedUntil` e o `X-Idempotency-Key` persistido no passo 1. **Não** envia `notification_url` — a Orders API a rejeita com `HTTP 400` e a URL é configurada no nível da aplicação (ADR-0004, decisão 11).

**Passo 3 — registrar o resultado (uma transação).**

Persiste o identificador da order e move a tentativa para `aguardando_pagamento`.

**PD-4.2 (decisão arquitetural — por que a intenção é commitada antes da chamada).** Se a aplicação falhar **entre** o passo 2 e o passo 3, existe uma order no provedor cujo identificador o TROQ não conhece. O passo 1, já commitado, é o que torna isso recuperável: a tentativa existe, está em estado não terminal, entra na reconciliação e é reencontrada pelo `external_reference` derivado da sua identidade. A ordem inversa — chamar o provedor e só depois persistir — produziria cobranças órfãs que o TROQ não teria como sequer procurar. Este é o desenho que satisfaz PE-6.7 a PE-6.10 na criação, e não apenas na confirmação.

**PD-4.3 (invariante).** **Nunca** se cria uma segunda order para a mesma reserva enquanto a anterior não tiver desfecho terminal conhecido (PE-6.15). A tentativa única por solicitação (PD-2.1) torna essa regra estrutural: não há onde guardar uma segunda tentativa.

**PD-4.4 (invariante).** Indisponibilidade do provedor na criação **não** concede direito, **não** duplica tentativa e **não** prorroga a janela (PE-4.7, cenário 20 de DEC-037). A tentativa fica em estado não terminal; a reconciliação apura se alguma order chegou a existir.

**PD-4.5 (normativa).** O valor é exatamente `0.99`, sem arredondamento, agregação ou ajuste (ADR-0004, decisão 5; RB-004), representado internamente sem ponto flutuante (DM-1.3).

## 5. Identidade e idempotência

**PD-5.1 (decisão arquitetural).** A chave de idempotência é derivada de forma **determinística** da identidade da tentativa, por função de hash sobre um espaço de nomes fixo do TROQ concatenado ao identificador da tentativa. Propriedades exigidas:

1. a mesma tentativa, retentada, produz a mesma chave;
2. tentativas diferentes **nunca** colidem;
3. a chave não revela nada sobre a pessoa usuária, o anúncio ou o valor.

**PD-5.2 (decisão arquitetural — o ponto que evita um defeito sutil).** A chave é **persistida** no passo 1 e **relida** em toda retentativa; ela nunca é rederivada no momento da chamada. Rederivar parece equivalente, mas não é: qualquer mudança futura no espaço de nomes, no algoritmo ou nos campos de entrada faria uma retentativa de uma tentativa **antiga** produzir uma chave **nova**, e a segunda cobrança que a idempotência existia para impedir aconteceria exatamente na retentativa — o caso em que ela mais importa. Persistir elimina essa classe inteira de falha.

**PD-5.3 (invariante).** São idempotentes, além da criação: o processamento de notificações, as transições internas de estado, o reembolso técnico e o cancelamento. Reembolso e cancelamento também carregam `X-Idempotency-Key` (PE-2.4, MP-5, MP-6).

**PD-5.4 (decisão arquitetural — idempotência do efeito, não da entrega).** A idempotência de negócio **não** é feita deduplicando a entrega da notificação. Razão: duas entregas do mesmo fato podem trazer identificadores de requisição diferentes, e deduplicar por entrega deixaria passar o efeito duplicado exatamente quando o provedor reenviasse.

A idempotência é feita no **efeito**, por três mecanismos combinados:

1. `Payment` único pelo identificador do pagamento no provedor (DM-7.3): o mesmo pagamento nunca vira duas linhas;
2. transição de estado por **atualização condicionada ao estado de origem esperado**: a segunda execução não encontra a condição e não produz efeito;
3. eleição do canônico condicionada a ainda não haver canônico eleito (DM-7.4).

O registro de `PaymentNotification` serve à auditoria e ao diagnóstico, não à corretude. Isso satisfaz PE-2.5 e CI-2 sem depender de uma propriedade que o provedor não garante.

## 6. Receber a notificação e confirmar o pagamento

### 6.1 O receptor de webhook

**PD-6.1 (decisão arquitetural — ordem obrigatória).** O receptor executa, nesta ordem, e **para** no primeiro passo que falhar:

1. **Identificar** a notificação conforme o contrato oficial.
2. **Validar** a assinatura pela **única** regra oficial de manifesto HMAC — `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, com `data.id` lido do **query param** e convertido para minúsculas, `x-request-id` do header, `ts` extraído de `x-signature`, campos ausentes removidos do manifesto —, **sem fallback entre variantes** e **sem remontar o manifesto a partir do corpo** (ADR-0004, decisões 8 e 9).
3. **Só então processar.**

**PD-6.2 (invariante).** Notificação que não passe na validação **não** produz efeito algum, **não** marca pagamento como aprovado e **não** altera estado. Registra-se apenas o mínimo de segurança (PE-6.1 a PE-6.3).

**PD-6.3 (decisão arquitetural — o que o receptor faz depois de validar).** O receptor **não** decide a verdade. Ele, em uma transação curta: registra a `PaymentNotification`, correlaciona com a tentativa pelo identificador da order, marca a tentativa como pendente de reconciliação — movendo-a para `em_confirmacao` quando ela estiver em `aguardando_pagamento` — e commita. Em seguida, **se houver orçamento de tempo**, executa a rotina de confirmação (6.2) na mesma invocação; caso contrário, deixa para o trabalho periódico. Em ambos os casos responde `HTTP 200`.

**PD-6.4 (fato externo).** O endpoint deve responder `HTTP 200` ou `201` em até **22 segundos**; sem essa confirmação o reenvio ocorre a cada 15 minutos nas três primeiras tentativas e depois com prazo estendido (MP-4). O orçamento de tempo de PD-6.3 existe para caber com folga nesse limite.

**PD-6.5 (decisão arquitetural — a consequência assumida).** Responder `200` sem ter concluído o processamento faz o provedor **parar de reenviar**. Isso é **deliberado e seguro**, porque a reconciliação por consulta reconstrói o estado sem nenhuma notificação (PE-1.3, PE-9.2, CI-3). O desenho alternativo — segurar a resposta até concluir — trocaria uma garantia que o TROQ controla (a reconciliação) por uma que depende da rede e das filas do provedor, e ainda arriscaria estourar os 22 segundos justamente sob carga.

### 6.2 A rotina de confirmação

**PD-6.6 (decisão arquitetural).** A confirmação é sempre **contra o estado autoritativo**, nunca contra o corpo da notificação. Ela executa:

1. `GET /v1/orders/{id}` — a consulta autoritativa (PE-1.1, MP-7).
2. Espelha em `Payment` cada pagamento reportado, com estado, `status_detail` e instante de acreditação.
3. Classifica o estado autoritativo:

| Estado autoritativo | Classificação | Ação |
| --- | --- | --- |
| `processed` / `accredited` na order **e** na transação Pix | **Acreditado** | Segue para o passo 4 |
| `created`, `processing`/`in_process`, qualquer `action_required` | Não acreditado, não terminal | Mantém `em_confirmacao` ou volta a `aguardando_pagamento`; segue em reconciliação |
| `expired`, `canceled`, `failed` | Não acreditado, terminal | `falha` ou `expirada`; libera a vaga |
| `refunded`, `partially_refunded`, qualquer `charged_back` | Reversão | Seção 9 |
| Qualquer outro, desconhecido ou ausente | **Não aprovado** | Abre `inconsistente`; **nunca** trata por analogia (PE-1.5, PE-9.6, CI-9) |

4. **Transação de efeito**, sob a trava do anúncio (DM-6.3):
   - relê a `ContactRequest` travada;
   - verifica que ela está em `reserved` **e** que o instante de acreditação autoritativo é menor ou igual a `reservedUntil`;
   - satisfeitas as duas, elege o canônico (PD-7), move a tentativa para `pagamento_confirmado` e a solicitação para `paid` — **consumindo a vaga**;
   - persiste os **dois** instantes e a origem do reconhecimento (CI-4);
   - grava a auditoria de aprovação;
   - commita.
5. Falhando qualquer das duas verificações do passo 4, o pagamento é **exceção técnica**: não cria solicitação paga, não consome vaga e entra em reembolso técnico (seção 8).

**PD-6.7 (invariante).** A comparação de tempestividade usa o instante de **acreditação**, jamais o de chegada da notificação nem o de processamento (PE-4.1). Confirmação atrasada de pagamento feito a tempo **vale** (PE-4.2); pagamento acreditado depois do fim da janela **não** ressuscita a reserva (PE-4.3).

**PD-6.8 (invariante).** Se o gateway confirmou e a persistência local falhou, a **mesma** operação é retomada, pela mesma identidade de tentativa, até que o efeito local corresponda ao autoritativo. **Não** se cobra de novo e **não** se cria order nova (PE-6.7 a PE-6.10). Enquanto o efeito não estiver persistido, nenhum direito é concedido (PE-6.11).

**PD-6.9 (invariante).** Indisponibilidade da consulta mantém a tentativa pendente e sob reconciliação. **Nunca** converte incerteza em aprovação (PE-6.12 a PE-6.14).

## 7. Duplicidade e eleição do pagamento canônico

**PD-7.1 (decisão arquitetural).** Havendo dois ou mais pagamentos acreditados para a mesma reserva, o canônico é eleito por esta regra, nesta ordem:

1. o pagamento com o **menor instante de acreditação autoritativo**;
2. em empate exato, o de **menor identificador de pagamento do provedor**, em ordem lexicográfica.

A regra é determinística, total e não depende de ordem de chegada, de ordem de processamento nem do relógio local — as três coisas que variam entre execuções e que tornariam a eleição instável. Isso satisfaz a única exigência normativa de PE-3.1: ser determinística, aplicada uma única vez e registrada.

**PD-7.2 (invariante).** A eleição é aplicada **uma única vez**, por atualização condicionada a ainda não haver canônico (DM-7.4). Reprocessar não reelege.

**PD-7.3 (invariante).** Da duplicidade decorre, obrigatoriamente: **uma** solicitação paga (PE-3.2), **uma** vaga consumida (PE-3.3), e o excedente em **reembolso técnico integral** sob a hipótese RT-1 (PE-3.4).

**PD-7.4 (invariante).** Os dois pagamentos, a eleição, a identificação do excedente e o desfecho do reembolso são auditados (PE-3.5). Falha do reembolso permanece visível e **jamais** é convertida em solicitação válida, crédito, vaga extra ou qualquer benefício (PE-3.6).

**PD-7.5 (normativa).** Duplicidade técnica **jamais** é tratada como cobrança válida definitiva de RB-004 (PE-3.7, PE-12.3).

## 8. Reembolso técnico e cancelamento

**PD-8.1 (normativa).** As hipóteses são **exaustivas** (PE-7.2): RT-1 duplicidade (excedente); RT-2 acreditação depois do fim da janela; RT-3 acreditação sem reserva válida vigente, inclusive quando a vaga já foi legitimamente ocupada por outra solicitação; RT-4 cobrança criada por defeito técnico do TROQ. Nenhuma outra hipótese é autorizada.

**PD-8.2 (decisão arquitetural).** A hipótese é **determinada e persistida** no ato da classificação, e não recalculada depois. Razão: a condição que a caracterizou — por exemplo, "a vaga estava ocupada naquele instante" — pode não ser mais verdadeira quando o reembolso for retentado, e um recálculo tardio poderia reclassificar ou, pior, não encontrar hipótese alguma para um caso legítimo.

**PD-8.3 (decisão arquitetural).** **Reembolsar ou cancelar** é escolhido pelo estado autoritativo, não pela intenção:

- order em `created` ou `action_required`, sem acreditação: o caminho é **cancelamento** (`POST /v1/orders/{id}/cancel`), que **não** é reembolso e **não** é exceção técnica (PE-7.4, MP-6);
- valor acreditado: o caminho é **reembolso total** (`POST /v1/orders/{id}/refund`, sem valor no corpo), com `X-Idempotency-Key` (PE-7.7, MP-5).

**PD-8.4 (invariante).** O reembolso é sempre **integral**. Reembolso parcial **não** é usado no MVP: R$ 0,99 é indivisível neste modelo (PE-7.3).

**PD-8.5 (decisão arquitetural — tratamento dos erros documentados).**

| Resposta do provedor | Interpretação do TROQ |
| --- | --- |
| Sucesso | `concluido`. Registra os dados da devolução reportados pelo provedor |
| `order_already_refunded` | **Desfecho de sucesso**, não erro a repetir (PE-7.11). O caso fecha como `concluido` |
| Saldo insuficiente | `falhou_retentando`. Causa transitória: retenta com recuo exponencial (PD-3.4) |
| Fora do prazo de 180 dias | `pendente_operacional` imediatamente. Retentar é inútil: a condição não volta a ser verdadeira |
| `order_not_found` | Abre `inconsistente`. Nunca se conclui daí que não havia dinheiro |
| Erro não mapeado | Abre `inconsistente` (PE-9.6) |

**PD-8.6 (invariante).** Falha de reembolso **não** é ocultada, **não** é encerrada sem desfecho real e **nunca** vira receita reconhecida, vaga, elegibilidade ou silêncio (PE-7.9, PE-7.10). O caso permanece em AR-14.3.

**PD-8.7 (fato externo).** Os dois limites são do provedor e não estão sob controle do TROQ: prazo de **180 dias** a partir da aprovação e exigência de **saldo suficiente** (MP-5). Ambos já estão registrados como R-11.

**PD-8.8 (normativa).** **Não** geram reembolso: não ter sido escolhido (RB-004 literal), desistência, reseleção, encerramento da negociação, anúncio pausado, encerrado ou removido, bloqueio cautelar etário, insatisfação e arrependimento (PE-7.5). Nenhum caminho deste desenho os alcança.

**PD-8.9 (invariante).** Nenhuma superfície de cliente aciona reembolso, reconciliação ou resolução de inconsistência. Todos são server-side e autorizados (PE-11.5, CI-11). Não existe rota, ação ou parâmetro que permita a uma pessoa usuária final disparar qualquer um deles.

## 9. Reversões posteriores

**PD-9.1 (decisão arquitetural).** A reversão é detectada **exclusivamente por reconciliação**, pela varredura diária de PD-3.4, porque a documentação consultada não expõe notificação própria para reembolso ou reversão (PE-8.4). Qualquer estado autoritativo que deixe de representar pagamento efetivamente acreditado caracteriza reversão, independentemente de qual valor específico o provedor use.

**PD-9.2 (invariante).** Efeitos, exatamente como PE-8.5 a PE-8.12:

| Situação | Efeito |
| --- | --- |
| Sempre | A aprovação original é **fato histórico**: preservada em histórico e auditoria. A reversão é **evento novo**, com instante e origem. Nada é apagado |
| Sempre | A vaga **permanece consumida**. A linha continua `paid`; a transição de saída é proibida (DM-6.7) |
| Solicitação ainda **não** escolhida | Torna-se **inelegível** à escolha e deixa de ser apresentada ao anunciante como opção |
| Contato **já** liberado | A divulgação é fato consumado. **Não** se revoga, **não** se finge que pode ser desfeita. A negociação segue DEC-029 |
| Sempre | **Não** gera nova cobrança, cobrança de recuperação nem dívida da pessoa usuária |

**PD-9.3 (normativa — vocabulário).** `chargeback` é vocabulário de arranjos de cartão e **não** descreve o Pix (BC-5, PE-8.1). Quando um valor de status do provedor usa a palavra, trata-se de valor técnico da API. Desacordo comercial **não** é hipótese de MED (BC-4, PE-8.2). O TROQ **não** promete resultado que dependa de instituições financeiras (PE-8.3).

**PD-9.4.** Pagamento técnico que nunca foi válido nunca consumiu vaga e, portanto, nada há a devolver ao limite (PE-8.11, PE-12.7).

## 10. Reconciliação

**PD-10.1 (invariante).** Fonte autoritativa: `GET /v1/orders/{id}` (PE-9.1). A reconciliação deve reconstruir o estado correto **sem nenhuma notificação** (PE-9.2, CI-3).

**PD-10.2.** Entram em reconciliação, no mínimo: toda tentativa em estado não terminal; toda divergência entre estado local e autoritativo; todo caso em `reembolso_pendente`; toda inconsistência aberta; e, periodicamente, os pagamentos já confirmados, para detectar reversão (PE-9.3).

**PD-10.3 (decisão arquitetural).** O trabalho de reconciliação **reclama** os casos a processar por seleção travada que **pula linhas já travadas** por outra execução (`FOR UPDATE SKIP LOCKED`), em lotes. Consequências:

- duas execuções sobrepostas — hipótese normal, AR-15.2 — processam conjuntos **disjuntos**, sem colidir e sem duplicar efeito;
- uma execução que morra no meio libera suas linhas ao término da transação, e a execução seguinte as reencontra;
- não é preciso nem broker nem trava global para um trabalho periódico correto.

**PD-10.4 (invariante).** A reconciliação é **idempotente**: executá-la N vezes sobre o mesmo caso produz o mesmo resultado (PE-9.4). Ela corrige o local para refletir o autoritativo; **nunca** inventa estado, **nunca** resolve ambiguidade a favor da aprovação e **nunca** fecha caso sem desfecho real (PE-9.5).

**PD-10.5 (invariante).** Situação não coberta pela política vai para `inconsistente`, com registro, e **não** recebe tratamento por analogia nem concessão de direito (PE-9.6, CI-9).

**PD-10.6 (decisão arquitetural).** Cada execução do trabalho tem **orçamento de tempo** e processa em lotes, terminando com o que couber e deixando o resto para a execução seguinte. Um trabalho que tenta esgotar a fila a qualquer custo colide com o limite de duração da função e é interrompido no meio — o que, num trabalho não retentado pela plataforma (AR-15.2), é pior do que terminar cedo de propósito.

## 11. Segurança

**PD-11.1 (normativa).** Access Token, chave secreta de webhook e qualquer credencial permanecem exclusivamente server-side, por ambiente, e **nunca** entram em bundle de cliente, Git, log, mensagem de erro, telemetria ou documentação (ADR-0004 decisão 6, RNF-015, PE-11.1).

**PD-11.2 (normativa).** Nenhum dado pessoal do pagador além do estritamente necessário é persistido (PE-11.2, RNF-008).

**PD-11.3 (normativa).** Estado de pagamento e existência de solicitação paga **não** são expostos em superfície pública nem a terceiros. A visibilidade ao anunciante limita-se às solicitações pagas válidas do seu anúncio (PE-11.4, RF-013).

**PD-11.4 (decisão arquitetural).** O endpoint de webhook não tem outra autorização senão a assinatura: ele é, por natureza, público e não autenticado por sessão. Os endpoints dos trabalhos periódicos, ao contrário, exigem o segredo de agendamento ([ADR-0006](../adr/0006-async-work-scheduling-concurrency.md)) e recusam qualquer chamada sem ele.

**PD-11.5 (decisão arquitetural).** O adaptador do provedor é o **único** lugar que conhece `order`, `x-signature`, `data.id`, `X-Idempotency-Key` e os valores de `status`/`status_detail`. O domínio recebe apenas conceitos do TROQ: acreditado ou não, instante de acreditação, e uma classificação fechada (ADR-0004, decisão 10).

## 12. Rastreamento de CI-1 a CI-12

Os doze critérios necessários de DEC-037, seção 18, e onde este desenho os satisfaz.

| # | Critério | Onde é satisfeito | Mecanismo |
| --- | --- | --- | --- |
| **CI-1** | Identidade estável derivada da reserva; chave de idempotência derivada dela de forma determinística | PD-2.1, PD-5.1, PD-5.2, DM-7.1, DM-7.2 | Tentativa **única por solicitação** (restrição de banco); chave derivada por hash determinístico e **persistida**, nunca rederivada |
| **CI-2** | Criação, notificação, transições, reembolso e cancelamento idempotentes | PD-5.3, PD-5.4, DM-7.3 | `X-Idempotency-Key` em criação, reembolso e cancelamento; idempotência de **efeito** por `Payment` único, transição condicionada ao estado de origem e eleição condicionada a não haver canônico |
| **CI-3** | Estado reconstruível por consulta autoritativa, sem nenhuma notificação | PD-1.2, PD-6.5, PD-10.1, PD-10.2 | A reconciliação periódica consulta toda tentativa não terminal; responder 200 cedo é seguro **porque** essa rota existe |
| **CI-4** | Instante de acreditação persistido separadamente do instante de reconhecimento | PD-2.1, PD-6.6 passo 4, DM-7.5 | Dois campos distintos mais a origem do reconhecimento (`notificacao` ou `reconciliacao`), gravados na transação de efeito |
| **CI-5** | Janela de ao menos 30 minutos e `expiration_time` que não a excede | PD-3.1 | Janela de **exatamente 30 minutos**; `expiration_time` = `reservedUntil`, o único ponto em que as duas coincidem sem a cobrança sobreviver à reserva |
| **CI-6** | Reserva, pagamento, expiração, liberação de vaga e confirmação tardia resolvidos atomicamente, sem instante observável com mais de três pagas | PD-4.1 passo 1, PD-6.6 passo 4, DM-6.2, DM-6.3 | **Índice único parcial** `(listingId, slotIndex)` sobre `reserved` e `paid` como garantia; trava de transação por anúncio e expiração resolvida **no ato da alocação** como comportamento |
| **CI-7** | Estado explícito de reembolso pendente, visível e não encerrável sem desfecho | PD-2.3, PD-2.4, PD-3.5, PD-8.6, AR-14.3 | Estados `pendente`, `falhou_retentando` e `pendente_operacional`; esgotar tentativas **não** fecha o caso; pendência por idade é sinal mínimo de observabilidade |
| **CI-8** | Reversões detectadas por reconciliação periódica sobre pagamentos já confirmados | PD-3.4, PD-9.1 | Varredura **diária** de pagamentos confirmados; é a única detecção possível, pois o provedor não expõe notificação de reembolso ou reversão |
| **CI-9** | Estado autoritativo não mapeado abre inconsistência e nunca concede direito | PD-3.6, PD-6.6 passo 3, PD-8.5, PD-10.5 | Classificação por lista fechada; tudo fora dela é **não aprovado** e abre `inconsistente` |
| **CI-10** | Todos os eventos da seção 13 auditados, sem segredo e sem contato em texto claro | PD-2.4, PD-6.2, PD-7.4, DM-11.1, AR-9.4, AR-9.5 | Trilha única append-only, escrita na mesma transação do efeito; registro de rejeição minimalista |
| **CI-11** | Nenhuma superfície de cliente aciona reembolso, reconciliação ou resolução de inconsistência | PD-8.9, PD-11.4 | Os três caminhos só existem em trabalhos periódicos protegidos por segredo de agendamento; não há rota, ação nem parâmetro que os exponha |
| **CI-12** | Testes provam: não exceder três sob concorrência; notificação duplicada, fora de ordem e atrasada sem inconsistência; pagamento tardio sem vaga; estado incerto sem direito | Seção 13 | Contrato de teste abaixo, sobre banco real e execução simultânea |

## 13. Contrato de teste

**PD-13.1.** Os testes abaixo são o que CI-12 exige e o que o gate da Fase 3 deve verificar. Eles fecham o que [engineering/testing.md](../engineering/testing.md), seção 2.5, deixou expressamente para este documento.

| # | Teste | Nível mínimo | Prova |
| --- | --- | --- | --- |
| T-1 | N solicitações **realmente simultâneas** no mesmo anúncio, com N maior que 3 | Integração com banco real e execução concorrente | Exatamente 3 ocupam vaga; as demais são recusadas. Sequencial **não** aprova este teste |
| T-2 | Confirmações simultâneas de duas reservas para a última vaga | Integração concorrente | Uma consome, a outra não; nenhuma das duas fica em estado ambíguo |
| T-3 | Mesma notificação entregue N vezes | Integração | Um único efeito, um único registro de aprovação, mesmo estado final |
| T-4 | Notificações fora de ordem | Integração | Estado final corresponde ao autoritativo, não à ordem de chegada |
| T-5 | Nenhuma notificação entregue, pagamento acreditado | Integração | A reconciliação sozinha produz `paid`, com o instante de acreditação como referência |
| T-6 | Acreditação **dentro** da janela, reconhecimento muito depois | Integração | Vale como tempestivo; os dois instantes são persistidos separadamente |
| T-7 | Acreditação **fora** da janela | Integração | Não cria solicitação paga, não consome vaga, abre reembolso RT-2 |
| T-8 | Dois pagamentos acreditados para a mesma reserva | Integração | Um canônico, uma vaga, excedente em reembolso RT-1; eleição determinística e estável entre execuções |
| T-9 | Três vagas já consumidas e chega pagamento acreditado | Integração | RB-003 prevalece; reembolso RT-3 |
| T-10 | Gateway confirma, persistência local falha | Integração | Retoma a mesma operação; não recobra; não cria order nova |
| T-11 | Consulta ao gateway indisponível | Integração | Permanece pendente; nenhum direito concedido; nenhuma aprovação |
| T-12 | Estado autoritativo desconhecido | Unitário + integração | Tratado como não aprovado; abre inconsistência |
| T-13 | Assinatura inválida, e cada um dos campos do manifesto adulterado | Integração na fronteira | Rejeição sem efeito; nenhum estado alterado; registro mínimo sem segredo |
| T-14 | Manifesto remontado a partir do corpo da notificação | Integração na fronteira | **Rejeitado.** É o achado C de F0-010 e a razão da decisão 9 de ADR-0004 |
| T-15 | Retentativa de criação da mesma tentativa | Integração de contrato | Uma única order; a chave persistida é reutilizada |
| T-16 | Reembolso retentado sobre pagamento já reembolsado | Integração de contrato | `order_already_refunded` tratado como sucesso |
| T-17 | Reversão detectada após confirmação | Integração | Vaga permanece; histórico preservado; solicitação não escolhida fica inelegível; contato já liberado não é revogado |
| T-18 | Duas execuções sobrepostas do trabalho de reconciliação | Integração concorrente | Conjuntos disjuntos; nenhum efeito duplicado |

**PD-13.2 (normativa).** Nenhum desses testes pode ser aprovado por execução que não exercite a condição real relevante: teste de concorrência que roda sequencialmente, teste de idempotência que envia o evento uma única vez e teste de autorização que não exercita o ator não autorizado **não aprovam** a regra, mesmo passando ([testing.md](../engineering/testing.md), seção 6.2).

**PD-13.3 (normativa).** Dado de teste é sintético. Nenhum dado pessoal real, nenhuma credencial real e nenhum telefone real em fixture, seed ou snapshot.

## 14. Alternativas rejeitadas

| Alternativa | Decisão | Razão |
| --- | --- | --- |
| Confirmar o pagamento a partir do corpo da notificação | **Rejeitada** | PE-1.2 e a alternativa já rejeitada por DEC-037; transformaria qualquer emissor capaz de forjar um corpo em fonte de verdade |
| Segurar a resposta do webhook até concluir o processamento | **Rejeitada** | Arrisca os 22 segundos de MP-4 sob carga e troca uma garantia própria (reconciliação) por uma de terceiro (entrega). PD-6.5 |
| Deduplicar o efeito pelo identificador de requisição da notificação | **Rejeitada** | Entregas do mesmo fato podem trazer identificadores diferentes; falharia exatamente no reenvio (PD-5.4) |
| Rederivar a chave de idempotência a cada chamada | **Rejeitada** | Qualquer mudança futura na derivação faria a **retentativa** produzir chave nova e gerar a segunda cobrança (PD-5.2) |
| Chamar o provedor antes de commitar a intenção | **Rejeitada** | Produz cobrança órfã que o TROQ não tem como procurar (PD-4.2) |
| Janela de reserva maior que 30 minutos | **Rejeitada** no MVP | Obrigaria a cobrança a expirar antes da reserva, ampliando a janela com reserva viva e cobrança inválida. O piso é o único ponto de coincidência exata (PD-3.1) |
| Delegar ao gateway a validação da tempestividade | **Rejeitada** | PE-4.6; F0-010 registrou que o comportamento real da expiração não pôde ser observado |
| Liberar vaga expirada por trabalho periódico | **Rejeitada** | O agendamento é best effort; uma execução perdida prenderia vagas e recusaria solicitações legítimas (DM-6.3) |
| Marcar aprovado após N consultas sem resposta | **Rejeitada** | PE-6.16 e alternativa já rejeitada por DEC-037; converteria indisponibilidade em aprovação e poderia liberar contato sem pagamento |
| Fechar caso de reembolso por esgotamento de tentativas | **Rejeitada** | PE-7.10; esconderia dinheiro retido indevidamente (PD-3.5) |
| Reembolso parcial | **Rejeitada** | PE-7.3; R$ 0,99 é indivisível neste modelo |
| Eleger o canônico pela ordem de chegada da notificação | **Rejeitada** | Não é determinística: a mesma duplicidade elegeria canônicos diferentes conforme a sorte da entrega (PD-7.1) |
| Adotar fila gerenciada ou broker para reconciliação e reembolso | **Rejeitada** | Nova dependência sem necessidade comprovada; o banco já oferece reclamação de trabalho com `FOR UPDATE SKIP LOCKED` (PD-10.3, [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md)) |
| Expor reconciliação ou reembolso por rota acionável | **Rejeitada** | PE-11.5 e CI-11 |
| Enviar `notification_url` em `POST /v1/orders` | **Rejeitada** | A Orders API rejeita com `HTTP 400`; proibido por ADR-0004, decisão 11 |

## 15. Rastreabilidade

| Item | Efeito deste documento |
| --- | --- |
| F0-022 | Entrega parcial: desenho de pagamentos exigido pelo item |
| DEC-037 | **Materializada.** CI-1 a CI-12 rastreados na seção 12; nenhuma regra alterada |
| ADR-0004 (DEC-036) | Obedecida integralmente. As decisões 5 a 12 são aplicadas; nenhuma é alterada. A revisão que aquela ADR previa para quando este documento existisse está registrada nela |
| RB-003 | Preservada literalmente; proteção de concorrência em PD-4.1, PD-6.6 e DM-6.2 |
| RB-004 | Preservada literalmente; a fronteira de PE-12.1 a PE-12.4 é respeitada em PD-7.5 e PD-8.8 |
| RB-001 | Nenhum caminho deste desenho libera contato sem pagamento aprovado vigente (PD-3.3) |
| RF-009 a RF-012 | Têm mecanismo correspondente |
| RF-022 | Os eventos de pagamento auditados estão em DM-11.1 |
| RNF-016 | T-1, T-2 e T-18 são a verificação exigida |
| R-02, R-04 | Residual reduzido a teste: o mecanismo atômico e o de reconciliação deixam de ser pendência de design |
| R-11 | Tratamento operacional em PD-3.5 e PD-8.5; os dois limites continuam fora do controle do TROQ |
| [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md) | PD-3.4, PD-10.3 e PD-10.6 aplicam suas decisões |
| [testing.md](../engineering/testing.md) | O "contrato concreto de teste" que aquele documento condicionava a F0-022 está na seção 13 |

## 16. Revisão

Revisado quando o Mercado Pago alterar estados, endpoints, prazos ou política de notificações; quando DEC-037 for revisada; quando a medição da Fase 3 indicar que uma cadência ou a janela de 30 minutos precisa mudar; ou antes do lançamento comercial, junto com a conferência da tarifa contratada prevista em R-01.
