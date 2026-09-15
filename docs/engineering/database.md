# Banco de dados — Prisma, schema físico e migrations — TROQ

Fonte de engenharia da **materialização física** do banco de dados e do **runtime do Prisma Client**. Produzido por **F1-002**, o segundo trabalho da Fase 1, como a primeira parte do entregável E-5 de [../delivery/phase-1-transition.md](../delivery/phase-1-transition.md), seção 10; atualizado por **F1-003**, que acrescentou a seção 13 (runtime), e por **F1-004**, que provisionou o Neon de `preview` e criou o workflow controlado de `migrate deploy` (seção 15).

Este documento **não duplica** o modelo lógico: entidades, relações, cardinalidades, estados e invariantes estão em [../architecture/data-model.md](../architecture/data-model.md), e a política de migrations está em [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md). Aqui ficam apenas as decisões **físicas** — o que foi escolhido para representar o modelo no PostgreSQL —, o que o Prisma Schema consegue expressar e o que exigiu SQL customizado, e o procedimento de validação. Em caso de conflito com ADR, decisão registrada ou documento de arquitetura, **prevalece a fonte de nível superior** ([ai-agent-workflow.md](ai-agent-workflow.md), seção 2) e este documento deve ser corrigido.

## 1. Escopo

**Faz:** registra o Prisma adotado e a versão efetivamente instalada, a estrutura dos arquivos, a separação entre conexão pooled e direta, as convenções físicas (nomes, identificadores, instantes, dinheiro, tipos de texto, ações referenciais), como a migration inicial materializa as invariantes de restrição de banco, quais garantias vivem no Prisma Schema e quais exigem SQL customizado, os comandos permitidos em desenvolvimento, o procedimento de validação sobre banco descartável, desde F1-003 a **fronteira de runtime** que instancia o Prisma Client com driver adapter (seção 13) e, desde F1-004, o **Neon de `preview`** e o **workflow controlado de `migrate deploy`** (seção 15).

**Não faz:** não provisiona banco de `production` nem cria credencial de produção; não cria repositórios de domínio; não integra Better Auth, R2, Resend ou Mercado Pago; não cria os módulos de domínio de AR-3.3; não implementa funcionalidade de produto; não altera regra de negócio, requisito, ADR ou decisão vigente.

**Estado factual na data desta versão (2026-09-15, após F1-004).** O repositório contém `prisma.config.ts`, `prisma/schema.prisma`, a migration inicial versionada, a fronteira de runtime `src/persistence/prisma.ts` (seção 13) e, desde F1-004, o workflow `.github/workflows/migrate-preview.yml` (seção 15). O **Neon de `preview` está provisionado** — projeto `techlab-troq-preview`, São Paulo, PostgreSQL 17, branch `preview`, database `troq` — e as duas conexões (direta e pooled) foram verificadas com `SELECT 1` e estão sob custódia do GitHub Environment `preview`; a pooled está também no escopo **Preview** do projeto Vercel `techlab-troq`, junto de `APP_ENV=preview`, com um deployment de preview novo em `READY` (seção 15.2). **A migration inicial foi aplicada ao Neon de `preview` pelo workflow**, na primeira execução após o merge da PR de F1-004, com `migrate status` em dia e a suíte de integração aprovada contra o endpoint pooled (seção 15.6); desde então ela é **imutável**. **E-5 está concluído** (F1-002, F1-003 e F1-004). `production` não existe: nenhum banco, credencial, environment ou job de produção foi criado.

## 2. Prisma adotado

| Item | Valor |
| --- | --- |
| ORM e ferramenta de migrations | Prisma ORM e Prisma Migrate ([ADR-0005](../adr/0005-prisma-orm-migrations.md), DEC-026) |
| Linha | **7.x estável**, pinada em versão exata |
| Versão instalada | `prisma@7.10.0` (`devDependencies`) e `@prisma/client@7.10.0` (`dependencies`), sem `^`, `~` ou `@latest`; lockfile versionado |
| Verificação na instalação (2026-09-14) | No registro npm, `prisma@latest` resolvia para `8.0.0-rc.15` (release candidate) e `prev` para `7.10.0`; `@prisma/client@latest` resolvia para `7.10.0`. **Não existe 7.x posterior a 7.10.0.** A linha 8 não foi adotada, conforme a política de evolução de ADR-0005 |
| Generator | `provider = "prisma-client"` — o generator da linha 7 —, com `output = "../src/generated/prisma"` explícito |
| Preview features | **Nenhuma.** Em particular, `partialIndexes` **não** está habilitada, embora exista em Preview na 7.10: o projeto prioriza superfície estável e materializa índices parciais por SQL na migration (seção 8) |
| Motor | Prisma 7 usa Query Compiler (sem engine Rust em runtime); o CLI traz o Schema Engine próprio e **não** exige adapter para operações de schema |
| Driver adapter de runtime | `@prisma/adapter-pg@7.10.0` sobre `pg@8.23.0`, ambos em `dependencies`, pinados em versão exata — instalados por **F1-003** (seção 13). `@types/pg` **não** é dependência direta: vem transitivamente do adapter e o código da aplicação não importa `pg` |

Atualizações de minor e patch dentro de 7.x seguem a política de ADR-0005: atualização do pin e do lockfile em PR própria, sem ADR. Adoção da linha 8 exige **nova ADR**.

## 3. PostgreSQL

O banco é **PostgreSQL padrão**, conforme [ADR-0002](../adr/0002-postgresql-neon.md). O schema físico e a migration usam apenas recursos do PostgreSQL core: tipos `uuid`, `timestamptz`, `text`, `varchar`, `char`, `integer`, `boolean`, `jsonb`, enums nativos, índices únicos parciais, `CHECK`, funções `sql`/`plpgsql` e triggers. **Nenhuma extensão** é criada e **nenhum recurso proprietário do Neon** (branching, por exemplo) é usado ou pressuposto.

A validação de F1-002 e F1-003 usou PostgreSQL **17.11** em contêiner descartável (seção 12). O Neon de `preview` provisionado por F1-004 roda a major **17** (17.11 observado em 2026-09-15 por `SHOW server_version`; seção 15). Nenhum dos dois é pin de produção: qualquer versão estável suportada pelo Prisma 7 serve, e a major de `production`, quando esse banco existir, será escolhida no seu provisionamento.

## 4. Conexões: `DATABASE_URL` pooled e `DIRECT_URL` direta

A separação é a de [ADR-0005](../adr/0005-prisma-orm-migrations.md), decisão 10, e do contrato de [environments.md](environments.md), seção 5.2:

| Variável | Quem consome hoje | Para quê |
| --- | --- | --- |
| `DIRECT_URL` | **`prisma.config.ts`**, lida pelo Prisma CLI (`migrate dev`, `migrate deploy`, `migrate status`, `migrate reset`, `migrate diff`) | Conexão **direta, não pooled**, para operações de schema. **Nunca** é lida pelo runtime |
| `DATABASE_URL` | **`src/persistence/prisma.ts`**, a fronteira de runtime criada por F1-003 (seção 13). **Consumida** | Conexão **pooled** do runtime da aplicação, passada ao `PrismaPg` que o Prisma Client usa. **Nunca** é lida pelo CLI |

Custódia em `preview`, desde F1-004 (detalhe na seção 15.2): `DIRECT_URL` existe **apenas** como secret do GitHub Environment `preview`, lido pelo workflow de migrations; `DATABASE_URL` existe como secret do mesmo environment (para a prova de integração pós-merge) e como variável sensível do projeto Vercel no escopo Preview (para o runtime hospedado). A conexão direta **não** entra na Vercel.

