# Prova real da entrada com Conta Google (#81)

Registro da evidência com o **Google real** exigida por [#81](https://github.com/BrunoMNoronha/techlab-troq/issues/81), mantido à parte dos testes automatizados ([../architecture/identity-contract.md](../architecture/identity-contract.md), IC-15.10). Os testes provam o comportamento do TROQ diante de cada resposta do Google, com o endpoint de token simulado; só esta prova mostra que o cliente OAuth, a tela de consentimento e as URIs de cada ambiente estão corretos.

## Estado em 2026-10-04: **bloqueada — homologação não concluída**

| Item | Situação |
| --- | --- |
| Projeto Google Cloud do TROQ | não existe ou não foi disponibilizado ao agente |
| Tela de consentimento OAuth (escopos `openid` e `email`) | não configurada |
| Cliente OAuth "Aplicativo da Web" por ambiente | não criado |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ausentes em `.env.local`, na Vercel e no GitHub |
| Prova no navegador com Google real | **não executada** |

Criar o projeto, a tela de consentimento e as credenciais é provisionamento e exige autorização específica do Bruno (#81, "Dependências e relações"). Sem essas credenciais, a entrada com Google fica indisponível em todos os ambientes, como desenhado (IC-15.8), e o login por senha segue igual.

## Roteiro da prova, quando houver credenciais

Ambiente recomendado para a primeira prova: `development` (`http://localhost:3000`), que o Google aceita como origem de teste e onde o agente pode operar o navegador. `preview` exige a URI exata do alias da branch; `production` depende do domínio de [#77](https://github.com/BrunoMNoronha/techlab-troq/issues/77).

1. **Provisionar (Bruno).** No Google Cloud: tela de consentimento com os escopos `openid` e `email` e uma conta de teste controlada; cliente OAuth "Aplicativo da Web" com a URI de redirecionamento `http://localhost:3000/api/auth/callback/google` e nenhuma origem JavaScript. Gravar `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` só no `.env.local`.
2. **Subir o app** com banco descartável próprio, `pnpm build` e `pnpm start` na porta 3000 (docs/engineering/testing.md, seção 2.2).
3. **Cadastro:** em `/cadastro`, "Continuar com Google" → Google → `/cadastro/google`. Conferir: nenhuma linha em `users`; uma pendência `google-signup:` em `verifications`; cookie `troq-google-signup` `HttpOnly`. Concluir com nome, 18+ e termos → volta ao Google → `/conta` com sessão. Conferir uma linha em `users` (`email_verified`, `email_verified_at`), uma em `accounts` (`provider_id = 'google'`, tokens nulos) e um `terms_acceptances` `age_eligibility`.
4. **Recusa:** com outra conta de teste, cancelar em `/cadastro/google` → `/login?motivo=google_cancelado`, sem linha em `users`. Cancelar na tela do Google → mesmo motivo.
5. **Acesso posterior:** sair e entrar de novo com Google → mesma conta, nenhuma linha nova em `users`/`accounts`.
6. **Colisão:** conta por senha com o e-mail de uma conta de teste Google → "Continuar com Google" recusa com `google_conta_existente`; depois, logado por senha, "Vincular Conta Google" em `/conta` vincula; entrar com Google cai na mesma conta.
7. **Status e sessão:** marcar a conta como `blocked_admin` no banco descartável → Google recusa com `bloqueada`; logout invalida a sessão aberta pelo Google.
8. **Vazamentos:** a URL do callback carrega `code` e `state` por desenho do OAuth e aparece nos logs de requisição; ambos são de uso único, já consumidos no retorno e inúteis sem o segredo do cliente e o verificador PKCE. Conferir que nenhum log, URL ou página carrega token do Google, `GOOGLE_CLIENT_SECRET`, cookie de sessão ou o handle da pendência.

Registrar aqui: ambiente, revisão (`git rev-parse HEAD`), data, resultado de cada passo e pendências — sem e-mail real, credencial ou captura com dado pessoal.
