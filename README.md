# TechLab+ TROQS

TROQS é uma plataforma de anúncios entre pessoas em que o contato (WhatsApp/telefone) do anunciante só é liberado a um interessado escolhido, mediante uma solicitação paga de R$ 0,99.

**Status (reconciliado em 2026-09-29, `main` em `e8ad1ae`):**

- **Fase 0** concluída desde 2026-09-14 e **Fase 1** concluída desde 2026-09-16, com os gates aprovados e registrados em [transição para a Fase 1](docs/delivery/phase-1-transition.md) e [transição para a Fase 2](docs/delivery/phase-2-transition.md). Não há decisão aberta.
- **Fase 2 (identidade e anúncios) concluída em 2026-09-30, com o gate de saída APROVADO** — G1, G2 e G3 `PASS` ([transição para a Fase 3](docs/delivery/phase-3-transition.md), seção V). Existem no código e foram provados: cadastro 18+ com verificação de e-mail, login com senha e logout, rascunhos e edição, upload e processamento de imagens no R2, publicação e ciclo de vida pelo dono, vitrine e detalhe públicos sem contato e entrega autorizada das imagens. A jornada completa foi feita em `preview` a 375 px, e as suítes com PostgreSQL efêmero e servidor real rodam na CI. A aprovação de 2026-09-28 e a retificação de 2026-09-29 ficam como registro histórico.
- **Fase 3 (solicitações, pagamentos e contato) liberada para execução pelo gate da Fase 2 e ainda não iniciada** ([#54](https://github.com/BrunoMNoronha/techlab-troq/issues/54)). A entrada da solicitação na home e no detalhe público só verifica login e elegibilidade; **não** cobra, **não** reserva vaga e **não** libera contato. Os módulos de pagamentos e de contato são fronteiras vazias.
- **Ambientes:** `development` e `preview` foram provisionados na Fase 1 (Neon, Cloudflare R2, Resend e Sentry). O registro de F1-011 é que `production` não existia em nenhum provedor; **isso não foi revalidado**, e este documento não afirma nada sobre produção ou deploy atual.
- **Validação:** a CI da `main` em `e8ad1ae` está verde, verificada no GitHub. Testes com banco real e provas em navegador citados nas PRs são relatos do autor de cada PR e não foram reexecutados nesta reconciliação.

O estado detalhado — o que existe, o que está validado, o que tem evidência pendente e a próxima entrega técnica por dependência — está em [estado do projeto](docs/project-state.md), seção 3.3. O briefing consolidado está em [docs/PROJECT.md](docs/PROJECT.md). A fundação técnica da Fase 1 (contrato de ambientes, Prisma e migrations, estrutura modular, R2, Resend e Sentry) está descrita em [estado do projeto](docs/project-state.md), seção 3.1, e nos documentos de engenharia: [ambientes, variáveis e segredos](docs/engineering/environments.md), [banco de dados](docs/engineering/database.md) e [ADR-0007](docs/adr/0007-observability-sentry.md). O gateway de pagamento está homologado ([ADR-0004](docs/adr/0004-mercado-pago-pix.md)), as exceções de pagamento estão definidas ([política de exceções](docs/product/payment-exceptions.md)) e a baseline arquitetural está registrada ([visão geral](docs/architecture/overview.md), [modelo de dados](docs/architecture/data-model.md), [desenho de pagamentos](docs/architecture/payments-design.md) e [liberação de contato](docs/architecture/contact-release.md)).

## Fluxo central (resumo)

1. Usuário cria conta.
2. Publica ou consulta anúncios.
3. Interessado demonstra interesse — ação gratuita, sem entidade persistida — e solicita desbloqueio de contato.
4. Paga R$ 0,99. Cada anúncio aceita no máximo 3 solicitações pagas.
5. Anunciante escolhe uma solicitação; apenas o escolhido recebe o WhatsApp/telefone. Encerrada a negociação, o anunciante pode escolher outro solicitante pago, sem criar vaga nova e sem revogar o contato já liberado.
6. A negociação pode ser encerrada; após o encerramento, avaliações são permitidas.
7. Anúncios podem ser denunciados e moderados, conforme a política de itens proibidos.

As regras de negócio homologadas (RB-001 a RB-010) estão em [docs/product/business-rules.md](docs/product/business-rules.md).

O fluxo acima é o da regra de troca **solicitação paga**, a única implementada. Desde 2026-10-05 há uma segunda regra cadastrada, a **proposta de troca** — proposta gratuita de um anúncio por outro, pagamento só depois do aceite e contato liberado para os dois —, ainda sem implementação e selecionável por ambiente: [docs/product/trade-proposal.md](docs/product/trade-proposal.md) e [docs/adr/0009-trade-rules-environment-selector.md](docs/adr/0009-trade-rules-environment-selector.md).

## Stack decidida (Fase 0)

| Área | Decisão |
| --- | --- |
| Arquitetura | Monólito modular ([ADR-0001](docs/adr/0001-modular-monolith-nextjs.md)) |
| Frontend/backend | Next.js + TypeScript, App Router |
| Banco de dados | PostgreSQL, provedor preferencial Neon ([ADR-0002](docs/adr/0002-postgresql-neon.md)) |
| Acesso a dados e migrations | Prisma ORM 7.x e Prisma Migrate ([ADR-0005](docs/adr/0005-prisma-orm-migrations.md)) |
| Deploy | Vercel (produção comercial não pode depender do plano Hobby) |
| Autenticação | Better Auth, email/senha com verificação de email |
| Armazenamento de imagens | Cloudflare R2, S3-compatible ([ADR-0003](docs/adr/0003-object-storage-r2.md)) |
| Email transacional | Resend |
| Pagamentos | Pix-first; Mercado Pago como gateway Pix inicial homologado, por Checkout Transparente via Orders API ([ADR-0004](docs/adr/0004-mercado-pago-pix.md)) |
| Trabalho assíncrono e agendamento | PostgreSQL como fila e autoridade de trava; agendamento da própria plataforma, sem broker nem Redis ([ADR-0006](docs/adr/0006-async-work-scheduling-concurrency.md)) |
| Observabilidade | Sentry SaaS, um projeto e um DSN por ambiente; Session Replay fora do MVP; telemetria sem dado protegido e que não substitui a auditoria ([ADR-0007](docs/adr/0007-observability-sentry.md)) |

Não resta nenhuma decisão aberta. A escolha do gateway (OD-08) foi fechada em 2026-09-14 por [ADR-0004](docs/adr/0004-mercado-pago-pix.md), e o tratamento das exceções de pagamento (OD-07) — duplicidade, pagamento acreditado após a expiração da reserva, falhas de confirmação, reembolso técnico e reversões — foi fechado na mesma data por [docs/product/payment-exceptions.md](docs/product/payment-exceptions.md) (DEC-037). A lista de decisões abertas, agora vazia, continua em [docs/decisions/open-decisions.md](docs/decisions/open-decisions.md).

## Execução local

Pré-requisito: **Node.js 24.x** (a linha está declarada em `engines` e em `.nvmrc`) e **pnpm** (a versão exata está declarada em `packageManager` no `package.json`).

Instalação determinística das dependências:

```bash
pnpm install --frozen-lockfile
```

Servidor de desenvolvimento:

```bash
pnpm run dev
```

Validação completa, a mesma executada no CI:

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:ci
pnpm run build
```

`pnpm run format` aplica a formatação e `pnpm run test` executa a suíte em modo de desenvolvimento. `pnpm run test:integration` executa a prova de integração contra um PostgreSQL descartável já migrado, apontado por `DATABASE_URL` ([docs/engineering/database.md](docs/engineering/database.md), seção 12); a mesma suíte roda depois do merge, contra o Neon de `preview`, pelo workflow de migrations controladas (seção 15 do mesmo documento). Os contratos normativos desses comandos estão em [docs/engineering/conventions.md](docs/engineering/conventions.md) e a estratégia de testes em [docs/engineering/testing.md](docs/engineering/testing.md).

## Documentação

- [Índice da documentação](docs/README.md)
- [Estado do projeto](docs/project-state.md)
- [Transição para a Fase 1](docs/delivery/phase-1-transition.md)
- [Transição para a Fase 2](docs/delivery/phase-2-transition.md)
- [Transição para a Fase 3 — gate da Fase 2 aprovado](docs/delivery/phase-3-transition.md)
- [Briefing do projeto](docs/PROJECT.md)
- [Roadmap](docs/delivery/roadmap.md) e [backlog](docs/delivery/backlog.md)
- [Ambientes, variáveis e segredos](docs/engineering/environments.md)
- [Banco de dados: Prisma, schema físico e migrations](docs/engineering/database.md)
- [ADR-0007 — observabilidade com Sentry](docs/adr/0007-observability-sentry.md)
- [ADR-0008 — instante de acreditação pela Payments API](docs/adr/0008-accreditation-instant-payments-api.md)
- [Visão geral da arquitetura](docs/architecture/overview.md)
- [Modelo de dados](docs/architecture/data-model.md)
- [Desenho de pagamentos](docs/architecture/payments-design.md)
- [Liberação de contato](docs/architecture/contact-release.md)
- [Escopo do MVP](docs/product/mvp-scope.md)
- [Regras de negócio](docs/product/business-rules.md)
- [Avaliações](docs/product/ratings.md)
- [Itens proibidos, denúncia e moderação](docs/product/prohibited-items.md)
- [Desistência e reseleção](docs/product/reselection-policy.md)
- [Retenção e exclusão de dados](docs/product/data-retention-policy.md)
- [Elegibilidade etária](docs/product/age-eligibility.md)
- [Demonstração de interesse](docs/product/interest-flow.md)
- [Exceções de pagamento](docs/product/payment-exceptions.md)
- [Decisões abertas](docs/decisions/open-decisions.md)
- [Riscos](docs/delivery/risks.md)
