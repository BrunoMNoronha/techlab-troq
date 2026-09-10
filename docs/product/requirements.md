# Catálogo de requisitos — TROQ

Catálogo inicial de requisitos rastreáveis do MVP. Contém **apenas** requisitos derivados das decisões já vigentes na Fase 0 ([../project-state.md](../project-state.md), [business-rules.md](business-rules.md), [listing-lifecycle.md](listing-lifecycle.md), ADRs em [../adr/](../adr/), [../decisions/decision-log.md](../decisions/decision-log.md)). Nenhum requisito aqui fecha uma decisão listada em [../decisions/open-decisions.md](../decisions/open-decisions.md).

## Convenções

- `RF-xxx`: requisito funcional. `RNF-xxx`: requisito não funcional.
- **Prioridade MVP:** `obrigatória` (faz parte do núcleo do MVP) ou `direcionamento` (orienta a implementação, sem gate próprio de aceite no MVP).
- **Status permitidos nesta fase:**
  - `definido`: descrição e critério de aceite suficientes para orientar design e implementação;
  - `parcialmente definido`: núcleo definido, mas há lacunas apontadas para uma decisão aberta;
  - `bloqueado por decisão aberta`: a implementação não pode começar antes do fechamento da decisão indicada.
- Critérios de aceite são de alto nível. Critérios verificáveis detalhados serão escritos na fase de implementação correspondente ([../delivery/roadmap.md](../delivery/roadmap.md)).
- Metas numéricas só aparecem quando já homologadas. Onde não há métrica, o requisito registra que a métrica objetiva será definida antes da implementação ou do gate correspondente.

## Resumo

| Grupo | IDs | Definido | Parcialmente definido | Bloqueado |
| --- | --- | --- | --- | --- |
| Identidade e conta | RF-001 a RF-003, RF-023 | 2 | 1 | 1 |
| Anúncios | RF-004 a RF-007 | 2 | 1 | 1 |
| Solicitações e pagamentos | RF-008 a RF-012 | 0 | 3 | 2 |
| Escolha e contato | RF-013 a RF-015 | 2 | 1 | 0 |
| Encerramento e avaliações | RF-016, RF-017 | 0 | 1 | 1 |
| Denúncia e moderação | RF-018 a RF-020 | 0 | 3 | 0 |
| Transversais | RF-021, RF-022 | 0 | 2 | 0 |
| Não funcionais | RNF-001 a RNF-018 | 8 | 10 | 0 |

## Requisitos funcionais

### Identidade e conta

#### RF-001 — Cadastro de conta

- **Descrição:** o usuário cria uma conta com email e senha. O cadastro é a porta de entrada dos papéis de anunciante e interessado.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 1) em [mvp-scope.md](mvp-scope.md); decisão Better Auth com email/senha ([../project-state.md](../project-state.md), DEC-012 e DEC-013).
- **Regra de negócio relacionada:** —
- **Decisão aberta relacionada:** OD-11 (elegibilidade etária formal e forma de declaração/verificação).
- **Critério de aceite (alto nível):** conta criada com email e senha; a conta só é considerada ativa após verificação de email (RF-002); nenhuma regra de idade é aplicada no cadastro até que OD-11 seja fechada.
- **Status:** parcialmente definido. O público-alvo de 18 a 50 anos **não** é regra de cadastro; critérios de elegibilidade dependem de OD-11.

#### RF-002 — Verificação de email

- **Descrição:** o sistema envia email de verificação e só considera o endereço confirmado após a ação do usuário.
- **Prioridade MVP:** obrigatória.
- **Origem:** decisão de autenticação inicial por email/senha **com verificação de email** (DEC-013); Resend como provedor de email (DEC-015).
- **Regra de negócio relacionada:** —
- **Decisão aberta relacionada:** —
- **Critério de aceite (alto nível):** email de verificação enviado no cadastro; endereço não verificado não habilita as ações que exigem conta verificada; reenvio possível.
- **Status:** definido.

