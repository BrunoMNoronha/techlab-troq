# Convenções de engenharia — TROQ

Base normativa de código, organização e qualidade para a implementação da aplicação. Este documento é **preparatório da Fase 1**: ele define os padrões que o futuro scaffold e o futuro CI devem materializar, para que essa tarefa não precise rediscutir padrões básicos.

**O que este documento não faz:** não cria aplicação, `package.json`, `src/`, CI, schema ou migration; não instala dependências; não fecha decisão aberta; não altera regra de negócio, ADR ou decisão vigente; não antecipa comportamento de pagamentos.

Fontes e hierarquia de verdade: [ai-agent-workflow.md](ai-agent-workflow.md), seção 2. Em caso de conflito entre este documento e uma decisão registrada em [../decisions/decision-log.md](../decisions/decision-log.md), nos ADRs em [../adr/](../adr/) ou em [../product/business-rules.md](../product/business-rules.md), prevalece a decisão registrada e este documento deve ser corrigido.

Documento irmão: [testing.md](testing.md), que normatiza a estratégia de testes.

## 1. Runtime e toolchain

| Item | Baseline | Observação |
| --- | --- | --- |
| Runtime | **Node.js 24.x LTS** | Mesma linha em desenvolvimento, CI e Vercel |
| Framework | **Next.js 16.3.x**, linha Active LTS com patches de segurança atuais | Referência validada: `16.3.3` |
| Linguagem | **TypeScript** em modo `strict` | Ver seção 4 |
| Roteamento | **App Router** | [ADR-0001](../adr/0001-modular-monolith-nextjs.md) |
| Acesso a dados | Prisma ORM linha 7.x, versão exata | [ADR-0005](../adr/0005-prisma-orm-migrations.md) |
| Formatação | **Prettier** | Fonte única de estilo |
| Análise estática | **ESLint** | Correção e risco, não estilo |
| Testes | Vitest 5.x e React Testing Library | Ver [testing.md](testing.md) |

### 1.1 Versionamento e reprodutibilidade

- A linha de Node é declarada no repositório (por exemplo, `engines` e arquivo de versão de runtime) e é a mesma usada localmente, no CI e na plataforma de deploy. Divergência de linha maior entre esses ambientes é defeito, não detalhe de configuração.
- **Lockfile é versionado e obrigatório.** Instalações em CI usam o modo determinístico do gerenciador (`npm ci` ou equivalente), nunca resolução livre de versões.
- Dependências que participam de regra crítica — Prisma, framework, runtime — são **pinadas em versão exata**, sem `^` nem `~`. Para Prisma isso já é decisão vigente e obrigatória ([ADR-0005](../adr/0005-prisma-orm-migrations.md), decisão 3), inclusive a proibição de instalar por `@latest`.
- Para as demais dependências, o intervalo pode ser mais frouxo, mas o lockfile continua sendo a fonte da verdade do que foi efetivamente instalado.
- Atualização de dependência é mudança com diff próprio, não efeito colateral de outra PR.

### 1.2 Política de dependências

- Toda dependência nova precisa de justificativa explícita na PR: qual problema real resolve e por que a plataforma ou o código próprio não resolvem.
- Preferir o que já existe no runtime, no framework ou no conjunto já adotado antes de adicionar pacote.
- Dependência abandonada, sem manutenção ou com API instável não entra em caminho crítico (autenticação, autorização, pagamentos, dados protegidos) sem decisão registrada.
- Adoção de dependência que crie acoplamento arquitetural relevante — outra camada de dados, outro runtime, outro mecanismo de migrations — exige ADR, não apenas uma PR.

### 1.3 Escopo da aplicação

Aplicação **única** Next.js, conforme [ADR-0001](../adr/0001-modular-monolith-nextjs.md). Não há microserviços, não há API Node paralela e não há segundo deploy no MVP. O backend vive na própria aplicação: Route Handlers, Server Actions e código de servidor.

## 2. Organização de código

Esta seção define **princípios** de estrutura. O conjunto de módulos de negócio foi definido depois por F0-022, em [../architecture/overview.md](../architecture/overview.md) (AR-3.3), a partir de [../architecture/data-model.md](../architecture/data-model.md); as camadas estão em AR-3.2. Nenhum módulo funcional é criado por este documento.

### 2.1 Camadas

- `src/app` é a camada de **composição e roteamento** do Next.js: rotas, layouts, Route Handlers, Server Actions e telas. É onde a aplicação é montada, não onde a regra mora.
- Regra de domínio e caso de uso vivem em código próprio, fora de componentes React e fora de handlers de rota. Um componente ou handler **compõe** e **delega**; ele não é o dono da regra.
- Esse código de domínio é importável e testável sem renderizar componente, sem subir servidor HTTP e sem depender de contexto de framework.
- Acesso a dados fica atrás de fronteira explícita. Componentes de tela e handlers não montam consulta arbitrária ao banco espalhada pela aplicação.

