# TechLab+ TROQ

TROQ é uma plataforma de anúncios entre pessoas em que o contato (WhatsApp/telefone) do anunciante só é liberado a um interessado escolhido, mediante uma solicitação paga de R$ 0,99.

**Status:** **Fase 0 concluída** desde 2026-09-14; **Fase 1 em andamento**, com **F1-001 concluído** e o seu gate de saída integralmente por satisfazer. O gate de saída da Fase 0 foi verificado item a item e o resultado formal foi **APROVADO** ([transição para a Fase 1](docs/delivery/phase-1-transition.md)). **Não há decisão aberta.** O repositório já contém a **fundação técnica mínima** da aplicação (scaffold Next.js e CI de validação), criada de forma antecipada e isolada, e o **contrato de ambientes e segredos** ([ambientes, variáveis e segredos](docs/engineering/environments.md)), produzido por F1-001. Não existe banco, migration, autenticação, integração externa nem funcionalidade de produto — e Neon, R2 e Resend estão decididos, mas **não provisionados**; o contrato de ambientes é documento, não provisionamento, e nenhuma das suas variáveis é lida por código. O gateway de pagamento está homologado ([ADR-0004](docs/adr/0004-mercado-pago-pix.md)), as exceções de pagamento estão definidas ([política de exceções](docs/product/payment-exceptions.md)) e a **baseline arquitetural** da implementação está registrada ([visão geral](docs/architecture/overview.md), [modelo de dados](docs/architecture/data-model.md), [desenho de pagamentos](docs/architecture/payments-design.md) e [liberação de contato](docs/architecture/contact-release.md)).

## Fluxo central (resumo)

1. Usuário cria conta.
2. Publica ou consulta anúncios.
3. Interessado demonstra interesse — ação gratuita, sem entidade persistida — e solicita desbloqueio de contato.
4. Paga R$ 0,99. Cada anúncio aceita no máximo 3 solicitações pagas.
5. Anunciante escolhe uma solicitação; apenas o escolhido recebe o WhatsApp/telefone. Encerrada a negociação, o anunciante pode escolher outro solicitante pago, sem criar vaga nova e sem revogar o contato já liberado.
6. A negociação pode ser encerrada; após o encerramento, avaliações são permitidas.
7. Anúncios podem ser denunciados e moderados, conforme a política de itens proibidos.

As regras de negócio homologadas (RB-001 a RB-006) estão em [docs/product/business-rules.md](docs/product/business-rules.md).

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

Não resta nenhuma decisão aberta. A escolha do gateway (OD-08) foi fechada em 2026-09-14 por [ADR-0004](docs/adr/0004-mercado-pago-pix.md), e o tratamento das exceções de pagamento (OD-07) — duplicidade, pagamento acreditado após a expiração da reserva, falhas de confirmação, reembolso técnico e reversões — foi fechado na mesma data por [docs/product/payment-exceptions.md](docs/product/payment-exceptions.md) (DEC-037). A lista de decisões abertas, agora vazia, continua em [docs/decisions/open-decisions.md](docs/decisions/open-decisions.md).

## Execução local

Pré-requisito: **Node.js 24.x** (a linha está declarada em `engines` e em `.nvmrc`).

Instalação determinística das dependências:

```bash
npm ci
```

Servidor de desenvolvimento:

```bash
npm run dev
```

Validação completa, a mesma executada no CI:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:ci
npm run build
```

`npm run format` aplica a formatação e `npm run test` executa a suíte em modo de desenvolvimento. Os contratos normativos desses comandos estão em [docs/engineering/conventions.md](docs/engineering/conventions.md) e a estratégia de testes em [docs/engineering/testing.md](docs/engineering/testing.md).

## Documentação

- [Índice da documentação](docs/README.md)
- [Estado do projeto](docs/project-state.md)
- [Transição para a Fase 1](docs/delivery/phase-1-transition.md)
- [Ambientes, variáveis e segredos](docs/engineering/environments.md)
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
