# Verificação de segurança da Fase 2 — F2-012

Entregável de [#50](https://github.com/BrunoMNoronha/techlab-troq/issues/50), executado em 2026-09-30 sobre `main` em `383c8b8`.

Consolida a verificação de autorização, concorrência e ausência de contato nas superfícies públicas e restritas. É evidência de entrada para a auditoria do gate da Fase 2 em [#51](https://github.com/BrunoMNoronha/techlab-troq/issues/51). Este documento **não** aprova o gate: o veredito continua em [phase-3-transition.md](phase-3-transition.md).

## 1. Método e camadas

Cada prova declara a camada em que roda. Nenhuma camada substitui outra.

| Camada | O que é | Onde |
| --- | --- | --- |
| Unitária (simulada) | Prisma, sessão ou provedor simulados; prova a forma das respostas | `pnpm test:ci`, na CI de toda PR |
| Integração com banco descartável | PostgreSQL real e sessões Better Auth reais, sem R2 | `INTEGRATION_EPHEMERAL_DB=1` ([testing.md](../engineering/testing.md), seção 7) |
| Integração com R2 real | igual, mais o bucket de `development` | `R2_INTEGRATION=1` |
| HTTP real | build de produção (`pnpm build` + `pnpm start`) sobre o mesmo banco descartável, com requisições HTML e RSC | `PUBLIC_SURFACE_BASE_URL` e `PRIVATE_SURFACE_BASE_URL` |
| Preview | deployment da Vercel sobre o Neon de `preview`, sem sessão e só leitura | seção 9: 95 de 96 verificações; a diferença é a falha fechada por configuração ausente |

As suítes de integração **não rodavam na CI** (achado A-6). Desde F2-013 (#51), o job `Integração (PostgreSQL efêmero)` roda as que não exigem o R2 real, inclusive as três desta verificação.

Três suítes novas desta entrega foram submetidas a mutação: o defeito introduzido de propósito em cada uma foi detectado, e o código foi restaurado em seguida.

| Suíte | Mutação | Resultado |
| --- | --- | --- |
| `authorization-matrix.integration.test.ts` | `getListingForEdit` aceitando sessão inválida | 4 atores reprovados |
| `authorization-matrix.integration.test.ts` | `getOwnerListingImages` sem o filtro de dono | caso do terceiro reprovado |
| `private-surface.http.integration.test.ts` | `getListingForEdit` sem o filtro de dono, com novo build | caso do terceiro reprovado |
| `redaction.test.ts` | redator sem a regra nova | teste novo reprovado |

## 2. Atores

| Ator | Como é produzido na prova |
| --- | --- |
| anônimo | sem cookie |
| sessão revogada | login real, depois linhas de `sessions` apagadas |
| sessão expirada | login real, depois `expires_at` no passado |
| e-mail não verificado | login real com a conta verificada, depois `email_verified = false` (sessão remanescente) |
| `blocked_age`, `blocked_admin`, `deletion_requested` | login real com a conta ativa, depois o estado alterado (sessão remanescente) |
| terceiro | conta ativa e verificada, com os próprios anúncios |
| dono | conta ativa e verificada, dona dos recursos atacados |

Todos têm telefone sintético persistido em `user_contacts` (`+55 11 90000-0000`). O login de conta não verificada ou não ativa já é recusado pelo provedor (`auth-flow.integration.test.ts`); a sessão remanescente é o caso difícil.

## 3. Matriz por chamada direta das Server Actions

Operações: `createDraftListing`, `getOwnerListings`, `getListingForEdit`, `updateListing`, `publishListing`, `pauseListing`, `reactivateListing`, `closeListing`, `discardDraft`, `getOwnerListingImages`, `requestImageUpload`, `requestImageReupload`, `confirmImageUpload`, `deleteListingImage` e `reorderListingImages`.

| Ator | Resultado exigido | Prova |
| --- | --- | --- |
| anônimo, revogada, expirada, não verificado, `blocked_age`, `blocked_admin`, `deletion_requested` | as 15 operações dão `unauthenticated`. Os inválidos atacam os próprios rascunhos, publicados, pausados e imagens (`ready`, `uploaded`, `failed`); o anônimo ataca os do dono. O banco inteiro fica idêntico (fotografia antes e depois de 11 tabelas de domínio), e nenhuma resposta traz contato, e-mail ou id de outro usuário, chave de objeto, ETag ou URL pré-assinada | `authorization-matrix.integration.test.ts`, 7 casos (banco descartável) |
| terceiro sobre recursos do dono | as 13 operações sobre recurso dão `not_found`, **idêntico** à resposta para UUIDs inexistentes; "meus anúncios" do terceiro sem nenhum anúncio do dono; banco idêntico | `authorization-matrix.integration.test.ts`; também `listing-drafts.integration.test.ts` (5 a 8), `listing-lifecycle.integration.test.ts` ("anúncio de outro usuário") e `media-pipeline.integration.test.ts` ("anúncio alheio…", "imagem alheia…") |
| dono com identificador malformado | a mesma resposta de inexistente nas 13 operações | `authorization-matrix.integration.test.ts` |
| dono | leituras privadas funcionam, sem contato, dono nem chave; a escrita válida funciona e não toca anúncio alheio | `authorization-matrix.integration.test.ts`; transições em `listing-lifecycle.integration.test.ts`; mídia em `media-pipeline.integration.test.ts` |
| sessão revogada depois do uso | a chamada seguinte é recusada e nada é gravado | `authorization-matrix.integration.test.ts`; provedor em `auth-flow.integration.test.ts` (expirada, revogada, removida por `userId`, cookie adulterado) |
| payload adulterado (dono e estado vindos do cliente) | ignorados: dono e estado vêm do servidor | `listing-drafts.integration.test.ts` (1 a 3) |

## 4. Superfícies por HTTP real

| Superfície | Prova | Resultado |
| --- | --- | --- |
| `/`, `/explorar`, `/explorar/[id]` | `public-surface.http.integration.test.ts` (#49) | HTML e RSC para anônimo, terceiro e dono sem dado privado; 404 uniforme; cache nunca público; retirada imediata após T3/T5 ([listing-contract.md](../architecture/listing-contract.md), seção 16) |
| `/anuncios`, `/anuncios/novo`, `/anuncios/[id]/editar`, `/conta` | `private-surface.http.integration.test.ts` | os 7 atores inválidos: HTML **307** para `/login?motivo=…`; RSC **200** com `NEXT_REDIRECT;replace;/login?motivo=…;307;` e nenhum conteúdo. Terceiro: só os próprios anúncios; edição do rascunho e do publicado do dono **idêntica** à de inexistente e malformado (HTML 404; RSC com o marcador de 404). Dono: 200, sem a chave do original. Em todas as respostas: sem telefone persistido, hash de senha, token de sessão, senha, e-mail ou id de outro usuário, `originals/` ou `X-Amz-Signature`; `Cache-Control` `private, no-cache, no-store` |
| `/media/{imageId}/{kind}` | `media-delivery-r2.integration.test.ts` (#47) | matriz público/dono/terceiro por estado; 404 uniforme; revogação na mesma URL |
| `/api/jobs/media-process`, `/api/jobs/media-cleanup` | `private-surface.http.integration.test.ts`; unitários `route.test.ts` | sem segredo, com segredo errado, com sufixo a mais e com esquema `Basic`: sempre `401`, corpo vazio e `no-store`; sessão de usuário não substitui o segredo; segredo certo: 200 com o resumo, sem dado |
| `/api/auth/*` | `private-surface.http.integration.test.ts` | toda escrita (`sign-in`, `sign-up`, `sign-out`, `reset-password`, JSON malformado) é 404 com corpo vazio, sem eco; `get-session` com cookie forjado, revogado ou expirado devolve `null`; a própria sessão não traz contato, hash nem dado de outro usuário; rota não permitida é 404 |

## 5. RF-014: contato fora de toda superfície

Com telefone persistido em `user_contacts` para todos os usuários sintéticos, nenhum marcador de contato apareceu em:
- HTML, RSC, metadata e respostas de erro das superfícies públicas e restritas (seção 4);
- respostas das 15 Server Actions para os 9 atores (seção 3);
- `/api/auth/get-session`;
- telemetria e logs (seção 7).

As consultas públicas são projeções explícitas por allowlist ([listing-contract.md](../architecture/listing-contract.md), seção 6). Nenhuma superfície da Fase 2 lê `user_contacts`.

## 6. Concorrência e rollback

Sem lacuna encontrada; as provas já existentes cobrem o escopo.

| Cenário | Prova |
| --- | --- |
| sexta e sétima imagens concorrentes: uma vence, nunca 7, posições únicas (D-5) | `media-pipeline.integration.test.ts` |
| reordenações concorrentes; rotação completa com a unicidade `DEFERRABLE` | `media-pipeline.integration.test.ts` |
| claim concorrente, lease e fencing do processamento | `media-pipeline.integration.test.ts` |
| dois consumidores da fila de exclusão com `SKIP LOCKED` | `media-cleanup.integration.test.ts` |
| publicação × remoção da última imagem pronta; reativação × remoção; publicações simultâneas; encerramento × pausa | `listing-lifecycle.integration.test.ts` |
| edição × transição para `closed` | `listing-drafts.integration.test.ts` |
| rollback real da auditoria (encerramento e publicação desfeitos por inteiro) | `listing-lifecycle.integration.test.ts` |
| cadastros, confirmações e reenvios concorrentes | `email-verification.integration.test.ts` |

## 7. Telemetria e logs

`telemetry-redaction.integration.test.ts` usa o SDK **real** do Sentry (`@sentry/nextjs`) com as opções de produção (`createTelemetryOptions`) e um transporte que só captura os envelopes, sem rede. Os erros são reais:
- quatro Server Actions executadas com sessão válida e a tabela `listings` indisponível;
- uma conexão recusada por senha de banco errada;
- um login recusado.

Nem os envelopes nem os logs capturados (`console.error`, `warn` e `log`, que vão para os logs da Vercel) contêm senha, hash de senha, token de sessão, cookie, `BETTER_AUTH_SECRET`, `DATABASE_URL` ou a senha dela, telefone, e-mail ou chave de original.

## 8. Achados por severidade

| # | Severidade | Achado | Evidência | Destino |
| --- | --- | --- | --- | --- |
| A-1 | média | A redação de texto livre da telemetria deixava passar o valor de cookie de sessão (`better-auth.session_token=…`) e de cabeçalhos `Cookie:`/`Set-Cookie:` ecoados numa mensagem. A regra de palavra-chave usa `\btoken\b`, e em `session_token` não há fronteira de palavra antes de `token`. Nenhum código da aplicação monta mensagem assim hoje, mas um erro de biblioteca que ecoe cabeçalhos levaria o token ao Sentry | teste de telemetria com erro real reprovou; teste unitário novo reprovava antes da correção | **corrigido nesta entrega** em `src/modules/platform/telemetry/redaction.ts` (duas regras de valor), com teste unitário e de integração |
| A-2 | baixa | `security-audit.test.ts` se apresentava como auditoria "Integrada", mas usa mocks | leitura do arquivo | **corrigido**: rótulo e comentário de camada unitária |
| A-3 | baixa | `listing-contract.md` mostrava D-5 como aberta, mas a trava e a prova de concorrência existem desde #46 | `src/modules/media/upload.ts` (`FOR UPDATE`); teste "sexta e sétima concorrentes" | **corrigido** no contrato |
| A-4 | baixa | Testes antigos sensíveis a tempo falham de forma intermitente na rodada completa e passam isolados: `media-pipeline` (`after()` real disputa a imagem), `email-verification` (compara relógio do banco com o do host, linha ~220) e `media-cleanup` (asserção de divisão entre consumidores concorrentes). Em cada rodada completa desta entrega, 1 teste desses falhou, e as suítes novas passaram em todas | logs das rodadas (seção 10) | tarefas separadas; nada foi pulado nem mascarado |
| A-5 | informativo | No Next 16.3.5, redirecionamento e 404 no canal RSC respondem HTTP 200, com o marcador no payload | seção 4; [listing-contract.md](../architecture/listing-contract.md), 16.3 | comportamento do framework, sem vazamento; registrado |
| A-6 | média (governança) | As suítes de integração não rodam na CI de PR nem no pós-merge com escrita; o G3 depende de execução local | [testing.md](../engineering/testing.md), seção 7; [database.md](../engineering/database.md), seção 11 | **resolvido por F2-013 (#51)**: job `Integração (PostgreSQL efêmero)` em `.github/workflows/ci.yml`, em toda PR e todo push em `main`, com as suítes sem R2 e as provas HTTP ([testing.md](../engineering/testing.md), seção 7). Tornar o job required check fica com o responsável pelo repositório |

Nenhum achado crítico ou alto.

## 9. Prova em Preview

Deployment `dpl_5MhUGyNvNYGsJHHHpxBVZAmmJGQa` (branch `test/f2-012-security-verification`, commit `1c7a229`), sobre o Neon de `preview`. A prova foi feita sem sessão do TROQS, com acesso temporário de compartilhamento da Vercel e somente leitura. Nada foi gravado. A matriz de atores autenticados fica na camada local (seções 3 e 4): o Preview não tem anúncio publicado nem conta sintética com sessão ativa, e criar uma exigiria a senha do responsável.

### 9.1 Resultado

| Verificação | Resultado |
| --- | --- |
| `/anuncios`, `/anuncios/novo`, `/conta` e a edição de dois anúncios `closed` reais, de um UUID inexistente e de um malformado; como anônimo e com cookie de sessão forjado | HTML 307 para `/login?motivo=…`; RSC 200 com `NEXT_REDIRECT;replace;/login?motivo=…;307;`; nenhum marcador; cache nunca público |
| `/api/jobs/media-process` e `/api/jobs/media-cleanup` sem segredo, com segredo errado e com esquema `Basic` | 401, corpo vazio, `no-store` |
| `POST /api/auth/{sign-in/email, sign-up/email, sign-out, reset-password}` | 404 sem corpo |
| `GET /api/auth/list-sessions` | 404 |
| `GET /api/auth/get-session` com cookie forjado | **500 com corpo vazio**, em vez de `null` |

Resultado: 96 verificações, 95 OK.

A diferença está explicada e não é vazamento. O Preview desta branch não tem `BETTER_AUTH_URL` (a consulta às variáveis da branch voltou vazia), e a aplicação falha fechada. O log do deployment registra só `AuthConfigurationError: … BETTER_AUTH_URL ausente…`, sem segredo. As páginas privadas, que capturam o erro, mandaram ao login. `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` são configurados por branch só nas provas com login ([environments.md](../engineering/environments.md)). Com a configuração presente, a resposta `null` para cookie forjado, revogado ou expirado está provada localmente (seção 4).

## 10. Execuções

| Comando | Resultado |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `prettier --check` (arquivos da entrega) | sem erro nem aviso |
| `pnpm test:ci` | 31 arquivos, 422 testes |
| `pnpm build` | ok |
| suítes novas isoladas | `authorization-matrix` 12/12; `private-surface` 11/11; `telemetry-redaction` 1/1 |
| integração completa, banco recriado, R2 e as duas provas HTTP (duas rodadas) | 15 arquivos, 196 testes: 195 passaram e 1 falhou em cada rodada, sempre um teste antigo de A-4 (`media-pipeline` na 1ª, `email-verification` na 2ª); nenhum pulado; banco limpo ao final |
| integração sem R2 | as suítes de R2 são puladas por construção (14 testes); é a única fonte de testes pulados |
| teste antigo com falha, isolado | `email-verification` 3/3, `media-cleanup` 3/3, `media-pipeline` 3/3 (#49) |
