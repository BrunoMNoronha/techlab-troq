# ADR-0004 — Mercado Pago como gateway Pix inicial homologado, via Checkout Transparente pela Orders API

> **Atualização posterior (2026-09-14).** Esta ADR foi escrita enquanto **OD-07 ainda estava aberta**, e o texto abaixo é preservado como aceito, sem reescrita. OD-07 foi fechada no mesmo dia, logo depois, por [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037), na execução de F0-019. Portanto, toda menção a OD-07 como aberta reflete o estado na data de aceite desta ADR e **não** descreve o estado atual do projeto. Nenhuma decisão desta ADR foi alterada por DEC-037, que a usa como base; a única observação factual acrescentada lá é que a documentação de notificações detalha o reenvio como sendo a cada 15 minutos nas três primeiras tentativas e, depois, com prazo estendido.

## Status

**Aceito** — Fase 0 (2026-09-14). Fecha [OD-08](../decisions/open-decisions.md) com base nas evidências de [F0-010](../delivery/spikes/f0-010-mercado-pago-pix-r099.md) e é a fonte oficial de DEC-036 em [../decisions/decision-log.md](../decisions/decision-log.md).

Esta ADR **homologa um gateway**. Ela não implementa integração de pagamentos, não cria schema, não instala dependência, não configura secret e não define o design de pagamentos.

> **Atualização de 2026-09-14, posterior à aceitação desta ADR.** OD-07 foi fechada por [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037) e o design detalhado foi produzido por F0-022 em [../architecture/payments-design.md](../architecture/payments-design.md). As decisões desta ADR **não** foram alteradas: o desenho as aplica integralmente. O texto original abaixo é preservado como registro histórico e deve ser lido com esta atualização. Onde ele diz que OD-07 permanece aberta, isso descreve o estado da data em que a ADR foi escrita.

## Contexto

RB-004 ([../product/business-rules.md](../product/business-rules.md)) exige cobrar **exatamente R$ 0,99** por solicitação de desbloqueio, de forma definitiva mesmo quando o solicitante não é escolhido. É um valor atipicamente baixo, e a dúvida de partida — registrada como risco R-01 em [../delivery/risks.md](../delivery/risks.md) — era se algum gateway aceitaria esse valor e se a tarifa o consumiria.

O encaminhamento da Fase 0 foi deliberadamente conservador:

| Decisão anterior | O que estabeleceu |
| --- | --- |
| DEC-016 | Pagamentos são **Pix-first** |
| DEC-017 | Mercado Pago é **apenas o primeiro candidato** a gateway, não decisão final |
| DEC-018 | **Spike obrigatório** antes de homologar gateway e implementar pagamentos, provando cobrança de exatamente R$ 0,99, confirmação, webhook, idempotência e tarifas |

DEC-018 foi cumprida. O spike F0-010 correu em **seis execuções**, registradas integralmente em [../delivery/spikes/f0-010-mercado-pago-pix-r099.md](../delivery/spikes/f0-010-mercado-pago-pix-r099.md), e a sexta fechou o item com **dez dos dez critérios comprovados**, incluindo os dois mais caros: recebimento de webhook real em endpoint HTTPS público e validação da assinatura HMAC de uma notificação real, com matriz de testes negativos.

O que falta, portanto, **não é mais experimentação**: é a decisão arquitetural que o spike, por definição, não podia tomar. Um spike prova viabilidade técnica; homologar um provedor é escolha de arquitetura e é exatamente o objeto desta ADR.

## Drivers arquiteturais

