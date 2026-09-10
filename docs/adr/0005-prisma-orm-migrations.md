# ADR-0005 — Prisma ORM e Prisma Migrate como estratégia de acesso a dados e migrations

## Status

Aceito — Fase 0 (2026-09-07). Fecha [OD-09](../decisions/open-decisions.md) e é a fonte oficial de DEC-026.

## Contexto

PostgreSQL é o banco relacional do projeto e Neon é o provedor preferencial ([ADR-0002](0002-postgresql-neon.md), DEC-009, DEC-010), com a restrição explícita de usar PostgreSQL padrão e evitar acoplamento a recursos exclusivos do provedor. A aplicação é um monólito modular em Next.js + TypeScript com deploy na Vercel ([ADR-0001](0001-modular-monolith-nextjs.md), DEC-007, DEC-008, DEC-011).

Faltava decidir como o código acessa esse banco e, sobretudo, como o schema evolui. Enquanto a questão permaneceu aberta, nenhum schema e nenhuma migration podiam ser criados, e o risco R-07 ([../delivery/risks.md](../delivery/risks.md)) — migrations sem estratégia definida, com possibilidade de alterações manuais ou destrutivas em produção — permanecia sem mitigação.

O domínio exige garantias fortes: limite de 3 solicitações pagas por anúncio sob concorrência (RB-003), liberação de contato apenas ao escolhido com pagamento aprovado (RB-001) e idempotência de webhook de pagamento. Essas garantias serão implementadas com transações e restrições do próprio PostgreSQL (ADR-0002); a ferramenta escolhida aqui precisa permitir expressá-las, não substituí-las.

Esta ADR **não** define modelo de dados, não cria schema, não cria migrations e não instala dependências. Ela define a decisão que torna esse trabalho possível sem nova decisão fundamental.

## Drivers arquiteturais

| # | Driver | Origem |
| --- | --- | --- |
| D-1 | PostgreSQL padrão; troca de provedor deve permanecer viável | ADR-0002, DEC-009, DEC-010 |
| D-2 | Migrations versionadas, auditáveis e reprodutíveis entre ambientes | R-07 |
| D-3 | Nenhuma alteração de schema aplicada de forma implícita ou automática em produção | R-07 |
| D-4 | Compatibilidade com execução serverless na Vercel e com conexões do Neon | ADR-0001, DEC-011 |
| D-5 | Tipagem forte em TypeScript, para reduzir erro em regras críticas (RB-001, RB-003, RB-004) | ADR-0001 |
| D-6 | Capacidade de escrever SQL explícito quando a regra exigir (bloqueios, restrições parciais, `ON CONFLICT`) | ADR-0002, RB-003 |
| D-7 | Maturidade e estabilidade da ferramenta; equipe pequena, sem margem para churn de API | [../delivery/risks.md](../delivery/risks.md), R-08 |

## Alternativas consideradas

Foram comparadas três alternativas.

### A — Prisma ORM + Prisma Migrate

ORM com schema declarativo próprio, cliente TypeScript gerado e ferramenta de migrations integrada que produz arquivos SQL versionados, com histórico registrado na tabela `_prisma_migrations` do próprio banco.

### B — Drizzle ORM + Drizzle Kit

Camada TypeScript próxima de SQL, schema declarado em TypeScript, geração de migrations SQL por diff via Drizzle Kit.

### C — SQL direto com query builder, sem ORM completo

Driver PostgreSQL (por exemplo `pg`) ou query builder leve, com migrations SQL puras aplicadas por um runner dedicado (`node-pg-migrate`, `dbmate`, `graphile-migrate` ou equivalente).

## Critérios comparativos

| Critério | A — Prisma | B — Drizzle | C — SQL sem ORM |
| --- | --- | --- | --- |
| D-1 PostgreSQL padrão / portabilidade | Alta: gera SQL padrão; troca de provedor não afetada | Alta | Máxima |
| D-2 Migrations versionadas e auditáveis | Nativo e maduro (`prisma migrate`) | Nativo (`drizzle-kit generate`) | Depende de ferramenta adicional a escolher |
| D-3 Separação explícita dev x produção | Comandos distintos e documentados (`migrate dev` x `migrate deploy`) | Fluxo `generate` + `migrate`, com menos separação semântica documentada | A definir por convenção própria |
| D-4 Serverless / Neon | Suporte oficial documentado por Prisma e por Neon, incluindo conexão direta para CLI | Suportado | Suportado |
| D-5 Tipagem | Cliente gerado, tipagem completa | Tipagem por inferência, completa | Baixa: mapeamento manual |
| D-6 SQL explícito quando necessário | Possível via SQL bruto e migrations editáveis à mão | Natural | Natural |
| D-7 Maturidade da linha estável | Linha 7.x estável e em manutenção ativa | Linha estável ainda é v0; v1 em beta/RC | Estável, mas a estratégia inteira teria de ser construída |
| Custo de decisão adicional | Baixo: ferramenta de migrations vem junto | Baixo | Alto: exigiria escolher e homologar um runner, ou seja, não fecharia OD-09 de fato |

