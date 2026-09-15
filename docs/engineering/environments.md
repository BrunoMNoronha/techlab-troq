# Ambientes, variáveis e segredos — TROQ

Fonte normativa dos **ambientes** da aplicação e do **contrato de variáveis de ambiente e segredos**. Produzido por **F1-001**, o primeiro trabalho da Fase 1 ([../delivery/prompts/f1-001-environments-and-secrets.md](../delivery/prompts/f1-001-environments-and-secrets.md)).

Documento irmão de [conventions.md](conventions.md), cuja seção 3.2 fixa a fronteira servidor/cliente para segredos, e de [testing.md](testing.md). Em caso de conflito entre este documento e uma decisão registrada em [../decisions/decision-log.md](../decisions/decision-log.md), nos ADRs em [../adr/](../adr/) ou em [../product/business-rules.md](../product/business-rules.md), **prevalece a decisão registrada** e este documento deve ser corrigido ([ai-agent-workflow.md](ai-agent-workflow.md), seção 2).

## 1. O que este documento faz e o que não faz

**Faz:** define os três ambientes, o critério de classificação das variáveis, a proibição de segredo em variável pública, o catálogo das variáveis necessárias ou previstas por área e as regras operacionais de custódia, adição, rotação e resposta a vazamento.

**Não faz:** não provisiona Neon, Cloudflare R2, Resend, Mercado Pago, Sentry, Vercel ou qualquer outro serviço; não cria conta, projeto, bucket ou credencial; não configura variável em painel de provedor; não instala dependência; não cria `schema.prisma` nem migration; não implementa leitura, parsing ou validação de variáveis em código; não altera regra de negócio, requisito, ADR ou decisão vigente; e **não** declara a Fase 1 concluída.

**Nota de escopo.** A escolha do **provedor de observabilidade** estava fora de F1-001 e por isso a seção 5.8 registrava, na origem, uma área sem variável. Ela foi feita depois, por **F1-008**, em [../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md) (DEC-039), e o contrato correspondente entrou neste catálogo pelo procedimento da seção 6.2. Este documento não escolhe ferramenta; ele registra o contrato da ferramenta que um ADR escolheu.

**Estado factual na data desta versão (atualizado por F1-004, 2026-09-15).** **Duas** variáveis deste catálogo têm consumidor real: `DIRECT_URL` é lida por `prisma.config.ts`, a configuração do Prisma CLI criada por F1-002 ([database.md](database.md), seção 4), e `DATABASE_URL` é lida por `src/persistence/prisma.ts`, a fronteira de runtime do Prisma Client criada por F1-003 ([database.md](database.md), seção 13). **Todas as demais continuam `previsto`**, sem código que as leia: não há módulos de domínio, não há adaptadores de provedor nem integração externa ([../project-state.md](../project-state.md), seção 3). Desde F1-004, **o primeiro serviço está provisionado**: o Neon de `preview` ([database.md](database.md), seção 15), cujas duas conexões vivem como secrets do GitHub Environment `preview`, e cuja conexão pooled vive também no escopo Preview da Vercel, junto de `APP_ENV=preview` (seção 5.2). Desde F1-006, **o Cloudflare R2 também está provisionado** em `development` e em `preview`, com bucket isolado e credencial própria por ambiente (seção 5.3), e desde F1-007 **o Resend também está**, com subdomínio remetente verificado e chave própria por ambiente (seção 5.4) — o que **não** altera o estado dessas variáveis, que continuam `previsto` porque nenhum código versionado as lê. Desde F1-008 a **observabilidade tem provedor escolhido e contrato escrito** — Sentry, por [../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md) (seção 5.8) —, mas **nada foi provisionado**: não há conta, organização nem projeto Sentry, nenhum DSN ou token real existe e nenhuma dependência foi instalada. Mercado Pago, Better Auth e Sentry continuam não provisionados; `production` não existe em nenhum provedor. **Nenhum segredo real está versionado.** O contrato existe para que a integração de cada provedor, quando ocorrer, encontre a fronteira já decidida e escrita.

## 2. Ambientes

O projeto tem exatamente **três** ambientes. Ambiente é uma fronteira de isolamento de dados e de credenciais, não um rótulo de conveniência: dois ambientes distintos nunca compartilham banco, bucket, chave de assinatura ou credencial de provedor.

### 2.1 `development`

| Aspecto | Definição |
| --- | --- |
| Propósito | Desenvolvimento na máquina de quem escreve o código, e execução da suíte de testes local |
| Onde roda | Máquina da pessoa desenvolvedora; `npm run dev` |
| Origem dos dados | Banco local ou descartável, dados fictícios. **Nenhum dado pessoal real** |
| Quem acessa | A própria pessoa desenvolvedora |
| Classe de credencial admissível | Credencial de desenvolvimento ou de sandbox do provedor, exclusiva deste ambiente. **Credencial de produção nunca é usada aqui** ([conventions.md](conventions.md), seção 6, item 1; [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md), decisão 10) |
| Onde os valores vivem | Arquivo `.env.local` (ou equivalente) **fora do versionamento**, na máquina de quem desenvolve |

`development` é o único ambiente em que `prisma migrate dev` e `prisma db push` são admissíveis, e ainda assim apenas contra banco local ou descartável ([../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md), decisões 6 e 8).

### 2.2 `preview`

| Aspecto | Definição |
| --- | --- |
| Propósito | Validar uma Pull Request em ambiente hospedado antes do merge |
| Onde roda | Deployment de preview da Vercel, publicado a partir de PR |
| Origem dos dados | Banco de preview, isolado de produção, com dados fictícios. **Nenhum dado pessoal real** |
| Quem acessa | Quem revisa a PR; a URL é efêmera e por deployment |
| Classe de credencial admissível | Credencial de teste ou de sandbox, **própria deste ambiente**. Credencial de produção **nunca** é usada aqui |
| Onde os valores vivem | Configuração de variáveis do projeto na Vercel, no escopo `preview`; e, para as conexões usadas pelo workflow de migrations, secrets do GitHub Environment `preview`, liberados apenas para jobs originados de `main` ([database.md](database.md), seção 15.2) |

**Isolamento é requisito, não preferência.** Um preview que aponte para o banco, o bucket ou a conta de pagamento de produção deixa de ser preview: passa a ser produção operada por código não revisado.

