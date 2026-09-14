# Prompt executor — F1-001 — Contrato de ambientes e segredos

Prompt versionado do **primeiro trabalho da Fase 1**. Produzido por F0-023 e registrado em [../phase-1-transition.md](../phase-1-transition.md), seção 11.

Este arquivo é um **prompt executor**, não uma implementação. Nada aqui foi executado. Ele segue a estrutura obrigatória de [../../engineering/ai-agent-workflow.md](../../engineering/ai-agent-workflow.md), seção 5.

---

## 1. Papel

Você é o agente executor do projeto TechLab+ TROQ. O ChatGPT é o orquestrador e Bruno é o responsável final pelo produto ([../../engineering/ai-agent-workflow.md](../../engineering/ai-agent-workflow.md), seção 1).

Execute **exclusivamente** a tarefa F1-001. Não amplie o escopo, não feche decisão, não escolha tecnologia pendente e não implemente funcionalidade de produto. Diante de bloqueio, **interrompa e reporte** (seção 14) em vez de improvisar.

## 2. Contexto

A **Fase 0 está concluída**. Seu gate de saída foi auditado e aprovado por F0-023, com matriz critério → evidência → resultado em [../phase-1-transition.md](../phase-1-transition.md). Não resta decisão aberta.

A **Fase 1 está habilitada e não implementada**. O estado factual dos seus sete entregáveis está classificado na seção 10 daquele documento. O que importa para esta tarefa:

| Entregável | Estado | Consequência para F1-001 |
| --- | --- | --- |
| Scaffold Next.js + App Router | **parcial** (existe; faltam os módulos de AR-3.3) | **Não recriar.** Não executar `create-next-app` |
| Comandos de qualidade e configs de lint/format/teste | **já existente** | **Não recriar.** Não renomear script |
| CI de validação | **já existente** | **Não recriar e não renomear o job** |
| Contrato de ambientes e segredos | **não iniciado** | **É esta tarefa** |
| Neon/Prisma/schema/migrations | **não iniciado** | **Fora desta tarefa** |
| R2, Resend provisionados | **não iniciado** | **Fora desta tarefa** |
| Observabilidade | **não iniciado** | **Fora desta tarefa** |

Estado técnico conhecido, a confirmar por inspeção e não a presumir: Node.js 24.x, Next.js 16.3.x, TypeScript `strict`, App Router, React, ESLint, Prettier, Vitest, React Testing Library, instalação por `npm ci`, scripts `format`, `format:check`, `lint`, `typecheck`, `test`, `test:ci` e `build`, CI existente e preview da Vercel funcionando a partir de PR.

O `.gitignore` já contém `.env`, `.env.*` e a exceção `!.env.example`. Não existe `.env.example` no repositório.

**Governança de `main`:** ruleset `Protect main` ativo, PR obrigatória, zero approvals exigidos pela plataforma, required status check `Validação (format, lint, typecheck, test, build)` com política estrita e **sem bypass actors**. Leia o estado real antes de concluir; o ruleset vive fora do versionamento.

## 3. Fontes obrigatórias

Leia integralmente antes de qualquer alteração, na hierarquia de [../../engineering/ai-agent-workflow.md](../../engineering/ai-agent-workflow.md), seção 2:

**Estado e governança**

- [../../project-state.md](../../project-state.md)
- [../../README.md](../../README.md)
- [../../engineering/ai-agent-workflow.md](../../engineering/ai-agent-workflow.md)
- [../phase-1-transition.md](../phase-1-transition.md)

**Decisões**

- [../../decisions/decision-log.md](../../decisions/decision-log.md)
- [../../decisions/open-decisions.md](../../decisions/open-decisions.md)
- [../../adr/0001-modular-monolith-nextjs.md](../../adr/0001-modular-monolith-nextjs.md)
- [../../adr/0002-postgresql-neon.md](../../adr/0002-postgresql-neon.md)
- [../../adr/0003-object-storage-r2.md](../../adr/0003-object-storage-r2.md)
- [../../adr/0004-mercado-pago-pix.md](../../adr/0004-mercado-pago-pix.md)
- [../../adr/0005-prisma-orm-migrations.md](../../adr/0005-prisma-orm-migrations.md)
- [../../adr/0006-async-work-scheduling-concurrency.md](../../adr/0006-async-work-scheduling-concurrency.md)

