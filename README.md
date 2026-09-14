# TechLab+ TROQ

TROQ é uma plataforma de anúncios entre pessoas em que o contato (WhatsApp/telefone) do anunciante só é liberado a um interessado escolhido, mediante uma solicitação paga de R$ 0,99.

**Status:** Fase 0 em andamento. O repositório já contém a **fundação técnica mínima** da aplicação (scaffold Next.js e CI de validação), criada de forma antecipada e isolada. Não existe banco, migration, autenticação, integração externa nem funcionalidade de produto. O gate formal da Fase 0 permanece dependente da validação do gateway de pagamento (OD-08).

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
| Pagamentos | Pix-first; gateway ainda não decidido |

Restam apenas duas decisões abertas — a escolha do gateway de pagamento (OD-08) e o tratamento de exceções de pagamento (OD-07), que depende dela. Ambas estão registradas em [docs/decisions/open-decisions.md](docs/decisions/open-decisions.md) e não devem ser tratadas como homologadas.

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
- [Escopo do MVP](docs/product/mvp-scope.md)
- [Regras de negócio](docs/product/business-rules.md)
- [Avaliações](docs/product/ratings.md)
- [Itens proibidos, denúncia e moderação](docs/product/prohibited-items.md)
- [Desistência e reseleção](docs/product/reselection-policy.md)
- [Retenção e exclusão de dados](docs/product/data-retention-policy.md)
- [Elegibilidade etária](docs/product/age-eligibility.md)
- [Demonstração de interesse](docs/product/interest-flow.md)
- [Decisões abertas](docs/decisions/open-decisions.md)
- [Riscos](docs/delivery/risks.md)
