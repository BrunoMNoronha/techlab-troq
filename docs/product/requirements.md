# Catálogo de requisitos — TROQ

Catálogo inicial de requisitos rastreáveis do MVP. Contém **apenas** requisitos derivados das decisões já vigentes na Fase 0 ([../project-state.md](../project-state.md), [business-rules.md](business-rules.md), [listing-lifecycle.md](listing-lifecycle.md), [image-policy.md](image-policy.md), [negotiation-lifecycle.md](negotiation-lifecycle.md), [ratings.md](ratings.md), [prohibited-items.md](prohibited-items.md), [reselection-policy.md](reselection-policy.md), [data-retention-policy.md](data-retention-policy.md), [age-eligibility.md](age-eligibility.md), [interest-flow.md](interest-flow.md), [payment-exceptions.md](payment-exceptions.md), ADRs em [../adr/](../adr/), [../decisions/decision-log.md](../decisions/decision-log.md)). Nenhum requisito aqui fecha uma decisão listada em [../decisions/open-decisions.md](../decisions/open-decisions.md).

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
| Identidade e conta | RF-001 a RF-003, RF-023 | 4 | 0 | 0 |
| Anúncios | RF-004 a RF-007 | 3 | 1 | 0 |
| Solicitações e pagamentos | RF-008 a RF-012 | 5 | 0 | 0 |
| Escolha e contato | RF-013 a RF-015 | 3 | 0 | 0 |
| Encerramento e avaliações | RF-016, RF-017 | 2 | 0 | 0 |
| Denúncia e moderação | RF-018 a RF-020 | 3 | 0 | 0 |
| Transversais | RF-021, RF-022 | 1 | 1 | 0 |
| Não funcionais | RNF-001 a RNF-018 | 11 | 7 | 0 |

Nenhum requisito permanece `bloqueado` e **não há mais decisão aberta**. OD-08 foi fechada por [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036), que homologou o gateway Pix, e OD-07 — a última — foi fechada por [payment-exceptions.md](payment-exceptions.md) (DEC-037), que definiu as exceções de pagamento e levou RF-009, RF-010, RF-011, RF-012 e RF-022 a `definido`. Os requisitos que permanecem `parcialmente definido` dependem apenas de trabalho de design ou de métrica a fixar no gate correspondente: RF-004 (campos do anúncio), RF-021 (catálogo de emails) e os não funcionais sem métrica homologada.

## Requisitos funcionais

### Identidade e conta

#### RF-001 — Cadastro de conta

- **Descrição:** o usuário cria uma conta com email e senha. O cadastro é a porta de entrada dos papéis de anunciante e interessado.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 1) em [mvp-scope.md](mvp-scope.md); decisão Better Auth com email/senha ([../project-state.md](../project-state.md), DEC-012 e DEC-013).
- **Regra de negócio relacionada:** —
- **Decisão aberta relacionada:** — (OD-11 foi fechada por [age-eligibility.md](age-eligibility.md), DEC-034).
- **Critério de aceite (alto nível):** conta criada com email e senha; a conta só é considerada ativa após verificação de email (RF-002); o cadastro exige declaração explícita do usuário de que tem 18 anos completos ou mais, registrada com aceitação, instante e versão dos termos aplicáveis, conforme [age-eligibility.md](age-eligibility.md) (DEC-034); nenhum documento, data de nascimento, selfie, biometria ou serviço externo de verificação etária é usado para essa comprovação.
- **Status:** definido. O público-alvo de 18 a 50 anos **não** é regra de cadastro: a única regra é o piso de 18 anos completos, declaratório, fixado em [age-eligibility.md](age-eligibility.md).

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
- **Decisão aberta relacionada:** — (OD-10 foi fechada por [data-retention-policy.md](data-retention-policy.md), DEC-033).
- **Critério de aceite (alto nível):** a solicitação de exclusão produz efeito imediato — novos logins impedidos, sessões invalidadas quando tecnicamente aplicável, perfil e conteúdo fora da exposição pública, novas operações de produto impedidas e anúncios indisponíveis publicamente; em até 30 dias corridos, nome, email, telefone/WhatsApp, informações de perfil, conteúdo pessoal desnecessário, anúncios, derivados de imagens e dados operacionais sem finalidade são eliminados ou anonimizados, ressalvados os fatos necessários a obrigação legal, prevenção ou investigação de abuso, segurança, defesa de direitos, auditoria e registros financeiros mínimos, conservados no conjunto mínimo e pseudonimizados quando o identificador interno bastar; a auditoria de liberação de contato não conserva telefone/WhatsApp em texto puro após a exclusão.
- **Status:** definido. Prazos, categorias, anonimização, backups e legal hold estão em [data-retention-policy.md](data-retention-policy.md) (DEC-033).

### Anúncios

#### RF-004 — Publicação de anúncio