**Limite conhecido do ambiente.** Exercitar o fluxo de pagamento de ponta a ponta exige cadência de agendamento de minutos, que o plano Hobby da Vercel não oferece — ele permite uma execução diária ([../adr/0006-async-work-scheduling-concurrency.md](../adr/0006-async-work-scheduling-concurrency.md), DEC-038; [../architecture/overview.md](../architecture/overview.md), AR-15.4; R-09). Qualquer ambiente em que se pretenda exercitar esse fluxo integralmente precisa do mesmo tratamento de plano que produção. Este documento registra o fato; a contratação de plano não é objeto de F1-001.

### 2.3 `production`

| Aspecto | Definição |
| --- | --- |
| Propósito | Ambiente comercial, com pessoas usuárias e dinheiro reais |
| Onde roda | Deployment de produção da Vercel, em **plano pago** — nunca Hobby (DEC-011, DEC-038, R-09) |
| Origem dos dados | Dados reais de pessoas usuárias, sujeitos à LGPD e a [../product/data-retention-policy.md](../product/data-retention-policy.md) (DEC-033) |
| Quem acessa | Pessoas usuárias, pela aplicação. Acesso operacional direto é restrito, justificado e auditável |
| Classe de credencial admissível | Exclusivamente credencial de produção, que **não sai deste ambiente** |
| Onde os valores vivem | Configuração de variáveis do projeto na Vercel, no escopo `production`, e — para a conexão usada por migrations — no escopo de segredo do job de CI/CD ([../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md), decisões 7 e 10) |

### 2.4 Quadro comparativo

| | `development` | `preview` | `production` |
| --- | --- | --- | --- |
| Dados pessoais reais | Não | Não | Sim |
| Credencial de produção | **Proibida** | **Proibida** | Obrigatória |
| Banco | Local ou descartável | De preview, isolado | De produção |
| Bucket de imagens | De desenvolvimento | De preview | De produção |
| Conta do gateway de pagamento | Teste/sandbox | Teste/sandbox | Produção |
| `migrate dev` / `db push` | Permitidos em banco descartável | **Proibidos** | **Proibidos** |
| `migrate deploy` | Não se aplica | Por job controlado | Por job controlado, serializado |

### 2.5 A regra que atravessa os três

**Credencial de produção existe apenas em `production`.** Ela não é copiada para máquina de desenvolvimento, não é colada em preview, não é usada em teste, não é enviada por mensagem e não é anexada a tarefa, PR ou relatório. Esta regra não tem exceção operacional; qualquer necessidade que pareça exigi-la é sinal de que falta um ambiente ou uma credencial de escopo menor ([conventions.md](conventions.md), seção 6, item 1; RNF-015).

## 3. Classificação das variáveis

Toda variável pertence a **uma** de duas classes. Não há classe intermediária e não há exceção pontual.

### 3.1 O critério

A classe é determinada por uma única pergunta, verificável sem julgamento:

> **O valor precisa ser lido por código que executa no navegador?**

- **Sim → variável pública.** No Next.js, para que o valor chegue ao navegador, o nome precisa começar com `NEXT_PUBLIC_`; o valor é embutido no bundle de cliente no momento do build. Quem abrir o bundle lê o valor. Logo, **variável pública é conteúdo público**, por definição e não por descuido ([conventions.md](conventions.md), seção 3.2).
- **Não → variável exclusivamente server-side.** Nome **sem** o prefixo `NEXT_PUBLIC_`. O valor existe apenas no processo do servidor e nunca é serializado para o cliente.

O teste objetivo de conformidade é mecânico: **o nome começa com `NEXT_PUBLIC_`?** Se começa, o valor é público e será legível por qualquer pessoa. Se não começa, o valor não pode ser referenciado por Client Component, por código de browser nem por qualquer caminho que o coloque em payload enviado ao cliente.

### 3.2 Proibição de segredo em variável pública

**Nenhum segredo entra em variável pública. Sem exceção.**

Segredo é todo valor que autentica, autoriza, assina, decifra ou concede acesso: token de API, chave de acesso, chave secreta de assinatura, senha, string de conexão de banco, segredo de sessão, segredo de agendamento. Colocar qualquer um deles atrás do prefixo `NEXT_PUBLIC_` é publicá-lo, ainda que a interface nunca o exiba — o bundle é o vazamento (RNF-015; [../architecture/overview.md](../architecture/overview.md), AR-4.3; [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), decisão 6).

Consequência prática: se um valor precisa ser secreto **e** o navegador parece precisar dele, a leitura do requisito está errada. O que o navegador precisa é do **resultado** de uma operação feita no servidor — uma URL assinada de curta duração, uma resposta já autorizada —, nunca da credencial que a produz.

### 3.3 Server-side não é sinônimo de segredo

Toda credencial é server-side, mas nem toda variável server-side é credencial. O nome de um bucket, o endereço de remetente de email ou o rótulo do ambiente corrente não são segredos; são apenas configuração que o cliente não precisa ler. Classificá-los como server-side é o padrão correto: **o cliente só recebe o que precisa**, e ampliar a exposição sem necessidade é custo sem benefício.

A coluna "Classificação" do catálogo registra a classe e marca, entre as server-side, quais são **segredo** — e portanto sujeitas a rotação (seção 6.3) e a resposta a incidente (seção 6.4).

### 3.4 Dado protegido nunca é variável de ambiente

**Telefone/WhatsApp é dado protegido** e não aparece em variável de ambiente de nenhuma classe, em nenhum ambiente, nem como exemplo, nem como valor de teste (RB-001, RNF-008, DEC-023; [conventions.md](conventions.md), seção 3.3; [../architecture/contact-release.md](../architecture/contact-release.md)). O mesmo vale para qualquer dado pessoal real: nome, email, CPF ou endereço de pessoa real não entram em `.env.example`, em documentação, em fixture nem em teste ([testing.md](testing.md), seção 1, item 6).

## 4. Convenção de nomes

1. Nomes em `SCREAMING_SNAKE_CASE`.
2. Variável pública, e somente ela, começa com `NEXT_PUBLIC_` — prefixo imposto pelo framework ([ADR-0001](../adr/0001-modular-monolith-nextjs.md); [conventions.md](conventions.md), seção 3.2).
3. Variável de um provedor externo é prefixada pelo provedor ou pelo recurso a que pertence (`R2_`, `RESEND_`, `MERCADO_PAGO_`, `BETTER_AUTH_`, `SENTRY_`), para que a origem do valor e o seu ciclo de vida de rotação sejam óbvios na leitura.
4. Nomes que já são convenção documentada da ferramenta que os consome são **preservados**, e não traduzidos: mudá-los troca compatibilidade por gosto pessoal. É o caso de `DATABASE_URL` e `DIRECT_URL` (Prisma e Neon), de `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` (Better Auth), de `CRON_SECRET` (agendamento da Vercel) e de `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` e `SENTRY_PROJECT` (ferramenta de build do Sentry).
5. O vocabulário segue o dos documentos de produto e de arquitetura. `MEDIA` designa as imagens de anúncio e seus derivados, na acepção do módulo `media` de [../architecture/overview.md](../architecture/overview.md) (AR-3.3).

