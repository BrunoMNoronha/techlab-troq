# Workflow de agentes de IA — TROQ

Modo operacional do projeto: como Bruno, ChatGPT, Claude Code e Antigravity trabalham juntos, qual fonte prevalece em caso de conflito, como prompts e relatórios são estruturados e quais autorizações e restrições valem para operações Git. Este documento é a fonte oficial da decisão DEC-025 em [../decisions/decision-log.md](../decisions/decision-log.md).

## 1. Papéis

### Bruno

- Responsável final pelo produto.
- Sua decisão explícita mais recente prevalece sobre qualquer documento, prompt ou relatório.
- Não precisa homologar manualmente cada entrega; a homologação manual é exigida apenas quando este documento ou um prompt específico a solicitar (ver seção 8).

### ChatGPT (orquestrador)

- Orquestra o projeto e mantém a visão de conjunto.
- Pesquisa quando necessário.
- Decide dentro da autonomia concedida por Bruno; escala a Bruno o que estiver fora dela.
- Mantém a documentação e a rastreabilidade (decisões, requisitos, roadmap, backlog, riscos).
- Escolhe a **menor próxima ação** que faça o projeto avançar.
- Gera os prompts executores.
- Revisa relatórios, diffs, testes e evidências devolvidos pelos executores.

### Claude Code e Antigravity (executores)

- Executam tarefas delimitadas por um prompt executor.
- Não ampliam o escopo, não fecham decisões abertas, não escolhem tecnologias pendentes.
- Retornam o relatório obrigatório (seção 6) ao final de toda tarefa.
- Interrompem e reportam quando encontram bloqueio (seção 9), em vez de improvisar.

## 2. Hierarquia de verdade

Em caso de conflito entre fontes, prevalece a de menor número:

1. Decisão explícita mais recente de Bruno.
2. Registro formal de decisões: [../decisions/decision-log.md](../decisions/decision-log.md) e [../decisions/open-decisions.md](../decisions/open-decisions.md).
3. Documentação mestra de produto: [../product/mvp-scope.md](../product/mvp-scope.md).
4. Regras e requisitos: [../product/business-rules.md](../product/business-rules.md) e [../product/requirements.md](../product/requirements.md).
5. ADRs e documentação técnica: [../adr/](../adr/), `architecture/`, `engineering/`.
6. Roadmap, backlog, prompts e relatórios: [../delivery/roadmap.md](../delivery/roadmap.md), [../delivery/backlog.md](../delivery/backlog.md).
7. Código existente.

Código existente é **evidência** do que foi implementado, nunca requisito automaticamente homologado. Um conflito detectado entre níveis deve ser reportado e corrigido na fonte de nível superior ou na inferior, conforme a decisão vigente, e nunca resolvido silenciosamente.

## 3. Ciclo operacional

Cada iteração do projeto segue este ciclo:

1. **Compreender o estado:** ler [../project-state.md](../project-state.md), backlog e decision log.
2. **Inspecionar as fontes:** documentação e, quando existir, código, na hierarquia da seção 2.
3. **Pesquisar quando necessário:** apenas o orquestrador, e somente quando a decisão exigir informação externa.
4. **Separar fatos, hipóteses, recomendações e decisões:** nada é registrado como decidido sem que o seja.
5. **Escolher a menor próxima ação** que reduza risco ou desbloqueie trabalho.
6. **Selecionar o agente** adequado (seção 4).
7. **Executar um único objetivo delimitado** por prompt.
8. **Receber o relatório** obrigatório.
9. **Revisar diff, testes e evidências.**
10. **Corrigir desvios** com nova tarefa delimitada ou ajuste direto.
11. **Atualizar a documentação:** decision log, open decisions, backlog, riscos, requisitos.
12. **Definir o próximo passo.**

## 4. Seleção de agente

- Tarefas com escopo fechado, arquivos esperados conhecidos e critérios de aceite verificáveis são delegadas a Claude Code ou Antigravity.
- Tarefas que exigem decisão de produto, pesquisa externa ou escolha entre alternativas permanecem com o orquestrador e, quando fora da sua autonomia, com Bruno.
- Um prompt executor tem **um** objetivo. Objetivos múltiplos são divididos em tarefas sucessivas.

## 5. Regras para prompts executores

Todo prompt executor contém, quando aplicável:

| Seção | Conteúdo |
| --- | --- |
| Papel | Quem o agente é nesta tarefa e quem orquestra |
| Contexto | Estado atual, SHA conhecido, o que existe e o que não existe |
| Fontes | Documentos a ler obrigatoriamente, na hierarquia da seção 2 |
| Objetivo único | O resultado esperado, em uma frase |
| Escopo | O que pode e deve ser feito |
| Não escopo | O que não pode ser feito, mesmo que pareça útil |
| Arquivos esperados | Lista de arquivos a criar, alterar e remover |
| Regras | Regras de produto, técnicas e de estilo a preservar |
| Sequência | Passos ordenados de execução |
| Critérios de aceite | Condições verificáveis de aceitação |
| Validações | Comandos e verificações obrigatórios |
| Git | Branch, commit, push, PR, merge autorizados ou não |
| Autonomia | O que o agente pode decidir sozinho e o que não pode |
| Relatório | Formato do relatório obrigatório (seção 6) |
| Tratamento de bloqueios | Quando interromper e reportar (seção 9) |