- **Descrição:** o anunciante publica um anúncio com título, descrição, imagens e localização pública limitada a cidade/UF.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 2); capacidade obrigatória em [mvp-scope.md](mvp-scope.md).
- **Regra de negócio relacionada:** RB-005, RB-006.
- **Decisão aberta relacionada:** — (OD-03 fechada por [prohibited-items.md](prohibited-items.md), DEC-031; OD-04 por [listing-lifecycle.md](listing-lifecycle.md), DEC-027; OD-05 por [image-policy.md](image-policy.md), DEC-028).
- **Critério de aceite (alto nível):** anúncio criado por usuário autenticado e verificado; nenhum dado de localização mais preciso que cidade/UF é armazenado ou exibido publicamente; o anúncio nasce no estado `draft` e só se torna público por publicação explícita do anunciante, conforme [listing-lifecycle.md](listing-lifecycle.md); a publicação exige pelo menos uma imagem processada com sucesso, conforme [image-policy.md](image-policy.md); a publicação exige também a aceitação expressa da declaração de conformidade com [prohibited-items.md](prohibited-items.md) (DEC-031), registrada com instante, e admite validações preventivas apenas auxiliares, sem que um bloqueio preventivo constitua infração ou conte para reincidência.
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

- **Descrição:** o anunciante envia imagens do anúncio, armazenadas no Cloudflare R2 via API S3-compatible; os derivados processados são servidos publicamente conforme [image-policy.md](image-policy.md).
- **Prioridade MVP:** obrigatória.
- **Origem:** [../adr/0003-object-storage-r2.md](../adr/0003-object-storage-r2.md) (DEC-014); [image-policy.md](image-policy.md) (DEC-028).
- **Regra de negócio relacionada:** RB-006 (remoção do anúncio implica tratamento das imagens; critérios de remoção em [prohibited-items.md](prohibited-items.md), DEC-031).
- **Decisão aberta relacionada:** — (OD-05 foi fechada por [image-policy.md](image-policy.md), DEC-028, e OD-10 por [data-retention-policy.md](data-retention-policy.md), DEC-033). O efeito do estado do anúncio sobre as imagens está definido em [listing-lifecycle.md](listing-lifecycle.md): imagens deixam de ser servidas publicamente junto com o anúncio; o expurgo definitivo dos objetos está definido em [data-retention-policy.md](data-retention-policy.md) (DEC-033).
- **Critério de aceite (alto nível):** de 1 a 6 imagens por anúncio, com pelo menos uma imagem processada com sucesso para publicar e a primeira da ordenação como capa; entrada restrita a JPEG, PNG e WebP estático, com no máximo 10 MB, no mínimo 320 px por lado e no máximo 50 megapixels; upload direto ao R2 por operação S3-compatible de curta duração autorizada server-side, sem trafegar o binário por Vercel Function; validação por conteúdo com decodificação efetiva, chave gerada pela aplicação, regravação da imagem e remoção de EXIF/GPS após auto-orientação; derivados públicos `thumb` 320 px, `medium` 768 px e `large` 1600 px em WebP qualidade 80, sem ampliação; original temporário nunca público e limpo em no máximo 24 horas; imagens deixam de ser servidas publicamente quando o anúncio sai de `published`; após a exclusão da conta ou o expurgo definitivo do anúncio, as imagens deixam de ser públicas imediatamente e os objetos persistentes são removidos em até 30 dias, quando não houver retenção legitimamente necessária ([data-retention-policy.md](data-retention-policy.md), DEC-033); imagens nunca contêm dados protegidos em objetos públicos.
- **Status:** definido. Upload, validação e processamento estão em [image-policy.md](image-policy.md) (DEC-028); a retenção e o expurgo definitivo dos derivados persistidos estão em [data-retention-policy.md](data-retention-policy.md) (DEC-033).

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

- **Descrição:** o interessado indica interesse em um anúncio; a ação é gratuita, de interface, e inicia o fluxo da solicitação paga de desbloqueio, sem constituir entidade persistida independente ([interest-flow.md](interest-flow.md), DEC-035).
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 3).
- **Regra de negócio relacionada:** RB-003.
- **Decisão aberta relacionada:** — (OD-12 foi fechada por [interest-flow.md](interest-flow.md), DEC-035; OD-04 por [listing-lifecycle.md](listing-lifecycle.md), DEC-027).
- **Critério de aceite (alto nível):** a ação exige usuário autenticado, com email verificado, em anúncio no estado `published`, e é rejeitada no servidor em qualquer outro estado sem revelar existência nem estado anterior do anúncio; a ação é gratuita, não libera contato, não ocupa uma das três vagas pagas (RB-003), não cria entidade `Interest` e não cria registro funcional visível ao anunciante; não existe cancelamento de interesse, pois não há entidade persistida — o usuário apenas abandona o fluxo; o anunciante não vê quem apenas demonstrou interesse, não é notificado desse evento e não recebe lista nem contador individualizado; admite-se telemetria agregada de funil, desde que não constitua entidade funcional nem exponha identidade desnecessariamente.
- **Status:** definido. A natureza, a gratuidade, a ausência de persistência e de cancelamento e a invisibilidade ao anunciante estão em [interest-flow.md](interest-flow.md) (DEC-035). A persistência funcional começa na solicitação de desbloqueio (RF-009).

#### RF-009 — Solicitação paga de desbloqueio de contato