Por que o CLI não pode usar a pooled: o endpoint pooled do Neon usa PgBouncer em modo transação e não suporta os recursos de sessão de que as operações de schema dependem ([ADR-0006](../adr/0006-async-work-scheduling-concurrency.md), fato N-1). Em `development` contra banco local, as duas URLs podem apontar para o mesmo servidor; a distinção de nomes é preservada mesmo assim, para que o contrato não mude ao conectar o Neon.

### 4.1 `prisma.config.ts`

O arquivo vive na raiz do repositório e usa `defineConfig` de `prisma/config` com `schema`, `migrations.path` e `datasource.url` lido de `DIRECT_URL`. Três pontos deliberados:

1. **Prisma 7 não carrega `.env*` sozinho.** Em vez de adicionar a dependência `dotenv`, o arquivo usa `process.loadEnvFile`, nativo do Node.js 24 (runtime já fixado em [conventions.md](conventions.md), seção 1), tentando `.env.local` e depois `.env`. A ausência do arquivo **não** é erro: em CI e em ambientes hospedados a variável vem do próprio ambiente. Isso preserva a custódia definida em [environments.md](environments.md), seção 6.1.
2. **O `datasource` só é declarado quando `DIRECT_URL` existe.** Fato verificado em 2026-09-14: o helper `env()` de `prisma/config` lança erro **no carregamento** do arquivo quando a variável está ausente, o que faria `prisma generate`, `prisma validate` e `prisma format` — comandos que **não** tocam o banco — falharem em CI sem variável. Com o `datasource` condicional, esses comandos funcionam sem `DIRECT_URL`, e os comandos que precisam de banco (`migrate dev`, `migrate deploy`, `migrate status`, `migrate diff`) falham com a mensagem do próprio Prisma de datasource ausente. Isso **não** é validação geral de variáveis de ambiente, que continua fora de escopo.
3. **Nenhuma URL real está no repositório.** `prisma.config.ts` contém apenas o nome da variável; `.env.example` contém apenas placeholder com host `example.invalid`.

## 5. Estrutura dos arquivos Prisma

```
prisma.config.ts                              configuracao do CLI (secao 4.1)
prisma/
  schema.prisma                               schema declarativo (fonte do Prisma Client e das migrations)
  migrations/
    migration_lock.toml                       provider = "postgresql"; gerado pelo Prisma Migrate, versionado
    20260914210926_initial_schema/
      migration.sql                           migration inicial: SQL gerado + bloco customizado (secao 8)
src/generated/prisma/                         Prisma Client gerado — artefato de build, NAO versionado
src/persistence/
  prisma.ts                                   fronteira de runtime: PrismaClient + PrismaPg (secao 13)
  prisma.test.ts                              unitario: carregamento, erro sem DATABASE_URL, reuso
  prisma.integration.test.ts                  integracao contra PostgreSQL real (npm run test:integration)
vitest.integration.config.mts                 config da suite de integracao (fora de test:ci)
```

- `src/generated/prisma/` está em `.gitignore`, `.prettierignore` e nos `ignores` do ESLint. Ele é recriado por `npx prisma generate` e **não** entra em commit. Desde F1-003, o script `postinstall` do `package.json` executa `prisma generate` ao fim de `npm ci`/`npm install`: como a fronteira de runtime (seção 13) importa o client gerado, `typecheck`, `test:ci` e `build` passaram a depender dele, e o CI e a Vercel instalam a partir de um checkout sem o artefato. `prisma generate` não toca o banco e não exige `DATABASE_URL` nem `DIRECT_URL` (seção 4.1); é exatamente o uso que [ADR-0005](../adr/0005-prisma-orm-migrations.md) admite no build/`postinstall`, enquanto `migrate deploy` continua fora dele.
- O `datasource` do schema declara apenas `provider = "postgresql"`; a URL vive exclusivamente em `prisma.config.ts` (regra da linha 7).
- Migrations são **imutáveis depois de aplicadas em ambiente compartilhado** (ADR-0005, decisão 5). A migration inicial **é imutável desde 2026-09-15**, quando a primeira execução bem-sucedida do workflow da seção 15 a aplicou ao Neon de `preview` (seção 15.6); corrigir qualquer coisa nela significa **nova** migration. F1-004 não a alterou, o que foi conferido por hash.

## 6. Convenções físicas

### 6.1 Nomes

| Objeto | Convenção | Exemplo |
| --- | --- | --- |
| Tabela | `snake_case`, plural, via `@@map` | `contact_requests` |
| Coluna | `snake_case`, via `@map` | `slot_index`, `reserved_until` |
| Tipo enum | `snake_case`, singular, via `@@map` | `contact_request_status` |
| Valor de enum | **grafia técnica literal do documento normativo**, sem tradução nem renomeação | `paid`, `sem_acao`, `pagamento_confirmado`, `pi_03` |
| Índice/constraint gerados pelo Prisma | padrão do Prisma | `payment_attempts_contact_request_id_key`, `listings_owner_id_fkey` |
| Índice/constraint customizados | `<tabela>_<assunto>_key` (unicidade) e `<tabela>_<assunto>_check` (CHECK) | `contact_requests_listing_slot_occupied_key`, `ratings_score_range_check` |
| Função e trigger | função `troq_<tabela>_<papel>`, trigger `<tabela>_<papel>` | `troq_contact_requests_guard_paid`, `contact_requests_guard_paid` |

No código, os models e campos ficam em `PascalCase`/`camelCase`, com o vocabulário dos documentos de produto ([conventions.md](conventions.md), seção 2.4).

### 6.2 Identificadores (DM-1.1)

- Tipo físico: **`uuid` nativo do PostgreSQL** (`String @db.Uuid` no schema).
- Geração: **`@default(uuid())`**, ou seja, UUID v4 gerado **pelo Prisma Client no momento da escrita**. A migration **não** cria `DEFAULT` no banco — foi conferido no SQL gerado — e **nenhuma extensão** (`uuid-ossp`, `pgcrypto`) é instalada.
- Consequência prática: inserções feitas por SQL bruto precisam informar `id` explicitamente (por exemplo, `gen_random_uuid()`, que é função do core desde o PostgreSQL 13). Os testes da seção 12 fazem isso.
- Sem `autoincrement()` em nenhuma tabela: nenhum identificador revela volume ou ordem.

### 6.3 Instantes (DM-1.2)

Todo instante persistido é **`timestamptz(6)`** (`@db.Timestamptz(6)`): com fuso, armazenado em UTC, na precisão de microssegundos que é a nativa do PostgreSQL. A escolha por 6, e não pelos 3 milissegundos do padrão do Prisma, evita truncar valores gerados pelo próprio banco (`now()`) ou recebidos do provedor de pagamento; o Prisma Client continua lendo e escrevendo `Date` com precisão de milissegundos, o que é suficiente para os prazos do produto (14 dias, 7 dias, 30 dias, 30 minutos). Cálculo de prazo em dias úteis usa o fuso de Brasília **na aplicação**, não no banco.

### 6.4 Valores monetários (DM-1.3)

**Inteiro em centavos**, coluna `amount_cents` do tipo `integer`. R$ 0,99 é `99`. Nenhum `float`, `double` ou `real` existe no schema. Esta entrega **não** introduz aritmética monetária: o campo só registra o valor que o provedor reportou.

### 6.5 Texto

