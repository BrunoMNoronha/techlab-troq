# Sprint de encerramento e reputação — #163 e #164

Entrega em preparação em 2026-10-05, a partir de `main@9447b8af344201ac60d25721dbce78c7982ae01e`, na branch `codex/sprint-negociacoes-reputacao` e em checkout isolado. As alterações locais do checkout principal foram preservadas. **O aceite no Preview permanece pendente**, assim como a prova remota de #104 e o gate #105; a preparação isolada não libera a integração da Fase 4.

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
| Banco e HTTP finais | Em revalidação; o aceite não é inferido das rodadas intermediárias |
| Navegador a 375 px | Pendente |
| CI da branch e deployment da sprint | Pendentes |

Falhas intermediárias foram investigadas sem relaxar os controles: `pg_sleep` passou a usar `$executeRaw`, pois o retorno `void` não é desserializável por Prisma; a observação de `pg_stat_activity` foi movida para autocommit fora da transação que segura a trava, evitando o snapshot estático; a prova RSC verifica as propriedades do componente cliente, enquanto o HTML verifica o botão renderizado. A primeira nota HTTP vem do escolhido para o anunciante, comprovando que o agregado correto permanece cego.

## Preview e dependências externas

O Preview disponível é o [run 37332427023](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37332427023), deployment `dpl_H2coTZhL45V7t52PTzJtfNcGM4hj`, SHA `9447b8af344201ac60d25721dbce78c7982ae01e`. **Ele ainda não contém #163/#164.** O gate vigente e seus limites estão em [phase-4-transition.md](phase-4-transition.md).

Na leitura dos metadados da Vercel, sem recuperar valores, o trio `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_APPLICATION_ID` e `MERCADO_PAGO_WEBHOOK_SECRET` existia somente em Production. A configuração própria de teste no Preview foi solicitada ao Bruno. O preflight atual exige esse trio apenas em Production; o sucesso do Deploy Preview não comprova Pix funcional. A aplicação falha fechada sem configuração, e não há fallback para credenciais de outro ambiente. A prova remota exige republicação após o provisionamento, fluxo controlado e varredura Vercel/Sentry com controles não vazios, conforme #104.

Google, na mesma origem estável: o Bruno relatou a recusa de vinculação implícita para um e-mail já cadastrado. Depois da vinculação explícita realizada por ele, o navegador confirmou a mensagem de conta vinculada, logout e nova entrada com Google na mesma conta verificada/ativa. Não foram expostos e-mail, credenciais ou cookies neste relatório. Cadastro novo com 18+/termos, cancelamento e links de e-mail continuam pendentes em #133; esses resultados não fecham a issue.

## Roteiro de homologação

1. Concluir #104 no Preview com configuração de teste própria, SHA/deployment/intervalo e controles diagnósticos da varredura. Reconciliar os contratos e registrar o gate #105.
2. Após integração autorizada e CI aprovada, publicar a revisão da sprint no Preview pelo pipeline existente.
3. Encerrar uma negociação como anunciante e outra como escolhido; confirmar retry e acesso ao histórico. Reselecionar uma solicitação paga elegível, com anúncio publicado, preservando contato e negociação anteriores.
4. Enviar e editar a primeira nota; conferir que a contraparte, HTML/RSC e agregado público não recebem a nota ainda cega. Enviar a segunda, verificar publicação e média/contagem; confirmar recusa de edição posterior.
5. Registrar a prova mobile de 375 px, teclado, falha de rede e recuperação. Registrar SHA, CI, run/tentativa, deployment e resultado de cada passo, sem dados pessoais ou segredos.

Até esse aceite, usar `Refs #104`, `Refs #105`, `Refs #163`, `Refs #164` e `Refs #133`. Não declarar concluída a sprint, a Fase 4 ou a abertura comercial. Denúncia/moderação, sanções, notificações e os gates seguintes permanecem nas entregas previstas.