## Pesquisa externa

Consultas realizadas em **2026-09-07**, contra documentação oficial vigente na data. Fontes de terceiros não foram usadas como fonte primária.

| Fonte oficial | Fato relevante apurado |
| --- | --- |
| Prisma — *Development and production* (docs v7) | "`migrate dev` is a development command and should never be used in a production environment"; "`migrate deploy` should generally be part of an automated CI/CD pipeline, and we do not recommend running this command locally to deploy changes to a production database" |
| Prisma — *Prototyping your schema* (docs v7) | `db push` não interage com migrations: `_prisma_migrations` não é criada nem atualizada e nenhum arquivo de migration é gerado; é adequado a prototipagem, e perda de dados exige `--accept-data-loss` |
| Prisma — *Deploy to Vercel* | Recomenda `prisma generate` no `postinstall` e apresenta o atalho de `prisma migrate deploy` dentro do build command; enfatiza pooling de conexões em serverless |
| Prisma — *Releases and maturity levels* / registro npm do pacote `prisma` | Em 2026-09-07 as dist-tags do pacote `prisma` são, entre outras, `latest = 8.0.0-rc.13`, `next = 8.0.0-rc.10`, `prev = 7.10.0`. Ou seja, a linha 8 ainda está em **release candidate** e o dist-tag `latest` **não** aponta para uma versão estável |
| Neon — *Prisma* | Neon exige duas strings de conexão: pooled para a aplicação e **direta/não pooled para o CLI do Prisma**; "Prisma CLI commands like `prisma migrate` and `prisma db push` need a direct connection for schema operations" |
| Vercel — *Configuring a build* | O build command é configurável por projeto e por deployment (`vercel.json`); a documentação de build não trata migrations de banco e não oferece garantia de execução única por mudança de schema |
| Drizzle — *v0 → v1 changes* / releases | A linha v1 permanece em beta/RC na data da consulta, com quebras acumuladas (remoção do sistema de relational queries anterior em favor de `defineRelations()`, mudança da API de casing, reorganização da estrutura de migrations com eliminação do `journal.json`). Nenhuma garantia pública de estabilidade ou data de GA |

Dois fatos alteraram materialmente a recomendação recebida e estão registrados na decisão abaixo:

1. **O dist-tag `latest` do pacote `prisma` aponta para um release candidate da linha 8.** Instalar `prisma@latest` hoje traz `8.0.0-rc.13`. Isso transforma o pinning de versão de boa prática em **requisito**, e não em recomendação.
2. **A documentação padrão do Prisma já descreve o fluxo de migrations da linha 8** (`migration plan`, `db migrate`, `migration check`, `ops.json`), distinto do fluxo `migrate dev` / `migrate deploy` da linha 7. A consulta precisou ser feita explicitamente contra as docs `v7`. Isso confirma que a linha 8 representa uma transição de workflow, não apenas um bump de major.

Nenhum fato encontrado invalida a adoção de Prisma na linha 7.

## Decisão

1. **ORM: Prisma ORM.** O TROQ adota Prisma como camada de acesso a dados. A alternativa C (sem ORM completo) é rejeitada porque não fecharia OD-09: transferiria a decisão para a escolha de um runner de migrations. A alternativa B é rejeitada nesta fase por D-7: a linha estável de Drizzle ainda é v0 e a v1 está em beta/RC com quebras acumuladas.
2. **Versionamento: linha 7.x estável.** A implementação deve usar uma versão estável da linha 7 (`7.10.0` ou a última estável 7.x disponível no momento em que a Fase 1 começar). **A linha 8 não é adotada agora**, por estar em release candidate e por trazer um novo workflow de migrations sem benefício concreto para o MVP.
3. **Pinning obrigatório e reprodutível.** `prisma` e `@prisma/client` devem ser instalados com versão exata (sem `^`/`~`) e com lockfile versionado. **É proibido instalar por `@latest`**, porque na data desta decisão esse dist-tag resolve para um release candidate da linha 8.
4. **Ferramenta de migrations: Prisma Migrate.** Nenhuma outra ferramenta de migrations será usada em paralelo.
5. **Criação de migrations.** Migrations são criadas exclusivamente em ambiente de desenvolvimento, por `prisma migrate dev`, a partir da alteração do schema declarativo. Os arquivos SQL gerados:
   - são **código versionado no Git** e entram na mesma PR da mudança que os motivou;
   - podem ser editados à mão **antes** de serem aplicados em qualquer ambiente compartilhado, quando a operação exigir SQL que o gerador não produz (índices parciais, `CREATE INDEX CONCURRENTLY`, backfill, restrições de exclusão);
   - tornam-se **imutáveis** depois de aplicados em qualquer ambiente compartilhado. Corrigir uma migration já aplicada significa criar uma nova migration, nunca reescrever a anterior.