- Padrão: `text` (sem limite), porque a documentação não fixa limite para nome, título, descrição, cidade, chave de objeto, motivos e resultados. Inventar limite seria criar regra ausente.
- Limites **definidos por decisão de produto** são materializados como `varchar`: `reports.details` em `varchar(500)` (DEC-031, seção 6) e `appeals.text` em `varchar(1000)` (DEC-031, seção 11).
- `listings.uf` é `char(2)`: a UF brasileira tem exatamente duas letras por definição, não por escolha arbitrária.

### 6.6 Ações referenciais

- **`ON DELETE RESTRICT` em todas as chaves estrangeiras**, declarado explicitamente no schema: fatos históricos (escolha, liberação, consumo de vaga, aprovação, decisão) nunca desaparecem por efeito colateral de uma remoção, e a exclusão de conta de DEC-033 é **eliminação ou pseudonimização de dado pessoal**, não cascata de linhas.
- **Única exceção:** `image_derivatives.image_id` → `listing_images` é `ON DELETE CASCADE`. Derivados não são fato histórico e o expurgo de imagens (DEC-033, seção 4) remove a imagem e seus derivados juntos.
- `ON UPDATE CASCADE` é o padrão do Prisma e é inócuo: chaves primárias `uuid` não são atualizadas.

## 7. O que a migration inicial materializa

Migration: `prisma/migrations/20260914210926_initial_schema/migration.sql`. Foi gerada por `prisma migrate dev --create-only --name initial_schema`, revisada, **complementada à mão** com o bloco de SQL customizado e só então aplicada ao banco descartável (ADR-0005, decisão 5).

Conteúdo: 18 tipos enum, 24 tabelas (os 24 models de [../architecture/data-model.md](../architecture/data-model.md), seção 2 — **sem entidade `Interest`**, conforme DEC-035), 18 índices únicos e 46 chaves estrangeiras gerados pelo Prisma, mais o bloco customizado com 4 índices únicos parciais, 10 `CHECK`s, 4 funções e 3 triggers.

### 7.1 Invariantes do quadro da seção 12 de `data-model.md` atribuídas a restrição de banco

| # | Invariante | Mecanismo físico | Nome do objeto |
| --- | --- | --- | --- |
| **I-1** | Máximo de 3 solicitações ocupando vaga por anúncio (RB-003, DM-6.2) | `CHECK (slot_index BETWEEN 1 AND 3)` **mais** índice único **parcial** sobre `(listing_id, slot_index)` restrito a `status IN ('reserved', 'paid')`. Uma quarta solicitação concorrente não tem valor de `slot_index` disponível e a transação falha sem depender de `COUNT` prévio. Linhas em `expired`/`failed` saem do índice e liberam o valor **sem serem apagadas** | `contact_requests_slot_index_range_check`, `contact_requests_listing_slot_occupied_key` |
| **I-2** | Uma cobrança válida nunca gera duas vagas (DM-7.1) | `payment_attempts.contact_request_id` é `@unique`: a segunda tentativa para a mesma solicitação viola a unicidade. Combinado com I-1 | `payment_attempts_contact_request_id_key` |
| **I-5** | Somente uma negociação `active` por anúncio (DM-8.5) | Índice único **parcial** sobre `negotiations.listing_id` restrito a `status = 'active'`. Exigiu a coluna `listing_id` na própria tabela de negociações, denormalizada a partir da escolha, porque índice parcial não atravessa junção | `negotiations_active_per_listing_key` |
| **I-6** | Cada solicitação paga é escolhida no máximo uma vez (DM-8.3) | `selections.contact_request_id` é `@unique` | `selections_contact_request_id_key` |
| **I-8** | `paid` não perde a vaga (DM-6.7) | Trigger `BEFORE UPDATE` em `contact_requests`: se `OLD.status = 'paid'` e a linha tenta mudar `status`, `slot_index` ou `listing_id`, a atualização é rejeitada com `check_violation`. Garantia que depende do valor **anterior** da linha e por isso não cabe em `CHECK` | função `troq_contact_requests_guard_paid`, trigger `contact_requests_guard_paid` |

I-3, I-4, I-7, I-9, I-10, I-12, I-13 e I-14 são atribuídas pelo modelo a **transação**, **modelo** ou **aplicação**, e não a restrição de banco; elas serão implementadas pelos casos de uso nas Fases 2 a 4.

### 7.2 Demais restrições já definidas pelo modelo

| Regra | Mecanismo | Nome do objeto |
| --- | --- | --- |
| DM-5.7 — até 6 imagens, posição única por anúncio | `@@unique([listingId, position])` + `CHECK (position BETWEEN 1 AND 6)` | `listing_images_listing_id_position_key`, `listing_images_position_range_check` |
| DM-9.1 — uma avaliação por (negociação, avaliador) | `@@unique([negotiationId, evaluatorId])` | `ratings_negotiation_id_evaluator_id_key` |
| DM-9.2 — nota inteira em {1..5}; sem autoavaliação | `CHECK (score BETWEEN 1 AND 5)`; `CHECK (evaluator_id <> evaluated_id)` | `ratings_score_range_check`, `ratings_distinct_parties_check` |
| DM-10.1 — denúncia única por (denunciante, anúncio) | `@@unique([reporterId, listingId])` | `reports_reporter_id_listing_id_key` |
| DM-10.5 — contestação única por decisão | `moderation_decision_id` `@unique` | `appeals_moderation_decision_id_key` |
| DM-8.8 — liberação única por negociação | `negotiation_id` `@unique` (e `contact_request_id` `@unique`, derivado de I-6 e da relação 1:1 escolha–negociação) | `contact_releases_negotiation_id_key`, `contact_releases_contact_request_id_key` |
| DM-7.3 — pagamento único pelo identificador no provedor | `provider_payment_id` `@unique` | `payments_provider_payment_id_key` |
| DM-7.4 — no máximo um pagamento canônico por tentativa | `payments.is_canonical boolean` + índice único **parcial** sobre `payment_attempt_id` restrito a `is_canonical`. Preferido a uma FK `canonical_payment_id` na tentativa, que criaria referência circular entre as duas tabelas | `payments_canonical_per_attempt_key` |
| DM-7.2 — chave de idempotência persistida e única | `idempotency_key` `@unique`; também `external_reference` e `provider_order_id` únicos | `payment_attempts_idempotency_key_key` e correlatos |
| DM-3.1 — email único entre contas não excluídas | Índice único **parcial** sobre `users.email` restrito a `status <> 'deletion_requested'`. Conta que pediu exclusão já não é conta ativa (DM-3.4) e sai da unicidade; o expurgo dos 30 dias anonimiza o email de qualquer forma | `users_email_active_key` |
| DM-5.1 — transições do anúncio exatamente T1..T9 | Função `IMMUTABLE` `troq_listing_transition_allowed(from, to)` com a matriz de DEC-027, usada por **dois** guardas: `CHECK` em `listing_transitions` (o histórico não registra par inválido) e trigger `BEFORE UPDATE OF status` em `listings` (a linha não sai de `closed`/`removed` nem faz `published -> draft`). A atualização condicionada ao estado de origem continua sendo dever da transação | `listing_transitions_allowed_pair_check`, `listings_guard_status` |
| DM-8.6 — `closed` é terminal na negociação | Trigger `BEFORE UPDATE OF status` em `negotiations`; `CHECK ((status = 'closed') = (closed_at IS NOT NULL))`; `CHECK (owner_id <> chosen_id)` | `negotiations_guard_closed`, `negotiations_closed_at_consistency_check`, `negotiations_distinct_parties_check` |
| DM-6.1 — `paid_at` acompanha `paid`; janela coerente | `CHECK ((status = 'paid') = (paid_at IS NOT NULL))`; `CHECK (reserved_until > reserved_from)` | `contact_requests_paid_at_consistency_check`, `contact_requests_reservation_window_check` |
| DEC-031 seção 7.3 — decisão de ofício registra a origem do conhecimento | `CHECK (report_id IS NOT NULL OR knowledge_source IS NOT NULL)` | `moderation_decisions_origin_check` |
| 1:0..1 e 1:1 declarados pelo modelo | `user_contacts.user_id`, `account_deletion_requests.user_id`, `technical_refunds.payment_id`, `negotiations.selection_id`, `moderation_decisions.report_id` são `@unique` | `*_key` gerados pelo Prisma |