- **Descrição:** o interessado solicita o desbloqueio de contato de um anúncio; a solicitação só passa a contar como paga após aprovação do pagamento de R$ 0,99.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passos 4 e 5); capacidade obrigatória em [mvp-scope.md](mvp-scope.md).
- **Regra de negócio relacionada:** RB-003, RB-004.
- **Decisão aberta relacionada:** — (OD-07 foi fechada por [payment-exceptions.md](payment-exceptions.md), DEC-037; OD-08 por [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), DEC-036).
- **Critério de aceite (alto nível):** o solicitante só é elegível à escolha (RF-013) com pagamento aprovado; a solicitação não paga ou expirada não ocupa vaga; a solicitação só é paga válida quando existe um pagamento canônico acreditado dentro da janela da reserva que ela detinha, apurado contra o estado autoritativo do gateway; pagamento acreditado que não possa produzir solicitação paga válida não cria solicitação, não consome vaga e vai para reembolso técnico ([payment-exceptions.md](payment-exceptions.md), DEC-037).
- **Status:** definido.

#### RF-010 — Reserva de vaga e limite de 3 solicitações pagas

- **Descrição:** cada anúncio aceita no máximo 3 solicitações pagas, garantido mesmo sob concorrência. Direcionamento vigente: reserva atômica de vaga antes da cobrança, com expiração.
- **Prioridade MVP:** obrigatória.
- **Origem:** RB-003; DEC-019; [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md) (garantias via transações e restrições do banco).
- **Regra de negócio relacionada:** RB-003.
- **Decisão aberta relacionada:** — (OD-07 foi fechada por [payment-exceptions.md](payment-exceptions.md), DEC-037).
- **Critério de aceite (alto nível):** a quarta tentativa de solicitação paga é recusada; solicitações concorrentes nunca resultam em mais de 3 pagas; vaga reservada e não paga expira e é liberada; a janela de reserva tem duração mínima de 30 minutos e o `expiration_time` da cobrança no gateway não a excede; a validação da tempestividade não é delegada ao gateway; não há prorrogação automática da janela, inclusive em indisponibilidade do provedor; vaga consumida por solicitação paga válida é fato histórico e não é devolvida por reversão posterior ([payment-exceptions.md](payment-exceptions.md), DEC-037).
- **Status:** definido. O trabalho de design foi concluído por F0-022: a janela de reserva é de **exatamente 30 minutos** ([../architecture/payments-design.md](../architecture/payments-design.md), PD-3.1) e o mecanismo atômico é o **índice único parcial** sobre a vaga do anúncio, com alocação sob trava de escopo de transação e expiração resolvida na própria transação que aloca ([../architecture/data-model.md](../architecture/data-model.md), DM-6).

#### RF-011 — Cobrança de R$ 0,99 via Pix

