# Prova real da entrada com Conta Google (#81)

Registro da evidência com o **Google real** exigida por [#81](https://github.com/BrunoMNoronha/techlab-troq/issues/81), mantido à parte dos testes automatizados ([../architecture/identity-contract.md](../architecture/identity-contract.md), IC-15.10). Os testes provam o comportamento do TROQ diante de cada resposta do Google, com o endpoint de token simulado; só esta prova mostra que o cliente OAuth, a tela de consentimento e as URIs de cada ambiente estão corretos.

A entrada com Google foi aprovada por DEC-047 (2026-10-04) e é oferecida **só em `preview` e `production`**; `development` não é provisionado.

## Estado em 2026-10-04: **bloqueada — homologação não concluída**

| Item | Situação |
| --- | --- |
| Projeto Google Cloud do TROQ | a criar (o agente conduz no Chrome, com a sessão do Bruno) |
| Tela de consentimento OAuth (escopos `openid` e `email`) | não configurada |
| Cliente OAuth "Aplicativo da Web" de `preview` | não criado |
| Cliente OAuth "Aplicativo da Web" de `production` | não criado; depende da origem `https` de [#77](https://github.com/BrunoMNoronha/techlab-troq/issues/77) e da configuração de autenticação de `production`, que ainda não tem variáveis |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` na Vercel | ausentes nos dois escopos |
| Prova no navegador com Google real | **não executada** |

Sem essas credenciais, a entrada com Google fica indisponível, como desenhado (IC-15.8), e o login por senha segue igual.

## Roteiro da prova em `preview`

`preview` não tem alias estável: cada branch de prova recebe a sua `BETTER_AUTH_URL` (environments.md, seção 5.5), e o cliente OAuth de `preview` precisa da URI **exata** dessa branch.

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