Todos os estados fechados são **enums nativos** do PostgreSQL. Nenhum estado foi criado, renomeado ou traduzido.

## 8. O que vive no Prisma Schema e o que exige SQL customizado

| Garantia | Onde | Por quê |
| --- | --- | --- |
| Tabelas, colunas, tipos nativos, enums, chaves primárias e estrangeiras, ações referenciais, índices simples e **únicos totais** | **Prisma Schema** | O generator e o Prisma Migrate expressam tudo isso de forma estável; o SQL é gerado |
| Índices únicos **parciais** (I-1, I-5, canônico, email) | **SQL customizado** | Exigiriam a Preview feature `partialIndexes`, deliberadamente não habilitada |
| `CHECK` de faixa e de consistência | **SQL customizado** | O Prisma Schema não expressa `CHECK` |
| Triggers e funções (I-8, matriz do anúncio, terminalidade da negociação) | **SQL customizado** | Dependem do valor anterior da linha; não são representáveis em schema declarativo |

**Fato verificado em 2026-09-14 sobre drift.** Depois de aplicar a migration com o bloco customizado, `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` produziu uma migration **vazia**, e um segundo `prisma migrate dev --create-only` também. Ou seja: o Prisma Migrate 7.10 **não** enxerga índices parciais, `CHECK`s, funções e triggers como divergência e **não** tenta removê-los na migration seguinte. Ainda assim, quem alterar uma coluna referenciada por esses objetos deve conferir o SQL gerado — o Prisma pode, por exemplo, recriar um tipo enum sem saber que uma função `IMMUTABLE` depende dele.

**Regra de manutenção.** Toda migration futura que precise de objeto não representável segue o mesmo caminho: `--create-only`, editar, revisar, aplicar em banco descartável, provar por caso negativo, e só então versionar (ADR-0005, decisão 5).

## 9. `db push` e ambientes

`prisma db push` é **proibido fora de `development`** e, em `development`, só contra banco local ou descartável (ADR-0005, decisão 8; [environments.md](environments.md), seção 2.4). Ele não cria histórico em `_prisma_migrations` e não pode substituir migration em `preview` ou `production` em nenhuma circunstância. **Nesta entrega ele não foi usado.**

`prisma migrate dev` e `prisma migrate reset` são igualmente restritos a banco local ou descartável (decisão 6). `prisma migrate deploy` é o único mecanismo autorizado para ambiente compartilhado e é executado pelo **workflow controlado** `.github/workflows/migrate-preview.yml`, criado por F1-004 (seção 15) — somente a partir de `main`, serializado e com a conexão direta do GitHub Environment `preview`. Para `production`, que ainda não existe, o job correspondente, com aprovação explícita (decisão 7), será criado quando esse ambiente for provisionado.

## 10. Comandos permitidos em desenvolvimento

Pré-requisito: `DIRECT_URL` apontando para um PostgreSQL **local ou descartável**, em `.env.local` (não versionado) ou no ambiente do shell. Nunca uma URL de `preview` ou `production`.

| Comando | Toca o banco? | Uso |
| --- | --- | --- |
| `npx prisma format` / `npx prisma format --check` | Não | Formatar o schema; `--check` falha se houver divergência (adequado a CI) |
| `npx prisma validate` | Não | Validar o schema |
| `npx prisma generate` | Não | Regenerar `src/generated/prisma/`. Também executado automaticamente pelo `postinstall` (seção 5) |
| `npx prisma migrate status` | Sim (leitura) | Comparar o histórico versionado com `_prisma_migrations` |
| `npx prisma migrate dev --create-only --name <nome>` | Sim (shadow database) | Gerar uma migration **sem aplicar**, para revisão e customização |
| `npx prisma migrate dev` | Sim | Aplicar migrations pendentes ao banco descartável (e gerar o client) |
| `npx prisma migrate reset --force` | Sim, **destrutivo** | Recriar o banco descartável do zero e reaplicar o histórico. O CLI 7.10 exige consentimento humano explícito quando detecta execução por agente de IA; a alternativa equivalente é recriar o banco descartável e rodar `migrate dev` |
| `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` | Sim (leitura) | Conferir drift entre o banco e o schema |
| `npx prisma migrate deploy` | Sim | Aplicar o histórico a um banco **vazio ou já migrado**. Em desenvolvimento, apenas para provar reprodutibilidade em banco descartável; em `preview`/`production`, apenas pelo job de CI/CD |

## 11. O que ainda não está implementado

| Item | Estado | Onde fica |
| --- | --- | --- |
| Provisionamento do Neon de `preview` (projeto, branch `preview`, database `troq`) | **concluído por F1-004** | Seção 15.1. `development` continua sendo banco local ou descartável (seção 12); `production` **não existe** |
| `DIRECT_URL` e `DATABASE_URL` como secrets do GitHub Environment `preview` | **concluído por F1-004** | Seção 15.2 |
| `DATABASE_URL` e `APP_ENV=preview` no escopo Preview da Vercel | **concluído por F1-004** | Seção 15.2. Somente Preview; nada em Production; sem `DIRECT_URL` |
| Runtime: instância do Prisma Client com driver adapter, singleton, leitura de `DATABASE_URL` | **concluído por F1-003** | `src/persistence/prisma.ts` (seção 13). Provado contra banco descartável; a prova contra o Neon é executada pelo workflow da seção 15 |
| Workflow controlado executando `prisma migrate deploy` em `preview`, serializado, somente a partir de `main` | **concluído por F1-004; primeira execução aprovada** | `.github/workflows/migrate-preview.yml` (seção 15.3); evidência na seção 15.6. O equivalente de `production`, com aprovação (ADR-0005, decisão 7), depende do provisionamento desse ambiente |
| Validação de migration e execução de `npm run test:integration` em CI de PR contra banco efêmero | **não iniciado** | [testing.md](testing.md), seção 7. A suíte de integração existe (seção 13.7) e roda pós-merge contra o Neon (seção 15); falta o job de PR que sobe um banco efêmero |
| Integrações: Better Auth (e suas tabelas), R2, Resend, Mercado Pago | **não iniciado** | Fases 2 e 3 |
| Módulos de domínio de AR-3.3 e repositórios da camada de persistência | **não iniciado** | Fase 1, E-1. O que existe da camada de persistência é apenas a fronteira de obtenção do client (seção 13) |

Consequência: **E-5 está concluído** — schema, migration, runtime, Neon de `preview`, custódia das conexões, Vercel Preview e workflow existem, e a migration inicial foi aplicada pelo workflow. A **Fase 1 permanece em andamento**: E-1 (módulos de AR-3.3), E-6 (R2 e Resend) e E-7 (observabilidade) continuam por fazer, e o gate de saída da fase não foi formalmente verificado.

