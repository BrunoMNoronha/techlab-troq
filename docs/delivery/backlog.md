# Backlog da Fase 0 — TROQ

Backlog de **alto nível** da Fase 0 (Descoberta e definição) e do caminho de execução até a transição para a Fase 1. Este documento **não** é o backlog técnico da aplicação: tarefas de implementação das fases seguintes são detalhadas no backlog da fase correspondente ([roadmap.md](roadmap.md)).

**A Fase 0 está concluída desde 2026-09-14.** Todos os itens abaixo estão `concluído`; o último foi F0-023, que verificou o gate de saída em [phase-1-transition.md](phase-1-transition.md). Este backlog passa a ser registro histórico da fase.

Fontes: [roadmap.md](roadmap.md), [../decisions/open-decisions.md](../decisions/open-decisions.md), [../decisions/decision-log.md](../decisions/decision-log.md), [../product/requirements.md](../product/requirements.md), [risks.md](risks.md).

## Convenções

- IDs `F0-xxx`, sequenciais, nunca reutilizados.
- **Estados:** `concluído`, `próximo` (o próximo trabalho a executar), `pendente` (pode ser executado assim que houver capacidade, sem bloqueio) e `bloqueado` (depende de outro item ainda não concluído).
- Cada item resulta em documento versionado ou em decisão registrada em [../decisions/decision-log.md](../decisions/decision-log.md) e no fechamento da OD correspondente em [../decisions/open-decisions.md](../decisions/open-decisions.md).
- Ordem de execução segue a hierarquia de dependências; itens `pendente` sem dependência entre si podem correr em paralelo.

## Concluído

