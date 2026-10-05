# Homologação Pix no Preview — pagador oficial do sandbox

Roteiro de #104 para produzir evidência da jornada monetizada de #102/C-8 com o Mercado Pago real em seu ambiente de teste. Código preparado em 2026-10-05; este documento não registra execução remota, não aprova #104/#105 e não autoriza cobranças reais.

## Por que existe o modo

O [teste Pix oficial](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix) cria uma order com `payer.email = "test_user_br@testuser.com"` e `payer.first_name = "APRO"`. A order nasce pendente e o sandbox a aprova automaticamente depois; não há transferência bancária. O fluxo normal do TROQS envia somente o email da conta, por PD-4.7. A flag adapta apenas o pagador enviado ao sandbox para que a mesma jornada HTTP/UI possa observar a aprovação real do provedor.

## Pré-condições e isolamento

1. Confirmar SHA, run/tentativa, deployment e alias estável de Preview. Conferir que o deployment usa `APP_ENV=preview` e que a Vercel identifica o escopo como Preview.
2. Usar a aplicação e as credenciais **de teste** destinadas a esse ambiente. Aplicações Orders novas geram vendedor e credenciais de teste automaticamente. `APP_USR` também é prefixo de teste: não classificar o token pelo prefixo. Confirmar a origem em **Suas integrações → aplicação → Testes → Credenciais de teste**, sem copiar valores para a evidência. [Credenciais automáticas](https://www.mercadopago.com.br/developers/pt/news/2025/11/19/Streamlined-integration-testing-with-automatic-credentials), [contas de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/test-accounts).
3. Conferir que Access Token, `MERCADO_PAGO_APPLICATION_ID` e chave de webhook pertencem à configuração de teste correta. O webhook deve alcançar `/api/webhooks/mercadopago` no Preview protegido, com o tópico Order habilitado e a configuração de proteção já autorizada. Registrar apenas resultados de conferência; nunca tokens, headers de autorização, URLs com segredo, payload integral, email ou dados do collector.
4. Preparar atores sintéticos/elegíveis do TROQS e anúncio por seus fluxos autorizados: dono com contato sintético, solicitante que será escolhido e outro ator para a negativa de acesso. Um seed explicitamente autorizado em Preview pode preparar essas pré-condições, desde que seja auditado como sintético e não crie solicitação, reserva, tentativa, pagamento, escolha, negociação ou liberação. Esse seed não prova cadastro, Google, entrega de email, maioridade ou consentimento humano. A jornada monetizada começa pela interface e conserva as autorizações normais. O pagador fixo existe somente no corpo enviado ao Mercado Pago; contas de teste Mercado Pago são distintas desses atores.
5. Ativar, somente no servidor de Preview, `MERCADO_PAGO_PIX_SANDBOX_AUTO_APPROVE=1` e publicar a revisão autorizada. A variável não usa `NEXT_PUBLIC_`, não aparece em UI e não aceita seleção pelo solicitante. Production mantém ausente/`0`.

## Guardas executadas pelo código

- Ausente/`0`: não há consulta adicional, e o corpo normal da cobrança é preservado.
- `1`: aceita somente `APP_ENV=development` ou `preview`; `VERCEL_ENV=production` recusa mesmo com `APP_ENV` incompatível com o deployment. Outros valores recusam antes de qualquer chamada.
- Antes de **cada** criação, `GET /users/me` com cache desabilitado precisa devolver `200`, id válido, `site_id=MLB` e tag exata `test_user`. A mesma credencial capturada é usada nessa leitura e na criação; não existe cache da confirmação.
- Conta real, dados incompletos, recusa HTTP, rede indisponível ou tempo esgotado impedem o `POST /v1/orders`. O resultado contém somente o código fixo `sandbox_collector_unverified` ou o motivo técnico de indisponibilidade. O corpo e os dados do collector não saem do adaptador.

## Execução e evidência

1. No navegador a 375 px, o solicitante confirma a solicitação e obtém a reserva e o Pix de **R$ 0,99** pelo fluxo existente. Conferir carregamento, prazo e instruções. A tentativa, a chave de idempotência, a referência e a janela são as persistidas pelo TROQS; não criar outra order manualmente.
2. Aguardar a aprovação automática do sandbox. Não há prazo de aprovação garantido por este runbook; o spike histórico observou aproximadamente 49 segundos, sem transformar isso em SLA.
3. Observar a mesma order como `processed/accredited`. O mecanismo existente consulta a order e busca o pagamento por `external_reference` para conferir `approved/accredited`, valor igual e `date_approved` válida (ADR-0008), e verifica a tempestividade em relação à reserva. Falha, ausência, divergência ou acreditação tardia seguem o tratamento existente; a flag não transforma nenhum deles em sucesso.
4. Comprovar notificação real do provedor recebida e validada no Preview, com aplicação/HMAC corretos. Se necessário, invocar o job autenticado de reconciliação nos termos de DEC-042; observar processamento não vazio e convergência. Simular notificação no painel não modifica o estado autoritativo da order e não substitui essa comprovação.
5. Conferir a solicitação paga na interface do dono, realizar escolha com confirmação e entregar o contato somente ao escolhido. Exercitar a recusa do outro ator.
6. Registrar intervalo, identidade do deployment e identificadores técnicos não sensíveis. Executar a varredura C-8 das mensagens de erro, console, runtime Vercel e Sentry remoto, com controle não vazio ligado ao mesmo fluxo e intervalo; nenhuma ocorrência do contato sintético nas superfícies proibidas. Não reproduzir o contato no relatório.
7. Após concluir ou interromper a homologação, desativar a flag em Preview e republicar conforme o fluxo autorizado. Não alternar o modo durante uma criação inconclusiva: primeiro reconciliar a tentativa e apurar sua order existente, mantendo credenciais/ambiente, para preservar a identidade do corpo enviado com a mesma chave.

## Limites do aceite

Sem aprovação autoritativa, webhook legítimo e efeito persistido, a jornada permanece parcial. Sem recebimento/varredura remotos com controle não vazio, C-8 permanece pendente. Um controle isolado `APRO`, uma fixture paga no banco ou HTTP `200` em lote vazio não aprovam o fluxo completo.

O sandbox valida o contrato do provedor em teste; não prova transferência Pix, tarifas, disponibilidade ou comportamento de produção. A flag é bloqueada em Production, e sua presença acidental como `1` impede criar cobrança. Consultas, cancelamentos, reembolsos e confirmação mantêm os contratos existentes e não ganham aprovação manual. Nenhuma migration ou rota de backdoor é criada.

## Validação local

`pnpm test:ci src/modules/payments/mercado-pago/` exercita HTTP simulado local, inclusive guardas, payload normal, payload `APRO`, falhas e rotação da credencial. `pnpm lint`, `pnpm typecheck` e `pnpm build` validam o checkout. Esses checks não executam Mercado Pago, banco compartilhado ou Preview e não são prova de homologação remota.

## Diagnóstico temporário de assinatura — 2026-10-05

Diagnóstico técnico autorizado nesta execução para a única Order sintética `ORDTST01M470XYBP4A7H1CNTX4Y3D4F0`. `MERCADO_PAGO_WEBHOOK_DIAGNOSTIC_ORDER_ID` fica vazio por padrão. Só essa correspondência exata, com **ambos** `APP_ENV=preview` e `VERCEL_ENV=preview`, permite coletar; ausência, valor divergente ou outro ambiente desliga sem mudar a autenticação. Configuração/publicação remotas e reenvio do provedor dependem do fluxo operacional autorizado; esta alteração não os executa.

A coleta ocorre somente após a recusa normal `signature_invalid`, mantendo as guardas de tópico, aplicação e parsing. Reutiliza os mesmos inputs e a mesma chave capturada pelo receptor para comparar a caixa original e minúscula da query. O perfil **raw continua sendo a única autenticação**, conforme DEC-052: `lowerMatch=true` continua em HTTP 401, sem `PaymentNotification`, confirmação financeira ou chamada ao gateway. Não há fallback, fonte alternativa no corpo ou chave alternativa.

Depois de registrar a recusa normal e seu sinal, uma transação independente com prazo curto, advisory lock e verificação persistida admite **no máximo um** evento `payment.notification_signature_diagnostic`. Exige tentativa existente com `provider_order_id` exatamente igual à Order fixa; o alvo é o UUID dessa tentativa e o ator é nulo. `details` contém exclusivamente `rawMatch`, `lowerMatch` e `casesDiffer` (a caixa da query muda ao convertê-la para minúsculas). Não grava assinatura, MAC, manifesto, `ts`, headers, corpo, contato ou segredo. Falha da coleta mantém a auditoria normal já comitada e a recusa; nenhum schema ou efeito de negócio é criado.

As provas locais incluem guardas e falhas isoladas, PostgreSQL descartável com concorrência observada e, quando `HMAC_DIAGNOSTIC_HTTP_BASE_URL` aponta ao Next local com o mesmo banco/configuração sintética, a rota HTTP real. O comando é `pnpm test:integration src/modules/payments/signature-diagnostic.integration.test.ts`, com `INTEGRATION_EPHEMERAL_DB=1`; essa fixture recusa banco e servidor HTTP remotos. Isso não comprova a chave remota nem resolve por si só a divergência SDK/manual. O protocolo exercitado, webhook legítimo, homologação e #104/#105 continuam pendentes. Remover a variável e republicar após coletar ou interromper o diagnóstico; não configurar em Production.
