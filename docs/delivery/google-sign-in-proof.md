# Prova real da entrada com Conta Google (#81 e #133)

Registro da evidência com o **Google real** exigida por [#81](https://github.com/BrunoMNoronha/techlab-troq/issues/81), mantido à parte dos testes automatizados ([../architecture/identity-contract.md](../architecture/identity-contract.md), IC-15.10). Os testes provam o comportamento do TROQS diante de cada resposta do Google, com o endpoint de token simulado; só esta prova mostra que o cliente OAuth, a tela de consentimento e as URIs de cada ambiente estão corretos.

A entrada com Google foi aprovada por DEC-047 (2026-10-04) e é oferecida **só em `preview` e `production`**; `development` não é provisionado.

## Atualização de #133 em 2026-10-05: Google publicado para usuários externos

No console do projeto `troq-510700`, o público foi publicado e confirmado como **Externo / Em produção**. Branding salvo: homepage `https://troqs.app`, política `https://troqs.app/privacidade`, termos `https://troqs.app/termos`; domínios autorizados `troqs.app` e `techlab-troq-git-preview-bruno-m-noronha.vercel.app`. O acesso a dados declara apenas `openid` e `userinfo.email`, sem escopos sensíveis ou restritos.

| Evidência atual | Resultado |
| --- | --- |
| Consentimento externo fora do modo de teste | Confirmado no console; usuários não precisam ser incluídos na lista de teste |
| Cliente Production "TROQs" | Callback `https://troqs.app/api/auth/callback/google` conferido |
| Par Production na Vercel | Ambas as chaves presentes como Sensitive; valores não recuperados |
| Login Google em Production | Relatado pelo Bruno em comentário de #133 após [Deploy Production 37273766162](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37273766162), SHA `dc511320ac4048c1b875ec7db283456defcbb7e3`; não repetido nesta etapa |
| Cliente Preview "TROQS preview" | Cliente distinto de Production; callback `https://techlab-troq-git-preview-bruno-m-noronha.vercel.app/api/auth/callback/google` salvo e conferido em nova leitura do console |
| Par efetivo de Preview estável | Ambas as chaves presentes como Sensitive, no escopo Preview sem restrição de branch; segredo cadastrado diretamente pelo Bruno, sem recuperação do valor |
| Release Preview com Google | SHA `9447b8af344201ac60d25721dbce78c7982ae01e`, [run 37332427023, tentativa 1](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37332427023), deployment `dpl_H2coTZhL45V7t52PTzJtfNcGM4hj`; preflight, migrations, build e smoke aprovados |
| Jornada de Preview estável | Botão, pedido OAuth, callback real, recusa de vinculação implícita, vinculação explícita pelo Bruno, acesso posterior pelo Google e logout observados pelo agente. Cadastro novo com aceite, cancelamento e links de e-mail confirmados pelo Bruno conforme o roteiro abaixo |

A publicação do consentimento remove a limitação de usuários de teste para o login básico. Ela não comprova verificação de marca pelo Google nem aprovação da operação comercial do TROQS. O aceite específico de #133 foi concluído em 2026-10-05 com as evidências de configuração, navegador e homologação humana abaixo; o fechamento é feito pela [PR #180](https://github.com/BrunoMNoronha/techlab-troq/pull/180), sem fechar os gates das Fases 4 e 5.

## Prova atual do Preview estável em 2026-10-05 (#133)

**Origem:** `https://techlab-troq-git-preview-bruno-m-noronha.vercel.app`. **Revisão:** `9447b8af344201ac60d25721dbce78c7982ae01e`, promovida pelo [run 37332400274](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37332400274) para a branch `production` e publicada em **Preview**, sem novo deployment de Production. A [CI de main 37296179216](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37296179216) aprovou os dois checks obrigatórios nesse SHA. O artefato público `release.json` do run Preview identifica revisão, ambiente e deployment.

**Método:** navegador Edge na recusa anônima e navegador integrado do Codex na prova após vinculação; conta Google controlada pelo Bruno, metadados da Vercel sem descriptografia. Na primeira retomada, o Bruno confirmou que **vinculou o Google à conta por senha existente**, em vez de criar uma conta nova; o cadastro novo recebeu aceite humano separado depois. URLs OAuth, e-mails, tokens, cookies e códigos foram omitidos dos registros compartilhados. Não foram consultadas contagens no banco nesta rodada.

| Passo | Resultado e fonte |
| --- | --- |
| Botão em `/login` e `/cadastro` | PASS — "Continuar com Google" disponível no deployment identificado |
| Pedido OAuth real | PASS — cliente Preview distinto de Production; callback estável exato, `scope=openid email` e PKCE `S256` |
| Retorno de conta cujo e-mail já pertence a uma conta por senha | PASS — callback retorna `/login?motivo=google_conta_existente`; sem vinculação automática |
| Recusa com sessão anônima | PASS — após logout, `/conta` retorna `/login?motivo=sessao`; repetir Google produz a mesma recusa e `/conta` permanece protegido |
| Perfil previamente autenticado por senha | PASS limitado — estado ativo/verificado e Google ainda não vinculado; não equivale a uma nova tentativa de login por senha |
| Vinculação explícita | PASS — realizada e confirmada pelo Bruno; `/conta` informa conta ativa/verificada e Google vinculado. Não equivale à prova de cadastro novo |
| Acesso posterior com Google | PASS — após logout e guard anônimo, "Continuar com Google" retorna a `/explorar`; `/conta` mostra o perfil vinculado, ativo/verificado, sem novo cadastro |
| Logout da sessão Google | PASS — saída após a entrada Google; nova visita a `/conta` redireciona para `/login?motivo=sessao` |
| Cadastro Google com nome, 18+ e termos | PASS por homologação humana — Bruno confirmou a conclusão do roteiro com outra identidade Google controlada, ainda sem conta TROQS; não reproduzido pelo agente |
| Cancelamento do cadastro | PASS por homologação humana — roteiro de cancelar uma vez em `/cadastro/google` e repetir para concluir confirmado pelo Bruno; a recusa por colisão foi observada pelo agente separadamente |
| Cadastro por e-mail/senha, verificação e login | PASS por homologação humana — Bruno confirmou cadastro de teste, abertura do link recebido e login no Preview estável; senha, código e link não foram solicitados ou compartilhados |

Uma tentativa com a segunda conta selecionada terminou em **401 na tela do próprio Google**, antes do retorno ao TROQS. O callback bem-sucedido da primeira conta demonstra que o par funciona; o erro da segunda não foi tratado como sucesso de cadastro nem como falha comprovada do TROQS. O cadastro foi deixado aberto para autenticação e aceite pelo Bruno. A primeira tentativa ocorreu com uma sessão TROQS preexistente; por isso a recusa e o guard foram repetidos depois de logout, em vez de inferir ausência de sessão a partir dela.

Na continuação, o Bruno entregou uma sessão com Google vinculado e confirmou que havia feito **vinculação à conta existente**. O agente encerrou essa sessão, conferiu o guard, iniciou nova entrada pelo botão Google, acessou a conta vinculada e encerrou a sessão criada pelo Google. O cadastro novo foi novamente preparado para uma identidade diferente; não houve novo aceite legal pelo agente. A captura do vínculo foi limitada à seção "Conta Google", sem dados do perfil.

**Aceite humano dos passos restantes.** Em 2026-10-05, foi pedido ao Bruno executar no Preview estável: (1) usar outra Conta Google controlada, ainda sem conta TROQS, cancelar uma vez em `/cadastro/google` e repetir, concluindo com nome, declaração 18+ e termos; (2) cadastrar por e-mail/senha uma conta de teste, abrir o link recebido e conferir o login. Ele respondeu **"Concluí as duas provas"**. Esse relato é a evidência dos três últimos itens da matriz; não foi convertido em observação direta do agente nem em prova de contagens no banco. A aba retomada pelo agente continuava em `/cadastro`, e não foi usada como captura de conclusão desses passos.

**Conferência final do alvo.** Depois do aceite, a API da Vercel confirmou que o alias estável ainda aponta para `dpl_H2coTZhL45V7t52PTzJtfNcGM4hj`, `READY`, SHA `9447b8af344201ac60d25721dbce78c7982ae01e`. A PR de fechamento altera somente documentação; não cria outra release nem atribui suas provas a um SHA de runtime diferente. A proteção do Preview não foi reduzida, e nenhum bypass foi incluído em callback ou link de e-mail.

**Baseline superada:** no deployment `dpl_FugUTy2nyggXKwT6zpUMVM4oHM8s`, SHA `f6d3ae51fb480d0b77f713dbfbd63f0c6fe92214`, [run 37290829843, tentativa 2](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/37290829843), `/login` não tinha botão Google. Essa ausência foi resolvida pela configuração efetiva e pela release atual; a prova histórica de #81 abaixo continua separada.

## Estado histórico da prova inicial de #81 em 2026-10-05

| Item | Situação |
| --- | --- |
| Projeto Google Cloud do TROQS | criado: `troq-510700` ("TROQ"), conduzido pelo agente no Chrome com a sessão do Bruno |
| Tela de consentimento OAuth | público **Externo**, em **modo de teste**; escopos declarados só `openid` e `userinfo.email`; um usuário de teste (a conta do Bruno) |
| Cliente OAuth "Aplicativo da Web" de `preview` | "TROQS preview", sem origem JavaScript; URI de redirecionamento só a do alias da branch de prova |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` e `BETTER_AUTH_URL` em `preview` | restritas à branch `proof/81-google-preview`; o segredo foi gravado pelo Bruno como Sensitive |
| Cliente OAuth de `production` | não criado; depende da origem `https` de [#77](https://github.com/BrunoMNoronha/techlab-troq/issues/77) e da configuração de autenticação de `production`, que ainda não tem variáveis |

## Prova histórica em `preview` de branch descartável (2026-10-05)

- **Ambiente:** deployment de `preview` da branch `proof/81-google-preview` (alias `techlab-troq-git-proof-81-google-preview-bruno-m-noronha.vercel.app`), revisão `39307fe`, código de `main` em `0a95e0c` (inclui a PR [#123](https://github.com/BrunoMNoronha/techlab-troq/pull/123), `d70bc8f`), Neon `preview` com a migration `20261004120000_account_provider_identity_unique` aplicada pelo workflow.
- **Método:** o agente conduziu o TROQS e o console no Chrome. As telas do Google (escolha da conta e consentimento) e o ato afirmativo de 18+ e termos ficaram com o Bruno. As evidências de banco vêm de consultas só com agregados; as de log, dos registros de requisição da Vercel.

| # | Passo | Resultado |
| --- | --- | --- |
| 1 | `/cadastro` mostra "Continuar com Google" | PASS |
| 2 | Pedido ao Google: `scope=openid email`, PKCE `S256`, `redirect_uri` exata do alias | PASS |
| 3 | Consentimento real pede só o **endereço de e-mail** | PASS |
| 4 | Callback de identidade nova: só a pendência; nenhuma linha nova em `users` nem em `accounts`, nenhuma sessão (4 → 4 usuários, 0 → 1 pendência) | PASS |
| 5 | `/cadastro/google` mostra o e-mail confirmado pelo Google, caixas desmarcadas | PASS |
| 6 | Conclusão (18+ e termos marcados pelo Bruno) → Google → `/conta` | PASS |
| 7 | Banco: +1 usuário `active` com `email_verified` e `email_verified_at`, sem foto e sem senha; 1 identidade Google com tokens nulos; 1 `age_eligibility` versão `1.0`; pendência consumida; sessões sem IP e sem user-agent | PASS |
| 8 | `/conta` informa "Conta Google vinculada" | PASS |
| 9 | Logout → `/conta` redireciona para `/login?motivo=sessao`; a sessão do navegador foi apagada | PASS |
| 10 | Acesso posterior com Google → mesma conta (5 usuários, 1 identidade), nova sessão, tokens ainda nulos | PASS |
| 11 | Logs de requisição do alias (29 registros, 4 callbacks): nenhum segredo do cliente, token do Google, JWT, cookie de sessão ou handle de pendência | PASS |

**Limpeza (2026-10-05).** Removidos: as três variáveis restritas à branch, a branch `proof/81-google-preview` e a URI do alias no cliente "TROQS preview". A conta de teste foi apagada do Neon de `preview` (usuário, identidade, aceite e sessões), e o banco voltou à linha de base: 4 usuários, 0 identidades Google, 0 pendências. Ficam o projeto `troq-510700`, a tela de consentimento em modo de teste e o cliente sem URI.

**Não provados com o Google real** (cobertos só pelos testes automatizados de `google-signin.integration.test.ts`):

- colisão com conta por senha e vinculação explícita, porque não havia uma segunda conta de teste autorizada com e-mail de conta por senha;
- conta bloqueada;
- cancelamento na tela do Google.

**Observação.** A conta de teste ficou com duas sessões depois da conclusão: a do navegador e uma de um segundo retorno pelo Google durante a conclusão. A segunda expira normalmente e não afeta o resultado.

Sem as credenciais, a entrada com Google fica indisponível, como desenhado (IC-15.8), e o login por senha segue igual.

## Roteiro da prova em `preview`

A release atual usa o alias estável `https://techlab-troq-git-preview-bruno-m-noronha.vercel.app` (DEC-050). A prova abaixo foi originalmente desenhada para branch descartável; em #133, usar o par no Preview efetivo da branch `production`, `BETTER_AUTH_URL` estável e callback exato `https://techlab-troq-git-preview-bruno-m-noronha.vercel.app/api/auth/callback/google`. Não remover essa configuração estável ao concluir o teste.

1. **Provisionar.**
   - No Google Cloud: tela de consentimento com os escopos `openid` e `email` e conta de teste controlada.
   - Cliente OAuth "Aplicativo da Web" de `preview`, sem origem JavaScript, com a URI de redirecionamento `https://<alias-da-branch-de-prova>/api/auth/callback/google`.
   - Na Vercel, escopo Preview restrito à branch de prova: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (sensível) e `BETTER_AUTH_URL` no alias. Quem grava o segredo é o Bruno.
2. **Cadastro.** O Bruno faz a autenticação no Google, no próprio Chrome, porque digitar senha fica com ele.
   - Em `/cadastro`, "Continuar com Google" → Google → `/cadastro/google`.
   - Conferir, no Neon de `preview`, só com agregados: nenhuma linha nova em `users` e uma pendência `google-signup:` em `verifications`.
   - Concluir com nome, 18+ e termos → Google → `/conta` com sessão.
   - Conferir uma linha em `users`, com `email_verified` e `email_verified_at`; uma em `accounts`, com `provider_id = 'google'` e tokens nulos; e um `terms_acceptances` `age_eligibility`.
3. **Recusa.** Cancelar em `/cadastro/google` → `/login?motivo=google_cancelado`, sem linha em `users`. Cancelar na tela do Google → mesmo motivo.
4. **Acesso posterior.** Sair e entrar de novo com Google → mesma conta, sem linha nova em `users` nem em `accounts`.
5. **Colisão e vinculação.**
   - Com uma conta por senha que usa o e-mail da conta de teste Google, "Continuar com Google" recusa com `google_conta_existente`.
   - Logado por senha, "Vincular Conta Google" em `/conta` vincula.
   - Entrar com Google depois disso cai na mesma conta.
6. **Sessão.** Logout invalida a sessão aberta pelo Google.
7. **Vazamentos.** Conferir os logs de requisição da Vercel.
   - A URL do callback carrega `code` e `state` por desenho do OAuth. Ambos são de uso único, já consumidos e inúteis sem o segredo do cliente e o verificador PKCE.
   - Nenhum log, URL ou página pode carregar token do Google, `GOOGLE_CLIENT_SECRET`, cookie de sessão ou o handle da pendência.
8. **Limpeza.** Remover as variáveis restritas à branch de prova e a URI de redirecionamento dela do cliente OAuth.

## `production`

Mesmo roteiro, depois que a origem `https` de [#77](https://github.com/BrunoMNoronha/techlab-troq/issues/77) e a configuração de autenticação de `production` existirem: cliente OAuth próprio, com URI `https://<origem-de-production>/api/auth/callback/google`; tela de consentimento publicada (fora do modo de teste) antes de abrir a pessoas reais.

Registrar aqui: ambiente, revisão (`git rev-parse HEAD`), data, resultado de cada passo e pendências — sem e-mail real, credencial ou captura com dado pessoal.