- **Descrição:** a solicitação paga é cobrada em exatamente R$ 0,99 via Pix. A cobrança é definitiva mesmo se o solicitante não for escolhido.
- **Prioridade MVP:** obrigatória.
- **Origem:** RB-004; DEC-016 (Pix-first); DEC-018 (spike obrigatório, satisfeito por F0-010); DEC-036 e [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (gateway homologado).
- **Regra de negócio relacionada:** RB-004.
- **Decisão aberta relacionada:** — (OD-07 foi fechada por [payment-exceptions.md](payment-exceptions.md), DEC-037; OD-08 por [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), DEC-036).
- **Critério de aceite (alto nível):** o valor cobrado é exatamente R$ 0,99, sem ajuste; não há reembolso por não escolha; a cobrança é criada no Mercado Pago por Checkout Transparente via Orders API, com Pix, credenciais apenas server-side e `X-Idempotency-Key`; uma mesma tentativa lógica nunca gera duas cobranças; cobrança que nunca deveria ter se tornado solicitação paga válida é devolvida integralmente por reembolso técnico, cujas hipóteses são exaustivas ([payment-exceptions.md](payment-exceptions.md), DEC-037).
- **Status:** definido.

#### RF-012 — Confirmação de pagamento, webhook e idempotência

- **Descrição:** o sistema recebe a confirmação de pagamento do gateway (webhook) e atualiza o estado da solicitação de forma idempotente e reconciliável.
- **Prioridade MVP:** obrigatória.
- **Origem:** DEC-018 (spike deve provar confirmação, webhook e idempotência), satisfeita por F0-010; DEC-036 e [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md); R-04 em [../delivery/risks.md](../delivery/risks.md).
- **Regra de negócio relacionada:** RB-001 (pagamento aprovado é pré-condição da liberação), RB-003.
- **Decisão aberta relacionada:** — (OD-07 foi fechada por [payment-exceptions.md](payment-exceptions.md), DEC-037; OD-08 por [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), DEC-036).
- **Critério de aceite (alto nível):** a notificação do tópico `order` tem autenticidade validada **antes** de qualquer processamento, por uma única regra oficial de manifesto HMAC, sem fallback entre variantes e sem remontar o manifesto a partir do corpo; webhook duplicado, fora de ordem ou perdido não gera estado inconsistente; o estado é reconciliável contra o provedor por consulta à order; contato nunca é liberado sem pagamento aprovado registrado; a notificação é apenas gatilho e nunca fonte de estado, de modo que o estado deve ser reconstruível sem nenhuma notificação; somente o estado autoritativo que represente pagamento efetivamente acreditado produz efeito de negócio, e estado incerto ou não mapeado nunca é resolvido a favor da aprovação; confirmação atrasada de pagamento tempestivo vale pelo instante de acreditação; falha de persistência local é retomada na mesma operação, sem recobrar e sem criar cobrança nova ([payment-exceptions.md](payment-exceptions.md), DEC-037).
- **Status:** definido.

### Escolha e contato

#### RF-013 — Escolha do solicitante pelo anunciante

- **Descrição:** o anunciante escolhe uma solicitação entre as solicitações pagas do seu anúncio.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 7); capacidade obrigatória em [mvp-scope.md](mvp-scope.md).
- **Regra de negócio relacionada:** RB-001, RB-003.
- **Decisão aberta relacionada:** — (OD-06 foi fechada por [reselection-policy.md](reselection-policy.md), DEC-032).
- **Critério de aceite (alto nível):** apenas o anunciante do anúncio pode escolher; só solicitações com pagamento aprovado são elegíveis; a escolha é registrada em auditoria (RF-022); a reseleção é permitida e exige simultaneamente escolha anterior existente, negociação anterior `closed`, anúncio atualmente `published`, candidato com pagamento aprovado e candidato ainda não selecionado antes nesse anúncio, além de confirmação explícita do anunciante, sem reseleção automática; cada solicitação paga pode ser escolhida no máximo uma vez, de modo que no máximo três pessoas são escolhidas sequencialmente no ciclo do anúncio, sem criar vaga, sem reiniciar o limite de RB-003 e sem permitir uma quarta solicitação paga; nunca há mais de uma negociação `active` originada por escolhas sequenciais do mesmo anúncio ao mesmo tempo; a escolha anterior e a liberação já concedida permanecem imutáveis.
- **Status:** definido. Pré-condições, limites, efeitos e tratamento da desistência estão em [reselection-policy.md](reselection-policy.md) (DEC-032).

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
- **Decisão aberta relacionada:** — (OD-06 foi fechada por [reselection-policy.md](reselection-policy.md), DEC-032).
- **Critério de aceite (alto nível):** a liberação exige as duas condições simultâneas (escolhido e pagamento aprovado) verificadas no servidor; cada liberação gera registro de auditoria com quem, quando e para qual solicitação; uma liberação já concedida nunca é revogada, apagada ou revertida, inclusive em caso de desistência e reseleção, e cada nova escolha gera uma nova autorização independente, igualmente sujeita a RB-001 e auditada ([reselection-policy.md](reselection-policy.md), DEC-032); a retenção da trilha é de 24 meses a partir da liberação ([data-retention-policy.md](data-retention-policy.md), DEC-033).
- **Status:** definido. A forma de apresentação do contato ao escolhido é detalhe de implementação.

### Encerramento e avaliações

#### RF-016 — Encerramento da negociação

- **Descrição:** a negociação pode ser encerrada no sistema; o encerramento é pré-condição das avaliações.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 9); RB-002.
- **Regra de negócio relacionada:** RB-002.
- **Decisão aberta relacionada:** — (OD-01 foi fechada por [negotiation-lifecycle.md](negotiation-lifecycle.md), DEC-029).
- **Critério de aceite (alto nível):** existe negociação `active` somente para a relação válida entre o anunciante e o solicitante escolhido daquele anúncio, criada quando a escolha ocorre e a liberação de contato fica autorizada por RB-001; qualquer um dos dois participantes pode encerrá-la; o encerramento exige confirmação explícita do próprio ator que executa a ação, sem aceite da contraparte; a transição `active -> closed` é unilateral e imediata; `closed` é terminal e irreversível, sem `closed -> active`; não existe timeout, expiração nem autoencerramento por inatividade; a autorização é verificada server-side e a tentativa de quem não participa da negociação é rejeitada; repetir a intenção sobre negociação já `closed` é idempotente e não cria nova transição de negócio; cada encerramento gera registro de auditoria (RF-022) com negociação, ator, instante, estado anterior, estado resultante e resultado, sem telefone/WhatsApp; nenhuma avaliação pode ser registrada enquanto a negociação estiver `active`.
- **Status:** definido. Estados, atores, transição, irreversibilidade e efeitos estão em [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029). O encerramento **não** significa que a troca foi bem-sucedida e **não** registra motivo ou resultado.

#### RF-017 — Avaliações

