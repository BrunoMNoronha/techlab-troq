# Banco de dados — Prisma, schema físico e migrations — TROQ

Fonte de engenharia da **materialização física** do banco de dados. Produzido por **F1-002**, o segundo trabalho da Fase 1, como a primeira parte do entregável E-5 de [../delivery/phase-1-transition.md](../delivery/phase-1-transition.md), seção 10.

Este documento **não duplica** o modelo lógico: entidades, relações, cardinalidades, estados e invariantes estão em [../architecture/data-model.md](../architecture/data-model.md), e a política de migrations está em [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md). Aqui ficam apenas as decisões **físicas** — o que foi escolhido para representar o modelo no PostgreSQL —, o que o Prisma Schema consegue expressar e o que exigiu SQL customizado, e o procedimento de validação. Em caso de conflito com ADR, decisão registrada ou documento de arquitetura, **prevalece a fonte de nível superior** ([ai-agent-workflow.md](ai-agent-workflow.md), seção 2) e este documento deve ser corrigido.

## 1. Escopo

**Faz:** registra o Prisma adotado e a versão efetivamente instalada, a estrutura dos arquivos, a separação entre conexão pooled e direta, as convenções físicas (nomes, identificadores, instantes, dinheiro, tipos de texto, ações referenciais), como a migration inicial materializa as invariantes de restrição de banco, quais garantias vivem no Prisma Schema e quais exigem SQL customizado, os comandos permitidos em desenvolvimento e o procedimento de validação sobre banco descartável.

**Não faz:** não provisiona Neon nem cria credencial; não cria singleton de Prisma Client, adaptador de runtime nem qualquer leitura de `DATABASE_URL` por código; não cria o job de CI/CD de `prisma migrate deploy`; não integra Better Auth, R2, Resend ou Mercado Pago; não cria os módulos de domínio de AR-3.3; não implementa funcionalidade de produto; não altera regra de negócio, requisito, ADR ou decisão vigente.

**Estado factual na data desta versão (2026-09-14).** O repositório contém `prisma.config.ts`, `prisma/schema.prisma` e a migration inicial versionada. A migration foi validada **apenas contra PostgreSQL local e descartável** (seção 12). **Nenhum banco Neon foi provisionado**, nenhuma migration foi aplicada em ambiente compartilhado e nenhum código de runtime abre conexão com banco. E-5 permanece **parcial**.

## 2. Prisma adotado

| Item | Valor |
| --- | --- |
| ORM e ferramenta de migrations | Prisma ORM e Prisma Migrate ([ADR-0005](../adr/0005-prisma-orm-migrations.md), DEC-026) |
| Linha | **7.x estável**, pinada em versão exata |
| Versão instalada | `prisma@7.10.0` (`devDependencies`) e `@prisma/client@7.10.0` (`dependencies`), sem `^`, `~` ou `@latest`; lockfile versionado |
| Verificação na instalação (2026-09-14) | No registro npm, `prisma@latest` resolvia para `8.0.0-rc.15` (release candidate) e `prev` para `7.10.0`; `@prisma/client@latest` resolvia para `7.10.0`. **Não existe 7.x posterior a 7.10.0.** A linha 8 não foi adotada, conforme a política de evolução de ADR-0005 |
| Generator | `provider = "prisma-client"` — o generator da linha 7 —, com `output = "../src/generated/prisma"` explícito |
| Preview features | **Nenhuma.** Em particular, `partialIndexes` **não** está habilitada, embora exista em Preview na 7.10: o projeto prioriza superfície estável e materializa índices parciais por SQL na migration (seção 8) |
| Motor | Prisma 7 usa Query Compiler (sem engine Rust em runtime); o CLI traz o Schema Engine próprio. Nenhum driver adapter foi instalado, porque **não há runtime** nesta entrega e o CLI **não** exige adapter para operações de schema |

Atualizações de minor e patch dentro de 7.x seguem a política de ADR-0005: atualização do pin e do lockfile em PR própria, sem ADR. Adoção da linha 8 exige **nova ADR**.

