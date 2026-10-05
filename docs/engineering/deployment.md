# Ambientes e publicação do TROQ

Configuração executada em 2026-10-04 por autorização do responsável. A infraestrutura não encerra os gates funcionais ou comerciais do MVP. O registro de execuções deve distinguir configuração, CI, publicação técnica e homologação.

## Fluxo

`main → CI completo → [manual] promover para production → migrations Preview → Vercel Preview → validação → [manual] Deploy Production → backup → migrations Production → candidato → validação → troqs.app`

Modelo vigente desde 2026-10-05 (DEC-050), que substitui o espelho automático `main → preview` de 2026-10-04. Há duas branches permanentes:

- `main` é a principal e recebe mudanças só por PR, com os checks obrigatórios `Validação (format, lint, typecheck, test, build)` e `Integração (PostgreSQL efêmero)`. Push em `main` roda só o CI e não publica nada.
- `production` é a branch de release. Ela só avança por fast-forward até um commit de `main` com CI de push aprovado, e o ruleset `Protect production` proíbe force-push e deleção. Ela não recebe commits próprios.

Branches de trabalho continuam permitidas e são removidas depois do merge.

1. **main → production (manual).** O workflow `Promover para production` (`promote-production.yml`) roda só a partir de `main`.
   - Aceita um SHA opcional; o padrão é o HEAD de `main`.
   - Exige CI de push aprovado em `main` para esse SHA e que `production` seja ancestral dele. Em seguida, avança `production` sem force-push.
   - Por fim, dispara `Deploy Preview` com `--ref production`. O push feito com `GITHUB_TOKEN` não dispara workflows; o `workflow_dispatch` dispara.
2. **Preview (automático após a promoção).** `Deploy Preview` roda só no ref `production`, por `workflow_dispatch` ou por push direto do responsável em `production`.
   - Recusa a execução se o SHA não for o HEAD atual de `production`, não estiver contido em `main` ou não tiver CI aprovado.
   - Depois executa preflight, `prisma migrate deploy` no Neon preview, build remoto na Vercel (target preview), alias estável e smoke, e guarda a evidência.
3. **Production (manual).** `Deploy Production` só tem `workflow_dispatch` e roda só no ref `production`. `preview_run_id` é opcional: sem ele, usa o Deploy Preview aprovado mais recente do HEAD de `production`.
   - Confere execução, tentativa e artefato da evidência, e exige que o SHA seja o HEAD de `production`.
   - Em seguida, executa backup, migrations, candidato, promoção e rollback, como descrito abaixo.

Os GitHub Environments `Preview` e `Production` só liberam credenciais para jobs do ref `production`. A promoção não usa Environment e recebe apenas escrita de conteúdo e de Actions do `GITHUB_TOKEN`.

