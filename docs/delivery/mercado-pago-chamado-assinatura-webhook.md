# Chamado ao suporte do Mercado Pago Developers — assinatura de webhook de Orders (sandbox)

Texto preparado em 2026-10-15 para a [#203](https://github.com/BrunoMNoronha/techlab-troq/issues/203). Ele não contém nenhum segredo: nem assinatura secreta, nem Access Token, nem o parâmetro de bypass da URL. Quem envia é o titular da conta, pelo [suporte do Mercado Pago Developers](https://www.mercadopago.com.br/developers/pt/support).

---

**Assunto:** Webhook de Orders (ambiente de teste): `x-signature` não confere com a assinatura secreta da aplicação, nem depois de redefini-la

**Contexto**

- Aplicação: **TROQ Sandbox**, número `8611661876852749`.
- Integração: Checkout Transparente via **Orders API**, Pix (`POST /v1/orders`), com as credenciais de teste dessa aplicação. O pagador oficial de teste é o `APRO`.
- Webhook configurado na própria aplicação, em **Webhooks → Configurar notificações**, modo de teste, com o evento **Order**. A URL é `https://techlab-troq-git-preview-bruno-m-noronha.vercel.app/api/webhooks/mercadopago`, com um parâmetro de query nosso (bypass de proteção do ambiente).
- As notificações chegam ao nosso endpoint e aparecem no histórico de Webhooks da TROQ Sandbox (ambiente Teste). Respondemos 401 porque a assinatura não confere.

**Como validamos**, seguindo "Configurar notificações de orders", aba *Sem SDKs*:

- `ts` e `v1` vêm do header `x-signature`.
- O manifesto é `id:[data.id da query];request-id:[x-request-id];ts:[ts];`.
- Calculamos HMAC-SHA256 em hexadecimal, com a assinatura secreta como chave, e comparamos com `v1`.
- Testamos o `data.id` com a caixa original (`ORDTST…`) e também em minúsculas, como a documentação indica para Orders. **Nenhum dos dois confere.**
- Em todas as notificações, o header `x-request-id` está presente, o `data.id` da query é idêntico ao `data.id` do corpo e aparece uma única vez na URL, e `ts` tem 10 dígitos.

**O que já tentamos**

- Copiar a assinatura secreta da tela de Webhooks da TROQ Sandbox e atualizar o ambiente. Foram três tentativas, com publicação depois de cada uma.
- **Redefinir** a assinatura secreta pelo botão do painel, em 15/10/2026 por volta das 15:44 UTC, e publicar a nova. A primeira notificação assinada depois disso também falhou (exemplo 3 abaixo).

**Observação que nos parece relevante**

O campo `application_id` no **corpo** das notificações é `7747075571191345`. Esse número é diferente do número da aplicação TROQ Sandbox (`8611661876852749`), onde o webhook está configurado e onde as entregas aparecem no histórico.

**Exemplos** (notificações `order`, ambiente de teste, horários em UTC):

1. Order `ORDTST01M500QX7BZ2JY5PXNYBTMADH9`, primeira entrega em 15/10/2026 14:51:33.
2. Order `ORDTST01M5038F43ENZJJNKRQKGHMN0V`, primeira entrega em 15/10/2026 15:35:33.
3. Order `ORDTST01M503ZWB8DXCHYRRPNFQWKNA2`, primeira entrega em 15/10/2026 15:48:17, depois da redefinição da assinatura.

**Perguntas**

1. Qual assinatura secreta assina as notificações de **Orders** geradas com as **credenciais de teste** de uma aplicação? É a mesma exibida em Webhooks → Configurar notificações, ou outra?
2. Por que o `application_id` das notificações (`7747075571191345`) é diferente do número da aplicação TROQ Sandbox (`8611661876852749`)? A assinatura é feita no contexto dessa outra aplicação?
3. Para Orders, o manifesto correto é `id:[data.id em minúsculas];request-id:[x-request-id];ts:[ts];`? Há diferença entre o ambiente de teste e o de produção?
4. A redefinição da assinatura secreta vale imediatamente para as notificações do ambiente de teste?
