# Desenho técnico de pagamentos — TROQS

Desenho de pagamentos pré-implementação do MVP. Produzido por **F0-022**, junto com [overview.md](overview.md), [data-model.md](data-model.md) e [contact-release.md](contact-release.md).

Este documento **converte a política em mecanismo**. A política normativa é [product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037) e o gateway homologado é o de [ADR-0004](../adr/0004-mercado-pago-pix.md) (DEC-036). Nenhum comportamento de negócio é inventado aqui: onde este documento decide, ele decide **mecanismo, tempos e estrutura** — exatamente o que aquelas fontes deixaram expressamente para F0-022.

Não implementa nada: nenhum endpoint, nenhum SDK, nenhum schema, nenhuma migration, nenhum segredo, nenhuma configuração de painel e nenhum pagamento real.

Os itens são identificados como `PD-x`.

**Atualização de 2026-10-01 ([F3-001](https://github.com/BrunoMNoronha/techlab-troq/issues/91)).** Reconciliação com o código entregue pela Fase 2, sem alterar regra de negócio nem decisão vigente: trava e relógio (PD-4.6), registro da notificação rejeitada (PD-6.2), identificação da aplicação antes do HMAC (PD-6.10), reserva durante a pausa do anúncio (PD-6.11), cancelamento da cobrança de reserva encerrada antes da janela (PD-8.10) e reclamação de trabalho (PD-10.7). Inventário em [../delivery/phase-3-plan.md](../delivery/phase-3-plan.md), seção 2.1.

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
| Instante de reconhecimento pelo TROQS | Quando o TROQS tomou conhecimento (CI-4) |
| Origem do reconhecimento | `notificacao` ou `reconciliacao` (PE-10.1) |

**PD-2.1 (invariante).** Uma tentativa por solicitação, garantida por restrição de banco (DM-7.1). Retentar a **mesma** solicitação é a **mesma** tentativa lógica; solicitações diferentes são tentativas diferentes (PE-2.1).

### 2.2 `Payment` — um pagamento reportado pelo provedor

Identificador do pagamento no provedor (único, DM-7.3), valor, estado autoritativo observado, `status_detail`, instante de acreditação, instantes de observação, e se é o canônico da tentativa.

**PD-2.2.** `Payment` é um **espelho do que o provedor reportou**, não uma afirmação do TROQS. Ele existe para que a decisão de negócio seja tomada contra um fato registrado e auditável, e para que a duplicidade seja detectável.

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

**PD-3.1 (decisão arquitetural).** A janela de reserva do TROQS é de **exatamente 30 minutos**.

Fundamento: PE-4.4 fixa o piso normativo de 30 minutos e delega a duração concreta a F0-022; MP-1 registra que 30 minutos é o **menor** `expiration_time` que a Orders API aceita. Escolher exatamente o piso produz a única configuração em que a validade da cobrança no gateway pode ser **idêntica** ao fim da janela, sem que a cobrança sobreviva à reserva (PE-4.5) e sem que a reserva sobreviva à cobrança. Qualquer valor acima do piso obrigaria a cobrança a expirar antes da reserva — o que amplia, em vez de reduzir, a janela em que existe reserva viva sem cobrança válida.

Efeitos concretos:

- `reservedUntil` = `reservedFrom` + 30 minutos;
- o `expiration_time` enviado em `POST /v1/orders` é **exatamente** `reservedUntil`;
- **não** há prorrogação automática, extensão silenciosa nem reabertura, inclusive em indisponibilidade do provedor (PE-4.7);
- a validação da tempestividade **não** é delegada ao gateway: o TROQS compara o instante de acreditação autoritativo com `reservedUntil` por conta própria, e o `expiration_time` é apenas defesa adicional (PE-4.6).

**PD-3.2 (detalhe de implementação).** Se a operação futura demonstrar, com dados, que 30 minutos é curto demais para o comportamento real do Pix do público-alvo, aumentar a janela é ajuste de design, não decisão aberta — desde que o `expiration_time` continue igual ao fim da janela e o piso de 30 minutos seja respeitado.

_Atualização de 2026-10-01 (F3-004, [#94](https://github.com/BrunoMNoronha/techlab-troq/issues/94)) — CONFIRMADO, com efeito sobre PD-3.1._ `transactions.payments[].expiration_time` é uma **duração** ISO 8601 contada **da criação do pagamento**, com mínimo documentado de 30 minutos (MP-1; documentação vigente conferida em 2026-10-01; spike F0-010, experimento 6). Os tipos do SDK oficial descrevem o campo como "duração ou data-hora", mas a documentação e o spike só sustentam a duração, e o adaptador envia duração. Consequências:

1. "`expiration_time` = `reservedUntil`" **não é literalmente realizável**: a cobrança criada δ depois de `reservedFrom` (passo 2 de PD-4.1) expira δ depois da reserva, e δ nunca pode ser compensado reduzindo a duração abaixo de 30 minutos.
2. O adaptador recebe o prazo em milissegundos e envia `PT…` arredondado para cima, **nunca** abaixo de `PT30M`. A janela de 30 minutos, PE-4.4 e PD-3.1 **não** foram alterados.
3. O resíduo δ não cria direito: a tempestividade é verificada pelo próprio TROQS contra `reservedUntil` (PE-4.6), e pagamento acreditado depois dele é RT-2 (T-7). O provedor também devolve `date_of_expiration` absoluto, que permite medir δ por cobrança.
4. **RECOMENDAÇÃO para F3-005 ([#95](https://github.com/BrunoMNoronha/techlab-troq/issues/95)):** executar o passo 2 imediatamente após o commit do passo 1, enviar `reservedUntil − agora` (que o adaptador eleva ao mínimo), persistir o `date_of_expiration` devolvido e registrar δ. Se a medição mostrar δ material, ajustar PD-3.1 é decisão a levar ao Bruno, não ajuste silencioso.

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
| Retentativa de reembolso | **a cada cinco minutos**, com recuo exponencial por caso | Retenta reembolsos em `falhou_retentando` | Cadência do dispatcher autorizada no plano de ambientes em 2026-10-04; o horário elegível e o recuo exponencial de cada caso continuam sendo respeitados |
| Higiene | **diária** | Materializa `publishedAt` de avaliações com janela vencida e aplica os prazos de retenção de DEC-033 que não sejam de imagem | Nenhuma invariante depende dela (AR-15.3, DM-9.4). Os originais temporários e a fila de exclusão de objetos de imagem **não** estão aqui: uma cadência diária permitiria a um original durar quase 48 horas, acima das 24 horas de DEC-028. Eles seguem o trabalho horário de [media-pipeline-contract.md](media-pipeline-contract.md), seções 11 a 13 (F2-007, 2026-09-29) |

**PD-3.5 (decisão arquitetural).** Um caso em `reembolso_pendente` **nunca** é encerrado por esgotamento de tentativas. Depois de um número de tentativas automáticas sem sucesso, ele passa a `pendente_operacional` e **permanece aberto e visível** (AR-14.3), porque continua sendo dinheiro que o TROQS não tem direito de reter (PE-7.10).

_Atualização de 2026-10-01 (F3-008, [#98](https://github.com/BrunoMNoronha/techlab-troq/issues/98)) — número de tentativas e recuo._

- **Recuo:** depois da k-ésima falha transitória, a próxima tentativa fica para 2^(k−1) horas depois (1 h, 2 h, 4 h, 8 h, 16 h e, daí em diante, 24 h).
- **Onde fica gravado:** em `technical_refunds.next_attempt_at`, no mesmo `UPDATE` que registra a falha.
- **N = 8 tentativas automáticas,** contando a primeira, feita logo depois da classificação. Elas cobrem cerca de 79 horas desde a primeira. É mais que um fim de semana para repor saldo (PE-7.8) e muito mais que um incidente típico do provedor, e ainda fica longe do prazo de 180 dias (PD-8.7).
- **Depois da oitava falha:** o reembolso passa a `pendente_operacional` no mesmo `UPDATE`, sem `next_attempt_at`. O caso `reembolso_pendente` **continua aberto**, sem desfecho, e a tentativa continua `reembolso_pendente`.
- **Ajuste:** N e o recuo são design ajustável por medição (ADR-0006, decisão 12).

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

**PD-4.2 (decisão arquitetural — por que a intenção é commitada antes da chamada).** Se a aplicação falhar **entre** o passo 2 e o passo 3, existe uma order no provedor cujo identificador o TROQS não conhece. O passo 1, já commitado, é o que torna isso recuperável: a tentativa existe, está em estado não terminal, entra na reconciliação e é reencontrada pelo `external_reference` derivado da sua identidade. A ordem inversa — chamar o provedor e só depois persistir — produziria cobranças órfãs que o TROQS não teria como sequer procurar. Este é o desenho que satisfaz PE-6.7 a PE-6.10 na criação, e não apenas na confirmação.

**PD-4.3 (invariante).** **Nunca** se cria uma segunda order para a mesma reserva enquanto a anterior não tiver desfecho terminal conhecido (PE-6.15). A tentativa única por solicitação (PD-2.1) torna essa regra estrutural: não há onde guardar uma segunda tentativa.

**PD-4.4 (invariante).** Indisponibilidade do provedor na criação **não** concede direito, **não** duplica tentativa e **não** prorroga a janela (PE-4.7, cenário 20 de DEC-037). A tentativa fica em estado não terminal; a reconciliação apura se alguma order chegou a existir.

**PD-4.5 (normativa).** O valor é exatamente `0.99`, sem arredondamento, agregação ou ajuste (ADR-0004, decisão 5; RB-004), representado internamente sem ponto flutuante (DM-1.3).

**PD-4.7 (implementação, F3-005, [#95](https://github.com/BrunoMNoronha/techlab-troq/issues/95), 2026-10-01).** Como os passos 2 e 3 ficaram no código:

1. **Quem autoriza e quem cobra.** `request` (`src/modules/request/charge-flow.ts`) decide, numa transação curta sob a trava do anúncio, se a reserva ainda admite cobrança: do próprio solicitante, `reserved`, `reservedUntil` acima do `now()` do banco e anúncio `published` (PD-6.11, item 1). Depois do COMMIT, `payments` (`src/modules/payments/charge.ts`) cobra **fora de transação**. Não há trava segurada durante a chamada de rede. A brecha entre a autorização e a chamada (por exemplo, uma pausa nesse intervalo) é aceita: nada se concede por ela, e a confirmação segue PD-6.11, item 2.
2. **Passo 3 idempotente.** `UPDATE … WHERE status = 'tentativa_criada'`. Se outra execução concorrente já gravou a **mesma** order, é sucesso; order diferente não sobrescreve nada e é auditada como falha.
3. **Recuperação.** Falha no passo 2 (incluindo resposta perdida depois de o provedor criar a order) ou no passo 3 deixa a tentativa em `tentativa_criada`. A operação do solicitante que reapresenta o Pix refaz o passo 2 com a **mesma** chave, recebe a **mesma** order e conclui o passo 3. Com a tentativa já em `aguardando_pagamento`, ela consulta a order (`GET`) e devolve as instruções enquanto o provedor as fornecer.
4. **Sem migration.** O copia e cola, o QR e o link **não** são persistidos: vêm do provedor na criação e, depois, por consulta, enquanto não há acreditação (spike F0-010, exp. 4). O δ de PD-3.2 (`date_of_expiration − reservedUntil`) fica na auditoria `payment.charge_created`, que nunca contém instruções Pix nem email. O email da conta só segue no corpo enviado ao provedor (PD-11.2).
5. **Falha do provedor**, inclusive credencial ausente, não prorroga a reserva, não aprova nada e é auditada como `payment.charge_failed`, com o tipo e o código, sem mensagem do provedor.

**PD-4.8 (homologação, #104, 2026-10-05).** A flag server-side `MERCADO_PAGO_PIX_SANDBOX_AUTO_APPROVE`, ausente/`0` por padrão, pode ser ativada como `1` somente em `APP_ENV=development` ou `preview`, nunca com `VERCEL_ENV=production`. Valores desconhecidos ou ambiente incompatível falham fechados antes da rede. A cada criação, o adaptador consulta `GET /users/me` com o mesmo Access Token que usará no `POST` e exige resposta `200`, identificação válida, `site_id=MLB` e tag exata `test_user`; não armazena essa confirmação em cache. Conta real, resposta incompleta ou indisponibilidade impedem o `POST` sem expor dados da conta.

Só nesse modo confirmado, o `payer` enviado ao provedor é o fixture oficial `{ email: "test_user_br@testuser.com", first_name: "APRO" }`, que solicita a aprovação automática **do sandbox**. Fora desse modo, segue somente o email da conta, como em PD-4.7. Não se altera tentativa, chave, referência, valor, reserva, gravação local nem confirmação. O status da criação não concede direito: permanecem as consultas autoritativas de PD-6.6/ADR-0008, tempestividade e persistência idempotente do efeito. Não existe rota de aprovação manual, escrita na Payments API ou segunda order para uma reserva. A aprovação automática não prova liquidação Pix ou tarifas em produção. A flag e o fixture nunca são parâmetros de cliente ou dados gravados em logs/auditoria/telemetria. Procedimento e limites em [../delivery/preview-pix-sandbox-runbook.md](../delivery/preview-pix-sandbox-runbook.md).

**PD-4.6 (decisão técnica, F3-001, DV-6 e DV-7).** "A trava de escopo de transação do anúncio" do passo 1 — e da transação de efeito de PD-6.6, passo 4 — é a **trava de linha** `SELECT … FOR UPDATE` sobre o anúncio, a mesma das transições do ciclo de vida, e não `pg_advisory_xact_lock` ([data-model.md](data-model.md), DM-6.12). Todos os instantes do passo 1 (`reservedFrom`, `reservedUntil` = `reservedFrom` + 30 minutos, a expiração das reservas vencidas) vêm do `now()` do banco, lido uma vez na transação; o `expiration_time` do passo 2 é exatamente o `reservedUntil` persistido.

## 5. Identidade e idempotência

**PD-5.1 (decisão arquitetural).** A chave de idempotência é derivada de forma **determinística** da identidade da tentativa, por função de hash sobre um espaço de nomes fixo do TROQS concatenado ao identificador da tentativa. Propriedades exigidas:

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

_Atualização de 2026-10-01 (F3-001, DV-5)._ O "mínimo de segurança" é um evento na trilha única `AuditEvent`, como DM-11.1 já previa ("rejeição de notificação por autenticidade"): tipo, instante, motivo codificado (por exemplo, aplicação divergente, assinatura ausente, manifesto inválido), ator nulo e correlação técnica limitada ao `x-request-id` e ao `data.id` recebidos. **Nunca** a assinatura, o `ts` combinado com o HMAC, o corpo, cabeçalhos completos ou qualquer segredo. `PaymentNotification` continua reservada à notificação **validada** (PD-2.4). Como o receptor é público, a quantidade desses eventos é sinal de abuso a observar em F3-013 e a verificar em F3-014; nenhum caminho pode transformar o volume de rejeições em efeito de negócio.

**PD-6.3 (decisão arquitetural — o que o receptor faz depois de validar).** O receptor **não** decide a verdade. Ele, em uma transação curta: registra a `PaymentNotification`, correlaciona com a tentativa pelo identificador da order, marca a tentativa como pendente de reconciliação — movendo-a para `em_confirmacao` quando ela estiver em `aguardando_pagamento` — e commita. Em seguida, **se houver orçamento de tempo**, executa a rotina de confirmação (6.2) na mesma invocação; caso contrário, deixa para o trabalho periódico. Em ambos os casos responde `HTTP 200`.

**PD-6.4 (fato externo).** O endpoint deve responder `HTTP 200` ou `201` em até **22 segundos**; sem essa confirmação o reenvio ocorre a cada 15 minutos nas três primeiras tentativas e depois com prazo estendido (MP-4). O orçamento de tempo de PD-6.3 existe para caber com folga nesse limite.

**PD-6.5 (decisão arquitetural — a consequência assumida).** Responder `200` sem ter concluído o processamento faz o provedor **parar de reenviar**. Isso é **deliberado e seguro**, porque a reconciliação por consulta reconstrói o estado sem nenhuma notificação (PE-1.3, PE-9.2, CI-3). O desenho alternativo — segurar a resposta até concluir — trocaria uma garantia que o TROQS controla (a reconciliação) por uma que depende da rede e das filas do provedor, e ainda arriscaria estourar os 22 segundos justamente sob carga.

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

_Atualização de 2026-10-01 (F3-004) — DECISÃO PENDENTE, OD-16._ A Orders API **não documenta** um instante de aprovação ou acreditação no pagamento da order: os tipos do SDK oficial (`src/clients/order/commonTypes.ts`, revisão de 2026-08-26) trazem `created_date` e `last_updated_date` da order e `date_of_expiration` do pagamento, mas nenhum `date_approved`, que existe na **Payments API**. ADR-0004, decisão 3, exige ADR própria para usar a Payments API como superfície principal. Por isso o adaptador devolve `accreditedAt = null` e **não** adivinha campo; `last_updated_date` **não** é tratado como acreditação, porque muda em qualquer atualização posterior, inclusive reembolso. A fonte do instante autoritativo de PE-4.1, CI-4 e DM-7.5 foi aberta como **OD-16** em [../decisions/open-decisions.md](../decisions/open-decisions.md) e **bloqueia** a verificação de tempestividade do passo 4 em F3-006 ([#96](https://github.com/BrunoMNoronha/techlab-troq/issues/96)).

_Atualização de 2026-10-01 (DEC-043, fecha OD-16)._ [../adr/0008-accreditation-instant-payments-api.md](../adr/0008-accreditation-instant-payments-api.md) define a fonte: a `date_approved` do pagamento obtido, **só para leitura**, por `GET /v1/payments/search?external_reference=<da tentativa>`, válida apenas com a order acreditada (passo 3) e o pagamento aprovado, acreditado, de mesma `external_reference` e mesmo valor. Indisponibilidade ou ausência do resultado mantém a tentativa pendente (PD-6.9); divergência abre `inconsistente`; mais de um aprovado segue para PD-7. A Orders API continua sendo a superfície principal.

**PD-6.7 (invariante).** A comparação de tempestividade usa o instante de **acreditação**, jamais o de chegada da notificação nem o de processamento (PE-4.1). Confirmação atrasada de pagamento feito a tempo **vale** (PE-4.2); pagamento acreditado depois do fim da janela **não** ressuscita a reserva (PE-4.3).

**PD-6.8 (invariante).** Se o gateway confirmou e a persistência local falhou, a **mesma** operação é retomada, pela mesma identidade de tentativa, até que o efeito local corresponda ao autoritativo. **Não** se cobra de novo e **não** se cria order nova (PE-6.7 a PE-6.10). Enquanto o efeito não estiver persistido, nenhum direito é concedido (PE-6.11).

**PD-6.9 (invariante).** Indisponibilidade da consulta mantém a tentativa pendente e sob reconciliação. **Nunca** converte incerteza em aprovação (PE-6.12 a PE-6.14).

**PD-6.10 (decisão técnica, F3-001, DV-12 — identificar a aplicação).** O passo 1 de PD-6.1 inclui conferir que a notificação pertence à **aplicação** do Mercado Pago configurada no ambiente, **antes** do HMAC (ADR-0004, decisão 8). F0-010 comprovou que a chave secreta é por aplicação e que só a chave da aplicação que assinou valida a notificação ([spike](../delivery/spikes/f0-010-mercado-pago-pix-r099.md)); notificação de outra aplicação é rejeitada por PD-6.2, com motivo próprio. O identificador da aplicação do ambiente é configuração server-side e não segredo; o seu nome de variável é definido por F3-004 em [environments.md](../engineering/environments.md), seção 5.6. Fato registrado para a prova: o simulador do painel assina o manifesto com o `data.id` no caixa original, enquanto o tráfego real segue a regra de minúsculas; um validador correto **rejeita** o simulador quando o `data.id` tem maiúsculas, e isso não é defeito nem motivo para variante de manifesto (ADR-0004, decisão 9).

**PD-6.11 (resolvido pelas fontes, F3-001, DV-3 — reserva viva durante a pausa).** [listing-lifecycle.md](../product/listing-lifecycle.md), seção 5, diz que, em T3, solicitações iniciadas e não pagas "não avançam enquanto pausado", e não as encerra — ao contrário de T5 a T9, que as encerram e liberam a vaga. A leitura coerente com as demais fontes é:

1. **"Não avançar" alcança os passos acionados pelo TROQS ou pelo solicitante:** nova reserva, criação da cobrança (passo 2 de PD-4.1) e reapresentação do QR Code são recusadas enquanto o anúncio estiver `paused` ([listing-lifecycle.md](../product/listing-lifecycle.md), seção 9: "qualquer tentativa de interesse, solicitação, pagamento ou escolha em anúncio que não esteja `published` é rejeitada no servidor" — tentativa de **iniciar** pagamento).
2. **Reconhecer um pagamento já acreditado não é avançar.** Se a acreditação autoritativa ocorreu dentro da janela, PE-4.1 e PE-4.2 determinam que a solicitação se torna paga válida e consome a vaga — a reserva continuava válida, pois a pausa não a encerra ("nada existente é perdido", mesma seção 9).
3. **A leitura alternativa é excluída**, não apenas preterida: recusar a confirmação deixaria dinheiro acreditado contra reserva válida sem nenhuma das hipóteses exaustivas de reembolso (PE-7.2; RT-3 exige reserva **não** vigente), o que PE-12.2 proíbe ("o TROQS não pode reter dinheiro que recebeu por erro técnico"), e não há quarta saída. Por isso esta questão **não** foi aberta como decisão.
4. A transação de efeito de PD-6.6, passo 4, portanto **não** consulta o estado do anúncio; ela continua exigindo `reserved` e acreditação ≤ `reservedUntil`. A pausa não cancela a order (PD-8.10 trata só das transições que **encerram** a reserva).

**PD-6.12 (implementação, F3-006, [#96](https://github.com/BrunoMNoronha/techlab-troq/issues/96), 2026-10-01).** Como a seção 6 foi materializada, sem alterar regra:

1. **Receptor:** `POST /api/webhooks/mercadopago` (`src/app/api/webhooks/mercadopago/`). Respostas sempre sem corpo:
   - `401` para aplicação divergente ou assinatura ausente, malformada ou inválida;
   - `400` para corpo que não identifica notificação;
   - `200` para tópico diferente de `order` (ignorado, sem reenvio);
   - `503` sem configuração (falha fechada);
   - `500` se o registro da notificação válida falhar (o provedor reenvia);
   - `200` depois de registrar a notificação válida.

   Toda rejeição grava só `payment.notification_rejected` (nota de PD-6.2). A order é correlacionada sem diferenciar maiúsculas de minúsculas, como o manifesto.
2. **Orçamento:** a confirmação na mesma invocação tem orçamento de 10 s, com tempo limite de 4 s por consulta ao provedor. Esgotado o orçamento, o receptor responde `200` e a notificação fica com resultado `deferred`; a rotina, idempotente, termina sozinha ou é retomada pela reconciliação (PD-6.5).
3. **Divisão de responsabilidades (AR-3.5):**
   - `payments` (`src/modules/payments/confirmation.ts`) lê o estado autoritativo fora de transação, espelha `Payment` por `INSERT … ON CONFLICT` no id do provedor e expõe as transições da tentativa;
   - `request` (`src/modules/request/payment-confirmation.ts`) relê a solicitação sob a trava do anúncio e decide o efeito sobre a vaga;
   - a mesma rotina (`confirmPaymentFlow`) serve ao receptor (`notificacao`) e à reconciliação de F3-008 (`reconciliacao`).
4. **Encaminhamentos para F3-007** ([#97](https://github.com/BrunoMNoronha/techlab-troq/issues/97)):
   - acreditação fora da janela ou sem reserva `reserved`: a tentativa vai a `reembolso_pendente` e a hipótese fica **persistida** no ato (PD-8.2) num `ReconciliationCase` `reembolso_pendente` com motivo `rt_2` ou `rt_3`, os dois instantes e o estado da solicitação. Na RT-2, a reserva sai da vaga (`expired`). O `TechnicalRefund` e o reembolso são de F3-007;
   - dois ou mais pagamentos acreditados abrem caso `divergencia` / `multiple_accredited`, sem aprovação nem eleição (PD-7 é de F3-007);
   - reversão observada antes da confirmação abre caso `divergencia` / `reversed_before_confirmation`, para F3-011. _Atualização de 2026-10-05 (F3-011):_ a reversão antes da confirmação passou a ser aplicada pela própria rotina (PD-9.5, item 4), e o caso deixou de ser aberto.
5. **Desconhecido ou contraditório:** a tentativa vai a `inconsistente`, com caso aberto uma única vez por motivo. Inclui order não encontrada, referência ou valor divergentes, busca contraditória e pagamento de outra tentativa. Order acreditada com a busca ainda vazia é **indisponibilidade** (ADR-0008, decisão 4).

**Achado de F3-006 (risco registrado, sem decisão nova).** DM-6.3 expira, no ato da alocação, a reserva vencida sem pagamento acreditado tempestivo **reconhecido**. Se um Pix pago dentro da janela ainda não foi reconhecido quando outra pessoa solicita no mesmo anúncio depois do fim da janela, a reserva é expirada e a vaga pode ser realocada. O reconhecimento tardio encontra a solicitação fora de `reserved` e aplica RT-3 (reembolso), e **não** PE-4.2. Isso segue DM-6.3 e RB-003 ao pé da letra; a janela de exposição é o atraso entre a acreditação e o reconhecimento, que a reconciliação de 5 minutos (F3-008) e a notificação reduzem. Mudar esse comportamento, por exemplo consultando o provedor antes de expirar, seria decisão do Bruno.

## 7. Duplicidade e eleição do pagamento canônico

**PD-7.1 (decisão arquitetural).** Havendo dois ou mais pagamentos acreditados para a mesma reserva, o canônico é eleito por esta regra, nesta ordem:

1. o pagamento com o **menor instante de acreditação autoritativo**;
2. em empate exato, o de **menor identificador de pagamento do provedor**, em ordem lexicográfica.

A regra é determinística, total e não depende de ordem de chegada, de ordem de processamento nem do relógio local — as três coisas que variam entre execuções e que tornariam a eleição instável. Isso satisfaz a única exigência normativa de PE-3.1: ser determinística, aplicada uma única vez e registrada.

**PD-7.2 (invariante).** A eleição é aplicada **uma única vez**, por atualização condicionada a ainda não haver canônico (DM-7.4). Reprocessar não reelege.

**PD-7.3 (invariante).** Da duplicidade decorre, obrigatoriamente: **uma** solicitação paga (PE-3.2), **uma** vaga consumida (PE-3.3), e o excedente em **reembolso técnico integral** sob a hipótese RT-1 (PE-3.4).

**PD-7.4 (invariante).** Os dois pagamentos, a eleição, a identificação do excedente e o desfecho do reembolso são auditados (PE-3.5). Falha do reembolso permanece visível e **jamais** é convertida em solicitação válida, crédito, vaga extra ou qualquer benefício (PE-3.6).

**PD-7.5 (normativa).** Duplicidade técnica **jamais** é tratada como cobrança válida definitiva de RB-004 (PE-3.7, PE-12.3).

**PD-7.6 (implementação, [#147](https://github.com/BrunoMNoronha/techlab-troq/issues/147), 2026-10-05) — duplicidade que aparece depois da confirmação.** Sem alterar regra de negócio:

1. **Causa.** A confirmação de um pagamento único (PD-6.6, passo 4) marca como canônico a **transação da order** (`PAY01...` na Orders API). Quando um segundo pagamento aprovado aparece depois, a busca de ADR-0008 devolve os candidatos com os ids **numéricos** da Payments API. O provedor não documenta vínculo entre os dois tipos de id: conferido em 2026-10-05 nos tipos do SDK oficial (`sdk-nodejs`). O `PaymentOrder` do pagamento tem só `id` numérico e `type` (`mercadopago`/`mercadolibre`), que é a order de loja, e não a order `ORD...` nem a transação. O `reference_id` e o `e2e_id` da transação da order não aparecem no pagamento da Payments API. Na sandbox (OD-16), `PAY01...` e `reference_id` deram 404 em `/v1/payments`. Por isso o canônico nunca estava entre os candidatos, e `resolveDuplicateInTx` lançava `duplicate_canonical_outside_candidates`. No webhook, isso virava `unavailable` em silêncio. Na reconciliação, na corrida com o webhook, e na varredura de reversões (PD-9.5), virava `errors` com `jobs.failure` a cada passada.
2. **Tratamento.** Sem saber qual candidato é o canônico, não há excedente identificável. Então:
   - nada é reeleito (PD-7.2) e o canônico não é tocado;
   - nenhum `TechnicalRefund` é criado e nenhuma chamada ao provedor é feita, porque classificar RT-1 para um candidato poderia devolver o próprio pagamento válido;
   - abre-se **um** caso `inconsistente` com motivo `late_duplicate_canonical_unlinked` (PD-10.5). A auditoria `payment.case_opened` leva o canônico, os candidatos com os instantes autoritativos e `excessTreatment: pending_decision`;
   - a tentativa continua `pagamento_confirmado`, e a solicitação continua `paid`, com a vaga consumida;
   - `confirmPaymentFlow` devolve `inconsistent`, sem exceção.
3. **Exatamente uma vez.** O caso é único por motivo enquanto aberto (`openCaseInTx`), e a decisão acontece sob a trava do anúncio. Assim, reentregas e reprocessamentos concorrentes se serializam e só o primeiro abre o caso. Depois disso, a reconciliação só reobserva a tentativa (PD-10.8, item 2), e a varredura diária devolve `inconsistent` sem novo efeito.
4. **Prova.** `src/modules/request/late-duplicate.integration.test.ts`, contra PostgreSQL efêmero e o provedor simulado. Cobre a confirmação por webhook e por reconciliação; a reentrega do webhook, a reconciliação e a varredura de reversões **concorrentes** (espera na trava vista em `pg_stat_activity`, PD-13.2); e a corrida em que a reconciliação lê a duplicidade enquanto o webhook confirma. Antes da correção, as três provas falhavam com a exceção ou com `errors: 1`.
5. **Limite e decisão pendente.** O excedente fica para devolução **manual**, como DEC-044 já prevê quando a transação excedente não é identificável com segurança. Automatizar a devolução depende de uma fonte do provedor que ligue o pagamento da Payments API à transação da order, ou de uma decisão do Bruno sobre outra regra. Um exemplo de outra regra: devolver por transação quando a própria order lista duas transações Pix acreditadas.

## 8. Reembolso técnico e cancelamento

**PD-8.1 (normativa).** As hipóteses são **exaustivas** (PE-7.2): RT-1 duplicidade (excedente); RT-2 acreditação depois do fim da janela; RT-3 acreditação sem reserva válida vigente, inclusive quando a vaga já foi legitimamente ocupada por outra solicitação; RT-4 cobrança criada por defeito técnico do TROQS. Nenhuma outra hipótese é autorizada.

**PD-8.2 (decisão arquitetural).** A hipótese é **determinada e persistida** no ato da classificação, e não recalculada depois. Razão: a condição que a caracterizou — por exemplo, "a vaga estava ocupada naquele instante" — pode não ser mais verdadeira quando o reembolso for retentado, e um recálculo tardio poderia reclassificar ou, pior, não encontrar hipótese alguma para um caso legítimo.

**PD-8.3 (decisão arquitetural).** **Reembolsar ou cancelar** é escolhido pelo estado autoritativo, não pela intenção:

- order em `created` ou `action_required`, sem acreditação: o caminho é **cancelamento** (`POST /v1/orders/{id}/cancel`), que **não** é reembolso e **não** é exceção técnica (PE-7.4, MP-6);
- valor acreditado: o caminho é **reembolso total** (`POST /v1/orders/{id}/refund`, sem valor no corpo), com `X-Idempotency-Key` (PE-7.7, MP-5).

**PD-8.4 (invariante).** O reembolso é sempre **integral**. Reembolso parcial **não** é usado no MVP: R$ 0,99 é indivisível neste modelo (PE-7.3). _Atualização de 2026-10-01 (DEC-044):_ integral **por pagamento**. O excedente de duplicidade numa order com vários pagamentos é devolvido pela sua transação, com o valor cheio dela (nota de PE-7.3).

**PD-8.5 (decisão arquitetural — tratamento dos erros documentados).**

| Resposta do provedor | Interpretação do TROQS |
| --- | --- |
| Sucesso | `concluido`. Registra os dados da devolução reportados pelo provedor |
| `order_already_refunded` | **Desfecho de sucesso**, não erro a repetir (PE-7.11). O caso fecha como `concluido` |
| Saldo insuficiente | `falhou_retentando`. Causa transitória: retenta com recuo exponencial (PD-3.4) |
| Fora do prazo de 180 dias | `pendente_operacional` imediatamente. Retentar é inútil: a condição não volta a ser verdadeira |
| `order_not_found` | Abre `inconsistente`. Nunca se conclui daí que não havia dinheiro |
| Erro não mapeado | Abre `inconsistente` (PE-9.6) |

_Atualização de 2026-10-01 (F3-004) — códigos confirmados e não confirmados._ O adaptador mapeia apenas o que tem fonte: `order_already_refunded` (HTTP 409) como **sucesso** e `order_not_found` (ou HTTP 404) como "não encontrada" (MP-5; referência oficial conferida em 2026-10-01). Os códigos de **saldo insuficiente** e de **prazo de 180 dias** não foram encontrados na documentação vigente nem nos tipos do SDK oficial; até serem confirmados com credencial de teste (PX-2), chegam ao domínio como `rejected` com o código bruto do provedor e caem na linha "erro não mapeado" desta tabela, que abre `inconsistente`. Isso é conservador — nunca fecha caso nem retém dinheiro em silêncio —, e F3-007 ([#97](https://github.com/BrunoMNoronha/techlab-troq/issues/97)) refina o mapeamento quando os códigos forem observados.

_Atualização de 2026-10-01 (F3-008, [#98](https://github.com/BrunoMNoronha/techlab-troq/issues/98)) — códigos de saldo e de 180 dias: NÃO CONFIRMADOS._ A lista de erros da referência oficial de `POST /v1/orders/{id}/refund`, conferida em 2026-10-01 no navegador, documenta:

| HTTP | Códigos documentados |
| --- | --- |
| 400 | `empty_required_header`, `invalid_idempotency_key_length`, `invalid_path_param`, `refund_amount_exceeds` |
| 403 | `forbidden`, `pa_unauthorized_result_from_policies` |
| 404 | `order_not_found`, `transaction_not_found` |
| 409 | `idempotency_key_already_used`, `order_already_refunded`, `cannot_refund_order`, `order_refund_already_in_process` |
| 429 | `too_many_requests`, `usage_quota_exceeded` |
| 500 | `idempotency_validation_failed`, `internal_error` |

**Nenhum** código de saldo insuficiente ou de prazo de 180 dias consta dela. Por isso, as linhas "Saldo insuficiente" e "Fora do prazo de 180 dias" da tabela acima **continuam sem mapeamento próprio**: esses casos caem em "erro não mapeado" (`pendente_operacional` com caso `inconsistente`), que é conservador, e o critério correspondente de #98 fica **não cumprido** até haver fonte.

Dois transitórios **documentados** passaram a retentar (`falhou_retentando`, com recuo), em vez de abrir inconsistência:
- HTTP `429` (`too_many_requests`, `usage_quota_exceeded`), cuja própria referência manda repetir com recuo;
- `409 order_refund_already_in_process`.

_Atualização de 2026-10-01 (DEC-045, [#98](https://github.com/BrunoMNoronha/techlab-troq/issues/98)) — saldo e 180 dias materializados sem código próprio._ Por autorização do Bruno para resolver o impedimento, as duas linhas passaram a ter tratamento verificável:

| Linha de PD-8.5 | Como o TROQS a reconhece | Desfecho |
| --- | --- | --- |
| Fora do prazo de 180 dias | **Antes** da chamada: `payments.accredited_at` (instante autoritativo, ADR-0008) com 180 dias ou mais pelo relógio do banco (`REFUND_WINDOW_DAYS`, `src/modules/payments/refund.ts`) | `pendente_operacional` imediato, **sem** chamada e sem `inconsistente`; resultado `refund_window_expired` |
| Saldo insuficiente | `409 cannot_refund_order` com a order, lida na mesma execução, em estado **acreditado** | `falhou_retentando` com o recuo de PD-3.5; resultado `refund_cannot_refund` |
| (recusa definitiva) | `409 cannot_refund_order` com a order em qualquer outro estado | `pendente_operacional` com `inconsistente` |

- **Evidência:** na sandbox (PX-2, 2026-10-01), `POST /v1/orders/{id}/refund` devolveu `409 cannot_refund_order` para uma order `action_required` e de novo depois de cancelada. É a recusa genérica da rota, e por isso só o estado acreditado da order a torna candidata a saldo.
- **Suposição:** que saldo insuficiente chega como `cannot_refund_order`. Se chegar como outro código, cai em "erro não mapeado", que é conservador.
- **Invariante preservada:** esgotar, vencer o prazo ou recusar **nunca** fecha o caso `reembolso_pendente` (PD-3.5, PD-8.6).

**PD-8.6 (invariante).** Falha de reembolso **não** é ocultada, **não** é encerrada sem desfecho real e **nunca** vira receita reconhecida, vaga, elegibilidade ou silêncio (PE-7.9, PE-7.10). O caso permanece em AR-14.3.

**PD-8.7 (fato externo).** Os dois limites são do provedor e não estão sob controle do TROQS: prazo de **180 dias** a partir da aprovação e exigência de **saldo suficiente** (MP-5). Ambos já estão registrados como R-11.

**PD-8.8 (normativa).** **Não** geram reembolso: não ter sido escolhido (RB-004 literal), desistência, reseleção, encerramento da negociação, anúncio pausado, encerrado ou removido, bloqueio cautelar etário, insatisfação e arrependimento (PE-7.5). Nenhum caminho deste desenho os alcança.

**PD-8.10 (decisão arquitetural, F3-001, DV-2 — cobrança de reserva encerrada antes da janela).** Quando T5/T6 (pelo dono) ou T7 a T9 (pela moderação) encerram uma reserva `reserved` antes de `reservedUntil` ([data-model.md](data-model.md), DM-6.10), a order Pix dela continuaria pagável até o `expiration_time`. Para que a cobrança não sobreviva à reserva (PE-4.5), a tentativa não terminal sem acreditação segue o caminho de **cancelamento** de PD-8.3 — fora da transação do ciclo de vida, que só encerra a reserva e marca a tentativa para o trabalho de PD-10. O cancelamento é defesa adicional, não garantia: se a acreditação ocorrer mesmo assim, a confirmação encontra a solicitação fora de `reserved` e aplica RT-3 (PD-6.6, passo 5). Cancelamento **não** é reembolso e **não** é exceção técnica (PE-7.4).

**PD-8.9 (invariante).** Nenhuma superfície de cliente aciona reembolso, reconciliação ou resolução de inconsistência. Todos são server-side e autorizados (PE-11.5, CI-11). Não existe rota, ação ou parâmetro que permita a uma pessoa usuária final disparar qualquer um deles.

**PD-8.11 (implementação, F3-007, [#97](https://github.com/BrunoMNoronha/techlab-troq/issues/97), 2026-10-01).** Como a seção 8 foi materializada:

1. **Classificação.** Na mesma transação que classifica a exceção, sob a trava do anúncio, nasce o `TechnicalRefund`: um por pagamento, com a hipótese (PD-8.2) e uma chave de idempotência aleatória **persistida**, relida em toda retentativa (PD-5.2). Abre-se também um caso `reembolso_pendente` por hipótese.
   - **Duplicidade:** o canônico é eleito uma única vez entre os pagamentos aprovados da busca da Payments API (ADR-0008), pela regra de PD-7.1, com empate pelo menor id em ordem **lexicográfica**. O canônico segue a regra de tempestividade como pagamento único, e cada excedente vira RT-1.
2. **Execução** (`src/modules/payments/refund.ts`). Fora de transação, logo depois do commit da classificação (`confirmPaymentFlow`), e de novo na retentativa de F3-008. A rota sai da order consultada na hora:
   - pagamento que é a **única** transação da order: reembolso **total**;
   - pagamento que é **uma de várias** transações: só ela, pelo valor cheio (DEC-044);
   - pagamento que **não** é transação conhecida da order: `pendente_operacional`, sem chamada;
   - canônico de solicitação paga: **nunca** devolvido, e a tentativa abre `inconsistente`.
3. **Desfechos (PD-8.5).**
   - Sucesso ou `order_already_refunded` → `concluido`. A sandbox, em 2026-10-01, confirmou que a mesma chave não devolve duas vezes e que outra chave recebe `order_already_refunded`.
   - Indisponibilidade → `falhou_retentando`.
   - `order_not_found` ou código não mapeado → `pendente_operacional` com caso `inconsistente`.
   - Concluídos todos os reembolsos de uma hipótese, o caso fecha com desfecho `refunded`. A tentativa inteira de exceção passa a `reembolsada_ou_revertida`. Uma solicitação paga com excedente devolvido continua `pagamento_confirmado`.
4. **Cancelamento (PD-8.10).** Depois do commit de T5/T6, `closeListing` cancela, fora da trava, a order sem acreditação de cada reserva encerrada, com chave persistida em `payment_attempts.cancel_idempotency_key`. A tentativa vai a `falha`, e isso não é reembolso nem cria `TechnicalRefund`. Se a order já acreditou, a confirmação aplica RT-3. A falha do cancelamento não desfaz o encerramento: a tentativa fica aberta para a reconciliação. Os encerramentos de moderação (T7–T9) ainda não existem e usarão a mesma rotina.
5. **Limite conhecido.** A busca da Payments API não vincula os seus ids às transações da order. Por isso, com as fontes atuais, a duplicidade observada pela busca termina em `pendente_operacional`, para devolução manual do excedente. Quando a duplicidade aparece **depois** da confirmação, nem o excedente é identificável: o caminho é o caso `inconsistente` de PD-7.6, sem `TechnicalRefund`.

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

**PD-9.3 (normativa — vocabulário).** `chargeback` é vocabulário de arranjos de cartão e **não** descreve o Pix (BC-5, PE-8.1). Quando um valor de status do provedor usa a palavra, trata-se de valor técnico da API. Desacordo comercial **não** é hipótese de MED (BC-4, PE-8.2). O TROQS **não** promete resultado que dependa de instituições financeiras (PE-8.3).

**PD-9.4.** Pagamento técnico que nunca foi válido nunca consumiu vaga e, portanto, nada há a devolver ao limite (PE-8.11, PE-12.7).

**PD-9.5 (implementação, F3-011, [#101](https://github.com/BrunoMNoronha/techlab-troq/issues/101), 2026-10-05).** Como a seção 9 foi materializada, sem alterar regra de negócio:

1. **Rota e agenda.** `GET /api/jobs/payments-reversals`, protegida por `CRON_SECRET` como as de F3-008 ([environments.md](../engineering/environments.md), seção 5.7). `payments` (`src/modules/payments/reversal.ts`) reclama as tentativas `pagamento_confirmado` com o exame vencido: CTE `MATERIALIZED` com `FOR UPDATE SKIP LOCKED`, em lotes, numa transação curta que empurra `payment_attempts.next_reversal_check_at` 24 horas para a frente e commita (PD-10.7). A coluna é própria, criada pela migration aditiva `20261005120000_payment_reversal_sweep`, porque a tentativa confirmada com caso aberto também é reobservada de hora em hora pela reconciliação, e as duas agendas não podem se empurrar. NULL quer dizer "elegível já", então as tentativas confirmadas antes da migration entram na primeira varredura. Orçamento e lotes seguem PD-10.8, item 1. O `cron` fica fora desta entrega (DP-3, [#56](https://github.com/BrunoMNoronha/techlab-troq/issues/56)); a prova é a invocação autenticada (DEC-042), que o smoke do Deploy Preview já faz.
2. **Mesmo fluxo da confirmação.** Cada tentativa reclamada vai a `confirmPaymentFlow` com origem `reconciliacao` (`src/modules/request/reversal-sweep.ts`). O estado autoritativo é lido fora de transação, e o efeito é decidido sob a trava de linha do anúncio. Essa é a mesma trava da escolha (CR-3, nota de F3-009), e por isso reversão e escolha se serializam: ou a escolha vê a tentativa confirmada e libera antes, ou vê a tentativa revertida e recusa. Uma notificação que leve à consulta da order revertida aplica a mesma regra, com origem `notificacao`; a reconciliação de F3-008 não reclama tentativas confirmadas, salvo com caso aberto, e aí só reobserva.
3. **O que caracteriza reversão de pagamento confirmado (PD-9.1).** Dois casos:
   - o estado `reversed` do adaptador (`refunded`, `partially_refunded`, qualquer `charged_back`), que agora carrega um código fechado do estado que o caracterizou: `order_refunded`, `order_charged_back`, `processed_refunded` ou `processed_partially_refunded`;
   - um terminal sem acreditação (`expired`, `canceled`, `failed`) depois da confirmação, registrado como `terminal_<desfecho>`. É o "qualquer estado autoritativo que deixe de representar pagamento efetivamente acreditado" de PD-9.1.

   Pendente depois da confirmação (`confirmed_payment_pending`) e estado desconhecido ou contraditório **não** são tratados por analogia: abrem caso `inconsistente` sem transição (PD-10.5), e a varredura seguinte reexamina. Indisponibilidade não muda nada (PD-6.9).
4. **Efeitos (PD-9.2), numa única transação.**
   - **Tentativa:** `pagamento_confirmado` → `reembolsada_ou_revertida`, por `UPDATE` condicionado ao estado de origem. Reprocessar o mesmo fato, pela varredura do dia seguinte ou por webhook reentregue, não produz segundo efeito. Isso basta para a solicitação deixar de ser elegível e de aparecer nas opções do anunciante, porque `readConfirmedPaymentEvidence` só aceita `pagamento_confirmado` (CR-4.2, nota de CR-3 por F3-009).
   - **Evento novo:** `payment.reversed` na trilha única, com o instante, a origem, o estado autoritativo e os efeitos: vaga mantida, solicitação `paid`, inelegível, se o contato já tinha sido liberado, sem revogação e sem cobrança nova. A aprovação original continua intacta: `payment.approved`, os dois instantes de CI-4, a origem do reconhecimento e o canônico (PE-8.5). O evento repete esses instantes em `approval`.
   - **Solicitação e vaga:** não são tocadas. A linha continua `paid`, a vaga continua consumida (DM-6.7, PE-8.9) e nenhuma quarta oportunidade se abre (PE-8.10).
   - **Liberação:** a autorização já concedida só é **lida**, para a auditoria registrar que a divulgação ocorreu (PE-8.7). A entrega continua olhando a solicitação, e não a tentativa, e por isso as releituras continuam permitidas (CR-4.3). A negociação não é encerrada (DEC-029).
   - **Cobrança:** nenhuma cobrança nova, de recuperação ou devolução pelo TROQS (PE-8.8).
   - **Antes da confirmação:** a reversão observada com a tentativa ainda em `aguardando_pagamento` ou `em_confirmacao` significa que o valor foi acreditado e devolvido sem o TROQS reconhecê-lo. A tentativa vai a `reembolsada_ou_revertida` com `payment.reversed` (`confirmed: false`). A reserva viva sai da vaga como `failed` (`charge_reversed`), porque não pode mais ser paga (uma tentativa por solicitação, PD-4.3), exatamente como no terminal sem acreditação de PD-6.6. Isso encerra também a reconsulta a cada 4 minutos que o caso `reversed_before_confirmation` provocava.
5. **Ambiguidade com reembolso técnico RT-1.** Se a tentativa tem reembolso RT-1 (excedente de duplicidade, PD-8.11), a devolução do próprio TROQS pode explicar o estado de reversão da order. A order não diz qual pagamento saiu. Por isso abre-se caso `inconsistente` com motivo `reversal_with_technical_refund`, sem transição. A solução é operacional.
6. **Observabilidade.** O resumo de contagens da rota entra em `jobs.run` (F3-013), sob o nome `payments-reversals`. Nenhum sinal novo foi criado: o catálogo de sinais é fechado.

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

**PD-10.7 (confirmado, F3-001, DV-8 e DV-9).** Os trabalhos de pagamento seguem PD-10.3 (`FOR UPDATE SKIP LOCKED` em lotes, dentro de transação), e **não** o lease por instante de vencimento usado pelos trabalhos de mídia da Fase 2 ([media-pipeline-contract.md](media-pipeline-contract.md)). A diferença é deliberada: o efeito de pagamento acontece dentro da transação que reclamou o caso, enquanto o trabalho de mídia faz E/S longa no R2 fora dela. As rotas ficam em `src/app/api/jobs/` e usam o mesmo `cron-auth` com `CRON_SECRET` (PD-11.4). **Agendamento:** não há cron configurado — no Hobby a cadência de 5 minutos é impossível e o cron só dispara no deployment de produção ([ADR-0006](../adr/0006-async-work-scheduling-concurrency.md), V-4, V-5 e decisão 11). O critério de prova da Fase 3 sem agendamento foi decidido em 2026-10-01 por **DEC-042** (fecha OD-15; [../delivery/phase-3-plan.md](../delivery/phase-3-plan.md), seção 5.1): invocação autenticada em `preview` mais T-5 e T-18 sobre banco real; as cadências de PD-3.4 **não** são enfraquecidas.

_Atualização de 2026-10-01 (F3-008, [#98](https://github.com/BrunoMNoronha/techlab-troq/issues/98)) — DECISÃO TÉCNICA: reclamar, commitar e só então processar._ A frase "o efeito de pagamento acontece dentro da transação que reclamou o caso" é **incompatível** com o que F3-006 e F3-007 entregaram, conferido no código:

1. **Rede e efeito são etapas separadas.** `confirmPaymentFlow` lê o estado autoritativo **fora** de transação (`observeAttempt`) e só depois abre a transação de efeito. O reembolso e o cancelamento também chamam o provedor fora de transação.
2. **O efeito trava o anúncio antes da tentativa.** A transação de efeito faz `lockListingForRequest` (`FOR UPDATE` no anúncio) e só depois o `UPDATE` em `payment_attempts`.
3. **O espelho e o cancelamento escrevem em outra conexão.** `mirrorPayments` insere em `payments` pela FK para `payment_attempts`, o que exige `FOR KEY SHARE` na tentativa. `cancelUnaccreditedCharge` grava a chave na tentativa.

Segurar a tentativa com `FOR UPDATE` durante a rede e chamar os fluxos existentes leva a uma de duas falhas:
- **a execução trava a si mesma:** o espelho, o cancelamento e o efeito esperam, em outra conexão, a linha que a própria execução segura, até o tempo limite da transação;
- **ou as travas se invertem:** se o efeito fosse feito dentro da transação de reclamação, a ordem seria tentativa → anúncio, contra anúncio → tentativa do webhook, e o resultado seria impasse (deadlock).

Por isso os trabalhos de pagamento seguem PD-10.3 assim:

1. **Reclamar:** em lotes, com `FOR UPDATE SKIP LOCKED`, numa transação **curta**. Na mesma instrução, cada linha reclamada tem o próximo instante empurrado para o futuro (`payment_attempts.next_reconcile_at`, `technical_refunds.next_attempt_at`), e então vem o commit. A seleção travada fica numa CTE `MATERIALIZED`. Na forma `UPDATE … FROM (SELECT … LIMIT … FOR UPDATE SKIP LOCKED)`, o PostgreSQL pode reavaliar a subconsulta como lado interno de um *nested loop* (visto com `EXPLAIN` em 2026-10-01) e reclamar mais que o lote.
2. **Processar depois,** fora da transação de reclamação, pelos fluxos existentes, que tomam a trava do **anúncio** na sua própria transação curta.

**Por que é seguro:**
- duas execuções sobrepostas são disjuntas: pelo `SKIP LOCKED` durante a reclamação e pelo instante já no futuro depois do commit;
- uma execução que morra no meio só atrasa o caso até o instante reclamado;
- reprocessar é seguro, porque todos os efeitos são idempotentes (PD-10.4).

**O que não muda:** a regra de PD-10.3, a recusa ao lease por instante de vencimento **como garantia** e a proibição de `pg_advisory_lock` de sessão (DEC-038, decisão 6). O instante reclamado não substitui o `SKIP LOCKED`, e a corretude continua nas transições condicionadas.

**PD-10.8 (implementação, F3-008, [#98](https://github.com/BrunoMNoronha/techlab-troq/issues/98), 2026-10-01).** Como a seção 10 foi materializada:

1. **Rotas:** `GET /api/jobs/payments-reconcile` e `GET /api/jobs/payments-refund-retry`, descritas em [environments.md](../engineering/environments.md), seção 5.7.
   - `runtime nodejs` e `maxDuration` de 300 s;
   - param de reclamar lotes novos aos 180 s e de começar casos já reclamados aos 240 s;
   - o que sobra volta no instante reclamado.
2. **Reconciliação** (`src/modules/request/reconciliation.ts`; a reclamação é de `payments`). Elegíveis: `tentativa_criada`, `aguardando_pagamento`, `em_confirmacao`, `inconsistente` e qualquer tentativa com caso `pendente`, `divergencia` ou `inconsistente` aberto. A tentativa ativa volta em 4 minutos, para caber na cadência de 5; a apenas reobservada volta em 1 hora. Cada estado segue um caminho:
   - **aberta:** `confirmPaymentFlow` com origem `reconciliacao`, a mesma rotina do webhook (T-5);
   - **aberta de solicitação `failed`:** cancelamento de PD-8.10. Se a order já acreditou, a confirmação aplica RT-3;
   - **`tentativa_criada` de reserva viva:** nada; o solicitante retoma;
   - **`tentativa_criada` com a janela vencida:** busca **só de leitura** por `GET /v1/orders?begin_date&end_date&external_reference`, que a referência oficial da Orders API documenta (conferida em 2026-10-01). Exatamente uma order dessa referência é registrada como o passo 3 faria e segue a confirmação. Mais de uma, ou order de outra tentativa, abre `inconsistente`. Sem resultado, nada é inventado: a order é procurada de novo de hora em hora no primeiro dia e, depois, diariamente;
   - **`inconsistente` ou com caso aberto:** só reobserva (`observeAttempt`) e grava `last_reconcile_result`. Nunca transita, elege, aprova ou fecha caso.

   `reembolso_pendente` é tratado pela retentativa de reembolso. A varredura de reversões é de F3-011 (PD-9.5).
3. **Limites da busca de orders:**
   - **Credencial de teste:** a referência registra `invalid_credentials` para credencial de teste, e a busca **não** foi exercitada na sandbox nesta entrega. Na prova, o contrato foi conferido contra o provedor simulado.
   - **Atraso de indexação:** é desconhecido. Erro ou falta de resultado só adiam a busca e nunca concluem que a order não existe.
   - **Volume:** tentativas `tentativa_criada` abandonadas sem order continuam sendo procuradas uma vez por dia, sem prazo final. Encerrar essa procura exige decisão (Fase 4 ou F3-013).
4. **Retentativa:** recuo e N em PD-3.5, códigos em PD-8.5.

## 11. Segurança

**PD-11.1 (normativa).** Access Token, chave secreta de webhook e qualquer credencial permanecem exclusivamente server-side, por ambiente, e **nunca** entram em bundle de cliente, Git, log, mensagem de erro, telemetria ou documentação (ADR-0004 decisão 6, RNF-015, PE-11.1).

**PD-11.2 (normativa).** Nenhum dado pessoal do pagador além do estritamente necessário é persistido (PE-11.2, RNF-008).

**PD-11.3 (normativa).** Estado de pagamento e existência de solicitação paga **não** são expostos em superfície pública nem a terceiros. A visibilidade ao anunciante limita-se às solicitações pagas válidas do seu anúncio (PE-11.4, RF-013).

**PD-11.4 (decisão arquitetural).** O endpoint de webhook não tem outra autorização senão a assinatura: ele é, por natureza, público e não autenticado por sessão. Os endpoints dos trabalhos periódicos, ao contrário, exigem o segredo de agendamento ([ADR-0006](../adr/0006-async-work-scheduling-concurrency.md)) e recusam qualquer chamada sem ele.

**PD-11.5 (decisão arquitetural).** O adaptador do provedor é o **único** lugar que conhece `order`, `x-signature`, `data.id`, `X-Idempotency-Key` e os valores de `status`/`status_detail`. O domínio recebe apenas conceitos do TROQS: acreditado ou não, instante de acreditação, e uma classificação fechada (ADR-0004, decisão 10).

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
| Chamar o provedor antes de commitar a intenção | **Rejeitada** | Produz cobrança órfã que o TROQS não tem como procurar (PD-4.2) |
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
| R-11 | Tratamento operacional em PD-3.5 e PD-8.5; os dois limites continuam fora do controle do TROQS |
| [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md) | PD-3.4, PD-10.3 e PD-10.6 aplicam suas decisões |
| [testing.md](../engineering/testing.md) | O "contrato concreto de teste" que aquele documento condicionava a F0-022 está na seção 13 |

## 16. Revisão

Revisado quando o Mercado Pago alterar estados, endpoints, prazos ou política de notificações; quando DEC-037 for revisada; quando a medição da Fase 3 indicar que uma cadência ou a janela de 30 minutos precisa mudar; ou antes do lançamento comercial, junto com a conferência da tarifa contratada prevista em R-01.

Revisado em 2026-10-01 por F3-001 ([#91](https://github.com/BrunoMNoronha/techlab-troq/issues/91)), antes do início da implementação da Fase 3: PD-4.6, a nota de PD-6.2, PD-6.10, PD-6.11, PD-8.10 e PD-10.7. Nenhuma regra de negócio, decisão registrada ou teste de PD-13 foi alterado.

Revisado em 2026-10-01 por F3-004 ([#94](https://github.com/BrunoMNoronha/techlab-troq/issues/94)), com a implementação do adaptador: notas em PD-3.2 (expiração por duração), antes de PD-6.7 (instante de acreditação, OD-16) e antes de PD-8.6 (códigos de reembolso). Nenhuma regra, janela ou teste de PD-13 foi alterado.

Revisado em 2026-10-05 por F3-011 ([#101](https://github.com/BrunoMNoronha/techlab-troq/issues/101)), com a implementação das reversões: PD-9.5 e notas em PD-6.12 e PD-10.8. Nenhuma regra de negócio, cadência ou teste de PD-13 foi alterado.

Revisado em 2026-10-05 pela [#147](https://github.com/BrunoMNoronha/techlab-troq/issues/147), com a correção da duplicidade depois da confirmação: PD-7.6 e nota no item 5 de PD-8.11. Nenhuma regra de negócio, decisão registrada ou teste de PD-13 foi alterado.