- **Descrição:** após o encerramento da negociação no sistema, avaliações são permitidas.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 10); RB-002.
- **Regra de negócio relacionada:** RB-002.
- **Decisão aberta relacionada:** — (OD-02 foi fechada por [ratings.md](ratings.md), DEC-030).
- **Critério de aceite (alto nível):** nenhuma avaliação é aceita enquanto a negociação estiver `active`; uma negociação `closed` conforme [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029) é pré-condição necessária, não suficiente; a avaliação é sobre a contraparte da negociação e somente o anunciante e o solicitante escolhido daquela negociação podem avaliar um ao outro, com autoavaliação e terceiros rejeitados; existe no máximo uma avaliação por direção e, portanto, no máximo duas por negociação; a avaliação contém exatamente uma nota inteira de 1 a 5, sem texto livre, título, imagens, subnotas, tags, resposta pública ou réplica; a submissão é válida apenas dentro de 14 dias corridos a partir da transição para `closed`, sem extensão automática; a publicação é cega e bilateral, de modo que a nota não é revelada à contraparte antes de ambas submeterem ou do fim da janela, com publicação simultânea quando a segunda submissão válida é aceita; a ausência de avaliação não gera nota automática; o autor pode substituir sua nota enquanto estiver dentro da janela e não publicada, e a avaliação publicada é imutável pelo usuário; a reputação pública é a média aritmética simples das notas publicadas e válidas recebidas, exibida com uma casa decimal, acompanhada da quantidade de avaliações válidas, somando os papéis de anunciante e solicitante, sem vincular publicamente a nota individual ao avaliador ou à negociação; a autorização é verificada server-side; a invalidação administrativa por abuso remove a avaliação integralmente da média e da contagem e é auditada (RF-022), e nota baixa ou discordância, isoladamente, não a justificam; o estado do anúncio não altera a elegibilidade.
- **Status:** definido. Elegibilidade, formato, janela, publicação cega, edição, imutabilidade, agregação e tratamento de abuso estão em [ratings.md](ratings.md) (DEC-030).

### Denúncia e moderação

#### RF-018 — Denúncia de anúncio

- **Descrição:** usuários autenticados podem denunciar anúncios que violem a política de itens proibidos.
- **Prioridade MVP:** obrigatória.
- **Origem:** fluxo central (passo 11); RB-006; [prohibited-items.md](prohibited-items.md) (DEC-031).
- **Regra de negócio relacionada:** RB-006.
- **Decisão aberta relacionada:** — (OD-03 fechada por [prohibited-items.md](prohibited-items.md), DEC-031).
- **Critério de aceite (alto nível):** somente usuário autenticado e com email verificado pode denunciar, não havendo denúncia anônima no MVP; a denúncia identifica um anúncio e é única por par (denunciante, anúncio), de modo que uma segunda tentativa do mesmo usuário sobre o mesmo anúncio é aceita de forma idempotente sem criar nova denúncia; o motivo é obrigatório e corresponde a exatamente uma categoria de lista fechada derivada do catálogo PI-01 a PI-12, mais a opção `outro`; existe um campo único de texto complementar opcional limitado a 500 caracteres; a denúncia nasce no estado `recebida` e está associada ao anúncio e ao denunciante; o denunciante recebe confirmação imediata de registro, sem promessa de resultado; a identidade do denunciante nunca é revelada ao anunciante, não aparece em payload público nem em cache público e não é exposta na contestação; a coleta é mínima, limitada a anúncio, denunciante, categoria, texto opcional, instante e estado; o antiabuso usa a regra de unicidade, limite de volume por usuário por janela de tempo e restrição administrativa auditada do canal em caso de denúncias reiteradamente improcedentes e manifestamente abusivas, sem que uma denúncia improcedente isolada caracterize abuso; registrar denúncia não altera o estado do anúncio, não o retira da consulta pública e não interrompe interesses, solicitações, pagamentos, escolha ou negociação; o anunciante não é notificado da existência da denúncia; o registro é auditado (RF-022).
- **Status:** definido.

#### RF-019 — Moderação

- **Descrição:** existe um caminho de moderação que analisa denúncias e decide sobre a manutenção ou remoção de anúncios.
- **Prioridade MVP:** obrigatória.
- **Origem:** RB-006; R-05.
- **Regra de negócio relacionada:** RB-006.
- **Decisão aberta relacionada:** — (OD-03 fechada por [prohibited-items.md](prohibited-items.md), DEC-031). O estado `removed` e suas transições estão definidos em [listing-lifecycle.md](listing-lifecycle.md) (DEC-027).
- **Critério de aceite (alto nível):** a denúncia é decidida em exatamente um de três estados terminais — `procedente`, `improcedente` ou `sem_acao`, este último para duplicada ou anúncio já `removed` —, a partir do estado inicial `recebida`, sem estado intermediário de análise, sem fila priorizada, sem SLA empresarial, sem escalonamento e com um único perfil de moderação; o moderador pode apenas ler denúncias e anúncios denunciados inclusive não públicos, decidir a denúncia com motivo registrado, remover o anúncio como efeito de decisão `procedente` ou de ofício, aplicar advertência, restrição temporária ou bloqueio administrativo, decidir contestações e restringir o canal de denúncia de usuário abusivo; o moderador não pode editar conteúdo de anúncio, ajustar nota de avaliação, cancelar pagamento, gerar reembolso, revogar liberação de contato já autorizada, restaurar anúncio removido, acessar telefone/WhatsApp fora do previsto por DEC-023 nem alterar o estado da negociação; a moderação pode agir de ofício, registrando a origem do conhecimento; em caso ambíguo, dúvida material razoável em categoria de alto risco leva à remoção com motivo expresso e dúvida fora de alto risco leva à manutenção com decisão improcedente, sem que o moderador produza análise jurídica ou exija documento do anunciante; o prazo de decisão é de 24 horas corridas na classe crítica e de 5 dias úteis na classe comum, contados do registro da denúncia ou do conhecimento de ofício, sem compromisso de operação 24x7, com classe determinada pela categoria informada e medição derivada da trilha de auditoria; a reincidência segue advertência na primeira decisão procedente, restrição de publicação de 7 dias corridos na segunda e bloqueio administrativo a partir da terceira, com bloqueio imediato em casos graves; existe contestação administrativa, uma por decisão, em 7 dias corridos, decidida em 5 dias úteis, sem anexo documental, sem efeito suspensivo e sem restauração automática; a decisão `procedente` é comunicada ao anunciante com a categoria aplicada e a possibilidade de contestar, sem identificar o denunciante; toda decisão, sanção e contestação é registrada em auditoria com ator, alvo, instante, ação, motivo/categoria e resultado (RF-022); a moderação leva o anúncio de `draft`, `published` ou `paused` para `removed`, que é terminal, e anúncio removido deixa de ser consultável e não autoriza nova escolha nem nova liberação de contato.
- **Status:** definido. Perfil único de moderação, poderes, estados da denúncia, critérios, prazos, reincidência e contestação estão definidos em [prohibited-items.md](prohibited-items.md); ferramentas e painel administrativo são detalhe de implementação, não decisão aberta.