**Arquitetura**

- [../../architecture/overview.md](../../architecture/overview.md) — em especial camadas, módulos, fronteiras de confiança, componentes externos, observabilidade mínima e trabalho assíncrono
- [../../architecture/payments-design.md](../../architecture/payments-design.md) — o que o gateway exige em termos de credencial e de webhook
- [../../architecture/contact-release.md](../../architecture/contact-release.md)
- [../../architecture/data-model.md](../../architecture/data-model.md) — para saber o que **não** fazer aqui

**Engenharia e planejamento**

- [../../engineering/conventions.md](../../engineering/conventions.md) — em especial seções 3.2, 5.1 e 6
- [../../engineering/testing.md](../../engineering/testing.md)
- [../roadmap.md](../roadmap.md) — entregáveis e gate da Fase 1
- [../risks.md](../risks.md)

**Requisitos**

- [../../product/requirements.md](../../product/requirements.md) — em especial RNF-007, RNF-013, RNF-014, RNF-015, RNF-017 e RNF-018

Leia outras fontes apenas quando necessárias para comprovar um item do escopo ou resolver referência encontrada nessas.

## 4. Objetivo único

Definir e materializar o **contrato de ambientes e segredos** da aplicação, sem provisionar serviços externos e sem iniciar o schema de domínio.

## 5. Escopo

1. Inspecionar o estado real do repositório e do GitHub antes de qualquer alteração.
2. Criar `docs/engineering/environments.md` como fonte normativa dos ambientes e das variáveis.
3. Definir com clareza os três ambientes: `development`, `preview` e `production`.
4. Classificar toda variável entre **pública** e **exclusivamente server-side**, com o critério de classificação explícito.
5. Registrar a proibição explícita de segredo em variável pública.
6. Criar ou ajustar `.env.example` contendo **apenas nomes** e valores fictícios ou placeholders seguros.
7. Preservar `.gitignore` de modo que `.env` reais continuem fora do versionamento.
8. Documentar as variáveis necessárias ou previstas por área (seção 8).
9. Atualizar o índice [../../README.md](../../README.md) para marcar `engineering/environments.md` como **existente**.
10. Atualizar [../../project-state.md](../../project-state.md) e o backlog da Fase 1 para refletir a conclusão de F1-001.
11. Executar as validações da seção 12 e entregar por PR, conforme a seção 13.

## 6. Não escopo

Fica expressamente fora desta tarefa:

- recriar o scaffold Next.js ou executar `create-next-app`;
- recriar, renomear ou reescrever os scripts de qualidade de `package.json`;
- alterar `.github/workflows/ci.yml`, o nome do job ou o ruleset;
- instalar Prisma, criar `schema.prisma`, criar migration ou qualquer artefato de banco;
- criar a estrutura de módulos de domínio de AR-3.3;
- provisionar, criar conta, criar projeto, criar bucket ou gerar credencial em Neon, Cloudflare R2, Resend, Mercado Pago, Vercel ou qualquer outro serviço;
- conectar-se a qualquer serviço externo, real ou de teste;
- configurar variáveis de ambiente no painel da Vercel ou de qualquer provedor;
- implementar autenticação, pagamentos, anúncios, jobs, PWA ou observabilidade;
- implementar leitura, parsing ou validação de variáveis de ambiente em código (isso é trabalho posterior, quando houver consumidor real);
- adicionar dependência sem necessidade comprovada;
- alterar regra de negócio, requisito, ADR ou decisão vigente;
- criar ADR ou DEC apenas para registrar que a tarefa terminou;
- atualizar dependências;
- deploy ou publicação de produto.

## 7. Arquivos esperados

**Criar**

- `docs/engineering/environments.md`
- `.env.example`

**Alterar quando aplicável**