## 5. Catálogo de variáveis

Legenda das colunas:

- **Ambientes** — onde a variável precisa existir.
- **Classificação** — `pública` (prefixo `NEXT_PUBLIC_`, conteúdo público) ou `server-side` (exclusivamente servidor). Segredos são sempre `server-side` e estão marcados como tal.
- **Obrigatoriedade** — `obrigatória` quando a funcionalidade correspondente não opera sem ela; `condicional` quando depende de um caminho específico.
- **Estado** — `previsto` significa **ainda não consumido por código**; `consumido` significa que existe código versionado que a lê, indicado na própria célula. Hoje estão `consumido` **`DATABASE_URL`**, **`DIRECT_URL`** (seção 5.2), **`APP_ENV`** e **`NEXT_PUBLIC_SENTRY_DSN`** (seções 5.1 e 5.8, desde F1-010); todas as demais estão `previsto` (seção 1).
- **Origem** — a fonte normativa que exige a variável e a justificativa do nome.

### 5.1 Aplicação

| Variável | Ambientes | Classificação | Obrigatoriedade | Estado | Origem |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | os três | **pública** | obrigatória | previsto | URL pública canônica da aplicação no ambiente. É lida pelo navegador para compor URLs absolutas e canônicas; não é segredo. Necessária a links absolutos de email transacional (RF-002, RF-021) e à navegação mobile-first ([../architecture/overview.md](../architecture/overview.md), AR-13) |
| `APP_ENV` | os três | server-side | obrigatória | **consumido** por `src/modules/platform` (fronteira de telemetria, F1-010), que passa o seu valor como `environment` à SDK de observabilidade | Rótulo do ambiente corrente, com os três valores desta seção 2: `development`, `preview`, `production`. É o que permite ao servidor recusar configuração incoerente — por exemplo, credencial de produção fora de `production` (seção 2.5, RNF-015). Não é segredo e o cliente não precisa dela |

**Nota.** `APP_ENV` é variável **do projeto**, deliberadamente distinta das variáveis que a plataforma de deploy injeta por conta própria. Depender apenas do que a plataforma injeta acoplaria a aplicação ao provedor de deploy e quebraria o ambiente `development`, que não roda na plataforma (RNF-017).

**Nota de F1-010 — o rótulo do ambiente chega ao navegador, e por quê.** A telemetria de browser precisa carregar o ambiente, e [../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md), decisão 11, proíbe criar `SENTRY_ENVIRONMENT` ou `NEXT_PUBLIC_SENTRY_ENVIRONMENT` — o rótulo é `APP_ENV`, e só ele. Como o framework só embute no bundle de cliente o que tem o prefixo `NEXT_PUBLIC_`, `next.config.ts` deriva o valor de `APP_ENV` no build, **sob o mesmo nome**, pela chave `env` do Next.js. Registro explícito da consequência, para que não seja descoberta depois como desvio: **o valor de `APP_ENV` passa a existir no bundle de cliente**. Três fatos o tornam aceitável, e nenhum deles se estende a outra variável — (i) `APP_ENV` **não é segredo**, como a seção 3.3 já registra: é um rótulo de três literais que não autentica, não autoriza e não concede acesso; (ii) **nenhuma variável nova foi criada**, de modo que continua havendo uma única fonte de verdade, e não duas que podem divergir; (iii) a alternativa — duplicar a variável com prefixo público — é exatamente o que aquela decisão e o procedimento da seção 6.2 existem para impedir. O valor passa a ser resolvido **no build**, e não a cada requisição; um deployment pertence a exatamente um ambiente, de modo que congelá-lo no build é fiel ao que a variável significa. A proibição da seção 3.2 — **nenhum segredo em variável pública** — permanece **sem exceção** e não é tocada por esta nota.

### 5.2 PostgreSQL / Neon

| Variável | Ambientes | Classificação | Obrigatoriedade | Estado | Origem |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | os três | server-side — **segredo** | obrigatória | **consumido** — por `src/persistence/prisma.ts` (runtime do Prisma Client, via `@prisma/adapter-pg`), desde F1-003 | String de conexão usada pela **aplicação em runtime**, apontando para o endpoint **pooled** do Neon. Exigida por [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md) e por [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md), decisão 10. O nome é a convenção documentada de Prisma e Neon (regra 4 da seção 4) |
| `DIRECT_URL` | `development` e o job de CI/CD de migrations | server-side — **segredo** | condicional: obrigatória onde se executam comandos de schema | **consumido** — por `prisma.config.ts` (Prisma CLI), desde F1-002 | String de conexão **direta, não pooled**, usada pelo CLI do Prisma. [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md), decisão 10, registra que o Neon exige duas strings e que `prisma migrate` e `prisma db push` precisam de conexão direta para operações de schema |

**Por que são duas variáveis, e não uma.** A distinção não é preferência de configuração: o endpoint pooled do Neon usa PgBouncer em modo transação e **não suporta** recursos de sessão ([../adr/0006-async-work-scheduling-concurrency.md](../adr/0006-async-work-scheduling-concurrency.md), fato N-1; [../architecture/overview.md](../architecture/overview.md), AR-15.5). Executar migration sobre o endpoint pooled é defeito conhecido e está listado como risco mitigado em ADR-0005. A mesma restrição tem uma consequência **de código**, que não é objeto deste documento e fica registrada para não ser reaberta por suposição: a aplicação usa exclusivamente trava de escopo de transação, sendo **proibida** a trava consultiva de sessão (DEC-038, decisão 6).

