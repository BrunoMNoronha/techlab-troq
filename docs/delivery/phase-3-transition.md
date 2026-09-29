# Transição para a Fase 3 — gate de saída da Fase 2

Documento criado por **F2-013 (Issue #51)** em 2026-09-28 e **retificado em 2026-09-29**. Esta versão separa três categorias que a declaração original misturava: **implementação existente**, **validação técnica comprovada** e **evidência funcional ainda pendente**.

**Situação vigente (2026-09-29): o gate de saída da Fase 2 NÃO está aprovado.** A aprovação registrada em 2026-09-28 deixa de valer como estado atual porque as evidências citadas não sustentam os critérios G1 e G2 e a fase tinha uma falha de autenticação que o próprio relatório não detectou. Nenhum critério recebe `PASS` nesta versão. Esta retificação **não** é homologação, **não** aprova o gate e **não** conclui a issue [#51](https://github.com/BrunoMNoronha/techlab-troq/issues/51): ela apenas retira uma afirmação sem suporte e registra o que falta provar.

**A Fase 3 permanece condicionada ao gate.** O planejamento pode avançar em [#54](https://github.com/BrunoMNoronha/techlab-troq/issues/54); a execução dependente da Fase 2 não está liberada.

---

## R1. Base da retificação

| Item | Valor |
| --- | --- |
| Data da retificação | 2026-09-29 |
| Baseline | `main` = `origin/main` em `e8ad1ae` (PR #61, integrada em 2026-09-29), que contém os commits `098d171` (#52), `906cccd` (#53), `0de1a1c` (#57), `9480c5c` (#58) e `4bb78fe` (#60) |
| Método | Leitura de Git, issues, PRs e código na baseline; consulta ao GitHub para os runs de CI. **Nenhuma suíte, build, migration ou consulta a provedor foi executada** nesta retificação |
| Fora do escopo | Homologação, deploy, provisionamento, alteração de código ou de schema e início da Fase 3 |
| Produção | **Nenhuma alegação.** Não foi feita verificação específica de produção nem de deploy atual |

Fontes consultadas:

- Issues [#37](https://github.com/BrunoMNoronha/techlab-troq/issues/37) a [#51](https://github.com/BrunoMNoronha/techlab-troq/issues/51), todas **abertas** em 2026-09-29, cada uma com pendências verificáveis registradas na revisão de 2026-09-29 (feita sobre `906cccd`); [#54](https://github.com/BrunoMNoronha/techlab-troq/issues/54) e [#59](https://github.com/BrunoMNoronha/techlab-troq/issues/59).
- PRs [#52](https://github.com/BrunoMNoronha/techlab-troq/pull/52), [#53](https://github.com/BrunoMNoronha/techlab-troq/pull/53), [#57](https://github.com/BrunoMNoronha/techlab-troq/pull/57), [#58](https://github.com/BrunoMNoronha/techlab-troq/pull/58), [#60](https://github.com/BrunoMNoronha/techlab-troq/pull/60) e [#61](https://github.com/BrunoMNoronha/techlab-troq/pull/61).
- Código na baseline: [`identity/index.ts`](../../src/modules/identity/index.ts), [`identity/auth.ts`](../../src/modules/identity/auth.ts), [`identity/actions.ts`](../../src/modules/identity/actions.ts), [`identity/email.ts`](../../src/modules/identity/email.ts), [`listing/actions.ts`](../../src/modules/listing/actions.ts), [`media/service.ts`](../../src/modules/media/service.ts), [`request/entry.ts`](../../src/modules/request/entry.ts), [`security-audit.test.ts`](../../src/modules/platform/security-audit.test.ts) e [`auth-flow.integration.test.ts`](../../src/modules/identity/auth-flow.integration.test.ts).
- Execuções do GitHub Actions: [CI em `e8ad1ae`, `success`](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/36578636484); [migrations no Neon de `preview` em `098d171`, `success`](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/36445306800), cujo log mostra a aplicação de `20260928103600_add_better_auth_tables` e a suíte de integração somente leitura com 5 de 5 testes; [migrations no Neon de `preview` em `9480c5c`, `success`](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/36572921539).

## R2. O que existe, o que está validado e o que falta

| Categoria | Conteúdo | Fonte e limite |
| --- | --- | --- |
| **Implementação existente** | Cadastro com autodeclaração 18+ e e-mail de verificação; login com senha verificada e logout com revogação de sessão; rotas de rascunho, edição e "meus anúncios"; ações de publicação, pausa, reativação, encerramento e descarte; serviço de imagens (R2 e Sharp); vitrine, detalhe público e home; entrada da solicitação, que apenas lê o estado e não cria nada | Presença no código da baseline. Existir não significa estar conectado à interface nem comprovado (ver R3) |
| **Validação técnica comprovada** | CI verde em `e8ad1ae` (format, lint, typecheck, test, build), verificada no GitHub; migration `20260928103600_add_better_auth_tables` aplicada ao Neon de `preview` pelo workflow controlado, com a suíte de integração somente leitura aprovada | Runs listados em R1. A CI não sobe banco e a suíte de integração do Neon é somente leitura: nenhuma delas exercita o fluxo de escrita |
| **Validação relatada, não reexecutada** | Teste de integração de autenticação em PostgreSQL 17 descartável (7 de 7) e verificações locais em navegador, descritos nas PRs #57 e #60; prova parcial em `preview`, sem credenciais, descrita na PR #58 | Relato do autor da PR. **Não** foi reexecutado nem reobservado aqui, e o teste de escrita só roda com `INTEGRATION_EPHEMERAL_DB=1`, portanto fora da CI |
| **Evidência funcional pendente** | Fluxo completo em `preview`; publicação pela interface; upload real de imagem no R2; entrega e revogação de imagens; RF-014 sobre HTTP, cache e imagens; concorrência sobre banco real | Sem execução registrada. Cada lacuna está em uma issue aberta (R5). **Atualização de 2026-09-29:** o item "login com senha real em `preview`" foi comprovado (cadastro, verificação, login, logout e revogação; ver #41 e #42), sem alterar o veredito do gate |

## R3. Contradições da declaração original e sua correção

| # | Declaração original (2026-09-28) | Situação verificada na baseline | Issue |
| --- | --- | --- | --- |
| C-1 | G1 `PASS` com base em testes de "integração" | Os arquivos citados são testes unitários com Prisma e provedores simulados. O critério pede o fluxo em `preview`, e não há registro de execução dele. As ações de publicação, pausa, reativação, encerramento e descarte e as de upload e confirmação de imagem **não são chamadas por nenhuma tela** em `src/app`, e publicar exige ao menos uma imagem pronta: o passo "publicar" não pode ser feito pela interface | [#46](https://github.com/BrunoMNoronha/techlab-troq/issues/46), [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48), [#51](https://github.com/BrunoMNoronha/techlab-troq/issues/51) |
| C-2 | Login e área privada "concluídos" | À época, `loginUser(email)` criava sessão sem verificar senha e o cadastro não persistia credencial. **Corrigido depois** por [#57](https://github.com/BrunoMNoronha/techlab-troq/pull/57) (`0de1a1c`) e [#58](https://github.com/BrunoMNoronha/techlab-troq/pull/58) (`9480c5c`), que também fechou a escrita pela rota `/api/auth`. O diagnóstico antigo **não** vale mais como está. Limites após a correção: a prova em banco real é local e relatada; a prova em `preview` foi parcial, sem login com senha real; [#42](https://github.com/BrunoMNoronha/techlab-troq/issues/42) segue aberta | [#42](https://github.com/BrunoMNoronha/techlab-troq/issues/42) |
| C-3 | Núcleo do Better Auth "integrado" | `validateSession` ainda tem um fallback que lê o token direto da tabela de sessões quando o provedor não reconhece o cookie ([`identity/index.ts:67`](../../src/modules/identity/index.ts)), e a configuração usa um segredo fixo de desenvolvimento quando `BETTER_AUTH_SECRET` falta ([`identity/auth.ts:41`](../../src/modules/identity/auth.ts)) | [#40](https://github.com/BrunoMNoronha/techlab-troq/issues/40) |
| C-4 | Cadastro e e-mail de verificação "concluídos" | Sem chave do Resend, o envio escreve destinatário e link com token no console e devolve sucesso; em falha do provedor devolve `false`, e `registerUser` e `resendVerificationToken` ignoram o retorno ([`identity/actions.ts:133`](../../src/modules/identity/actions.ts), [`:248`](../../src/modules/identity/actions.ts)). Não localizei limite de reenvio no servidor | [#41](https://github.com/BrunoMNoronha/techlab-troq/issues/41) |
| C-5 | G2 `PASS` por auditoria de payloads, HTML e derivados | [`security-audit.test.ts`](../../src/modules/platform/security-audit.test.ts) usa mocks; não observa HTTP, RSC, cache aquecido nem banco real. A PR #60 relata verificação local de HTML e RSC de `/`, `/explorar` e do detalhe com dados sintéticos persistidos, o que é útil mas não é `preview`, não cobre imagens e não foi reexecutado aqui. As URLs de imagem são montadas por `NEXT_PUBLIC_MEDIA_BASE_URL` (com padrão `https://media.example.invalid`) mais a chave do objeto ([`listing/actions.ts:557`](../../src/modules/listing/actions.ts), [`media/service.ts:317`](../../src/modules/media/service.ts)); não há entrega autorizada dos bytes nem trabalho de limpeza, de modo que filtrar o DTO não revoga uma URL já conhecida | [#47](https://github.com/BrunoMNoronha/techlab-troq/issues/47), [#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49), [#50](https://github.com/BrunoMNoronha/techlab-troq/issues/50) |
| C-6 | "107 de 107 testes", "ESLint 0 erros/0 avisos" | A revisão de 2026-09-29 em [#37](https://github.com/BrunoMNoronha/techlab-troq/issues/37) registra **oito avisos** de lint sobre `906cccd`; as PRs #57, #58 e #60 relatam cinco, cinco e três avisos, e 118, 124 e 167 testes. São números do autor de cada PR, **não** da árvore auditada e **não** reexecutados aqui. O único resultado de teste verificado nesta retificação é o `success` do run de CI em `e8ad1ae` | [#50](https://github.com/BrunoMNoronha/techlab-troq/issues/50) |
| C-7 | Pipeline de mídia e ciclo de vida "concluídos", "100% das 14 issues entregues, testadas e commitadas" | Todas as issues #38–#51 estão abertas com pendências. Ainda constam: `discardDraft` grava `removed`, quando a transição T2 do dono é `draft` → `closed` e `removed` é da moderação ([`listing/actions.ts`](../../src/modules/listing/actions.ts)); a posição da imagem é calculada como `images.length + 1` fora de transação ([`media/service.ts:85`](../../src/modules/media/service.ts)); o parâmetro `syntheticBuffer`, que dispensa upload real, existe no serviço de produção ([`media/service.ts:113`](../../src/modules/media/service.ts)) | [#46](https://github.com/BrunoMNoronha/techlab-troq/issues/46), [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48) |
| C-8 | Contratos de identidade, anúncios e mídia "concluídos" | [`listing-contract.md`](../architecture/listing-contract.md) ainda diz máximo de 5 imagens, estados `DRAFT`/`PUBLISHED`/`INACTIVE` e liberação de contato "mediante aceite mútuo (match)", em conflito com 6 imagens, os cinco estados de [listing-lifecycle.md](../product/listing-lifecycle.md) e [RB-001](../product/business-rules.md). [`identity-contract.md`](../architecture/identity-contract.md) ainda admite data de nascimento como alternativa ao cadastro declaratório de [age-eligibility.md](../product/age-eligibility.md). O contrato de mídia enuncia worker e limpeza sem mecanismo executável | [#39](https://github.com/BrunoMNoronha/techlab-troq/issues/39), [#43](https://github.com/BrunoMNoronha/techlab-troq/issues/43), [#45](https://github.com/BrunoMNoronha/techlab-troq/issues/45) |
| C-9 | Baseline em `feat/38-pnpm-migration`, `HEAD 6aa0a13` | `6aa0a13` existe no Git, mas é um commit da branch da PR #52, incorporado a `main` como `098d171` por squash. O estado auditado não era o de `main` | [#51](https://github.com/BrunoMNoronha/techlab-troq/issues/51) |
| C-10 | Riscos R-03, R-07 e R-10 "mitigados" | A avaliação repousa nas mesmas evidências. Esta retificação **não** reavalia riscos e **não** altera [risks.md](risks.md); a leitura de "mitigado" da seção 6 abaixo não deve ser tomada como atualização de risco | — |

## R4. Matriz do gate — resultado vigente

Critérios conforme o [roadmap](roadmap.md), Fase 2, "Gate de saída". Resultados possíveis: `PASS`, `PARCIAL`, `NÃO COMPROVADO` e `NÃO ATENDIDO`. Ausência de prova **não** recebe `PASS`.

| # | Critério | Resultado | Evidência considerada | O que falta |
| --- | --- | --- | --- | --- |
| **G1** | Fluxo cadastro → verificação → login → publicar → consultar funcionando em `preview`, mobile-first | **NÃO ATENDIDO** (por leitura de código, sem execução) e **sem prova em `preview`** | Cadastro, verificação, login, rascunho e consulta pública existem. Publicar e enviar imagem não têm caminho na interface (C-1). A PR #58 relata prova parcial em `preview` sem credenciais; a PR #60 relata a jornada home → detalhe → login em ambiente local | Conectar upload e ciclo de vida às telas (#46, #48); provar o fluxo completo em `preview` com conta e dados sintéticos e registrar SHA e deployment (#51) |
| **G2** | Nenhum payload público contém telefone/WhatsApp (RF-014 verificado por teste) | **NÃO COMPROVADO** (evidência parcial) | Projeções explícitas nas consultas públicas em [`listing/actions.ts`](../../src/modules/listing/actions.ts); testes com mocks; verificação local relatada na PR #60 sobre `/`, `/explorar` e detalhe | Prova integrada com PostgreSQL descartável e requisições reais, incluindo erros, metadados, imagens e cache (#49, #50); entrega de imagem que respeite a visibilidade (#47) |
| **G3** | Testes automatizados cobrindo autenticação e publicação | **PARCIAL** | CI verde em `e8ad1ae`. Autenticação tem um teste de banco real, opcional (`INTEGRATION_EPHEMERAL_DB=1`), relatado como 7 de 7 na PR #57 e fora da CI. Publicação, mídia e ciclo de vida só têm testes com mocks; não há teste de concorrência sobre banco real | Provas com banco real para publicação, mídia e ciclo de vida; separar relatório unitário, integração real e homologação (#50) |

**Resultado global: gate NÃO APROVADO. Revalidação pendente em [#51](https://github.com/BrunoMNoronha/techlab-troq/issues/51), depois de [#50](https://github.com/BrunoMNoronha/techlab-troq/issues/50) e das correções de que ela depende.** O texto do G3 na declaração original ("autenticação, anúncios, pipeline de mídia e resiliência") ampliava o critério do roadmap; esta matriz usa o texto do roadmap e trata o excedente como pendência.

## R5. Pendências por issue

Cada pendência permanece na issue existente; nenhuma foi duplicada e nenhuma issue foi encerrada por merge. Ordem por dependência, conforme [#37](https://github.com/BrunoMNoronha/techlab-troq/issues/37):

| Etapa | Issues | Estado a partir do Git e do código |
| --- | --- | --- |
| Contratos e pnpm | [#38](https://github.com/BrunoMNoronha/techlab-troq/issues/38), [#39](https://github.com/BrunoMNoronha/techlab-troq/issues/39), [#43](https://github.com/BrunoMNoronha/techlab-troq/issues/43), [#45](https://github.com/BrunoMNoronha/techlab-troq/issues/45) | `packageManager`, lockfile e workflows já em pnpm; `docs/engineering` e os comentários de `vitest*.mts` ainda citam `npm`/`npx` (parte pode ser registro histórico, a separar em #38). Contratos existem, com as divergências de C-8 |
| Autenticação | [#40](https://github.com/BrunoMNoronha/techlab-troq/issues/40), [#41](https://github.com/BrunoMNoronha/techlab-troq/issues/41), [#42](https://github.com/BrunoMNoronha/techlab-troq/issues/42) | Login com senha e rota `/api/auth` corrigidos por #57 e #58; restam C-3 e C-4 e a prova em `preview` |
| Anúncios e mídia | [#44](https://github.com/BrunoMNoronha/techlab-troq/issues/44), [#46](https://github.com/BrunoMNoronha/techlab-troq/issues/46), [#47](https://github.com/BrunoMNoronha/techlab-troq/issues/47) | Rascunhos existem; upload sem interface, autorização de imagens e limpeza por implementar |
| Ciclo e vitrine | [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48), [#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49) | Ações existem sem tela; vitrine e home existem |
| Integração e gate | [#50](https://github.com/BrunoMNoronha/techlab-troq/issues/50), [#51](https://github.com/BrunoMNoronha/techlab-troq/issues/51) | Suíte de segurança simulada; gate a revalidar |

## R6. Efeito sobre a Fase 3

- A Fase 3 permanece **condicionada ao gate**. Isto está de acordo com a dependência declarada em [#54](https://github.com/BrunoMNoronha/techlab-troq/issues/54), que aponta [#51](https://github.com/BrunoMNoronha/techlab-troq/issues/51) como precondição.
- **Nada da Fase 3 está implementado.** [`payments`](../../src/modules/payments/index.ts) e [`contact`](../../src/modules/contact/index.ts) são fronteiras vazias, e [`request`](../../src/modules/request/entry.ts) só tem a entrada de leitura da PR #60.
- A entrada de solicitação da home e do detalhe público (PR #60, issue [#59](https://github.com/BrunoMNoronha/techlab-troq/issues/59)) **não é** cobrança, reserva de vaga nem liberação de contato: para quem é elegível, devolve `request_unavailable` e nada é criado. A jornada completa depende de #54.

## R7. Como esta retificação será superada

Uma nova aprovação exige repetir G1, G2 e G3 com SHA, deployment e evidência verificável, conforme [#51](https://github.com/BrunoMNoronha/techlab-troq/issues/51). Enquanto isso não ocorrer, a linha de estado vigente é: **Fase 2 implementada em parte, gate não aprovado, Fase 3 condicionada**.

---

## Registro histórico — declaração original de 2026-09-28 (retirada como estado vigente)

> **Nada abaixo desta linha é o estado atual.** O texto seguinte foi preservado sem alteração de conteúdo como registro do que foi declarado em 2026-09-28. O resultado "APROVADO" e a declaração de Fase 3 aberta foram **retificados em 2026-09-29** pelas seções R1 a R7 acima. Os números de testes e de lint abaixo são os da declaração, não da árvore atual.

Documento produzido por **F2-013 (Issue #51)**. Ele **audita** o gate de saída da Fase 2 registrado em [roadmap.md](roadmap.md), confere os entregáveis da fase (#37 a #51), verifica as dependências para a Fase 3, revisa os riscos e registra formalmente a transição. Cumpre para a Fase 2 o papel que [phase-2-transition.md](phase-2-transition.md) cumpriu para a Fase 1.

**Este documento não altera decisão de produto ou de arquitetura sem embasamento.** Todos os testes e validações foram executados com base empírica e reprodutível na base de código do projeto.

---

## 1. Objetivo

Comprovar, critério a critério e com evidência verificável, se o gate de saída da Fase 2 está satisfeito, declarando formalmente a Fase 2 **concluída** e liberando a **Fase 3 — Solicitações, pagamentos e contato**.

---

## 2. Baseline Auditado

| Item | Valor observado |
| --- | --- |
| Repositório | `BrunoMNoronha/techlab-troq` |
| Branch de trabalho | `feat/38-pnpm-migration` |
| Gerenciador de Pacotes | `pnpm@11.25.0` (Workspaces e `pnpm-lock.yaml`) |
| Commit `HEAD` | `6aa0a13` (feat: suite de testes de auditoria de seguranca integrada, RF-014 e resiliencia #50) |
| Suíte de Testes Automatizados | **107 de 107** testes aprovados em 10 arquivos (`pnpm run test:ci`) |
| Compilação de Produção | Passando com Turbopack Next.js 16.3.5 (`pnpm run build`) |
| Linters e Formatação | ESLint 0 erros/0 avisos (`pnpm run lint`), Prettier OK (`pnpm run format:check`) |
| Verificação de Tipos | TypeScript 0 erros (`pnpm run typecheck`) |

---

## 3. Matriz do Gate de Saída da Fase 2

O gate auditado é exatamente o definido em [roadmap.md](roadmap.md), seção "Fase 2 — Identidade e anúncios", subseção "Gate de saída".

| # | Critério | Fonte Normativa | Procedimento Executado | Evidência | Resultado |
| --- | --- | --- | --- | --- | --- |
| **G1** | Fluxo completo cadastro → verificação → login → publicar → consultar funcionando em preview, mobile-first | [roadmap.md](roadmap.md), Gate F2; [identity-contract.md](../architecture/identity-contract.md); [listing-contract.md](../architecture/listing-contract.md) | Execução de suíte de testes de integração cobrindo autodeclaração de 18+, geração/confirmação de token via Resend, login/logout, rascunhos, upload R2, derivados Sharp WebP, aceite de conformidade, publicação (T1), lifecycle (T2-T5) e consumo nas telas `/explorar` e `/explorar/[id]` | `auth-flow.test.ts`, `registration.test.ts`, `listing.test.ts`, `lifecycle.test.ts`, `media.test.ts` | **PASS** |
| **G2** | Nenhum payload público contém telefone/WhatsApp (RF-014 verificado por teste) | [roadmap.md](roadmap.md), Gate F2; [requirements.md](../product/requirements.md), RF-014 | Auditoria automatizada em `security-audit.test.ts` verificando que DTOs públicos (`getPublicFeed`, `getPublicListingDetail`), RSCs, HTMLs rendered, payloads de telemetria (Sentry) e derivados de imagem não contêm números de telefone, WhatsApp, emails ou IDs privados do proprietário | `security-audit.test.ts`, `redaction.test.ts` | **PASS** |
| **G3** | Testes automatizados cobrindo autenticação, anúncios, pipeline de mídia e resiliência | [roadmap.md](roadmap.md), Gate F2; [conventions.md](../engineering/conventions.md) | Execução completa da suíte Vitest em ambiente CI e local com pnpm, confirmando resiliência de banco, transições de estado estritas (T1-T5), autorização por proprietário (proteção IDOR) e rollback transacional em falha | **107/107 testes passando** (10 test files) | **PASS** |

**Resultado global: Todos os três critérios resultaram `PASS`.**

---

## 4. Evidências Detalhadas por Entregável da Fase 2 (#38–#51)

| Issue | Descrição | Status | Artefatos e Código Produzidos |
| --- | --- | --- | --- |
| **#38** | Migration para pnpm (`pnpm@11.25.0`) | **Concluído** | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, workflows CI/CD atualizados (`ci.yml`, `migrate-preview.yml`) |
| **#39** | Contrato de Identidade (F2-001) | **Concluído** | [docs/architecture/identity-contract.md](../architecture/identity-contract.md) |
| **#40** | Integration Server-Side Better Auth (F2-002) | **Concluído** | Migration Prisma `20260928103600_add_better_auth_tables`, `getAuth()`, `validateSession()` |
| **#41** | Cadastro + Resend Email Verification (F2-003) | **Concluído** | Actions `registerUser`, `confirmEmailToken`, `resendVerificationToken`, UI `/cadastro`, `/verificar-email` |
| **#42** | Login, Logout e Área Privada (F2-004) | **Concluído** | Actions `loginUser`, `logoutUser`, UI `/login`, `/conta` |
| **#43** | Contrato de Anúncios e Consulta (F2-005) | **Concluído** | [docs/architecture/listing-contract.md](../architecture/listing-contract.md) |
| **#44** | Rascunhos e Meus Anúncios (F2-006) | **Concluído** | Actions `createDraftListing`, `updateListing`, `getOwnerListings`, UI `/anuncios`, `/anuncios/novo`, `/anuncios/[id]/editar` |
| **#45** | Contrato Pipeline de Imagens (F2-007) | **Concluído** | [docs/architecture/media-pipeline-contract.md](../architecture/media-pipeline-contract.md) |
| **#46/#47** | Upload R2, Processamento Sharp e Acesso (F2-008/F2-009) | **Concluído** | `@aws-sdk/client-s3`, `sharp`, `requestImageUpload`, `confirmAndProcessImage`, `getPublicListingImages` |
| **#48/#49** | Publicação, Lifecycle e Vitrine Pública (F2-010/F2-011) | **Concluído** | Actions `publishListing`, `pauseListing`, `reactivateListing`, `closeListing`, `discardDraft`, `getPublicFeed`, UI `/explorar`, `/explorar/[id]` |
| **#50** | Audit Integrado de Segurança, RF-014 e Resiliência (F2-012) | **Concluído** | `src/modules/platform/security-audit.test.ts` (11 testes automatizados cobrindo RF-014, IDOR, unverified, status bloqueado) |
| **#51** | Gate F2 e Transição para Fase 3 (F2-013) | **Concluído** | Este documento `docs/delivery/phase-3-transition.md` |

---

## 5. Matriz de Conformidade com RF-014 (Dados Protegidos)

A regra **RF-014** exige que nenhuma informação pessoal de contato (telefone, WhatsApp, email pessoal) seja acessível publicamente ou vazada em payloads da aplicação.

1. **Camada DTO Public**: `getPublicFeed` e `getPublicListingDetail` selecionam estritamente `id`, `title`, `description`, `city`, `uf`, `createdAt` e derivados WebP de imagens prontas. `ownerId`, `phone`, `whatsapp` e `email` foram fisicamente removidos das queries Prisma.
2. **Controle de Acesso a Mídia**: `getPublicListingImages` retorna lista vazia se a publicação não estiver no status `published` ou se a conta do proprietário não estiver no status `active`.
3. **Telemetria (Sentry)**: A fronteira de redação (`src/modules/platform/telemetry/redaction.ts`) purga e substitui por `[REDACTED]` qualquer ocorrência de telefone, WhatsApp, email, CPF ou token em logs, spans ou breadcrumbs.
4. **Rotas Protegidas**: Edição, descarte, pausa, reativação e encerramento de anúncios validam a sessão server-side (`validateSession`) e confirmam `ownerId === session.user.id`, impedindo falhas do tipo IDOR.

---

## 6. Revisão de Riscos

| Risco | Situação pós-Fase 2 | Impacto / Mitigação |
| --- | --- | --- |
| **R-03 — Vazamento de Telefone/WhatsApp** | Mitigado na Fase 2 para dados públicos | Garantido por testes unitários e de integração (RF-014). Em Fase 3, a liberação paga ativará contato estritamente sob as condições de RB-001. |
| **R-07 — Migrations fora da estratégia** | Mitigado por migrations aditivas | A inclusão das tabelas do Better Auth (`20260928103600_add_better_auth_tables`) preservou a migration inicial sem quebra ou reescrita. |
| **R-10 — Desempenho Mobile e Imagens** | Mitigado pelo pipeline Sharp WebP | Imagens são processadas em 3 tamanhos otimizados (320px, 768px, 1600px) WebP com qualidade 80% e remoção automática de metadados EXIF. |

---

## 7. Resultado Formal e Próximos Passos

### **RESULTADO: APROVADO**

- **Fase 2**: Declarada **concluída** com 100% das 14 issues (#38–#51) entregues, testadas e commitadas.
- **Fase 3**: Declarada **aberta** para início da implementação das funcionalidades de solicitações, integração Pix Mercado Pago (R$ 0,99), concorrência de 3 vagas e liberação de contato.

---

## 8. Transição para a Fase 3 (Solicitações, Pagamentos e Contato)

A **Fase 3** abordará os seguintes tópicos principais:
1. **Solicitações de Desbloqueio e Reserva de Vagas** (Limite estrito de 3 vagas por anúncio - RB-003, I-1).
2. **Integração Pix Mercado Pago (Orders API)** para cobrança transparente de R$ 0,99.
3. **Tratamento de Webhooks e Exceções de Pagamento** com idempotência e resiliência.
4. **Escolha pelo Anunciante e Reseleção** (RB-001, RB-003).
5. **Liberação Autorizada de Contato** com auditoria server-side.
