# Spike F0-010 — Mercado Pago, Pix e cobrança de exatamente R$ 0,99

## Objetivo

Provar ou refutar, com evidências técnicas, a viabilidade do Mercado Pago como primeiro candidato a gateway para cobrar exatamente R$ 0,99 via Pix no TROQ, cobrindo aceitação do valor, criação de cobrança, QR Code/Pix copia e cola, transição de status, idempotência, webhook e validação de assinatura, expiração e tarifas.

Este documento é evidência de spike. Não homologa gateway, não fecha OD-08 e não altera regra de negócio.

## Data

Execução em 2026-09-07. Todas as consultas externas foram feitas nesta data.

## Contexto e rastreabilidade

| Referência | Relação com este spike |
| --- | --- |
| RB-001 | Liberação de contato exige pagamento aprovado; o spike verifica se o gateway fornece confirmação confiável |
| RB-003 | Limite de 3 solicitações pagas; depende de reserva com expiração e, portanto, de expiração no gateway |
| RB-004 | Cobrança definitiva de exatamente R$ 0,99; é o valor sob teste |
| RF-009 | Solicitação paga só conta após aprovação do pagamento |
| RF-010 | Reserva de vaga com expiração |
| RF-011 | Cobrança de R$ 0,99 via Pix |
| RF-012 | Confirmação por webhook e idempotência |
| OD-07 | Exceções de pagamento; permanece aberta |
| OD-08 | Escolha do gateway; permanece aberta após este spike |
| DEC-016, DEC-017, DEC-018 | Pix-first; Mercado Pago apenas candidato; spike obrigatório |
| R-01, R-04 | Riscos que este spike deveria reduzir |

## Ambiente

| Item | Estado |
| --- | --- |
| Sistema | Windows 11, shell Git Bash |
| Cliente HTTP | `curl` 8.21.0 disponível |
| Conectividade com `api.mercadopago.com` | disponível |
| Credenciais de teste do Mercado Pago | **ausentes** |
| Credenciais de produção | não utilizadas e não procuradas |
| Endpoint HTTPS público para receber webhook | não disponível |
| Acesso ao painel "Suas integrações" do Mercado Pago | não disponível |
| Código de produto | não existe (Fase 0) |

A ausência de credenciais de teste é o bloqueio central deste spike e determina sua classificação final.

## Fontes consultadas

Todas consultadas em 2026-09-07, em documentação oficial do Mercado Pago Developers e na Central de Ajuda do Mercado Pago.

| # | Título | URL | Fato sustentado |
| --- | --- | --- | --- |
| F1 | Pix — Checkout API Orders | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix | Criação de cobrança Pix por `POST https://api.mercadopago.com/v1/orders`; header `X-Idempotency-Key`; campos `total_amount` e `transactions.payments.amount`; `payment_method.id = "pix"` e `type = "bank_transfer"`; retorno com `qr_code`, `qr_code_base64` e `ticket_url`; `expiration_time` em ISO 8601, padrão 24 horas, mínimo 30 minutos, máximo 30 dias |
| F2 | Teste de integração Pix — Checkout API Orders | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix | Caso de teste oficial usa R$ 50,00, `payer.first_name = "APRO"` e e-mail `test_user_br@testuser.com`; é o valor de `payer.first_name`, e não o valor monetário, que determina o status retornado (`action_required` / `waiting_transfer`); a documentação afirma que só é possível verificar o funcionamento da integração por requisição, **não** simulando a compra |
| F3 | The API that will transform the way you process payments with Checkout API has arrived | https://www.mercadopago.com.br/developers/en/news/2025/05/14/The-API-that-will-transform-the-way-you-process-payments-with-Checkout-API-has-arrived | Orders API é a opção recomendada para Checkout Transparente; Payments API é tratada como legada |
| F4 | Migrar o Checkout Transparente da Payments para a API de Orders | https://www.mercadopago.com.br/developers/pt/prompt-library/migrate-checkout-api-from-payments-to-orders-api | Confirma o direcionamento oficial de migração de Payments para Orders |
| F5 | Configurar notificações de orders | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications | Notificação por HTTPS POST; header `X-Signature` no formato `ts=<timestamp>,v1=<assinatura>`; validação usa `x-signature`, `x-request-id` e o parâmetro `data.id`; o endpoint deve responder `HTTP 200` ou `201` dentro de 22 segundos |
| F6 | Webhooks — notificações | https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/notifications/webhooks | Verificação por HMAC com chave secreta obtida em "Suas integrações"; painel de notificações permite inspecionar e testar eventos antes da produção |
| F7 | Simulador de notificações Webhooks e assinatura secreta | https://www.mercadopago.com.br/developers/pt/news/2024/01/11/Webhooks-Notifications-Simulator-and-Secret-Signature | Existe simulador oficial de webhooks no painel, com envio de teste e inspeção da resposta do servidor |
| F8 | Quanto custa receber pagamentos com Checkout? | https://www.mercadopago.com.br/ajuda/33399 | Tabela oficial de tarifas do Checkout: **Pix = 0,99%**, dinheiro disponível "Na hora". A mesma tabela lista boleto com tarifa fixa de R$ 3,49, evidenciando que componentes fixos são explicitados quando existem |
| F9 | Qual é o valor mínimo e máximo que posso pagar pelo Mercado Pago? | https://www.mercadopago.com.br/ajuda/324 | Lista mínimos por meio de pagamento: saldo em conta R$ 0,01, cartão R$ 0,50, boleto R$ 4,00. **Pix não aparece na lista**, ou seja, não há mínimo publicado para Pix nesta página |

### Revalidação dos fatos de partida

Os fatos levantados previamente pelo orquestrador foram revalidados nesta data:

| Fato de partida | Resultado da revalidação |
| --- | --- |
| Orders API recomendada, Payments API legada | confirmado (F3, F4) |
| `X-Idempotency-Key` obrigatório | confirmado como header da criação de order (F1) |
| Teste Pix por Orders com valores pré-definidos | **parcialmente corrigido**: o caso de teste é pré-definido, mas F2 indica que o gatilho do status é `payer.first_name = "APRO"`, não o valor monetário |
| Exemplo oficial de controle com R$ 50,00 | confirmado (F2) |
| Webhook com assinatura `x-signature` | confirmado, formato `ts=...,v1=...` (F5) |
| Simulador oficial de webhooks | confirmado (F6, F7) |
| Tarifa Pix online de 0,99% | confirmado para Checkout (F8) |

## Metodologia

1. Leitura das fontes internas obrigatórias e da rastreabilidade RB/RF/OD.
2. Revalidação da documentação oficial vigente do Mercado Pago antes de qualquer experimento.
3. Verificação de disponibilidade de credenciais de teste sem exibir valores.
4. Verificação de conectividade com a API sem enviar credenciais.
5. Experimento de controle com o caso oficial, seguido do experimento alvo de R$ 0,99 — **não executados**, por ausência de credenciais.

Nenhum SDK foi integrado. Nenhum arquivo de experimento foi mantido no repositório.

## Verificação de credenciais

Procura por credenciais de teste em variáveis de ambiente e em locais de configuração, sem imprimir valores:

- nenhuma variável de ambiente com nome relacionado a Mercado Pago, Pix ou gateway de pagamento;
- nenhum arquivo `.env` no repositório (o `.gitignore` já ignora `.env` e `.env.*`);
- nenhum arquivo ou diretório de configuração do Mercado Pago no perfil do usuário.

Existem arquivos `.env` de **outros projetos** no mesmo diretório de trabalho. Eles não foram lidos: são segredos de projetos não relacionados e não constituem credencial disponibilizada para o TROQ.

**Conclusão:** não há credencial de teste do Mercado Pago disponível para este spike. Nenhuma credencial foi inventada, improvisada ou obtida de terceiros.

## Conectividade com a API

Sondagem sem envio de qualquer credencial, incapaz de criar cobrança:

| Requisição | Resultado |
| --- | --- |
| `GET https://api.mercadopago.com/v1/payment_methods` sem `Authorization` | HTTP 401 |
| `GET https://api.mercadopago.com/v1/orders/0` sem `Authorization` | HTTP 403 |

Interpretação: a API está acessível a partir deste ambiente e o cliente HTTP funciona. As respostas 401/403 são exatamente as esperadas para requisição não autenticada. O bloqueio deste spike é **exclusivamente a ausência de credencial**, não rede, proxy ou ferramenta.

## Experimento de controle (R$ 50,00)

**Não executado.** Bloqueado por ausência de credencial de teste.

Requisição que seria executada, conforme F1 e F2, sem qualquer valor de segredo:

```http
POST https://api.mercadopago.com/v1/orders
Authorization: Bearer <ACCESS_TOKEN_DE_TESTE — não disponível>
Content-Type: application/json
X-Idempotency-Key: <UUID gerado por experimento>

{
  "type": "online",
  "processing_mode": "automatic",
  "total_amount": "50.00",
  "external_reference": "<referência do experimento>",
  "payer": { "email": "test_user_br@testuser.com", "first_name": "APRO" },
  "transactions": {
    "payments": [
      {
        "amount": "50.00",
        "payment_method": { "id": "pix", "type": "bank_transfer" }
      }
    ]
  }
}
```

Não há, portanto, HTTP status, ID de order, status inicial nem QR Code observados. Nada nas seções seguintes pode ser inferido a partir deste caso.

## Experimento principal — R$ 0,99

**Não executado.** Bloqueado pela mesma ausência de credencial. A requisição seria idêntica à de controle, com `total_amount` e `transactions.payments[0].amount` iguais a `"0.99"` e nova chave de idempotência.

Evidência documental relevante, que **não substitui** o experimento:

- não existe mínimo publicado para Pix na página oficial de valores mínimos e máximos (F9), que lista explicitamente mínimos para saldo, cartão e boleto;
- o caso de teste oficial de R$ 50,00 tem seu status determinado por `payer.first_name = "APRO"` e não pelo valor (F2), o que enfraquece a hipótese de que o ambiente de teste restrinja o valor monetário;
- ainda assim, F2 afirma que o ambiente de teste permite apenas verificar a requisição, sem simular a compra.

Classificação da origem do resultado: **indeterminado**. Sem requisição executada, não é possível distinguir entre restrição documentada do sandbox, validação genérica da API, valor abaixo de mínimo explícito, erro de credencial, erro de payload ou aceitação normal do valor. Nenhuma dessas hipóteses foi comprovada nem refutada.

## Idempotência

**Não comprovada experimentalmente.**

