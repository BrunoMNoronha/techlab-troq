# Evidências da implementação da issue #201

Repositório `BrunoMNoronha/techlab-troq`, branch `codex/issue-201-produtos-demo`, baseline `f85fe73d61d621a8fc5575b6aa1a544384e48434`. Trabalho isolado do checkout original com alterações pendentes. A entrega implementa o manifesto `products-v1`, procedência persistida, provisionamento explícito e remoção seletiva em Configurações. Decisão de Bruno: qualquer conta autenticada ativa/verificada pode remover o lote demonstrativo.

## Validação local

| Verificação | Evidência |
| --- | --- |
| Dependências | `pnpm install --frozen-lockfile --prefer-offline` aprovado; `tsx@4.20.6` para o CLI e build de `esbuild` autorizado em `pnpm-workspace.yaml` |
| Formatação, lint e TypeScript | `pnpm format:check`, `pnpm lint` e `pnpm typecheck` aprovados; verificações focadas repetidas após os ajustes de foco |
| Suíte geral | 75 arquivos, 1.295 testes aprovados (`pnpm test:ci --maxWorkers=2`) |
| Integração do lote | 17 cenários aprovados com PostgreSQL 17 efêmero próprio, Sharp e entrega autorizada reais, transporte S3 simulado |
| Pipeline existente | 10 testes de deploy aprovados |
| Build final | `pnpm build` aprovado; leitura dos PNGs restrita estaticamente a `public/demo-products`, sem rastrear todo o checkout |
| Acessibilidade | 9 testes da UI aprovados após ajustes; foco inicial em Cancelar, foco no resultado após remoção, Escape fecha a confirmação |

Os testes de integração cobrem 30 produtos, 90 alternativas e 90 derivados de 30 imagens; paginação completa; cadastros independentes; idempotência; criação concorrente; FK concorrente observada sob `FOR UPDATE`; lease e fencing; confirmação antiga; conta inelegível; produção/alvo inválido; procedência adulterada; vínculos humanos/de negócio; rollback quando a auditoria falha; falha externa e retomada da limpeza. Uma revisão independente encontrou lotes terminais adulterados com ponteiros vivos; a correção recusa esse estado no resumo, criação e remoção e possui dois cenários de integração.

## Jornada local com banco e HTTP reais

Banco isolado `troq_demo_201`, servido somente em localhost, aplicação na porta 3111 e transporte S3 sintético na porta 55592. Nenhum recurso de Preview/Production participou desta prova.

- Primeira carga: `created=30`, `existing=0`, `pendingMedia=0`. Repetição pelo CLI: `created=0`, `existing=30`.
- Os 90 derivados foram lidos por HTTP com status 200 e bytes não vazios. A vitrine mostrou 30 resultados em duas páginas (20 + 10); o detalhe mostrou imagem e três alternativas.
- Login real por Better Auth usando conta sintética descartável. Minha conta ofereceu Configurações com ambiente, versão, lote e contagem 30.
- Cancelar por Escape conservou o lote e retornou o foco ao gatilho.
- Confirmar informou 30 produtos removidos e 90 arquivos pendentes. Banco passou de 30 para zero produtos, conservou os dois usuários e acrescentou a auditoria de remoção. As 90 URLs antigas responderam 404 imediatamente.
- O endpoint autenticado do job de mídia reclamou e concluiu 90 arquivos, sem erros ou retentativas. Configurações mostrou zero produtos e zero pendências.
- Nova carga criou outro conjunto de 30. As identidades de produtos/imagens e os objetos não são reutilizados.

## Operação ainda pendente

**A issue permanece aberta; a prova local não substitui Preview.** O conjunto de desenvolvimento configurado no checkout original foi inspecionado somente em leitura: banco com host local e R2 completo, mas o PostgreSQL recusou autenticação (`P1000`). Nenhuma migration ou carga foi executada nesse banco.

Preview tem banco/bucket próprios e chaves R2 sensíveis na Vercel. Os três `DEMO_*` ainda não estão configurados; o GitHub Environment de Preview não dispõe das credenciais R2 necessárias ao CLI. O R2 do arquivo local usa outro bucket. É necessário disponibilizar a custódia correta em processo autorizado, conferir os destinos e executar a carga explícita após a migration/publicação pelo fluxo vigente. Não executar seed no build ou deploy para contornar essa dependência.

Publicação de Preview depende do fluxo manual descrito em [deployment.md](../engineering/deployment.md) e da regra de pedido explícito em [ai-agent-workflow.md](../engineering/ai-agent-workflow.md#publicação-por-ambientes). Production está fora do escopo. Não houve merge, promoção ou publicação nesta implementação.

O procedimento operacional está em [demo-products.md](../engineering/demo-products.md).