#### RF-003 — Autenticação e sessão

- **Descrição:** login por email/senha, logout e manutenção de sessão, usando Better Auth.
- **Prioridade MVP:** obrigatória.
- **Origem:** DEC-012 e DEC-013.
- **Regra de negócio relacionada:** —
- **Decisão aberta relacionada:** —
- **Critério de aceite (alto nível):** usuário verificado autentica com email/senha; toda ação restrita exige sessão válida verificada no servidor; login social fica fora do núcleo inicial.
- **Status:** definido.

#### RF-023 — Exclusão de conta e dados pessoais

- **Descrição:** o usuário pode solicitar a exclusão da conta e de seus dados pessoais, respeitando as obrigações de retenção que vierem a ser definidas.
- **Prioridade MVP:** obrigatória (adequação à LGPD, ver RNF-009).
- **Origem:** OD-10 e R-06 em [../delivery/risks.md](../delivery/risks.md).
- **Regra de negócio relacionada:** RB-001 (trilha de auditoria da liberação de contato pode ter retenção própria).
- **Decisão aberta relacionada:** OD-10.
- **Critério de aceite (alto nível):** a definir após OD-10 (prazos, anonimização, retenção de auditoria).
- **Status:** bloqueado por decisão aberta (OD-10).

### Anúncios

#### RF-004 — Publicação de anúncio

- **Descrição:** o anunciante publica um anúncio com título, descrição, imagens e localização pública limitada a cidade/UF.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 2); capacidade obrigatória em [mvp-scope.md](mvp-scope.md).
- **Regra de negócio relacionada:** RB-005, RB-006.
- **Decisão aberta relacionada:** OD-05 (imagens), OD-03 (itens proibidos). OD-04 foi fechada por [listing-lifecycle.md](listing-lifecycle.md) (DEC-027).
- **Critério de aceite (alto nível):** anúncio criado por usuário autenticado e verificado; nenhum dado de localização mais preciso que cidade/UF é armazenado ou exibido publicamente; o anúncio nasce no estado `draft` e só se torna público por publicação explícita do anunciante, conforme [listing-lifecycle.md](listing-lifecycle.md).
- **Status:** parcialmente definido. Campos além de título, descrição, imagens e cidade/UF não estão definidos.

#### RF-005 — Consulta de anúncios

- **Descrição:** qualquer usuário consulta anúncios publicados (listagem e detalhe) sem acesso ao contato do anunciante.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 2); DEC-023 (contato protegido).
- **Regra de negócio relacionada:** RB-001, RB-005.
- **Decisão aberta relacionada:** — (OD-04 fechada por [listing-lifecycle.md](listing-lifecycle.md), DEC-027).
- **Critério de aceite (alto nível):** somente anúncios no estado `published` são consultáveis publicamente; anúncio em qualquer outro estado responde ao público como recurso não disponível, sem revelar existência prévia nem estado interno; listagem e detalhe exibem apenas cidade/UF como localização; telefone/WhatsApp nunca aparece em payload público ou cache público; filtros e ordenação são definidos na fase de implementação.
- **Status:** definido. Filtros e ordenação são detalhe de implementação, não decisão aberta.

#### RF-006 — Imagens do anúncio

- **Descrição:** o anunciante envia imagens do anúncio, armazenadas no Cloudflare R2 via API S3-compatible e servidas publicamente.
- **Prioridade MVP:** obrigatória.
- **Origem:** [../adr/0003-object-storage-r2.md](../adr/0003-object-storage-r2.md) (DEC-014).
- **Regra de negócio relacionada:** RB-006 (remoção do anúncio implica tratamento das imagens).
- **Decisão aberta relacionada:** OD-05 (quantidade, formatos, tamanho, processamento, moderação), OD-10 (expurgo e retenção das imagens). O efeito do estado do anúncio sobre as imagens está definido em [listing-lifecycle.md](listing-lifecycle.md): imagens deixam de ser servidas publicamente junto com o anúncio; o expurgo dos objetos segue OD-05 e OD-10.
- **Critério de aceite (alto nível):** a definir após OD-05; imagens nunca contêm dados protegidos em objetos públicos.
- **Status:** bloqueado por decisão aberta (OD-05). A decisão de armazenamento está vigente; as regras de imagem não.