Documentalmente (F1), `X-Idempotency-Key` é o header previsto para garantir que a mesma requisição não gere cobranças duplicadas. O procedimento previsto — enviar a requisição, repeti-la com a mesma chave e comparar os IDs retornados — não pôde ser executado por ausência de credencial. Não há evidência de que a repetição retorne o mesmo recurso.

Como o caso de controle também não foi executado, não existe sequer prova da mecânica geral de idempotência no ambiente de teste.

## QR Code e Pix copia e cola

**Não comprovado experimentalmente.**

Documentalmente (F1), a resposta traz `transaction.payments.payment_method.qr_code` (código copia e cola), `qr_code_base64` (imagem em Base64) e `ticket_url` (página com QR Code, copia e cola e instruções de pagamento). Presença, formato e conteúdo reais não foram observados. Nenhum QR Code foi gerado e, portanto, nada foi gravado neste repositório.

## Status e transições

**Não comprovadas experimentalmente.**

Documentalmente (F2), a order de teste retorna status `action_required` com detalhe `waiting_transfer`. A transição para pagamento aprovado depende de transferência Pix real, que F2 indica não ser simulável no ambiente de teste. Nenhuma transição foi observada e nenhum tempo entre estados foi medido.

## Expiração

**Não comprovada experimentalmente.**

Documentalmente (F1):

| Item | Valor documentado |
| --- | --- |
| Campo | `transaction.payment.expiration_time` |
| Formato | duração ISO 8601 |
| Padrão | 24 horas |
| Mínimo | 30 minutos |
| Máximo | 30 dias |

O comportamento real da expiração não foi observado. A escolha do tempo de reserva/vencimento do TROQ não pertence a este spike e permanece para o design de pagamentos, vinculada a RF-010 e OD-07.

## Webhook

**Não comprovado experimentalmente.**

Motivo objetivo: não há endpoint HTTPS acessível neste ambiente para receber a notificação, nem acesso ao painel "Suas integrações" necessário para configurar a URL, obter a chave secreta e acionar o simulador oficial. Nenhum túnel foi instalado, nenhum endpoint público foi criado, nenhuma aplicação TROQ foi registrada e nenhum serviço de terceiros foi usado para receber dados.

Capacidade documentada (F5, F6, F7):

- notificação entregue por HTTPS POST;
- header `X-Signature` no formato `ts=<timestamp>,v1=<assinatura>`;
- validação combina `x-signature`, `x-request-id` e o parâmetro `data.id`, verificada por HMAC com chave secreta obtida no painel;
- o endpoint deve responder `HTTP 200` ou `201` em até 22 segundos;
- existe simulador oficial de notificações no painel.

Observação de precisão: o texto exato do manifesto usado no cálculo do HMAC não foi extraído literalmente das páginas consultadas; as fontes descrevem os componentes da validação, e a construção do manifesto aparece encapsulada nos SDKs oficiais. Isso deve ser confirmado na implementação, não presumido.

A documentação sozinha não equivale a prova experimental. RF-012 permanece sem evidência.

## Tarifas

### Tarifa publicada

Fonte oficial F8, tabela de tarifas do Checkout: **Pix = 0,99%**, com dinheiro disponível "Na hora". A mesma tabela lista boleto como tarifa fixa de R$ 3,49, o que demonstra que o Mercado Pago explicita componentes fixos quando existem. Nenhuma tarifa mínima para Pix é publicada nessa página.

Nota sobre divergência de fontes: materiais de blog do próprio Mercado Pago citam Pix a 0% para parte dos vendedores e 0,49% para novos vendedores CNPJ acima de determinado faturamento. Esses números referem-se a outros contextos de recebimento e a condições comerciais específicas, não à tabela do Checkout. Para integração via API, a linha aplicável é a de Checkout (F8). A tarifa efetiva de uma conta específica pode variar por acordo comercial e deve ser confirmada na conta real antes de decidir.

### Matemática nominal

Apenas referência aritmética, sem qualquer afirmação sobre o comportamento real de cobrança:

- 0,99% de R$ 0,99 = R$ 0,0098010;
- líquido nominal = R$ 0,99 − R$ 0,0098010 = R$ 0,9801990.

Nenhum desses números corresponde a um valor monetário representável em centavos. O resultado real depende inteiramente da regra de arredondamento aplicada.

### Comportamento real

**Inconclusivo.** Não foi encontrada, em fonte oficial, regra de arredondamento da tarifa, existência de tarifa mínima para Pix ou definição do valor líquido efetivo de uma transação de R$ 0,99. Nenhum experimento pôde medir o líquido, e o ambiente de teste não reflete tarifas.

As hipóteses possíveis — arredondamento para baixo (tarifa R$ 0,00), arredondamento para cima (tarifa R$ 0,01) ou aplicação de tarifa mínima não publicada — produzem resultados materialmente diferentes para um ticket de R$ 0,99 e **não** foram distinguidas. Nenhuma regra de arredondamento foi inventada.

Esta é a incerteza economicamente mais relevante do spike e corresponde diretamente ao risco R-01.

## Limitações

1. Nenhum experimento HTTP autenticado foi executado; toda a parte experimental está vazia por ausência de credencial de teste.
2. O ambiente de teste do Mercado Pago, conforme F2, não simula a compra Pix; mesmo com credenciais, a aprovação de pagamento e a transição de status provavelmente não seriam observáveis em sandbox.
3. Diferença entre sandbox e produção: o sandbox não reflete tarifas, não conclui a transferência Pix e pode aplicar validações distintas das de produção. Uma eventual recusa de R$ 0,99 em sandbox **não** provaria recusa em produção, e uma eventual aceitação **não** provaria a viabilidade econômica.
4. A tarifa efetiva pode variar por conta e por acordo comercial; a tabela pública é o piso informativo, não a tarifa contratada.
5. O texto exato do manifesto do HMAC não foi confirmado literalmente em fonte oficial.

## Evidências

Evidência de conectividade, única evidência experimental deste spike:

```
GET https://api.mercadopago.com/v1/payment_methods  (sem Authorization)  -> HTTP 401
GET https://api.mercadopago.com/v1/orders/0          (sem Authorization)  -> HTTP 403
```

Evidência de ausência de credencial: nenhuma variável de ambiente com nome relacionado a Mercado Pago, Pix, pagamento ou gateway; nenhum `.env` no repositório; nenhum diretório de configuração do Mercado Pago no perfil do usuário. Nenhum valor de segredo foi lido, exibido ou registrado.

Evidência documental: fontes F1 a F9 acima, com título, URL e data de consulta.

## Classificação final

**INCONCLUSIVO**

Justificativa: não há prova material de nenhum dos itens obrigatórios. R$ 0,99 não foi tentado, o Pix não foi gerado, o fluxo de estado não foi observado, a idempotência não foi exercitada, o webhook não foi recebido nem validado e o arredondamento da tarifa sobre R$ 0,99 permanece sem definição oficial.

Não há, igualmente, qualquer evidência de incompatibilidade do Mercado Pago com requisito obrigatório do TROQ. Nada neste spike sustenta reprovação: o valor de R$ 0,99 é superior ao mínimo de qualquer meio de pagamento listado oficialmente, e o Pix sequer aparece na lista de mínimos.

`INCONCLUSIVO` não é aprovação presumida. OD-08 permanece aberta e o Mercado Pago permanece candidato, exatamente como estabelecido em DEC-017.

## Próximo passo recomendado

Baseado exclusivamente nas evidências acima:

1. **Disponibilizar credenciais de teste do Mercado Pago** de forma segura ao ambiente de execução. É o único bloqueio da parte experimental; conectividade e ferramentas já estão comprovadamente disponíveis.
2. **Reexecutar F0-010** com o controle de R$ 50,00 e o alvo de R$ 0,99, cobrindo idempotência, QR Code, status e expiração.
3. **Prover endpoint HTTPS temporário e acesso ao painel** para exercitar o simulador oficial de webhooks e validar a assinatura de ponta a ponta.
4. **Resolver a incerteza de tarifa.** O arredondamento da tarifa de 0,99% sobre R$ 0,99 não é determinável por documentação pública nem por sandbox. `Necessária validação controlada em produção com autorização explícita de Bruno.` Essa validação **não** foi executada neste spike. Alternativa sem produção: obter a regra por escrito junto ao suporte comercial do Mercado Pago.
5. **Manter F0-011 bloqueado.** Não há base para criar ADR-0004 nem para fechar OD-08.

O item 4 é o de maior valor: mesmo que todos os experimentos técnicos venham a ser aprovados, a viabilidade econômica de um ticket de R$ 0,99 depende de uma regra de arredondamento que hoje não está documentada publicamente.

---

# Segunda execução — 2026-09-14

Esta seção é acrescentada à execução de 2026-09-07, que permanece acima sem alteração. Ela registra uma nova tentativa de reexecução de F0-010 na data de 2026-09-14, com revalidação integral da documentação oficial vigente.

## Classificação desta execução

**INCONCLUSIVO**

A parte experimental permanece integralmente não executada. O bloqueio, porém, **mudou de composição**: dos dois bloqueios da primeira execução, um foi eliminado com evidência concreta e o outro permanece.

| Bloqueio da 1ª execução | Estado em 2026-09-14 | Evidência |
| --- | --- | --- |
| Credenciais de teste do Mercado Pago ausentes | **permanece** | busca sem resultado no ambiente; sem sessão autenticada no painel |
| Endpoint HTTPS público para webhook indisponível | **eliminado** | credencial de plataforma de deploy presente no ambiente e verificada como válida (HTTP 200) |

O bloqueio de F0-010 é hoje **exclusivamente** a ausência de credencial de teste do Mercado Pago e de acesso ao painel "Suas integrações".

## Baseline Git

`main` = `origin/main` = `f73d783c8974dfddf05e4bf7d794ae1249a42d73`, working tree limpo, sem stash, no início desta execução.

## Estado das credenciais

Verificação sem exibir qualquer valor:

- nenhuma variável de ambiente cujo nome remeta a Mercado Pago, Pix, pagamento, gateway ou access token de pagamento;
- nenhum arquivo `.env` no repositório;
- nenhum diretório de configuração do Mercado Pago no perfil do usuário;
- nenhuma credencial de outro projeto foi lida, reaproveitada ou inspecionada;
- nenhuma credencial de produção foi procurada ou utilizada.

### Sessão no painel do Mercado Pago

Tentativa de acesso a `https://www.mercadopago.com.br/developers/panel/app` em navegador com sessões reais do usuário: a navegação foi redirecionada para a tela de identificação (`/login/identification`), que exige CPF, e-mail ou telefone, seguida de senha, e é protegida por reCAPTCHA.