- `docs/README.md` — mover `engineering/environments.md` de `futuro` para `existente`, com o resumo de conteúdo no padrão do índice
- `docs/project-state.md` — registrar F1-001 concluído e o contrato de ambientes como existente
- `docs/delivery/backlog.md` — registrar F1-001 como concluído no backlog da Fase 1, criando a seção da Fase 1 se ela ainda não existir
- `README.md` — somente se algum texto de estado ficar factualmente desatualizado
- `.gitignore` — somente se a inspeção provar que ele **não** protege `.env` reais; o estado conhecido é que já protege

**Não esperado**

- código de aplicação;
- `package.json` ou lockfile;
- `schema.prisma`, migration ou qualquer artefato de banco;
- arquivo de configuração de serviço externo;
- qualquer `.env` real ou credencial.

Qualquer arquivo extra alterado deve ser justificado no relatório.

## 8. Conteúdo obrigatório de `docs/engineering/environments.md`

### 8.1 Ambientes

Definir os três, cada um com propósito, origem dos dados, quem pode acessar e que classe de credencial é admissível:

| Ambiente | Ponto a fixar |
| --- | --- |
| `development` | Máquina do desenvolvedor. **Credencial de produção nunca é usada aqui** ([../../engineering/conventions.md](../../engineering/conventions.md), seção 6, item 1) |
| `preview` | Deployment por PR na Vercel. Isolado de produção, com dados e credenciais próprios |
| `production` | Ambiente comercial. Plano Vercel pago, nunca Hobby (DEC-011, DEC-038, R-09) |

### 8.2 Classificação das variáveis

- Critério objetivo e verificável para separar **pública** de **exclusivamente server-side**.
- Regra explícita de que uma variável exposta ao cliente é, por definição, **conteúdo público**, conforme [../../engineering/conventions.md](../../engineering/conventions.md), seção 3.2.
- **Proibição explícita de segredo em variável pública**, sem exceção.
- Nenhum dado protegido — telefone/WhatsApp — em variável de qualquer classe.

### 8.3 Catálogo de variáveis por área

Documentar as variáveis **necessárias ou previstas**, com nome, ambiente em que se aplica, classificação, obrigatoriedade e origem da exigência. Marcar claramente o que é **previsto** e ainda não consumido por código, para não induzir a leitura de que já existe integração.

Áreas obrigatórias:

1. **Aplicação** — URL pública, ambiente corrente e afins.
2. **PostgreSQL/Neon** — conexão, e a distinção entre endpoint pooled e direto exigida por [../../adr/0005-prisma-orm-migrations.md](../../adr/0005-prisma-orm-migrations.md) e por [../../adr/0006-async-work-scheduling-concurrency.md](../../adr/0006-async-work-scheduling-concurrency.md), que registra que o endpoint pooled do Neon **não** suporta trava consultiva de sessão.
3. **Cloudflare R2** — credenciais S3-compatible, bucket e host público dos derivados ([../../adr/0003-object-storage-r2.md](../../adr/0003-object-storage-r2.md)).
4. **Resend** — chave de API e remetente.
5. **Autenticação (Better Auth)** — segredo de sessão e URL base.
6. **Mercado Pago** — Access Token e chave secreta de webhook, **ambos exclusivamente server-side**, conforme [../../adr/0004-mercado-pago-pix.md](../../adr/0004-mercado-pago-pix.md). Registrar que a URL de webhook é configurada **no nível da aplicação** e que enviar `notification_url` em `POST /v1/orders` é proibido.
7. **Jobs internos e agendamento** — o segredo que protege os endpoints de trabalho, exigido por [../../adr/0006-async-work-scheduling-concurrency.md](../../adr/0006-async-work-scheduling-concurrency.md).

### 8.4 Regras operacionais

- Onde cada valor vive por ambiente e quem o define.
- Como uma variável nova é adicionada (documento primeiro, `.env.example` junto).
- Rotação e revogação de credencial.
- O que fazer diante de suspeita de vazamento.
- Que nenhum segredo entra em log, mensagem de erro, telemetria ou bundle de cliente (RNF-015, RNF-018).