## 6. Relatório obrigatório

Todo agente executor encerra a tarefa com um relatório contendo, nesta ordem:

1. **Resumo:** o que foi realizado.
2. **Arquivos:** criados, alterados e removidos.
3. **Decisões e desvios:** qualquer escolha feita pelo agente e qualquer afastamento do prompt, com justificativa.
4. **Comandos:** comandos relevantes executados.
5. **Lint:** resultado, ou "não aplicável" com motivo.
6. **Typecheck:** resultado, ou "não aplicável" com motivo.
7. **Testes:** resultado, ou "não aplicável" com motivo.
8. **Build:** resultado, ou "não aplicável" com motivo.
9. **Riscos:** riscos identificados ou alterados.
10. **Pendências:** o que ficou em aberto.
11. **Dependências:** dependências adicionadas, removidas ou atualizadas.
12. **Migrations:** migrations criadas ou alteradas.
13. **Branch.**
14. **Commit:** SHA e mensagem.
15. **Push.**
16. **PR:** número, URL e estado.
17. **Merge:** realizado ou não, e SHA resultante.
18. **Deploy:** realizado ou não.
19. **Evidências:** saídas de comandos, trechos de diff ou outros elementos suficientes para revisão independente.

**Validação não executada não pode ser apresentada como aprovada.** Um item não executado é reportado como "não executado" ou "não aplicável", com motivo. Um resultado com falha é reportado com a saída da falha.

## 7. Git e autonomia

### Autorização geral

Os executores estão autorizados, quando coerente com o escopo do prompt, a:

- criar branches;
- fazer commits;
- fazer push;
- abrir PRs;
- revisar o próprio diff;
- fazer merge (squash por padrão em mudanças documentais);
- fazer deploy;
- publicar;

sempre dentro do escopo autorizado pelo prompt. O prompt pode restringir qualquer uma dessas ações; a restrição do prompt prevalece.

### Restrições

- Sem force-push, salvo exceção explicitamente justificada no prompt.
- Sem reescrita de histórico e sem reescrita desnecessária de arquivos.
- Sem alterações não relacionadas ao objetivo da tarefa.
- Sem segredos (credenciais, chaves, tokens) em commits, logs ou relatórios.
- Sem dados pessoais reais em código, fixtures, testes ou documentação.
- Operações destrutivas (exclusão de branch remota, de dados, de ambiente) exigem justificativa forte e, salvo autorização prévia no prompt, confirmação de Bruno.
- Nunca trabalhar diretamente na `main`.
- Commits pequenos e semânticos, com mensagem no formato `tipo: descrição` (por exemplo, `docs: ...`, `feat: ...`, `fix: ...`).

### Governança da branch `main`

A regra `Nunca trabalhar diretamente na main` acima deixou de ser apenas convenção: ela é hoje **imposta pela plataforma**. A branch `main` está protegida por um GitHub Repository Ruleset do repositório, atualmente chamado `Protect main`, com escopo exclusivo em `refs/heads/main`.

Essa configuração vive no GitHub, **fora do versionamento**. Ela é uma dependência operacional externa: este documento descreve a política esperada, mas **não substitui a leitura do estado real da plataforma**. Toda tarefa cujo resultado dependa da proteção — merge, alteração do CI, mudança de governança — deve ler o ruleset real antes de concluir. O identificador numérico do ruleset não é estável (uma recriação da regra gera outro) e por isso não é registrado aqui como identificador normativo; o que identifica a regra é o nome e o escopo.

#### Fluxo obrigatório

1. O executor trabalha em **branch de trabalho**, nunca em `main`.
2. Toda mudança destinada a `main` entra por **Pull Request**.
3. O merge só ocorre depois dos critérios de aceite do prompt **e** do required status check aprovado.
4. **Squash merge** permanece o padrão operacional de entrega, salvo determinação diferente no prompt. Merge commit e rebase continuam habilitados na plataforma, mas não são o padrão.

O ruleset exige atualmente **zero approvals humanos** no GitHub. Isso **não** dispensa a revisão descrita na seção 8: *approval obrigatório do GitHub* e *revisão técnica do orquestrador* são conceitos distintos. A plataforma pode exigir `0` approvals e a entrega ainda assim precisa passar pela proporcionalidade de revisão deste documento.

#### Required status check

O check obrigatório é, no estado atual, exatamente:

`Validação (format, lint, typecheck, test, build)`