#### RF-007 — Localização pública por cidade/UF

- **Descrição:** a única localização associada publicamente a um anúncio é cidade/UF.
- **Prioridade MVP:** obrigatória.
- **Origem:** RB-005; DEC-022 (localização precisa não é coletada nem exposta).
- **Regra de negócio relacionada:** RB-005.
- **Decisão aberta relacionada:** —
- **Critério de aceite (alto nível):** o modelo do anúncio não coleta coordenadas, endereço, CEP ou bairro no MVP; a interface pública exibe apenas cidade/UF.
- **Status:** definido.

### Solicitações e pagamentos

#### RF-008 — Demonstração de interesse

- **Descrição:** o interessado indica interesse em um anúncio como passo anterior à solicitação paga de desbloqueio.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 3).
- **Regra de negócio relacionada:** RB-003.
- **Decisão aberta relacionada:** OD-12 (natureza da demonstração de interesse: ação própria, persistência, gratuidade, cancelamento, visibilidade ao anunciante ou apenas início da solicitação paga). OD-04 foi fechada: o efeito do estado do anúncio sobre o interesse está em [listing-lifecycle.md](listing-lifecycle.md).
- **Critério de aceite (alto nível):** interesse só pode ser registrado por usuário autenticado e verificado, em anúncio no estado `published`; interesses já registrados são preservados quando o anúncio é pausado, encerrado ou removido; a demonstração de interesse não libera contato.
- **Status:** parcialmente definido. Este requisito **não** determina se a demonstração de interesse existe como entidade persistida nem se é uma ação gratuita e distinta da solicitação paga; essas questões estão em OD-12 e não devem ser inferidas deste catálogo.

#### RF-009 — Solicitação paga de desbloqueio de contato

- **Descrição:** o interessado solicita o desbloqueio de contato de um anúncio; a solicitação só passa a contar como paga após aprovação do pagamento de R$ 0,99.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passos 4 e 5); capacidade obrigatória em [mvp-scope.md](mvp-scope.md).
- **Regra de negócio relacionada:** RB-003, RB-004.
- **Decisão aberta relacionada:** OD-07, OD-08.
- **Critério de aceite (alto nível):** o solicitante só é elegível à escolha (RF-013) com pagamento aprovado; a solicitação não paga ou expirada não ocupa vaga.
- **Status:** parcialmente definido.

#### RF-010 — Reserva de vaga e limite de 3 solicitações pagas

- **Descrição:** cada anúncio aceita no máximo 3 solicitações pagas, garantido mesmo sob concorrência. Direcionamento vigente: reserva atômica de vaga antes da cobrança, com expiração.
- **Prioridade MVP:** obrigatória.
- **Origem:** RB-003; DEC-019; [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md) (garantias via transações e restrições do banco).
- **Regra de negócio relacionada:** RB-003.
- **Decisão aberta relacionada:** OD-07 (pagamento aprovado após expiração da reserva e outras exceções).
- **Critério de aceite (alto nível):** a quarta tentativa de solicitação paga é recusada; solicitações concorrentes nunca resultam em mais de 3 pagas; vaga reservada e não paga expira e é liberada.
- **Status:** parcialmente definido. O tempo de expiração e o tratamento de exceções dependem do design de pagamentos e de OD-07.

#### RF-011 — Cobrança de R$ 0,99 via Pix