### 2.2 Fronteiras de módulo

- Cada módulo tem **fronteira explícita**: um ponto de entrada público e um interior privado. O que não faz parte do ponto de entrada não é importado de fora.
- Dependências entre módulos são **direcionais e explícitas**. Ciclos entre módulos são defeito estrutural e devem ser resolvidos por inversão ou por extração, não por importação atravessada.
- Um módulo não lê nem manipula dados protegidos de outro módulo sem interface explícita desse outro módulo (RNF-013, RNF-008).
- Fronteira de módulo é o que preserva a possibilidade de extração futura prevista em [ADR-0001](../adr/0001-modular-monolith-nextjs.md). Ela é disciplina de código, não separação física.

### 2.3 Código compartilhado

- Código só vai para um espaço compartilhado quando existir compartilhamento **real e atual** — mais de um consumidor de fato, não previsão de que haverá.
- **É proibido criar `utils` genérico** (ou `helpers`, `common`, `misc` e equivalentes) como depósito de responsabilidades não relacionadas. Se um conjunto de funções tem um nome honesto, esse nome é o módulo; se não tem, provavelmente pertence a quem o usa.
- Duplicação pequena e local é preferível a uma abstração compartilhada errada e prematura.

### 2.4 Nomes e arquivos

- Nomes descrevem intenção de domínio, não mecanismo. O vocabulário do código segue o vocabulário dos documentos de produto (anúncio, solicitação paga, escolha, liberação de contato, negociação, encerramento, avaliação, denúncia, moderação).
- Convenções de nomeação de arquivos e diretórios são consistentes dentro de cada camada e definidas de uma vez no scaffold; o valor está na consistência, não na escolha específica.
- Um arquivo que precisa de um comentário explicando por que contém coisas não relacionadas está pedindo para ser dividido.

## 3. Fronteira servidor / cliente

Esta seção implementa, em nível de código, decisões já vigentes: RNF-007 (segurança server-side), RNF-008 (dados protegidos), RNF-014 (validação de entradas), RB-001 e RB-005.

### 3.1 Padrão de renderização

- **Server Components são o padrão.** Um componente só é de cliente quando há necessidade concreta: estado de interação, evento de usuário, API exclusiva do browser, ciclo de vida de efeito.
- `"use client"` é decisão deliberada e localizada. Marca-se o componente que realmente precisa, o mais próximo possível da folha, nunca uma raiz inteira por conveniência.
- Marcar um componente como cliente para contornar um erro de build ou de tipo é tratar sintoma; a causa deve ser resolvida.

### 3.2 Segredos e acesso a dados

- Segredos e credenciais são **exclusivamente server-side**, em variável de ambiente por ambiente, nunca versionados e nunca presentes no bundle do cliente (RNF-015).
- Acesso a banco é **exclusivamente server-side**. Nenhum Client Component fala com o banco, direta ou indiretamente.
- Nenhum segredo é exposto por variável pública de build. Uma variável prefixada como pública é, por definição, conteúdo público.

### 3.3 Dados protegidos

- **Telefone/WhatsApp é dado protegido.** Nunca aparece em Client Component, payload público, cache público, resposta de rota pública, URL, mensagem de erro, telemetria ou log — em nenhum nível de log e em nenhum ambiente (RB-001, RNF-008, DEC-023).
- Um dado protegido que chegou ao cliente é incidente, mesmo que a interface não o tenha renderizado: o payload é acessível.
- Consultas que alimentam tela pública selecionam explicitamente os campos que podem ser públicos. Não se entrega o registro inteiro esperando que a camada de cima filtre.
- **Localização pública é limitada a cidade/UF** (RB-005). Nenhuma estrutura pública carrega localização mais precisa.

### 3.4 Autorização

- **Autorização é sempre server-side.** Esconder um botão, uma rota ou um trecho de tela não é autorização — é apresentação.
- Toda operação sensível verifica no servidor, no momento da execução, se o ator tem direito àquela ação, com os dados do servidor e não com o que o cliente afirmou.
- A liberação de contato exige autorização server-side e auditoria (RB-001, RF-014, RF-015, RF-022, RNF-011). Nenhum caminho de código pode liberar contato sem passar por essa verificação.
- Operações críticas são auditáveis: registram ator, ação, alvo e instante, em trilha não editável, sem conter o dado protegido em texto puro.

### 3.5 Validação de entrada