## 12. Procedimento de validação sobre banco descartável

Executado integralmente em 2026-09-14 por F1-002 e reexecutável por qualquer pessoa desenvolvedora. Só dados sintéticos; nenhum dado pessoal real; nenhum banco de projeto, `preview` ou `production`.

1. **Subir PostgreSQL descartável** (Docker é o caminho preferencial), por exemplo `postgres:17-alpine`, com usuário, senha e banco criados só para a validação e porta local livre. Definir `DIRECT_URL` correspondente em `.env.local`.
2. **Schema:** `npx prisma format --check`, `npx prisma validate`, `npx prisma generate`. Conferir que `src/generated/prisma/` continua fora do Git (`git status`).
3. **Migration:** `npx prisma migrate dev` aplica o histórico; `npx prisma migrate status` deve responder que o banco está atualizado.
4. **Prova das invariantes por caso negativo**, via `psql` no contêiner, com fixtures temporários (usuários, um anúncio `published`). Mínimo exigido e resultado observado nesta entrega:

   | Caso | Esperado | Observado em 2026-09-14 |
   | --- | --- | --- |
   | Três solicitações nos slots 1, 2 e 3 (`reserved`, `reserved`, `paid`) | coexistem | inseridas |
   | Quarta solicitação em slot já ocupado (`reserved` ou `paid`) | falha | `duplicate key ... contact_requests_listing_slot_occupied_key` |
   | `slot_index` 0 ou 4 | falha | `contact_requests_slot_index_range_check` |
   | Expirar o slot 1 e reservar de novo o slot 1 | permitido; 4 linhas no histórico, 3 ocupando vaga | confirmado |
   | Segunda `PaymentAttempt` para a mesma solicitação | falha | `payment_attempts_contact_request_id_key` |
   | Segundo pagamento canônico para a mesma tentativa | falha; não canônico é aceito | `payments_canonical_per_attempt_key` |
   | Segunda `Selection` para a mesma solicitação | falha | `selections_contact_request_id_key` |
   | Segunda negociação `active` no mesmo anúncio; depois de `closed`, nova `active` | falha; depois permitido | `negotiations_active_per_listing_key`; reseleção entrou |
   | Negociação `closed -> active` | falha | trigger `negotiations_guard_closed` |
   | `ContactRequest` `paid -> expired`, `paid -> failed`, `paid -> reserved`, mudança de `slot_index` em linha `paid` | falha | trigger `contact_requests_guard_paid` (quatro vezes) |
   | Atualizar campo neutro (`updated_at`) de linha `paid` | permitido | confirmado |
   | Nota 0 e nota 6 | falha | `ratings_score_range_check` |
   | Nota 5; segunda nota do mesmo avaliador na mesma negociação; autoavaliação | permitido; falha; falha | `ratings_negotiation_id_evaluator_id_key`; `ratings_distinct_parties_check` |
   | Imagens nas posições 1..6; posição 7; posição 0; posição repetida | permitido; falha; falha; falha | `listing_images_position_range_check` (duas vezes); `listing_images_listing_id_position_key` |
   | Anúncio `published -> draft`; `closed -> published`; `published -> paused` | falha; falha; permitido | trigger `listings_guard_status` (duas vezes) |
   | Histórico de transição com par `(published, draft)` | falha | `listing_transitions_allowed_pair_check` |
   | Email repetido entre contas ativas; repetido após a anterior pedir exclusão | falha; permitido | `users_email_active_key` |
   | Denúncia repetida por (denunciante, anúncio); contestação repetida por decisão; decisão de ofício sem origem; segunda liberação para a mesma negociação | falha | `reports_reporter_id_listing_id_key`; `appeals_moderation_decision_id_key`; `moderation_decisions_origin_check`; `contact_releases_negotiation_id_key` |

5. **Reprodutibilidade:** criar um segundo banco vazio no mesmo contêiner e executar `npx prisma migrate deploy` contra ele com `DIRECT_URL` apontando para o novo banco; `migrate status` deve reportar o histórico aplicado. Em seguida recriar o banco de desenvolvimento (`DROP DATABASE`/`CREATE DATABASE` no contêiner, ou `prisma migrate reset --force` com consentimento humano) e reaplicar com `migrate dev`. Nesta entrega os dois caminhos terminaram com 24 tabelas, 18 enums, 4 índices únicos parciais, 10 `CHECK`s e 3 triggers, e a prova do item 4 foi reexecutada com o mesmo resultado no banco recriado.
6. **Runtime (desde F1-003):** com `DATABASE_URL` apontando para o **mesmo** banco descartável já migrado, executar `npm run test:integration`. A suíte abre conexão pela fronteira da seção 13, executa `SELECT 1`, confere em `_prisma_migrations` que a migration inicial está aplicada e faz `count()` em tabelas do schema, sem escrever nada. Sem `DATABASE_URL` a suíte **falha** (não é pulada). Resultado em 2026-09-14: 5 de 5 casos aprovados sobre PostgreSQL 17.11, depois de `migrate deploy` em banco vazio.
7. **Encerrar e remover** o contêiner e seu volume ao final. Nada da validação é versionado além deste registro.

Prisma Migrate não possui migration `down` como fluxo oficial do projeto; **nenhum rollback produtivo foi implementado**. Reverter uma mudança em ambiente compartilhado é uma **nova** migration, por expand/contract (ADR-0005, decisão 9).

## 13. Runtime do Prisma Client — a fronteira de persistência

Produzido por **F1-003**, terceiro trabalho da Fase 1 e segunda parte de E-5. É a **fronteira mínima** entre a aplicação e o PostgreSQL: o único ponto que instancia o Prisma Client, conforme a camada de persistência de [../architecture/overview.md](../architecture/overview.md), AR-3.2 ("único lugar que fala Prisma/SQL"). Repositórios de domínio, transações e casos de uso **não** existem ainda; eles serão consumidores desta fronteira.

### 13.1 Localização e superfície pública

| Item | Valor |
| --- | --- |
| Arquivo | `src/persistence/prisma.ts` |
| Exporta | `getPrismaClient(): PrismaClient` e o tipo `PrismaClient` (re-export do client gerado) |
| Importa o Prisma Client de | `src/generated/prisma/client` — exclusivamente; nenhum outro arquivo da aplicação importa o client gerado |
| Diretório | `src/persistence/` recebe o nome da camada de AR-3.2. Não é módulo de AR-3.3 e não cria a estrutura desses módulos |

A superfície é deliberadamente mínima. Um módulo de domínio futuro obtém o client por `getPrismaClient()`; nenhum Route Handler, Server Action ou componente monta consulta direta ([conventions.md](conventions.md), seção 2.1).

### 13.2 Driver adapter e versões

Fatos apurados em **2026-09-14** na documentação oficial do Prisma ORM 7 (guia de upgrade para a versão 7, página de PostgreSQL, página de driver adapters, guia de conexões em serverless e página de pool de conexões) e do Neon (connection pooling, guia de Prisma, serverless driver):