## 9. Regras a preservar

1. **Nenhuma credencial real** entra no repositório, no `.env.example`, em documento, em log, em commit ou no relatório. Placeholders devem ser obviamente fictícios e não confundíveis com valor real.
2. **Nenhum dado pessoal real** em documento, exemplo ou fixture.
3. Regras de negócio **RB-001 a RB-006** não são alteradas.
4. Nenhuma decisão vigente (DEC-001 a DEC-038) é modificada, e nenhuma decisão fechada é reaberta.
5. Nenhum requisito tem conteúdo normativo alterado.
6. O vocabulário do documento segue o dos documentos de produto e arquitetura.
7. Código existente é evidência, nunca requisito automaticamente homologado ([../../engineering/ai-agent-workflow.md](../../engineering/ai-agent-workflow.md), seção 2).
8. Nada neste trabalho pode declarar a Fase 1 concluída nem afirmar que o gate da Fase 1 foi satisfeito.

## 10. Sequência de execução

1. Inspecionar Git e GitHub: remote, branch, `HEAD`, `origin/main`, working tree, stashes, PRs abertas, branches locais e ruleset real de `main`.
2. Confirmar que nenhuma alteração local preexistente será perdida.
3. Ler todas as fontes da seção 3.
4. Inspecionar o estado real do repositório: `package.json`, scripts, `.gitignore`, `.github/workflows/ci.yml`, `src/`, presença ou ausência de `prisma/` e de `.env*`.
5. Levantar as variáveis exigidas ou previstas por cada ADR e pelos documentos de arquitetura, com a citação de origem de cada uma.
6. Redigir `docs/engineering/environments.md`.
7. Criar `.env.example` alinhado, campo a campo, ao catálogo do documento.
8. Conferir que `.gitignore` continua impedindo o versionamento de `.env` reais.
9. Atualizar `docs/README.md`, `docs/project-state.md` e `docs/delivery/backlog.md`.
10. Executar buscas de consistência e verificação de links internos.
11. Executar as validações da seção 12.
12. Revisar integralmente o diff, com varredura por segredos.
13. Commits pequenos e semânticos; push; PR para `main`.
14. Aguardar e consultar o required status check real.
15. Confirmar mergeabilidade sob o ruleset real.
16. Squash merge somente com tudo verde.
17. Sincronizar `main` e confirmar o estado final.

## 11. Critérios de aceite

- Estado real inspecionado antes de qualquer alteração, e nenhuma mudança preexistente perdida.
- `docs/engineering/environments.md` existe e contém os três ambientes, o critério de classificação, a proibição de segredo em variável pública, o catálogo das sete áreas da seção 8.3 e as regras operacionais da seção 8.4.
- Cada variável do catálogo tem nome, ambiente, classificação, obrigatoriedade e origem rastreável a uma fonte normativa.
- `.env.example` existe, cobre o catálogo e contém **somente** nomes e placeholders seguros.
- `.gitignore` continua impedindo o versionamento de `.env` reais.
- Nenhuma credencial, token, chave, e-mail real, telefone, CPF ou arquivo de ambiente real entrou no repositório.
- Nenhum serviço externo foi provisionado, acessado ou configurado.
- Nenhum artefato de banco foi criado: sem `prisma/`, sem `schema.prisma`, sem migration.
- Nenhuma funcionalidade de produto foi implementada.
- Scaffold, scripts de qualidade e CI preexistentes foram reconhecidos e **não** recriados.
- Nenhuma dependência nova sem justificativa registrada na PR.
- Nenhuma regra RB-001 a RB-006 e nenhuma decisão vigente foram alteradas.
- `docs/README.md` marca `engineering/environments.md` como existente.
- Documentação consistente, sem link interno quebrado.
- Diff estritamente relacionado a F1-001.
- Validações da seção 12 executadas, com resultado reportado.
- Required status check real verde e PR mergeável sob o ruleset.
- Squash merge realizado apenas depois disso; `main` final sincronizada e working tree limpa.