6. **Aplicação em desenvolvimento.** `prisma migrate dev` é restrito a bancos de desenvolvimento locais ou descartáveis. **Nunca** é executado contra staging ou produção.
7. **Aplicação em staging e produção.** `prisma migrate deploy` é o único mecanismo autorizado. Ele é executado por um **job controlado de CI/CD**, com aprovação explícita para produção, e:
   - **não** roda no startup da aplicação;
   - **não** roda dentro de Serverless Function ou de Route Handler;
   - **não** é executado manualmente da máquina de uma pessoa desenvolvedora contra produção;
   - roda como um passo único e serializado por deploy, e não uma vez por instância.
8. **`db push` é proibido fora de desenvolvimento.** `prisma db push` só pode ser usado contra banco local ou descartável, para prototipagem. Ele não cria histórico (`_prisma_migrations` não é criada nem atualizada) e, portanto, **não pode substituir migrations em staging ou produção** em nenhuma circunstância. O mesmo vale para qualquer comando equivalente que sincronize schema sem gerar histórico.
9. **Migrations destrutivas ou incompatíveis usam expand/contract.** Remoções de coluna/tabela, renomeações e mudanças de tipo incompatíveis são divididas em pelo menos duas entregas: *expand* (adicionar o novo elemento, escrever nos dois, backfill, ler do novo) e, em entrega posterior e separada, *contract* (remover o antigo). O projeto **não** deve depender de atomicidade entre o deploy da aplicação e o deploy do schema: durante um deploy, versões antigas e novas da aplicação coexistem contra o mesmo banco.
10. **Segredos e conexões.** A URL de conexão usada por migrations é um segredo de ambiente de CI/CD, nunca versionado e nunca exposto ao cliente. Seguindo a documentação do Neon, migrations usam a **conexão direta (não pooled)**, enquanto a aplicação em runtime usa a conexão pooled. Credenciais de produção nunca são usadas em máquina de desenvolvimento nem em ambiente de preview.
11. **Alteração manual emergencial.** Se uma alteração manual em banco compartilhado for inevitável, ela exige registro imediato e **reconciliação posterior com o histórico versionado**, por migration correspondente, antes do próximo deploy que altere schema. Um banco compartilhado cujo estado divirja do histórico de migrations é tratado como incidente.

## Estratégia de migrations (resumo operacional)

| Ambiente | Comando autorizado | Quem executa | Observação |
| --- | --- | --- | --- |
| Desenvolvimento local | `prisma migrate dev`, `prisma db push` (descartável) | Pessoa desenvolvedora | Gera os arquivos que serão versionados |
| CI de PR | Validação da migration contra banco efêmero | Pipeline | Não toca staging nem produção |
| Staging | `prisma migrate deploy` | Job de CI/CD | Mesmo artefato que irá para produção |
| Produção | `prisma migrate deploy` | Job de CI/CD com aprovação | Passo único, serializado, com conexão direta |

## Estratégia de produção

O passo de migration é um **job de deploy separado do build da aplicação**, executado antes de a nova versão receber tráfego, e serializado (uma execução por vez).

A documentação oficial do Prisma para Vercel apresenta o atalho de embutir `prisma migrate deploy` no build command (`prisma generate && prisma migrate deploy && next build`). **O TROQ não adota esse atalho para produção.** Justificativa: o build da Vercel é acionado por deployment, inclusive em previews, pode ocorrer de forma concorrente e não oferece garantia de execução única e serializada por mudança de schema; acoplar a migration ao build torna difícil aprovar, auditar e reexecutar a migration independentemente. `prisma generate`, por não tocar o banco, permanece adequado ao build/`postinstall`.

Nenhum pipeline, workflow ou configuração de CI/CD é criado por esta ADR. A materialização do job de migration é trabalho da Fase 1.