1. **Prisma 7 exige driver adapter** para toda instância de `PrismaClient` ("the way to create a new Prisma Client has changed to require a driver adapter for all databases"). O CLI não exige.
2. O adapter PostgreSQL oficial sobre TCP é **`@prisma/adapter-pg`**, que usa o driver `pg` (node-postgres). Construção: `new PrismaPg({ connectionString })`, passado em `new PrismaClient({ adapter })`.
3. **O pool de conexões pertence ao driver**, não ao Prisma: com adapter, "connection pooling defaults (and configuration) now come from the driver itself". Para `pg`, `max` padrão é **10**.
4. Em serverless (Vercel), a instância deve ser criada **fora do handler** para ser reutilizada, e **não** se chama `$disconnect()` ao fim da invocação, porque o contêiner pode ser reaproveitado.
5. A URL **pooled** é para o runtime e a **direta** para o CLI — "Use separate URLs for CLI (direct) and runtime (pooled)".
6. O endpoint pooled do Neon é **PgBouncer em modo transação** e não suporta recursos de sessão (`SET`, `LISTEN/NOTIFY`, `PREPARE` em SQL, cursores `WITH HOLD`); conexão direta é para migrations e administração ([ADR-0006](../adr/0006-async-work-scheduling-concurrency.md), N-1). Transações do Prisma continuam válidas porque cada transação ocupa uma única conexão de servidor do início ao fim. O adapter 7.10.0 não nomeia prepared statements por padrão (a opção `statementNameGenerator` é opcional e ausente), o que evita o cache de statements entre conexões que o modo transação não suporta.

| Pacote | Versão | Tipo | Motivo |
| --- | --- | --- | --- |
| `@prisma/adapter-pg` | `7.10.0` (exata; `latest` no npm em 2026-09-14) | runtime | Driver adapter exigido pelo Prisma 7; mesma versão do `@prisma/client` |
| `pg` | `8.23.0` (exata; `latest`; dentro do intervalo `^8.16.3` exigido pelo adapter) | runtime | Driver PostgreSQL efetivamente usado. Declarado diretamente para ficar pinado e visível, e não apenas transitivo |

**Por que `@prisma/adapter-pg` e não `@prisma/adapter-neon`.** O guia do Neon para Prisma recomenda `@prisma/adapter-neon`, que "routes queries over WebSockets for compatibility with serverless environments"; a documentação do Prisma lista os dois como adapters oficiais. A escolha do TROQ é o `pg` por três razões, nenhuma delas contrariada por fato oficial: (a) o Neon é **provedor, não vocabulário** da camada de persistência ([ADR-0002](../adr/0002-postgresql-neon.md); RNF-017) — o `pg` fala com qualquer PostgreSQL, inclusive o descartável da seção 12, sem trocar de adapter; (b) as funções da Vercel usadas pelo TROQ rodam no runtime **Node.js**, onde TCP está disponível, e o driver WebSocket do Neon existe para runtimes de edge, que o projeto não usa; (c) [ADR-0005](../adr/0005-prisma-orm-migrations.md), decisão 10, já fixa a combinação "pooled no runtime, direta no CLI", que o `pg` atende sem SDK do provedor. Trocar para o adapter do Neon, se algum dia houver razão medida, custa a reescrita desta fronteira e nova decisão registrada — não do domínio.

### 13.3 Variáveis lidas

| Variável | Lida por esta fronteira? | Observação |
| --- | --- | --- |
| `DATABASE_URL` | **Sim** — única variável lida | Passada integralmente ao `PrismaPg` como `connectionString`. Nenhum valor ou host está no código |
| `DIRECT_URL` | **Não** | Exclusiva do CLI, via `prisma.config.ts` (seção 4.1) |

A fronteira **não** carrega `.env*`: em `development`, o próprio Next.js carrega `.env.local` para `next dev`/`next build`/`next start`; em `preview` e `production`, o valor vem do ambiente da plataforma ([environments.md](environments.md), seção 6.1). Os testes definem a variável explicitamente. Parâmetros de conexão que o Neon recomenda na **URL** (por exemplo `sslmode=require` e `connect_timeout` para o cold start do compute) são conteúdo do valor da variável, definidos quando o Neon for provisionado, e não configuração de código.

### 13.4 Inicialização lazy e comportamento sem `DATABASE_URL`

- **Importar o módulo não exige a variável e não toca o banco.** `npm run build`, `lint`, `typecheck`, `test:ci` e `prisma generate` rodam sem `DATABASE_URL` (comprovado na validação de F1-003). Isso não é um parser geral de variáveis de ambiente, que continua fora de escopo.
- **A variável só é lida quando um client é pedido.** `getPrismaClient()` sem `DATABASE_URL` lança `Error` cuja mensagem **nomeia a variável e nunca o valor** ("`DATABASE_URL` nao definida: o runtime nao pode abrir conexao com o PostgreSQL ..."). Nenhuma connection string atravessa erro ou log ([environments.md](environments.md), seção 6.5).
- **Chamar `getPrismaClient()` não abre conexão.** O `PrismaPg` só cria o `pg.Pool` no primeiro `connect()` interno do Prisma, e a primeira conexão TCP só é aberta na primeira consulta — fato conferido no código do adapter 7.10.0.

### 13.5 Instância única e reuso

- A instância vive em **`globalThis`**, sob a chave `__troqPrismaClient`, e é criada na primeira chamada. Chamadas seguintes devolvem a mesma instância — e o mesmo pool.
- **Desenvolvimento:** o hot reload do Next.js reavalia módulos, mas não o objeto global; guardar a instância nele é o mecanismo recomendado pela documentação do Prisma para não multiplicar clients a cada recarga. O teste unitário prova que uma reavaliação do módulo devolve a mesma instância.
- **Produção (Vercel, Node.js):** cada instância de função cria um client na primeira requisição e o reutiliza enquanto viver. Não há `$disconnect()` por request. O tamanho do pool é o padrão do `pg` (`max = 10`), porque o runtime fala com o **pooler** do Neon, que absorve muitas conexões curtas; reduzi-lo é ajuste por medição, não decisão desta entrega. A função `attachDatabasePool` do pacote `@vercel/functions`, que a documentação do Prisma cita para o Fluid compute da Vercel, **não** foi adotada: é dependência do provedor de deploy e fica registrada como pendência a avaliar quando houver ambiente hospedado com banco.
- **Trava consultiva:** nada nesta fronteira usa `pg_advisory_lock` de sessão, proibido por ADR-0006, decisão 6. A regra continua valendo para todo consumidor futuro.

### 13.6 Exclusivamente server-side

O módulo lê um segredo e abre TCP; ele **não pode** ser importado por Client Component ([conventions.md](conventions.md), seção 3.2). Isso é verificado pelo próprio build, e não só por disciplina: em 2026-09-14 um Client Component temporário que importava `src/persistence/prisma.ts` fez `next build` falhar com sete erros `Module not found: Can't resolve 'dns' | 'fs' | 'net' | 'tls' | 'util/types'` no bundle de cliente, porque o `pg` depende de módulos do Node. O arquivo temporário foi removido e não está versionado. Nenhum código de produto importa a fronteira ainda: `src/app/page.tsx` continua estático.

### 13.7 Testes

| Arquivo | Nível | Roda em | O que prova |
| --- | --- | --- | --- |
| `src/persistence/prisma.test.ts` | unitário, sem banco | `npm run test:ci` | importar sem `DATABASE_URL` não lança; pedir o client sem a variável falha com erro controlado que não contém connection string; duas chamadas devolvem a mesma instância; a instância sobrevive à reavaliação do módulo |
| `src/persistence/prisma.integration.test.ts` | integração, PostgreSQL real | `npm run test:integration`, com `DATABASE_URL` para banco descartável migrado | conexão real, `SELECT 1`, migration inicial em `_prisma_migrations`, `count()` em `users`, `listings` e `contact_requests` sem escrever, reuso entre consultas |