| # | Driver | Origem |
| --- | --- | --- |
| D-1 | Cobrar **exatamente** R$ 0,99, sem ajuste, arredondamento ou valor mínimo imposto pelo provedor | RB-004, DEC-004 |
| D-2 | Pix como meio de pagamento do fluxo | DEC-016 |
| D-3 | Idempotência na criação da cobrança, para não duplicar cobrança sob retentativa | RF-012, R-04 |
| D-4 | Webhook **autenticável**: a confirmação precisa ser verificável criptograficamente, não apenas recebida | RF-012, RNF-014, R-04 |
| D-5 | Reconciliação: estado interno deve poder ser conferido contra o provedor, sem depender só da entrega do webhook | RF-012, R-04 |
| D-6 | Compatibilidade com monólito Next.js em Serverless Functions na Vercel | ADR-0001, DEC-008, DEC-011 |
| D-7 | Segurança de segredos: Access Token e chave de webhook apenas server-side, nunca no cliente, no Git, em log ou em documentação | RNF-015, DEC-023 |
| D-8 | Simplicidade adequada ao MVP: uma integração, não um agregador de provedores | [../product/mvp-scope.md](../product/mvp-scope.md) |
| D-9 | Custo operacional compatível com um ticket de R$ 0,99 | R-01 |
| D-10 | Troca futura de provedor viável, sem contaminar o domínio com vocabulário do gateway | R-08, RNF-017 |

## Alternativas consideradas

Nenhum novo benchmark de mercado foi executado nesta ADR, e nenhum é necessário: a questão em aberto não era "qual provedor é o melhor do mercado", e sim "o candidato eleito satisfaz os critérios obrigatórios ou não". As alternativas reais, neste ponto da Fase 0, são três.

### A — Homologar Mercado Pago com base em F0-010

Converter as evidências do spike em decisão, fechando OD-08 e desbloqueando RF-011, F0-019 e, adiante, F0-022.

### B — Manter o gateway indefinido

Preservar DEC-017 como está, deixando OD-08 aberta por mais tempo.

### C — Executar um spike de outro provedor antes de decidir

Repetir o esforço de F0-010 contra pelo menos um provedor alternativo e só então comparar.

### Avaliação

| Critério | A — Homologar Mercado Pago | B — Manter indefinido | C — Novo spike comparativo |
| --- | --- | --- | --- |
| Satisfaz os critérios obrigatórios de DEC-018 | Sim, com 10/10 comprovados | Indiferente: não decide nada | Desconhecido até executar |
| Desbloqueia RF-011, RF-012 e F0-019 | Sim | Não | Não, até concluir |
| Custo adicional de Fase 0 | Nenhum | Nenhum, mas a Fase 0 não fecha | Alto: repetir credencial, endpoint público, webhook, HMAC e testes negativos |
| Risco que endereça | Fecha o risco técnico de R-01 | Nenhum | Nenhum risco **identificado**; seria busca por alternativa sem defeito conhecido no candidato |
| Reversibilidade | Alta, com isolamento de domínio (decisão 10) | — | Alta |

**B é rejeitada** porque não há mais pergunta em aberto que justifique a espera. Manter OD-08 aberta depois que todos os critérios que a própria decisão exigia foram comprovados converte prudência em paralisia: bloqueia RF-011, RF-012, F0-019, F0-022 e o gate da Fase 0 sem reduzir risco nenhum.

**C é rejeitada** porque um spike comparativo só se justifica quando o candidato falha em algum critério obrigatório, quando surge impedimento comercial, ou quando existe hipótese concreta de que outro provedor resolva um problema real e observado. Nenhuma das três condições ocorre. Executar C hoje seria comparar um provedor aprovado contra provedores não testados, ao custo de repetir todo o aparato experimental do spike.

Esta ADR **não** afirma que Mercado Pago é superior a qualquer outro provedor de pagamentos: nenhuma comparação quantitativa entre provedores foi feita e nenhuma deve ser inferida daqui. O que ela afirma é que o Mercado Pago satisfez integralmente os critérios obrigatórios definidos por DEC-018, e que isso basta para homologá-lo como gateway **inicial** do MVP.

## Pesquisa externa

Consultas em **2026-09-14**, contra documentação oficial do Mercado Pago Developers. Fontes de terceiros não foram usadas como base normativa.