Conclusão: **não existe sessão autenticada do Mercado Pago disponível neste ambiente.** Nenhuma tentativa de autenticação foi feita: inserir credenciais de conta e resolver reCAPTCHA são ações vedadas ao agente. Nenhuma aplicação de teste foi criada e nenhuma configuração do painel foi alterada.

Consequência direta: o Access Token de teste, que a documentação oficial localiza em *Suas integrações > Dados da integração > Testes > Credenciais de teste* e identifica pelo prefixo `APP_USR`, permanece inacessível — e com ele a chave secreta de webhook e o simulador oficial de notificações, que vivem no mesmo painel.

## Endpoint HTTPS temporário

A primeira execução registrou a ausência de endpoint HTTPS como bloqueio. **Isso deixou de ser verdade.**

Observado nesta data: o ambiente de execução possui credencial válida de plataforma de deploy, verificada por chamada autenticada de leitura com resposta `HTTP 200`, sem exibir o valor do token. Um receiver HTTPS temporário e descartável é, portanto, provisionável sob demanda.

**Nenhum deploy foi feito.** Motivo objetivo e deliberado: sem credencial do Mercado Pago e sem acesso ao painel, não há como configurar a URL de notificação nem acionar o simulador, de modo que o endpoint não receberia nenhuma requisição do gateway. Publicá-lo produziria infraestrutura sem evidência. O receiver deve ser criado na execução que dispuser das credenciais, junto com os experimentos.

Nenhum serviço público de captura de webhook de terceiros foi utilizado.

## Conectividade com a API — revalidada

Sondagens sem envio de qualquer credencial:

```
2026-09-14T13:16:11Z GET https://api.mercadopago.com/v1/payment_methods (sem Authorization) -> HTTP 401
2026-09-14T13:16:12Z GET https://api.mercadopago.com/v1/orders/0          (sem Authorization) -> HTTP 403
```

Resultado idêntico ao de 2026-09-07: rede, TLS e cliente HTTP funcionam; a API responde exatamente o esperado para requisição não autenticada.

## Fontes oficiais revalidadas em 2026-09-14

| # | Título | URL | Consulta | Fato utilizado |
| --- | --- | --- | --- | --- |
| G1 | Pix — Checkout API (via Orders API) | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix | 2026-09-14 | `POST /v1/orders`; headers `Authorization`, `Content-Type` e `X-Idempotency-Key` ("Essa chave garante que cada solicitação seja processada apenas uma vez"); `total_amount` e `transactions.payments.amount`; `payment_method.id = "pix"`, `type = "bank_transfer"`; resposta com `qr_code`, `qr_code_base64` e `ticket_url`; `expiration_time` ISO 8601, padrão 24 h, mínimo 30 min, máximo 30 dias; criação de order sujeita a limite de requisições, com `429 Too Many Requests` e header `Retry-After` |
| G2 | Realizar uma compra teste com Pix | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix | 2026-09-14 | Caso oficial com `total_amount` `"50.00"`, `payer.first_name = "APRO"`, `payer.email = "test_user_br@testuser.com"`; Access Token de teste obtido em *Suas integrações > Dados da integração > Testes*, prefixo `APP_USR`; **"Afterwards, the payment status will automatically change to approved"**; resposta de exemplo com `status` `action_required` e `status_detail` `waiting_transfer` |
| G3 | Configurar notificações de orders | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications | 2026-09-14 | Evento `Order (Mercado Pago)`, `action: "order.processed"`; header `X-Signature` no formato `ts=<timestamp>,v1=<hmac>`; resposta esperada `HTTP 200` ou `201` em até 22 s; reenvio a cada 15 minutos até a confirmação, com prazo prorrogado após a terceira tentativa; chave secreta gerada ao salvar a configuração, sem prazo de validade; simulador de notificação no painel |
| G4 | Configurar notificações de orders — aba "Sem SDKs", versão Markdown da mesma página | https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications.md | 2026-09-14 | **Texto literal do manifesto do HMAC**, transcrito abaixo |
| G5 | Quanto custa receber pagamentos com Checkout? | https://www.mercadopago.com.br/ajuda/33399 | 2026-09-14 | Tabela vigente do Checkout: **Pix 0,99%, dinheiro disponível "Na hora"**; boleto R$ 3,49; cartão de crédito 4,98% / 4,49% / 3,98%; Open Finance grátis. Nenhum componente fixo e nenhuma tarifa mínima para Pix |
| G6 | Qual é o valor mínimo e máximo que posso pagar pelo Mercado Pago? | https://www.mercadopago.com.br/ajuda/324 | 2026-09-14 | Mínimos publicados: saldo em conta R$ 0,01; cartão de crédito e Cartão Mercado Pago R$ 0,50; boleto R$ 4,00. **Pix continua ausente da lista** |

### Comparação com a primeira execução

| Ponto | 2026-09-07 | 2026-09-14 | Natureza |
| --- | --- | --- | --- |
| Endpoint, headers e campos do Pix por Orders API | registrado | **inalterado** | documentado |
| Tarifa Pix do Checkout = 0,99%, "Na hora" | registrado | **inalterado** | documentado |
| Pix ausente da tabela de valores mínimos | registrado | **inalterado** | documentado |
| Expiração: padrão 24 h, mínimo 30 min, máximo 30 dias | registrado | **inalterado** | documentado |
| Manifesto do HMAC não extraído literalmente | lacuna registrada | **lacuna fechada** (G4) | documentado |
| Aprovação do pagamento de teste não simulável | afirmado a partir de F2 | **corrigido**: G2 afirma que o status muda automaticamente para aprovado | documentado |
| Limite de requisições na criação de order | não registrado | `429 Too Many Requests` com `Retry-After` (G1) | documentado |
| Política de reenvio do webhook | não registrada | a cada 15 min até a confirmação (G3) | documentado |

## Manifesto do HMAC — lacuna da primeira execução, agora fechada

A primeira execução registrou explicitamente que "o texto exato do manifesto usado no cálculo do HMAC não foi extraído literalmente das páginas consultadas". Essa lacuna está fechada. Texto oficial (G4, aba *Without SDKs*):

```
id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];
```

Regras oficiais que acompanham o template:

1. `[data.id_url]` é o valor do query param `data.id` recebido na URL. Se vier com caracteres alfanuméricos maiúsculos, **deve ser convertido para minúsculas** antes de compor o manifesto — o exemplo oficial converte `ORD01M28P44G5FG8RJPM579EH56FV` em `ord01m28p44g5fg8rjpm579eh56fv`.
2. `[x-request-id_header]` é o valor do header `x-request-id`.
3. `[ts_header]` é o valor `ts` extraído do header `x-signature`, separando o conteúdo do header pelo caractere `,`.
4. Se `data.id` ou `x-request-id` não estiverem presentes na notificação, **devem ser removidos do manifesto** antes de calcular o HMAC.
5. O cálculo é um `HMAC` com função de hash `SHA256` em base hexadecimal, usando a chave secreta como chave e o manifesto como mensagem; o resultado é comparado com o valor `v1`.

Classificação: **documentado**. Nenhuma assinatura real foi recebida e nenhuma validação foi executada contra uma notificação verdadeira; isto não substitui a prova experimental exigida pelos critérios 7 e 8 de F0-010.

## Correção material sobre o ambiente de teste

A primeira execução concluiu, a partir da frase oficial "só será possível verificar o funcionamento da sua integração por meio de uma requisição, e não simulando uma compra", que a aprovação do pagamento provavelmente não seria observável em sandbox, e registrou isso como limitação.

A documentação vigente em 2026-09-14, na mesma página (G2), afirma literalmente, logo após descrever a order criada com `status` `action_required`: **"Afterwards, the payment status will automatically change to approved."**

Leitura conciliada: a primeira frase nega a simulação de uma *compra* pelo pagador — não existe pagador de teste efetuando transferência Pix; a segunda afirma que o ambiente de teste promove automaticamente o pagamento a aprovado. As duas convivem, e a segunda é diretamente relevante para o critério 5 de F0-010, porque indica que a transição **é** observável por consulta ao `GET /v1/orders/{id}` no ambiente de teste.

Classificação: **documentado**, não observado. Nada nesta seção foi medido. A observação da transição e de seu tempo continua pendente de execução com credencial.

## Experimento 1 — controle oficial R$ 50,00

**Não executado.** Bloqueado por ausência de credencial de teste. Sem HTTP status, sem order ID, sem payment ID, sem status inicial, sem QR Code, sem copia e cola, sem ticket URL.

## Experimento 2 — exatamente R$ 0,99

**Não executado.** Bloqueado pela mesma causa.

Permanece válida a leitura documental da primeira execução, reforçada pela revalidação de G6: não há mínimo publicado para Pix, e a página oficial de mínimos, revisitada em 2026-09-14, continua listando explicitamente saldo, cartão e boleto sem citar Pix. Isso **não** prova que R$ 0,99 seja aceito. Classificação da origem do resultado: **indeterminada**, exatamente como em 2026-09-07.

## Idempotência, QR Code, status, webhook, assinatura e teste negativo

Todos **não comprovados experimentalmente**, pela mesma causa única. Nenhuma requisição autenticada foi enviada, nenhuma notificação foi recebida, nenhuma assinatura foi validada e nenhum teste negativo de assinatura foi executado.

A capacidade documentada correspondente está registrada em G1, G3 e G4 acima e na primeira execução. Documentação não é prova: RF-011 e RF-012 permanecem sem evidência experimental.

## Tarifas

Tabela oficial do Checkout revalidada em 2026-09-14 (G5): **Pix = 0,99%**, dinheiro disponível **"Na hora"**, sem componente fixo e sem tarifa mínima publicada. A mesma tabela explicita R$ 3,49 fixos para boleto, o que sustenta a leitura de que componentes fixos são declarados quando existem.

Para R$ 0,99, a aritmética nominal continua a mesma da primeira execução: 0,99% × R$ 0,99 = R$ 0,0098010, valor não representável em centavos.

**Tarifa efetiva e arredondamento: continuam sem evidência.** Nenhuma fonte oficial consultada nesta data define regra de arredondamento da tarifa, existência de tarifa mínima para Pix ou o líquido efetivo de uma transação de R$ 0,99. Nenhum experimento mediu o líquido e o ambiente de teste não reflete tarifas. As hipóteses de arredondamento para baixo (tarifa R$ 0,00), para cima (tarifa R$ 0,01) ou de tarifa mínima não publicada permanecem indistinguíveis e materialmente diferentes para um ticket de R$ 0,99.

Esta continua sendo a incerteza economicamente mais relevante do spike e corresponde ao risco R-01.