## 12. Validações obrigatórias

```
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test:ci
npm run build
git diff --check
```

Além disso:

- verificar links Markdown internos dos arquivos alterados;
- confirmar que nenhum arquivo ainda descreve `engineering/environments.md` como `futuro`;
- confirmar que nenhum arquivo passou a afirmar que Neon, R2, Resend ou o Mercado Pago foram provisionados;
- confirmar que nenhum arquivo passou a afirmar que a Fase 1 está concluída;
- conferir `git diff --stat` e `git diff` integralmente;
- varrer o diff em busca de segredos, tokens, chaves, e-mails, telefones, CPF e arquivos de ambiente reais.

**Validação não executada não pode ser apresentada como aprovada** ([../../engineering/ai-agent-workflow.md](../../engineering/ai-agent-workflow.md), seção 6).

## 13. Git

- Branch sugerida: `docs/f1-001-environments-and-secrets`.
- **Nunca trabalhar diretamente em `main`.**
- Sem force-push e sem reescrita desnecessária de histórico.
- Commits pequenos e semânticos, no formato `tipo: descrição`. Exemplos adequados: `docs: definir contrato de ambientes e segredos`, `chore: adicionar .env.example sem valores reais`.
- Abrir PR para `main`.
- Antes do merge: revisar o diff, confirmar o required status check real verde, confirmar mergeabilidade e reler o ruleset se necessário. **Sem bypass administrativo.**
- Estando tudo verde e sem bloqueio, o **squash merge está autorizado**.
- Após o merge: sincronizar `main`, confirmar `HEAD == origin/main`, working tree limpa e ausência de PR aberta referente à tarefa.

## 14. Autonomia

**Pode:**

- escolher a estrutura interna de `docs/engineering/environments.md`;
- escolher os nomes das variáveis, desde que coerentes com o framework, com os provedores decididos e com as convenções do projeto, e desde que cada nome seja justificado no documento;
- ajustar redação e links para manter consistência documental;
- criar branch, commits, push, PR e squash merge;
- executar as validações.

**Não pode:**

- redefinir regra de negócio ou requisito;
- escolher tecnologia nova ou substituir provedor decidido;
- reabrir decisão fechada sem contradição real e demonstrada;
- alterar a governança do GitHub ou o CI;
- provisionar infraestrutura ou acessar serviço externo;
- usar, gerar ou registrar credencial real;
- iniciar schema, migration ou qualquer entregável de outra tarefa;
- ampliar F1-001 para implementação de produto.

## 15. Relatório obrigatório

Encerre com o relatório de [../../engineering/ai-agent-workflow.md](../../engineering/ai-agent-workflow.md), seção 6, nesta ordem: resumo; arquivos criados, alterados e removidos; decisões e desvios; comandos; lint; typecheck; testes; build; riscos; pendências; dependências; migrations; branch; commit; push; PR; merge; deploy; evidências.

Inclua, além disso:

- o estado inicial inspecionado (SHAs, working tree, stashes, PRs, ruleset);
- o catálogo final de variáveis, com classificação e origem;
- a confirmação explícita de que nenhum serviço externo foi provisionado ou acessado;
- a confirmação explícita de que nenhum segredo real entrou no repositório;
- o resultado da varredura de segredos sobre o diff.

## 16. Tratamento de bloqueios

Interrompa e reporte, em vez de improvisar, se:

- `main` divergir materialmente do estado descrito na seção 2;
- existir PR concorrente relevante ou alteração local conflitante;
- o ruleset impedir o fluxo previsto, ou o required status check falhar por causa não relacionada e não corrigível dentro do escopo;
- uma variável necessária não puder ser derivada de fonte normativa sem inventar decisão;
- uma fonte de maior hierarquia contradizer outra;
- concluir a tarefa exigir provisionar serviço, usar credencial real, criar schema ou tomar decisão de produto, de arquitetura ou de negócio.

O relatório de bloqueio segue o mesmo formato da seção 15, com o item "Pendências" descrevendo o bloqueio, a fonte do conflito e a menor ação corretiva recomendada.
