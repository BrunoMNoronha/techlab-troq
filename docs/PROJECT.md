# Projeto — TechLab+ TROQ

Use como **briefing e instrução permanente**. Preencha o conhecido, use `TBD` nas lacunas e não repita contexto já existente no repositório.

## 1. Briefing

**Revisão documental local: 2026-09-29.** Nova instância do modelo TechLab+ Starter: os documentos existentes têm estrutura especializada e foram preservados. Esta síntese referencia suas regras; não substitui o acervo normativo. O texto fixo das seções 2 a 6 foi preservado do modelo. Esta revisão executa apenas documentação; não comprova nem executa publicação, migrations ou aprovação de ambiente.

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
- **Repositório/diretório/branch:** [BrunoMNoronha/techlab-troq](https://github.com/BrunoMNoronha/techlab-troq), diretório `C:\Development\Projects\techlab-troq`; branch inspecionada `feat/59-home-ofertas-publicas`; HEAD `9480c5c8791c2ea04dbbc1d6215b814f555f490a`. As referências locais `main` e `origin/main` apontavam ao mesmo SHA; não houve fetch nem consulta remota nesta revisão. A inspeção inicial encontrou alterações locais pré-existentes, preservadas. Ao preparar esta entrega documental, o trabalho de produto já estava no commit `6ece46e` da PR #60, ainda separado de `main`. Esta entrega usa a branch `codex/briefing-projeto`, baseada no SHA de `main` acima, e inclui somente este documento.
- **Stack/banco/infraestrutura:** monólito modular Next.js 16.3.5, React 19.3.0, TypeScript 5.9.3, Prisma 7.10.0, PostgreSQL/Neon, Better Auth, R2/Sharp, Resend, Sentry e Vercel; `pnpm@11.25.0` com `pnpm-lock.yaml`. Duas migrations presentes: schema inicial e tabelas Better Auth. Existência dos arquivos não prova aplicação em nenhum ambiente. Fontes: [package.json](../package.json), [arquitetura](architecture/overview.md), [migrations](../prisma/migrations/), [banco](engineering/database.md).
- **Definição de pronto:** cumprir escopo/aceite da entrega e regras aplicáveis, validar diff, formatação, lint, tipagem, testes e build conforme impacto; testar integração/migrations quando afetadas e registrar limitações. Gates de fase seguem o [roadmap](delivery/roadmap.md); uma aprovação histórica não substitui evidência do código atual. Deploy exige evidência de ambiente/revisão publicada. Esta revisão documental se limita a estrutura, fontes, links locais e integridade do diff.
- **Estado verificado/pendências:** implementação da Fase 2 presente no histórico, com correções posteriores de autenticação. O [relatório de transição](delivery/phase-3-transition.md) declara Fase 2 concluída e Fase 3 aberta; essa declaração e seus resultados de testes são históricos, não reexecutados aqui. Home e entrada da solicitação foram posteriormente commitadas em `6ece46e`, na PR #60, ainda não integrada ao preparar esta entrega documental. Publicação atual, CI atual e funcionamento autenticado em preview/produção: **não verificados**. Ver a matriz abaixo para os limites de cada evidência.

### Evidências e reconciliação de estado

| Classificação | Evidência verificada nesta revisão | Conclusão e limite |
| --- | --- | --- |
| CONFIRMADO — histórico local | Commit `098d171` integra a Fase 2 (#52); `906cccd`, `0de1a1c` e `9480c5c` corrigem autenticação (#53, #57 e #58) | A descrição de Fase 2 sem funcionalidade nos resumos antigos está desatualizada. Não prova publicação. |
| CONFIRMADO — código presente | [Identidade](../src/modules/identity/actions.ts), [anúncios](../src/modules/listing/actions.ts), [mídia](../src/modules/media/service.ts), rotas em `src/app/` | Cadastro/verificação/login/logout, ciclo de anúncios, consulta e pipeline de imagens têm implementação. Não equivale a validação funcional integral. |
| CONFIRMADO — entrega paralela | Inspeção inicial do diff local e posterior commit `6ece46e` na [PR #60](https://github.com/BrunoMNoronha/techlab-troq/pull/60); `src/app/page.tsx` e `src/modules/request/entry.ts` nessa branch | Home com ofertas e entrada da jornada pertencem à PR #60, separada desta entrega. A entrada retorna `request_unavailable` para usuário elegível, sem reservar vaga ou cobrar. Esses arquivos devem ser consultados na revisão da PR #60, não presumidos na base deste briefing. |
| CONFIRMADO — escopo futuro | [Pagamentos](../src/modules/payments/index.ts) e [contato](../src/modules/contact/index.ts) exportam módulos vazios | O fluxo pago e a liberação de contato permanecem por implementar. Decisão arquitetural e schema não equivalem a funcionalidade pronta. |
| REGISTRO HISTÓRICO — testes | [Gate da Fase 2](delivery/phase-3-transition.md) cita 107 testes, lint, tipagem e build aprovados em baseline anterior | Resultados não reexecutados nesta atualização. Não atribuir os números à árvore de trabalho atual. |
| AMBIGUIDADE — prova do gate | O critério G1 do relatório exige fluxo em preview, mas a evidência indicada são arquivos de testes; [auditoria de segurança](../src/modules/platform/security-audit.test.ts) usa mocks | Falta nesta revisão evidência de execução do fluxo completo em preview. Preservada a aprovação registrada, sem reconfirmá-la nem alterar o MVP. |
| AMBIGUIDADE — resumos divergentes | [README](../README.md), [estado](project-state.md) e [índice](README.md) ainda descrevem o início da Fase 2; o relatório de transição e o histórico local são posteriores | Usar esta síntese para o recorte verificado em 2026-09-29. Documentos extensos e registros históricos foram preservados, sem reescrita em massa. |
| DECISÃO PENDENTE/TBD | [Decisões abertas](decisions/open-decisions.md) não lista decisões abertas da Fase 0 | Não reabrir decisões encerradas. Lacunas de responsáveis, métricas e custos acima continuam TBD; não são aprovações inferidas. |

**Validação desta revisão:** leitura de Git, fontes normativas e trechos de implementação; conferência de links locais, dos 15 campos do briefing e da preservação literal das seções 2 a 6. A revisão inicial não executou suíte funcional, build, migration ou consulta a provedor. A entrega documental por PR foi solicitada posteriormente; seus checks e o resultado do merge devem ser consultados no GitHub. Isso não reconfirma o gate funcional nem comprova deploy do produto.

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