## Expiração

Documentado (G1), inalterado em relação à primeira execução: campo `transaction.payment.expiration_time`, duração ISO 8601, padrão 24 horas, mínimo 30 minutos a partir da criação do pagamento, máximo 30 dias. Não observado experimentalmente. O tempo de reserva do TROQ não é decidido aqui: pertence ao design de pagamentos e a OD-07, que permanece aberta.

## Critérios de conclusão de F0-010 nesta execução

| # | Critério | Estado | Natureza |
| --- | --- | --- | --- |
| 1 | API autenticada funcionando | não comprovado | — |
| 2 | Criação Pix | não comprovado | documentado apenas (G1) |
| 3 | R$ 0,99 aceito | não comprovado | indeterminado |
| 4 | QR Code ou copia e cola gerado | não comprovado | documentado apenas (G1, G2) |
| 5 | Confirmação/status comprovável | não comprovado | documentado (G2), agora com indicação explícita de transição automática para aprovado no ambiente de teste |
| 6 | Idempotência comprovada | não comprovado | documentado apenas (G1) |
| 7 | Webhook HTTPS recebido | não comprovado | documentado apenas (G3) |
| 8 | Origem/assinatura validada | não comprovado | **manifesto agora documentado literalmente** (G4) |
| 9 | Tarifa vigente conhecida | parcialmente satisfeito | 0,99% documentado (G5); arredondamento sobre R$ 0,99 não determinado |
| 10 | Nenhuma incompatibilidade conhecida com RB-004 | mantido | nenhuma evidência de incompatibilidade encontrada |

Sete dos dez critérios continuam sem qualquer prova. F0-010 **não** pode ser marcado como concluído.

## Evidência adicional necessária para concluir F0-010

Exatamente uma condição, da qual todo o resto decorre:

1. **Access Token de teste do Mercado Pago** disponibilizado com segurança ao ambiente de execução, ou sessão autenticada no painel "Suas integrações" com autorização para criar uma aplicação exclusivamente de teste. Com ele vêm a chave secreta de webhook e o simulador oficial de notificações.

Tudo o mais já está disponível e verificado nesta data: conectividade com `api.mercadopago.com`, cliente HTTP e capacidade de publicar o receiver HTTPS temporário.

Permanece, fora do alcance de sandbox, a questão da tarifa efetiva sobre R$ 0,99, que exige regra escrita do suporte comercial do Mercado Pago ou validação controlada em produção com autorização explícita e documentada de Bruno. Essa validação **não** foi executada e nenhum dinheiro real foi movimentado.

## O que esta execução não fez

Nenhuma integração de pagamento foi implementada, nenhum SDK adicionado, nenhum schema ou migration criado, nenhuma aplicação registrada no Mercado Pago, nenhuma configuração de produção alterada, nenhum endpoint publicado, nenhum dinheiro movimentado, nenhum segredo gravado e nenhum gateway alternativo comparado. OD-07 e OD-08 permanecem abertas, ADR-0004 não foi criado e o Mercado Pago permanece apenas candidato, conforme DEC-017.

---

# Terceira execução — 2026-09-14 (primeira execução com credencial)

Esta seção é acrescentada às execuções de 2026-09-07 e 2026-09-14, que permanecem acima sem alteração. É a **primeira execução com Access Token de teste disponível** e, portanto, a primeira com parte experimental realmente executada.

## Classificação desta execução

**INCONCLUSIVO**

A classificação continua `INCONCLUSIVO`, mas por uma razão inteiramente diferente das anteriores. Oito dos dez critérios de conclusão passaram de "não comprovado" a **comprovado experimentalmente**, incluindo os dois que mais pesavam: a aceitação de exatamente R$ 0,99 e a tarifa efetiva sobre esse valor. Restam exatamente dois critérios sem prova — recebimento de webhook real e validação da assinatura contra uma notificação verdadeira —, ambos travados na mesma causa única: a configuração de webhook do Mercado Pago só existe no painel "Suas integrações", cujo acesso exige autenticação interativa com reCAPTCHA.

`INCONCLUSIVO` continua não significando aprovação presumida. OD-07 e OD-08 permanecem abertas, ADR-0004 não foi criado e o Mercado Pago permanece apenas candidato, conforme DEC-017.

## Baseline Git

