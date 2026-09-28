# Contrato Técnico de Identidade e Autenticação (F2-001)

Este documento define o design e o contrato técnico para a consolidação da identidade e autenticação no TROQ (Issue #39), utilizando Better Auth.

> [!NOTE]
> Este contrato garante uma única fonte de verdade para usuários no sistema, evitando divergências de estado entre o provedor de auth e o banco de dados da aplicação.

## 1. Fonte Única de Verdade e Mapeamento de Dados

A integração com o **Better Auth** será feita mapeando diretamente o estado do usuário para o modelo `User` existente no banco de dados do TROQ. Não haverá tabelas espelho exclusivas da aplicação que dupliquem dados de autenticação.

- **Modelo `User` (Aplicação)**: Atuará como a tabela central. O Better Auth será configurado para gerenciar e persistir dados base de autenticação (como email, hash de senha ou providers de OAuth) diretamente nas tabelas mapeadas, estendendo o modelo `User` base sem sobrescrever sua identidade no TROQ.
- O mapeamento conectará as tabelas internas do Better Auth (`session`, `account`, `verification`) referenciando de forma chave-estrangeira (FK) o ID do `User` da aplicação.

## 2. Plano de Migration Aditiva

A evolução do banco de dados será estritamente **aditiva**. A migration inicial não será reescrita, preservando a integridade do histórico do banco em produção e staging.

> [!IMPORTANT]
> Nenhuma relação existente deve ser quebrada. O relacionamento do `User` com `UserContact`, `TermsAcceptance` e `AccountDeletionRequest` deve permanecer inalterado.

**Estratégia de Migration:**
1. **Novas Tabelas do Better Auth**: Criação de tabelas de suporte do framework (`sessions`, `accounts`, e `verifications`) com chaves estrangeiras apontando para a tabela de usuários existente.
2. **Evolução do Modelo `User`**:
   - Adição de colunas exigidas pelo Better Auth (ex: `emailVerified`, `image`).
   - Adição dos campos de contrato de negócio da aplicação (ex: `accountState`, `dateOfBirth` ou flag de maioridade).
3. **Índices**: Manter e expandir índices parciais (ex: busca rápida por e-mail em contas ativas). Os históricos de exclusão ou logs permanecerão sem impacto.

## 3. Contrato de Cadastro e Estados da Conta

O fluxo de Onboarding passa a exigir os seguintes critérios contratuais:

- **Autodeclaração de Maioridade**: Validação estrita de idade (18+ anos). O cadastro será rejeitado na API caso a autodeclaração ou data de nascimento não satisfaça esse critério.
- **Termos de Uso**: O registro de aceite de termos (via modelo `TermsAcceptance`) deve persistir obrigatoriamente:
  - `timestamp` do aceite.
  - `version` (versão do documento aceito).
  - O IP ou agente do usuário (como log de auditoria, se aplicável).

### Ciclo de Vida e Estados da Conta (`accountState`)
- `UNVERIFIED`: Conta criada, mas aguardando confirmação de e-mail.
- `ACTIVE`: E-mail confirmado, conta liberada para uso completo.
- `BLOCKED`: Suspensa por infrações de segurança ou violação de regras (impedida de realizar ações).
- `DELETED`: Soft-delete ativado (gerenciado via `AccountDeletionRequest`). Os dados são ofuscados mantendo a integridade referencial, e o login é permanentemente desabilitado.

## 4. Gestão de Tokens, Sessões e Resend (E-mails)

> [!WARNING]
> O reuso de tokens de verificação deve ser terminantemente bloqueado na camada de banco de dados e aplicação.

- **Tokens (Recuperação / Confirmação)**:
  - **Inválidos/Expirados**: A API deve retornar erro padronizado (`401 Unauthorized` ou `400 Bad Request`), e a UI deve direcionar o usuário graciosamente para a tela de "Solicitar Novo Link".
  - **Reutilizados**: Uma vez consumido, o token será invalidado. Tentativas de reuso devem disparar logs de segurança silenciosos.
- **Ciclo de Vida de Sessões**:
  - Limite de inatividade e expiração absoluta gerenciados pelo Better Auth.
  - Se o usuário sofrer bloqueio ou alterar credenciais críticas, a **revogação global da sessão** será disparada, invalidando todas as suas sessões ativas (cross-device).
- **Envio de E-mails (Resend)**:
  - **Falhas de Entrega**: Tratamento e fallback (retry) configurados. O frontend terá um mecanismo de reenvio de e-mail (resend) com *cooldown* (ex: 60 segundos) para evitar spamming.
  - **Redirects Seguros**: Os links acionáveis enviados por e-mail devem apontar apenas para domínios ou caminhos pré-aprovados do próprio app, evitando ataques de *Open Redirect*.

## 5. Ambientes e Variáveis

Existe segregação total entre `development` e `preview` (bem como `production`). O funcionamento da autenticação depende estritamente das seguintes variáveis:

- `BETTER_AUTH_SECRET`: Chave criptográfica forte para geração/assinatura de sessões e cookies.
- `BETTER_AUTH_URL`: URL base aceita para a origem da aplicação e para redirects (gerada dinamicamente nos PRs em `preview`; e fixada como `http://localhost:3000` em `development`).
- `RESEND_API_KEY`: Chave da API de envio, operando sob domínios de remetente segregados por ambiente para evitar penalizações de reputação no domínio de produção.

## 6. Superfícies de API/UI e Autorização

- **API Routes (Backend)**:
  - Rotas de base do framework injetadas (ex: `/api/auth/*`).
  - Rotas de estado (ex: `/api/users/me`) integradas para retornar informações agregadas (User + Termos).
- **UI (Frontend)**:
  - Componentes e layouts restritos protegidos através da verificação de sessão (via middlewares e/ou Server-Side Rendering) evitando vazamentos de *flash of unauthenticated content*.
- **Autorização (RBAC/Verificação de Estado)**:
  - Políticas de acesso validarão a presença de uma sessão íntegra E se o estado do usuário é `ACTIVE`. Contas `UNVERIFIED` estarão restritas apenas às telas de conclusão de onboarding.

## 7. Cenários de Testes Negativos

A implementação do contrato deve validar obrigatoriamente os seguintes cenários:

1. **Idade Insuficiente**: Tentativa de cadastro onde a autodeclaração marca menos de 18 anos. Espera-se interrupção com erro 400.
2. **Sessão Bloqueada**: Tentativa de login ou uso de sessão ativa por uma conta alterada para `BLOCKED` ou `DELETED`. Espera-se revogação imediata.
3. **Reuso de Magic Link/OTP**: Clique duplo ou submissão duplicada de token de verificação. A segunda requisição deve falhar e apresentar feedback de "Link Expirado ou Usado".
4. **Indisponibilidade do Resend**: Simulação de timeout/falha no envio de e-mail. A API deve retornar falha clara, e a UI liberar a re-tentativa sem travar a tela.
5. **Ataque de Open Redirect**: Adulteração de parâmetros de redirecionamento do Auth (ex: `callbackUrl=https://evil.com`). O Better Auth deve bloquear baseado nas restrições de `BETTER_AUTH_URL`.
