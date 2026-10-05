# Contrato técnico de identidade e autenticação — TROQ (F2-001)

Especificação normativa de identidade, credencial, sessão, verificação de email e autorização de conta do TROQ sobre Better Auth. Produzida por **F2-001** ([#39](https://github.com/BrunoMNoronha/techlab-troq/issues/39)) e reconciliada em 2026-09-29 com as decisões de produto, o schema real e a documentação oficial atual do Better Auth. É a fonte que [#40](https://github.com/BrunoMNoronha/techlab-troq/issues/40) (núcleo server-side), [#41](https://github.com/BrunoMNoronha/techlab-troq/issues/41) (cadastro e verificação) e [#42](https://github.com/BrunoMNoronha/techlab-troq/issues/42) (login, logout e área da conta) implementam.

Os itens são identificados como `IC-x`. Cada item é classificado como **normativo** (derivado de regra de produto ou arquitetura já homologada), **decisão arquitetural** (fecha uma escolha técnica deste contrato) ou **decisão técnica ajustável** (valor escolhido com justificativa, alterável por PR que atualize este documento sem reabrir regra de produto).

**O que este documento não faz:** não implementa código, não altera schema nem migration, não provisiona ambiente, não cria regra de produto e não declara concluídas #40, #41 ou #42. Onde o código atual diverge deste contrato, o contrato prevalece e a divergência está registrada na seção 14 como pendência da issue responsável.

**Incremento de [#81](https://github.com/BrunoMNoronha/techlab-troq/issues/81) (2026-10-04).** A entrada e o cadastro com Conta Google foram acrescentados pela seção 15 (`IC-15.x`), revisada contra o código-fonte do `better-auth` 1.7.6 antes da implementação. Os itens IC-3.2, IC-5.3, IC-6.1, IC-12 e IC-13.1 foram ajustados para referenciá-la. O incremento não reabre o gate da Fase 2 ([#51](https://github.com/BrunoMNoronha/techlab-troq/issues/51)). A entrada com Google foi aprovada pelo Bruno em 2026-10-04 (DEC-047, que substitui o trecho "login social fora do núcleo inicial" de DEC-013) e é oferecida só em `preview` e `production`; `development` não é provisionado (IC-15.8).

## 1. Fontes e hierarquia

**IC-1.1 (normativo).** Em conflito, prevalecem nesta ordem: decisões e requisitos de produto ([../product/requirements.md](../product/requirements.md), [../product/age-eligibility.md](../product/age-eligibility.md) — DEC-034, [../product/data-retention-policy.md](../product/data-retention-policy.md) — DEC-033), arquitetura homologada ([overview.md](overview.md), AR-7; [data-model.md](data-model.md), DM-3), este contrato e, por último, o código. Comportamento existente no código não vira requisito por já estar implementado.

**IC-1.2 (fato verificado).** Versão adotada: `better-auth` **1.7.6** (a mais recente publicada em 2026-09-29), com Next.js 16.3.5 (App Router), Prisma 7.10.0 e `@prisma/adapter-pg`. As afirmações sobre o provedor vêm da documentação oficial listada na seção 17. Quando a documentação é omissa, o comportamento foi conferido no código-fonte publicado do pacote 1.7.6 e está marcado como tal.

## 2. Identidade

**IC-2.1 (decisão arquitetural).** `User` (tabela `users`) é a **única** entidade de pessoa usuária do produto e também o modelo `user` do Better Auth. Não existe cadastro paralelo, tabela espelho nem segunda fonte de estado da pessoa. O mapeamento de campos do provedor é: `name` → `displayName`; `email`, `emailVerified`, `image`, `createdAt` e `updatedAt` com o mesmo nome. `image` existe por exigência do schema do provedor e **não** é coletado nem exibido no MVP.

**IC-2.2 (fato do schema).** As tabelas do provedor já existem pela migration aditiva `20260928103600_add_better_auth_tables`, sem reescrever a migration inicial: `sessions`, `accounts` e `verifications`, com `sessions.user_id` e `accounts.user_id` referenciando `users.id` (`ON DELETE CASCADE`). Relações de `User` com `UserContact`, `TermsAcceptance` e `AccountDeletionRequest` não foram alteradas. **Este contrato não exige mudança de schema**, salvo o índice único aditivo `accounts(provider_id, account_id)` acrescentado por #81 (IC-15.4). As colunas `sessions.ip_address` e `sessions.user_agent` permanecem nulas (IC-11.1).

**IC-2.3 (decisão técnica ajustável).** Identificadores: `users.id` é UUID gerado pelo banco/Prisma. O Better Auth deve ser configurado com `advanced.database.generateId: "uuid"`, para que qualquer registro que ele crie tenha id compatível com as colunas existentes. O provedor nunca cria `User` no MVP (IC-6.1, IC-15.2).

**IC-2.4 (normativo).** Email é armazenado normalizado (`trim` + minúsculas) e é único entre contas não excluídas, garantido pelo índice parcial `users_email_active_key` (`WHERE status <> 'deletion_requested'`).

**IC-2.5 (decisão arquitetural).** O Better Auth localiza usuário **por email** (login e verificação do provedor fazem `findOne` por `email`) e presume email único na tabela inteira. O índice parcial admite duas linhas com o mesmo email quando uma está em `deletion_requested`. Invariante obrigatória: **nenhuma consulta do provedor pode resolver um email para uma conta em `deletion_requested`**. Consequências:

1. Enquanto a exclusão de conta não estiver implementada com uma garantia equivalente, o cadastro recusa email presente em **qualquer** linha de `users` (IC-6.4). Hoje nenhum fluxo cria `deletion_requested`, então isso não muda comportamento observável.
2. A implementação da exclusão (RF-023, fora de #40–#42) deve, na mesma transação do efeito imediato, tornar o email da conta excluída irresolúvel pelo provedor. O mecanismo recomendado é substituir `users.email` por um valor pseudonimizado não roteável, o que antecipa, dentro do prazo máximo de 30 dias de DEC-033, a anonimização do email já prevista. A escolha final pertence à issue da exclusão e deve ser conferida contra DEC-033.

## 3. Estados da conta

**IC-3.1 (normativo).** O estado da conta é o enum real `UserStatus` (DM-3.1): `active`, `blocked_age` (bloqueio cautelar etário, DEC-034, seção 5), `blocked_admin` (sanção administrativa, DEC-031, seção 10) e `deletion_requested` (RF-023). **Não existe** `accountState`, nem estados `UNVERIFIED`, `ACTIVE`, `BLOCKED` ou `DELETED`.

**IC-3.2 (normativo).** Verificação de email **não** é estado da conta: é o par `emailVerified` (booleano consultado pelo provedor) e `emailVerifiedAt` (instante, campo de negócio do TROQ). Os dois mudam juntos, na mesma escrita, apenas pela confirmação de token (IC-7) ou, no cadastro com Google, pela criação da conta a partir do `email_verified` do Google (IC-15.5). Conta recém-criada por senha é `status = active` com `emailVerified = false`.

**IC-3.3 (normativo).** A solicitação de exclusão é o registro `AccountDeletionRequest` somado a `status = deletion_requested`, aplicados na mesma transação que produz o efeito imediato (DM-3.4). O expurgo em até 30 dias não muda este contrato.

**IC-3.4 (decisão arquitetural).** Efeito de cada combinação:

| Situação | Login (IC-5) | Sessão existente | Ação protegida (IC-8) |
| --- | --- | --- | --- |
| `active`, email verificado | permitido | válida | autorizada (N1) |
| `active`, email não verificado | negado com motivo "email não verificado", só após senha correta | não pode existir por login; se existir, é negada | negada, motivo `unverified` |
| `blocked_age` ou `blocked_admin` | negado após senha correta | revogada na transição (IC-5.6); se sobrar, é negada | negada, motivo `blocked` |
| `deletion_requested` | negado (email irresolúvel, IC-2.5; e bloqueio de sessão, IC-5.3) | revogada na transição | negada, motivo `deletion_requested` |

O MVP não tem RBAC. O perfil de moderação (AR-7.4) não é modelado por este contrato.

## 4. Credencial

**IC-4.1 (normativo).** Senha nunca é armazenada, registrada em log, enviada à telemetria ou devolvida em DTO em texto puro.

**IC-4.2 (decisão arquitetural).** A credencial email/senha é **uma** linha de `accounts` com `providerId = 'credential'`, `accountId = userId` e `password` contendo o hash no formato do provedor — exatamente onde o Better Auth a lê no login. O hash é produzido por `hashPassword` de `better-auth/crypto`, que é o algoritmo padrão do provedor (scrypt). O contrato **não** configura `emailAndPassword.password.hash/verify` customizados; se um dia forem configurados, o cadastro passa a usar a mesma função, na mesma PR.

**IC-4.3 (decisão técnica ajustável).** Senha com 8 a 128 caracteres, que são os limites padrão do provedor (`minPasswordLength`, `maxPasswordLength`). O cadastro valida os mesmos limites antes de gerar o hash.

**IC-4.4 (normativo de verificação).** A compatibilidade da credencial é provada, e não presumida: teste de integração em PostgreSQL descartável cria a conta pelo cadastro do TROQ e autentica pelo `auth.api.signInEmail` real (#40/#41).

**IC-4.5 (escopo).** Troca e redefinição de senha não existem no MVP atual. Se forem introduzidas, usam os endpoints do provedor e revogam as demais sessões (`revokeOtherSessions` / `revokeSessionsOnPasswordReset: true`), com atualização deste contrato.

## 5. Sessão — autoridade única

**IC-5.1 (decisão arquitetural).** O **Better Auth é a única autoridade de sessão**. Não existe segundo mecanismo de emissão, leitura ou validação:

| Responsabilidade | Quem | Como |
| --- | --- | --- |
| Autenticar email/senha | Better Auth | `auth.api.signInEmail({ body: { email, password }, headers: await headers() })`, chamado pela Server Action de login |
| Criar a sessão | Better Auth | Linha em `sessions` criada pelo provedor no `signInEmail` |
| Gerar e gravar o cookie | Better Auth | Cookie `session_token` assinado com o segredo, gravado via plugin `nextCookies()` (último plugin da lista) |
| Ler e validar | Better Auth | `auth.api.getSession({ headers: await headers() })`: confere assinatura, busca o token em `sessions`, confere expiração |
| Expirar e renovar | Better Auth | `session.expiresIn` e `session.updateAge` (IC-5.4) |
| Encerrar (logout) | Better Auth | `auth.api.signOut({ headers: await headers() })`, confirmado por IC-5.5 |
| Autorização de domínio | TROQ | Guard de IC-8, **depois** da sessão validada pelo provedor |

**IC-5.2 (decisão arquitetural — proibições).** É proibido, em qualquer caminho de autenticação:

1. criar linha em `sessions` ou gravar o cookie de sessão fora do provedor;
2. ler `sessions` pelo token, ou ler o cookie pelo nome, para decidir quem é o usuário;
3. qualquer **fallback** que transforme cookie ou token não validado pelo `getSession` em identidade — se o provedor não devolve sessão, **não há sessão**;
4. usar `getSessionCookie`/presença de cookie como autorização (a documentação oficial classifica esse uso como inseguro; serve só para redirecionamento otimista);
5. expor token, id de sessão, `ipAddress` ou `userAgent` em DTO, HTML, payload RSC, log ou telemetria.

A única escrita direta em `sessions` permitida ao TROQ é a **remoção** por `userId` na revogação administrativa de IC-5.6, que só retira autorização.

**IC-5.3 (decisão arquitetural).** Configuração normativa do provedor:

- `emailAndPassword`: `enabled: true`, `requireEmailVerification: true`, `disableSignUp: true` (cadastro só pela Server Action de IC-6).
- `emailVerification`: **não** configurado (sem `sendVerificationEmail`, `sendOnSignUp`, `sendOnSignIn` ou `autoSignInAfterVerification`). Com isso o `signInEmail` de conta não verificada responde `403 EMAIL_NOT_VERIFIED` sem enviar email e sem criar sessão (IC-7.1).
- `session.cookieCache`: **desabilitado**. Com cache de cookie, sessão revogada continua aceita em outros dispositivos até o `maxAge` do cache, o que contraria o efeito imediato de RF-023 e DM-3.4.
- `databaseHooks.session.create.before`: lê `users.status` do `userId` e **aborta** a criação (erro `APIError` `FORBIDDEN`) quando o status não é `active`. É o ponto único que impede sessão de conta bloqueada ou em exclusão, qualquer que seja o caminho que tente criá-la; o mesmo hook zera `ipAddress` e `userAgent` (IC-11.1).
- `advanced.ipAddress.disableIpTracking: true`.
- Entrada com Google (IC-15): `socialProviders.google` só com credenciais válidas, escopos `openid` e `email`; `user.validateUserInfo` como gate de identidade; `databaseHooks.user.create.before` que sempre recusa e `databaseHooks.user.update.before` que descarta toda escrita do provedor em `users`; `databaseHooks.account.create/update.before` que descartam tokens do provedor; `account.accountLinking` com `disableImplicitLinking: true` e `allowDifferentEmails: false`; `account.updateAccountOnSignIn: false`; `onAPIError.errorURL` apontando para `/login/google`.
- `plugins: [nextCookies()]`, sempre por último.
- Sem `crossSubDomainCookies`, sem `secondaryStorage`, sem `trustedProxyHeaders`, sem `disableCSRFCheck` e sem `disableOriginCheck`.

**IC-5.4 (decisão técnica ajustável).** Duração: `expiresIn` de 7 dias e `updateAge` de 1 dia, que são os padrões do provedor (AR-7.5 manda seguir o padrão seguro da solução). A renovação só persiste o novo cookie em Server Action ou Route Handler; RSC não grava cookie, então o cookie do navegador pode expirar antes da linha em `sessions`, o que falha fechado. `rememberMe` fica no padrão (`true`); o MVP não oferece a opção.

**IC-5.5 (decisão arquitetural — logout).** O logout chama `auth.api.signOut` com os headers da requisição. Na versão 1.7.6, o provedor registra em log, e não propaga, uma falha ao apagar a sessão, e mesmo assim remove o cookie (conferido no código-fonte do pacote). Como #42 exige não declarar sucesso sem invalidação efetiva, a Server Action confirma a revogação pelo próprio provedor: depois do `signOut`, chama `auth.api.getSession` com os **mesmos headers originais** (que ainda carregam o cookie antigo) e `query: { disableRefresh: true }`. Se ainda houver sessão, o logout responde falha e a interface informa erro. Sem cookie válido, o logout é sucesso idempotente.

**IC-5.6 (decisão arquitetural — revogação administrativa).** Toda transição de `status` para `blocked_age`, `blocked_admin` ou `deletion_requested` apaga **todas** as linhas de `sessions` do `userId` na **mesma transação** que muda o status (DM-3.4, AR-7.3). A transição de exclusão também apaga os tokens de verificação da conta (IC-7.2). Mesmo que uma sessão sobreviva por falha, o guard de IC-8 nega pelo status lido no banco: a revogação é defesa em profundidade, não a única barreira.

**IC-5.7 (normativo — cenários).** Resultado exigido no servidor e na interface:

| Cenário | Resultado do provedor | Resultado TROQ |
| --- | --- | --- |
| Sem cookie | `getSession` → `null` | negado, motivo `no_session` → `/login?motivo=sessao` |
| Cookie adulterado ou assinatura inválida | `null` | idem; nunca consultar `sessions` pelo valor bruto |
| Token sem linha em `sessions` (revogado ou logout) | `null` | idem |
| Sessão expirada | `null`; o provedor remove o cookie e a linha | idem |
| Conta `blocked_*` com sessão remanescente | sessão válida | negado, motivo `blocked` |
| Conta `deletion_requested` com sessão remanescente | sessão válida | negado, motivo `deletion_requested` |
| Email não verificado com sessão (anomalia) | sessão válida | negado, motivo `unverified` |
| Erro do provedor ou do banco ao validar | exceção | negado, **fail-closed**; o erro é registrado sem token nem cookie |

## 6. Cadastro

**IC-6.1 (decisão arquitetural).** O cadastro é a Server Action do TROQ (`registerUser`), e não o `signUpEmail` do provedor, porque a declaração 18+ e o aceite dos termos precisam ser gravados **atomicamente** com a conta (DEC-034, seção 3). Em uma única transação Prisma ela cria `User` (`active`, `emailVerified = false`), a credencial de IC-4.2 e o `TermsAcceptance` do tipo `age_eligibility` com `termsVersion` e `acceptedAt`. Falha em qualquer escrita desfaz as três. O cadastro **não** cria sessão. O cadastro com Google segue a mesma regra, na Server Action própria de IC-15.3.

**IC-6.2 (normativo).** Entradas: nome de exibição, email, senha, declaração explícita "Declaro que tenho 18 anos completos ou mais" (ato afirmativo, nunca pré-marcado) e aceite dos termos. A validação é feita no servidor, independentemente do formulário. **Não** se coleta data de nascimento, CPF, RG, CNH, documento, selfie ou biometria, nem se usa serviço externo de verificação etária (DEC-034, seção 4). Sem a declaração, o cadastro é recusado e nada é gravado.

**IC-6.3 (normativo).** O registro de aceite guarda somente aceitação, tipo, instante e versão. **Não** grava IP nem user-agent: nenhum requisito os exige (IC-11.1).

**IC-6.4 (decisão técnica ajustável).** Email duplicado: nenhuma conta nova é criada, nenhum dado da conta existente é alterado e nenhum email é enviado. A resposta pode dizer que o email já está cadastrado, sem revelar o estado da conta existente. A proteção completa contra enumeração no cadastro exigiria avisar o titular por email, e o catálogo de emails (RF-021) ainda é parcialmente definido; esse risco residual fica aceito até lá. Pela invariante de IC-2.5, o conflito considera qualquer linha de `users` com o mesmo email. A corrida entre dois cadastros simultâneos é resolvida pelo índice único: a violação de unicidade é tratada como duplicado, não como erro interno.

**IC-6.5 (normativo).** Depois do commit, o cadastro emite o token (IC-7) e tenta enviar o email (IC-9). A conta existe mesmo se o envio falhar.

## 7. Verificação de email

**IC-7.1 (decisão arquitetural).** A verificação usa token **do TROQ**, e não o endpoint `/verify-email` do provedor. Na versão 1.7.6, o token de verificação do Better Auth é um JWT sem estado, assinado com o segredo (conferido no código-fonte; a documentação não o descreve): ele não é de uso único, um reenvio não invalida os anteriores e ele só grava `emailVerified`, sem `emailVerifiedAt`. Isso não atende #41. A verificação do TROQ **não autentica**: não cria sessão nem cookie, e o login continua exclusivo do provedor (IC-5).

**IC-7.2 (decisão técnica ajustável).** Formato e armazenamento, na tabela existente `verifications`:

- token com 32 bytes aleatórios de fonte criptográfica, codificado para URL;
- `identifier = 'email-verification:' + userId` (id, e não email, para não depender de IC-2.5);
- `value` guarda **somente o SHA-256** do token; o token em claro existe só no link enviado;
- `expiresAt` = emissão + **24 horas**. Justificativa: o padrão de 1 hora do provedor tende a vencer antes de o usuário abrir o email em caixas com atraso ou filtro. O risco da janela maior é contido porque o token é de uso único, é invalidado pelo reenvio e só confirma o email, sem abrir sessão.

**IC-7.3 (decisão arquitetural — confirmação).** A confirmação ocorre em uma transação: remove a linha pelo hash do token e obtém o `identifier` e a expiração dessa mesma linha, na mesma instrução; em seguida marca `emailVerified = true` e `emailVerifiedAt = now()` no usuário, apenas se ainda não verificado. Resultados:

| Caso | Resposta | Efeito |
| --- | --- | --- |
| Token válido | email confirmado; convite para login | usuário verificado; demais tokens da conta removidos |
| Ausente, malformado ou desconhecido | "link inválido ou já utilizado" | nenhum |
| Já utilizado (inclusive clique duplo) | a mesma resposta; "se você já confirmou, faça login" | nenhum: a primeira transação consumiu a linha |
| Expirado (inclusive invalidado por reenvio) | "link expirado; solicite novo" | linha removida; nenhuma verificação |
| Conta `deletion_requested` | tratado como inválido | tokens já removidos na transição (IC-5.6) |

Confirmações concorrentes do mesmo token resultam em exatamente uma confirmação. O token nunca aparece em log, telemetria ou mensagem de erro.

## 8. Autorização de domínio

**IC-8.1 (decisão arquitetural).** Autenticação (provedor) e autorização (TROQ) são camadas separadas. O guard do TROQ implementa o nível **N1** de AR-7.2 para toda ação protegida — Server Action, Route Handler e página privada — no instante da execução:

1. `auth.api.getSession({ headers: await headers() })` é a única fonte de identidade; `null` ou erro → negado (IC-5.7);
2. lê de `users`, pelo `session.user.id`, o `status` e o `emailVerified` **atuais**;
3. usuário inexistente → `no_session`; `status ≠ active` → `blocked` ou `deletion_requested`; email não verificado → `unverified`;
4. só então devolve o DTO mínimo `{ id, displayName, emailVerified, status }`.

**IC-8.2 (normativo).** N2 (papel na operação) e N3 (pré-condição de estado, na mesma transação do efeito) continuam nos módulos donos da operação (AR-7.2, AR-7.3). O guard não os substitui, e nenhum módulo aceita `userId` vindo do cliente como identidade: o ator é sempre o id devolvido pelo guard.

**IC-8.3 (normativo).** O `proxy` do Next.js pode redirecionar de forma otimista pela presença do cookie, mas nunca autoriza. A proteção de toda página e ação privada é o guard de IC-8.1 no servidor.

## 9. Envio, falha e reenvio de email

**IC-9.1 (decisão arquitetural).** O envio é feito pelo servidor, via Resend (DEC-015), e o resultado é **propagado**: a função de envio devolve sucesso somente quando o provedor aceita a mensagem. Chave ausente, placeholder `SUBSTITUIR_...`, erro de API ou exceção são **falha** em qualquer ambiente. Não existe sucesso fictício. Destinatário, token e link nunca vão para log (inclusive `console`) ou telemetria; o erro é registrado só com categoria e código do provedor. Testes usam transporte simulado injetado, não o console. O envio é aguardado (`await`) porque o resultado precisa chegar à resposta; a recomendação do provedor de não aguardar vale para os callbacks dos endpoints dele, que este contrato não usa.

**IC-9.2 (normativo).** Falha de envio no cadastro: a conta permanece criada e não verificada, o token emitido é invalidado, e a resposta informa que a conta foi criada mas o email não pôde ser enviado, oferecendo reenvio. Nunca se marca o email como verificado por causa da falha.

**IC-9.3 (decisão técnica ajustável).** O reenvio é uma Server Action que recebe o email e responde de forma **genérica** — "se houver cadastro pendente de verificação para este email, enviaremos um novo link" — tanto para email inexistente, já verificado ou de conta não ativa quanto para envio aceito ou suprimido pelo limite. A única resposta distinta é a falha do provedor com conta elegível ("não foi possível enviar agora; tente novamente"), risco residual aceito porque só ocorre em indisponibilidade. Para conta elegível (`active`, não verificada), o reenvio:

1. aplica o limite de IC-9.4, contado pelas linhas `email-verification:<userId>` com `createdAt` nas últimas 24 horas;
2. invalida os tokens anteriores da conta, fazendo `expiresAt = now()` (o link antigo passa a responder "expirado");
3. emite novo token (IC-7.2) e envia.

**IC-9.4 (decisão técnica ajustável).** Limites por conta: intervalo mínimo de **60 segundos** entre emissões e no máximo **5 emissões em 24 horas**, contando a do cadastro. Justificativa: o provedor não limita chamadas `auth.api` (IC-10.1), e o reenvio sem limite permite usar o TROQ para inundar a caixa de terceiros e degradar a reputação do domínio remetente. 60 segundos cobrem a entrega normal, e 5 por dia bastam para recuperar erro de digitação ou filtro de spam. Os limites são aplicados no servidor e persistidos no PostgreSQL (nunca em memória, que não sobrevive entre invocações serverless). Linhas expiradas há mais de 24 horas podem ser removidas por qualquer limpeza oportunista.

## 10. Proteção contra abuso no login

**IC-10.1 (fato oficial).** O limitador embutido do Better Auth **não se aplica** a chamadas `auth.api` feitas no servidor, e seu armazenamento padrão é em memória. Como o login do TROQ é uma Server Action que chama `auth.api.signInEmail`, a proteção é responsabilidade do TROQ.

**IC-10.2 (decisão técnica ajustável).** Limite de **5 falhas de credencial em 15 minutos** por email normalizado. Ao atingir o limite, novas tentativas para aquele email são recusadas sem chamar o provedor, com a mensagem genérica "muitas tentativas; aguarde alguns minutos" até a janela expirar. O contador é chaveado pelo SHA-256 do email normalizado, **exista ou não a conta**, para não revelar existência. Conta como falha apenas `INVALID_EMAIL_OR_PASSWORD`; sucesso zera o contador. Armazenamento persistente no PostgreSQL: linhas `login-failure:<sha256>` em `verifications` com expiração de 15 minutos, ou tabela própria criada por migration aditiva na própria #42. Nenhum IP é usado nem persistido. Justificativa: a janela limita a força bruta online a cerca de 480 tentativas por dia por conta, e o bloqueio temporário, e não permanente, limita o uso do limite para travar a conta de outra pessoa.

**Implementado por F2-004 (#42, 2026-09-29).** `src/modules/identity/login-rate-limit.ts` usa `verifications` sem migration: `identifier` = `login-failure:<sha256(e-mail normalizado)>` e `value` indica apenas o tipo da linha (`reservation` ou `failure`). Cada tentativa reserva uma vaga numa transação curta, serializada por `pg_advisory_xact_lock` do próprio identifier, e só depois chama o provedor, sem transação aberta durante a verificação da senha; reservas pendentes ocupam vaga, então tentativas simultâneas não levam mais de 5 verificações ao provedor. `INVALID_EMAIL_OR_PASSWORD` converte a reserva em falha de 15 min; outros resultados descartam a reserva; sucesso apaga o bucket. Reserva órfã (função interrompida) expira em 120 s. A 6ª tentativa responde "Muitas tentativas. Aguarde alguns minutos e tente novamente." sem chamar o provedor. Todo instante vem do relógio do PostgreSQL.

**IC-10.3 (normativo).** As mensagens de login não revelam existência de conta: email desconhecido, conta sem credencial e senha errada recebem a mesma resposta "email ou senha inválidos". Email não verificado e conta não ativa só são revelados depois da senha correta, que é a ordem do próprio provedor (senha → verificação → criação da sessão, IC-5.3).

## 11. Dados pessoais, logs e telemetria

**IC-11.1 (normativo).** Identidade e autenticação não ampliam a coleta de dados pessoais (RNF-008). IP e user-agent **não** são requisito funcional, **não** entram em `TermsAcceptance` e **não** são persistidos em `sessions` (IC-5.3). O processamento transitório desses dados pela infraestrutura (Vercel, logs de acesso de DEC-033) não autoriza persistência adicional sem requisito próprio.

**IC-11.2 (normativo).** Senha, hash, token de sessão, cookie, token de verificação e link de verificação nunca aparecem em log, Sentry, DTO, HTML ou payload RSC. A camada de redação de telemetria ([../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md)) continua valendo, e este contrato não a afrouxa.

## 12. Segredos, URL e origens por ambiente

**IC-12.1 (decisão arquitetural — fail-closed).** A instância do Better Auth só é construída com configuração completa e coerente. O código **não** contém segredo literal nem URL de fallback, e o TROQ passa `secret` e `baseURL` explicitamente, depois de validá-los, para que o segredo padrão interno do provedor nunca seja alcançado. Configuração ausente ou incoerente lança erro na primeira construção da instância, que é lazy, e a requisição falha. Nunca se autentica com configuração parcial.

| Item | `development` | `preview` | `production` |
| --- | --- | --- | --- |
| `APP_ENV` | `development` | `preview` | `production`; ausente ou fora desses valores → erro |
| `BETTER_AUTH_SECRET` | obrigatório em `.env.local`; ≥ 32 caracteres aleatórios (`openssl rand -base64 32`) | obrigatório no escopo Preview da Vercel, marcado sensível, distinto do de `development` | obrigatório, distinto dos demais; **não provisionado** |
| Ausência do segredo | erro | erro | erro |
| URL base | `BETTER_AUTH_URL` explícita (`http://localhost:3000`) | `https`, sem fallback: `BETTER_AUTH_URL` fixa no alias de preview **ou** `baseURL` dinâmica com `allowedHosts` restrito ao padrão de host do **próprio projeto** na Vercel (`protocol: "https"`) | `BETTER_AUTH_URL` explícita, `https` |
| Origens confiáveis | apenas a URL base | apenas as derivadas da URL base/`allowedHosts`; **nunca** `localhost` e **nunca** o curinga genérico `*.vercel.app`, que confiaria em qualquer site hospedado na Vercel | apenas a URL base |
| Cookie `Secure` | não (HTTP local) | sim | sim |

**IC-12.2 (normativo).** Em `preview` e `production`, URL base `http://` ou `localhost` é incoerente e lança erro. Testes automatizados injetam segredo sintético no próprio setup de teste, nunca em `src/`. `BETTER_AUTH_SECRETS` (rotação versionada) não é adotado no MVP: trocar o segredo invalida todos os cookies de sessão, e isso é aceito.

**IC-12.3 (decisão arquitetural).** Links de email são montados a partir da URL base resolvida pela mesma regra de IC-12.1, nunca a partir de cabeçalho `Host` não validado. Fora de `development`, nunca há fallback para `localhost`. Destinos pós-ação (`returnTo`) são sempre caminhos internos validados por `sanitizeReturnPath`; URL absoluta, `//...`, barra invertida ou esquema são descartados.

**IC-12.4 (escopo).** Este contrato não provisiona nem altera variáveis em nenhum provedor. `production` continua inexistente.

**IC-12.5 (decisão arquitetural).** `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` podem faltar em `development`, onde a ausência desliga só a entrada com Google e nunca o login por senha (IC-15.8). Em `preview` e `production`, porém, o release exige o par completo e o preflight recusa ambiente sem as duas variáveis ou com configuração incoerente.

## 13. Superfície HTTP do provedor

**IC-13.1 (decisão arquitetural).** A rota `src/app/api/auth/[...all]/route.ts` expõe apenas `GET /api/auth/ok`, `GET /api/auth/get-session` e, desde #81, `GET /api/auth/callback/google` (IC-15.1); todo o resto, incluindo qualquer `POST` (inclusive o do callback), `/sign-up/*`, `/sign-in/*` (inclusive `/sign-in/social`), `/link-social`, `/list-accounts`, `/unlink-account`, `/error`, callbacks de outros provedores, `/verify-email` e `/send-verification-email`, responde 404. Cadastro, login, logout, confirmação, reenvio, início do fluxo Google e vinculação acontecem apenas pelas Server Actions do módulo `identity`, que aplicam este contrato. Expandir essa lista exige atualizar este documento.

## 14. Divergências do código atual e pendências

Estado de `main` em `942bf0d` (2026-09-29). Cada item pertence à issue indicada e **não** é resolvido por este documento.

**Atualização de F2-002 (#40, 2026-09-29):** estão resolvidas as linhas do login próprio com cookie cru, do fallback em `validateSession`, do `logoutUser` por token, do segredo e da URL com fallback em `auth.ts` e da configuração ausente de IC-5.3/IC-2.3. A regra de revogação de IC-5.6 aguarda os fluxos reais de bloqueio e exclusão; até lá o guard nega pelo status atual, o que foi provado. As demais linhas seguem com #41 e #42.

**Atualização de F2-003 (#41, 2026-09-29):** estão resolvidas as linhas do token em claro com `identifier` = email, do reenvio que apagava os tokens anteriores sem limite, do envio que logava destinatário e link e devolvia sucesso sem chave, da resposta de reenvio que revelava a conta, da duplicidade que ignorava `deletion_requested` e da corrida entre cadastros, e da base de links com fallback `localhost`. Tokens crus emitidos antes de F2-003 deixam de valer: o link responde inválido e o usuário pede outro. Em `preview`, `BETTER_AUTH_URL` é fixada por branch no alias da própria branch, que é a forma estática de IC-12.1 (docs/engineering/environments.md, seção 5.5). Resta em #42 o limite de tentativas de login.

**Atualização da prova em `preview` (2026-09-29):** os logs de requisição da plataforma gravavam o token quando ele viajava na query string do link (`?token=`, inclusive no `Referer` dos POSTs), o que contrariava IC-9.1 e IC-11.2. Desde [#67](https://github.com/BrunoMNoronha/techlab-troq/pull/67), o link leva o token no fragmento (`/verificar-email#token=`), que o navegador não envia ao servidor; a página o lê, apaga da barra de endereço e confirma pelo corpo da Server Action. Links com `?token=` são inválidos.

| Código atual | Contrato | Issue |
| --- | --- | --- |
| `loginUser` verifica a senha por conta própria, cria linha em `sessions` e grava cookie `better-auth.session_token` com o token cru, sem assinatura | Login por `auth.api.signInEmail` + `nextCookies()` (IC-5.1, IC-5.2) | #40 (núcleo) e #42 (action) |
| `validateSession` cai para leitura direta de `sessions` pelo cookie quando `getSession` falha — e `getSession` sempre falha para o cookie cru acima, porque exige cookie assinado | Sem fallback; só `getSession` (IC-5.2, IC-8.1) | #40 |
| `logoutUser` apaga `sessions` pelo token do cookie | `auth.api.signOut` + confirmação (IC-5.5) | #42 |
| `secret` e `baseURL` com fallback literal em `auth.ts` (segredo fixo de desenvolvimento) | Fail-closed por ambiente (IC-12) | #40 |
| Sem hook de sessão, sem `generateId`, sem `disableIpTracking`, sem `nextCookies()` | Configuração de IC-5.3 e IC-2.3 | #40 |
| Nenhuma transição de status revoga sessões (não há fluxo de bloqueio nem de exclusão) | IC-5.6 na implementação de cada transição | #40 (regra e testes); fluxos de bloqueio/exclusão nas issues próprias |
| Token de verificação guardado em claro em `value`, `identifier` = email, reenvio apaga os tokens anteriores sem limite | IC-7.2, IC-9.3, IC-9.4 | #41 |
| `sendVerificationEmail` registra destinatário e link no console e devolve `true` sem chave; o resultado do envio é ignorado | IC-9.1, IC-9.2 | #41 |
| Reenvio responde "email não encontrado" / "já verificado" | Resposta genérica (IC-9.3) | #41 |
| Cadastro verifica duplicado só entre contas não excluídas; corrida entre cadastros vira erro interno | IC-2.5, IC-6.4 | #41 |
| Login sem limite de tentativas — **resolvido por F2-004 (#42)** | IC-10.2 | #42 |
| Base de links com fallback `localhost` | IC-12.3 | #41 |

Provas exigidas pelas issues continuam pendentes: credencial e sessões reais em PostgreSQL descartável (#40), envio e verificação reais em `preview` com conta de teste controlada (#41) e login/logout reais em `preview` (#42). Testes simulados não substituem essas provas. **Atualização de 2026-09-29:** as três provas foram feitas — #40 contra PostgreSQL descartável, #41 e o login/logout de #42 em `preview` (registrados por [#68](https://github.com/BrunoMNoronha/techlab-troq/pull/68)) — e o limite de tentativas de #42 (IC-10.2) foi provado contra PostgreSQL real e em build de produção por [#69](https://github.com/BrunoMNoronha/techlab-troq/pull/69). #39 a #42 estão encerradas.

## 15. Entrada e cadastro com Conta Google (#81)

**IC-15.1 (decisão arquitetural — autoridade e superfície).** O Google só **identifica**; quem conduz o OAuth é o Better Auth e quem decide o que a identidade pode fazer é o TROQ. O provedor gera o `state` (aleatório, de uso único, guardado em `verifications` e ligado ao navegador por cookie assinado), o PKCE `S256`, troca o código no servidor com o segredo do cliente e lê o `id_token` recebido diretamente do endpoint de token do Google. A sessão continua sendo criada só pelo provedor (IC-5.1). O início do fluxo e a vinculação são Server Actions (`startGoogleSignIn`, `completeGoogleSignup`, `cancelGoogleSignup`, `linkGoogleAccount` em `src/modules/identity/google-actions.ts`) que chamam `auth.api.signInSocial` e `auth.api.linkSocialAccount` depois das regras do TROQ; o único endpoint OAuth exposto por HTTP é `GET /api/auth/callback/google` (IC-13.1).

**IC-15.2 (decisão arquitetural — identidade nova não vira conta no callback).** O gate `user.validateUserInfo` do provedor é chamado antes de criar usuário. Para criação vinda do Google ele **não cria nada**: exige `email_verified`, grava uma **pendência de cadastro** e recusa com `google_signup_required`, que leva o navegador a `/cadastro/google`. A pendência:

- é uma linha de `verifications` com `identifier = 'google-signup:' + SHA-256(handle)` e `value` com o `sub` e o e-mail normalizado — nada mais;
- expira em **15 minutos** pelo relógio do PostgreSQL e é removida ao concluir, ao cancelar ou, vencida, pela limpeza oportunista da próxima pendência;
- é referenciada por um handle de 32 bytes aleatórios num cookie `httpOnly`, `SameSite=Lax`, de 15 minutos, com prefixo `__Host-` em `https`; o banco nunca guarda o handle em claro.

Criação de usuário por qualquer outro caminho do provedor é recusada (`signup_disabled`), e `databaseHooks.user.create.before` recusa sempre, como defesa em profundidade: usuário só nasce pelas Server Actions do TROQ.

**IC-15.3 (normativo — cadastro só depois de 18+ e termos).** `completeGoogleSignup` valida no servidor nome de exibição, declaração 18+ e aceite dos termos, ambos como ato afirmativo `true`; não infere idade pelo perfil Google e não coleta data de nascimento nem documento (DEC-034). Numa **única transação**: consome a pendência (`DELETE ... RETURNING`, uso único), recusa se o e-mail já existe em qualquer linha de `users` (IC-2.5), e cria `User` (`active`, `emailVerified = true`, `emailVerifiedAt = now()`), a linha `accounts` do Google (`provider_id = 'google'`, `account_id = sub`, sem tokens) e o `TermsAcceptance` `age_eligibility` com a versão vigente (`TERMS_VERSION`). Falha em qualquer escrita desfaz tudo e preserva a pendência. A conclusão não cria sessão: o navegador volta ao Google (`login_hint`) e o provedor abre a sessão da conta agora vinculada. Recusar ou abandonar não deixa conta: cancelar descarta pendência e cookie, e a pendência abandonada expira.

**IC-15.4 (decisão arquitetural — política de vinculação).**

| Situação no callback | Resultado |
| --- | --- |
| Identidade (`google` + `sub`) já vinculada | Entra na conta dona, qualquer que seja o e-mail atual no Google; o e-mail TROQ não muda |
| Identidade nova e e-mail inexistente | Pendência de cadastro (IC-15.2) |
| Identidade nova e e-mail de conta existente — verificada ou não, por senha ou não, em qualquer status | **Recusada** (`account_not_linked`): nada é vinculado e nenhuma sessão é criada. A pessoa entra com e-mail e senha e vincula em Minha conta |
| E-mail não verificado pelo Google | Recusada (`google_email_not_verified`), sem pendência |

Não há vinculação implícita por igualdade de e-mail (`disableImplicitLinking: true`): ela entregaria ao Google uma conta por senha que um terceiro pode ter criado com o e-mail da vítima sem nunca verificá-lo (pré-sequestro). A **vinculação explícita** só existe a partir de `/conta`: `linkGoogleAccount` exige sessão válida pelo guard (conta `active` e e-mail verificado) e recusa se a conta já tiver Conta Google; o provedor guarda no `state` o id e o e-mail da sessão e, no callback, só vincula se o Google confirmar **o mesmo e-mail como verificado** (`allowDifferentEmails: false`) e se a identidade não pertencer a outra conta (`account_already_linked_to_different_user`, sem transferência). O índice único `accounts(provider_id, account_id)` (migration `20261004120000_account_provider_identity_unique`) impede que callbacks ou conclusões concorrentes gravem a mesma identidade duas vezes. Desvinculação não é oferecida no MVP; conta criada pelo Google não tem senha, e redefinição de senha não existe (IC-4.5).

**IC-15.5 (normativo — verificação de e-mail).** Só o `email_verified` do `id_token` do Google prova o controle do e-mail. O cadastro com Google grava `emailVerified` e `emailVerifiedAt` juntos (IC-3.2). O provedor não altera `users` (`databaseHooks.user.update.before` devolve `false`), então o atalho do Better Auth que marcaria `emailVerified` sem `emailVerifiedAt` numa entrada social não acontece.

**IC-15.6 (decisão arquitetural — erros e retorno).** Todo erro do fluxo Google redireciona para `/login/google` — a `errorCallbackURL` de cada fluxo e o `onAPIError.errorURL` usado quando o `state` está ausente ou ilegível —, que traduz o código numa lista fechada e responde `303` com `Location` relativo e `no-store`. O código cru e `error_description` (texto do provedor) nunca chegam à página. `callbackURL` e o destino `next` são sempre caminhos internos validados por `sanitizeReturnPath` (IC-12.3).

| Código | Destino |
| --- | --- |
| `google_signup_required` | `/cadastro/google` |
| `access_denied` (cancelamento no Google) | `/login?motivo=google_cancelado` |
| `account_not_linked` | `/login?motivo=google_conta_existente` |
| `google_email_not_verified` | `/login?motivo=google_email_nao_verificado` |
| `ACCOUNT_NOT_ACTIVE` | `/login?motivo=bloqueada` |
| qualquer outro (`state_mismatch`, `invalid_code`, falha do provedor...) | `/login?motivo=google_falha` |
| vinculação: `email_does_not_match`, `account_already_linked_to_different_user`, `access_denied`, outros | `/conta?google=email_diferente`, `ja_vinculada`, `cancelado`, `falha` |

**IC-15.7 (normativo — minimização e retenção).** Escopos pedidos: só `openid` e `email` (`disableDefaultScope`), sem `profile` — o nome de exibição é digitado na conclusão —, sem foto, sem acesso offline e com `include_granted_scopes=false`. Tokens do Google (`access_token`, `refresh_token`, `id_token`) **não são guardados**: os hooks de criação e atualização de `accounts` os descartam e `updateAccountOnSignIn: false` evita reescrevê-los; a retenção é zero, porque o TROQ não chama APIs do Google depois da entrada. Ficam só `provider_id`, `account_id` (`sub`) e `scope`. A pendência guarda `sub` e e-mail por no máximo 15 minutos. Nada disso vai a log, Sentry, DTO ou URL (IC-11.2).

**IC-15.8 (decisão arquitetural — configuração).** `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` são server-side e por ambiente; `development` pode rodar sem elas, mas `preview` e `production` exigem o par completo no release gate (DEC-047) ([../engineering/environments.md](../engineering/environments.md), seção 5.5). Sem as duas, com placeholder, parciais ou com client ID fora do formato, o provedor Google não é registrado, os layouts de `/login` e `/cadastro` não mostram o botão, as actions respondem "indisponível" e `/conta` informa a indisponibilidade; o login por senha não muda. A URI de redirecionamento é sempre `<BETTER_AUTH_URL>/api/auth/callback/google`, cadastrada exata no cliente OAuth de cada ambiente.

**IC-15.9 (normativo — status, sessão e permissões).** O hook de criação de sessão (IC-5.3) vale também no callback: conta `blocked_*` ou `deletion_requested` volta com `ACCOUNT_NOT_ACTIVE` e sem sessão. Logout (IC-5.5), revogação (IC-5.6) e o guard (IC-8) não mudam. Entrar pelo Google não concede contato, pagamento nem qualquer permissão além das de uma conta por senha.

**IC-15.10 (normativo de verificação).** Os testes automatizados (`google-signin.integration.test.ts`, contra Better Auth e PostgreSQL reais, com só o endpoint de token do Google simulado) provam o comportamento do TROQ diante de cada resposta do Google; **não** provam a configuração real do cliente OAuth. A prova com o Google real, em ambiente autorizado, é registrada à parte em [../delivery/google-sign-in-proof.md](../delivery/google-sign-in-proof.md).

## 16. Testes negativos obrigatórios

Cada caso roda contra o provedor real (`auth.api`) e PostgreSQL descartável quando envolve sessão, credencial ou token; mocks só servem para o transporte de email.

1. Cadastro sem declaração 18+, ou com ela falsa, é recusado e nada é gravado; o cadastro não aceita campo de data de nascimento ou documento (#41).
2. Credencial criada pelo cadastro é aceita por `signInEmail`; senha errada, conta sem credencial e email desconhecido recebem a mesma resposta e não criam sessão nem cookie (#40, #42).
3. Conta `active` não verificada: senha correta → `EMAIL_NOT_VERIFIED`, sem sessão (#42).
4. Conta `blocked_*` ou `deletion_requested`: senha correta → sem sessão (hook de IC-5.3); sessão anterior à transição é revogada e, se forçada a sobreviver, é negada pelo guard (#40).
5. Cookie adulterado, token cru não assinado, sessão expirada e sessão apagada → `getSession` nulo e ação protegida negada; nenhum caminho lê `sessions` diretamente (#40).
6. Logout invalida a sessão usada: reapresentar o cookie antigo é negado; falha de revogação não é reportada como sucesso (#42).
7. Usuário A não lê nem altera dados de B por chamada direta ou id adulterado (#42, #50).
8. Token de verificação inválido, expirado, reutilizado, invalidado por reenvio e confirmado em concorrência (#41).
9. Falha de envio no cadastro e no reenvio: conta preservada, email não verificado, erro propagado; nenhum log contém destinatário, token ou link (#41).
10. Reenvio respeita 60 segundos e 5 por 24 horas, com resposta genérica (#41).
11. Sexta falha de login em 15 minutos é recusada sem chamar o provedor, para email existente e inexistente (#42).
12. Construção do auth sem `BETTER_AUTH_SECRET`, com `APP_ENV` inválido ou com URL `http`/`localhost` em `preview`/`production` lança erro (#40).
13. `returnTo` absoluto ou protocol-relative é descartado; rotas de escrita de `/api/auth/*` respondem 404 (#40, #42).
14. Callback de identidade Google nova não cria `users`, `accounts` nem sessão; conclusão sem 18+, sem termos, sem cookie, com cookie forjado ou com handle já usado é recusada e não deixa conta (#81).
15. E-mail de conta existente (verificada ou não) não é vinculado pelo callback; vinculação explícita com outro e-mail, com e-mail não verificado pelo Google ou com identidade de outra conta é recusada (#81).
16. Callbacks e conclusões concorrentes da mesma identidade resultam em uma conta e uma identidade (#81).
17. Conta `blocked_*` ou `deletion_requested` não obtém sessão pelo Google; logout e revogação negam a sessão aberta pelo Google (#81).
18. `state` reutilizado, forjado, ausente ou de outro navegador, cancelamento no Google e falha na troca do código não criam sessão nem pendência (#81).
19. Tokens do Google nunca são persistidos; sem `GOOGLE_*` o provedor não existe e o login por senha segue funcionando (#81).

## 17. Documentação oficial consultada (2026-09-29; Google em 2026-10-04)

| Página oficial | Sustenta |
| --- | --- |
| [Next.js integration](https://www.better-auth.com/docs/integrations/next) | `toNextJsHandler`; `auth.api.getSession` com `headers()` em RSC e Server Action; `nextCookies()` como último plugin para gravar cookie em Server Action; `getSessionCookie` não valida e não é segurança; `proxy` do Next.js 16 (IC-5.1, IC-5.2, IC-8.3) |
| [Email & Password](https://www.better-auth.com/docs/authentication/email-password) | `enabled`, `disableSignUp`, `requireEmailVerification` (403 no login não verificado), limites de senha 8/128, senha em `account` com `providerId = credential`, `revokeSessionsOnPasswordReset` (IC-4, IC-5.3) |
| [Email](https://www.better-auth.com/docs/concepts/email) | `sendVerificationEmail`, `sendOnSignUp`, `sendOnSignIn`, `autoSignInAfterVerification` e a recomendação de não aguardar envio nos callbacks do provedor (IC-7.1, IC-9.1) |
| [Session Management](https://www.better-auth.com/docs/concepts/session-management) | Tabela e cookie `session_token`, `expiresIn` 7 dias, `updateAge` 1 dia, revogação, risco do `cookieCache` para revogação imediata (IC-5.3, IC-5.4) |
| [Cookies](https://www.better-auth.com/docs/concepts/cookies) | `session_token` opaco e assinado com o segredo, prefixo `better-auth`, `httpOnly` e `Secure` em produção (IC-5.1) |
| [Security](https://www.better-auth.com/docs/reference/security) | scrypt, CSRF e validação de origem, `trustedOrigins`, alerta contra `localhost` em produção, cabeçalhos de IP e proxies (IC-4.2, IC-12) |
| [Options](https://www.better-auth.com/docs/reference/options) | `secret` (padrão fixo fora de produção, erro em produção), `baseURL` (não depender de inferência; forma dinâmica com `allowedHosts`), `trustedOrigins`, `rateLimit`, `advanced.ipAddress.disableIpTracking`, `advanced.database.generateId`, `emailVerification.expiresIn` padrão de 3600 s (IC-2.3, IC-7.2, IC-12) |
| [Rate Limit](https://www.better-auth.com/docs/concepts/rate-limit) | Chamadas `auth.api` não são limitadas; armazenamento padrão em memória (IC-10.1) |
| [Database](https://www.better-auth.com/docs/concepts/database) | Schema central, geração de UUID, `databaseHooks` com `before` capaz de abortar a criação, validação de schema (IC-2, IC-5.3) |
| [Prisma adapter](https://www.better-auth.com/docs/adapters/prisma) | Prisma 7 com `@prisma/adapter-pg` e `prismaAdapter(prisma, { provider: "postgresql" })` (IC-1.2) |
| [API](https://www.better-auth.com/docs/concepts/api) | Chamada de endpoints pelo servidor com `body`/`headers`, `APIError` (IC-5.1, IC-5.5) |
| [Google](https://better-auth.com/docs/authentication/google) | `socialProviders.google`, `clientId`/`clientSecret`, callback `/api/auth/callback/google`, `scope`/`disableDefaultScope`, `prompt` e `accessType` (IC-15.1, IC-15.7, IC-15.8) |
| [Users & Accounts](https://www.better-auth.com/docs/concepts/users-accounts) | Vinculação de contas, `accountLinking`, `allowDifferentEmails`, `linkSocial` a partir de sessão (IC-15.4) |

Conferidos no código-fonte publicado de `better-auth@1.7.6`, por omissão da documentação: token de verificação como JWT sem estado (IC-7.1); `signOut` que registra em log a falha de remoção da sessão e remove o cookie (IC-5.5); busca de usuário por email em `findOne` (IC-2.5); ordem senha → verificação → criação de sessão no `signInEmail` (IC-10.3). Para #81 (2026-10-04), também no código-fonte: `user.validateUserInfo` chamado com o perfil do provedor antes de `create-user`, `link-account` e da entrada OAuth, com a recusa virando redirecionamento para a URL de erro do fluxo (IC-15.2); cookies gravados pelo gate sobrevivem a esse redirecionamento; `disableImplicitLinking` e as checagens de e-mail verificado e de e-mail igual na vinculação explícita (IC-15.4); o atalho que marca `emailVerified` numa entrada social (IC-15.5); `state` de uso único em `verifications` com cookie assinado e PKCE `S256` (IC-15.1); o provedor Google lê o `id_token` da resposta do endpoint de token sem buscar perfil adicional (IC-15.7).