**Estado após F1-004 (2026-09-15).** O banco de `preview` existe: projeto Neon `techlab-troq-preview`, região São Paulo, PostgreSQL 17, branch `preview`, database `troq`, sem dados de produto e sem dado pessoal ([database.md](database.md), seção 15.1). As duas strings do provedor foram verificadas por `SELECT 1` e estão sob custódia assim: `DIRECT_URL` (direta) **somente** como secret do GitHub Environment `preview`; `DATABASE_URL` (pooled) como secret do mesmo environment e como variável sensível do projeto Vercel `techlab-troq` no escopo **Preview**, junto de `APP_ENV=preview` — as duas únicas variáveis do projeto, aplicadas a um deployment de preview novo em `READY` ([database.md](database.md), seção 15.2). A conexão direta não entra na Vercel; nenhuma das duas entra no escopo Production; não há secret de repositório. O workflow `.github/workflows/migrate-preview.yml` aplica `migrate deploy` a partir de `main`, serializado; a sua primeira execução, após o merge da PR de F1-004, aplicou a migration inicial e aprovou a suíte de integração contra o pooled ([database.md](database.md), seção 15.6). **`production` não foi provisionado**: não há banco, credencial, environment nem job de produção.

**Estado após F1-003.** O Prisma 7.10.0 está instalado, `prisma/schema.prisma` e a migration inicial existem, e `prisma.config.ts` lê `DIRECT_URL` para as operações de schema do CLI — carregando `.env.local` (ou `.env`) por `process.loadEnvFile`, sem dependência extra, e sem erro quando o arquivo não existe ([database.md](database.md), seção 4.1). Desde F1-003, `DATABASE_URL` **tem consumidor**: `src/persistence/prisma.ts` a passa integralmente ao driver adapter `@prisma/adapter-pg` na primeira vez em que um Prisma Client é pedido; a leitura é **lazy** — importar o módulo, fazer build ou gerar o client não exige a variável — e a ausência dela produz erro controlado que nomeia a variável e nunca o valor ([database.md](database.md), seção 13). O runtime **nunca** lê `DIRECT_URL`, e o CLI **nunca** lê `DATABASE_URL`. **Nenhum banco foi provisionado**: migration e runtime só foram validados contra PostgreSQL local e descartável, e estas variáveis continuam sendo o contrato que o provisionamento futuro deve satisfazer.

### 5.3 Cloudflare R2

Acesso pela **API S3-compatible**, como determina [../adr/0003-object-storage-r2.md](../adr/0003-object-storage-r2.md), para que a aplicação dependa da interface S3 e não de recurso exclusivo do provedor (RNF-017).

| Variável | Ambientes | Classificação | Obrigatoriedade | Estado | Origem |
| --- | --- | --- | --- | --- | --- |
| `R2_S3_ENDPOINT` | os três | server-side | obrigatória | previsto | Endpoint S3-compatible da conta. Explícito, em vez de derivado de identificador de conta, para manter a troca de provedor viável (ADR-0003; RNF-017) |
| `R2_REGION` | os três | server-side | obrigatória | previsto | Região exigida pelo protocolo de assinatura S3. Não é segredo |
| `R2_BUCKET` | os três | server-side | obrigatória | previsto | Bucket das imagens do ambiente. O bucket tem **duas áreas lógicas** — temporária, nunca pública, e pública, apenas com derivados aprovados —, e não dois buckets ([../architecture/overview.md](../architecture/overview.md), AR-10.4; [../product/image-policy.md](../product/image-policy.md), DEC-028) |
| `R2_ACCESS_KEY_ID` | os três | server-side — **segredo** | obrigatória | previsto | Identificador da credencial S3-compatible. Só o servidor autoriza upload direto, por operação de curta duração (AR-10.1); o cliente **nunca** recebe a credencial |
| `R2_SECRET_ACCESS_KEY` | os três | server-side — **segredo** | obrigatória | previsto | Segredo da credencial S3-compatible. AR-4.3: nenhum segredo atravessa a fronteira servidor/cliente |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | os três | **pública** | obrigatória | previsto | Host público a partir do qual os **derivados** `thumb`, `medium` e `large` são servidos. O navegador busca essas imagens, logo a base é conteúdo público por natureza (DEC-028; AR-10.1). Ela endereça **apenas** derivados aprovados: o original temporário nunca é público (AR-10.4) |

**Estado após F1-006.** O R2 está **provisionado** em `development` e em `preview`. Cada ambiente tem o seu **bucket isolado** — `troq-media-development` e `troq-media-preview` —, ambos em classe `Standard`, na localização automática do provedor, e **ambos privados**: sem `r2.dev`, sem Custom Domain, sem política de CORS e sem qualquer acesso anônimo. As credenciais são **separadas e limitadas por ambiente**: uma Account API Token por ambiente, com permissão *Object Read & Write* restrita ao bucket daquele ambiente, comprovado por teste real de que a credencial de um ambiente não opera no bucket do outro. Os valores de `development` vivem em `.env.local`, que o `.gitignore` protege; os de `preview` vivem **somente** no escopo Preview da Vercel, com as duas chaves marcadas como sensíveis. **Nenhum valor real é versionado**, e `production` não tem bucket, credencial nem variável. As seis variáveis desta seção **continuam `previsto`**: estar configurada em um painel não é o mesmo que ser lida por código versionado, e nenhum módulo — inclusive `media` — consome o R2 ainda (seção 1).

**O que não é variável.** A credencial do R2 nunca é enviada ao navegador para "facilitar o upload". O upload direto do cliente ao R2 é autorizado **no servidor**, por operação S3-compatible de curta duração, e o binário não trafega por função da Vercel ([../architecture/overview.md](../architecture/overview.md), AR-10.1; DEC-028).

### 5.4 Resend

| Variável | Ambientes | Classificação | Obrigatoriedade | Estado | Origem |
| --- | --- | --- | --- | --- | --- |
| `RESEND_API_KEY` | os três | server-side — **segredo** | obrigatória | previsto | Chave de API do provedor de email transacional (DEC-015). Email é enviado exclusivamente pelo servidor; AR-4.3 |
| `EMAIL_FROM` | os três | server-side | obrigatória | previsto | Endereço remetente das mensagens transacionais, em domínio verificado no provedor. Sustenta RF-002 (verificação de email) e RF-021 (notificações transacionais). Não é segredo, e o cliente não precisa dele |