| Fonte oficial | Fato apurado |
| --- | --- |
| *Pix — Checkout Transparente (via Orders API)*, `developers/pt/docs/checkout-api-orders/payment-integration/pix` | Cobrança Pix criada por `POST /v1/orders`; headers `Authorization` e `X-Idempotency-Key`, este último com a finalidade explícita de garantir que cada solicitação seja processada apenas uma vez, evitando duplicidades; `total_amount` e `transactions.payments.amount`; `payment_method.id = "pix"` e `type = "bank_transfer"`; resposta com `qr_code`, `qr_code_base64` e `ticket_url`; `expiration_time` em ISO 8601, padrão 24 h, mínimo 30 minutos, máximo 30 dias. **`notification_url` não consta do corpo da requisição**; a página remete a configuração de notificações a documento próprio |
| *Configurar notificações de orders*, `developers/pt/docs/checkout-api-orders/notifications` | Tópico `Order (Mercado Pago)`, com `type: "order"` e `action` no formato `order.<estado>`, por exemplo `order.processed`; header `X-Signature` no formato `ts=<timestamp>,v1=<hmac>`; a URL de notificação é configurada **na aplicação**, em *Suas integrações > Webhooks*, com URL HTTPS; a chave secreta é gerada ao salvar essa configuração, sem prazo de validade, com botão de reset; o endpoint deve responder `HTTP 200` ou `201` em até 22 segundos, e o reenvio ocorre a cada 15 minutos até a confirmação |
| *Configurar notificações de orders*, aba "Sem SDKs" (`notifications.md`) | Manifesto literal do HMAC: `id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];`. Regras que o acompanham: `data.id` vem do **query param** da URL e, se contiver alfanuméricos maiúsculos, **deve ser convertido para minúsculas** antes de compor o manifesto — o exemplo oficial converte `ORD01M28P44G5FG8RJPM579EH56FV` em `ord01m28p44g5fg8rjpm579eh56fv`; `x-request-id` vem do header homônimo; `ts` é extraído do header `x-signature`; campos ausentes na notificação são **removidos** do manifesto; o cálculo é HMAC-SHA256 em hexadecimal, comparado com `v1` |
| *Realizar uma compra teste com Pix*, `developers/pt/docs/checkout-api-orders/integration-test/pix` | Caso oficial com `total_amount` `"50.00"` e `payer.first_name = "APRO"`; a order nasce `action_required` / `waiting_transfer` e o status do pagamento é atualizado automaticamente para aprovado em seguida |
| *Get order by ID*, referência da Orders API, `GET /v1/orders/{id}` | Consulta de uma order pelo `id` devolvido na criação, com `HTTP 200` em caso de sucesso; expõe `processing_mode` (`automatic` ou `manual`). É o mecanismo oficial de consulta e a base da reconciliação |
| *Checkout Transparente (via Orders API) — visão geral*, `developers/pt/docs/checkout-api-orders/overview` | A documentação estrutura o Checkout Transparente **em torno da Orders API**, que é a superfície documentada para cartão, **Pix**, boleto e débito virtual; inclui gestão de transação, status da order, erros, reembolsos e cancelamentos |
| *Quanto custa receber pagamentos com Checkout?*, `mercadopago.com.br/ajuda/33399` | **Não revalidada nesta tarefa:** a página devolveu `HTTP 403` à consulta automatizada em 2026-09-14. O valor de 0,99% para Pix no Checkout foi registrado por F0-010 a partir desta mesma página, na mesma data (fontes F8 e G5 do spike) |

### Divergências entre a pesquisa desta ADR e o spike

Duas correções de leitura, ambas registradas por honestidade e **nenhuma** das duas invalida a decisão:

