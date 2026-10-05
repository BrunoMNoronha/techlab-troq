# Transição para a Fase 2 — verificação do gate de saída da Fase 1

Documento produzido por **F1-011**. Ele **audita** o gate de saída da Fase 1 registrado em [roadmap.md](roadmap.md), confere os sete entregáveis da fase, verifica as dependências da Fase 2, revisa os riscos e registra formalmente a transição. Cumpre para a Fase 1 o papel que [phase-1-transition.md](phase-1-transition.md) cumpre para a Fase 0.

**Este documento não decide nada de produto nem de arquitetura.** Ele não altera regra de negócio, requisito, ADR, schema, migration, CI ou decisão vigente; não implementa funcionalidade da Fase 2; e não provisiona recurso de `production`. Onde uma fonte normativa já decide, ela é citada e obedecida. Resultados possíveis por critério: `PASS`, `FAIL` ou `BLOCKED`; ausência de evidência nunca é aprovação.

## 1. Objetivo

Comprovar, critério a critério e com evidência verificável, se o gate de saída da Fase 1 está satisfeito, e só então declarar a Fase 1 concluída e abrir a Fase 2.

## 2. Baseline auditado

| Item | Valor observado |
| --- | --- |
| Repositório | `BrunoMNoronha/techlab-troq` |
| Remote `origin` | `https://github.com/BrunoMNoronha/techlab-troq.git` |
| Branch inicial | `main` |
| `HEAD` local no início | `51e280af8dc7e90db58b502803004c344e24f0fc` |
| `origin/main` no início (após `git fetch`) | `51e280af8dc7e90db58b502803004c344e24f0fc` |
| SHA de referência informado para a tarefa | `51e280af8dc7e90db58b502803004c344e24f0fc` — **sem divergência** |
| Árvore de trabalho | limpa |
| Stashes | nenhum |
| PRs abertas | nenhuma |
| Branch de trabalho | `agent/f1-011-phase-1-gate` |

`51e280a` é o squash merge da PR #35, que concluiu F1-010. Nenhuma alteração local preexistente foi encontrada e, portanto, nenhuma foi descartada.

**Governança de `main`.** A API de *branch protection* clássica responde `Branch not protected` (HTTP 404) porque a proteção é feita por **ruleset**: `Protect main` (id `23314025`), `enforcement: active`, como registrado em [phase-1-transition.md](phase-1-transition.md), seção 2.1, com o required status check `Validação (format, lint, typecheck, test, build)`.

## 3. Data da verificação

**2026-09-16.**

## 4. Matriz do gate de saída da Fase 1

O gate auditado é exatamente o de [roadmap.md](roadmap.md), seção "Fase 1 — Fundação técnica", subseção "Gate de saída". Nenhum item foi aprovado por inferência global.

| # | Critério | Fonte normativa | Procedimento executado | Evidência | Resultado |
| --- | --- | --- | --- | --- | --- |
| G1 | CI verde em `main` com lint, typecheck, testes e build | [roadmap.md](roadmap.md), gate da Fase 1; [../engineering/conventions.md](../engineering/conventions.md), seção 5.1 | Leitura de `.github/workflows/ci.yml`; consulta às execuções do workflow `CI` em `main` e aos check runs do commit `51e280a`; leitura do estado de cada passo; execução local, em Node `24.19.0` / npm `11.17.0`, dos mesmos seis comandos que o workflow executa, na mesma ordem | Seção 5.1 | **PASS** |
| G2 | Deploy de preview funcionando na Vercel a partir de PR | [roadmap.md](roadmap.md), gate da Fase 1 | Abertura da PR #36 desta tarefa; observação do check da Vercel e do deployment GitHub de ambiente `Preview` gerado para o commit da PR; requisição HTTP real, autenticada, à aplicação implantada | Seção 5.2 | **PASS** |
| G3 | Migrations executáveis e reversíveis em ambiente de desenvolvimento | [roadmap.md](roadmap.md), gate da Fase 1; [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md), decisões 5, 6, 9 e 11; [../engineering/database.md](../engineering/database.md), seções 10 e 12 | PostgreSQL 17.11 em contêiner Docker descartável, porta local isolada; banco vazio → `migrate deploy` → catálogo e `_prisma_migrations` → `test:integration` → recriação do banco e reaplicação por `migrate dev` → reversão de mudança por **nova** migration numa cópia descartável do histórico → comparação estrutural com banco de referência → reset ao estado conhecido → reexecução das provas → destruição do contêiner e do volume | Seção 5.3 | **PASS** |
| G4 | Nenhum segredo versionado (RNF-015) | [roadmap.md](roadmap.md), gate da Fase 1; [../product/requirements.md](../product/requirements.md), RNF-015; [../engineering/environments.md](../engineering/environments.md) | Varredura defensiva, sem imprimir valores, dos 85 arquivos rastreados em `HEAD` e dos 380 blobs de todo o histórico (43 commits, todas as refs), por 14 categorias de credencial; classificação dos achados por forma, sem exibição; conferência de `.gitignore`, de `.env*` rastreados e de caminhos sensíveis jamais adicionados | Seção 5.4 | **PASS** |
| G5 | As invariantes que [../architecture/data-model.md](../architecture/data-model.md) atribui a **restrição de banco** (quadro da seção 12) estão materializadas no schema inicial | [roadmap.md](roadmap.md), gate da Fase 1; [../architecture/data-model.md](../architecture/data-model.md), seção 12 e DM-1.6 | Para cada invariante: localização do artefato no `schema.prisma`, no SQL da migration e no catálogo do PostgreSQL efetivamente migrado; prova por caso negativo em banco descartável, com o nome da restrição que recusou; complemento de concorrência real sobre I-1 | Seção 6 | **PASS** |

