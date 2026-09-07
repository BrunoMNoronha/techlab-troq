# TechLab+ TROQ

TROQ é uma plataforma de anúncios entre pessoas em que o contato (WhatsApp/telefone) do anunciante só é liberado a um interessado escolhido, mediante uma solicitação paga de R$ 0,99.

**Status:** Fase 0 — baseline documental. Não existe código, aplicação, banco ou pipeline neste repositório ainda.

## Fluxo central (resumo)

1. Usuário cria conta.
2. Publica ou consulta anúncios.
3. Interessado demonstra interesse e solicita desbloqueio de contato.
4. Paga R$ 0,99. Cada anúncio aceita no máximo 3 solicitações pagas.
5. Anunciante escolhe uma solicitação; apenas o escolhido recebe o WhatsApp/telefone.
6. A negociação pode ser encerrada; após o encerramento, avaliações são permitidas.
7. Anúncios podem ser denunciados e moderados.

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

Decisões ainda abertas (gateway de pagamento, mecanismo de encerramento, regras de avaliação, entre outras) estão registradas em [docs/decisions/open-decisions.md](docs/decisions/open-decisions.md) e não devem ser tratadas como homologadas.

## Documentação

- [Índice da documentação](docs/README.md)
- [Estado do projeto](docs/project-state.md)
- [Escopo do MVP](docs/product/mvp-scope.md)
- [Regras de negócio](docs/product/business-rules.md)
- [Decisões abertas](docs/decisions/open-decisions.md)
- [Riscos](docs/delivery/risks.md)