**Estado após F1-007.** O Resend está **provisionado** em `development` e em `preview`. Cada ambiente tem o seu **subdomínio remetente verificado** sob `troqs.app` — `dev.troqs.app` e `preview.troqs.app` —, ambos na região `sa-east-1` do provedor, com DKIM, SPF e MX publicados no DNS da Cloudflare. As credenciais são **separadas e limitadas por ambiente**: uma API key por ambiente, com permissão **Sending access** e **restrição ao domínio** daquele ambiente, comprovado por teste real de que a chave de um ambiente não envia pelo domínio do outro. `RESEND_API_KEY` e `EMAIL_FROM` de `development` vivem em `.env.local`, que o `.gitignore` protege; os de `preview` vivem **somente** no escopo Preview da Vercel, com a chave marcada como sensível. **Nenhum valor real é versionado**, e `production` não tem domínio, chave nem variável. As provas de envio usaram exclusivamente o endereço **simulado** `delivered@resend.dev` do provedor, nunca uma pessoa real, como exige o parágrafo abaixo. As duas variáveis desta seção **continuam `previsto`**: nenhum código versionado as lê, e não há módulo de email (seção 1).

**Isolamento por ambiente.** `development` e `preview` usam chave e remetente próprios e **não** enviam mensagem a endereço de pessoa real. Nenhum endereço real entra em documentação, exemplo ou fixture (seção 3.4).

### 5.5 Autenticação — Better Auth

Autenticação por email/senha com verificação de email, via Better Auth (DEC-012, DEC-013; [../architecture/overview.md](../architecture/overview.md), AR-7.1).

| Variável | Ambientes | Classificação | Obrigatoriedade | Estado | Origem |
| --- | --- | --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | os três | server-side — **segredo** | obrigatória | previsto | Segredo de assinatura de sessão e de tokens. É a chave que sustenta o nível N1 de autorização de AR-7.2: quem a possui forja sessão. Nunca sai do servidor (RNF-007, RNF-015) |
| `BETTER_AUTH_URL` | os três | server-side | obrigatória | previsto | URL base do servidor de autenticação no ambiente, usada para compor callbacks e links de verificação. Não é segredo; permanece server-side porque só o servidor a consome |

**Nome e estado.** `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` seguem a convenção documentada da biblioteca (regra 4 da seção 4). A biblioteca **não** está instalada e a autenticação **não** está implementada; os nomes devem ser conferidos contra a versão efetivamente adotada no momento da integração, e este documento atualizado na mesma PR caso divirjam (seção 6.2).

### 5.6 Mercado Pago

Gateway Pix inicial homologado do MVP, por Checkout Transparente via Orders API ([../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), DEC-036).

| Variável | Ambientes | Classificação | Obrigatoriedade | Estado | Origem |
| --- | --- | --- | --- | --- | --- |
| `MERCADO_PAGO_ACCESS_TOKEN` | os três | server-side — **segredo** | obrigatória | previsto | Access Token usado para criar e consultar orders. **Exclusivamente server-side**, por decisão expressa: [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), decisão 6 e driver D-7; [../architecture/payments-design.md](../architecture/payments-design.md), PD-11.1; RNF-015 |
| `MERCADO_PAGO_WEBHOOK_SECRET` | os três | server-side — **segredo** | obrigatória | previsto | Chave secreta usada para validar a assinatura HMAC-SHA256 da notificação, pela **única** regra oficial de manifesto, antes de qualquer processamento. **Exclusivamente server-side**: [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), decisões 6, 8 e 9; RNF-014 |

**A URL de webhook não é variável de ambiente.** Ela é configurada **no nível da aplicação**, no painel do Mercado Pago, em _Suas integrações > Webhooks_, e a chave secreta é gerada ao salvar essa configuração. É **proibido** enviar `notification_url` no corpo de `POST /v1/orders`: a Orders API rejeita a propriedade com `HTTP 400` e `unsupported_properties`, fato comprovado pelo spike F0-010 e convertido em norma por [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), decisão 11. Nenhum documento e nenhuma variável do TROQ pode reintroduzir essa suposição.

**Consequência operacional.** Como a URL e a chave vivem no painel, e não no Git nem no CI, cada ambiente exige uma aplicação ou configuração de webhook própria, com a sua própria chave secreta. Credencial de produção do gateway não é usada em `development` nem em `preview` (decisão 6 daquele ADR; seção 2.5 deste documento).

### 5.7 Jobs internos e agendamento

| Variável | Ambientes | Classificação | Obrigatoriedade | Estado | Origem |
| --- | --- | --- | --- | --- | --- |
| `CRON_SECRET` | os três | server-side — **segredo** | obrigatória onde houver trabalho periódico | previsto | Segredo que protege os **endpoints de trabalho periódico**. A plataforma de agendamento o envia automaticamente como cabeçalho `Authorization`, e o próprio endpoint o compara ([../adr/0006-async-work-scheduling-concurrency.md](../adr/0006-async-work-scheduling-concurrency.md), fato V-5 e decisão 9). O nome é a convenção documentada da plataforma (regra 4 da seção 4) |

**Por que é obrigatório.** Os endpoints de reconciliação, reembolso e resolução de inconsistência existem **apenas** como trabalho periódico protegido, e nenhuma superfície de cliente os aciona ([../architecture/payments-design.md](../architecture/payments-design.md), PD-11.4, CI-11). Um endpoint de trabalho sem segredo é um caminho anônimo para operações financeiras: a recusa na ausência do segredo é incondicional (DEC-038, decisão 9).

**Distinção que não deve ser perdida.** O endpoint de **webhook** do gateway não usa `CRON_SECRET` e não tem autorização de sessão: ele é público por natureza e a sua única autorização é a **assinatura** da notificação (PD-11.4). Proteger o webhook com `CRON_SECRET` seria impossível — quem chama é o provedor — e proteger o trabalho periódico apenas por assinatura seria insuficiente.

### 5.8 Observabilidade — Sentry

Plataforma de observabilidade do MVP homologada por [../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md) (DEC-039), que fecha a lacuna de ferramenta e escopo que AR-14.1 atribuía à Fase 1 e leva RNF-018 a `definido`. **Um projeto Sentry por ambiente, e um DSN por ambiente:** projeto e DSN **não** são compartilhados entre `development`, `preview` e `production` (seções 2 e 6.1, regra 3).

