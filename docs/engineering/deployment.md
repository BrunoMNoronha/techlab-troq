# Ambientes e publicação do TROQ

Configuração executada em 2026-10-04 por autorização do responsável. A infraestrutura não encerra os gates funcionais ou comerciais do MVP. O registro de execuções deve distinguir configuração, CI, publicação técnica e homologação.

## Fluxo

`main → CI completo → preview (fast-forward) → migrations Preview → Vercel Preview → validação → disparo manual → migrations Production → candidato Production → validação → troqs.app`

`main` é principal e recebe mudanças por PR. Os checks obrigatórios são `Validação (format, lint, typecheck, test, build)` e `Integração (PostgreSQL efêmero)`. `preview` é permanente, não recebe commits próprios e não admite force-push; divergências interrompem o pipeline. Branches de trabalho continuam permitidas e são removidas depois do merge.

O workflow `Deploy Preview` só aceita CI completo e aprovado de push em `main`, no próprio repositório; uma execução cujo SHA deixou de ser o atual de `main` é recusada. O workflow `Deploy Production` só tem `workflow_dispatch`, exige origem `main` e recebe `preview_run_id`. Confere execução, tentativa e artefato, e faz checkout do SHA exato validado em Preview. Os environments GitHub Preview e Production só liberam credenciais para `main`.