Cada ambiente serializa migrations e deployments sem cancelar operações em andamento. Falhas interrompem os passos seguintes. `vercel.json` usa `git.deploymentEnabled=false`, conforme a [configuração oficial da Vercel](https://vercel.com/docs/project-configuration/git-configuration). A integração Git não publica por conta própria.

## Recursos e isolamento

| Recurso | Preview | Production |
| --- | --- | --- |
| Git | HEAD de `production`, após promoção manual | mesmo SHA, já aprovado em Preview, por disparo manual |
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

O build de cada ambiente ocorre remotamente na Vercel, com as variáveis sensíveis do próprio escopo, sem exportá-las ao runner. Production não reaproveita o build de Preview. A publicação usa a API REST da Vercel, não a CLI: `POST /v13/deployments` com `gitSource` no SHA exato (o build é remoto e nada sobe do runner), alias por `POST /v2/deployments/{id}/aliases`, promoção por `POST /v10/projects/{id}/promote/{deploymentId}` e rollback por `POST /v1/projects/{id}/rollback/{deploymentId}`. O candidato Production é criado com `target: production` e `autoAssignCustomDomains: false`, o equivalente ao `--skip-domain`. A CLI foi abandonada em 2026-10-05: ela recusava o token ao carregar o usuário ("User not found"), embora o mesmo token funcionasse na API do projeto.

Google exige clientes OAuth distintos, com origens das URLs acima e callbacks exatos:

- Preview: `https://techlab-troq-git-preview-bruno-m-noronha.vercel.app/api/auth/callback/google`.
- Production: `https://troqs.app/api/auth/callback/google`.

Não instalar placeholders nem tokens sem consumidor. Sentry source maps só requerem token quando esse recurso de build estiver efetivamente configurado. Sem ambos os valores Google, o login Google permanece indisponível; um par incompleto é recusado.

## Backup, publicação e recuperação

Antes de migrar Production, o runner gera dump PostgreSQL 17, cifra com AES256, decifra em área temporária e compara os arquivos. Restaura o dump em PostgreSQL isolado e confirma o histórico Prisma. Só o ciphertext é enviado a artifacts, por sete dias; a chave permanece no Environment Production. CI prova esse procedimento com dados sintéticos. A retenção Neon de seis horas não substitui esse backup.

Depois da migration e de `prisma migrate status`, a aplicação é construída e publicada como candidato sem atribuir o domínio. O smoke verifica páginas públicas, consulta de sessão anônima e recusa de job sem autorização. A proteção de deployment permanece ativa; acesso HTTP automatizado depende de token de bypass do projeto expressamente autorizado e guardado somente nos environments GitHub.

Após smoke do candidato, a promoção pela API (`POST /v10/projects/{id}/promote/{deploymentId}`) atribui Production; o domínio é verificado novamente. Se a promoção falhar e o histórico de migrations não mudou, o workflow restaura o deployment anterior. Quando há migrations novas, a compatibilidade do deployment anterior exige análise manual: não se revertem migrations automaticamente. O resumo registra o deployment anterior e o comando de recuperação. Restauração de dados também exige procedimento manual e análise dos efeitos posteriores ao backup.

## Operação e gates

Os crons de Production são: mídia, reconciliação de pagamentos e retentativa de reembolso a cada cinco minutos; limpeza de mídia a cada hora. A alteração da cadência do dispatcher de reembolso foi autorizada neste plano; o recuo por caso continua no código. Preview exercita os jobs por chamada autenticada, sem agendamento automático.

Para levar `main` a Preview:

```powershell
gh workflow run promote-production.yml --ref main
```

Para promover um commit específico de `main`, usar `-f sha=<sha-completo>`. Para publicar em Production, conferir as jornadas de Preview (cadastro, email, login/logout, Google, anúncios, mídia e pagamentos sandbox), conectividade e histórico, e completar credenciais próprias e homologação de Production. Com `PRODUCTION_READY=true` no Environment Production, executar:

```powershell
gh workflow run deploy-production.yml --ref production
```

Para fixar uma execução de Preview específica, usar `-f preview_run_id=<execucao-aprovada>`.

A primeira publicação também exige esse disparo. Nunca ativar cobranças reais para fazer smoke.

Estado de configuração nesta entrega: Neon dos dois ambientes verificado; GitHub environments e proteção de main configurados; Vercel com URLs, conexão pooled e segredos de auth/cron isolados; `PRODUCTION_READY=false`. Ainda é necessário comprovar as credenciais próprias de Production para R2, Resend, Sentry e Mercado Pago, sandbox do Mercado Pago em Preview, Google nos dois ambientes e as jornadas funcionais. Nenhum valor faltante foi preenchido com placeholder. SHAs, runs e deployments aprovados serão registrados na entrega após execução do pipeline.

**Atualização de 2026-10-05 (DEC-050).**

- **GitHub:** o ruleset `Protect production` protege `refs/heads/production` contra deleção e force-push. Ele substitui o antigo `Protect preview`.
- **R2 de Production:**
  - Bucket privado `troq-media-production`, na conta TechLab+, Standard, localização automática.
  - CORS mínimo: só `PUT` de `https://troqs.app`, com `content-type` e `if-none-match`.
  - Account API Token `troq-media-production-rw`, com *Object Read & Write* restrito a esse bucket.
  - Na Vercel Production: `R2_S3_ENDPOINT`, `R2_REGION=auto` e `R2_BUCKET`.
- **Resend de Production:**
  - Domínio `troqs.app` na região `sa-east-1`, com DKIM (`resend._domainkey`), SPF (CNAMEs `send` e `rsend`) e DMARC `p=none` publicados na Cloudflare. O envio está verificado.
  - O recebimento ativado por padrão pelo provedor não é usado e ficou pendente, sem MX no apex.
  - API key `troq-production-sending`, com *Sending access* restrito a `troqs.app`.
  - `EMAIL_FROM=TROQ <nao-responda@troqs.app>` na Vercel Production.
- **Mudança em development:** para liberar a vaga no plano do Resend, o domínio `dev.troqs.app` foi removido. O envio em development não funciona até haver novo remetente.
- **Valores secretos:** `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `RESEND_API_KEY` são exibidos uma única vez pelo provedor. O responsável os cadastra diretamente na Vercel Production como *sensitive*.
- **Pendências de Production:** Mercado Pago e `GOOGLE_CLIENT_ID`.
