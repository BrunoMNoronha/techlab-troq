# Estado do projeto — baseline da Fase 0

**Data de registro:** 2026-09-07
**Repositório:** `BrunoMNoronha/techlab-troq`, branch principal `main`
**Fase:** 0 — baseline documental

Este documento separa três categorias que não devem ser confundidas: o que **existe de fato** no repositório, o que **já foi decidido** e o que **ainda não foi implementado**.

## 1. Fatos — estado encontrado no repositório

Inspeção realizada em 2026-09-07 antes de qualquer alteração:

- Único commit: `4a73b15 Initial commit`.
- Única branch: `main`, sem proteção configurada, sincronizada com `origin/main`.
- Árvore de trabalho limpa, sem mudanças locais.
- Único arquivo versionado: `.gitignore` (template padrão para projetos Node, incluindo entradas para `.next`, `node_modules/`, `.env*`).
- Não existem: README, diretório `docs/`, código-fonte, `package.json`, workflows de CI, requisitos ou ADRs versionados.

O `.gitignore` foi preservado sem alteração. Seu conteúdo não foi interpretado como decisão de projeto.

## 2. Decisões vigentes

Decisões já tomadas e válidas na Fase 0. Detalhes nos ADRs indicados.

### Arquitetura e stack

- Monólito modular como arquitetura inicial — [ADR-0001](adr/0001-modular-monolith-nextjs.md).
- Next.js + TypeScript com App Router para frontend e backend — [ADR-0001](adr/0001-modular-monolith-nextjs.md).
- Sem microserviços nem API Node separada no MVP, salvo necessidade futura comprovada.
- PostgreSQL como banco relacional; Neon como provedor preferencial — [ADR-0002](adr/0002-postgresql-neon.md).
- Vercel como plataforma de deploy. Produção comercial não pode depender do plano Vercel Hobby.
- Cloudflare R2 como armazenamento S3-compatible preferencial para imagens — [ADR-0003](adr/0003-object-storage-r2.md).
- Resend como provedor inicial de email transacional.
- Better Auth como solução de autenticação inicial; email/senha com verificação de email. Login social fica fora do núcleo inicial.
- PWA faz parte do direcionamento mobile; Web Push não bloqueia o MVP.

### Dados protegidos e privacidade

- Localização precisa não deve ser coletada nem exposta no MVP sem necessidade posteriormente documentada. Localização pública é limitada a cidade/UF (RB-005).
- Telefone/WhatsApp é dado protegido: não pode aparecer em payload público, cache público ou logs.
- A liberação de contato exige autorização server-side e auditoria.

### Pagamentos

- Pagamentos Pix-first.
- Mercado Pago é apenas o **primeiro candidato** de gateway. **Não** é decisão final.
- Antes de implementar pagamentos deve existir um spike que prove: cobrança de exatamente R$ 0,99, confirmação, webhook, idempotência e tarifas.
- A capacidade de 3 solicitações pagas por anúncio (RB-003) exige proteção contra concorrência. Recomendação vigente: reserva atômica de vaga antes da cobrança, com expiração, a detalhar no design de pagamentos.

### Produto

- Regras de negócio RB-001 a RB-006 homologadas — [product/business-rules.md](product/business-rules.md).
- Escopo do MVP — [product/mvp-scope.md](product/mvp-scope.md).

## 3. Ainda não implementado

Nada de código existe. Em particular, não foram criados:

- aplicação Next.js, `package.json` ou dependências;
- banco de dados, schema ou migrations;
- workflows de CI/CD;
- configuração de Vercel, Neon, R2, Resend ou gateway de pagamento;
- autenticação, pagamentos, telas ou PWA;
- deploy de qualquer ambiente.

## 4. Decisões abertas

Itens que **não** estão decididos e não devem ser tratados como homologados (por exemplo: gateway final, ORM, mecanismo de encerramento da negociação, regras de avaliação) estão listados em [decisions/open-decisions.md](decisions/open-decisions.md).

## 5. Riscos

Riscos conhecidos e mitigações iniciais estão em [delivery/risks.md](delivery/risks.md).