**Resultado global: os cinco critérios resultaram `PASS`.** Ver seção 11.

## 5. Evidências por critério

### 5.1 G1 — CI verde em `main`

**Workflow oficial.** `.github/workflows/ci.yml` (`CI`) dispara em `pull_request` e em `push` para `main`; o job `validate`, de nome `Validação (format, lint, typecheck, test, build)`, roda em `ubuntu-latest` com Node 24: `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build`. O gate pede lint, typecheck, testes e build; o workflow cobre os quatro e ainda a formatação.

**Execução no `HEAD` de `main`.** Run `35079832778`, evento `push`, `headSha` `51e280af8dc7e90db58b502803004c344e24f0fc`, conclusão `success`. Estado individual dos passos: `Checkout`, `Setup Node.js 24`, `Instalar dependências`, `Verificar formatação`, `Lint`, `Typecheck`, `Testes` e `Build`, todos `success`. Os check runs do commit são apenas dois, ambos `completed/success`: o job acima e `Aplicar migrations no Neon de preview` (run `35079832771`). As dez execuções anteriores de `CI` em `main` também estão `success`.

**Equivalência local**, no commit `51e280a`, sem alteração de código:

| Comando | Resultado |
| --- | --- |
| `npm ci` | exit 0 |
| `npm run format:check` | exit 0 — "All matched files use Prettier code style!" |
| `npm run lint` | exit 0, sem achados |
| `npm run typecheck` | exit 0 |
| `npm run test:ci` | exit 0 — 3 arquivos, **51 de 51** testes |
| `npm run build` | exit 0 — rotas `/` e `/_not-found` estáticas |

**Diferenças entre local e workflow:** nenhuma de comando ou de ordem. Diferenças apenas de plataforma (Windows local × Ubuntu no CI) e de versão de patch do Node (local `24.19.0`; o CI resolve a última 24.x). `npm ci` emitiu avisos de `allow-scripts` para scripts de instalação de `@prisma/engines`, `@sentry/cli`, `prisma` e `unrs-resolver`, sem falha — observação de ferramenta, não de gate.

### 5.2 G2 — Preview da Vercel a partir de PR

Prova **atual**, gerada pela própria PR desta tarefa, e não evidência histórica.