#### RF-020 — Remoção de anúncio com item proibido

- **Descrição:** anúncios com itens proibidos devem ser removidos.
- **Prioridade MVP:** obrigatória.
- **Origem:** RB-006.
- **Regra de negócio relacionada:** RB-006.
- **Decisão aberta relacionada:** — (OD-07 foi fechada por [payment-exceptions.md](payment-exceptions.md), DEC-037, que confirma não haver reembolso pela remoção do anúncio). OD-10 foi fechada por [data-retention-policy.md](data-retention-policy.md) (DEC-033), que define a retenção e o expurgo dos dados e derivados de imagem do anúncio removido. OD-03 foi fechada por [prohibited-items.md](prohibited-items.md) (DEC-031), que define o catálogo e os critérios. Os efeitos do estado sobre as solicitações estão definidos em [listing-lifecycle.md](listing-lifecycle.md); os efeitos sobre as imagens estão definidos em [image-policy.md](image-policy.md) (DEC-028), que fechou OD-05.
- **Critério de aceite (alto nível):** a remoção ocorre quando, e somente quando, uma denúncia é decidida como `procedente`, a moderação conclui de ofício que o anúncio viola [prohibited-items.md](prohibited-items.md), ou há dúvida material razoável em categoria de alto risco; nota baixa, discordância entre usuários, negociação malsucedida, denúncia improcedente, denúncia não analisada, suspeita fraca fora de alto risco e bloqueio preventivo na publicação não geram remoção; a classificação usa o catálogo por categorias PI-01 a PI-12, com distinção registrada entre item ilegal, item externamente regulado e item proibido por decisão de produto, e a ausência de um item na lista não o torna permitido; o anúncio vai para `removed`, estado terminal, e não volta a ser público, deixando imediatamente de ser servido em qualquer superfície pública, inclusive caches, junto com suas imagens conforme [image-policy.md](image-policy.md); os dados do anúncio, o motivo, o moderador e o instante são preservados para auditoria e para o direito de contestação; não há interesse persistido a preservar, por não ser entidade ([interest-flow.md](interest-flow.md), DEC-035), e solicitações não pagas são encerradas sem cobrança com liberação da vaga reservada; solicitações pagas existentes são preservadas e a cobrança permanece definitiva (RB-004), sem qualquer reembolso, estorno, crédito ou compensação criado por esta remoção, e o tratamento financeiro de exceção segue [payment-exceptions.md](payment-exceptions.md) (DEC-037), que não cria reembolso nesta hipótese; o limite de RB-003 não é reiniciado nem devolvido; a liberação de contato já autorizada não é revogada e nenhuma nova escolha ou liberação é autorizada; a negociação existente permanece inalterada e seu encerramento continua exclusivo das partes (DEC-029); republicar conteúdo substancialmente equivalente ao removido é nova violação, salvo autorização expressa decorrente de contestação `revista`; a remoção é auditada com ator, alvo, instante, ação, motivo/categoria e resultado (RF-022).
- **Status:** definido. Os critérios e o catálogo estão em [prohibited-items.md](prohibited-items.md), a retenção/expurgo em [data-retention-policy.md](data-retention-policy.md) (DEC-033) e o tratamento financeiro de exceção em [payment-exceptions.md](payment-exceptions.md) (DEC-037), que confirma a ausência de reembolso pela remoção.

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

