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
- Prisma ORM (linha 7.x estável, versão pinada) como camada de acesso a dados e Prisma Migrate como mecanismo oficial de migrations, com `migrate deploy` por job controlado de CI/CD, `db push` proibido fora de desenvolvimento e mudanças destrutivas por expand/contract — [ADR-0005](adr/0005-prisma-orm-migrations.md).
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
- Ciclo de vida do anúncio: estados `draft`, `published`, `paused`, `closed` e `removed`; somente `published` é público e aceita novos interesses e solicitações; `closed` e `removed` são terminais; `removed` é exclusivo da moderação; nenhuma transição cancela solicitação paga nem revoga liberação de contato já autorizada; sem expiração automática no MVP — [product/listing-lifecycle.md](product/listing-lifecycle.md) (DEC-027).
- Política de imagens do anúncio: mínimo de 1 imagem processada com sucesso para publicar e máximo de 6 por anúncio; entrada restrita a JPEG, PNG e WebP estático, com no máximo 10 MB, no mínimo 320 px por lado e no máximo 50 megapixels; upload direto do cliente ao R2 autorizado server-side, sem o binário trafegar por Vercel Function; validação por conteúdo, regravação, remoção de EXIF/GPS e derivados públicos `thumb`/`medium`/`large` (320/768/1600 px) em WebP qualidade 80; sem pré-moderação automática por IA — [product/image-policy.md](product/image-policy.md) (DEC-028).
- Ciclo de vida da negociação: estados `active` e `closed`; a negociação nasce `active` quando a escolha ocorre e a liberação de contato fica autorizada por RB-001; qualquer uma das duas partes — anunciante ou solicitante escolhido — pode encerrá-la unilateralmente, com confirmação explícita do próprio ator, de forma imediata, irreversível, autorizada server-side, idempotente e auditada; sem timeout ou autoencerramento; `closed` satisfaz a pré-condição de RB-002 e não afirma sucesso da troca; o encerramento não altera anúncio, pagamento, contato liberado nem seleção — [product/negotiation-lifecycle.md](product/negotiation-lifecycle.md) (DEC-029).
- Avaliações: a avaliação é sobre a contraparte da negociação; no máximo uma por direção e duas por negociação, entre anunciante e solicitante escolhido, sem terceiros e sem autoavaliação; exige negociação `closed`, que não afirma sucesso da troca, e o estado do anúncio não altera a elegibilidade; formato de exatamente uma nota inteira de 1 a 5, sem texto livre, resposta ou réplica no MVP; janela de 14 dias corridos a partir do encerramento, sem extensão; publicação cega bilateral até que ambas submetam ou a janela termine, sem nota automática para quem não avaliou; nota substituível apenas antes da publicação e imutável depois; reputação pública por média aritmética simples com uma casa decimal mais a quantidade de avaliações válidas, sem vincular publicamente nota, avaliador e negociação; abuso pode levar à invalidação integral auditada, e nota baixa ou discordância, isoladamente, não justificam remoção — [product/ratings.md](product/ratings.md) (DEC-030).
- Política de itens proibidos: catálogo por categorias PI-01 a PI-12, cada uma com fundamento `ilegal`, `regulado` ou `política`, sendo a ausência de um item na lista insuficiente para torná-lo permitido; decisão estruturante de que o MVP **não** implementa fluxo de autorização documental, de modo que todo item cuja licitude dependa de licença, autorização, prescrição, registro sanitário, certificado de procedência, habilitação do vendedor ou verificação de idade é proibido; em caso ambíguo, dúvida material razoável em categoria de alto risco leva à remoção com motivo expresso e dúvida fora de alto risco leva à manutenção; a publicação exige declaração de conformidade e admite validações preventivas apenas auxiliares, sem pré-moderação automática por IA; a denúncia exige usuário autenticado e verificado, é única por par (denunciante, anúncio) e não altera o estado do anúncio; a moderação decide `procedente`, `improcedente` ou `sem_acao`, com perfil único e sem estado intermediário de anúncio; a remoção usa exclusivamente as transições administrativas do anúncio e é terminal; os prazos de decisão são de 24 horas corridas na classe crítica e 5 dias úteis na comum, sem compromisso 24x7; a reincidência é progressiva com bloqueio imediato em casos graves; existe contestação administrativa sem efeito suspensivo e sem restauração automática; a identidade do denunciante nunca é revelada ao anunciante — [product/prohibited-items.md](product/prohibited-items.md) (DEC-031).
- Política de desistência e reseleção: a reseleção é permitida sob cinco pré-condições simultâneas — escolha anterior existente, negociação anterior `closed`, anúncio atualmente `published`, candidato com pagamento aprovado e candidato ainda não selecionado nesse anúncio — mais confirmação explícita do anunciante, sem automação; a escolha anterior e a liberação de contato já concedida são fatos históricos imutáveis e não são revogadas; a nova escolha cria nova negociação e nova autorização, auditadas independentemente; nunca há duas negociações `active` originadas por escolhas sequenciais do mesmo anúncio; RB-003 é preservada literalmente, de modo que cada solicitação paga é escolhida no máximo uma vez, no máximo três pessoas são escolhidas sequencialmente, e a reseleção não cria vaga, não reinicia o limite nem permite uma quarta paga; a desistência não gera reseleção automática, reembolso automático nem alteração automática do anúncio — [product/reselection-policy.md](product/reselection-policy.md) (DEC-032).
- Retenção e exclusão de dados: minimização com prazos expressos por categoria e sem retenção indefinida genérica; a exclusão de conta impede novos logins, invalida sessões quando aplicável, retira perfil, conteúdo e anúncios da exposição pública **imediatamente**, e elimina ou anonimiza dados pessoais e operacionais em **até 30 dias**, ressalvados fatos necessários a obrigação legal, abuso, segurança, defesa de direitos, auditoria e registros financeiros mínimos; imagens saem do público na hora e os objetos persistentes são removidos em até 30 dias, preservado sem alteração o prazo de 24 horas do original temporário; **6 meses** de log de acesso, **24 meses** de auditoria de liberação de contato e de registros de moderação, segurança e abuso (contados do encerramento do caso), **5 anos** de metadados financeiros mínimos como baseline a revisar por responsável jurídico e contábil antes da produção comercial, backups apenas até o ciclo normal com máximo de 30 dias adicionais e reaplicação obrigatória das exclusões em caso de restauração, e legal hold com fundamento, escopo, início, responsável e condição de encerramento registrados — [product/data-retention-policy.md](product/data-retention-policy.md) (DEC-033).
- Elegibilidade etária: o MVP é destinado exclusivamente a pessoas com **18 anos completos ou mais**, como decisão conservadora de escopo do produto e **não** como afirmação de proibição legal; o cadastro exige declaração explícita registrada com aceitação, instante e versão dos termos; **não** se coleta data de nascimento, RG, CPF, CNH, selfie, documento nem biometria para comprovação etária, e **não** se usa serviço externo de verificação; havendo evidência razoável de menoridade, a conta é bloqueada temporariamente e não pode publicar, solicitar, pagar nem receber contato liberado — [product/age-eligibility.md](product/age-eligibility.md) (DEC-034).
- Natureza da demonstração de interesse: "Tenho interesse" é ação **gratuita** de interface que exige usuário autenticado, email verificado e anúncio `published`, apenas inicia a solicitação de desbloqueio e **não** libera contato, **não** ocupa vaga paga, **não** cria entidade `Interest`, **não** gera registro visível ao anunciante e **não** pode ser cancelada, por não existir entidade persistida; o anunciante não vê nem é notificado desses cliques e não recebe lista ou contador individualizado; admite-se apenas telemetria agregada de funil; o valor de R$ 0,99 pertence à solicitação de desbloqueio — [product/interest-flow.md](product/interest-flow.md) (DEC-035).
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