1. **"Orders API recomendada, Payments API legada" é uma formulação mais forte do que as fontes oficiais consultadas hoje sustentam.** O anúncio de 2025-05-14 e a página de *prompt library* de migração, citados no spike como F3 e F4, apresentam a Orders API como consolidação e simplificação e oferecem apoio à migração de Payments para Orders — mas **nenhum deles declara a Payments API depreciada** nem obriga novas integrações a usar Orders. O que se sustenta com a documentação vigente é mais preciso e suficiente: **a Orders API é a superfície em torno da qual a documentação atual do Checkout Transparente está estruturada, e é a API documentada para Pix nesse checkout**. É também a API contra a qual todo o F0-010 foi executado. A decisão abaixo é enunciada nesses termos.
2. **A tarifa publicada não pôde ser revalidada aqui.** A página de tarifas devolveu `HTTP 403` à consulta automatizada. Isso não contradiz o spike, que a consultou na mesma data; apenas significa que esta ADR não acrescenta confirmação independente. O tratamento está na seção *Tarifas*.

Nenhum fato encontrado na pesquisa desta ADR contradiz as evidências de F0-010 nem torna a homologação insegura.

## Decisão

1. **Gateway inicial homologado: Mercado Pago.** O Mercado Pago deixa de ser apenas candidato (DEC-017) e passa a ser o gateway Pix **inicial homologado** do MVP do TROQ. "Inicial" é literal: homologa-se um provedor para o MVP, não se declara exclusividade permanente, e a substituição futura segue a política de evolução abaixo.
2. **Modelo de integração: Checkout Transparente.** O pagamento ocorre dentro do fluxo do TROQ, sem redirecionar a pessoa usuária para um checkout hospedado do provedor.
3. **Superfície principal: Orders API.** A cobrança é criada por `POST /v1/orders` e consultada por `GET /v1/orders/{id}`. Essa é a API em torno da qual a documentação vigente do Checkout Transparente está estruturada e é a única contra a qual F0-010 comprovou os critérios. Usar a Payments API (`/v1/payments`) como superfície principal deste fluxo exige ADR própria.
4. **Meio de pagamento: Pix.** `payment_method.id = "pix"`, `type = "bank_transfer"`, conforme DEC-016. Nenhum outro meio de pagamento é autorizado por esta ADR para o fluxo de RB-004.
5. **Valor: exatamente R$ 0,99.** O valor enviado é exatamente `0.99`, sem arredondamento, agregação ou ajuste. F0-010 comprovou aceitação sem ajuste (`total_amount` `0.99`). RB-004 **não** é alterada por esta ADR.
6. **Credenciais server-side.** O Access Token é usado **exclusivamente** em código servidor. Access Token, chave secreta de webhook e qualquer outra credencial do provedor **nunca** entram no bundle do cliente, no Git, em logs, em mensagens de erro, em telemetria ou em documentação. Vivem apenas como variáveis de ambiente por ambiente (RNF-015). Credenciais de produção não são usadas em desenvolvimento nem em preview.
7. **Idempotência na criação.** Toda criação de order envia `X-Idempotency-Key`, conforme o contrato oficial, com chave derivada de forma determinística da solicitação de desbloqueio à qual a cobrança pertence — de modo que uma retentativa da **mesma** solicitação reaproveite a chave e uma solicitação **diferente** nunca a reaproveite. A geração concreta da chave é detalhe de design (F0-022).
8. **Autenticidade da notificação antes de qualquer processamento.** Notificações do tópico `order` só produzem efeito depois de validadas. A ordem é: identificar a aplicação e a notificação conforme o contrato oficial e as evidências do spike, validar a assinatura, e só então processar. Uma notificação que não passe na validação é rejeitada com resposta de erro e **não** altera estado algum.
9. **Uma única regra de manifesto HMAC.** A implementação constrói o manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` exatamente como a documentação oficial determina, com `data.id` lido do **query param** e convertido para minúsculas, `x-request-id` do header, `ts` extraído de `x-signature`, e campos ausentes removidos do manifesto. É **proibido** implementar fallback que tente variantes de manifesto até alguma casar — seja variando o caixa de `data.id`, seja reconstruindo o identificador a partir do corpo da notificação. O validador aceita **uma** forma, nunca a primeira que conferir.
10. **Isolamento do domínio (portabilidade).** O vocabulário do provedor — `order`, `x-signature`, `data.id`, `X-Idempotency-Key` — fica confinado a um módulo adaptador de pagamento. O domínio do TROQ fala de solicitação paga, reserva de vaga e pagamento aprovado, nunca de entidades do Mercado Pago. Trocar de provedor deve custar a reescrita do adaptador, não do domínio (D-10, RNF-017).
11. **Configuração da URL de webhook.** A URL de notificação para Orders é configurada **no nível da aplicação**, em *Suas integrações > Webhooks* do painel do Mercado Pago. É **proibido** enviar `notification_url` no corpo de `POST /v1/orders`: F0-010 comprovou que a Orders API rejeita a propriedade com `HTTP 400` e `unsupported_properties` (`additionalProperties $.notification_url not allowed`). Nenhum documento do TROQ deve reintroduzir essa suposição. Que a API de Preferences aceite `notification_url` por requisição é fato sobre **outra** API e não se aplica a este fluxo.
12. **Processamento idempotente e reconciliável.** O processamento de uma notificação é idempotente: a mesma notificação entregue N vezes — o provedor reenvia a cada 15 minutos até receber confirmação — produz o mesmo estado final que uma única entrega. E o estado interno deve ser reconciliável contra o provedor por `GET /v1/orders/{id}`, sem depender exclusivamente da entrega do webhook. O mecanismo concreto (chave de deduplicação, transação, job de reconciliação) é design de F0-022.
13. **O que esta ADR não decide.** State machine do pagamento, chargeback, pagamento duplicado, pagamento aprovado após a expiração da reserva, falha de confirmação, reembolso, estorno, tempo de reserva de vaga e demais exceções **permanecem em OD-07**, a fechar por F0-019, e o design arquitetural de pagamentos permanece com F0-022. Nada aqui os antecipa.

## Evidências que sustentam a decisão

Resumo rastreável de [F0-010](../delivery/spikes/f0-010-mercado-pago-pix-r099.md). Nenhuma evidência é reproduzida aqui em detalhe; o spike é a fonte.

| # | Critério de DEC-018 | Estado | Evidência resumida |
| --- | --- | --- | --- |
| 1 | API autenticada | comprovado | `GET /users/me` `HTTP 200` |
| 2 | Criação de cobrança Pix | comprovado | Orders Pix criadas por `POST /v1/orders` |
| 3 | **Exatamente R$ 0,99 aceito** | comprovado | `total_amount` `0.99`, sem ajuste |
| 4 | QR Code e Pix copia e cola | comprovado | BR Code com CRC16 conferido |
| 5 | Confirmação e transição de status | comprovado em sandbox | transição até `processed` / `accredited` |
| 6 | Idempotência | comprovado | `X-Idempotency-Key` |
| 7 | Webhook HTTPS recebido | comprovado | entregas reais do Mercado Pago a endpoint público temporário |
| 8 | Origem e assinatura validadas | comprovado | notificação real decorrente de Order Pix de R$ 0,99, HMAC válido no manifesto oficial, `HTTP 200`; adulterações de `v1`, `data.id`, `x-request-id` e `ts` devolveram `HTTP 401` |
| 9 | Tarifa conhecida | comprovado em sandbox | R$ 0,01 sobre R$ 0,99, líquido R$ 0,98 |
| 10 | Nenhuma incompatibilidade com RB-004 | mantido | nenhuma incompatibilidade encontrada |

### Os três achados técnicos que a implementação deve preservar

**A. Normalização de `data.id`.** A documentação oficial manda converter `data.id` alfanumérico para minúsculas antes de compor o manifesto, e o **tráfego real** confirmou a regra: a notificação real de F0-010 trouxe `data.id` em maiúsculas e conferiu no manifesto oficial em minúsculas. O **simulador** do painel, porém, assina com o caixa original digitado, e por isso um validador correto o rejeita quando o `Data ID` contém maiúsculas. Isso é particularidade da ferramenta de teste, **não** autorização para aceitar duas formas em produção. Consequência normativa: decisão 9.

**B. `notification_url` na Orders API.** `POST /v1/orders` **rejeita** `notification_url` por requisição, com `HTTP 400` e `unsupported_properties`. A URL vem da configuração de Webhooks da aplicação. Consequência normativa: decisão 11.

**C. Validação de assinatura e a tentação do corpo.** O receiver experimental rejeitou corretamente adulterações de `v1`, `data.id`, `x-request-id` e `ts`, todas com `HTTP 401`. Um caso é especialmente instrutivo: ao adulterar o `data.id` da query, a assinatura passou a casar com um manifesto reconstruído a partir do `id` presente no **corpo** — e o receiver rejeitou mesmo assim, porque só aceita o manifesto oficial construído a partir da query. Usar o corpo como fonte alternativa silenciosa para remontar um manifesto que faça a assinatura passar **destrói** a garantia da assinatura. Consequência normativa: decisões 8 e 9.

## Tarifas

Três afirmações distintas, que não devem ser confundidas:

1. **Evidência de sandbox (fato medido).** Em F0-010, a cobrança de R$ 0,99 resultou em tarifa de **R$ 0,01** e líquido de **R$ 0,98**. Sete pontos medidos entre R$ 0,01 e R$ 50,00 são consistentes com percentual aplicado ao bruto e arredondamento **meio-para-cima ao centavo**, **sem componente fixo e sem tarifa mínima**. A taxa efetiva sobre R$ 0,99 sobe de 0,99% nominal para 1,0101% por efeito do arredondamento — sobrecusto da ordem de 0,0002 real por transação.
2. **O que isso prova.** Prova que o fluxo testado **não consumiu nem excedeu** o valor cobrado: sobre R$ 0,99 restaram R$ 0,98. A hipótese que originou R-01 — a tarifa inviabilizar economicamente um ticket de R$ 0,99 — está refutada **na mecânica observada**.
3. **O que isso não prova.** Esse número é **evidência de ambiente de teste, não contrato de produção**. A tabela publicada do Checkout (0,99% para Pix) não foi revalidada nesta ADR — a página devolveu `HTTP 403` à consulta automatizada — e, mesmo publicada, uma tabela padrão não equivale à condição contratada de uma conta específica, que varia por modalidade de recebimento e por acordo comercial. **A tarifa efetiva da conta de produção do TROQ deve ser conferida antes do lançamento comercial.**

Isso é **risco comercial residual**, registrado em R-01, e **não** motivo para manter OD-08 aberta: a pergunta que OD-08 fazia era técnica e está respondida. RB-004 não é alterada.

## Consequências

Positivas:

- **OD-08 fecha.** Resta uma única decisão aberta na Fase 0: OD-07.
- **RF-011 e RF-012 deixam de estar bloqueados pela escolha do gateway.** Passam a depender apenas do que efetivamente falta: as exceções de pagamento de OD-07.
- **F0-019 é desbloqueado** e passa a `próximo`.
- A arquitetura de pagamentos (F0-022) pode avançar assim que OD-07 fechar, sem nova decisão fundamental de provedor.
- O risco técnico de R-01 está mitigado com evidência experimental, não com expectativa.
- A implementação recebe restrições normativas concretas (decisões 6 a 12) em vez de descobrir na Fase 3 as armadilhas que o spike já pagou para encontrar.

Negativas e trade-offs:

- **Dependência de provedor externo** no caminho crítico da receita (R-08). Mitigada, não eliminada, pelo isolamento de domínio da decisão 10.
- **Configuração operacional manual:** a aplicação e a URL de Webhook exigem configuração no painel do Mercado Pago, fora do Git e fora do CI. F0-010 registrou inclusive que o painel só persistiu a configuração com URL de teste **e** de produção preenchidas.
- **Gestão de credenciais:** Access Token e chave secreta de webhook passam a ser segredos operacionais com ciclo de vida próprio (rotação, escopo por ambiente).
- **Custo de produção pode divergir** do observado em sandbox; a confirmação é pré-requisito do lançamento comercial.
- **Comportamento de sandbox não é garantia contratual.** Em particular, F0-010 observou que a validação da janela de expiração **não** pode ser delegada ao gateway e que Pix não estava habilitado em uma das contas de teste usadas — divergências a reconfirmar na conta real.
- Homologar um provedor agora significa que trocá-lo depois tem custo, ainda que confinado ao adaptador.

## Riscos

| Risco | Tratamento |
| --- | --- |
| Tarifa real de produção divergir da observada em sandbox | Conferência obrigatória da tarifa contratada antes do lançamento comercial; registrado como risco residual em R-01 |
| Validador de assinatura aceitar variantes de manifesto até alguma casar | Proibição explícita de fallback (decisão 9); uma única forma oficial, com `data.id` da query em minúsculas |
| Corpo da notificação usado como fonte alternativa do manifesto | Proibido; o manifesto vem da query e dos headers (decisão 9, achado C) |
| Reintrodução de `notification_url` em `POST /v1/orders` | Proibição explícita (decisão 11), com a evidência de rejeição `HTTP 400` registrada no spike |
| Notificação processada antes de validada | Ordem obrigatória: identificar, validar, processar (decisão 8) |
| Webhook duplicado, fora de ordem ou perdido | Processamento idempotente e reconciliação por `GET /v1/orders/{id}` (decisão 12); tratamento das exceções em OD-07 e F0-019 |
| Vazamento de Access Token ou de chave de webhook | Segredos apenas server-side e por ambiente (decisão 6, RNF-015); nunca em Git, log ou documentação |
| Acoplamento do domínio ao vocabulário do provedor | Módulo adaptador com fronteira explícita (decisão 10) |

## Política de evolução

- Substituir o Mercado Pago por outro gateway exige **ADR própria** que substitua esta, com justificativa factual — falha de critério, mudança comercial ou requisito novo — e plano de migração. Não se troca de provedor por preferência.
- Adotar outra superfície de API do Mercado Pago como principal deste fluxo, a Payments API por exemplo, exige ADR própria.
- Adicionar um segundo meio de pagamento ao fluxo de RB-004 exige decisão registrada; esta ADR autoriza apenas Pix.
- Esta ADR deveria ser revisitada quando F0-022 produzisse o design de pagamentos. **Isso ocorreu em 2026-09-14** ([../architecture/payments-design.md](../architecture/payments-design.md)): a revisão foi feita e **nenhuma decisão desta ADR foi alterada**. Permanece a revisão prevista para antes do lançamento comercial, quando a tarifa contratada da conta real for conferida.

## Rastreabilidade

- **Fecha:** [OD-08](../decisions/open-decisions.md).
- **Registra:** DEC-036 em [../decisions/decision-log.md](../decisions/decision-log.md).
- **Baseia-se em:** [F0-010](../delivery/spikes/f0-010-mercado-pago-pix-r099.md), seis execuções, 10 de 10 critérios.
- **Cumpre:** DEC-018, que exigia spike antes da homologação.
- **Substitui:** DEC-017 (Mercado Pago apenas candidato), cujo efeito transitório termina aqui.
- **Mantém:** DEC-016 (Pix-first), RB-004 e DEC-004 (R$ 0,99 definitivo), inalterados.
- **Mitiga:** R-01 no plano técnico, com risco comercial residual explícito; contribui para R-04, que permanece relevante por OD-07.
- **Depende de:** [ADR-0001](0001-modular-monolith-nextjs.md), monólito Next.js com deploy na Vercel.
- **Desbloqueia:** RF-011 e RF-012 quanto ao gateway; F0-019 em [../delivery/backlog.md](../delivery/backlog.md).
- **Não altera:** [OD-07](../decisions/open-decisions.md), que permanece **aberta**; RB-004; nenhuma regra de negócio; nenhuma decisão de produto.
