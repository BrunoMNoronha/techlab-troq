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