- **Descrição:** operações críticas geram registro de auditoria imutável: liberação de contato (obrigatória por decisão vigente), escolha de solicitante, aprovação de pagamento, encerramento da negociação (DEC-029), invalidação administrativa de avaliação (DEC-030) e os eventos administrativos de itens proibidos (DEC-031): registro e decisão de denúncia, remoção administrativa inclusive de ofício, advertência, restrição temporária, bloqueio administrativo, restrição do canal de denúncia, registro e decisão de contestação e aceitação da declaração de conformidade na publicação.
- **Prioridade MVP:** obrigatória.
- **Origem:** DEC-023 (auditoria da liberação de contato); [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md).
- **Regra de negócio relacionada:** RB-001, RB-002, RB-003, RB-004, RB-006.
- **Decisão aberta relacionada:** — (OD-07 foi fechada por [payment-exceptions.md](payment-exceptions.md), DEC-037, que enumera os eventos auditados do pagamento; OD-08 por [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md), DEC-036). A retenção das trilhas foi definida por [data-retention-policy.md](data-retention-policy.md) (DEC-033).
- **Critério de aceite (alto nível):** cada operação listada registra ator, alvo, instante e resultado; o encerramento da negociação registra ainda estado anterior e estado resultante (`active` -> `closed`); a invalidação administrativa de avaliação registra ator administrativo, avaliação, negociação, instante e motivo ([ratings.md](ratings.md), DEC-030); cada evento administrativo de itens proibidos registra ator, alvo, instante, ação, motivo/categoria e resultado, com indicação expressa quando a decisão se der por dúvida material em categoria de alto risco ([prohibited-items.md](prohibited-items.md), DEC-031); cada escolha e cada reseleção são auditadas independentemente ([reselection-policy.md](reselection-policy.md), DEC-032); o registro não contém o contato em texto claro fora da própria liberação autorizada; a trilha é retida por 24 meses a partir do evento e, após a exclusão da conta, não conserva telefone/WhatsApp em texto puro ([data-retention-policy.md](data-retention-policy.md), DEC-033).
- **Status:** definido. A liberação de contato, a escolha e a reseleção, o encerramento da negociação, a invalidação administrativa de avaliação, os eventos administrativos de denúncia, moderação, sanção e contestação e a retenção das trilhas já estavam definidos; a extensão à aprovação de pagamento e às demais exceções financeiras está definida em [payment-exceptions.md](payment-exceptions.md) (DEC-037), que enumera criação da tentativa, aprovação, recusa, expiração, duplicidade, reembolso técnico, reembolso pendente, reversão externa, inconsistência e rejeição de notificação por autenticidade.

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

- **Descrição:** imagens são otimizadas para entrega em smartphones e redes móveis (dimensionamento, compressão, derivados e remoção de metadados), conforme [image-policy.md](image-policy.md).
- **Prioridade MVP:** obrigatória.
- **Origem:** [../adr/0003-object-storage-r2.md](../adr/0003-object-storage-r2.md); [image-policy.md](image-policy.md) (DEC-028); R-10.
- **Decisão aberta relacionada:** — (OD-05 fechada por [image-policy.md](image-policy.md), DEC-028).
- **Critério de aceite (alto nível):** toda imagem publicada é servida por derivados `thumb` (lado maior máximo de 320 px), `medium` (768 px) e `large` (1600 px); o formato público é WebP com qualidade 80; os derivados preservam a proporção e nunca ampliam a imagem original; EXIF e demais metadados desnecessários, incluindo GPS, são removidos; o derivado entregue corresponde ao viewport, priorizando o uso mobile; imagens não necessárias à primeira visualização permanecem sujeitas a lazy loading na implementação; os derivados expõem dimensões conhecidas, permitindo reservar espaço e evitar layout shift.
- **Status:** definido. Metas numéricas de desempenho (LCP, bytes por página, tempo de carregamento) não pertencem a este requisito e seguem no gate de performance (RNF-003, RNF-004).

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
- **Decisão aberta relacionada:** — (OD-10 foi fechada por [data-retention-policy.md](data-retention-policy.md), DEC-033, e OD-11 por [age-eligibility.md](age-eligibility.md), DEC-034).
- **Critério de aceite (alto nível):** a política de retenção e exclusão de [data-retention-policy.md](data-retention-policy.md) está definida e deve estar implementada antes de coletar dados reais, com prazos expressos por categoria e sem retenção indefinida genérica; exclusão de conta disponível com efeito imediato e eliminação ou anonimização em até 30 dias (RF-023); elegibilidade de 18 anos completos ou mais por declaração contratual, sem coleta de documento ou biometria para essa finalidade ([age-eligibility.md](age-eligibility.md), DEC-034).
- **Status:** definido. O período e o conjunto mínimo de registros financeiros ainda deverão ser revisados por responsável jurídico e contábil antes da produção comercial, conforme registrado em [data-retention-policy.md](data-retention-policy.md); essa revisão não é decisão aberta deste catálogo.

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
- **Decisão aberta relacionada:** — (OD-10 foi fechada por [data-retention-policy.md](data-retention-policy.md), DEC-033).
- **Critério de aceite (alto nível):** liberação de contato sempre auditada; a trilha é imutável e não editável, retida por 24 meses a partir do evento e, ao fim do prazo, eliminada ou pseudonimizada de forma registrada, nunca editada ([data-retention-policy.md](data-retention-policy.md), DEC-033).
- **Status:** definido.

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
- **Critério de aceite (alto nível):** entradas inválidas são rejeitadas com erro controlado; webhooks validam origem e assinatura conforme o gateway homologado em [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036), por uma única regra oficial de manifesto HMAC, sem fallback entre variantes.
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
| RB-002 | RF-016, RF-017, RF-022 |
| RB-003 | RF-008, RF-009, RF-010, RF-012, RF-013, RF-022 |
| RB-004 | RF-009, RF-011, RF-022 |
| RB-005 | RF-004, RF-005, RF-007, RNF-008 |
| RB-006 | RF-004, RF-006, RF-018, RF-019, RF-020, RF-021, RF-022 |