`npm run test:integration` usa `vitest.integration.config.mts` (ambiente `node`, sem jsdom, arquivos em série). A suíte de integração fica **fora** de `test:ci` para que o CI atual continue determinístico sem banco ([testing.md](testing.md), seção 7); quando o job de banco efêmero existir (seção 11), é esse comando que ele executará. Sem `DATABASE_URL`, a suíte de integração **falha explicitamente** — não é pulada.

## 14. Rastreabilidade

| Item | Efeito deste documento |
| --- | --- |
| F1-002 | Entrega: Prisma 7.10.0 pinado, `prisma.config.ts`, `schema.prisma`, migration inicial, este documento |
| F1-003 | Entrega: `@prisma/adapter-pg` e `pg` pinados, fronteira `src/persistence/prisma.ts`, testes unitários e de integração, `npm run test:integration`, seção 13 deste documento |
| F1-004 | Entrega: Neon de `preview` provisionado (São Paulo, PostgreSQL 17, branch `preview`, database `troq`), GitHub Environment `preview` restrito a `main` com os secrets `DIRECT_URL` e `DATABASE_URL`, `DATABASE_URL` e `APP_ENV` no escopo Preview da Vercel, workflow `.github/workflows/migrate-preview.yml` com a primeira execução aprovada, seção 15 deste documento |
| E-5 ([../delivery/phase-1-transition.md](../delivery/phase-1-transition.md), seção 10) | **Concluído**: schema, migration e runtime do Prisma Client (F1-002 e F1-003), Neon de `preview`, custódia das conexões e workflow de `migrate deploy` com a migration inicial aplicada (F1-004). Produção continua fora: não há banco nem job de `production` |
| [../architecture/data-model.md](../architecture/data-model.md) | Materializado; I-1, I-2, I-5, I-6 e I-8 como garantias reais de banco (seção 7.1); nenhuma entidade `Interest` |
| [ADR-0005](../adr/0005-prisma-orm-migrations.md) | Executado na prática pela primeira vez: pin exato, `--create-only` + SQL editado, `migrate dev` só em descartável, `migrate deploy` provado em banco vazio. A revisão prevista na sua política de evolução ("revisitada quando a Fase 1 criar o primeiro schema") está registrada aqui: a política mostrou-se executável |
| [ADR-0002](../adr/0002-postgresql-neon.md) | Preservado: PostgreSQL padrão, sem extensão e sem recurso do provedor |
| [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md), decisão 7 | Aplicada: restrição de banco é a garantia; trava é comportamento da futura transação |
| [environments.md](environments.md) | `DIRECT_URL` (F1-002) e `DATABASE_URL` (F1-003) têm consumidor real e, desde F1-004, valores reais de `preview` sob custódia do GitHub Environment; as demais variáveis continuam `previsto` |
| R-07 | Passa de teórico a exercitável (histórico versionado) e, com F1-004, a **exercitado**: o único caminho para o Neon de `preview` é o workflow da seção 15 |
| R-08 | O Neon deixa de ser escolha documental e passa a ser dependência operacional de `preview` (seção 15.1) |
| Gate da Fase 1 | O critério "invariantes atribuídas a restrição de banco materializadas no schema inicial" tem evidência; os demais critérios continuam por verificar |

## 15. Neon de `preview` e deployment controlado de migrations

Produzido por **F1-004**, quarto trabalho da Fase 1 e terceira parte de E-5. Materializa, para o ambiente `preview` de [environments.md](environments.md), seção 2.2, a decisão 7 de [ADR-0005](../adr/0005-prisma-orm-migrations.md): `migrate deploy` por job controlado de CI/CD, serializado, fora do build e fora de qualquer função da aplicação. Nada aqui cria, configura ou pressupõe `production`.

### 15.1 Recurso provisionado

| Item | Valor | Observação |
| --- | --- | --- |
| Provedor | Neon ([ADR-0002](../adr/0002-postgresql-neon.md)) | Conta de Bruno; organização Neon `TechLab PreConsulta`, plano **Free**, gerida pelo console — a única das organizações existentes que é gratuita **e** não é gerida pela integração de marketplace da Vercel. Não existia organização própria do TROQ e a API não cria organizações; mover o projeto para uma organização dedicada é ação de painel, não bloqueia nada e fica registrada como opção |
| Projeto | `techlab-troq-preview` | Criado em 2026-09-15, exclusivamente para `preview`. Nenhum plano foi contratado ou elevado |
| Região | AWS South America East 1 (São Paulo), `aws-sa-east-1` | Conferida na lista de regiões da conta antes da criação; a região de um projeto Neon não pode ser alterada depois |
| PostgreSQL | major **17** (17.11 observado) | Escolhida explicitamente: o padrão da conta em 2026-09-15 seria 18 |
| Branch | `preview` | Criada como branch inicial do projeto, com esse nome, e é a branch padrão. O painel do Neon rotula a branch padrão de um projeto como *production branch*: é terminologia do provedor para "branch primária do projeto" e **não** torna este recurso o ambiente `production` do TROQ, que não existe |
| Database | `troq` | Owner `troq_owner`, role criado pelo provedor |
| Compute | 0,25 CU fixo, suspensão automática padrão do plano | Suficiente para `preview`; o primeiro acesso após suspensão paga o cold start do compute |
| Dados | apenas o schema; nenhuma linha de produto, nenhum dado pessoal | O workflow não faz seed; a suíte de integração é somente leitura |
| Extensões e recursos proprietários | nenhum | O schema não exige extensão (seção 3). Nenhum branching por Pull Request, nenhuma integração Neon–Vercel, nenhum recurso do Neon é dependência de arquitetura (ADR-0005, "Recursos exclusivos") |

### 15.2 Conexões e custódia

As duas strings foram obtidas do provedor tal como ele as gera (com `sslmode=require` e `channel_binding=require`), sem edição de host ou senha, e nenhuma delas está — nem pode estar — em arquivo versionado, PR, commit, relatório ou log.

| Variável | Endpoint | Onde vive em `preview` | Quem lê |
| --- | --- | --- | --- |
| `DIRECT_URL` | **direto** (host sem sufixo `-pooler`) | **Somente** secret do GitHub Environment `preview` | `prisma.config.ts`, no workflow da seção 15.3 (`migrate deploy`, `migrate status`) |
| `DATABASE_URL` | **pooled** (host com sufixo `-pooler`, PgBouncer em modo transação) | Secret do GitHub Environment `preview` **e** variável do projeto Vercel `techlab-troq` no escopo **Preview** (tipo sensível: o valor não é exibido no painel), ao lado de `APP_ENV=preview` | `src/persistence/prisma.ts`: no workflow, pela suíte de integração; na Vercel, pelo runtime hospedado |

Regras que decorrem da custódia: a conexão direta **não** existe na Vercel; nenhuma das duas existe no escopo Production da Vercel nem como secret de repositório do GitHub; os secrets são de **environment**, e o environment `preview` só libera secrets para jobs originados de `main` (política de branch de deployment com a única entrada `main`, sem revisores e sem tempo de espera). Uma observação factual: o GitHub trata nomes de environment sem distinção de maiúsculas, e o environment `Preview` já existia, criado pelos registros de deployment da integração da Vercel; `preview` é, portanto, esse mesmo environment, agora restrito a `main`.