| Variável | Ambientes | Classificação | Obrigatoriedade | Estado | Origem |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | os três | **pública** — **não** é segredo | obrigatória quando a instrumentação Sentry estiver ativa | **consumido** por `src/modules/platform` (fronteira de telemetria, F1-010), nos três runtimes — navegador, Node e Edge | Endereço de ingestão do projeto Sentry **daquele ambiente**; um valor distinto por ambiente. É lida por código que executa no navegador, logo é pública pelo critério da seção 3.1 — e o provedor documenta que, sem DSN, a SDK não envia nada. Exigida por [../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md), decisões 10 e 12; RNF-018; AR-14.1 |
| `SENTRY_AUTH_TOKEN` | os três | server-side — **segredo** | **condicional**: apenas onde o build/CI realmente autenticar no provedor (upload de source maps, criação de release) | previsto | Token que autentica operações na organização Sentry. Nome é a convenção documentada da ferramenta (regra 4 da seção 4). **Nunca** acessível ao browser e **nunca** lido em runtime de requisição; menor escopo permitido pelo provedor e credencial distinta por ambiente quando aplicável (seção 6.1, regras 3 e 4). A sua ausência **não** impede `npm run dev`, `build` local, `lint`, `typecheck` nem `test:ci` ([../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md), decisão 13) |
| `SENTRY_ORG` | os três | server-side — **não** é segredo | **condicional** à integração de source maps/releases | previsto | Slug da organização Sentry, usado pela ferramenta de build. Configuração, não credencial: identificar a organização não autoriza nada. Nome é a convenção documentada da ferramenta (regra 4 da seção 4) |
| `SENTRY_PROJECT` | os três | server-side — **não** é segredo | **condicional** à integração de source maps/releases | previsto | Slug do projeto Sentry **correspondente ao ambiente**; valor diferente por ambiente, como consequência direta da decisão 2 daquele ADR. Configuração de build, não credencial. Nome é a convenção documentada da ferramenta (regra 4 da seção 4) |

**A DSN é pública por natureza, e isso não afrouxa nada.** Ela é chave de **ingestão endereçada**: não lê issues, não lê logs, não administra projeto e não emite credencial. Ser pública é fato do seu uso no navegador, não concessão — e **não** autoriza expor nenhuma outra credencial. `SENTRY_AUTH_TOKEN` continua segredo server-side e **nunca** recebe o prefixo `NEXT_PUBLIC_` (seção 3.2).

**Uma DSN, usada explicitamente nos dois lados.** A futura instrumentação server-side referencia **a mesma** `NEXT_PUBLIC_SENTRY_DSN`, de forma explícita. **Não** se cria uma segunda variável `SENTRY_DSN` apenas para duplicar o mesmo valor: duas variáveis com o mesmo conteúdo criam duas fontes de verdade e um modo de falha — divergirem. Necessidade comprovada de DSN server-side distinta seria adição de variável pelo procedimento da seção 6.2.

**Variáveis que não existem, deliberadamente.** **Não** há `SENTRY_ENVIRONMENT` nem `NEXT_PUBLIC_SENTRY_ENVIRONMENT`: o rótulo do ambiente é `APP_ENV` (seção 5.1), e o guia de JavaScript do provedor não declara variável de ambiente para essa opção, de modo que não há convenção de ferramenta a preservar. **Não** há variável própria de release enquanto os metadados de deployment/Git/Vercel bastarem para identificá-la. Nenhuma variável especulativa entra neste catálogo ([../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md), decisão 11).

**Estado após F1-009 (2026-09-15).** O provedor está **escolhido**, o contrato está **escrito** e os dois projetos de que este catálogo depende estão **provisionados**. A organização Sentry é `techlab-bt` ("TechLab+"), e dentro dela existem exatamente dois projetos, **um por ambiente** e com plataforma Next.js: `techlab-troq-development` e `techlab-troq-preview`. Cada um tem **client key própria e DSN própria**, terminada no seu próprio identificador de projeto, de modo que o isolamento da decisão 2 daquele ADR é garantido **por credencial**, e não por rótulo. `NEXT_PUBLIC_SENTRY_DSN` está custodiada conforme a seção 6.1: a DSN de `development` vive **apenas** em `.env.local`, fora do versionamento, e a de `preview` vive **apenas** no escopo Preview do projeto na plataforma de deploy — nenhuma das duas está em Production, e nenhum valor real entrou neste repositório.

**Privacidade configurada no provedor.** Nos dois projetos, e também no nível da organização, o *data scrubbing* server-side está **habilitado**, os **scrubbers padrão** do provedor estão **preservados** — os que já removem `password`, `secret`, `passwd`, `api_key`, `apikey`, `auth`, `credentials`, `mysql_pwd`, `privatekey`, `private_key`, `token` e `bearer`, além de valores com aparência de cartão — e a eles foram **acrescentados** os campos sensíveis do domínio: `phone`, `telefone`, `whatsapp`, `email`, `cpf`, `address` e `endereco`. **Nenhum *safe field* foi declarado**, de modo que nada foi excluído da proteção, e o armazenamento de **endereço IP está desabilitado**. A organização contém **apenas** os dois projetos do TROQ, de modo que reforçar a configuração no nível organizacional não afeta projeto de terceiro. **Session Replay permanece desabilitado** e `sendDefaultPii` — ou a opção que a suceder — **não** foi habilitada: sem SDK instalada, ambas seguem no padrão do provedor, que é o estado correto (decisões 7 e 9 daquele ADR).

**O que F1-009 deliberadamente não fez.** **Nenhum `SENTRY_AUTH_TOKEN` foi criado** e a organização tem **zero** tokens de autenticação; `SENTRY_ORG` e `SENTRY_PROJECT` **não** foram configuradas como variáveis de ambiente em lugar nenhum. As três são **condicionais** a source maps e releases (seção 5.8, coluna Obrigatoriedade), e o upload de source maps **não** foi adotado nesta etapa — antecipá-las "para deixar pronto" criaria credencial e configuração sem consumidor. Os slugs da organização e dos projetos registrados acima são **fato documental da entrega**, não valor de variável.

**As quatro variáveis desta seção continuam `previsto`.** Um valor real passar a existir **não** muda o estado: `previsto` significa **ausência de consumidor versionado**, e nenhum código lê nenhuma delas. `@sentry/nextjs` **não** está instalado, não há arquivo de instrumentação e **nenhuma telemetria da aplicação é emitida**. O entregável **E-7 continua não iniciado**, e o Sentry de `production` **continua não provisionado**. A instrumentação da SDK é trabalho posterior e próprio ([../delivery/backlog.md](../delivery/backlog.md)).

**Plano e custo.** A organização opera hoje em **trial** do plano Business, iniciado em 2026-09-15 e com término em **2026-09-29**, **sem meio de pagamento registrado** e sem gasto sob demanda. O provedor documenta que, ao fim do trial, uma organização que veio do plano Developer **retorna ao Developer gratuito**, sem troca automática para plano pago. **Nenhum compromisso financeiro foi criado** por esta entrega. A franquia do Developer é limite real a acompanhar, no escopo de R-08 e da decisão 14 daquele ADR.

