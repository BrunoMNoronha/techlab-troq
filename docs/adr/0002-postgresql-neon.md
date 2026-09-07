# ADR-0002 — PostgreSQL com Neon como provedor preferencial

## Status

Aceito — Fase 0 (2026-09-07).

## Contexto

O domínio do TROQ é fortemente relacional e transacional: anúncios, usuários, solicitações pagas, pagamentos, liberações de contato, encerramentos, avaliações e denúncias. Várias regras exigem garantias de consistência:

- no máximo 3 solicitações pagas por anúncio (RB-003), mesmo sob concorrência;
- liberação de contato somente ao escolhido com pagamento aprovado (RB-001), com auditoria;
- idempotência no processamento de webhooks de pagamento.

A aplicação é um monólito modular em Next.js ([ADR-0001](0001-modular-monolith-nextjs.md)) com deploy na Vercel, o que favorece um banco gerenciado, acessível por conexões serverless.

## Decisão

- **PostgreSQL** é o banco de dados relacional do projeto.
- **Neon** é o provedor PostgreSQL **preferencial**. A escolha é de provedor, não de dialeto: o projeto deve usar PostgreSQL padrão e evitar acoplamento a recursos exclusivos do provedor sem decisão registrada.
- Garantias de consistência crítica (reserva atômica de vaga antes da cobrança, com expiração; idempotência de webhook; auditoria de liberação de contato) devem ser implementadas apoiando-se em transações e restrições do próprio banco.

## Consequências

Positivas:

- Transações, restrições de unicidade e bloqueios do PostgreSQL atendem diretamente às necessidades de concorrência e idempotência do domínio.
- Provedor gerenciado reduz a carga operacional da equipe.
- PostgreSQL padrão preserva a possibilidade de trocar de provedor.

Negativas e restrições:

- Dependência de serviço externo (ver [../delivery/risks.md](../delivery/risks.md), R-08); termos e custos do Neon devem ser acompanhados.
- Conexões a partir de ambiente serverless exigem atenção a limites de conexão e latência; a abordagem específica será definida na implementação.
- ORM e estratégia de migrations não são objeto desta ADR. Foram decididos posteriormente em [ADR-0005](0005-prisma-orm-migrations.md) (Prisma ORM e Prisma Migrate), que fechou OD-09. Nenhum schema ou migration existe na Fase 0.
- Retenção e exclusão de dados pessoais permanecem em aberto (OD-10).

## Alternativas consideradas

- **MySQL/MariaDB:** não adotado. PostgreSQL foi definido previamente como banco relacional do projeto; não houve avaliação comparativa nesta fase.
- **Bancos não relacionais:** rejeitados. O domínio é relacional e depende de transações e restrições de integridade para cumprir RB-001 e RB-003.
- **Outros provedores PostgreSQL gerenciados:** não avaliados em profundidade nesta fase. Neon é a preferência vigente; a decisão por PostgreSQL padrão mantém a troca viável caso necessário.