- **Descrição:** a solicitação paga é cobrada em exatamente R$ 0,99 via Pix. A cobrança é definitiva mesmo se o solicitante não for escolhido.
- **Prioridade MVP:** obrigatória.
- **Origem:** RB-004; DEC-016 (Pix-first); DEC-017 e DEC-018 (Mercado Pago apenas candidato; spike obrigatório).
- **Regra de negócio relacionada:** RB-004.
- **Decisão aberta relacionada:** OD-08 (gateway), OD-07 (exceções).
- **Critério de aceite (alto nível):** valor cobrado é exatamente R$ 0,99; não há reembolso por não escolha; o gateway usado é o homologado após o spike.
- **Status:** bloqueado por decisão aberta (OD-08). O spike do gateway é o próximo trabalho crítico ([../delivery/backlog.md](../delivery/backlog.md), F0-010).

#### RF-012 — Confirmação de pagamento, webhook e idempotência

- **Descrição:** o sistema recebe a confirmação de pagamento do gateway (webhook) e atualiza o estado da solicitação de forma idempotente e reconciliável.
- **Prioridade MVP:** obrigatória.
- **Origem:** DEC-018 (spike deve provar confirmação, webhook e idempotência); R-04 em [../delivery/risks.md](../delivery/risks.md).
- **Regra de negócio relacionada:** RB-001 (pagamento aprovado é pré-condição da liberação), RB-003.
- **Decisão aberta relacionada:** OD-08, OD-07.
- **Critério de aceite (alto nível):** webhook duplicado, fora de ordem ou perdido não gera estado inconsistente; contato nunca é liberado sem pagamento aprovado registrado.
- **Status:** bloqueado por decisão aberta (OD-08).

### Escolha e contato

#### RF-013 — Escolha do solicitante pelo anunciante

- **Descrição:** o anunciante escolhe uma solicitação entre as solicitações pagas do seu anúncio.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 7); capacidade obrigatória em [mvp-scope.md](mvp-scope.md).
- **Regra de negócio relacionada:** RB-001, RB-003.
- **Decisão aberta relacionada:** OD-06 (desistência e reseleção).
- **Critério de aceite (alto nível):** apenas o anunciante do anúncio pode escolher; só solicitações com pagamento aprovado são elegíveis; a escolha é registrada em auditoria (RF-022).
- **Status:** parcialmente definido. Reseleção e desistência dependem de OD-06.

#### RF-014 — Proteção do contato do anunciante

- **Descrição:** telefone/WhatsApp é dado protegido: nunca aparece em payload público, cache público, logs ou componentes renderizados no cliente sem autorização.
- **Prioridade MVP:** obrigatória.
- **Origem:** DEC-023; [../adr/0001-modular-monolith-nextjs.md](../adr/0001-modular-monolith-nextjs.md) (consequências); R-03.
- **Regra de negócio relacionada:** RB-001.
- **Decisão aberta relacionada:** —
- **Critério de aceite (alto nível):** nenhuma rota, cache ou log público contém o contato; o contato só transita em resposta autorizada server-side ao escolhido com pagamento aprovado.
- **Status:** definido.

#### RF-015 — Liberação do contato ao escolhido

- **Descrição:** o contato é liberado somente ao solicitante escolhido e com pagamento aprovado, mediante autorização server-side e registro de auditoria.
- **Prioridade MVP:** obrigatória.
- **Origem:** RB-001; DEC-023.
- **Regra de negócio relacionada:** RB-001.
- **Decisão aberta relacionada:** OD-06 (efeito de desistência/reseleção sobre liberações já feitas).
- **Critério de aceite (alto nível):** a liberação exige as duas condições simultâneas (escolhido e pagamento aprovado) verificadas no servidor; cada liberação gera registro de auditoria com quem, quando e para qual solicitação.
- **Status:** definido. A forma de apresentação do contato ao escolhido é detalhe de implementação.

### Encerramento e avaliações

#### RF-016 — Encerramento da negociação

