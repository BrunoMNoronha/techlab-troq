# ADR-0001 — Monólito modular com Next.js + TypeScript

## Status

Aceito — Fase 0 (2026-09-07).

## Contexto

O TROQ está iniciando do zero, com equipe pequena e um MVP cujo fluxo central é bem delimitado (anúncios, solicitações pagas, liberação de contato, encerramento, avaliação e moderação). Não há código, infraestrutura ou base de usuários. A prioridade é validar o produto com baixo custo operacional e baixa complexidade de deploy.

O direcionamento é mobile-first, com PWA como parte da estratégia, e o deploy será na Vercel.

## Decisão

- A arquitetura inicial é um **monólito modular**: uma única aplicação, organizada internamente em módulos com fronteiras claras (por exemplo, anúncios, solicitações, pagamentos, contato, moderação), sem separação em processos ou serviços distintos.
- Frontend e backend são implementados em **Next.js + TypeScript**, usando **App Router**. O backend vive na própria aplicação Next.js (Route Handlers, Server Actions e código de servidor), sem API Node separada.
- **Não** serão criados microserviços nem API Node separada no MVP sem necessidade futura comprovada e documentada.

## Consequências

Positivas:

- Um único deploy, uma única base de código e um único conjunto de dependências.
- Menor sobrecarga operacional e de infraestrutura para uma equipe pequena.
- Aderência natural à plataforma de deploy escolhida (Vercel).
- Fronteiras de módulo internas preservam a possibilidade de extração futura, caso necessária.

Negativas e restrições:

- Regras sensíveis (liberação de contato, limite de 3 solicitações, pagamentos) precisam de disciplina de fronteira dentro do mesmo processo: autorização server-side, auditoria e proteção contra concorrência não podem depender de separação física.
- Dados protegidos (telefone/WhatsApp) nunca podem transitar em componentes renderizados no cliente, payloads públicos, cache público ou logs; a estrutura de módulos deve tornar isso verificável.
- Operações que exigem garantias fortes (reserva atômica de vaga, idempotência de webhook) dependem do banco relacional ([ADR-0002](0002-postgresql-neon.md)), não de infraestrutura de mensageria.
- A escolha do ORM e da estratégia de migrations não é objeto desta ADR; foi decidida posteriormente em [ADR-0005](0005-prisma-orm-migrations.md), que fechou OD-09.

## Alternativas consideradas

- **Microserviços desde o início:** rejeitado. Custo operacional e complexidade desproporcionais ao tamanho da equipe e ao estágio do produto.
- **Frontend Next.js com API Node separada (por exemplo, Express/Fastify/NestJS):** rejeitado no MVP. Introduz segundo deploy, duplicação de tipos e contratos, sem benefício comprovado nesta fase. Pode ser reavaliado com necessidade futura comprovada.
- **Outros frameworks full-stack:** não avaliados em profundidade nesta fase; a decisão por Next.js foi tomada previamente e registrada aqui como vigente.