**O que continua valendo, e é mais rígido que qualquer configuração.** Nenhum sinal de observabilidade contém telefone/WhatsApp, credencial, token, cookie de sessão, cabeçalho `Authorization`, string de conexão, request body arbitrário, payload integral de webhook, resposta integral de provedor ou qualquer outro dado protegido (AR-14.4, RNF-018, seção 6.5). Telefone/WhatsApp **nunca** é tag, atributo, contexto, breadcrumb, mensagem nem chave de correlação, em nenhuma forma derivada. **Session Replay fica fora do MVP e permanece desabilitado.** O *data scrubbing* do provedor é preservado ou reforçado, nunca afrouxado, e `sendDefaultPii` — ou a opção que o suceder — não é habilitada por conveniência ([../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md), decisões 5 a 9).

### 5.9 Áreas que ainda não têm variável

- **Módulos de domínio.** Os nove módulos de AR-3.3 existem como fronteira desde F1-005 (seção 2.5 de [conventions.md](conventions.md)), mas não têm comportamento e não introduzem variáveis próprias por enquanto.

## 6. Regras operacionais

### 6.1 Onde cada valor vive e quem o define

| Ambiente | Custódia do valor | Quem define |
| --- | --- | --- |
| `development` | Arquivo local não versionado (`.env.local` ou equivalente), na máquina de quem desenvolve | A própria pessoa desenvolvedora, a partir de credencial de desenvolvimento ou sandbox |
| `preview` | Configuração de variáveis do projeto na plataforma de deploy, escopo `preview`; e, para as conexões usadas pelo workflow de migrations, secrets do GitHub Environment `preview` (hoje `DIRECT_URL` e `DATABASE_URL`, criados por F1-004) | Bruno, como responsável final pelo produto ([ai-agent-workflow.md](ai-agent-workflow.md), seção 1), ou quem ele designar — F1-004 executou essa custódia por delegação, sem que nenhum valor trafegasse por canal de trabalho |
| `production` | Configuração de variáveis do projeto na plataforma de deploy, escopo `production`; e segredo do job de CI/CD, para a conexão de migrations | Bruno, ou quem ele designar |

Regras de custódia:

1. **O repositório nunca é o lugar do valor.** O repositório guarda o **nome** e o **contrato** da variável, em [../../.env.example](../../.env.example) e neste documento; o valor vive no ambiente.
2. **Nenhum valor real trafega por canal de trabalho.** Segredo não vai em PR, issue, commit, relatório de agente, log de CI, mensagem, captura de tela ou anexo de tarefa ([ai-agent-workflow.md](ai-agent-workflow.md), seção 7).
3. **Um segredo por ambiente.** O mesmo valor não é reaproveitado entre `development`, `preview` e `production`, ainda que o provedor permita.
4. **Menor escopo possível.** Quando o provedor permitir credencial restrita a um bucket, a uma operação ou a um projeto, é essa a credencial usada — não a de conta inteira.

### 6.2 Como uma variável nova é adicionada

A ordem é deliberada: **documento primeiro, exemplo junto, código depois.**

1. Registrar a variável neste documento, na área correta da seção 5, com nome, ambientes, classificação, obrigatoriedade, estado e **origem normativa**. Variável sem fonte normativa não entra: se ela não é exigida por ADR, requisito, documento de arquitetura ou decisão registrada, o que falta é a decisão, não a variável.
2. Acrescentar o nome em [../../.env.example](../../.env.example), com **placeholder seguro** e na mesma ordem das áreas deste documento.
3. Definir o valor em cada ambiente onde a variável é obrigatória, pela custódia da seção 6.1.
4. Só então escrever o código que a lê — em PR própria, com a validação na fronteira que [conventions.md](conventions.md), seção 3.5, exige de toda entrada externa.

**Na mesma PR.** Alteração deste documento e de `.env.example` andam juntas. Um `.env.example` que diverge do catálogo é pior do que não existir: ele ensina errado.

**Renomear ou remover** uma variável segue o mesmo caminho, na ordem inversa — primeiro o código deixa de lê-la, depois o valor sai dos ambientes, por último o nome sai do documento e do exemplo.

### 6.3 Rotação e revogação

1. **Toda credencial é rotacionável.** Nenhuma integração pode depender de um valor que não possa ser trocado sem reescrever código.
2. **Rotação é troca de valor no ambiente**, nunca alteração do repositório: o nome da variável não muda na rotação.
3. **Rotação obrigatória** quando: houver suspeita ou confirmação de exposição (seção 6.4); alguém com acesso ao valor deixar de precisar dele; ou o provedor sinalizar comprometimento.
4. **Revogação precede substituição** quando há suspeita de comprometimento: primeiro a credencial antiga deixa de valer, depois a nova é emitida. A ordem inversa mantém uma credencial exposta ativa por conveniência.
5. **Chave secreta de webhook do Mercado Pago** é gerada no painel, sem prazo de validade e com botão de reset ([../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), fontes consultadas). Resetá-la invalida a anterior: a troca da variável no ambiente e o reset no painel são **o mesmo ato**, e entre um e outro as notificações passam a falhar a validação. Isso é comportamento correto — notificação não validada não produz efeito — e a reconciliação por consulta à order reconstrói o estado sem depender de nenhuma notificação ([../architecture/payments-design.md](../architecture/payments-design.md), PD-6.5).
6. **Rotação não é evento silencioso.** Quem rotaciona registra o quê, quando e por quê — sem registrar, em nenhuma hipótese, o valor antigo ou o novo.

### 6.4 Suspeita de vazamento

Um segredo é considerado **comprometido** a partir da suspeita razoável, não da confirmação. Sequência:

1. **Revogar imediatamente** a credencial no provedor. Revogar primeiro; investigar depois.
2. **Emitir nova credencial** e atualizar o valor nos ambientes afetados (seção 6.1).
3. **Determinar a superfície de exposição:** o valor entrou em commit, em log, em bundle de cliente, em mensagem, em captura de tela, em relatório?
4. **Se entrou em commit**, tratar o histórico como público a partir daquele push: remover do conteúdo atual **não** desfaz a exposição. A credencial já revogada é o que encerra o risco.
5. **Avaliar dano:** o que aquela credencial alcançava — banco, bucket, conta de pagamento, envio de email — e se houve uso indevido.
6. **Registrar o incidente** com fato, instante, superfície, ação tomada e correção estrutural, **sem** reproduzir o valor exposto.
7. **Corrigir a causa**, não o sintoma: um segredo em variável pública, em log ou em mensagem de erro é defeito de código ou de processo e sai desta lista com correção estrutural, não com uma rotação ([conventions.md](conventions.md), seção 6, item 8).