- **Toda entrada externa é validada na fronteira do servidor**, antes de qualquer uso: formulário, parâmetro de rota, query string, corpo de requisição, webhook (RNF-014).
- Validação no cliente existe para experiência de uso; ela nunca substitui a validação do servidor e nunca é a única.
- A validação produz um tipo confiável: depois da fronteira, o código de domínio trabalha com dado já validado, não com dado provavelmente certo.
- Entrada inválida gera erro controlado e previsível, com resposta que não revela detalhe interno.

### 3.6 Route Handlers e Server Actions

- Route Handler e Server Action são **adaptadores**: recebem, validam, autorizam, delegam ao caso de uso e traduzem o resultado em resposta.
- **Controllers gordos são proibidos.** Regra de negócio relevante não mora no handler; mora em código de domínio testável sem HTTP.
- Uma regra crítica implementada dentro de um handler é, por construção, difícil de testar sob concorrência — o que a torna inadequada para RB-003 e para idempotência.

### 3.7 Erros

- Erro interno não vaza para o cliente: nada de stack trace, SQL, nome de tabela, mensagem de biblioteca, detalhe de provedor externo ou trecho de configuração.
- O cliente recebe uma mensagem útil e estável; o detalhe técnico vai para o log estruturado do servidor, sem dado protegido e sem segredo (RNF-018).
- Mensagem de erro não é canal lateral de informação: uma resposta não deve permitir inferir a existência de recurso ao qual o ator não tem acesso.

## 4. TypeScript

- **`strict` habilitado**, sem desativar flags de rigor individualmente para acomodar código difícil.
- **`any` é evitado.** Onde o tipo é genuinamente desconhecido, usa-se `unknown` e faz-se narrowing explícito.
- **Cast não mascara inconsistência.** `as` e asserções não-nulas não são a resposta para "o compilador está errado": em geral o compilador está apontando um caso real não tratado.
- Suprimir erro de tipo (`@ts-ignore`, `@ts-expect-error` sem justificativa, `eslint-disable` sem justificativa) é exceção que exige comentário explicando por que a causa-raiz não pôde ser corrigida — e é assunto de revisão, não de conveniência.
- **Validação de runtime nas fronteiras.** Tipo estático não valida o que entra de fora do processo; entrada externa é validada e só então tipada (ver 3.5).
- **Tipos representam invariantes quando razoável**: estados que não podem coexistir não são modelados como campos opcionais soltos; um valor que só é válido em um estado pertence a esse estado.
- **Tipos não são duplicados quando podem ser derivados com segurança** da fonte (schema de validação, schema de dados, retorno de caso de uso). Duplicata manual diverge silenciosamente.
- **Ausência de dado é explícita.** `null`/`undefined` são tratados como casos reais; não se usa valor sentinela nem string vazia para representar ausência.
- **Valores monetários nunca usam ponto flutuante em regra financeira.** Nenhum cálculo, comparação, soma ou conferência de valor devido pode depender de `number` em ponto flutuante. A representação interna deve ser exata — inteiro em unidade mínima ou tipo decimal — e a conversão para exibição é responsabilidade da camada de apresentação. Isso vale para o valor de R$ 0,99 (RB-004), que precisa ser exatamente esse valor.
  - Este documento **não** define a representação persistida de pagamento, o nome dos campos nem o formato trocado com o gateway: isso pertence ao desenho de pagamentos, produzido depois por F0-022 em [../architecture/payments-design.md](../architecture/payments-design.md), e ao modelo de [../architecture/data-model.md](../architecture/data-model.md). Não há decisão aberta pendente.

## 5. Qualidade

### 5.1 Comandos padronizados

O scaffold deve implementar exatamente estes comandos. Eles são o contrato entre desenvolvimento, revisão e CI, e não devem ser renomeados sem atualizar este documento.

| Comando | Contrato |
| --- | --- |
| `npm run format` | Aplica a formatação (Prettier) ao repositório. Escreve arquivos |
| `npm run format:check` | Verifica formatação sem escrever. Falha se houver divergência. Adequado a CI |
| `npm run lint` | Executa ESLint. Falha em erro; avisos não podem acumular indefinidamente |
| `npm run typecheck` | Verificação de tipos sem emitir artefato. Falha em qualquer erro de tipo |
| `npm run test` | Suíte de testes em modo de desenvolvimento |
| `npm run test:ci` | Suíte de testes em modo não interativo e determinístico, adequado a CI |
| `npm run build` | Build de produção da aplicação |

### 5.2 Divisão de responsabilidade entre Prettier e ESLint