## Compatibilidade com Neon e Vercel

- **Neon:** a separação entre conexão pooled (aplicação) e conexão direta (CLI do Prisma para migrations) é requisito documentado pelo próprio Neon e foi incorporada à decisão. Isso é configuração de conexão, não uso de recurso exclusivo do provedor: a decisão continua compatível com D-1 e com ADR-0002, e a troca de provedor PostgreSQL permanece viável.
- **Vercel:** `prisma generate` participa do build; migrations não. Nenhuma Serverless Function executa migration. Ambientes de preview não devem apontar para o banco de produção.
- **Recursos exclusivos:** a decisão não autoriza o uso de funcionalidades proprietárias de Neon (branching de banco, por exemplo) como dependência de arquitetura. Se isso vier a ser desejado, exige decisão registrada própria.

## Consequências

Positivas:

- OD-09 fecha; schema e migrations podem ser criados na Fase 1 sem nova decisão fundamental.
- R-07 passa a ter mitigação concreta: migrations versionadas, imutáveis após aplicação, aplicadas apenas por comando e por ator autorizados.
- Tipagem forte reduz erro em código que implementa RB-001, RB-003 e RB-004.
- Prisma Migrate cobre criação e aplicação em uma única ferramenta; não há decisão pendente sobre runner.
- A regra expand/contract remove a dependência de deploy atômico entre aplicação e banco.

Negativas e trade-offs:

- Dependência de uma ferramenta de terceiro no caminho crítico de evolução do schema (R-08).
- O schema declarativo do Prisma é uma abstração adicional; construções PostgreSQL que ele não expressa exigirão SQL escrito à mão dentro das migrations e, eventualmente, consultas em SQL bruto (D-6). Isso é aceito, não é exceção.
- Adotar a linha 7 significa que uma migração para a linha 8 será necessária no futuro, com custo de mudança de workflow de migrations.
- Expand/contract torna mudanças destrutivas mais lentas: duas entregas em vez de uma.
- Exigir job de CI/CD para migrations significa que a Fase 1 não pode aplicar schema em produção antes de esse job existir.

## Riscos

| Risco | Tratamento |
| --- | --- |
| Instalação acidental da linha 8 via `@latest` (dist-tag `latest` resolve para RC) | Pinning exato obrigatório e lockfile versionado (decisão 3); a versão instalada deve ser conferida na PR de scaffold |
| Migration aplicada fora do fluxo (manualmente, ou por `db push`) | Proibições explícitas (decisões 6 e 8) e reconciliação obrigatória (decisão 11) |
| Migration destrutiva executada junto com deploy de aplicação incompatível | Expand/contract obrigatório (decisão 9) |
| Migration executada contra conexão pooled do Neon | Uso obrigatório da conexão direta para o CLI (decisão 10) |
| Vazamento de credencial de produção para ambiente de desenvolvimento ou preview | Segredos restritos ao CI/CD (decisão 10); reforça R-03 e RNF de dados protegidos |
| Concorrência de migrations por builds simultâneos na Vercel | Job serializado, fora do build (seção "Estratégia de produção") |

## Política de evolução e upgrade

- A adoção de uma nova linha major (8.x ou posterior) exige **nova ADR**, com validação de que a linha está GA e com avaliação explícita do impacto sobre o workflow de migrations. Não se faz upgrade de major apenas por ser o major mais recente.
- Atualizações de minor e patch dentro da linha 7.x são permitidas sem ADR, mediante atualização do pin e do lockfile.
- Substituir Prisma por outra ferramenta (incluindo Drizzle, caso a v1 atinja GA e o trade-off mude) exige ADR que substitua esta, com plano de migração do histórico de migrations existente.
- Esta ADR deve ser revisitada quando a Fase 1 criar o primeiro schema, para confirmar que a política aqui definida é executável na prática.

## Rastreabilidade

- Fecha: [OD-09](../decisions/open-decisions.md).
- Registra: DEC-026 em [../decisions/decision-log.md](../decisions/decision-log.md).
- Depende de: [ADR-0001](0001-modular-monolith-nextjs.md), [ADR-0002](0002-postgresql-neon.md).
- Mitiga: R-07 em [../delivery/risks.md](../delivery/risks.md).
- Não altera: OD-07, OD-08 e nenhuma decisão de pagamento. Não define modelo de dados; as decisões de produto que o alimentam permanecem como estão, exceto OD-04, fechada posteriormente por [../product/listing-lifecycle.md](../product/listing-lifecycle.md).