Itens que **não** estão decididos e não devem ser tratados como homologados estão listados em [decisions/open-decisions.md](decisions/open-decisions.md). Restam **duas**: o gateway de pagamento (OD-08) e as exceções de pagamento (OD-07).

Dez questões deixaram de constar dessa lista: OD-09, fechada por [ADR-0005](adr/0005-prisma-orm-migrations.md); OD-04, por [product/listing-lifecycle.md](product/listing-lifecycle.md) (DEC-027); OD-05, por [product/image-policy.md](product/image-policy.md) (DEC-028); OD-01, por [product/negotiation-lifecycle.md](product/negotiation-lifecycle.md) (DEC-029); OD-02, por [product/ratings.md](product/ratings.md) (DEC-030); OD-03, por [product/prohibited-items.md](product/prohibited-items.md) (DEC-031); OD-06, por [product/reselection-policy.md](product/reselection-policy.md) (DEC-032); OD-10, por [product/data-retention-policy.md](product/data-retention-policy.md) (DEC-033); OD-11, por [product/age-eligibility.md](product/age-eligibility.md) (DEC-034); e OD-12, por [product/interest-flow.md](product/interest-flow.md) (DEC-035).

Estado da Fase 0 após estas decisões: F0-017, F0-018, F0-020, F0-021 e F0-024 estão concluídos. **Não há item `próximo` nem `pendente` no backlog:** todo o trabalho restante da Fase 0 está bloqueado pela mesma raiz — a validação real do gateway de pagamento Pix para exatamente R$ 0,99 (F0-010, OD-08), cujo spike teve uma quarta execução em 2026-09-14, classificada novamente como `INCONCLUSIVO`. A terceira execução já havia comprovado oito dos dez critérios — incluindo a aceitação de exatamente R$ 0,99 e a tarifa efetiva de R$ 0,01 sobre esse valor, com líquido de R$ 0,98. A quarta fechou o critério de recebimento de webhook: um endpoint HTTPS público foi provisionado em projeto Vercel temporário e isolado, sem qualquer relação com o projeto oficial `techlab-troq`, e o Mercado Pago entregou notificações reais a esse endpoint, com `x-signature`, `x-request-id`, `ts` e `data.id` presentes. Restou **um único critério**, a validação da assinatura contra uma notificação real, que depende de um único insumo humano: a chave secreta de webhook. A quinta execução, também em 2026-09-14, mostrou que o painel “Suas integrações” é legível com a sessão de navegador do próprio Bruno e que o bloqueio se restringe a uma **aprovação TOTP** para criar a aplicação do spike; capturou ainda o manifesto e o `v1` completos de uma reentrega real, o que permite fechar o critério 8 offline assim que a chave existir. Mercado Pago continua apenas candidato (DEC-017) e ADR-0004 não pode ser criado sem evidências. A Fase 0 **não** está concluída.

## 5. Riscos

Riscos conhecidos e mitigações iniciais estão em [delivery/risks.md](delivery/risks.md).