- **Descrição:** a negociação pode ser encerrada no sistema; o encerramento é pré-condição das avaliações.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 9); RB-002.
- **Regra de negócio relacionada:** RB-002.
- **Decisão aberta relacionada:** OD-01.
- **Critério de aceite (alto nível):** a definir após OD-01 (quem aciona, confirmação de uma ou ambas as partes, prazos, estados intermediários).
- **Status:** bloqueado por decisão aberta (OD-01). Este catálogo **não** define como o encerramento é confirmado.

#### RF-017 — Avaliações

- **Descrição:** após o encerramento da negociação no sistema, avaliações são permitidas.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 10); RB-002.
- **Regra de negócio relacionada:** RB-002.
- **Decisão aberta relacionada:** OD-01, OD-02.
- **Critério de aceite (alto nível):** nenhuma avaliação é aceita enquanto a negociação não estiver encerrada no sistema; quem avalia quem, formato, prazo e visibilidade seguem OD-02.
- **Status:** parcialmente definido. O momento está definido (RB-002); as regras detalhadas não.

### Denúncia e moderação

#### RF-018 — Denúncia de anúncio

- **Descrição:** usuários podem denunciar anúncios.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 11); RB-006.
- **Regra de negócio relacionada:** RB-006.
- **Decisão aberta relacionada:** OD-03 (fluxo de denúncia, categorias, prazos).
- **Critério de aceite (alto nível):** denúncia registrada com anúncio, denunciante e motivo; encaminhada para moderação (RF-019).
- **Status:** parcialmente definido.

#### RF-019 — Moderação

- **Descrição:** existe um caminho de moderação que analisa denúncias e decide sobre a manutenção ou remoção de anúncios.
- **Prioridade MVP:** obrigatória.
- **Origem:** RB-006; R-05.
- **Regra de negócio relacionada:** RB-006.
- **Decisão aberta relacionada:** OD-03 (critérios, gatilhos, prazos, recurso e reincidência). O estado `removed` e suas transições estão definidos em [listing-lifecycle.md](listing-lifecycle.md) (DEC-027).
- **Critério de aceite (alto nível):** a moderação leva o anúncio de `draft`, `published` ou `paused` para `removed`, que é terminal; decisão de moderação registrada em auditoria com motivo (RF-022); anúncio removido deixa de ser consultável e não autoriza nova escolha nem nova liberação de contato.
- **Status:** parcialmente definido. Perfis de moderador e ferramentas serão definidos na implementação; critérios dependem de OD-03.

#### RF-020 — Remoção de anúncio com item proibido

- **Descrição:** anúncios com itens proibidos devem ser removidos.
- **Prioridade MVP:** obrigatória.
- **Origem:** RB-006.
- **Regra de negócio relacionada:** RB-006.
- **Decisão aberta relacionada:** OD-03 (catálogo), OD-07 (tratamento financeiro das solicitações pagas de anúncio removido), OD-05 e OD-10 (imagens e dados do anúncio removido). Os efeitos do estado sobre as solicitações estão definidos em [listing-lifecycle.md](listing-lifecycle.md).
- **Critério de aceite (alto nível):** anúncio classificado como item proibido vai para `removed`, estado terminal, e não volta a ser público; solicitações pagas existentes são preservadas e a cobrança permanece definitiva (RB-004); o tratamento financeiro de exceção segue OD-07.
- **Status:** parcialmente definido. A regra está vigente; o catálogo não.

### Transversais

#### RF-021 — Email transacional

- **Descrição:** o sistema envia emails transacionais via Resend; o de verificação de email é obrigatório.
- **Prioridade MVP:** obrigatória.
- **Origem:** DEC-015; RF-002.
- **Regra de negócio relacionada:** —
- **Decisão aberta relacionada:** —
- **Critério de aceite (alto nível):** email de verificação entregue; a lista completa de notificações por email (por exemplo, escolha, liberação, encerramento) será definida durante o design de cada fluxo e não deve conter telefone/WhatsApp fora da liberação autorizada.
- **Status:** parcialmente definido.