`main` = `origin/main` = `1e52f33fde1187290d531bfb0adc81f55897ae9a`, working tree limpo no início da execução. Baseline repinado deliberadamente a partir de `6d725ef`, superado, para que a execução ocorresse sob a governança e os padrões de engenharia vigentes (PRs #13, #14 e #16).

## Credencial

O Access Token de teste foi fornecido ao ambiente pela variável `MERCADOPAGO_ACCESS_TOKEN_TEST` e usado exclusivamente no header `Authorization: Bearer`. Nenhum valor foi exibido, registrado, gravado em arquivo do repositório ou enviado como query parameter. Nenhuma credencial anteriormente exposta foi procurada ou reutilizada. Nenhuma credencial de produção foi procurada ou utilizada.

A primeira verificação de presença exibiu também o comprimento da variável, sem revelar seu conteúdo. As verificações posteriores foram limitadas a presente/ausente.

### Identificação da conta e da aplicação

Verificação por `GET /users/me` e `GET /applications/{id}`, sem exibir segredos:

| Campo | Valor observado |
| --- | --- |
| `GET /users/me` | HTTP 200 |
| `user_id` | `3689791164` |
| `site_id` / `country_id` | `MLB` / `BR` |
| `tags` | `["user_product_seller", "test_user", "normal"]` |
| `application_id` | `1495841611175733` |
| Nome da aplicação | `TestApp-8c46f65d` ("Automatic test application") |
| `sandbox_mode` | `true` |
| `date_created` da aplicação | `2026-09-14T10:21:48.000-04:00` |
| `traceability_updated` | `dx-panel-api-credentials`, `RefreshOwnerAppToken`, `2026-09-14T10:21:52.875-04:00` |
| `notifications_callback_url` | `null` |
| `notifications_topics` | `[]` |

A tag `test_user` e `sandbox_mode: true` confirmam que se trata de conta e aplicação de teste. A aplicação foi criada e teve credencial atualizada na própria data desta execução, o que é **consistente com** credencial nova/rotacionada — registrado como observação de rastreabilidade, não como prova criptográfica de rotação.

O registro da aplicação **não expõe chave secreta de webhook** em nenhum campo, e `notifications_callback_url` está vazio: nenhuma notificação está configurada.

## Experimento 1 — controle oficial R$ 50,00

```
2026-09-14T14:45:22Z  POST https://api.mercadopago.com/v1/orders  ->  HTTP 201
```

| Campo | Valor |
| --- | --- |
| `id` (order) | `ORDTST01M2G62G5WJW1BXWDRWXQBF66D` |
| `transactions.payments[0].id` | `PAY01M2G62G69P97GP8CDAFFGB3ZP` |
| `status` / `status_detail` | `action_required` / `waiting_transfer` |
| `total_amount` / `total_paid_amount` | `50.00` / `50.00` |
| `currency` | `BRL` |
| `date_of_expiration` | `2026-09-15T14:45:23.628+00:00` |
| `ticket_url` | presente, em `mercadopago.com.br/sandbox/payments/178955663708/ticket` |

Resultado idêntico ao caso oficial documentado em G2. **Critério 1 (API autenticada) e critério 2 (criação Pix) comprovados.**

## Experimento 2 — exatamente R$ 0,99

```
2026-09-14T14:45:39Z  POST https://api.mercadopago.com/v1/orders  ->  HTTP 201
```

| Campo | Valor |
| --- | --- |
| `id` (order) | `ORDTST01M2G630VQRHZDNFQRGK144TQE` |
| `transactions.payments[0].id` | `PAY01M2G630W7G19741DAB2T15WJ4` |
| `status` / `status_detail` | `action_required` / `waiting_transfer` |
| `total_amount` / `total_paid_amount` | `0.99` / `0.99` |
| `date_of_expiration` | `2026-09-15T14:45:40.679+00:00` |

**R$ 0,99 foi aceito sem qualquer ressalva, erro, aviso ou ajuste de valor.** Não houve arredondamento do valor cobrado, não houve rejeição por mínimo e o Pix foi gerado normalmente.

A classificação da origem do resultado, que nas duas execuções anteriores era `indeterminada`, passa a ser **determinada por experimento**: a API aceita o valor. **Critério 3 comprovado.**

### Valor mínimo aceito

Durante a varredura de tarifas, `total_amount = "0.01"` também foi aceito com `HTTP 201` e chegou a `approved`. Não foi encontrado mínimo que rejeitasse R$ 0,99; o mínimo praticável observado no sandbox é **R$ 0,01**, coerente com a ausência de Pix na tabela oficial de mínimos (G6).

## Experimento 3 — idempotência

Três requisições, mesmo corpo de R$ 0,99:

| # | `X-Idempotency-Key` | HTTP | Order retornada | Payment retornado |
| --- | --- | --- | --- | --- |
| 1 | chave A | 201 | `ORDTST01M2G630VQRHZDNFQRGK144TQE` | `PAY01M2G630W7G19741DAB2T15WJ4` |
| 2 | **chave A repetida** | 201 | `ORDTST01M2G630VQRHZDNFQRGK144TQE` | `PAY01M2G630W7G19741DAB2T15WJ4` |
| 3 | chave B (nova) | 201 | `ORDTST01M2G63P2JTYCR4QDAHCEWMX49` | `PAY01M2G63P309E0ZHGK5627DJESV` |

Verificações:

- repetição com a mesma chave retornou **a mesma order, o mesmo payment e o mesmo `qr_code` byte a byte** — nenhuma cobrança duplicada foi criada;
- chave nova com corpo idêntico criou **uma order distinta**, provando que o discriminador é a chave e não o corpo.

**Critério 6 comprovado.**

## Experimento 4 — status e transição

Order dedicada à medição: `ORDTST01M2G6C6GWJA7TA4TXTVM5JV7T`, R$ 0,99, com polling de 1 segundo a partir do instante da requisição.

```
t+ 1.66s   action_required / waiting_transfer
t+48.76s   processed / accredited    total_paid_amount=0.99
```

A transição documentada em G2 ("the payment status will automatically change to approved") foi **observada**, com latência de aproximadamente **49 segundos** entre a criação e a acreditação, sem qualquer transferência Pix real. As orders dos experimentos 1 e 2 também foram observadas em `processed` / `accredited`, com `total_paid_amount` igual a `50.00` e `0.99` respectivamente.

**Critério 5 comprovado** no ambiente de teste. Observação importante: essa promoção automática é comportamento **do sandbox**, não prova do fluxo real de liquidação Pix em produção.

Nota operacional relevante para o desenho do TROQ: após a acreditação, a resposta de `GET /v1/orders/{id}` **deixa de trazer** `qr_code`, `qr_code_base64` e `ticket_url`. O código copia e cola deve ser persistido no momento da criação, não recuperado sob demanda.

## Experimento 5 — QR Code e Pix copia e cola

O campo `qr_code` foi decodificado como payload EMV/BR Code e validado campo a campo, com verificação independente do CRC16-CCITT (polinômio `0x1021`, inicial `0xFFFF`):

| Campo EMV | Controle R$ 50,00 | Alvo R$ 0,99 |
| --- | --- | --- |
| `00` formato | `01` | `01` |
| `26.00` GUI | `br.gov.bcb.pix` | `br.gov.bcb.pix` |
| `26.01` chave | `b76aa9c2-2ec4-4110-954e-ebfe34f05b61` | `b76aa9c2-2ec4-4110-954e-ebfe34f05b61` |
| `53` moeda | `986` (BRL) | `986` (BRL) |
| **`54` valor** | **`50.00`** | **`0.99`** |
| `58` país | `BR` | `BR` |
| `59` beneficiário | `TESTUSER63466303779677918` | `TESTUSER63466303779677918` |
| `60` cidade | `Osasco` | `Osasco` |
| `63` CRC informado | `8BB3` | `1280` |
| CRC recalculado | `8BB3` — **confere** | `1280` — **confere** |
| Tamanho do payload | 174 caracteres | 173 caracteres |

O campo `qr_code_base64` decodifica para um PNG válido (assinatura `89 50 4E 47 0D 0A 1A 0A`), com 2830 bytes no controle e 2808 bytes no alvo. O `ticket_url` está presente em ambos.

O valor no BR Code é **exatamente `0.99`**: o Pix gerado cobra o valor pretendido, sem arredondamento. **Critério 4 comprovado.**

Nenhuma imagem de QR Code foi gravada neste repositório.

## Experimento 6 — expiração

Seis orders de R$ 0,99, variando `transactions.payments[0].expiration_time`:

| `expiration_time` | HTTP | Janela observada | Conforme documentação? |
| --- | --- | --- | --- |
| omitido | 201 | **24 h 00 min** | sim, padrão documentado |
| `PT30M` | 201 | 30 min | sim, mínimo documentado |
| `PT29M` | 201 | **29 min** | **não — abaixo do mínimo documentado, ainda assim aceito** |
| `P30D` | 201 | 30 dias | sim, máximo documentado |
| `P31D` | 201 | **31 dias** | **não — acima do máximo documentado, ainda assim aceito** |
| `PT2H` | 201 | 2 h | sim |

A janela é medida como `date_of_expiration` menos `created_date`. O padrão de 24 horas foi confirmado com precisão. Os limites de 30 minutos e 30 dias, porém, **não foram aplicados pela API no ambiente de teste**: valores fora da faixa documentada foram aceitos e refletidos literalmente em `date_of_expiration`.

Consequência para o TROQ: a validação da janela de reserva (RF-010) **não pode ser delegada ao gateway**. O sistema deve validar o próprio `expiration_time` antes de enviar. Não se pode presumir que produção se comporte como o sandbox aqui — em qualquer dos dois sentidos.

A expiração efetiva não foi observada até o vencimento: nenhuma order foi acompanhada por 29 minutos ou mais até mudar de estado por decurso de prazo. O comportamento **no** vencimento permanece não observado.

## Experimento 7 — tarifas e arredondamento

Esta era, nas duas execuções anteriores, a incerteza economicamente mais relevante do spike (risco R-01), declarada indeterminável por sandbox. **Essa premissa estava errada:** o ambiente de teste reflete tarifa. `GET /v1/payments/{id}` retorna `fee_details`, `charges_details` e `transaction_details.net_received_amount`.

Sete pagamentos aprovados, todos Pix:

| Valor cobrado | Tarifa | Líquido | Tarifa efetiva | 0,99% nominal | half-up | teto | piso |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R$ 0,01 | **R$ 0,00** | R$ 0,01 | 0,0000% | 0,000099 | 0,00 ok | 0,01 falha | 0,00 ok |
| R$ 0,10 | **R$ 0,00** | R$ 0,10 | 0,0000% | 0,00099 | 0,00 ok | 0,01 falha | 0,00 ok |
| R$ 0,50 | **R$ 0,00** | R$ 0,50 | 0,0000% | 0,00495 | 0,00 ok | 0,01 falha | 0,00 ok |
| **R$ 0,99** | **R$ 0,01** | **R$ 0,98** | **1,0101%** | 0,0098010 | 0,01 ok | 0,01 ok | 0,00 falha |
| R$ 1,51 | R$ 0,01 | R$ 1,50 | 0,6623% | 0,0149490 | 0,01 ok | 0,02 falha | 0,01 ok |
| R$ 5,00 | R$ 0,05 | R$ 4,95 | 1,0000% | 0,0495 | 0,05 ok | 0,05 ok | 0,04 falha |
| R$ 50,00 | R$ 0,50 | R$ 49,50 | 1,0000% | 0,4950 | 0,50 ok | 0,50 ok | 0,49 falha |

Leitura:

1. **A regra de arredondamento é meio-para-cima ao centavo.** Os sete pontos são consistentes com half-up e cada uma das hipóteses concorrentes é refutada por pelo menos um ponto: teto falha em R$ 0,01, R$ 0,10, R$ 0,50 e R$ 1,51; piso falha em R$ 0,99, R$ 5,00 e R$ 50,00. As execuções anteriores listavam "para baixo", "para cima" e "tarifa mínima" como indistinguíveis; **estão distinguidas**.
2. **Não existe tarifa mínima.** Valores cujo nominal fica abaixo de meio centavo pagam tarifa zero. A hipótese de tarifa mínima não publicada está refutada no ambiente observado.
3. **Para R$ 0,99 a tarifa é de R$ 0,01 e o líquido é de R$ 0,98.** A taxa efetiva sobe de 0,99% nominal para **1,0101%** por efeito do arredondamento — sobrecusto de cerca de 0,0002 real por transação, economicamente irrelevante.
4. `fee_payer` é `collector` e `charges_details[].metadata.source_detail` é `processing_fee_charge`, com `accounts.from = "collector"` e `accounts.to = "mp"`. `money_release_date` ficou cerca de 1 segundo após a aprovação, coerente com "Na hora" (G5).

**Critério 9 comprovado no ambiente de teste.**

Ressalva que não pode ser omitida: esta é a tarifa aplicada a uma **conta de teste**, cuja tabela pode não coincidir com a tabela comercial de uma conta real do TROQ, que varia por acordo. Os pagamentos retornam `live_mode: true` apesar de a aplicação estar em `sandbox_mode: true`, o que torna esse campo inadequado como discriminador. O que este experimento estabelece com solidez é a **mecânica**: percentual aplicado ao valor bruto, arredondado half-up ao centavo, sem componente fixo e sem piso. O **percentual contratado** deve ser confirmado na conta real antes de decidir.

## Webhook, assinatura e teste negativo — bloqueados

Critérios 7 e 8 **não comprovados experimentalmente**. Ao contrário das execuções anteriores, a causa foi isolada por experimento, não presumida.

### O que foi construído e provado

Um receiver HTTPS descartável foi escrito **fora do repositório TROQ**, no diretório temporário da sessão, sem vínculo Git com o TROQ. Ele implementa a validação oficial de assinatura descrita em G4:

- monta o manifesto `id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];`;
- converte `data.id` para minúsculas;
- remove do manifesto os componentes ausentes;
- extrai `ts` e `v1` do header `x-signature` separando por `,`;
- calcula `HMAC-SHA256` em hexadecimal e compara em tempo constante;
- responde `HTTP 200` quando válido e `HTTP 401` quando inválido;
- nunca registra o secret nem qualquer header de autorização.

Autoteste local executado, com secret sintético gerado apenas para o teste:

| # | Caso | Resultado |
| --- | --- | --- |
| T1 | Manifesto igual ao template oficial, com `ORD01M28P44G5FG8RJPM579EH56FV` convertido para minúsculas | PASS |
| T2 | Omissão de `data.id` ausente do manifesto | PASS |
| T3 | Parse de `x-signature` no formato `ts=...,v1=...` | PASS |
| T4 | **Positivo** — assinatura correta aceita | PASS |
| T5 | **Negativo** — último caractere do `v1` adulterado, rejeitado | PASS (`hmac_divergente`) |
| T6 | **Negativo** — mesma assinatura com secret diferente, rejeitada | PASS (`hmac_divergente`) |
| T7 | **Negativo** — `ts` adulterado, simulando replay, rejeitado | PASS (`hmac_divergente`) |

Isso prova que **o validador está correto** contra o manifesto oficial. Não prova o critério 8, que exige validar uma notificação **real** emitida pelo Mercado Pago.

O receiver local respondeu `HTTP 200` no health check em `127.0.0.1` e foi encerrado ao fim da execução. Nenhum endpoint público chegou a existir.

### Por que o webhook real não foi obtido

Três causas independentes, todas verificadas:

1. **A URL de notificação não é configurável por requisição.** Testado diretamente: `POST /v1/orders` com `notification_url` retorna `HTTP 400`, `code: "unsupported_properties"`, `details: ["additionalProperties '$.notification_url' not allowed"]`. A notificação é configurada **no nível da aplicação**, e `notifications_callback_url` da aplicação está `null`.
2. **O painel "Suas integrações" é inalcançável sem interação humana.** É de lá que saem a URL de notificação, a chave secreta do HMAC e o simulador oficial. O acesso exige autenticação com reCAPTCHA, ação vedada ao agente. Nenhuma tentativa de autenticação foi feita. Nenhum endpoint da API pública expõe a chave secreta: o registro completo da aplicação foi lido e não contém esse campo; `GET /applications/{id}/webhooks`, `GET /v1/webhooks` e `GET /v1/notifications/settings` retornam `404`.
3. **Não houve endpoint HTTPS público.** A premissa da segunda execução — de que o endpoint era provisionável — **não se sustentou**. A credencial de plataforma de deploy presente no ambiente é escopada a um time onde **não tem permissão de criar projeto**: `POST /v11/projects` retorna `HTTP 403`, `{"code":"forbidden","action":"create","resource":"project"}`. O único projeto existente na conta é alheio a este spike e não foi tocado. A alternativa de expor o receiver local por túnel público foi **bloqueada pela camada de permissão do ambiente de execução** e não foi contornada.

Mesmo que a causa 3 fosse resolvida, a causa 2 sozinha impediria o critério 8, porque sem a chave secreta não há HMAC positivo a validar. **A causa raiz é o acesso ao painel.**

RF-012 permanece, portanto, com metade da evidência: a idempotência está comprovada, a confirmação por webhook não está.

## Critérios de conclusão de F0-010 nesta execução

| # | Critério | Estado | Evidência |
| --- | --- | --- | --- |
| 1 | API autenticada funcionando | **comprovado** | `GET /users/me` HTTP 200; orders criadas com HTTP 201 |
| 2 | Criação Pix | **comprovado** | `ORDTST01M2G62G5WJW1BXWDRWXQBF66D` e `ORDTST01M2G630VQRHZDNFQRGK144TQE` |
| 3 | R$ 0,99 aceito | **comprovado** | HTTP 201, `total_amount` e `total_paid_amount` iguais a `0.99`, sem ajuste |
| 4 | QR Code ou copia e cola gerado | **comprovado** | BR Code com CRC16 conferido e campo `54` = `0.99`; `qr_code_base64` é PNG válido |
| 5 | Confirmação/status comprovável | **comprovado no sandbox** | `action_required/waiting_transfer` para `processed/accredited` em cerca de 49 s |
| 6 | Idempotência comprovada | **comprovado** | mesma chave devolve mesma order, mesmo payment e mesmo `qr_code`; chave nova cria order distinta |
| 7 | Webhook HTTPS recebido | **não comprovado** | bloqueado: sem acesso ao painel e sem endpoint público |
| 8 | Origem/assinatura validada | **não comprovado** | validador correto por autoteste T1 a T7, mas sem notificação real nem chave secreta |
| 9 | Tarifa vigente conhecida | **comprovado no sandbox** | half-up ao centavo, sem piso; R$ 0,99 gera tarifa R$ 0,01 e líquido R$ 0,98 |
| 10 | Nenhuma incompatibilidade conhecida com RB-004 | **mantido** | nenhuma incompatibilidade encontrada em nenhum experimento |

Oito de dez critérios comprovados. Dois bloqueados pela mesma causa. F0-010 **não** pode ser marcado como concluído.

## Evidência adicional necessária para concluir F0-010

Exatamente uma condição de fundo, da qual os dois critérios restantes decorrem:

1. **Acesso à configuração de webhook do Mercado Pago.** Na prática, uma destas alternativas:
   - sessão autenticada no painel "Suas integrações" conduzida por Bruno, que cadastre a URL de notificação da aplicação de teste e forneça a chave secreta ao ambiente por variável de ambiente, nos mesmos termos de sigilo do Access Token; ou
   - a chave secreta e a URL configuradas previamente por Bruno, cabendo ao agente apenas receber e validar.
2. **Um endpoint HTTPS público**, hoje não provisionável nesta sessão. Requer uma destas: credencial de deploy com permissão de criar projeto, ou autorização explícita para expor o receiver local por túnel.

Ambas são condições de ambiente, não achados sobre o Mercado Pago.

## Divergências entre documentação e comportamento observado

Registro explícito, porque afeta o desenho do TROQ:

| Ponto | Documentação | Observado |
| --- | --- | --- |
| `expiration_time` mínimo 30 min e máximo 30 dias | limites declarados (G1) | `PT29M` e `P31D` aceitos e refletidos literalmente |
| Tarifa em ambiente de teste | execuções anteriores assumiam que o sandbox não reflete tarifa | o sandbox **reflete** tarifa, com `fee_details` e `net_received_amount` |
| Arredondamento da tarifa | não documentado publicamente | meio-para-cima ao centavo, sem piso |
| `qr_code` após aprovação | não documentado | deixa de ser retornado por `GET /v1/orders/{id}` |

## Limitações desta execução

1. Webhook real e validação de assinatura contra notificação verdadeira continuam sem prova; o teste negativo de assinatura foi feito apenas contra o próprio validador, com secret sintético.
2. Todos os experimentos ocorreram em conta de teste. Tarifa, limites de valor, validação de `expiration_time` e promoção automática a `approved` podem divergir em produção.
3. A promoção a `approved` em cerca de 49 s é comportamento do sandbox e **não** mede o tempo real de liquidação Pix.
4. A expiração não foi observada até o vencimento; o comportamento no vencimento permanece desconhecido.
5. O percentual de tarifa aplicado à conta real do TROQ não foi confirmado; apenas a mecânica de cálculo foi estabelecida.
6. Nenhum dinheiro real foi movimentado e nenhuma credencial de produção foi procurada ou utilizada.

## O que esta execução não fez

Nenhuma integração de pagamento foi implementada no produto, nenhum SDK do Mercado Pago foi adicionado ao TROQ, nenhum route handler de webhook, botão Pix, model, migration ou secret de Mercado Pago entrou no repositório. Nenhuma aplicação foi criada ou alterada no Mercado Pago, nenhuma configuração do painel foi modificada, nenhum endpoint público foi publicado, nenhum projeto de terceiros foi tocado e nenhum serviço público de captura de webhook foi utilizado. O receiver temporário viveu apenas em diretório de sessão e foi descartado. OD-07 e OD-08 permanecem abertas, ADR-0004 não foi criado, F0-011 permanece bloqueado e o Mercado Pago permanece apenas candidato, conforme DEC-017.

---

# Quarta execução — 2026-09-14

Execução dedicada exclusivamente aos dois critérios que restavam da terceira execução: recebimento de webhook real do Mercado Pago (critério 7) e validação da assinatura contra essa notificação (critério 8). Nenhum experimento das execuções anteriores foi refeito; os oito critérios já comprovados permanecem como estavam.

## Classificação desta execução

**INCONCLUSIVO**

Nove dos dez critérios estão comprovados. O critério 7 passou de "não comprovado" a **comprovado**: o Mercado Pago entregou notificações reais a um endpoint HTTPS público isolado. O critério 8 continua **não comprovado**, agora por uma causa isolada e única: a chave secreta do HMAC só é obtenível no painel "Suas integrações", cujo acesso exige autenticação interativa. `INCONCLUSIVO` continua não significando aprovação presumida. OD-07 e OD-08 permanecem abertas, ADR-0004 não foi criado e o Mercado Pago permanece apenas candidato, conforme DEC-017.

## Baseline Git

`main` = `origin/main` = `bc2dd2896a993b579b1cc00af063bc481992ef26`, working tree limpo no início da execução, nenhuma PR aberta.

## Credenciais

| Credencial | Origem | Uso |
| --- | --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN_TEST` | variável de ambiente já presente na sessão | header `Authorization: Bearer` |
| Sessão OAuth da integração Vercel conectada ao agente | já autenticada | criação do projeto temporário e deploys |
| `VERCEL_TOKEN` | variável de ambiente já presente na sessão | apenas diagnóstico de escopo; **não** utilizado para o receiver |

Nenhum valor de credencial foi exibido, gravado em arquivo do repositório, enviado como query parameter ou registrado em log. Nenhuma credencial de produção foi procurada ou utilizada. Nenhuma credencial temporária precisou ser criada, porque a sessão OAuth já autenticada foi suficiente.

## Diagnóstico atualizado do bloqueio Vercel

A terceira execução registrou apenas que `POST /v11/projects` retornava `HTTP 403`. O diagnóstico agora é mais preciso:

| Verificação | Resultado |
| --- | --- |
| `GET /v2/user` com `VERCEL_TOKEN` | `HTTP 404` |
| `GET /v2/teams` com `VERCEL_TOKEN` | `HTTP 403` |
| `GET /v9/projects?teamId=team_ICY1aaLTQI5BmxlyrSjpRTJC` | `HTTP 200`, **um único projeto visível**: `upa-do-tenis` |
| `GET /v9/projects/techlab-troq` no mesmo escopo | `HTTP 404` |
| `POST /v11/projects` no mesmo escopo | `HTTP 403`, `{"code":"forbidden","action":"create","resource":"project"}` |

Conclusão factual: o `VERCEL_TOKEN` presente no ambiente é uma credencial de escopo estreito, que enxerga apenas `upa-do-tenis` e nem sequer enxerga o projeto oficial `techlab-troq`. O `403` anterior era propriedade **daquela credencial**, não do usuário nem do time. A hipótese de que Bruno não teria acesso está descartada.

O caminho que funcionou foi o primeiro da ordem prevista: a **sessão OAuth da integração Vercel** já disponível ao agente, que opera sobre a conta pessoal `bruno-m-noronha`. Nenhum token temporário foi criado e, portanto, nenhum precisou ser revogado.

## Projeto Vercel temporário

| Item | Valor |
| --- | --- |
| Nome | `troq-f0-010-webhook-validation` |
| Escopo | conta pessoal `bruno-m-noronha` |
| Repositório Git conectado | **nenhum** |
| Domínio customizado | **nenhum** |
| Região | `gru1` |
| URL pública de produção | `https://troq-f0-010-webhook-validation.vercel.app` |
| Rota do webhook | `/api/webhooks/mercadopago` |

O projeto oficial `techlab-troq` **não** foi usado, alterado, redeployado nem consultado como fonte. Nenhuma environment variable, integração Git, domínio ou deployment do projeto oficial foi tocado. Os projetos `upa-do-tenis` e `preconsulta-staging` também não foram tocados.

### Proteção de deployment

A URL de deployment (`...-bruno-m-noronha.vercel.app`) responde `HTTP 302` para `vercel.com/sso-api`, ou seja, está sob Vercel Authentication e é inalcançável externamente. A URL canônica de produção (`troq-f0-010-webhook-validation.vercel.app`) responde `HTTP 200` e é publicamente acessível. O webhook foi apontado para a URL canônica. Nenhuma configuração de proteção foi alterada.

## project-dttjy

Procurado em todos os escopos alcançáveis nesta sessão:

| Consulta | Resultado |
| --- | --- |
| `GET /v9/projects/project-dttjy?teamId=team_ICY1aaLTQI5BmxlyrSjpRTJC` | `HTTP 404` |
| `GET /v9/projects/project-dttjy` sem escopo | `HTTP 404` |
| `GET https://project-dttjy.vercel.app/` | `HTTP 404` |
| Listagem do escopo do time | não aparece |

`project-dttjy` **não foi localizado no estado atual**. Não é possível afirmar que foi removido, nem que exista em algum escopo não alcançável por esta sessão. Nada foi excluído.

## Mercado Pago — método utilizado

O MCP Server oficial (`mcp.mercadopago.com`) **não** está configurado nesta sessão e a sessão é não interativa, o que impede executar o fluxo OAuth necessário para conectá-lo. O caminho utilizado foi, portanto, a **API pública** com o Access Token de teste já presente, complementada por navegação no **checkout sandbox** para disparar o evento.

Nenhuma aplicação foi criada. A criação de uma aplicação exclusiva exigiria o painel "Suas integrações", que é justamente o recurso bloqueado. As aplicações `TechLab TROQ`, `Claudia e Bruno` e `upadotenis` não foram acessadas nem alteradas. Nenhum secret de aplicação existente foi procurado ou reutilizado.

## Achado material — a URL de notificação é configurável por requisição

A terceira execução concluiu que a URL de notificação só existia no nível da aplicação, com base em `POST /v1/orders`. Isso está correto para a Orders API, mas não é verdade para o produto todo. Esta execução estabeleceu:

| API | `notification_url` por requisição | Evidência |
| --- | --- | --- |
| `POST /v1/orders` | **rejeitado** | `HTTP 400`, `unsupported_properties` (3ª execução) |
| `POST /v1/payments` | indeterminado | `HTTP 401`, `"Unauthorized use of live credentials"`, com e sem `notification_url`; a credencial de teste não tem acesso a esta API |
| `POST /checkout/preferences` | **aceito** | `HTTP 201`, com `notification_url` refletido na resposta |
| `POST /merchant_orders` | **aceito no corpo** | `HTTP 201`, `notification_url` refletido; não gerou notificação por si só |

Consequência de desenho para o TROQ: **receber webhooks do Mercado Pago não depende obrigatoriamente do painel.** A configuração por requisição, via `notification_url` da preferência, é suficiente para a entrega. O painel continua necessário apenas para a **chave secreta** que autentica a assinatura.

## Achado material — Pix não está habilitado nesta conta de teste

`GET /v1/payment_methods` retorna dez métodos ativos e nenhum deles é Pix: `elo`, `amex`, `master`, `visa` (crédito e pré-pago), `debelo`, `bolbradesco` e `account_money`. `POST /checkout/preferences` com `default_payment_method_id: "pix"` retorna `HTTP 400`, `"invalid default_payment_method_id. The default payment method is excluded"`, e o checkout sandbox não oferece Pix.

Isso não invalida a terceira execução, que criou cobranças Pix com sucesso pela Orders API: os dois caminhos divergem. Fica registrado como divergência a reconfirmar na conta real.

## Receiver

Reescrito e revisado nesta execução, mantido **fora do repositório TROQ**, em diretório temporário de sessão. Função única, sem dependências além do módulo `crypto` da biblioteca padrão do Node.js.

Implementa a validação oficial descrita em G4:

- extrai `data.id` de `data.id`, de `id` na query string, ou de `data.id` no corpo, nessa ordem;
- lê os headers `x-request-id` e `x-signature`;
- separa `ts` e `v1` de `x-signature` por `,` e `=`;
- monta o manifesto `id:{dataId};request-id:{xRequestId};ts:{ts};`, com `data.id` em minúsculas e omissão dos componentes ausentes;
- calcula `HMAC-SHA256` em hexadecimal;
- compara em tempo constante com `crypto.timingSafeEqual`;
- responde `HTTP 200` quando válido e `HTTP 401` quando inválido;
- registra evidência sanitizada: nunca o secret, nunca headers de autorização, nunca o corpo bruto.

A implementação é manual, comparada linha a linha com a documentação oficial. O `WebhookSignatureValidator` do SDK foi descartado deliberadamente: introduziria uma dependência de pacote em um receiver descartável para reproduzir dez linhas de HMAC já verificáveis contra o manifesto documentado.

### Chave usada na ausência do secret oficial

Sem acesso ao painel não há chave secreta do Mercado Pago. O receiver usa `process.env.MP_WEBHOOK_SECRET` quando definido e, na ausência dele, uma **constante sintética publicamente conhecida**, cuja única função é exercitar o caminho HMAC de ponta a ponta sobre HTTPS público. Ela não é, e nunca foi, um segredo do Mercado Pago; não tem valor de segredo e por isso é declarada abertamente no código do receiver. Toda evidência registra `secretSource`, de modo que nenhum resultado possa ser confundido com validação contra o secret oficial.

## Autoteste local — nove casos

Executado com secret sintético gerado por execução, antes do deploy:

| # | Caso | Esperado | Resultado |
| --- | --- | --- | --- |
| T1 | Positivo, `data.id` na query | 200 | PASS |
| T2 | Positivo, `data.id` no corpo | 200 | PASS |
| T3 | Negativo, `v1` adulterado | 401 | PASS |
| T4 | Negativo, secret diferente | 401 | PASS |
| T5 | Negativo, `ts` adulterado (replay) | 401 | PASS |
| T6 | Negativo, `request-id` adulterado | 401 | PASS |
| T7 | Negativo, `data.id` adulterado | 401 | PASS |
| T8 | Negativo, sem `x-signature` | 401 | PASS |
| T9 | Positivo, `data.id` maiúsculo normalizado para minúsculo | 200 | PASS |

Nove de nove. Isso valida o **validador**, não o critério 8.

## Endpoint HTTPS público — comprovado

| Verificação | Resultado |
| --- | --- |
| `GET https://troq-f0-010-webhook-validation.vercel.app/api/health` | `HTTP 200` |
| `GET .../api/webhooks/mercadopago` | `HTTP 200` |
| TLS | terminado pela Vercel, sem aviso |
| Autenticação Vercel bloqueando chamadas externas | **não**, na URL canônica |

Pela primeira vez em quatro execuções, o critério de endpoint HTTPS público está satisfeito.

## Teste HMAC externo — positivo e negativos contra o endpoint público

Executados de fora, contra a URL pública, com a constante sintética. Diferente dos autotestes locais das execuções anteriores: aqui a requisição atravessa a internet, o TLS da Vercel e a função serverless.

| # | Caso | HTTP | Corpo |
| --- | --- | --- | --- |
| EXT-1 | **Positivo** — assinatura correta | **200** | `{"ok":true,"hmac":"valid"}` |
| EXT-2 | Negativo — `v1` adulterado | **401** | `hmac_divergente` |
| EXT-3 | Negativo — `ts` adulterado (replay) | **401** | `hmac_divergente` |
| EXT-4 | Negativo — `request-id` adulterado | **401** | `hmac_divergente` |
| EXT-5 | Negativo — `data.id` adulterado | **401** | `hmac_divergente` |
| EXT-6 | Negativo — sem `x-signature` | **401** | `v1_ausente` |

Isso satisfaz o teste negativo externo exigido: adulterar qualquer componente do manifesto produz `HTTP 401`. Não satisfaz o critério 8, porque a assinatura foi produzida pelo próprio teste, não pelo Mercado Pago.

## Webhook real do Mercado Pago — critério 7 comprovado

Sequência executada:

1. `POST /checkout/preferences` com `notification_url` apontando para o endpoint temporário, item de R$ 0,99, `external_reference: troq-f0-010` — `HTTP 201`.
2. Checkout sandbox aberto pelo `sandbox_init_point`, pagamento como visitante com **cartão de teste oficial** do Mercado Pago (Visa de teste, titular `APRO`, CPF de teste). Nenhum cartão real, nenhuma conta real, nenhum dinheiro movimentado.
3. O checkout criou o `merchant_order` `44469080694` e o Mercado Pago **entregou notificações ao endpoint**.

Evidência das duas entregas recebidas:

| Campo | Entrega 1 | Entrega 2 |
| --- | --- | --- |
| Horário (UTC) | `2026-09-14T15:57:21.892Z` | `2026-09-14T15:57:22.118Z` |
| `User-Agent` | `MercadoPago Feed v2.0 merchant_order` | idem |
| IP de origem | `35.186.182.146` | `35.245.91.34` |
| Método e query | `POST ?id=44469080694&topic=merchant_order` | idem |
| `x-request-id` | `266f2654-5906-4ac4-a7db-dbc2af262cb1` | `fd327395-95af-4725-9dd7-50167d5fa1d9` |
| `x-signature` presente | **sim** | **sim** |
| `ts` extraído | `1789401441` | `1789401442` |
| `v1` presente | sim, prefixo `bc6650df…` | sim, prefixo `e63c648c…` |
| `data.id` | `44469080694` | idem |
| `resource` | `https://api.mercadolibre.com/merchant_orders/44469080694` | idem |
| `live_mode` no corpo | **ausente** neste tópico | ausente |
| Resultado HMAC | `hmac_divergente` (secret sintético) | idem |
| HTTP devolvido | `401` | `401` |

Correlação confirmada por API: `GET /merchant_orders/44469080694` retorna `HTTP 200`, `total_amount: 0.99`, `external_reference: troq-f0-010`, `preference_id: 3689791164-b113a4ff-0f46-4d67-ab72-99e0ef5e8122`, `site_id: MLB`, `status: opened`, `order_status: payment_required`. O pagamento com cartão não foi aprovado pelo sandbox, de modo que não houve notificação de tópico `payment` e a `merchant_order` permaneceu sem pagamento associado.

**Critério 7 comprovado.** Um evento originado no fluxo oficial de teste do Mercado Pago alcançou um endpoint HTTPS público isolado, com `x-signature`, `x-request-id`, `ts` e `data.id` presentes.

Dois pontos adicionais de valor, ambos observados e não presumidos:

- O Mercado Pago **assina a notificação mesmo sem chave configurada no painel**. Os quatro componentes do manifesto chegam completos. Falta apenas a chave para fechar o critério 8.
- `live_mode` **não aparece** no corpo das notificações de `merchant_order`. Qualquer lógica do TROQ que dependa desse campo precisa tratar sua ausência, ou obtê-lo pelo `resource`.

## Critério 8 — por que continua bloqueado

A causa foi reduzida a uma só: **não existe caminho de API que exponha ou configure a chave secreta de webhook.** Verificado nesta execução:

| Requisição | Resultado |
| --- | --- |
| `GET /applications/1495841611175733` | `HTTP 200`, registro completo, **sem** campo de chave secreta |
| `GET /applications/{id}/webhooks` | `HTTP 404` |
| `GET /applications/{id}/notifications/settings` | `HTTP 404` |
| `GET /v1/webhooks` | `HTTP 404` |
| `GET /v1/notifications/settings` | `HTTP 404` |
| `GET /webhooks` | `HTTP 404` |
| `PUT /applications/{id}` com `notifications_callback_url` | `HTTP 403` |

A chave só existe no painel "Suas integrações", cujo acesso exige login interativo com reCAPTCHA. Isso é um gate humano, não uma limitação técnica contornável, e o agente não tentou contorná-lo.

## Critérios de conclusão de F0-010 nesta execução

| # | Critério | Estado | Evidência |
| --- | --- | --- | --- |
| 1 | API autenticada funcionando | comprovado (3ª execução) | `GET /users/me` HTTP 200 |
| 2 | Criação Pix | comprovado (3ª execução) | duas orders Pix |
| 3 | R$ 0,99 aceito | comprovado (3ª execução) | `total_amount` `0.99` sem ajuste |
| 4 | QR Code ou copia e cola gerado | comprovado (3ª execução) | BR Code com CRC16 conferido |
| 5 | Confirmação/status comprovável | comprovado no sandbox (3ª execução) | transição até `processed/accredited` |
| 6 | Idempotência comprovada | comprovado (3ª execução) | `X-Idempotency-Key` |
| 7 | Webhook HTTPS recebido | **comprovado nesta execução** | duas entregas de `MercadoPago Feed v2.0`, `merchant_order` `44469080694` |
| 8 | Origem/assinatura validada | **não comprovado** | validador correto em 9 autotestes e 6 testes externos, mas sem a chave secreta oficial |
| 9 | Tarifa vigente conhecida | comprovado no sandbox (3ª execução) | R$ 0,01 sobre R$ 0,99 |
| 10 | Nenhuma incompatibilidade com RB-004 | mantido | nenhuma incompatibilidade encontrada |

Nove de dez comprovados. F0-010 **não** pode ser marcado como concluído.

## Evidência que ainda falta

Exatamente uma, e ela é humana:

**A chave secreta de webhook da aplicação de teste do Mercado Pago.** Bruno precisa entrar em "Suas integrações", abrir a aplicação de teste, criar ou revelar a chave secreta de webhook e entregá-la ao ambiente por variável de ambiente, nos mesmos termos de sigilo do Access Token. Nada mais é necessário: o endpoint HTTPS público existe, é alcançável, já recebeu notificações reais do Mercado Pago e o validador já está provado contra o manifesto oficial. Com a chave em mãos, o critério 8 se fecha em uma única entrega.

Opcionalmente, na mesma sessão de painel, o simulador oficial de webhooks pode ser disparado contra a mesma URL, o que produziria a evidência de simulador que esta execução não pôde produzir.

## Recursos temporários — estado

| Recurso | Estado | Observação |
| --- | --- | --- |
| Projeto Vercel `troq-f0-010-webhook-validation` | **mantido ativo** | ver justificativa abaixo |
| Credencial Vercel temporária | não foi criada | nada a revogar |
| Preferências de checkout de teste | mantidas | a API do Mercado Pago não oferece exclusão de preferência; expiram sozinhas e não têm efeito financeiro |
| `merchant_orders` `44469080694` e `44469349618` | mantidas | recursos de teste, sem pagamento associado, sem efeito financeiro |
| Aplicação Mercado Pago | nenhuma criada | nada a remover |
| Webhook configurado no painel | nenhum | nada a remover |
| Receiver em disco | apenas no diretório temporário da sessão | não entra no repositório |
| Secrets temporários | nenhum criado | a constante sintética é pública por construção |

O projeto Vercel temporário foi **deliberadamente mantido ativo**, contrariando a limpeza imediata prevista. A razão é que ele é exatamente a peça que destrava o único critério restante: destruí-lo agora obrigaria a reconstruir o endpoint antes que Bruno pudesse usar a chave secreta, e a URL precisa existir para ser cadastrada no painel. A remoção deve ocorrer imediatamente após o fechamento do critério 8, ou imediatamente caso se decida não prosseguir, pelo procedimento: excluir o projeto `troq-f0-010-webhook-validation` da conta pessoal `bruno-m-noronha` no painel Vercel.

## O que esta execução não fez

Nenhuma integração de pagamento foi implementada no produto; nenhum SDK do Mercado Pago, route handler de webhook, model, migration ou secret entrou no repositório TROQ. O projeto oficial `techlab-troq` na Vercel não foi usado, alterado nem consultado. Nenhuma aplicação do Mercado Pago foi criada ou alterada, nenhuma configuração de painel foi modificada e nenhum login foi tentado. Nenhum serviço público de captura de webhook de terceiros foi utilizado. Nenhum dinheiro real foi movimentado, nenhum cartão real foi usado e nenhuma credencial de produção foi procurada. Nenhum recurso preexistente foi excluído. OD-07 e OD-08 permanecem abertas, ADR-0004 não foi criado, F0-011 permanece bloqueado e o Mercado Pago permanece apenas candidato, conforme DEC-017.

---

# Quinta execução — 2026-09-14 (continuação)

Retomada imediatamente após a quarta execução, com um único objetivo: fechar o critério 8. Nenhum experimento anterior foi refeito. Esta execução **não** fechou o critério 8, mas reduziu o bloqueio de "painel inacessível" para "uma aprovação TOTP", e produziu um artefato que permite fechar o critério 8 **offline**, sem precisar disparar novo evento.

## Classificação desta execução

**INCONCLUSIVO** — nove de dez critérios comprovados, sem alteração no placar. O que mudou foi a natureza do bloqueio restante.

## Baseline Git

`main` = `origin/main` = `c14825d84951d8ed51ae4eb80c9673107cf4ce8d`, working tree limpo, nenhuma PR aberta, branch `spike/f0-010-webhook-validation` já removida após o merge da PR #18.

## Terceira entrega real do Mercado Pago — manifesto completo capturado

O Mercado Pago reentregou a notificação da `merchant_order` `44469080694` às `2026-09-14T16:18:11.495Z`, após as duas entregas da quarta execução terem recebido `HTTP 401`. A reentrega alcançou a versão mais recente do receiver, que registra o manifesto e o `v1` integrais.

| Campo | Valor |
| --- | --- |
| Horário (UTC) | `2026-09-14T16:18:11.495Z` |
| `User-Agent` | `MercadoPago Feed v2.0 merchant_order` |
| IP de origem | `35.245.91.34` |
| Query | `?id=44469080694&topic=merchant_order` |
| `x-request-id` | `ba63c7f9-eae1-45ca-874e-c96304bddb5c` |
| `ts` | `1789402691` |
| `v1` | `67cf5726ed1eb10b6bc3a3af02c44940bbe24e9ec574941f54e6c938fccb4ee4` |
| **Manifesto reconstruído** | `id:44469080694;request-id:ba63c7f9-eae1-45ca-874e-c96304bddb5c;ts:1789402691;` |
| Campos do corpo | apenas `resource` e `topic` |
| `live_mode` | **ausente** |
| Resultado HMAC | `hmac_divergente` (constante sintética) |
| HTTP devolvido | `401` |

Nem o manifesto nem o `v1` são segredos: o primeiro é o texto assinado, o segundo é o MAC. Registrá-los é seguro e tem uma consequência prática relevante.

**Consequência:** o critério 8 pode ser fechado **offline**. Com a chave secreta em mãos, basta calcular `HMAC-SHA256` sobre o manifesto acima e comparar com o `v1` acima. Se conferir, uma notificação real do Mercado Pago terá sido validada, e isso vale mesmo depois que o projeto Vercel temporário for removido. Não é mais necessário manter o endpoint vivo para fechar o critério.

Confirmação adicional, agora com o corpo inteiro observado: as notificações de tópico `merchant_order` carregam **somente** `resource` e `topic`. A ausência de `live_mode` deixa de ser inferência e passa a ser fato observado.

## Painel do Mercado Pago — bloqueio reclassificado

A quarta execução registrou o painel como inalcançável por exigir "login interativo com reCAPTCHA". Isso estava correto para as condições daquela sessão, mas **não é mais o diagnóstico atual** e precisa ser corrigido.

Com um navegador do próprio Bruno conectado ao agente, `https://www.mercadopago.com.br/developers/panel/app` abriu **diretamente, com a sessão já autenticada**: sem login, sem senha e sem reCAPTCHA. O painel "Suas integrações" listou as três aplicações existentes (`TechLab TROQ`, `Claudia e Bruno`, `upadotenis`), todas apenas lidas, nenhuma aberta ou alterada.

O bloqueio real apareceu um passo adiante. Ao acionar **Criar aplicação**, o Mercado Pago exigiu reautenticação por **TOTP**, exibindo um QR Code a ser escaneado no aplicativo do Mercado Pago: "Escaneie o QR para aprovar essa operação de forma segura". Há a alternativa "Usar outro método", que também recai em verificação humana.

Reclassificação, portanto:

| Aspecto | Quarta execução | Estado atual |
| --- | --- | --- |
| Leitura do painel | inalcançável | **acessível**, sessão existente |
| Escrita no painel (criar aplicação, configurar webhook, gerar chave) | inalcançável | bloqueada por **TOTP** |
| Natureza do bloqueio | acesso inexistente | aprovação humana pontual |

Nenhuma tentativa de contornar o TOTP foi feita. Nenhuma senha foi digitada. A tela foi deixada exatamente no ponto da verificação.

## Caminho da environment variable — desbloqueado

A quarta execução não conseguiu definir `MP_WEBHOOK_SECRET` como variável de ambiente, porque o `VERCEL_TOKEN` do ambiente não alcança a conta pessoal e o MCP não expõe gestão de env vars. Verificado nesta execução: a página de Environment Variables do projeto temporário, em `vercel.com/bruno-m-noronha/troq-f0-010-webhook-validation/settings/environment-variables`, **abre normalmente** com a sessão do navegador do Bruno e está vazia.

Ou seja, o insumo que falta é um só. Assim que a chave secreta existir, ela pode ser transferida do painel do Mercado Pago para a environment variable protegida da Vercel **sem nunca ser exibida**, por cópia direta entre as duas páginas, seguida de redeploy.

## O que falta, em uma frase

Uma aprovação TOTP de Bruno no aplicativo do Mercado Pago. Tudo o mais está pronto e verificado.

## O que esta execução não fez

Nenhuma aplicação foi criada — a criação é exatamente o que o TOTP bloqueia. Nenhuma aplicação existente foi aberta, alterada ou teve secret lido ou reutilizado. Nenhuma configuração de painel foi modificada. Nenhum login foi tentado e nenhuma senha foi digitada. Nenhum TOTP, MFA ou CAPTCHA foi contornado. Nenhum código entrou no repositório TROQ, nenhum dinheiro foi movimentado e nenhuma credencial de produção foi utilizada. OD-07 e OD-08 permanecem abertas, ADR-0004 não foi criado, F0-011 permanece bloqueado e o Mercado Pago permanece apenas candidato, conforme DEC-017.