Cada ambiente serializa migrations e deployments sem cancelar operações em andamento. Falhas interrompem os passos seguintes. `vercel.json` usa `git.deploymentEnabled=false`, conforme a [configuração oficial da Vercel](https://vercel.com/docs/project-configuration/git-configuration). A integração Git não publica por conta própria.

## Recursos e isolamento

| Recurso | Preview | Production |
| --- | --- | --- |
| Git | `preview`, espelho de `main` | SHA aprovado, selecionado manualmente |
| URL | https://techlab-troq-git-preview-bruno-m-noronha.vercel.app | https://troqs.app |
| Neon branch | `br-shiny-shadow-ac0q2v2v` | `br-mute-hat-acczbd28` (padrão) |
| Banco | `troq`, dados preservados | `troq`, criado vazio |
| Credenciais | próprias de teste | próprias de produção |

O projeto Neon existente `late-hall-79735405` passou a se chamar `techlab-troq`; PostgreSQL 17, São Paulo, plano Free, retenção de recuperação de seis horas. Production foi criada como branch independente schema-only. Confirmou-se ausência de registros em todas as tabelas antes de recriar **somente o banco vazio recém-criado nessa nova branch**, para aplicar integralmente as oito migrations com histórico Prisma próprio. Preview não foi recriada; não há sincronização de dados entre ambientes.

Há um projeto Vercel `techlab-troq`, ID `prj_mpILJv4OGXwsW3boJdXBPx3PSJGT`, equipe `team_ICY1aaLTQI5BmxlyrSjpRTJC`, Node 24, região `gru1`, instalação e build por pnpm. A equipe já tinha plano Pro; nenhuma contratação foi feita. O preflight de Production volta a exigir Pro ou Enterprise, pois [Hobby não permite crons a cada cinco minutos](https://vercel.com/docs/cron-jobs/usage-and-pricing). Um plano incompatível bloqueia a publicação, sem upgrade automático.

## Variáveis e segredos

O catálogo da aplicação está em [environments.md](environments.md) e [.env.example](../../.env.example). Não copiar credenciais de development para os ambientes hospedados.

| Custódia | Nomes |
| --- | --- |
| Vercel, escopo correspondente | `APP_ENV`, `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `DATABASE_URL`, `CRON_SECRET`, R2, Resend, Mercado Pago, Sentry e Google configurado |
| GitHub Environment correspondente | `DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET`, `VERCEL_TOKEN`, `VERCEL_AUTOMATION_BYPASS_SECRET` quando autorizado |
| Somente GitHub Environment Production | `BACKUP_PASSPHRASE`; variável de liberação `PRODUCTION_READY` |

`DATABASE_URL` é pooled. `DIRECT_URL` só chega aos passos de migration, verificação e backup, nunca à Vercel. O token Vercel deve acessar esta equipe e projeto. Operações Git usam `GITHUB_TOKEN`, com escrita somente no job de sincronização. Segredos de servidor na Vercel devem ter tipo sensível; nenhum valor secreto é versionado, registrado em log ou guardado no artefato de evidência.

O build de cada ambiente ocorre remotamente na Vercel, com as variáveis sensíveis do próprio escopo, sem exportá-las ao runner. Production não reaproveita o build de Preview. A CLI é pinada em `62.2.0`; o candidato Production usa `--prod --skip-domain`, conforme [deploy sem atribuição de domínio](https://vercel.com/docs/cli/deploy).

Google exige clientes OAuth distintos, com origens das URLs acima e callbacks exatos:

- Preview: `https://techlab-troq-git-preview-bruno-m-noronha.vercel.app/api/auth/callback/google`.
- Production: `https://troqs.app/api/auth/callback/google`.

Não instalar placeholders nem tokens sem consumidor. Sentry source maps só requerem token quando esse recurso de build estiver efetivamente configurado. Sem ambos os valores Google, o login Google permanece indisponível; um par incompleto é recusado.

## Backup, publicação e recuperação

Antes de migrar Production, o runner gera dump PostgreSQL 17, cifra com AES256, decifra em área temporária e compara os arquivos. Restaura o dump em PostgreSQL isolado e confirma o histórico Prisma. Só o ciphertext é enviado a artifacts, por sete dias; a chave permanece no Environment Production. CI prova esse procedimento com dados sintéticos. A retenção Neon de seis horas não substitui esse backup.

Depois da migration e de `prisma migrate status`, a aplicação é construída e publicada como candidato sem atribuir o domínio. O smoke verifica páginas públicas, consulta de sessão anônima e recusa de job sem autorização. A proteção de deployment permanece ativa; acesso HTTP automatizado depende de token de bypass do projeto expressamente autorizado e guardado somente nos environments GitHub.

Após smoke do candidato, `vercel promote` atribui Production; o domínio é verificado novamente. Se a promoção falhar e o histórico de migrations não mudou, o workflow restaura o deployment anterior. Quando há migrations novas, a compatibilidade do deployment anterior exige análise manual: não se revertem migrations automaticamente. O resumo registra o deployment anterior e o comando de recuperação. Restauração de dados também exige procedimento manual e análise dos efeitos posteriores ao backup.

## Operação e gates

Os crons de Production são: mídia, reconciliação de pagamentos e retentativa de reembolso a cada cinco minutos; limpeza de mídia a cada hora. A alteração da cadência do dispatcher de reembolso foi autorizada neste plano; o recuo por caso continua no código. Preview exercita os jobs por chamada autenticada, sem agendamento automático.

Para publicar, conferir as jornadas de Preview (cadastro, email, login/logout, Google, anúncios, mídia e pagamentos sandbox), conectividade e histórico, e completar credenciais próprias e homologação de Production. Somente então definir `PRODUCTION_READY=true` no Environment Production e executar:

```powershell
gh workflow run deploy-production.yml --ref main -f preview_run_id=<execucao-aprovada>
```

A primeira publicação também exige esse disparo. Nunca ativar cobranças reais para fazer smoke.

Estado de configuração nesta entrega: Neon dos dois ambientes verificado; GitHub environments e proteção de main configurados; Vercel com URLs, conexão pooled e segredos de auth/cron isolados; `PRODUCTION_READY=false`. Ainda é necessário comprovar as credenciais próprias de Production para R2, Resend, Sentry e Mercado Pago, sandbox do Mercado Pago em Preview, Google nos dois ambientes e as jornadas funcionais. Nenhum valor faltante foi preenchido com placeholder. SHAs, runs e deployments aprovados serão registrados na entrega após execução do pipeline.
