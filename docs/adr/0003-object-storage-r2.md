# ADR-0003 — Cloudflare R2 como armazenamento S3-compatible para imagens

## Status

Aceito — Fase 0 (2026-09-07).

## Contexto

Anúncios do TROQ possuem imagens enviadas pelos usuários. Essas imagens precisam ser armazenadas fora do banco relacional e servidas publicamente, com foco em desempenho mobile em redes 3G/4G ([../delivery/risks.md](../delivery/risks.md), R-10).

A aplicação é um monólito modular em Next.js ([ADR-0001](0001-modular-monolith-nextjs.md)) com deploy na Vercel, ambiente sem sistema de arquivos persistente. É necessário um armazenamento de objetos gerenciado.

## Decisão

- **Cloudflare R2** é o armazenamento de objetos **preferencial** para imagens.
- O acesso deve ocorrer pela **API S3-compatible**, de forma que a aplicação dependa da interface S3 e não de recursos exclusivos do R2. Isso preserva a possibilidade de troca de provedor.
- Somente imagens de anúncio (e eventuais derivados, como miniaturas) são escopo desta decisão. Dados protegidos, como telefone/WhatsApp, **não** devem ser armazenados em objetos públicos.

## Consequências

Positivas:

- Armazenamento gerenciado, sem gestão de servidores.
- Interface S3 amplamente suportada por bibliotecas e ferramentas, facilitando testes e eventual migração.
- Modelo de custo compatível com entrega pública de imagens.

Negativas e restrições:

- Dependência de serviço externo (R-08); termos e custos devem ser acompanhados.
- **Quantidade de imagens por anúncio, formatos, limites de tamanho e processamento não estão decididos** ([../decisions/open-decisions.md](../decisions/open-decisions.md), OD-05).
- Política de remoção de imagens quando um anúncio é removido (RB-006) ou quando dados são excluídos (OD-10) depende do ciclo de vida do anúncio (OD-04) e da política de retenção.
- Nenhuma configuração de bucket, credencial ou integração existe na Fase 0.

## Alternativas consideradas

- **Amazon S3:** não adotado como preferência; R2 foi definido previamente como provedor preferencial. A adoção da interface S3-compatible mantém S3 como alternativa viável.
- **Vercel Blob:** não adotado; maior acoplamento à plataforma de deploy e menor portabilidade do que a interface S3.
- **Armazenar imagens no PostgreSQL:** rejeitado. Aumenta custo e latência do banco e não é adequado para entrega pública de arquivos.
