# Sprint de encerramento e reputação — #163 e #164

Entrega em preparação em 2026-10-05, a partir de `main@9447b8af344201ac60d25721dbce78c7982ae01e`, na branch `codex/sprint-negociacoes-reputacao` e em checkout isolado. A [PR #182](https://github.com/BrunoMNoronha/techlab-troq/pull/182) permanece em rascunho; a revisão `f1380a7d9931549b59855b493952d49c129b844c` tem os dois jobs da CI aprovados. As alterações locais do checkout principal foram preservadas. **O aceite no Preview permanece pendente**, assim como a prova remota de #104 e o gate #105; a preparação isolada não libera a integração da Fase 4.

## Comportamento implementado

- `/negociacoes/[id]` é privada para anunciante e escolhido. Mostra contraparte, estado e encerramento com confirmação explícita. Solicitações do anúncio e contatos liberados dão acesso à negociação; o histórico conserva as encerradas depois de uma reseleção.
- Qualquer participante elegível pode encerrar, inclusive com anúncio pausado, fechado ou removido. Travas de anúncio e negociação serializam o ato; instante, ator e auditoria são gravados na mesma transação. Repetição conserva o encerramento original. Pagamentos, vagas e autorizações anteriores são preservados.
- Cada participante pode enviar uma nota inteira de 1 a 5 após o encerramento e antes do fim dos 14 dias corridos. Uma nota ainda cega pode ser substituída pelo autor. A segunda direção publica ambas atomicamente; uma nota única passa a ser pública na leitura ao vencer o prazo, sem cron.
- O detalhe público mostra apenas média com uma casa decimal e quantidade de avaliações válidas do anunciante. A identidade é resolvida no servidor. A página privada envia somente a nota do próprio autor; nota da contraparte, contato e identificadores privados não entram no agregado público.
- A interface trata sessão expirada, recusa autoritativa e resposta de rede perdida. Diante de resultado ambíguo, pede releitura antes de repetir a ação. Confirmação, cancelamento e feedback recebem foco acessível.

Reutilizados `Negotiation`, `Rating`, restrições e auditoria existentes. Nenhuma migration, dependência, texto de avaliação, perfil público ou notificação foi acrescentada.

## Evidências locais

Banco PostgreSQL 17 exclusivo e descartável, com armazenamento temporário, porta local 55581 e as 11 migrations existentes. Better Auth e servidor Next.js são reais; emissão de e-mail e fatos financeiros das fixtures são sintéticos. Essas provas não homologam Mercado Pago, R2 ou Sentry remotos.

| Verificação | Resultado observado |
| --- | --- |
| Tipagem e build | `pnpm typecheck` e `pnpm build` aprovados; rota privada dinâmica, fora da pré-renderização |
| Lint | `pnpm lint` aprovado; UI final também aprovada em verificação focal |
| Suíte unitária completa | 71 arquivos, 1.165 testes aprovados; nova página privada também coberta pela rodada focal abaixo |
| Interface final | 39 testes aprovados em cinco arquivos, incluindo seis da nova página privada; ESLint e Prettier focais aprovados |
| Pipeline de publicação | `pnpm test:deployment`: 10 testes aprovados |
| Novas provas de banco e HTTP | 38 testes aprovados: 16 de encerramento, 11 de avaliações e 11 da jornada HTTP |
| Regressão completa de banco e HTTP | 510 testes aprovados, 19 pulados por pré-requisitos externos e um timeout de 5 s em teste antigo de recuperação de imagens |
| Diagnóstico focal de imagens | 31 testes aprovados com `--testTimeout=30000` na CLI, sem alterações no código ou na configuração do projeto |
| Navegador a 375 px | Aprovado em servidor Next.js de produção local, com contas e pagamentos sintéticos no banco descartável; não substitui homologação no Preview |
| Deployment da sprint | Pendente |

Falhas intermediárias foram investigadas sem relaxar os controles: `pg_sleep` passou a usar `$executeRaw`, pois o retorno `void` não é desserializável por Prisma; a observação de `pg_stat_activity` foi movida para autocommit fora da transação que segura a trava, evitando o snapshot estático; a prova RSC verifica as propriedades do componente cliente, enquanto o HTML verifica o botão renderizado. A primeira nota HTTP vem do escolhido para o anunciante, comprovando que o agregado correto permanece cego.

No navegador local, a largura efetiva e o `scrollWidth` foram conferidos como 375 px. A confirmação recebeu foco, abriu e cancelou por teclado, retornando o foco ao botão. Uma negociação foi encerrada pelo escolhido, outra pelo anunciante depois da reseleção; ambas continuaram no histórico. A primeira nota foi enviada como 2 e editada para 4, sem aparecer para o anunciante nem no agregado público. A segunda nota publicou ambas e bloqueou edição; o anúncio mostrou `4,0 de 5 estrelas · 1 avaliação`. Falhas de rede no encerramento e na edição exibiram aviso de resultado incerto e bloquearam repetição; a ação de atualizar, após reconexão, restaurou o estado confirmado no servidor. Capturas da confirmação, recuperação, cegamento, histórico e reputação foram guardadas fora do repositório, em `sprint-evidence` do checkout isolado.

## Evidência de CI

O [run 37354127622](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37354127622), evento `pull_request`, concluiu com sucesso para `f1380a7d9931549b59855b493952d49c129b844c`. Os logs dos dois jobs registram:

| Job | Resultado observado |
| --- | --- |
| Validação: formatação, lint, typecheck, testes e build | Aprovado; 72 arquivos e 1.171 testes unitários aprovados; 10 testes de segurança e invariantes do pipeline aprovados |
| Integração: PostgreSQL efêmero e HTTP | Aprovado; 35 arquivos aprovados e três pulados; 511 testes aprovados e 19 pulados, de 530 casos; inclui as 38 provas novas de #163/#164 |
| Backup e restauração | Etapa aprovada com dados sintéticos no banco isolado |

A CI terminou sem falha de teste, incluindo o teste antigo de imagens que atingiu timeout na regressão local. Os 19 casos pulados continuam dependendo de R2 real ou Mercado Pago sandbox. O sucesso da CI não substitui as provas funcionais no Preview nem aprova #104/#105.

## Preview e dependências externas

O Preview disponível foi republicado no [run 37348109256](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37348109256), deployment `dpl_GJwe9CaW4gTrFg4HjpB6P9E2W3WW`, SHA `9447b8af344201ac60d25721dbce78c7982ae01e`. Os logs confirmam o smoke HTTP aprovado para páginas, consulta pública, sessão anônima e proteção de job. **Ele ainda não contém #163/#164.** O gate vigente e seus limites estão em [phase-4-transition.md](phase-4-transition.md).

Após o provisionamento, a leitura dos metadados da Vercel confirmou o trio `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_APPLICATION_ID` e `MERCADO_PAGO_WEBHOOK_SECRET` no ambiente Preview, marcado como Sensitive, sem recuperar ou registrar valores. O Preview da base foi republicado. O preflight atual exige esse trio apenas em Production; presença da configuração e smoke aprovado não comprovam Pix funcional. A aplicação falha fechada sem configuração, e não há fallback para credenciais de outro ambiente. A prova funcional remota C-8, a varredura Vercel/Sentry com controles não vazios e o gate #105 continuam pendentes, conforme #104.

Google foi aceito e [#133 encerrada](https://github.com/BrunoMNoronha/techlab-troq/issues/133) após a integração da [PR #180](https://github.com/BrunoMNoronha/techlab-troq/pull/180). A main atual `a8acf2e4654c23db0a9b75db3ae0d91395d4d5ab` contém o aceite em `google-sign-in-proof.md`. Na origem estável de Preview, o agente observou PKCE/callback, recusa de vinculação implícita, vinculação explícita, logout e nova entrada na conta verificada/ativa. No [registro final de aceite](https://github.com/BrunoMNoronha/techlab-troq/issues/133#issuecomment-5999419537), Bruno confirmou as duas provas restantes: novo cadastro Google com nome, 18+/termos e cancelamento/repetição, além de cadastro e entrada por email/senha com verificação por link. Essas etapas finais são homologação humana, sem reprodução independente pelo agente ou nova contagem de banco nesta rodada. Não foram expostos email, credenciais ou cookies; o aceite não comprova verificação de marca nem abertura comercial Google e não aprova #104/#105.

## Roteiro de homologação

1. Concluir a prova funcional de #104 no Preview republicado, com SHA/deployment/intervalo e controles diagnósticos da varredura. Reconciliar os contratos e registrar o gate #105.
2. Após integração autorizada e CI aprovada, publicar a revisão da sprint no Preview pelo pipeline existente.
3. Encerrar uma negociação como anunciante e outra como escolhido; confirmar retry e acesso ao histórico. Reselecionar uma solicitação paga elegível, com anúncio publicado, preservando contato e negociação anteriores.
4. Enviar e editar a primeira nota; conferir que a contraparte, HTML/RSC e agregado público não recebem a nota ainda cega. Enviar a segunda, verificar publicação e média/contagem; confirmar recusa de edição posterior.
5. Registrar a prova mobile de 375 px, teclado, falha de rede e recuperação. Registrar SHA, CI, run/tentativa, deployment e resultado de cada passo, sem dados pessoais ou segredos.

Até esse aceite, usar `Refs #104`, `Refs #105`, `Refs #163` e `Refs #164`. #133 já está encerrada pelo aceite específico acima. Não declarar concluída a sprint, a Fase 4 ou a abertura comercial. Denúncia/moderação, sanções, notificações e os gates seguintes permanecem nas entregas previstas.