| ID | Título | Objetivo | Dependências | Estado |
| --- | --- | --- | --- | --- |
| F0-001 | Inspeção inicial do repositório | Registrar o estado factual do repositório antes de qualquer alteração | — | concluído |
| F0-002 | Baseline documental inicial | README, índice, estado do projeto, escopo do MVP, RB-001 a RB-006, OD-01 a OD-11, R-01 a R-10 (PR #1, squash em `main`) | F0-001 | concluído |
| F0-003 | ADRs 0001 a 0003 | Formalizar monólito modular/Next.js, PostgreSQL/Neon e Cloudflare R2 | F0-001 | concluído |

## Trabalho desta entrega (estruturação do baseline)

| ID | Título | Objetivo | Dependências | Estado |
| --- | --- | --- | --- | --- |
| F0-004 | Correção do público-alvo | Registrar o perfil completo do público-alvo em [../product/mvp-scope.md](../product/mvp-scope.md), separando perfil de papéis e preservando OD-11 | F0-002 | concluído |
| F0-005 | Requisitos rastreáveis | Catálogo RF/RNF com rastreabilidade para RB e OD em [../product/requirements.md](../product/requirements.md) | F0-002, F0-003 | concluído |
| F0-006 | Decision log | Registro de decisões vigentes em [../decisions/decision-log.md](../decisions/decision-log.md) | F0-002, F0-003 | concluído |
| F0-007 | Roadmap macro | Fases, entregáveis, dependências e gates em [roadmap.md](roadmap.md) | F0-005 | concluído |
| F0-008 | Workflow de agentes | Governança entre Bruno, ChatGPT, Claude Code e Antigravity em [../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md) | — | concluído |
| F0-009 | Backlog da Fase 0 e índice documental | Este documento e atualização de [../README.md](../README.md) | F0-004 a F0-008 | concluído |

## Próximos trabalhos

Ordem lógica. F0-010 foi **concluído** na sexta execução do spike, em 2026-09-14, com dez dos dez critérios comprovados (ver abaixo), o que desbloqueou F0-011. F0-013 foi concluído e fechou OD-04, o que desbloqueou F0-014, F0-015 e F0-018. F0-014 foi concluído e fechou OD-05 em [../product/image-policy.md](../product/image-policy.md) (DEC-028). F0-015 foi concluído e fechou OD-01 em [../product/negotiation-lifecycle.md](../product/negotiation-lifecycle.md) (DEC-029), o que desbloqueou F0-016. F0-016 foi concluído e fechou OD-02 em [../product/ratings.md](../product/ratings.md) (DEC-030), com RF-017 passando a `definido`. F0-017 foi concluído e fechou OD-03 em [../product/prohibited-items.md](../product/prohibited-items.md) (DEC-031), com RF-018, RF-019 e RF-020 passando a `definido`. F0-018, F0-020, F0-021 e F0-024 foram concluídos na mesma entrega e fecharam, respectivamente, OD-06 em [../product/reselection-policy.md](../product/reselection-policy.md) (DEC-032), OD-10 em [../product/data-retention-policy.md](../product/data-retention-policy.md) (DEC-033), OD-11 em [../product/age-eligibility.md](../product/age-eligibility.md) (DEC-034) e OD-12 em [../product/interest-flow.md](../product/interest-flow.md) (DEC-035); com isso RF-001, RF-006, RF-008, RF-013 e RF-023 passaram a `definido`, assim como RNF-009 e RNF-011.

F0-011 foi **concluído** em 2026-09-14 e fechou OD-08 com [ADR-0004](../adr/0004-mercado-pago-pix.md) (DEC-036): o Mercado Pago deixou de ser candidato e passou a ser o **gateway Pix inicial homologado** do MVP, por Checkout Transparente via Orders API. **F0-019 foi concluído no mesmo dia** e fechou **OD-07**, a última decisão aberta da Fase 0, com [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037). **F0-022 foi concluído em seguida, na mesma data**, e produziu a baseline arquitetural da implementação, mais [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md) (DEC-038). **F0-023 foi concluído por último, ainda em 2026-09-14**, e verificou formalmente o gate de saída da Fase 0 em [phase-1-transition.md](phase-1-transition.md). **Não há mais decisão aberta nem item pendente na Fase 0:** todos os itens `F0-xxx` estão `concluído` e a Fase 0 está encerrada.

| ID | Título | Objetivo | Dependências | Estado |
| --- | --- | --- | --- | --- |
| F0-010 | Spike do gateway Pix para exatamente R$ 0,99 | Provar, em sandbox do primeiro candidato (Mercado Pago) e, se necessário, de alternativas, a cobrança de exatamente R$ 0,99, confirmação, webhook, idempotência e tarifas (DEC-018, R-01). O spike é descartável e não entra no código do produto | F0-005 | concluído (10 de 10 critérios comprovados na 6ª execução, 2026-09-14) |
| F0-011 | Registrar resultado e decisão do gateway | Fechar OD-08 com [ADR-0004](../adr/0004-mercado-pago-pix.md): Mercado Pago homologado como gateway Pix inicial do MVP, por Checkout Transparente via Orders API, com idempotência, validação de assinatura por manifesto único, webhook configurado na aplicação e processamento idempotente e reconciliável (DEC-036); atualizar decision log, riscos R-01 e R-04 e requisitos RF-011 e RF-012 | F0-010 | concluído |
| F0-012 | Fechar ORM e estratégia de migrations | Fechar OD-09 com [ADR-0005](../adr/0005-prisma-orm-migrations.md): Prisma ORM 7.x, Prisma Migrate, política dev/staging/produção, `db push` e migrations destrutivas (DEC-026) | F0-003 | concluído |
| F0-013 | Detalhar ciclo de vida do anúncio | Fechar OD-04 em [../product/listing-lifecycle.md](../product/listing-lifecycle.md): estados, transições, visibilidade pública e efeitos sobre interesses e solicitações (DEC-027) | F0-005 | concluído |
| F0-014 | Definir regras de imagens | Fechar OD-05 em [../product/image-policy.md](../product/image-policy.md): quantidade, formatos, tamanho, validação, processamento, derivados e visibilidade das imagens (DEC-028); atualizar RF-004, RF-006, RF-020 e RNF-005 | F0-013 | concluído |
| F0-015 | Definir mecanismo de encerramento | Fechar OD-01 em [../product/negotiation-lifecycle.md](../product/negotiation-lifecycle.md): estados `active` e `closed`, encerramento unilateral por qualquer uma das partes, confirmação do próprio ator, irreversibilidade, ausência de prazos e automação, idempotência e auditoria (DEC-029); atualizar RF-016, RF-017 e RF-022 | F0-013 | concluído |
| F0-016 | Definir avaliações | Fechar OD-02 em [../product/ratings.md](../product/ratings.md): natureza bilateral sobre a contraparte, elegibilidade a partir de negociação `closed`, nota inteira de 1 a 5 sem texto livre, janela de 14 dias corridos, publicação cega, edição antes da publicação, imutabilidade após a publicação, média simples com contagem e invalidação administrativa auditada (DEC-030); atualizar RF-017 e RF-022 | F0-015 | concluído |
| F0-017 | Definir catálogo/política de itens proibidos | Fechar OD-03 em [../product/prohibited-items.md](../product/prohibited-items.md): catálogo por categorias PI-01 a PI-12 com fundamento `ilegal`, `regulado` ou `política`, ausência de fluxo de autorização documental no MVP, regra de casos ambíguos, declaração de conformidade na publicação, fluxo de denúncia, fluxo de moderação, critérios e efeitos da remoção, prazos de 24 horas corridas na classe crítica e 5 dias úteis na comum, reincidência, contestação, auditoria e privacidade do denunciante (DEC-031); atualizar RF-004, RF-018 a RF-020 e RF-022 | F0-005 | concluído |
| F0-018 | Definir política de desistência e reseleção | Fechar OD-06 em [../product/reselection-policy.md](../product/reselection-policy.md): reseleção permitida sob cinco pré-condições simultâneas (escolha anterior existente, negociação anterior `closed`, anúncio `published`, candidato com pagamento aprovado e candidato ainda não selecionado), confirmação explícita do anunciante, imutabilidade da escolha e da liberação anteriores, nova negociação e nova autorização auditada, exclusividade da negociação `active`, preservação literal de RB-003 e tratamento da desistência sem reembolso ou automação (DEC-032); atualizar RF-013 e RF-015 | F0-013 | concluído |
| F0-019 | Definir tratamento de exceções de pagamento | Fechar OD-07 em [../product/payment-exceptions.md](../product/payment-exceptions.md): fonte de verdade do pagamento, identidade e idempotência da tentativa, duplicidade técnica, instante de acreditação como critério de tempestividade, piso de 30 minutos da janela de reserva, preservação de RB-003 sob concorrência, falhas de confirmação e de webhook, quatro hipóteses exaustivas de reembolso técnico, distinção entre reembolso técnico, devolução Pix, MED e chargeback de cartão, efeitos das reversões, reconciliação autoritativa, auditoria e segurança (DEC-037); atualizar RF-009 a RF-012, RF-020 e RF-022 | F0-011 | concluído |
| F0-020 | Definir retenção e exclusão de dados | Fechar OD-10 em [../product/data-retention-policy.md](../product/data-retention-policy.md): minimização por categoria, exclusão de conta com efeito imediato e prazo de 30 dias, expurgo de imagens, 6 meses de log de acesso, 24 meses de auditoria e de registros de moderação e abuso, 5 anos de metadados financeiros, backups até o ciclo normal com máximo de 30 dias adicionais e legal hold registrado (DEC-033); atualizar RF-006, RF-020, RF-022, RF-023, RNF-009 e RNF-011 | F0-005 | concluído |
| F0-021 | Definir elegibilidade etária formal | Fechar OD-11 em [../product/age-eligibility.md](../product/age-eligibility.md): 18 anos completos ou mais como decisão conservadora de escopo do produto, declaração explícita registrada no cadastro, ausência de coleta documental ou biométrica e de serviço externo de verificação, e bloqueio cautelar diante de evidência razoável de menoridade (DEC-034); atualizar RF-001 e RNF-009. O público-alvo de 18 a 50 anos não determinou esta decisão | F0-005 | concluído |
| F0-022 | Produzir arquitetura de dados e API pré-implementação | [../architecture/overview.md](../architecture/overview.md), [../architecture/data-model.md](../architecture/data-model.md), [../architecture/payments-design.md](../architecture/payments-design.md) e [../architecture/contact-release.md](../architecture/contact-release.md), com base nas decisões fechadas; produziu também [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md) (DEC-038) | F0-011, F0-012, F0-013, F0-014, F0-015, F0-018, F0-019, F0-020, F0-024 | concluído |
| F0-023 | Preparar transição para a Fase 1 | Verificar o gate de saída da Fase 0 em [roadmap.md](roadmap.md), revisar riscos e produzir o prompt inicial da Fase 1 | F0-022 | concluído |
| F0-024 | Definir natureza da demonstração de interesse | Fechar OD-12 em [../product/interest-flow.md](../product/interest-flow.md): ação gratuita de interface, sem entidade persistida, sem ocupar vaga paga, sem cancelamento e sem visibilidade ao anunciante, admitida apenas telemetria agregada de funil (DEC-035); atualizar RF-008 | F0-005 | concluído |

### Histórico e conclusão de F0-010

As seis execuções de F0-010 estão registradas em [spikes/f0-010-mercado-pago-pix-r099.md](spikes/f0-010-mercado-pago-pix-r099.md). As cinco primeiras foram classificadas como `INCONCLUSIVO`, por causas sucessivamente menores; a sexta é `CONCLUSIVO` e fechou o item.

As duas primeiras, em 2026-09-07 e 2026-09-14, não executaram nenhum experimento autenticado, por ausência de credencial de teste do Mercado Pago.

A terceira, em 2026-09-14, foi a **primeira com Access Token de teste** e executou a parte experimental. **Oito dos dez critérios passaram a comprovados:** API autenticada, criação da cobrança Pix, aceitação de exatamente R$ 0,99, geração de QR Code e copia e cola com CRC conferido, transição de status até `processed/accredited`, idempotência por `X-Idempotency-Key`, tarifa efetiva e ausência de incompatibilidade com RB-004. Em particular, a tarifa sobre R$ 0,99 deixou de ser indeterminada: no ambiente de teste ela é de R$ 0,01, com líquido de R$ 0,98, por arredondamento meio-para-cima ao centavo e sem tarifa mínima.

A quarta, também em 2026-09-14, atacou apenas os dois critérios de webhook que restavam e **fechou um deles**. Um endpoint HTTPS público foi provisionado em projeto Vercel temporário e isolado, sem qualquer relação com o projeto oficial `techlab-troq`, e o Mercado Pago **entregou notificações reais a esse endpoint**, com `x-signature`, `x-request-id`, `ts` e `data.id` presentes, correlacionadas à `merchant_order` `44469080694` de R$ 0,99. O critério 7 passou a comprovado. Nessa execução também se descobriu que a URL de notificação é configurável por requisição via `notification_url` de `POST /checkout/preferences`. **Isso vale para a API de Preferences e não para a de Orders:** a sexta execução confirmou que `POST /v1/orders` **rejeita** `notification_url` com `HTTP 400` e `unsupported_properties`, e por isso [ADR-0004](../adr/0004-mercado-pago-pix.md) proíbe enviá-la nesse endpoint.

Restava **um único critério**: validar a assinatura de uma notificação real. Ele dependia de um único insumo, a **chave secreta de webhook**, que nenhum endpoint público da API expõe ou permite configurar e que só existe no painel “Suas integrações”. A quinta execução, também em 2026-09-14, refinou esse diagnóstico: o painel é **legível** com a sessão de navegador do próprio Bruno; o que bloqueava era a **escrita**, sujeita a reautenticação por **TOTP**.

A sexta execução, ainda em 2026-09-14, **fechou o critério 8 e concluiu o item**. Com a aplicação `TROQ F0-010 Seller Test Webhook` (`application_id` `4982497380871264`) criada sob um Seller Test User, o simulador oficial produziu HMAC válido contra o endpoint temporário, e uma **Order Pix nova de exatamente R$ 0,99** gerou uma **notificação real** do Mercado Pago, com `application_id` correspondente à mesma aplicação, correlacionada por `data.id` e por `external_reference`, cujo HMAC-SHA256 conferiu contra o manifesto oficial; o receiver devolveu `HTTP 200`, e a matriz negativa (assinatura, `data.id`, `x-request-id` e `ts` adulterados) devolveu `HTTP 401` em todos os casos. Os recursos temporários foram removidos em seguida, incluindo a aplicação de teste e o projeto Vercel.

Com dez de dez critérios comprovados, F0-010 ficou `concluído` e a validação técnica deixou de ser o bloqueio da Fase 0. O spike, por natureza, provou viabilidade técnica sem homologar gateway; a homologação veio em seguida, em F0-011. Todas as decisões de produto que não dependiam de pagamento já haviam sido fechadas (OD-01 a OD-06 e OD-09 a OD-12).

### Conclusão de F0-011

F0-011 foi executado em **2026-09-14**, imediatamente após F0-010, e produziu [ADR-0004](../adr/0004-mercado-pago-pix.md), que **fecha OD-08** e registra DEC-036. A decisão: o **Mercado Pago é o gateway Pix inicial homologado** do MVP, integrado por Checkout Transparente tendo a **Orders API** como superfície principal. A ADR também fixa restrições normativas que vieram diretamente das evidências do spike — `X-Idempotency-Key` na criação, validação de autenticidade antes de qualquer processamento, **uma única** regra oficial de manifesto HMAC sem fallback entre variantes, proibição de `notification_url` no corpo de `POST /v1/orders`, processamento idempotente e reconciliável por `GET /v1/orders/{id}` e isolamento do vocabulário do provedor em um módulo adaptador.

O que F0-011 **não** fez: nenhuma linha de integração de pagamento, nenhum SDK, nenhum schema, nenhuma migration, nenhum secret e nenhuma configuração no painel do Mercado Pago. A tarifa de R$ 0,01 sobre R$ 0,99 observada em sandbox permanece registrada como evidência de ambiente de teste, **não** como tarifa contratada de produção — a confirmação da tarifa real é pré-requisito do lançamento comercial e está registrada como risco residual em R-01.

Com OD-08 fechada, **OD-07 passou a ser a única decisão aberta da Fase 0** e **F0-019** passou a `próximo`.

### Conclusão de F0-019

F0-019 foi executado em **2026-09-14**, logo depois de F0-011, e produziu [../product/payment-exceptions.md](../product/payment-exceptions.md), que **fecha OD-07** e registra DEC-037. A política é normativa e implementável: o estado autoritativo do pagamento é o que o Mercado Pago reporta em consulta direta à order, e a notificação é apenas gatilho, nunca fonte de estado; somente pagamento efetivamente acreditado produz efeito de negócio e estado incerto nunca é resolvido a favor da aprovação; a tentativa de pagamento tem identidade estável por reserva, e criação, notificação, transições, reembolso e cancelamento são idempotentes; duplicidade técnica elege um pagamento canônico, nunca consome duas vagas e devolve o excedente; o instante decisivo da tempestividade é o de acreditação, de modo que confirmação atrasada de pagamento feito a tempo vale e pagamento acreditado fora da janela não cria vaga nem solicitação; a janela de reserva tem piso de 30 minutos, alinhado ao mínimo aceito pela Orders API; nenhuma exceção ultrapassa três solicitações pagas válidas; o reembolso técnico é integral e tem quatro hipóteses exaustivas; `chargeback` é vocabulário de cartão e não descreve o Pix, e desacordo comercial não é hipótese de MED; reversão externa preserva o histórico, torna inelegível a solicitação ainda não escolhida, não revoga contato já liberado e não devolve a vaga.

A pesquisa externa que sustenta a decisão foi feita em 2026-09-14 contra a documentação do Mercado Pago Developers e o *Guia de implementação dos procedimentos de devolução no Pix, com ênfase no Mecanismo Especial de Devolução* (versão 4.3) do Banco Central, e está registrada na seção 4 daquele documento.

O que F0-019 **não** fez: nenhuma linha de integração, nenhum endpoint, nenhum receiver de webhook, nenhum schema, nenhuma migration, nenhum secret, nenhum acesso a painel produtivo e nenhum pagamento real. Com OD-07 fechada, **não resta decisão aberta na Fase 0** e **F0-022** passou a `próximo`.

### Conclusão de F0-022

F0-022 foi executado em **2026-09-14**, logo depois de F0-019, e produziu os quatro documentos previstos:

- [../architecture/overview.md](../architecture/overview.md) — objetivos arquiteturais em ordem de prioridade, quatro camadas com dependência unidirecional, os **nove módulos de domínio** do MVP, quatro fronteiras de confiança, autorização em três níveis cumulativos verificados na mesma transação do efeito, classificação dos dados pessoais em três faixas, trilha de auditoria única e append-only, observabilidade mínima e política de evolução sem microserviços prematuros.
- [../architecture/data-model.md](../architecture/data-model.md) — entidades, relações, cardinalidades, estados, unicidades e um quadro de **14 invariantes críticas** com a indicação de onde cada uma é protegida: restrição de banco, transação ou aplicação.
- [../architecture/payments-design.md](../architecture/payments-design.md) — a política de DEC-037 convertida em mecanismo, com **CI-1 a CI-12 rastreados um a um** e um contrato de teste de 18 casos.
- [../architecture/contact-release.md](../architecture/contact-release.md) — RB-001 convertida em mecanismo, com a separação explícita entre **armazenar, autorizar e retornar** o contato.

As decisões de desenho mais relevantes: a proteção de RB-003 passa a ser **índice único parcial** sobre a vaga do anúncio, com a expiração resolvida na própria transação que aloca — de modo que a invariante não dependa de nenhum trabalho periódico; a janela de reserva é de **exatamente 30 minutos**, o único valor em que o `expiration_time` da order pode coincidir com o fim da janela sem a cobrança sobreviver à reserva; a chave de idempotência é **persistida**, nunca rederivada; a idempotência de negócio é feita no **efeito**, não na deduplicação da entrega da notificação; o pagamento canônico é eleito por menor instante de acreditação, com desempate determinístico; e o contato vive em tabela própria sob um módulo com ponto de entrada autorizado, de modo que a consulta descuidada não o alcance.

F0-022 exigiu **uma** decisão arquitetural nova e duradoura, registrada em [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md) (DEC-038): trabalho assíncrono, agendamento e concorrência. A pesquisa externa que a sustenta apurou que a entrega do agendamento da Vercel é *best effort*, que falhas não são retentadas, que execuções podem se sobrepor, que o plano Hobby limita o agendamento a uma execução diária e que o endpoint pooled do Neon **não** suporta trava consultiva de sessão. O primeiro conjunto de fatos transformou "nenhuma invariante depende de um job" de boa prática em requisito; o último tornou incorreta — e não apenas subótima — a trava de sessão. Nenhuma tecnologia nova foi adotada.

O que F0-022 **não** fez: nenhuma linha de código de produto, nenhum endpoint, nenhum componente, nenhum schema Prisma, nenhuma migration, nenhum secret, nenhuma integração real com o Mercado Pago, nenhum provisionamento e nenhum deploy. Com F0-022 concluído, **F0-023** passou a `próximo` e foi executado em seguida.

### Conclusão de F0-023

F0-023 foi executado em **2026-09-14**, logo depois de F0-022, e é o **último item da Fase 0**. Ele produziu [phase-1-transition.md](phase-1-transition.md), que audita o gate de saída da Fase 0 em matriz explícita de critério → fonte normativa → evidência → resultado. Os dez critérios (G-1 a G-10) resultaram `PASS` e o gate foi declarado **APROVADO**.

O trabalho também verificou individualmente os **12 requisitos** dos quais [roadmap.md](roadmap.md) diz que a Fase 1 e a Fase 2 dependem — 9 em `definido`, 3 em `parcialmente definido` (RF-004, RF-021 e RNF-018), nenhum `bloqueado`, nenhum sem fonte —, revisou os **onze riscos** R-01 a R-11 sem encerrar nenhum e sem alterar texto artificialmente, e classificou factualmente os **sete entregáveis** da Fase 1: `já existente` os padrões de projeto e o CI; `parcial` o scaffold (faltam os módulos de AR-3.3) e a infraestrutura mínima (o projeto Vercel existe; R2 e Resend não); `não iniciado` o contrato de ambientes, o banco/Prisma/schema e a observabilidade.

O item da Fase 1 escolhido como próximo trabalho é **F1-001 — contrato de ambientes e segredos**, cujo prompt executor foi versionado em [prompts/f1-001-environments-and-secrets.md](prompts/f1-001-environments-and-secrets.md). A escolha é deliberada: scaffold, comandos de qualidade e CI já existem e não devem ser recriados, enquanto o contrato de ambientes é o único entregável `não iniciado` que é pré-requisito seguro para conectar Neon, Prisma, R2, Resend, autenticação e pagamentos.

O que F0-023 **não** fez: nenhuma linha de código, nenhuma alteração de regra de negócio, de requisito, de ADR ou de decisão vigente, nenhuma decisão nova, nenhum provisionamento, nenhum segredo e nenhuma implementação da Fase 1. Nenhum item `F0-xxx` novo foi criado para trabalho de Fase 1: a Fase 1 usa a sua própria numeração.

## Fase 1

A Fase 0 está encerrada e a Fase 1 está **habilitada e não iniciada**. Este documento continua sendo o backlog da **Fase 0** e não recebe itens de outras fases.

O estado factual dos sete entregáveis da Fase 1 — o que já existe, o que é parcial e o que não foi iniciado — está em [phase-1-transition.md](phase-1-transition.md), seção 10. O próximo trabalho é **F1-001 — contrato de ambientes e segredos**, cujo prompt executor está versionado em [prompts/f1-001-environments-and-secrets.md](prompts/f1-001-environments-and-secrets.md). O backlog da Fase 1, com a sua própria numeração `F1-xxx`, é aberto pelo primeiro trabalho daquela fase.

## Fora deste backlog

- Tarefas de implementação da Fase 1 em diante (estrutura de módulos, schema, provisionamento, telas, integrações): detalhadas no backlog da própria fase, não aqui. O scaffold e o CI que o roadmap lista como entregáveis da Fase 1 **já existem** e não devem ser recriados ([phase-1-transition.md](phase-1-transition.md), seção 10).
- Candidatos pós-MVP listados em [roadmap.md](roadmap.md).

## Revisão

Atualizar este documento a cada item concluído, sempre na mesma PR que registra o resultado, e ao fechar cada decisão aberta.