Se o vazamento envolver, junto com o segredo, dado pessoal ou dado protegido, aplica-se também [../product/data-retention-policy.md](../product/data-retention-policy.md) (DEC-033) e a avaliação de obrigações de LGPD (RNF-009, R-06). Este documento não define o procedimento de notificação a titulares e a autoridade: isso é trabalho jurídico próprio, e a sua ausência aqui **não** o dispensa.

### 6.5 Onde um segredo nunca pode aparecer

Proibições que valem em todos os ambientes, inclusive `development`:

| Superfície | Regra | Origem |
| --- | --- | --- |
| Bundle de cliente | Nenhum segredo, nem indiretamente por variável pública | RNF-015; [conventions.md](conventions.md), seção 3.2; AR-4.3 |
| Log | Log estruturado sem credencial, sem token e sem conteúdo integral de requisição que possa contê-los, em **nenhum nível** de log | RNF-018; [conventions.md](conventions.md), seção 6, item 6 |
| Mensagem de erro devolvida ao cliente | Nada de detalhe de configuração, de provedor externo ou de conexão | [conventions.md](conventions.md), seção 3.7 |
| Telemetria e observabilidade | Nenhum segredo e nenhum dado protegido. A lista explícita do que **não** pode ser enviado — e a proibição de telefone/WhatsApp como chave de correlação — está em [../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md), decisões 5 e 6 | RNF-018; AR-14.4; DEC-039 |
| Trilha de auditoria | Nenhum segredo, nem payload capaz de reconstituí-lo | AR-9.5; PD-6.2 |
| Repositório, PR, commit, relatório | Nenhum valor real, em nenhuma forma | RNF-015; [ai-agent-workflow.md](ai-agent-workflow.md), seção 7 |
| Teste e fixture | Nenhum segredo real e nenhum dado pessoal real | [testing.md](testing.md), seção 1, item 6 |

## 7. `.env.example` e `.gitignore`

### 7.1 `.env.example`

[../../.env.example](../../.env.example) é o **espelho versionado do catálogo da seção 5**: mesmos nomes, mesma ordem de áreas, nenhum valor real.

Regras:

1. Contém **apenas nomes e placeholders seguros**. Nenhum valor real, de nenhum ambiente, em nenhuma circunstância.
2. Os placeholders são **obviamente fictícios** e não confundíveis com valor real: hosts usam o domínio reservado `example.invalid`, que por definição nunca resolve (RFC 2606 e RFC 6761), e segredos usam o literal `SUBSTITUIR_...`.
3. É o **único** arquivo de ambiente versionado. Ele existe porque `.gitignore` abre uma exceção explícita para ele.
4. Copiá-lo é o primeiro passo de quem configura `development`: o arquivo derivado — `.env.local` ou equivalente — **não** é versionado.
5. Um nome no catálogo e ausente do exemplo, ou o inverso, é defeito e é corrigido na PR que o introduziu (seção 6.2).

### 7.2 `.gitignore`

O [../../.gitignore](../../.gitignore) versionado já protege os arquivos de ambiente reais, com a exceção necessária ao exemplo:

```
.env
.env.*
!.env.example
```

Esse trecho **não** é alterado por este trabalho: ele já estava correto e a sua preservação é o requisito (RNF-015). Qualquer alteração futura nele é mudança de segurança e exige revisão reforçada ([ai-agent-workflow.md](ai-agent-workflow.md), seção 8).

## 8. Rastreabilidade

| Requisito ou decisão | Onde este documento o atende |
| --- | --- |
| RNF-015 — proteção de segredos | Seções 2.5, 3.2, 6.1, 6.3, 6.4, 6.5, 7 |
| RNF-007 — segurança server-side | Seções 3.1, 3.2, 5.5 |
| RNF-008 e DEC-023 — dado protegido | Seção 3.4 |
| RNF-013 — manutenibilidade | Seções 4 e 6.2 |
| RNF-014 — validação de entradas | Seções 5.6 e 6.2, item 4 |
| RNF-017 — portabilidade de provedores | Seções 4, 5.1 e 5.3 |
| RNF-018 — observabilidade sem segredo | Seções 5.8 e 6.5 |
| DEC-039 / ADR-0007 — provedor de observabilidade, DSN pública e token de build | Seção 5.8 |
| DEC-011, DEC-038, R-09 — plano da Vercel | Seções 2.2 e 2.3 |
| DEC-036 / ADR-0004 — credenciais do gateway | Seção 5.6 |
| DEC-038 / ADR-0006 — segredo de agendamento e endpoint pooled | Seções 5.2 e 5.7 |
| DEC-026 / ADR-0005 — conexão pooled e direta | Seção 5.2 |
| ADR-0003 e DEC-028 — R2 e derivados públicos | Seção 5.3 |
| DEC-012, DEC-013 — autenticação | Seção 5.5 |
| DEC-015 — email transacional | Seção 5.4 |

## 9. Referências

- [conventions.md](conventions.md) — fronteira servidor/cliente, segredos, segurança e comandos de qualidade
- [testing.md](testing.md) — estratégia de testes
- [ai-agent-workflow.md](ai-agent-workflow.md) — hierarquia de verdade, Git e governança de `main`
- [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md) — PostgreSQL e Neon
- [../adr/0003-object-storage-r2.md](../adr/0003-object-storage-r2.md) — Cloudflare R2 por API S3-compatible
- [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) — gateway Pix homologado, credenciais e webhook
- [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md) — Prisma, migrations e conexões pooled/direta
- [../adr/0006-async-work-scheduling-concurrency.md](../adr/0006-async-work-scheduling-concurrency.md) — agendamento, segredo de trabalho e endpoint pooled
- [../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md) — Sentry como plataforma de observabilidade, isolamento por ambiente, fronteiras de privacidade e contrato de variáveis
- [../architecture/overview.md](../architecture/overview.md) — camadas, fronteiras de confiança, imagens, observabilidade e agendamento
- [../architecture/payments-design.md](../architecture/payments-design.md) — segurança de pagamentos e endpoints protegidos
- [../product/requirements.md](../product/requirements.md) — RNF-007, RNF-008, RNF-013 a RNF-018
- [../delivery/risks.md](../delivery/risks.md) — R-03, R-08, R-09
- [../../.env.example](../../.env.example) — espelho versionado deste catálogo