## Rastreabilidade por decisão aberta

| Decisão aberta | Requisitos afetados |
| --- | --- |
| OD-01 | fechada por [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029); define estados `active`/`closed`, atores autorizados, encerramento unilateral, irreversibilidade, ausência de timeout, idempotência e auditoria; deixa de bloquear RF-016, que passa a `definido`, e sai de RF-017 |
| OD-02 | fechada por [ratings.md](ratings.md) (DEC-030); define natureza bilateral, elegibilidade, nota 1–5 sem texto livre, janela de 14 dias corridos, publicação cega, edição antes da publicação, imutabilidade após a publicação, média simples com contagem e invalidação administrativa auditada; deixa de bloquear RF-017, que passa a `definido` |
| OD-03 | fechada por [prohibited-items.md](prohibited-items.md) (DEC-031); define o catálogo por categorias PI-01 a PI-12 com distinção entre item ilegal, regulado e proibido por decisão de produto, a ausência de fluxo de autorização documental no MVP, a regra de casos ambíguos, a declaração de conformidade na publicação, o fluxo de denúncia, o fluxo de moderação, os critérios e efeitos da remoção, os prazos de decisão, a reincidência, a contestação, a auditoria e a privacidade do denunciante; deixa de bloquear RF-018, RF-019 e RF-020, que passam a `definido`, sai de RF-004 e estende RF-022 |
| OD-04 | fechada por [listing-lifecycle.md](listing-lifecycle.md) (DEC-027); define estados, transições, visibilidade pública e efeitos sobre interesses e solicitações; deixa de bloquear o modelo de dados do anúncio |
| OD-05 | fechada por [image-policy.md](image-policy.md) (DEC-028); define quantidade, formatos, limites, validação, processamento, derivados e visibilidade das imagens; deixa de bloquear RF-006 e define os critérios de RNF-005 |
| OD-06 | fechada por [reselection-policy.md](reselection-policy.md) (DEC-032); define as cinco pré-condições da reseleção, a confirmação explícita do anunciante, a imutabilidade da escolha anterior e da liberação já concedida, a criação de nova negociação e nova autorização auditada, a exclusividade da negociação `active`, a preservação literal de RB-003 e o tratamento da desistência; deixa de bloquear RF-013, que passa a `definido`, e sai de RF-015 |
| OD-07 | fechada por [payment-exceptions.md](payment-exceptions.md) (DEC-037); define fonte de verdade do pagamento, identidade e idempotência da tentativa, tratamento da duplicidade técnica, o instante de acreditação como critério de tempestividade, o piso de 30 minutos da janela de reserva, a preservação de RB-003 sob concorrência, o comportamento diante de assinatura inválida, notificação duplicada, notificação perdida, falha de persistência e indisponibilidade de consulta, as quatro hipóteses exaustivas de reembolso técnico, a distinção entre reembolso técnico, devolução Pix, MED e chargeback de cartão, os efeitos das reversões sobre elegibilidade, auditoria e vaga, a reconciliação autoritativa e os eventos auditados; deixa RF-009, RF-010, RF-011, RF-012 e RF-022 `definido` e remove a lacuna financeira de RF-020 |
| OD-08 | fechada por [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036); homologa o Mercado Pago como gateway Pix inicial do MVP, por Checkout Transparente via Orders API, com Pix, cobrança de exatamente R$ 0,99, credenciais apenas server-side, `X-Idempotency-Key` na criação, validação de autenticidade antes do processamento por uma única regra oficial de manifesto HMAC, webhook configurado no nível da aplicação e processamento idempotente e reconciliável; deixa de bloquear RF-011 e RF-012, que passam a `parcialmente definido` por OD-07, e sai de RF-009, RF-022 e RNF-014 |
| OD-09 | fechada por [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md) (DEC-026); nenhum requisito funcional direto; deixa de bloquear schema e migrations |
| OD-10 | fechada por [data-retention-policy.md](data-retention-policy.md) (DEC-033); define retenção por categoria, exclusão de conta com efeito imediato e prazo de 30 dias, expurgo de imagens, 6 meses de log de acesso, 24 meses de auditoria e de registros de moderação e abuso, 5 anos de metadados financeiros, backups limitados ao ciclo normal com máximo de 30 dias adicionais e legal hold registrado; deixa de bloquear RF-023 e RF-006, que passam a `definido`, leva RNF-009 e RNF-011 a `definido` e sai de RF-020 e de RF-022 |
| OD-11 | fechada por [age-eligibility.md](age-eligibility.md) (DEC-034); define 18 anos completos ou mais como decisão de escopo do produto, declaração explícita registrada no cadastro, ausência de coleta documental ou biométrica para comprovação etária e bloqueio cautelar diante de evidência razoável de menoridade; deixa de bloquear RF-001, que passa a `definido`, e sai de RNF-009 |
| OD-12 | fechada por [interest-flow.md](interest-flow.md) (DEC-035); define a demonstração de interesse como ação gratuita de interface, sem entidade persistida, sem cancelamento e sem visibilidade ao anunciante, admitindo apenas telemetria agregada de funil; deixa de bloquear RF-008, que passa a `definido` |
