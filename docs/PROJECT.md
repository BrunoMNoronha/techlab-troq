# Projeto — TechLab+ TROQ

Use como **briefing e instrução permanente**. Preencha o conhecido, use `TBD` nas lacunas e não repita contexto já existente no repositório.

## 1. Briefing

**Revisão documental local: 2026-09-29.** Nova instância do modelo TechLab+ Starter: os documentos existentes têm estrutura especializada e foram preservados. Esta síntese referencia suas regras; não substitui o acervo normativo. O texto fixo das seções 2 a 6 foi preservado do modelo. Esta revisão executa apenas documentação; não comprova nem executa publicação, migrations ou aprovação de ambiente. **Reconciliada em 2026-09-29** sobre `main` em `e8ad1ae`, depois da integração da PR #61 (que trouxe este documento) e com a aprovação do gate da Fase 2 retificada em [delivery/phase-3-transition.md](delivery/phase-3-transition.md); a reconciliação também é apenas documental.

- **Produto/problema/evidências:** plataforma de anúncios entre pessoas com acesso controlado ao contato do anunciante. Problema descrito pelo produto: permitir descoberta e negociação sem exposição pública de telefone/WhatsApp. Evidência disponível: [escopo](product/mvp-scope.md), contratos e código; pesquisa com usuários e validação de demanda: **TBD**.
- **Objetivo/métricas:** permitir publicar e consultar anúncios e, no MVP completo, solicitar o contato por R$ 0,99, com até três solicitações pagas por anúncio e escolha pelo anunciante. Métricas de adoção, conversão, receita e metas de sucesso: **TBD**. Valores e limites são regras de negócio, não resultados medidos.
- **Público/plataformas/interface:** público prioritário de 18 a 50 anos, urbano, familiarizado com marketplaces; web mobile-first, inclusive em redes 3G/4G. Cadastro permitido a partir de 18 anos completos, por declaração, sem teto de idade. PWA é direcionamento; Web Push é adiável. Fontes: [escopo](product/mvp-scope.md), [elegibilidade](product/age-eligibility.md).
- **Responsáveis/decisores:** responsável de produto, responsável técnico, aprovadores e responsáveis jurídico/contábil: **TBD**; titularidade do repositório não atribui automaticamente esses papéis.
- **Fluxo/perfis/permissões:** cadastro → verificação de email → publicação/consulta → solicitação paga → escolha pelo anunciante → contato apenas ao escolhido → encerramento → avaliação. Anunciante e interessado são papéis do usuário; moderação tem poderes delimitados em [itens proibidos](product/prohibited-items.md). Ações restritas exigem autorização server-side. A consulta pública está presente; o fluxo pago ainda não está implementado. Fontes: [escopo](product/mvp-scope.md), [identidade](architecture/identity-contract.md), [liberação de contato](architecture/contact-release.md).
- **MVP / fora do MVP:** identidade, anúncios com imagens, solicitação/Pix, escolha e liberação de contato, encerramento, avaliações, denúncia/moderação e email transacional compõem o MVP definido. Login social, Web Push, localização precisa e microserviços/API separada ficam fora do núcleo inicial. Implementação parcial não reduz esse escopo. Fonte: [escopo](product/mvp-scope.md).
- **Regras de negócio:** contato protegido liberado somente ao escolhido com pagamento aprovado; no máximo três solicitações pagas por anúncio; cobrança de R$ 0,99; localização pública limitada a cidade/UF; avaliações após encerramento; conformidade com política de itens proibidos. Interesse é ação gratuita sem entidade persistida; reseleção não cria vaga nova nem revoga contato já liberado. Fontes: [RB-001 a RB-006](product/business-rules.md), [interesse](product/interest-flow.md), [reseleção](product/reselection-policy.md), [exceções de pagamento](product/payment-exceptions.md).
- **Dados/privacidade/retenção:** contato nunca em payload/cache público ou logs. Política definida: exclusão/anonimização operacional em até 30 dias após solicitação, auditoria por 24 meses, segurança/abuso por 24 meses após encerramento, metadados financeiros por cinco anos, logs de acesso por seis meses quando aplicável e expiração de backups com até 30 dias adicionais. São regras documentadas, sem certificação de implementação nesta revisão; revisão jurídica/contábil antes da produção permanece pendente. Fonte: [política de retenção](product/data-retention-policy.md).
- **Integrações/dependências:** Better Auth, Prisma/PostgreSQL, Resend e Cloudflare R2 possuem consumidores no código; Sentry possui instrumentação. Mercado Pago Orders API é a decisão para Pix, com spike histórico documentado, mas o módulo de pagamentos continua sem comportamento. Provisionamento e conectividade atuais dos provedores não foram consultados. Fontes: [ambientes](engineering/environments.md), [ADR-0004](adr/0004-mercado-pago-pix.md), [código de identidade](../src/modules/identity/actions.ts), [email](../src/modules/identity/email.ts), [mídia](../src/modules/media/service.ts), [pagamentos](../src/modules/payments/index.ts).
- **Segurança/performance/acessibilidade/observabilidade/disponibilidade:** autorização server-side, isolamento de dados protegidos, tratamento de imagens e redação de telemetria são requisitos com código/testes presentes. Sentry é a ferramenta decidida; Replay está fora do MVP. Metas numéricas de desempenho, nível alvo de acessibilidade e metas operacionais ainda não homologadas permanecem **TBD**, conforme o [catálogo de requisitos](product/requirements.md). Presença de testes não comprova execução atual nem atendimento integral desses requisitos.
- **Restrições/prazo/custos:** usar exclusivamente **pnpm**; Node.js 24.x; preservar alterações locais e decisões vigentes. Não usar Vercel Hobby como base da produção comercial. Prazo de lançamento, orçamento, custos reais e tarifa contratada do gateway: **TBD**. Fontes: [package.json](../package.json), [ambientes](engineering/environments.md), [riscos](delivery/risks.md).
- **Repositório/diretório/branch:** [BrunoMNoronha/techlab-troq](https://github.com/BrunoMNoronha/techlab-troq/), diretório `C:\Development\Projects\techlab-troq`. Estado documentado: `main` = `origin/main` em `e8ad1ae`, verificados por `git fetch` em 2026-09-29. A [PR #61](https://github.com/BrunoMNoronha/techlab-troq/pull/61) (briefing) e a [PR #60](https://github.com/BrunoMNoronha/techlab-troq/pull/60) (home e entrada da solicitação) **já estão integradas**. A versão original deste briefing registrava a branch `feat/59-home-ofertas-publicas` em `9480c5c`, antes dessas integrações; ela está superada. A reconciliação usa a branch `codex/reconciliar-estado-fase-2`, criada a partir de `origin/main` em checkout isolado, e seu diff é somente documental.
- **Stack/banco/infraestrutura:** monólito modular Next.js 16.3.5, React 19.3.0, TypeScript 5.9.3, Prisma 7.10.0, PostgreSQL/Neon, Better Auth, R2/Sharp, Resend, Sentry e Vercel; `pnpm@11.25.0` com `pnpm-lock.yaml`. Duas migrations presentes: schema inicial e tabelas Better Auth. Existência dos arquivos não prova aplicação em nenhum ambiente. Fontes: [package.json](../package.json), [arquitetura](architecture/overview.md), [migrations](../prisma/migrations/), [banco](engineering/database.md).
- **Definição de pronto:** cumprir escopo/aceite da entrega e regras aplicáveis, validar diff, formatação, lint, tipagem, testes e build conforme impacto; testar integração/migrations quando afetadas e registrar limitações. Gates de fase seguem o [roadmap](delivery/roadmap.md); uma aprovação histórica não substitui evidência do código atual. Deploy exige evidência de ambiente/revisão publicada. Esta revisão documental se limita a estrutura, fontes, links locais e integridade do diff.
- **Estado verificado/pendências:** a Fase 2 está **implementada em parte e o gate de saída NÃO está aprovado**. O [relatório de transição](delivery/phase-3-transition.md) declarava em 2026-09-28 a Fase 2 concluída e a Fase 3 aberta; essa declaração foi **retificada em 2026-09-29** e é apenas registro histórico (G1 `NÃO ATENDIDO`, G2 `NÃO COMPROVADO`, G3 `PARCIAL`, sem nenhum `PASS`). Das issues #38 a #51, #39 a #42 (identidade, F2-001 a F2-004), #43 (contrato de anúncios, F2-005), #44 (rascunhos, edição e meus anúncios, F2-006), #45 (contrato de mídia, F2-007) e #47 (entrega, limpeza e expurgo de imagens, F2-009) foram encerradas em 2026-09-29; #46 (upload e processamento, F2-008) e #48 (publicação e ciclo de vida pelo dono, F2-010) foram encerradas em 2026-09-30; #38 e #49 a #51 seguem abertas. A política CORS dos buckets foi aplicada e o upload pelo navegador comprovado em 2026-09-30 ([media-pipeline-contract.md](architecture/media-pipeline-contract.md), seção 20.4); nem a recuperação nem a limpeza de imagens têm cron agendado (seção 20.3). Correções de autenticação (#53, #57 e #58) e a home pública com entrada da solicitação (#60) estão integradas; a entrada **não** cobra, reserva vaga nem libera contato. A Fase 3 permanece condicionada ao gate e não está implementada. Próxima entrega técnica por dependência (atualizada em 2026-09-30 por F2-010): issue [#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49) (listagem e detalhe públicos sem contato), justificada em [project-state.md](project-state.md), seção 3.3. CI da `main` em `e8ad1ae`: verde, verificada no GitHub. Publicação atual, funcionamento autenticado em preview/produção e resultados de testes com banco real citados nas PRs: **não verificados aqui**. Ver a matriz abaixo.

### Evidências e reconciliação de estado

| Classificação | Evidência verificada nesta revisão | Conclusão e limite |
| --- | --- | --- |
| CONFIRMADO — histórico | Commit `098d171` integra a Fase 2 (#52); `906cccd`, `0de1a1c` e `9480c5c` corrigem autenticação (#53, #57 e #58) | Os resumos que diziam que a Fase 2 não tinha funcionalidade foram reconciliados em 2026-09-29. Não prova publicação. |
| CONFIRMADO — código presente | [Identidade](../src/modules/identity/actions.ts), [anúncios](../src/modules/listing/actions.ts), [mídia](../src/modules/media/service.ts), rotas em `src/app/` | Cadastro/verificação/login/logout, ciclo de anúncios, consulta e pipeline de imagens têm implementação. Não equivale a validação funcional integral. |
| CONFIRMADO — integrada | [Home](../src/app/page.tsx) e [entrada da solicitação](../src/modules/request/entry.ts), integradas na [PR #60](https://github.com/BrunoMNoronha/techlab-troq/pull/60) como `4bb78fe` | Home com ofertas e entrada da jornada estão em `main`. A entrada retorna `request_unavailable` para usuário elegível, sem reservar vaga ou cobrar. A evidência funcional é a relatada na PR (ambiente local); não foi reexecutada nem provada em preview. |
| CONFIRMADO — escopo futuro | [Pagamentos](../src/modules/payments/index.ts) e [contato](../src/modules/contact/index.ts) exportam módulos vazios | O fluxo pago e a liberação de contato permanecem por implementar. Decisão arquitetural e schema não equivalem a funcionalidade pronta. |
| REGISTRO HISTÓRICO — testes | [Gate da Fase 2](delivery/phase-3-transition.md) citava 107 testes, lint, tipagem e build aprovados; PRs posteriores relatam 118, 124 e 167 testes | Números de autor de PR, não reexecutados e não atribuíveis à árvore atual. O único resultado verificado é a CI `success` em `e8ad1ae`. |
| CONTRADIÇÃO RETIFICADA — prova do gate | O critério G1 exige fluxo em preview e a evidência era de arquivos de testes; [auditoria de segurança](../src/modules/platform/security-audit.test.ts) usa mocks; publicar e enviar imagem não têm caminho na interface | A aprovação foi **retirada como estado vigente** em 2026-09-29: gate não aprovado, sem `PASS`. Ver [delivery/phase-3-transition.md](delivery/phase-3-transition.md), seções R3 e R4. Não é homologação nem conclui a issue #51. |
| RECONCILIADO — resumos | [README](../README.md), [estado](project-state.md), [índice](README.md), [backlog](delivery/backlog.md) e [roadmap](delivery/roadmap.md) descrevem, desde 2026-09-29, a Fase 2 como em andamento com gate não aprovado | Documentos extensos e registros históricos foram preservados; o histórico de cada fase segue identificado como tal. |
| CONFIRMADO — validação técnica | [CI em `e8ad1ae`](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/36578636484) `success`; [migrations no Neon de preview em `098d171`](https://github.com/BrunoMNoronha/techlab-troq/actions/runs/36445306800) aplicaram `20260928103600_add_better_auth_tables`, com integração somente leitura 5 de 5 | A CI não sobe banco e a integração do Neon não escreve; não comprovam o fluxo funcional. |
| DECISÃO PENDENTE/TBD | [Decisões abertas](decisions/open-decisions.md) lista OD-13 a OD-15, abertas na Fase 3 em 2026-10-01 (contato como pré-condição, limite de reservas não pagas e critério de prova sem agendamento); nenhuma da Fase 0 | Não reabrir decisões encerradas. Lacunas de responsáveis, métricas e custos acima continuam TBD; não são aprovações inferidas. |

**Validação desta revisão:** leitura de Git, issues #37 a #59, PRs #52, #53, #57, #58, #60 e #61 e trechos de implementação; conferência de links locais e da preservação literal das seções 2 a 6. A revisão original (briefing) não executou suíte funcional, build, migration ou consulta a provedor, e a reconciliação de 2026-09-29 também não. Sobre CI, só foi consultado o resultado no GitHub. Isso não reconfirma o gate funcional nem comprova deploy do produto.

## 2. Operação e autonomia

- **ChatGPT:** arquiteta, pesquisa, decide, planeja e orquestra. Produz tarefas, critérios de aceite e prompts; revisa evidências e conduz a entrega.
- **Claude ou Antigravity:** executam os prompts. Antes de alterar, consultam repositório e documentação; ao final, sempre entregam o relatório obrigatório.
- O ChatGPT não repete a implementação, salvo para revisar, corrigir ou quando solicitado.

Antes de decisão relevante, analise o projeto e pesquise de forma direcionada em fontes confiáveis ou documentação oficial. Escolha a solução mais simples que atenda ao MVP com segurança, manutenção e custo adequados. Registre apenas decisões importantes.

Prossiga sem confirmação em escolhas reversíveis ou de baixo risco. Consulte o usuário somente diante de conflito de negócio, obrigação jurídica/financeira, credencial indispensável, risco grave de segurança ou ação irreversível com possível perda de dados.

Há autorização para editar arquivos, instalar dependências justificadas, criar branches, executar migrações seguras, fazer **commit, push, abrir/revisar/mesclar PR, deploy e publicação**. Preserve alterações existentes, valide antes de entregar e mantenha rollback quando aplicável. Nunca exponha segredos, reduza segurança ou execute ação destrutiva em dados reais sem proteção explícita.

Em Node.js, use **pnpm**; não use npm sem solicitação expressa.

## 3. Fluxo

1. Verificar estado do repositório e ler somente arquivos relevantes.
2. Pesquisar apenas incertezas materiais.
3. Definir objetivo, escopo, aceite, riscos e validações.
4. Gerar prompt curto e autocontido, referenciando arquivos em vez de copiar conteúdo extenso.
5. Receber relatório; revisar diff e evidências; concentrar correções em **um único prompt**.
6. Com os controles técnicos concluídos, finalizar Git, PR, merge e publicação sem nova confirmação.

Sem solicitação expressa, **ignore homologação**. Validação técnica permanece obrigatória.

## 4. Documentação, qualidade e revisão

- Repositório é a fonte oficial. Prefira `docs/PROJECT.md`; crie outros documentos somente quando necessários.
- Documente incrementalmente e atualize apenas o afetado.
- Revise pelo risco e pelo diff; não reanalise todo o projeto a cada ciclo.
- Execute controles aplicáveis: lint, tipagem, testes, build, migrações e segurança.
- Teste caminho principal, bordas, vazio e alto volume quando pertinente.
- Após correção, repita apenas verificações impactadas; use suíte completa antes de merge/deploy em mudança ampla ou crítica.
- Use segundo agente revisor apenas em autenticação, autorização, pagamentos, dados sensíveis, segurança, migração destrutiva ou arquitetura crítica.
- Não reabra decisão registrada sem nova evidência.

## 5. Prompt e relatório

Todo prompt deve conter:

`contexto → objetivo → escopo/fora do escopo → arquivos → restrições/decisões → aceite → validações → Git/publicação → relatório`.

Todo agente deve retornar:

- **status:** concluído, parcial ou bloqueado;
- **resultado:** resumo e arquivos alterados;
- **decisões:** suposições e justificativas relevantes;
- **validação:** comandos, testes, resultados e evidências;
- **entrega:** branch, commit, PR, merge e deploy/publicação;
- **pendências:** falhas, riscos, dívida técnica e fora do escopo;
- **próxima ação:** somente se necessária.

## 6. Primeira resposta

Entregue: resumo; fatos, suposições e bloqueios; decisões/pesquisas iniciais; plano ou backlog mínimo priorizado; e primeiro prompt executor. Não aguarde confirmação sem bloqueio real. Preserve o MVP e elimine documentação, revisões e etapas que não contribuam diretamente para a entrega.