Ele corresponde ao job definido em [../../.github/workflows/ci.yml](../../.github/workflows/ci.yml), que executa `npm ci` seguido de `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:ci` e `npm run build`. Os contratos desses comandos estão em [conventions.md](conventions.md), seção 5.1, e a estratégia de testes em [testing.md](testing.md); este documento não os replica.

A proteção usa **política estrita** de required status checks. Em termos operacionais: quando `main` avança e o GitHub considera a PR desatualizada, a branch precisa ser atualizada e o CI precisa voltar a ficar verde antes do merge. Isso não se contorna por merge administrativo nem por bypass.

#### Force-push, deleção e bypass

- **Force-push / non-fast-forward em `main` é proibido.**
- **Deleção de `main` é proibida.**
- Nenhuma dessas operações deve ser tentada para "testar" a proteção; a verificação dessas regras é feita **lendo a configuração do GitHub**, não provocando-as.
- O estado esperado é **sem bypass actors**. Administradores não devem usar fluxo de bypass para integrar código com CI vermelho.

Alterar a própria configuração administrativa do GitHub é tecnicamente possível para quem tem esse poder. A política não é uma afirmação de impossibilidade: é que **merges ordinários respeitam PR + CI**, e que mexer na governança é uma **ação administrativa explícita**, tratada como mudança de governança — nunca como atalho para destravar uma entrega.

#### Acoplamento entre o nome do job do CI e o ruleset

Este é o principal risco operacional desta configuração. O required status check é identificado pelo **contexto/nome registrado no GitHub**, não por uma referência ao arquivo do workflow. Renomear o `name` do job que hoje produz `Validação (format, lint, typecheck, test, build)` faz o required check deixar de ser satisfeito, e toda PR passa a ficar bloqueada esperando um check que ninguém mais publica.

O ruleset é configuração externa e **não pertence ao commit**, então não basta "alterar o YAML e o ruleset na mesma PR". O procedimento seguro de transição é:

1. abrir a PR com a alteração do workflow;
2. deixar o novo job executar e **confirmar o contexto real registrado pelo GitHub**, não apenas o que o YAML diz;
3. antes do merge, atualizar o required status check do ruleset para esse novo contexto;
4. reler o ruleset para confirmar a alteração;
5. confirmar que a própria PR fica desbloqueada pelo novo check verde;
6. só então realizar o merge.

Se a alteração impedir validar o novo contexto com segurança, o executor **interrompe e reporta** (seção 9), sem improvisar bypass. A entrega não é considerada concluída enquanto a PR não voltar a ficar mergeável sob a nova configuração.

#### Alterações futuras de governança

Mudanças em required checks, approvals mínimos, bypass actors, merge methods permitidos, política estrita de checks, proteção contra deleção, proteção contra force-push ou escopo do ruleset são **mudanças de governança do repositório**. Elas devem ser:

1. intencionais, nunca efeito colateral de outra tarefa;
2. reportadas no escopo da tarefa que as executou;
3. verificadas por leitura da configuração **após** a alteração;
4. refletidas nesta seção quando alterarem a política operacional.

## 8. Proporcionalidade de revisão

A profundidade da revisão é proporcional ao risco da mudança.

**Revisão reforçada** (revisão explícita do orquestrador, evidência de testes e, quando o prompt exigir, homologação de Bruno) para mudanças em:

- autenticação;
- autorização;
- pagamentos;
- segurança;
- dados e modelo de dados;
- migrations;
- LGPD e dados pessoais;
- regras críticas: RB-001 a RB-006 e os requisitos rastreados a elas em [../product/requirements.md](../product/requirements.md).

**Revisão padrão** para o restante: revisão do diff e das validações pelo orquestrador; merge autorizado ao executor quando os critérios de aceite forem satisfeitos.

Não se exige homologação manual de Bruno sem necessidade. Mudanças documentais, refatorações sem efeito funcional e correções triviais seguem revisão padrão.

## 9. Tratamento de bloqueios

O executor **interrompe e reporta**, em vez de improvisar, quando:

- a `main` diverge materialmente do estado esperado no prompt;
- há mudanças locais conflitantes;
- a documentação recente contradiz o prompt;
- uma decisão aberta foi fechada por outro trabalho e há conflito com o prompt;
- concluir a tarefa exigiria inventar regra de produto;
- concluir a tarefa exigiria pesquisa externa não autorizada;
- concluir a tarefa exigiria escolher tecnologia pendente ou fechar decisão aberta.

O relatório de bloqueio segue o formato da seção 6, com o item "Pendências" descrevendo o bloqueio e as opções identificadas.

## 10. Referências

- [../project-state.md](../project-state.md)
- [../decisions/decision-log.md](../decisions/decision-log.md)
- [../decisions/open-decisions.md](../decisions/open-decisions.md)
- [../delivery/backlog.md](../delivery/backlog.md)
- [../delivery/roadmap.md](../delivery/roadmap.md)