#### RF-022 — Auditoria das operações críticas

- **Descrição:** operações críticas geram registro de auditoria imutável: liberação de contato (obrigatória por decisão vigente), escolha de solicitante, aprovação de pagamento e decisões de moderação.
- **Prioridade MVP:** obrigatória.
- **Origem:** DEC-023 (auditoria da liberação de contato); [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md).
- **Regra de negócio relacionada:** RB-001, RB-003, RB-004, RB-006.
- **Decisão aberta relacionada:** OD-10 (retenção das trilhas de auditoria).
- **Critério de aceite (alto nível):** cada operação listada registra ator, alvo, instante e resultado; o registro não contém o contato em texto claro fora da própria liberação autorizada.
- **Status:** parcialmente definido. A liberação de contato está definida; a extensão às demais operações é direcionamento derivado e sua retenção depende de OD-10.

## Requisitos não funcionais

#### RNF-001 — Mobile-first

- **Descrição:** a interface é projetada primeiro para smartphones; desktop é adaptação.
- **Prioridade MVP:** obrigatória.
- **Origem:** perfil do público-alvo em [mvp-scope.md](mvp-scope.md); [../adr/0001-modular-monolith-nextjs.md](../adr/0001-modular-monolith-nextjs.md).
- **Critério de aceite (alto nível):** todo fluxo obrigatório do MVP é completável em smartphone sem funcionalidade exclusiva de desktop.
- **Status:** definido.

#### RNF-002 — Responsividade

- **Descrição:** o layout se adapta a diferentes tamanhos de tela sem perda de funcionalidade.
- **Prioridade MVP:** obrigatória.
- **Origem:** RNF-001.
- **Critério de aceite (alto nível):** faixas de viewport a verificar serão definidas antes da Fase 2.
- **Status:** parcialmente definido (métrica a definir).

#### RNF-003 — Desempenho em smartphones

- **Descrição:** carregamento e interação adequados em smartphones do público-alvo.
- **Prioridade MVP:** obrigatória.
- **Origem:** perfil do público-alvo; R-10.
- **Critério de aceite (alto nível):** métricas objetivas (por exemplo, orçamento de JavaScript e tempo de carregamento) serão definidas antes do gate da Fase 5; nenhuma meta numérica está homologada.
- **Status:** parcialmente definido (métrica a definir).

#### RNF-004 — Operação em redes móveis 3G/4G

- **Descrição:** a experiência funciona adequadamente em redes 3G/4G.
- **Prioridade MVP:** obrigatória.
- **Origem:** perfil do público-alvo; R-10.
- **Critério de aceite (alto nível):** fluxos obrigatórios completáveis sob condições de rede 3G/4G simuladas; limiares serão definidos antes do gate da Fase 5.
- **Status:** parcialmente definido (métrica a definir).

#### RNF-005 — Otimização de imagens

- **Descrição:** imagens são otimizadas para entrega em smartphones e redes móveis (dimensionamento, compressão, derivados como miniaturas).
- **Prioridade MVP:** obrigatória.
- **Origem:** [../adr/0003-object-storage-r2.md](../adr/0003-object-storage-r2.md); R-10.
- **Decisão aberta relacionada:** OD-05.
- **Critério de aceite (alto nível):** a definir após OD-05.
- **Status:** parcialmente definido.

#### RNF-006 — PWA

- **Descrição:** a aplicação segue o direcionamento PWA como parte da estratégia mobile.
- **Prioridade MVP:** direcionamento.
- **Origem:** DEC-020 e DEC-021.
- **Critério de aceite (alto nível):** capacidades PWA mínimas a exigir no MVP serão definidas na Fase 5; Web Push não bloqueia o MVP.
- **Status:** parcialmente definido.

#### RNF-007 — Segurança