Fato verificado em 2026-09-15 sobre o driver: o `pg` 8.23 trata `sslmode=require` como `verify-full` e emite um aviso a respeito na conexão. Isso **não** é erro — o certificado do Neon é válido para o host — e não altera o contrato; a string permanece a do provedor.

### 15.3 Workflow `.github/workflows/migrate-preview.yml`

| Item | Contrato |
| --- | --- |
| Nome | `Migrations de preview (Neon)`; job `Aplicar migrations no Neon de preview`. Nomes distintos do required status check, que **não** muda |
| Gatilhos | `push` em `main`, filtrado por caminho (migrations, `schema.prisma`, `prisma.config.ts`, `package.json`, `package-lock.json`, `src/persistence/**`, `vitest.integration.config.mts` e o próprio workflow) e `workflow_dispatch`. **Nenhum** gatilho de Pull Request |
| Guarda | `if: github.ref == 'refs/heads/main'` no job, além do gatilho e da política do environment |
| Permissões | `contents: read` |
| Environment | `preview` — origem exclusiva de `DIRECT_URL` e `DATABASE_URL`, expostas como variáveis do job |
| Serialização | grupo de concorrência `migrate-preview`, `cancel-in-progress: false`: uma execução por vez, nunca cancelada por outra |
| Runner e toolchain | `ubuntu-latest`, `actions/checkout@v5`, `actions/setup-node@v5` com Node.js 24 e cache npm, `npm ci` — os mesmos do CI de validação |
| Limite | `timeout-minutes: 15` |
| Passos, nesta ordem | verificação de presença dos dois secrets (nome e status, nunca o valor); `npm ci`; `npx prisma migrate deploy`; `npx prisma migrate status`; `npm run test:integration`. Qualquer falha falha o job; sem `continue-on-error`, sem retry |
| O que não contém | comando de desenvolvimento do Prisma Migrate, `db push`, SQL destrutivo, seed, credencial literal, conexão de produção, migration em build ou em Pull Request |

O workflow **não** é required status check: ele executa depois do merge e não substitui o CI da PR ([testing.md](testing.md), seção 7). Torná-lo obrigatório bloquearia toda PR à espera de um check que só existe em `main`.

### 15.4 Por que somente a partir de `main`, e o que isso limita

O banco de `preview` é **único e compartilhado** por todos os deployments de preview da Vercel, e o seu schema acompanha `main`. Consequências deliberadas: (a) uma PR que altere migration só a vê aplicada em `preview` depois do merge — antes disso, a prova é local, em banco descartável (seção 12), e o deploy de preview da própria PR roda contra o schema de `main`; (b) uma migration incompatível com a versão anterior da aplicação quebra os previews até o merge da correção — exatamente o motivo pelo qual mudanças destrutivas seguem expand/contract (ADR-0005, decisão 9); (c) não há banco por PR nem branching efêmero do Neon, por decisão de escopo e por ADR-0005. Esta limitação é aceita para o MVP e será revista apenas por decisão registrada.

### 15.5 Validações executadas por F1-004 antes do merge

- `SELECT 1`, `SHOW server_version` e `current_database()` nas **duas** conexões, a partir da máquina do executor, com o driver `pg` já adotado: ambas responderam; versão 17.11; database `troq`; tabela `_prisma_migrations` ausente (banco vazio). Nenhuma migration foi aplicada nessa verificação.
- Conferência estrutural das strings do provedor: esquema `postgresql`, sufixo `-pooler` presente apenas na pooled, parâmetros `sslmode` e `channel_binding` presentes nas duas, região `sa-east-1` no host.
- Presença dos secrets por nome no environment `preview`; ausência de secrets de repositório; política de branch com a única entrada `main`.
- Vercel, por API e apenas por nome, escopo e tipo: o projeto `techlab-troq` não tinha nenhuma variável; após F1-004 tem exatamente `APP_ENV` (`preview`, plain) e `DATABASE_URL` (`preview`, sensível); nenhuma no escopo Production; nenhum `DIRECT_URL`. Um redeploy do último deployment de preview da PR foi disparado depois da configuração — variável nova não vale para deployment anterior — e terminou em `READY`.
- Localmente, sem credencial real: `format:check`, `lint`, `typecheck`, `test:ci`, `build`, `prisma format --check`, `prisma validate`, `prisma generate` e `git diff --check`.

### 15.6 Primeira execução do workflow — evidência e imutabilidade

A primeira execução sobre `main` foi disparada pelo squash merge da PR de F1-004, cujo diff inclui o próprio workflow e por isso satisfaz o filtro de caminhos. Execução de referência: workflow `Migrations de preview (Neon)`, run `34968277499`, evento `push` sobre `main` no commit `ae6e6f0` (squash merge da PR #28), 2026-09-15, job `Aplicar migrations no Neon de preview` concluído com sucesso em 1m14s; passos `Verificar presença dos secrets do environment`, `Instalar dependências`, `Aplicar migrations pendentes (migrate deploy)`, `Conferir histórico de migrations (migrate status)` e `Prova de integração do runtime contra o banco migrado` todos `success`. `migrate deploy`: 1 migration encontrada, `20260914210926_initial_schema` aplicada; `migrate status`: "Database schema is up to date!"; `test:integration`: 1 arquivo, **5 de 5** casos aprovados em 3,4s contra o endpoint pooled. Conferência posterior no banco, por consulta somente leitura: uma linha em `_prisma_migrations`, com `finished_at` preenchido, sem rollback, `applied_steps_count = 1` e sem log de erro; 24 tabelas, 18 enums e 3 triggers no schema `public`; zero linhas em `users`, `listings` e `contact_requests`.

**Desde essa execução a migration inicial é imutável** (seção 5). F1-004 não alterou `prisma/schema.prisma` nem nenhum `migration.sql`, o que foi conferido por hash antes e depois da entrega. Duas observações do log, registradas para não surpreender: o Prisma CLI imprime o host do datasource (sem usuário nem senha) ao carregar a configuração, e o GitHub mascara os secrets como `***`; e o CLI 7.10 exibe um aviso de atualização para a linha 8, que **não** é adotada (ADR-0005, política de evolução).

Nas execuções seguintes, uma falha não altera `main` diretamente: o diagnóstico vira PR corretiva dentro do escopo, e uma correção que exigisse alterar migration já aplicada significa **nova** migration (ADR-0005, decisão 5).

### 15.7 O que fica fora de F1-004

F1-004 **não** tem pendência própria. Continuam fora do seu escopo, e registrados na seção 11: o banco, o environment e o job com aprovação de `production` (ADR-0005, decisão 7), a validação de migration em CI de PR contra banco efêmero ([testing.md](testing.md), seção 7) e a avaliação de `attachDatabasePool` para o Fluid compute da Vercel (seção 13.5), agora que existe ambiente hospedado com banco.

Nota de acesso, registrada para não ser reaberta por suposição: o executor só conseguiu configurar a Vercel depois de o CLI da Vercel ser autenticado nesta máquina por Bruno; o token de Vercel presente no ambiente do executor pertence a outro time e o conector Vercel disponível não expõe operação de variáveis de ambiente.

## 16. Revisão

Revisado a cada migration nova, quando `production` for provisionado (banco, environment e job com aprovação), quando a Vercel Preview receber `DATABASE_URL`, quando a fronteira de runtime mudar de adapter ou de estratégia de reuso, quando o workflow da seção 15 mudar de contrato, ou quando [../architecture/data-model.md](../architecture/data-model.md) mudar.