## 3. PostgreSQL

O banco é **PostgreSQL padrão**, conforme [ADR-0002](../adr/0002-postgresql-neon.md). O schema físico e a migration usam apenas recursos do PostgreSQL core: tipos `uuid`, `timestamptz`, `text`, `varchar`, `char`, `integer`, `boolean`, `jsonb`, enums nativos, índices únicos parciais, `CHECK`, funções `sql`/`plpgsql` e triggers. **Nenhuma extensão** é criada e **nenhum recurso proprietário do Neon** (branching, por exemplo) é usado ou pressuposto.

A validação desta entrega usou PostgreSQL **17.11** em contêiner descartável (seção 12). Isso é a versão do ambiente executor, **não** um pin de produção: qualquer versão estável suportada pelo Prisma 7 serve.

## 4. Conexões: `DATABASE_URL` pooled e `DIRECT_URL` direta

A separação é a de [ADR-0005](../adr/0005-prisma-orm-migrations.md), decisão 10, e do contrato de [environments.md](environments.md), seção 5.2:

| Variável | Quem consome hoje | Para quê |
| --- | --- | --- |
| `DIRECT_URL` | **`prisma.config.ts`**, lida pelo Prisma CLI (`migrate dev`, `migrate deploy`, `migrate status`, `migrate reset`, `migrate diff`) | Conexão **direta, não pooled**, para operações de schema. É o **único consumidor real** de variável de ambiente criado por F1-002 |
| `DATABASE_URL` | **Ninguém, ainda.** Continua `previsto` | Conexão **pooled** do runtime da aplicação, quando o Prisma Client for instanciado com driver adapter em trabalho futuro |

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
```

- `src/generated/prisma/` está em `.gitignore`, `.prettierignore` e nos `ignores` do ESLint. Ele é recriado por `npx prisma generate` e **não** entra em commit.
- O `datasource` do schema declara apenas `provider = "postgresql"`; a URL vive exclusivamente em `prisma.config.ts` (regra da linha 7).
- Migrations são **imutáveis depois de aplicadas em ambiente compartilhado** (ADR-0005, decisão 5). Como nenhuma foi aplicada fora de banco descartável, a inicial ainda poderia ser reescrita em PR própria; a partir do primeiro `migrate deploy` em `preview` ou `production`, corrigir significa **nova** migration.

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

`prisma migrate dev` e `prisma migrate reset` são igualmente restritos a banco local ou descartável (decisão 6). `prisma migrate deploy` é o único mecanismo autorizado para ambiente compartilhado e será executado por **job controlado de CI/CD**, ainda não criado (seção 11).

## 10. Comandos permitidos em desenvolvimento

Pré-requisito: `DIRECT_URL` apontando para um PostgreSQL **local ou descartável**, em `.env.local` (não versionado) ou no ambiente do shell. Nunca uma URL de `preview` ou `production`.

| Comando | Toca o banco? | Uso |
| --- | --- | --- |
| `npx prisma format` / `npx prisma format --check` | Não | Formatar o schema; `--check` falha se houver divergência (adequado a CI) |
| `npx prisma validate` | Não | Validar o schema |
| `npx prisma generate` | Não | Regenerar `src/generated/prisma/` |
| `npx prisma migrate status` | Sim (leitura) | Comparar o histórico versionado com `_prisma_migrations` |
| `npx prisma migrate dev --create-only --name <nome>` | Sim (shadow database) | Gerar uma migration **sem aplicar**, para revisão e customização |
| `npx prisma migrate dev` | Sim | Aplicar migrations pendentes ao banco descartável (e gerar o client) |
| `npx prisma migrate reset --force` | Sim, **destrutivo** | Recriar o banco descartável do zero e reaplicar o histórico. O CLI 7.10 exige consentimento humano explícito quando detecta execução por agente de IA; a alternativa equivalente é recriar o banco descartável e rodar `migrate dev` |
| `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` | Sim (leitura) | Conferir drift entre o banco e o schema |
| `npx prisma migrate deploy` | Sim | Aplicar o histórico a um banco **vazio ou já migrado**. Em desenvolvimento, apenas para provar reprodutibilidade em banco descartável; em `preview`/`production`, apenas pelo job de CI/CD |

## 11. O que ainda não está implementado

| Item | Estado | Onde fica |
| --- | --- | --- |
| Provisionamento do Neon (projeto, branches `development`/`preview`/`production`, credenciais) | **não iniciado** | Trabalho próprio da Fase 1; F1-002 não acessou nem provisionou o Neon |
| Configuração de `DATABASE_URL`/`DIRECT_URL` em painel (Vercel, segredo de CI/CD) | **não iniciado** | Depende do provisionamento |
| Runtime: instância do Prisma Client com driver adapter (`@prisma/adapter-pg` ou equivalente), singleton, leitura de `DATABASE_URL` | **não iniciado** | Trabalho próprio; hoje `DATABASE_URL` não tem consumidor |
| Job controlado de CI/CD executando `prisma migrate deploy`, serializado, com aprovação para produção | **não iniciado** | ADR-0005, decisão 7 |
| Validação de migration em CI de PR contra banco efêmero | **não iniciado** | [testing.md](testing.md), seção 7 |
| Integrações: Better Auth (e suas tabelas), R2, Resend, Mercado Pago | **não iniciado** | Fases 2 e 3 |
| Módulos de domínio de AR-3.3 e camada de persistência | **não iniciado** | Fase 1, E-1 |

Consequência: **E-5 permanece parcial** e a **Fase 1 permanece em andamento**.

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
6. **Encerrar e remover** o contêiner e seu volume ao final. Nada da validação é versionado além deste registro.

Prisma Migrate não possui migration `down` como fluxo oficial do projeto; **nenhum rollback produtivo foi implementado**. Reverter uma mudança em ambiente compartilhado é uma **nova** migration, por expand/contract (ADR-0005, decisão 9).

## 13. Rastreabilidade

| Item | Efeito deste documento |
| --- | --- |
| F1-002 | Entrega: Prisma 7.10.0 pinado, `prisma.config.ts`, `schema.prisma`, migration inicial, este documento |
| E-5 ([../delivery/phase-1-transition.md](../delivery/phase-1-transition.md), seção 10) | Passa de `não iniciado` a **parcial**: schema e migration existem; Neon e job de `migrate deploy` não |
| [../architecture/data-model.md](../architecture/data-model.md) | Materializado; I-1, I-2, I-5, I-6 e I-8 como garantias reais de banco (seção 7.1); nenhuma entidade `Interest` |
| [ADR-0005](../adr/0005-prisma-orm-migrations.md) | Executado na prática pela primeira vez: pin exato, `--create-only` + SQL editado, `migrate dev` só em descartável, `migrate deploy` provado em banco vazio. A revisão prevista na sua política de evolução ("revisitada quando a Fase 1 criar o primeiro schema") está registrada aqui: a política mostrou-se executável |
| [ADR-0002](../adr/0002-postgresql-neon.md) | Preservado: PostgreSQL padrão, sem extensão e sem recurso do provedor |
| [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md), decisão 7 | Aplicada: restrição de banco é a garantia; trava é comportamento da futura transação |
| [environments.md](environments.md) | `DIRECT_URL` ganha consumidor real; `DATABASE_URL` continua `previsto` |
| R-07 | Passa de teórico a exercitável: existe histórico versionado a proteger |
| Gate da Fase 1 | O critério "invariantes atribuídas a restrição de banco materializadas no schema inicial" tem evidência; os demais critérios continuam por verificar |

## 14. Revisão

Revisado a cada migration nova, quando o Neon for provisionado, quando o runtime do Prisma Client for criado, quando o job de `migrate deploy` existir, ou quando [../architecture/data-model.md](../architecture/data-model.md) mudar.