- **Descrição:** toda regra sensível (autenticação, autorização, liberação de contato, limite de solicitações, pagamentos) é aplicada no servidor; o cliente nunca é confiado para decisões de autorização.
- **Prioridade MVP:** obrigatória.
- **Origem:** [../adr/0001-modular-monolith-nextjs.md](../adr/0001-modular-monolith-nextjs.md); DEC-023.
- **Critério de aceite (alto nível):** revisão reforçada obrigatória para autenticação, autorização, pagamentos e dados ([../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md)); nenhum endpoint libera contato sem verificação server-side.
- **Status:** definido.

#### RNF-008 — Proteção de dados pessoais e minimização

- **Descrição:** dados pessoais são coletados apenas quando necessários; telefone/WhatsApp é dado protegido; localização limitada a cidade/UF.
- **Prioridade MVP:** obrigatória.
- **Origem:** RB-005; DEC-022; DEC-023; R-03; R-06.
- **Critério de aceite (alto nível):** o modelo de dados não contém campos de localização precisa; o contato não transita em logs, caches ou payloads públicos.
- **Status:** definido.

#### RNF-009 — Conformidade com a LGPD

- **Descrição:** o tratamento de dados pessoais segue a LGPD, incluindo base legal, retenção, exclusão e transparência.
- **Prioridade MVP:** obrigatória.
- **Origem:** R-06; OD-10.
- **Decisão aberta relacionada:** OD-10, OD-11.
- **Critério de aceite (alto nível):** política de retenção/exclusão definida e implementada antes de coletar dados reais; exclusão de conta disponível (RF-023).
- **Status:** parcialmente definido.

#### RNF-010 — Acessibilidade

- **Descrição:** a interface é utilizável com tecnologias assistivas e atende a critérios de acessibilidade.
- **Prioridade MVP:** obrigatória.
- **Origem:** roadmap Fase 5 ([../delivery/roadmap.md](../delivery/roadmap.md)).
- **Critério de aceite (alto nível):** nível de conformidade alvo (por exemplo, WCAG 2.1 AA) será definido antes do gate da Fase 5; nenhum nível está homologado.
- **Status:** parcialmente definido (métrica a definir).

#### RNF-011 — Auditoria

- **Descrição:** operações críticas produzem trilha de auditoria consultável e não editável (ver RF-022).
- **Prioridade MVP:** obrigatória.
- **Origem:** DEC-023.
- **Decisão aberta relacionada:** OD-10.
- **Critério de aceite (alto nível):** liberação de contato sempre auditada; retenção conforme OD-10.
- **Status:** parcialmente definido. A auditoria da liberação de contato está definida; a retenção da trilha depende de OD-10.

#### RNF-012 — Disponibilidade

- **Descrição:** a plataforma depende de serviços gerenciados (Vercel, Neon, R2, Resend, gateway) e deve tolerar indisponibilidades pontuais sem corromper estado.
- **Prioridade MVP:** obrigatória.
- **Origem:** R-08; R-09; DEC-011.
- **Critério de aceite (alto nível):** meta de disponibilidade será definida antes do gate da Fase 5; produção comercial não usa o plano Vercel Hobby.
- **Status:** parcialmente definido (métrica a definir).

#### RNF-013 — Manutenibilidade

- **Descrição:** monólito modular com fronteiras claras entre módulos, TypeScript, convenções de código e revisão.
- **Prioridade MVP:** obrigatória.
- **Origem:** [../adr/0001-modular-monolith-nextjs.md](../adr/0001-modular-monolith-nextjs.md).
- **Critério de aceite (alto nível):** convenções registradas em `engineering/conventions.md` (futuro) antes do fim da Fase 1; módulos não acessam dados protegidos de outros módulos sem interface explícita.
- **Status:** definido.

#### RNF-014 — Validação de entradas