| Passo | Evidência |
| --- | --- |
| PR | [#36](https://github.com/BrunoMNoronha/techlab-troq/pull/36), branch `agent/f1-011-phase-1-gate`, commit `8b22ce6aeae93afd605686a61625d95e1e10efd3` (primeiro commit desta tarefa, somente documentação) |
| Deployment criado a partir da PR | GitHub deployment `6479104048`, criado por `vercel[bot]` em 2026-09-16T10:45:20Z, `environment: Preview`, `ref` e `sha` iguais ao commit da PR, `production_environment: false` |
| Estado | status do deployment `success`; check `Vercel` da PR `pass` — "Deployment has completed" —, equivalente a `READY`; check `Vercel Preview Comments` `pass` |
| Host | deployment de preview do projeto `bruno-m-noronha/techlab-troq`, servido pela região `gru1` |
| Proteção | requisição sem sessão → `HTTP 302` para o SSO da Vercel, comportamento esperado da proteção por autenticação Vercel dos previews, que **não** foi alterada nem contornada |
| Requisição real | pela sessão autenticada do titular no navegador: `GET /` → **`HTTP 200`**, sem redirecionamento, HTML com assets `/_next/static/`, título `TechLab+ TROQS` e corpo "Fundação técnica operacional. Nenhuma funcionalidade de produto foi implementada." — idêntico a `src/app/page.tsx` e `src/app/layout.tsx`; `GET /rota-inexistente-f1011` → `HTTP 404` da própria aplicação |
| CI da mesma PR | run `35086651948`, job `Validação (format, lint, typecheck, test, build)`, todos os passos `success` |

A consulta ao deployment pelo conector da Vercel respondeu `403` para o escopo `bruno-m-noronha`, fato já conhecido; a observação foi feita pela API do GitHub, pelos checks da PR e pela requisição HTTP, sem nenhum token ou URL com parâmetro sensível registrado aqui. Nenhum *protection bypass* foi criado.

### 5.3 G3 — Migrations executáveis e reversíveis em desenvolvimento

**O que "reversível" significa neste projeto — lido antes de testar, não ajustado depois.** A arquitetura vigente **não** prevê migration `down`, e o critério foi auditado contra os mecanismos que ela efetivamente define:

1. **Em `development`, o banco é local ou descartável** e pode ser recriado do zero e reconstruído a partir do histórico versionado: `prisma migrate reset --force`, ou o equivalente documentado de recriar o banco e rodar `migrate dev` ([../engineering/database.md](../engineering/database.md), seção 10 e seção 12, item 5; ADR-0005, decisão 6).
2. **Reverter uma mudança de schema é uma nova migration**, nunca a edição de migration já aplicada: "Prisma Migrate não possui migration `down` como fluxo oficial do projeto [...] Reverter uma mudança em ambiente compartilhado é uma **nova** migration, por expand/contract" ([../engineering/database.md](../engineering/database.md), fim da seção 12; ADR-0005, decisões 5 e 9).
3. Migration aplicada em ambiente compartilhado é **imutável** (ADR-0005, decisão 5).

Nenhum mecanismo de rollback foi inventado. Os dois mecanismos acima foram exercitados literalmente.

**Procedimento e evidência** — PostgreSQL `17.11` (`postgres:17-alpine`) em contêiner descartável `troq-f1011-gate`, publicado apenas em `127.0.0.1:55433`, credencial criada só para a validação; `DIRECT_URL` e `DATABASE_URL` passadas inline no shell, sem `.env.local` novo. O Prisma confirmou o datasource `127.0.0.1:55433` em todas as chamadas. Nenhum Neon foi tocado.

| Passo | Comando / verificação | Resultado observado |
| --- | --- | --- |
| 1. Banco vazio | `information_schema.tables` em `public` | 0 tabelas |
| 2. Estado antes | `npx prisma migrate status` | `20260914210926_initial_schema` não aplicada |
| 3. Procedimento oficial | `npx prisma migrate deploy` | aplicada; "All migrations have been successfully applied"; exit 0 |
| 4. Estado depois | `npx prisma migrate status` | "Database schema is up to date!" |
| 5. Schema esperado | catálogo `pg_*` | 24 tabelas, 18 enums, 46 FKs, 4 índices únicos parciais, 10 `CHECK`s, 4 funções, 3 triggers — exatamente o que [../engineering/database.md](../engineering/database.md), seção 7, declara |
| 6. `_prisma_migrations` | consulta direta | uma linha, `finished_at` preenchido, `rolled_back_at` nulo, `applied_steps_count=1`, checksum `02294c4d…27cae` **igual ao SHA-256 do arquivo versionado** |
| 7. Imutabilidade | `git log -- prisma/migrations` | o diretório só foi tocado pelo commit `8244155` (F1-002); nenhuma edição posterior |
| 8. Integração | `npm run test:integration` com `DATABASE_URL` do banco descartável | 1 arquivo, **5 de 5** testes |
| 9. Retorno a condição conhecida (mecanismo 1) | `DROP DATABASE ... WITH (FORCE)` + `CREATE DATABASE`, depois `npx prisma migrate dev` | banco voltou a 0 tabelas; `migrate dev` reaplicou o histórico, "Your database is now in sync with your schema", exit 0; `migrate status` em dia |
| 10. Reversão por nova migration (mecanismo 2) | Numa **cópia descartável** do diretório `prisma/` fora do repositório: migration sintética `20260916100000_gate_expand` (coluna e índice novos em `listings`), aplicada por `migrate deploy`; depois migration compensatória `20260916100100_gate_revert_expand`, aplicada por `migrate deploy` | coluna presente após a primeira (1), ausente após a segunda (0); `migrate status` em dia; `migrate diff --from-config-datasource --to-schema` → migration **vazia** (sem drift) |
| 11. Equivalência estrutural | `pg_dump --schema-only` do banco revertido × banco `troq_ref` recém-migrado só com o histórico versionado, normalizado | **idênticos**: 623 linhas, mesmo SHA-256 (`dec959e4…`), 24 tabelas, 18 tipos, 4 funções, 3 triggers, 22 índices únicos, 46 FKs, 10 `CHECK`s, nenhuma ocorrência da coluna sintética |
| 12. Reset final | recriação do banco + `migrate dev` | histórico com **apenas** `20260914210926_initial_schema`; estrutura idêntica a `troq_ref` |
| 13. Reexecução das provas | prova de G5 (23 casos) e `test:integration` no banco recriado | 23 `PASS`, 0 `FAIL`; 5 de 5 testes |
| 14. Destruição | `docker rm -f -v troq-f1011-gate`; remoção da cópia descartável | contêiner e volume removidos; `git status` limpo em todos os pontos de controle |

Nenhuma migration versionada foi editada, criada ou removida. As duas migrations sintéticas existiram apenas na cópia descartável e no banco descartável.

**Observação O-1 (fato novo, sem efeito sobre o resultado).** No passo 10, com o banco carregando duas migrations aplicadas que **não existem** no diretório versionado, `npx prisma migrate status` executado a partir do repositório (Prisma `7.10.0`) respondeu "Database schema is up to date!", com exit 0. Ou seja, nesta versão o `migrate status` **não sinaliza** migration aplicada ao banco e ausente do histórico local. Isso não afeta G3 — o mecanismo documentado de retorno a estado conhecido é a recriação do banco descartável, e ela foi comprovada —, mas enfraquece a detecção de divergência que ADR-0005, decisão 11, exige para bancos compartilhados. Registrado em R-07 ([risks.md](risks.md)).

### 5.4 G4 — Nenhum segredo versionado

Varredura por script de auditoria, mantido fora do repositório, que **nunca imprime o valor encontrado** — apenas categoria, arquivo, linha ou blob, e uma classificação de forma.

**Categorias procuradas:** bloco de chave privada; URL PostgreSQL com senha embutida; AWS/R2 access key id; token GitHub; API key Resend; token Mercado Pago; DSN Sentry; auth token Sentry; token Vercel; API key Neon; token Slack; API key Google; JWT; e atribuição genérica a nomes contendo `SECRET`, `TOKEN`, `PASSWORD`, `API_KEY`, `ACCESS_KEY`, `PRIVATE_KEY` ou `WEBHOOK_KEY`.

| Escopo | Achados | Classificação sem exibir valores |
| --- | --- | --- |
| `HEAD`, 85 arquivos rastreados | 8 atribuições genéricas em `.env.example` (linhas 82, 85, 97, 108, 123, 126, 135 e 178) | todos os oito valores começam por `SUBSTITUIR` e o restante é composto apenas por segmentos do próprio nome da variável — placeholders |
| `HEAD` | 1 URL PostgreSQL com credencial em `src/modules/platform/telemetry/redaction.ts:118` | comentário de código; usuário, senha e host são os literais genéricos `user`, `pass` e `host` — exemplo do padrão que a fronteira de redação remove |
| `HEAD` | 4 URLs PostgreSQL e 2 atribuições | já classificadas como placeholder (`example.invalid`, `localhost`, referência a `secrets.*`) |
| Histórico, 380 blobs de todas as refs | as mesmas ocorrências em versões anteriores de `.env.example` (6 blobs) e de `redaction.ts` (1 blob) | cada uma das sete versões históricas de `.env.example` foi reclassificada: **0** valores fora do formato de placeholder |
| Categorias de alta especificidade (chave privada, tokens GitHub/Vercel/Neon/Slack/Google/Sentry, AWS key id, Resend key, token Mercado Pago, DSN Sentry, JWT) | **0** em `HEAD` e **0** no histórico | — |

**Arquivos e regras:** o único `.env*` rastreado, hoje e em qualquer commit, é `.env.example`; nenhum `*.pem`, `*.key`, `*.p12`, `*.pfx`, `auth.json`, `.npmrc` ou arquivo de credencial foi jamais adicionado; `.gitignore` ignora `.env` e `.env.*` com a exceção `!.env.example`, e `git check-ignore` confirma que o `.env.local` existente na máquina está ignorado. As credenciais reais vivem onde [../engineering/environments.md](../engineering/environments.md), seção 6.1, determina — `.env.local`, secrets do GitHub Environment `preview` e escopo Preview da Vercel —, nunca no Git.

Nenhuma suspeita de segredo real; nenhum incidente; nenhuma rotação ou reescrita de histórico necessária. Nenhuma ferramenta de *secret scanning* foi instalada como dependência.

## 6. G5 — Invariantes de restrição de banco

**Conjunto normativo.** O critério remete ao **quadro da seção 12** de [../architecture/data-model.md](../architecture/data-model.md), no qual cinco invariantes têm "Protegida por" igual a **restrição de banco**: I-1, I-2, I-5, I-6 e I-8. As demais (I-3, I-4, I-7, I-9 a I-14) são atribuídas a **transação** ou **modelo** e não entram no critério. O SQL efetivamente executado e o catálogo do banco migrado foram tratados como evidência mais forte que o `schema.prisma`.

### 6.1 Matriz das invariantes do quadro da seção 12

| # | Invariante e fonte | Tabela | Mecanismo exigido | `prisma/schema.prisma` | SQL efetivo na migration inicial / catálogo | Prova por caso negativo (banco descartável) | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **I-1** | Máximo de 3 solicitações ocupando vaga por anúncio — RB-003; DM-6.2 | `contact_requests` | Índice único parcial `(listingId, slotIndex)` sobre `reserved` e `paid` | `slotIndex Int`; `status ContactRequestStatus`; o índice parcial **não** é expressável sem Preview feature e vive no SQL (database.md, seção 8) | `contact_requests_listing_slot_occupied_key` = `UNIQUE (listing_id, slot_index) WHERE status = ANY ('reserved','paid')`; `contact_requests_slot_index_range_check` = `CHECK (slot_index >= 1 AND slot_index <= 3)` | três ocupantes nas vagas 1, 2, 3 aceitos; quarta na vaga 1 (`reserved`) e na vaga 3 (`paid`) → `23505` `contact_requests_listing_slot_occupied_key`; vagas 4 e 0 → `23514` `contact_requests_slot_index_range_check`; expirar a vaga 1 e reservá-la de novo → aceito, com 4 linhas no histórico e 3 ocupando vaga. **Concorrência:** 12 sessões simultâneas disputando as vagas de um mesmo anúncio → exatamente 3 obtiveram vaga, 9 recusadas pelo índice | **PASS** |
| **I-2** | Uma cobrança válida nunca gera duas vagas — RB-003, PE-3.3; DM-7.1 + I-1 | `payment_attempts` | Tentativa única por solicitação, mais I-1 | `PaymentAttempt.contactRequestId String @unique` | `payment_attempts_contact_request_id_key` = `UNIQUE (contact_request_id)`; FK `payment_attempts_contact_request_id_fkey` | primeira tentativa aceita; segunda para a mesma solicitação → `23505` `payment_attempts_contact_request_id_key` | **PASS** |
| **I-5** | Somente uma solicitação por anúncio pode estar escolhida e viva — DEC-032, seção 4.1; DM-8.5 | `negotiations` | Índice único parcial de negociação `active` por anúncio | `Negotiation.listingId` (denormalizado da escolha) e `status NegotiationStatus @default(active)`; índice parcial no SQL | `negotiations_active_per_listing_key` = `UNIQUE (listing_id) WHERE status = 'active'` | primeira `active` aceita; segunda `active` no mesmo anúncio → `23505` `negotiations_active_per_listing_key`; encerrar e abrir nova `active` (reseleção) → aceito; nova `active` com outra escolha → `23505` `negotiations_active_per_listing_key`; reabrir a encerrada → recusado antes, pelo trigger de terminalidade `negotiations_guard_closed` (`23514`) | **PASS** |
| **I-6** | Cada solicitação paga é escolhida no máximo uma vez — RS-5; DM-8.3 | `selections` | Escolha única por solicitação | `Selection.contactRequestId String @unique` | `selections_contact_request_id_key` = `UNIQUE (contact_request_id)` | primeira escolha aceita; segunda da mesma solicitação → `23505` `selections_contact_request_id_key` | **PASS** |
| **I-8** | Reversão não devolve vaga — PE-8.9, PE-12.6; DM-6.7 | `contact_requests` | Transição de saída de `paid` proibida | não expressável em schema declarativo (depende do valor anterior da linha) | função `troq_contact_requests_guard_paid` e trigger `contact_requests_guard_paid` `BEFORE UPDATE ... FOR EACH ROW`, que rejeita mudança de `status`, `slot_index` ou `listing_id` de linha `paid` com `check_violation` | `paid -> expired`, `paid -> failed`, `paid -> reserved` e troca de `slot_index` → `23514`, mensagem do trigger citando DM-6.7; atualização de campo neutro (`updated_at`) → aceita | **PASS** |

A prova foi executada duas vezes — logo após `migrate deploy` e de novo no banco recriado por `migrate dev` —, com **23 `PASS` e 0 `FAIL`** em ambas. Cada caso roda em bloco com captura de exceção, que só aprova se a recusa vier do nome de restrição esperado, e o conjunto termina em `ROLLBACK`. Uma primeira execução acusou falha **do próprio roteiro**: um caso reutilizava uma escolha que já tinha negociação, e a recusa veio de `negotiations_selection_id_key`, não do índice testado; o caso foi corrigido para usar uma terceira escolha, sem nenhuma alteração de schema.

### 6.2 Complemento — demais itens de `data-model.md` marcados como restrição de banco

Fora do quadro da seção 12, o corpo do modelo também marca como **restrição de banco** (às vezes somada a transação) DM-5.1, DM-5.7, DM-7.2, DM-7.3, DM-7.4, DM-7.5, DM-8.8, DM-9.1, DM-9.2, DM-10.1 e DM-10.5. Eles **não** compõem o critério, mas foram conferidos no catálogo do banco migrado, sem exceção:

| Item | Artefato presente no catálogo |
| --- | --- |
| DM-5.1 | função `troq_listing_transition_allowed`, `listing_transitions_allowed_pair_check`, trigger `listings_guard_status` |
| DM-5.7 | `listing_images_listing_id_position_key`, `listing_images_position_range_check` |
| DM-7.2 | `payment_attempts_idempotency_key_key` |
| DM-7.3 | `payments_provider_payment_id_key` |
| DM-7.4 | `payments_canonical_per_attempt_key` (parcial, `WHERE is_canonical`) |
| DM-7.5 | colunas distintas `payment_attempts.accredited_at` e `payment_attempts.recognized_at` (`timestamptz`), e `payments.accredited_at` |
| DM-8.8 | `contact_releases_negotiation_id_key` |
| DM-9.1 | `ratings_negotiation_id_evaluator_id_key` |
| DM-9.2 | `ratings_score_range_check`, `ratings_distinct_parties_check` |
| DM-10.1 | `reports_reporter_id_listing_id_key` |
| DM-10.5 | `appeals_moderation_decision_id_key` |

A prova por caso negativo destes itens é a de F1-002, registrada em [../engineering/database.md](../engineering/database.md), seção 12, item 4; a migration não mudou desde então (checksum e histórico Git na seção 5.3).

## 7. Entregáveis da Fase 1 — conferência sem regressão

Conferência de consistência, não critério de gate. Base: estado registrado por F1-010 e o repositório em `51e280a`.

| # | Entregável | Estado | Conferência nesta auditoria |
| --- | --- | --- | --- |
| E-1 | Scaffold Next.js + TypeScript, App Router e estrutura de módulos | **concluído** | `src/app/` presente e `build` aprovado; os onze diretórios `src/modules/{identity,contact,listing,media,request,payments,negotiation,reputation,moderation,audit,platform}` presentes |
| E-2 | Padrões de projeto | **concluído** | `format:check`, `lint`, `typecheck` e `test:ci` aprovados localmente e no CI |
| E-3 | CI em toda PR | **concluído** | `ci.yml` inalterado; required check verde em `main` (seção 5.1) |
| E-4 | Ambientes e segredos | **concluído** | [../engineering/environments.md](../engineering/environments.md) e `.env.example` presentes; G4 aprovado |
| E-5 | Neon, Prisma, job de `migrate deploy`, schema inicial | **concluído** | G3 e G5 aprovados; workflow `Migrations de preview (Neon)` com execução `success` no próprio `51e280a` (run `35079832771`: `migrate deploy`, `migrate status` e `test:integration` contra o Neon, todos `success`) |
| E-6 | Projeto Vercel, R2 e Resend em `development` e `preview` | **concluído** | projeto Vercel conferido por G2; R2 e Resend **não** foram reexercitados — auditar o gate não exige usar suas credenciais —, e nenhum fato posterior a F1-006 e F1-007 indica alteração neles; a conclusão de E-6 permanece a registrada por aqueles trabalhos |
| E-7 | Observabilidade básica | **concluído** | arquivos de instrumentação em `src/` presentes; testes da fronteira de redação dentro dos 51 aprovados |

Nenhuma regressão encontrada desde F1-010.

## 8. Dependências da Fase 2

**Dependências explícitas do roadmap:** "gate da Fase 1; OD-04, OD-05 e OD-11 fechadas".

| Dependência | Situação | Evidência |
| --- | --- | --- |
| Gate da Fase 1 | **aprovado** | seção 11 |
| OD-04 | fechada | [../decisions/open-decisions.md](../decisions/open-decisions.md) → [../product/listing-lifecycle.md](../product/listing-lifecycle.md), DEC-027 |
| OD-05 | fechada | → [../product/image-policy.md](../product/image-policy.md), DEC-028 |
| OD-11 | fechada | → [../product/age-eligibility.md](../product/age-eligibility.md), DEC-034 |
| Decisões abertas | nenhuma | "Nenhuma. Não resta nenhuma decisão aberta na Fase 0." |

**Requisitos citados pelos entregáveis e pelo gate da Fase 2**, lidos de [../product/requirements.md](../product/requirements.md):

| Requisito | Status | Classificação |
| --- | --- | --- |
| RF-001, RF-002, RF-003 — cadastro, verificação de email, sessão | `definido` | núcleo definido; Better Auth é DEC-012 |
| RF-004 — publicação de anúncio | `parcialmente definido` | ver abaixo |
| RF-005, RF-006, RF-007 — consulta, imagens, localização | `definido` | núcleo definido |
| RF-014 — proteção do contato | `definido` | núcleo definido |
| RF-021 — email transacional | `parcialmente definido` | ver abaixo |
| RNF-005 — otimização de imagens | `definido` | núcleo definido |

**RF-004 e RF-021 — detalhe de design da própria Fase 2, não bloqueio.**

- **RF-004.** O núcleo necessário está definido: estado inicial `draft`, publicação explícita, mínimo de uma imagem processada e declaração de conformidade ([../product/listing-lifecycle.md](../product/listing-lifecycle.md), [../product/image-policy.md](../product/image-policy.md)). A lacuna registrada no próprio requisito — "Campos além de título, descrição, imagens e cidade/UF não estão definidos" — é design do formulário de anúncio, a ser fechado durante a Fase 2, antes da implementação da publicação. O schema inicial já materializa os campos definidos.
- **RF-021.** O único email que a Fase 2 exige, o de verificação, é obrigatório e está definido também por RF-002 (`definido`). A lacuna é o catálogo completo de notificações, que pertence ao design de cada fluxo das fases seguintes. O Resend de `development` e `preview` existe desde F1-007.

Nenhum dos dois foi alterado por esta tarefa. **Bloqueio real encontrado: nenhum.** Condição técnica que a Fase 2 precisará resolver no seu primeiro trabalho, sem que isso seja bloqueio: as tabelas de identidade e sessão do Better Auth não existem no schema inicial e exigirão migration nova, conforme ADR-0005 — matéria de F2-001.

## 9. Revisão de riscos

Revisão de R-01 a R-11 de [risks.md](risks.md) contra os fatos da Fase 1. **Nenhum risco foi encerrado:** infraestrutura criada não é risco mitigado em operação.

| Risco | Revisão | Mudança em [risks.md](risks.md) |
| --- | --- | --- |
| R-01 — Viabilidade da cobrança de R$ 0,99 | Sem fato novo na Fase 1; residual comercial vigente | Nenhuma |
| R-02 — Corrida para exceder três pagas | A restrição I-1 foi provada por caso negativo e por disputa real de 12 sessões no banco. **Não encerrado:** a prova exigida é o teste de concorrência da aplicação no gate da Fase 3 (T-1, T-2), e a alocação transacional ainda não existe | Nenhuma |
| R-03 — Vazamento de telefone/WhatsApp | A fronteira de redação de telemetria de F1-010 reduz uma das superfícies (logs), já registrada em ADR-0007; o fluxo de contato não existe | Nenhuma |
| R-04 — Webhook × estado interno | Sem fato novo | Nenhuma |
| R-05 — Moderação | Sem fato novo | Nenhuma |
| R-06 — LGPD | Sem fato novo; nenhum dado pessoal real coletado | Nenhuma |
| R-07 — Migrations fora da estratégia | **Fato novo:** reversibilidade em `development` comprovada pelos dois mecanismos documentados; e a observação O-1 — Prisma `7.10.0` `migrate status` não acusa migration aplicada ao banco e ausente do histórico local. Continuam não existindo validação de migration em CI de PR nem banco e job de `production` | **Atualizado** com os dois fatos |
| R-08 — Serviços externos | Sem fato novo desde F1-009; o fim do trial do Sentry em 2026-09-29 já está registrado | Nenhuma |
| R-09 — Custo Vercel em produção | Sem fato novo; nenhum plano pago contratado | Nenhuma |
| R-10 — Desempenho mobile | Sem fato novo | Nenhuma |
| R-11 — Reembolso técnico | Sem fato novo | Nenhuma |

## 10. Pendências reais que não são critério de gate

1. `production` não existe em nenhum provedor. É entregável da Fase 5, não gate da Fase 1.
2. Não há validação de migration nem `test:integration` em CI de PR contra banco efêmero (ADR-0005, tabela "CI de PR"; [../engineering/database.md](../engineering/database.md), seção 11). A validação existente é pós-merge, contra o Neon de `preview`.
3. A entrega navegador→Sentry em `preview` não foi observada por F1-010 (bloqueio do host de ingestão nos navegadores de teste).
4. Os seis sinais de AR-14.3 dependem de fluxos de domínio ainda inexistentes.
5. O-1 (seção 5.3): a detecção de divergência de histórico em banco compartilhado não pode se apoiar só em `migrate status`.

## 11. Resultado formal

### **APROVADO**

Os cinco critérios da matriz da seção 4 resultaram `PASS`, cada um com evidência própria e nenhum por inferência. O gate de saída da Fase 1 está satisfeito.

- **Fase 1: concluída** em 2026-09-16.
- **Fase 2: aberta, `em andamento`.** Nenhuma funcionalidade dela foi implementada por esta tarefa.
- **F1-011: concluído** — este documento é a sua entrega.
- Nenhum item `F1-xxx` permanece `próximo`, `pendente` ou `bloqueado`.

A aprovação vale para o gate de saída da Fase 1. Ela **não** afirma que exista `production` — não existe, em provedor nenhum — nem que os residuais da seção 10 estejam resolvidos.

## 12. Próximo trabalho recomendado

**F2-001 — Consolidar o contrato técnico de identidade e autenticação da Fase 2**, `próximo`: validar a integração atual do Better Auth com Next.js/App Router e Prisma, consolidar o modelo de identidade, sessão e verificação de email do TROQS e definir o contrato técnico necessário antes da implementação funcional da autenticação.

F2-001 **não** foi executado, e o seu prompt executor não é produzido aqui.

## 13. Referências

- [roadmap.md](roadmap.md) — fases, entregáveis e gates
- [backlog.md](backlog.md) — itens `F1-xxx`
- [risks.md](risks.md) — R-01 a R-11
- [phase-1-transition.md](phase-1-transition.md) — gate da Fase 0
- [../project-state.md](../project-state.md) — estado corrente
- [../architecture/data-model.md](../architecture/data-model.md) — quadro de invariantes
- [../engineering/database.md](../engineering/database.md) — materialização física e procedimento de validação
- [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md) — estratégia de migrations
- [../engineering/environments.md](../engineering/environments.md) — custódia de segredos