- **Prettier é o dono da formatação.** Estilo puramente visual — aspas, ponto e vírgula, largura de linha, indentação, quebra — não é discutido em revisão: é aplicado pela ferramenta.
- **ESLint cuida de correção e risco**, não de estilo. Regras puramente estilísticas que conflitem com o Prettier são desativadas, para não haver duas fontes de verdade nem ruído de conflito.
- Nem Prettier nem ESLint decidem arquitetura: as regras das seções 2 e 3 continuam valendo mesmo que nenhuma ferramenta as verifique automaticamente. Automatizar parte delas por regra de lint é desejável quando viável.

### 5.3 Validação da entrega

- **Nenhuma entrega de código relevante é considerada validada sem executar os checks aplicáveis.** O mínimo, quando existe código, é `format:check`, `lint`, `typecheck`, `test:ci` e `build`.
- Validação não executada é reportada como "não executada" ou "não aplicável", com motivo — nunca como aprovada ([ai-agent-workflow.md](ai-agent-workflow.md), seção 6).
- Falha de check é resolvida na causa. Desativar regra, marcar teste como `skip`, relaxar `strict` ou afrouxar o check para o build passar é proibido sem justificativa registrada e aceita em revisão.
- Mudanças em autenticação, autorização, pagamentos, segurança, dados, migrations, LGPD e regras RB-001 a RB-006 seguem **revisão reforçada** ([ai-agent-workflow.md](ai-agent-workflow.md), seção 8).

### 5.4 Commits e PRs

- Commits pequenos e semânticos, mensagem no formato `tipo: descrição` ([ai-agent-workflow.md](ai-agent-workflow.md), seção 7).
- Uma PR tem um objetivo. Mudança não relacionada — reformatação em massa, renomeação ampla, upgrade de dependência — vai em PR própria, para que o diff continue revisável.
- Migrations entram na mesma PR da mudança que as motivou ([ADR-0005](../adr/0005-prisma-orm-migrations.md), decisão 5).

## 6. Segurança

Princípios já aprovados, aqui incorporados como norma de código. Eles não substituem os documentos de origem.

1. **Nenhuma credencial versionada.** Segredos vivem em variável de ambiente por ambiente; `.env*` permanece fora do versionamento; credencial de produção nunca é usada em máquina de desenvolvimento nem em ambiente de preview (RNF-015; [ADR-0005](../adr/0005-prisma-orm-migrations.md), decisão 10).
2. **Validação de entrada** em toda fronteira externa, no servidor (RNF-014; seção 3.5).
3. **Autorização server-side** em toda operação sensível; a interface não autoriza (RNF-007; seção 3.4).
4. **Consultas seguras.** Acesso a dados pelo ORM adotado; quando SQL explícito for necessário — e ele será, para bloqueios, restrições parciais e `ON CONFLICT` ([ADR-0005](../adr/0005-prisma-orm-migrations.md)) — usa-se sempre parametrização. **Concatenar entrada em SQL é proibido.**
5. **Proteção de dados pessoais.** Coleta mínima, campos públicos explícitos, telefone/WhatsApp protegido, localização pública limitada a cidade/UF (RNF-008, RB-005).
6. **Logs sem segredos e sem dados protegidos.** Log estruturado, suficiente para operar, sem telefone/WhatsApp, sem credencial, sem token e sem conteúdo integral de requisição que possa conter esses dados (RNF-018).
7. **Operações críticas auditáveis.** Liberação de contato, escolha, encerramento, decisão de moderação e demais operações críticas produzem trilha consultável e não editável (RF-022, RNF-011).
8. **Causa-raiz em vez de contorno.** Suppression de lint ou de tipo, `skip` de teste, mock impróprio e cast inseguro não são solução: são dívida que esconde o defeito. Ver também [testing.md](testing.md), seção 6.

## 7. Referências

- [testing.md](testing.md) — estratégia de testes
- [ai-agent-workflow.md](ai-agent-workflow.md) — modo operacional, relatório obrigatório e Git
- [../adr/0001-modular-monolith-nextjs.md](../adr/0001-modular-monolith-nextjs.md) — monólito modular, Next.js + TypeScript, App Router
- [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md) — PostgreSQL e Neon
- [../adr/0003-object-storage-r2.md](../adr/0003-object-storage-r2.md) — Cloudflare R2 via API S3-compatible
- [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md) — Prisma ORM e Prisma Migrate
- [../product/business-rules.md](../product/business-rules.md) — RB-001 a RB-006
- [../product/requirements.md](../product/requirements.md) — RF-xxx e RNF-xxx
- [../architecture/overview.md](../architecture/overview.md) — camadas, módulos de domínio e fronteiras de confiança
- [../architecture/data-model.md](../architecture/data-model.md) — entidades e invariantes
- [../decisions/open-decisions.md](../decisions/open-decisions.md) — decisões abertas; atualmente nenhuma
