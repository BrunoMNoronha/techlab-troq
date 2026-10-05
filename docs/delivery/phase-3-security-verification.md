# Verificação de segurança da Fase 3 — F3-014 (#104)

Baseline: `23b503d` (inclui #147, #148 e #89). Branch: `codex/issue-104-seguranca`. Revisão técnica: Codex, no escopo da execução solicitada por Bruno. Status: **parcial; Preview e Sentry remoto pendentes**. Este documento não aprova #105/#54 nem o lançamento #130.

## Método e matriz

As provas usam PostgreSQL 17 descartável e sessões Better Auth reais. A emissão de e-mail e o Mercado Pago são simulados; não há pagamento real. Mock de `next/headers` na chamada direta só fornece o cookie emitido pelo provedor real; a prova HTTP envia esse mesmo tipo de cookie para um servidor Next.js real.

`authorization-matrix.integration.test.ts` foi estendida com reserva, pagamento, escolha, reseleção e entrega. A fotografia de domínio inclui as tabelas financeiras, os guards de #148, negociações, autorizações e acessos, além das tabelas de anúncios e mídia. A negativa de entrega grava `contact.access_denied`: esse evento previsto no contrato é permitido, sem alteração dos fatos de negócio.

| Atores reais | Ações e leituras verificadas | Resultado exigido |
| --- | --- | --- |
| Anônimo, revogado, expirado, não verificado, `blocked_age`, `blocked_admin`, `deletion_requested` | Registrar contato; reservar; obter Pix; escolher; opções do dono; solicitação, lista de solicitações e lista de liberações | Recusa de sessão, sem gravação de negócio; nenhuma leitura privada |
| Terceiro, reserva, pago não escolhido, escolhido, escolhido anterior | Escolha e opções de anúncio alheio; Pix de reserva alheia; solicitação alheia | Recusa uniforme; inexistente e recurso alheio indistinguíveis; banco idêntico |
| Dono | Escolha idempotente; tentativa de reservar o próprio anúncio; Pix de terceiro; entrega ao próprio anunciante | Só a escolha autorizada funciona; não recebe contato do solicitante |
| Escolhido atual e anterior | Entrega e releitura das autorizações próprias e alheias | Cada um conserva sua autorização; a anterior não dá acesso à nova; cada entrega auditada |

`contact-delivery.http.integration.test.ts` amplia a prova por HTTP: HTML e RSC de `/contatos`, `/solicitacoes`, `/solicitacoes/[id]` e `/anuncios/[id]/solicitacoes`, cinco Server Actions e os três jobs de pagamento. Contas tornadas inválidas **depois** do login exercitam sessões remanescentes. Cookie de usuário, ausência de segredo, segredo errado e esquema Basic não autorizam jobs. Suítes existentes completam os controles positivos de dono/solicitante, o isolamento entre contas, a superfície pública, o fechamento do anúncio e a recusa `already_paid`.

## C-8: fluxo completo e erro real

Novo caso em `payment-confirmation.integration.test.ts`: reserva e Pix pelo fluxo real; aprovação observada no provedor simulado; webhook validado; escolha do dono; entrega ao escolhido; negativa a terceiro; erro real do PostgreSQL ao gravar o acesso, com rollback. A SDK real `@sentry/nextjs` usa `createTelemetryOptions` e transporte que captura os envelopes sem rede. A prova percorre breadcrumbs, mensagem, erro e log estruturado; captura cinco níveis de console, auditoria e respostas de erro. Contato só aparece na resposta autorizada, excluída da varredura das superfícies proibidas.

A captura tem controles não vazios: envelope com marcador diagnóstico conhecido, erro real e log real, além de um acesso gravado. Isso comprova a fronteira local da SDK; **não comprova recebimento nem busca no Sentry remoto do Preview**.

## Achado corrigido

| ID | Severidade | Evidência e correção | Limite |
| --- | --- | --- | --- |
| F3-S1 | Média | Webhook rejeitado com telefone em `x-request-id` e `data.id` persistia o número em `AuditEvent.details`. A regressão falhou antes da correção, mostrando os dois campos. `safeRejectedId` agora descarta identificadores que a redação compartilhada reconhece como sensíveis, antes de gravar a negativa. Prova também pela rota HTTP | Heurística conservadora pode descartar identificadores técnicos numéricos; não altera assinatura, resposta, correlação de notificações validadas, pagamentos ou vagas |

O prefixo dos identificadores sintéticos de rejeição foi ajustado para distinguir correlação técnica de uma sequência isolada semelhante a telefone. Os testes continuam exigindo o identificador técnico completo no registro legítimo; não foram relaxados. A rajada HTTP tem 32 requisições concorrentes, cada uma recusada e auditada, sem alteração dos fatos financeiros nem persistência do telefone enviado no corpo.

## Reexecução dos contratos no mesmo SHA

O job de integração aplica todas as migrations em PostgreSQL efêmero, faz o build e inicia o servidor HTTP. As suítes abaixo rodam no **mesmo checkout/SHA do job**. Execução em sandbox real do Mercado Pago e homologação de Preview são camadas separadas.

| Critério | Prova executável principal |
| --- | --- |
| T-1 | `reservation.integration.test.ts`: mais de três participantes e espera real observada em `pg_stat_activity` |
| T-2 | `payment-confirmation.integration.test.ts`: confirmações concorrentes da última vaga |
| T-3 | Mesma suíte: webhook repetido, um único efeito |
| T-4 | Mesma suíte: eventos fora de ordem |
| T-5 | `payment-reconciliation.integration.test.ts`: aprovação sem nenhuma notificação |
| T-6 | `payment-confirmation.integration.test.ts`: acreditação tempestiva, reconhecimento tardio |
| T-7 | `technical-refund.integration.test.ts`: aprovação fora da janela e RT-2 |
| T-8 | Mesma suíte: eleição canônica concorrente e RT-1; `late-duplicate.integration.test.ts` complementa #147 |
| T-9 | `technical-refund.integration.test.ts`: três vagas ocupadas, RT-3 |
| T-10 | `payment-confirmation.integration.test.ts`: falha de persistência e retomada |
| T-11 | Mesma suíte: consulta ao provedor indisponível |
| T-12 | Mesma suíte e classificadores unitários de pagamento: estado desconhecido |
| T-13 | Mesma suíte e `webhook.http.integration.test.ts`: autenticidade e registro mínimo |
| T-14 | Mesmas suítes: manifesto reconstruído do corpo recusado |
| T-15 | `charge.integration.test.ts`: criação retomada com a mesma chave |
| T-16 | `technical-refund.integration.test.ts`: reembolso repetido reconhecido como concluído |
| T-17 | `payment-reversal.integration.test.ts`: reversão preserva vaga e liberação, retira elegibilidade |
| T-18 | `payment-reconciliation.integration.test.ts`: trabalhos realmente sobrepostos, conjuntos disjuntos |
| C-1 | `public-surface.http.integration.test.ts`, contratos públicos e `contact.integration.test.ts` |
| C-2 | `contact-delivery.integration.test.ts` e prova HTTP: pago não escolhido |
| C-3 | Mesma suíte: solicitação fora de `paid` |
| C-4 | Mesma suíte e matriz: autorização alheia |
| C-5 | Mesma suíte: prova substituta de DV-13, ator real sem relação; reexecutar com moderador real em #55 |
| C-6 | Mesma suíte, matriz e HTTP: entrega e auditoria de cada acesso |
| C-7 | `contact-delivery.http.integration.test.ts`: cabeçalhos e manifesto sem pré-renderização |
| C-8 | Fluxo completo com SDK real e erro real nesta entrega; Preview remoto ainda pendente |
| C-9 | `selection.integration.test.ts`: escolhas concorrentes observadas no banco |
| C-10 | `payment-reversal.integration.test.ts` e entrega: contato anterior permanece após reversão |
| C-11 | `contact-reveal.test.tsx` e HTTP: número ausente de propriedades e payload antes da ação autorizada |

## Validações e revisão reforçada

- PostgreSQL local: 11 migrations aplicadas em banco vazio descartável.
- Matriz direta: **25/25 aprovados** na execução local, incluindo os 13 casos adicionados.
- Confirmação/C-8/F3-S1: **33/33 aprovados** na reexecução local após a correção.
- F3-S1: regressão inicialmente **reprovada** com os dois identificadores contendo telefone, antes da correção.
- CI completa e HTTP: pendentes neste registro inicial.
- Revisão de fonte: validação de sessão por ação; autorização por titularidade; cadeia da entrega conferida a cada acesso; trava de anúncio e guard de pagamento; ausência de número nos DTOs, auditoria legítima, sinais e e-mails; receptor público com corpo limitado e assinatura obrigatória; jobs por segredo, sem substituição por cookie.

Nenhuma dependência nova ou migration criada. As mudanças de produção se limitam à redação dos identificadores de webhook rejeitado e à exportação da função compartilhada de redação. Nenhuma nova política de negócio, perfil de moderação ou exceção a RB-001.

## Pendências de aceite

1. Revalidar o fluxo completo no Preview identificado, incluindo o recebimento e a busca no Sentry remoto, logs da Vercel e erros da interface. A tentativa de ler a aba Edge autenticada do Sentry falhou duas vezes por timeout de CDP; nenhum resultado remoto foi presumido.
2. Registrar SHA, deployment, intervalo e controles que comprovem que a varredura observou eventos do fluxo. Os registros históricos de #103 demonstram sinais de jobs na release `dc51132`; não substituem C-8 desta revisão.
3. Promoção/publicação do Preview requer pedido explícito conforme `ai-agent-workflow.md`, seção Publicação por ambientes. Nenhuma promoção foi realizada nesta entrega.
4. Reexecutar C-5 com moderador real quando a Fase 4 introduzir o papel (#55).

Não há achado de código conhecido deixado sem correção nesta entrega. Não se atribui dono ou prazo inventado para acesso/homologação pendentes. Até concluir a prova remota, a PR usa **Refs #104**, permanece aberta e #104 não fecha; #105/#54 também permanecem pendentes.