- **Descrição:** toda entrada externa (formulários, rotas, webhooks) é validada no servidor antes de uso.
- **Prioridade MVP:** obrigatória.
- **Origem:** RNF-007; R-04.
- **Critério de aceite (alto nível):** entradas inválidas são rejeitadas com erro controlado; webhooks validam origem e assinatura conforme o gateway homologado (OD-08).
- **Status:** definido.

#### RNF-015 — Proteção de segredos

- **Descrição:** credenciais de provedores e chaves nunca são versionadas nem expostas ao cliente.
- **Prioridade MVP:** obrigatória.
- **Origem:** `.gitignore` com `.env*` (fato em [../project-state.md](../project-state.md)); [../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md).
- **Critério de aceite (alto nível):** segredos apenas em variáveis de ambiente por ambiente; nenhum segredo em commit, log ou bundle do cliente.
- **Status:** definido.

#### RNF-016 — Consistência sob concorrência

- **Descrição:** garantias críticas (limite de 3, idempotência de webhook, liberação de contato) apoiam-se em transações e restrições do PostgreSQL.
- **Prioridade MVP:** obrigatória.
- **Origem:** [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md); DEC-019.
- **Critério de aceite (alto nível):** testes de concorrência para RB-003 e para webhooks duplicados na Fase 3.
- **Status:** definido.

#### RNF-017 — Portabilidade de provedores

- **Descrição:** uso de PostgreSQL padrão e API S3-compatible, evitando acoplamento a recursos exclusivos de Neon ou R2 sem decisão registrada.
- **Prioridade MVP:** direcionamento.
- **Origem:** [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md); [../adr/0003-object-storage-r2.md](../adr/0003-object-storage-r2.md); R-08.
- **Critério de aceite (alto nível):** qualquer uso de recurso exclusivo de provedor é registrado em ADR.
- **Status:** definido.

#### RNF-018 — Observabilidade básica

- **Descrição:** logs estruturados e rastreamento de erros suficientes para operar o MVP, sem registrar dados protegidos.
- **Prioridade MVP:** obrigatória.
- **Origem:** roadmap Fase 1; DEC-023 (contato nunca em logs).
- **Critério de aceite (alto nível):** ferramentas e escopo definidos na Fase 1; logs não contêm telefone/WhatsApp nem segredos.
- **Status:** parcialmente definido.

## Rastreabilidade por regra de negócio

| Regra | Requisitos |
| --- | --- |
| RB-001 | RF-005, RF-012, RF-013, RF-014, RF-015, RF-022, RF-023 |
| RB-002 | RF-016, RF-017 |
| RB-003 | RF-008, RF-009, RF-010, RF-012, RF-013, RF-022 |
| RB-004 | RF-009, RF-011, RF-022 |
| RB-005 | RF-004, RF-005, RF-007, RNF-008 |
| RB-006 | RF-004, RF-006, RF-018, RF-019, RF-020, RF-022 |

## Rastreabilidade por decisão aberta

| Decisão aberta | Requisitos afetados |
| --- | --- |
| OD-01 | RF-016, RF-017 |
| OD-02 | RF-017 |
| OD-03 | RF-004, RF-018, RF-019, RF-020 |
| OD-04 | fechada por [listing-lifecycle.md](listing-lifecycle.md) (DEC-027); define estados, transições, visibilidade pública e efeitos sobre interesses e solicitações; deixa de bloquear o modelo de dados do anúncio |
| OD-05 | RF-004, RF-006, RF-020, RNF-005 |
| OD-06 | RF-013, RF-015 |
| OD-07 | RF-009, RF-010, RF-011, RF-012, RF-020 |
| OD-08 | RF-009, RF-011, RF-012, RNF-014 |
| OD-09 | fechada por [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md) (DEC-026); nenhum requisito funcional direto; deixa de bloquear schema e migrations |
| OD-10 | RF-006, RF-020, RF-022, RF-023, RNF-009, RNF-011 |
| OD-11 | RF-001, RNF-009 |
| OD-12 | RF-008 |
