# ADR-0007 — Sentry SaaS como plataforma de observabilidade do MVP

## Status

Aceito — Fase 1 (2026-09-15). Produzida por **F1-008** e registrada como **DEC-039** em [../decisions/decision-log.md](../decisions/decision-log.md).

Esta ADR é **decisão e contrato**. Ela **não** provisiona nada, **não** instala SDK e **não** instrumenta telemetria: o provisionamento e a instrumentação são trabalhos posteriores e distintos ([../delivery/backlog.md](../delivery/backlog.md)).

## Contexto

[../architecture/overview.md](../architecture/overview.md) (AR-14.1) exige "logs estruturados e rastreamento de erros suficientes para operar o MVP, sem dados protegidos e sem segredos", e atribui expressamente à Fase 1 a escolha da **ferramenta concreta e do escopo**. Por causa dessa lacuna, [../product/requirements.md](../product/requirements.md) mantinha **RNF-018** em `parcialmente definido`, e [../engineering/environments.md](../engineering/environments.md), seção 5.8, registrava a observabilidade como área **sem nenhuma variável**, deliberadamente, para não antecipar contrato de uma ferramenta não escolhida.

A lacuna não é cosmética. Três decisões vigentes já dependem de observabilidade para serem verificáveis:

- **AR-14.3** enumera seis sinais operacionais mínimos, cada um justificado por uma garantia de DEC-037 que sem eles não é verificável — tentativas de pagamento em estado não terminal por idade, casos em `reembolso_pendente` por idade, casos em `inconsistente` abertos, notificações rejeitadas por autenticidade por janela, última execução bem-sucedida de cada trabalho periódico e denúncias decididas no prazo por classe.
- **[ADR-0006](0006-async-work-scheduling-concurrency.md)** registra, entre as suas consequências, que "a observabilidade passa a ser **obrigatória**, não opcional: sem saber a última execução bem-sucedida de cada trabalho, uma falha silenciosa é indistinguível de ausência de trabalho".
- **[../architecture/payments-design.md](../architecture/payments-design.md)** (PD-3.5, PD-8.6, CI-7) exige que reembolso pendente permaneça **visível** à operação, e não apenas persistido.

Sem esta decisão, a instrumentação da Fase 2 ou da Fase 3 escolheria por conta própria, provavelmente no mesmo commit em que precisasse do primeiro log — o pior momento possível para decidir fronteira de privacidade sobre um produto cujo dado central é telefone/WhatsApp (RB-001, DEC-023).

**Estado factual na data desta ADR.** Não existe observabilidade implementada, nenhuma dependência de SDK de observabilidade consta de `package.json`, nenhum projeto ou conta existe em nenhum provedor de observabilidade, e `production` não está provisionado em provedor nenhum.

## Drivers arquiteturais

| # | Driver | Origem |
| --- | --- | --- |
| D-1 | Rastreamento de erros **client-side e server-side** suficiente para operar o MVP | AR-14.1, RNF-018 |
| D-2 | Logs estruturados consultáveis, sem dado protegido e sem segredo | AR-14.1, AR-14.4, RNF-018, [../engineering/conventions.md](../engineering/conventions.md) seção 6 item 6 |
| D-3 | Os seis sinais de AR-14.3 precisam ser operacionalmente observáveis | AR-14.3, DEC-037 (CI-7, CI-8, CI-11), DEC-038 |
| D-4 | Retenção suficiente para investigar um caso operacional depois de ele ser notado | PE-7.8 (prazo de 180 dias), PD-3.4, R-11 |
| D-5 | **Isolamento por ambiente**: dois ambientes nunca compartilham credencial de provedor | [../engineering/environments.md](../engineering/environments.md) seções 2, 2.5 e 6.1 regra 3 |
| D-6 | Mecanismo de filtragem/redaction de PII no provedor, não apenas disciplina do código | RNF-008, DEC-023, R-03 |
| D-7 | Operável por equipe pequena, sem plantão e sem infraestrutura própria | DEC-025, [ADR-0001](0001-modular-monolith-nextjs.md) |
| D-8 | Custo de entrada compatível com MVP pré-receita, com franquia acompanhável | R-08, R-09 |
| D-9 | Suporte maduro ao Next.js App Router, incluindo source maps | [ADR-0001](0001-modular-monolith-nextjs.md) |
| D-10 | Observabilidade **não** substitui auditoria | AR-14.2, AR-9.5 |

## Pesquisa externa

Consultas realizadas em **2026-09-15**, contra documentação oficial dos fornecedores. Cada linha é fato apurado na fonte indicada.

| # | Fonte oficial | Fato apurado |
| --- | --- | --- |
| S-1 | Sentry — *Next.js guide*, `docs.sentry.io/platforms/javascript/guides/nextjs/` | Guia oficial dedicado ao Next.js com suporte explícito ao **App Router**: a instalação cria `app/global-error.tsx` para capturar erros de renderização do React no App Router, `instrumentation-client.ts` (cliente), `sentry.server.config.ts` (servidor), `sentry.edge.config.ts` (edge), `instrumentation.ts` (registro server-side) e envolve `next.config.ts` com `withSentryConfig`. Error Monitoring, Tracing e Session Replay são recursos **selecionáveis** na instalação, e Session Replay não vem marcado por padrão |
| S-2 | Sentry — *Next.js guide* | **Logs estruturados** são enviados pela própria SDK (`Sentry.logger.info` e equivalentes), no mesmo produto que recebe erros e traces |
| S-3 | Sentry — *Next.js sourcemaps*, `docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/` | O upload de source maps é feito por `withSentryConfig` com `org`, `project` e `authToken`, este último lido de **`SENTRY_AUTH_TOKEN`**; a instalação grava o token em `.env.sentry-build-plugin` |
| S-4 | Sentry — *sentry-cli configuration*, `docs.sentry.io/cli/configuration/` | As variáveis de ambiente documentadas da ferramenta de build/CI são, literalmente: **`SENTRY_AUTH_TOKEN`** ("the authentication token to use for all communication with Sentry"), **`SENTRY_ORG`** ("the ID or slug of the organization to use for a command"), **`SENTRY_PROJECT`** ("the ID or slug of the project to use for a command"), `SENTRY_URL` (padrão `https://sentry.io/`) e `SENTRY_DSN` |
| S-5 | Sentry — *JavaScript options*, `docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/` | `dsn` é lido de `SENTRY_DSN` quando não passado explicitamente, e **sem DSN a SDK não envia nada**. `release` é lido de `SENTRY_RELEASE` no servidor. Para `environment` **não** há variável de ambiente declarada no guia de JavaScript: o valor é passado na configuração, é *case-sensitive*, não aceita espaço, nova linha nem barra, e tem máximo de 64 caracteres |
| S-6 | Sentry — *JavaScript options* | **`sendDefaultPii` tem padrão `false`**; habilitá-lo passa a enviar informação pessoalmente identificável, incluindo coleta automática de endereço IP. A opção está marcada como **deprecada**, com remoção prevista na próxima major (v11), em favor de uma opção `dataCollection` de granularidade maior |
| S-7 | Sentry — *Server-side scrubbing*, `docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing/` | O *data scrubbing* server-side é **habilitado por padrão** e o provedor recomenda expressamente mantê-lo. Por padrão são removidos valores com aparência de cartão de crédito e campos cujo nome contenha `password`, `secret`, `passwd`, `api_key`, `apikey`, `auth`, `credentials`, `mysql_pwd`, `privatekey`, `private_key`, `token` e `bearer`, além dos campos sensíveis adicionais configurados no projeto. Existe *Advanced Data Scrubbing* por regras (por exemplo, remover `$user.geo.**`) e *Safe Fields* para exceções |
| S-8 | Sentry — *Data retention periods*, `docs.sentry.io/security-legal-pii/security/data-retention-periods/` | Retenção no plano **Developer** (gratuito): erros **30 dias**, spans **30 dias**, logs **30 dias**, replays **30 dias**, anexos **30 dias**. No Team, erros e replays passam a 90 dias |
| S-9 | Sentry — *Pricing*, `sentry.io/pricing/` | O plano **Developer** é gratuito e limitado a **um usuário**, com franquia mensal de **5 mil erros**, **5 milhões de spans**, **5 GB de logs**, **50 replays**, 1 cron monitor e 1 uptime monitor. O plano **Team** começa em **US$ 26/mês** (anual), com usuários ilimitados |
| S-10 | Sentry — *Is there a limit to the number of projects…*, `help.sentry.io` | **Projetos são ilimitados em todos os planos**, inclusive no Developer |
| S-11 | Sentry — *Organization getting started*, `docs.sentry.io/organization/getting-started/` | A orientação do provedor é organizar **projeto por codebase/serviço** — repositório, serviço ou linguagem —, e usar a **tag `environment`** para separar estágios de deploy, permitindo alertas e filtros por ambiente **sem** projetos separados |
| B-1 | Better Stack — *Next.js client*, `betterstack.com/docs/logs/javascript/nextjs/` | Cliente oficial `@logtail/next`, com suporte a App Router desde a versão 0.2.0; logs de cliente por hook `useLogger`, logs de servidor pela classe `Logger` com `flush()` manual, captura de erro por `error.tsx` e tracing por OpenTelemetry via `@vercel/otel`. A configuração exige **`NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN`** e `NEXT_PUBLIC_BETTER_STACK_INGESTING_URL`, ambos com prefixo público, e envolver o config do Next com `withBetterStack` |
| B-2 | Better Stack — *Next.js client* | A documentação do cliente Next.js **não** trata de **source maps** nem de **scrubbing/redaction de PII** |
| B-3 | Better Stack — plano gratuito (página de preços/telemetria) | O plano gratuito oferece **3 GB de logs com retenção de 3 dias**; os pacotes pagos de telemetria começam em torno de **US$ 25/mês** com 30 dias de retenção |
| V-1 | Vercel — *Observability*, `vercel.com/docs/observability` | A Observability nativa está disponível em todos os planos e cobre **logs de runtime, traces de requisição e métricas** de recursos da plataforma — Functions, External APIs, Edge Requests, Middleware, Image Optimization, ISR, Build Diagnostics. Os eventos rastreados são de plataforma: Edge Requests, invocações de Function, requisições a APIs externas, invocações de Middleware e requisições ao AI Gateway |
| V-2 | Vercel — *Observability Plus*, `vercel.com/docs/observability/observability-plus` | **Retenção da Observability incluída: Hobby 12 horas, Pro 1 dia, Enterprise 3 dias**; **runtime logs: Hobby 1 hora, Pro 1 dia, Enterprise 3 dias**. A **Observability Plus** — retenção de 30 dias, latência p75, breakdown por rota e acesso a Query — está disponível apenas em **Paid Pro e Enterprise**, cobrada por uso a **US$ 1,20 por 1 milhão de eventos**, e **não** está disponível no Pro Trial |
| V-3 | Vercel — *Working with Drains*, `vercel.com/docs/drains` | Drains **encaminham** dados de observabilidade (logs, traces, Speed Insights, Web Analytics, Connect, Audit Logs) para **um destino externo** — endpoint HTTP próprio ou integração nativa. Estão disponíveis apenas em **Pro e Enterprise** (Hobby e Pro Trial precisam de upgrade), e são cobrados a **US$ 0,50 por GB** de serialização JSON não comprimida. Drains **não** armazenam, não agrupam erros em issues e não tratam source maps: são transporte |

### O que esta pesquisa muda

1. **A Vercel nativa não atende D-1 nem D-4, em nenhum plano acessível ao MVP.** Por V-1, os eventos rastreados são de **plataforma**, não erros não tratados do navegador: um `TypeError` em Client Component não produz evento de Observability. Por V-2, a retenção incluída é de **12 horas no Hobby e 1 dia no Pro**, e 30 dias exigem Observability Plus, que é Paid Pro. Uma pendência de reembolso que corre contra o prazo de 180 dias do provedor (PE-7.8) não é investigável com uma janela de 12 horas. Por V-3, Drains não são observabilidade: são transporte para um destino externo, pago por GB e indisponível no Hobby — adotá-los **pressupõe** escolher outra ferramenta, e não substitui a escolha.
2. **O Better Stack atende D-2, mas conflita com D-5 e D-6 na forma documentada.** Por B-1, o cliente Next.js oficial exige o *source token* em **`NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN`** — variável **pública** por construção, cujo valor é embutido no bundle de cliente. Uma credencial de ingestão em variável pública é exatamente o padrão que [../engineering/environments.md](../engineering/environments.md), seção 3.2, proíbe sem exceção; ainda que o provedor considere o token de ingestão de baixo risco, o contrato do TROQ não admite essa avaliação caso a caso. Por B-2, a documentação do cliente **não** apresenta mecanismo de scrubbing de PII nem de source maps, o que deixa D-6 inteiramente por conta da disciplina do código — precisamente o oposto do que R-03 exige. Por B-3, a retenção gratuita é de **3 dias**, insuficiente para D-4.
3. **O Sentry atende D-1 a D-4, D-6, D-7 e D-9 na franquia gratuita.** Por S-1 e S-2, erro de cliente, erro de servidor, tracing e log estruturado vivem no mesmo produto, com guia oficial de App Router e source maps (S-3). Por S-8, a retenção do plano gratuito é de **30 dias** para erros, spans e logs — a mesma que a Vercel só oferece em Paid Pro com Observability Plus. Por S-7, o scrubbing server-side é **ligado por padrão** e já remove, por nome de campo, `token`, `auth`, `credentials`, `secret` e `bearer`: D-6 passa a ter mecanismo do provedor, e não apenas norma interna. Por S-6, `sendDefaultPii` é `false` por padrão, de modo que a configuração correta é a **ausência de ação**, não uma exceção a ser lembrada.
4. **O DSN é público por natureza, e isso não afrouxa nada.** Por S-5, sem DSN a SDK não envia nada, e o DSN do navegador é necessariamente embutido no bundle. O DSN é chave de **ingestão endereçada**, não credencial de leitura: ele não lê issues, não lê logs, não administra projeto e não emite token. A `SENTRY_AUTH_TOKEN` (S-4), que sim autentica operações na organização, permanece server-side e segredo.
5. **S-11 divergir do isolamento de ambiente do TROQ é fato registrado, não erro.** O provedor recomenda um projeto por codebase com separação por tag `environment`. O TROQ adota **um projeto por ambiente**, deliberadamente, porque a sua norma de isolamento é mais forte que a conveniência de consulta: por [../engineering/environments.md](../engineering/environments.md), seção 6.1, regra 3, **o mesmo segredo não é reaproveitado entre ambientes**, e um DSN único compartilhado entre `development`, `preview` e `production` seria exatamente esse reaproveitamento — além de tornar a telemetria de produção indistinguível por credencial, e não apenas por rótulo. Por S-10, projetos são ilimitados inclusive no plano gratuito, de modo que a escolha não tem custo. A orientação do provedor é registrada aqui para que a divergência seja **explícita e justificada**, e não descoberta depois como desvio.

Nenhum fato encontrado contradiz decisão vigente do TROQ. Nenhum fato encontrado torna o Sentry inadequado aos requisitos do MVP.

## Alternativas consideradas

### A — Sentry SaaS

Plataforma de error monitoring com tracing e logs estruturados no mesmo produto, SDK oficial para Next.js, plano gratuito Developer.

### B — Better Stack (Telemetry / Logs)

Plataforma de logs e telemetria com cliente oficial para Next.js e ingestão OpenTelemetry.

### C — Observabilidade nativa da Vercel (Observability / Observability Plus / Drains)

Usar exclusivamente o que a plataforma de deploy já adotada oferece, eventualmente encaminhando dados por Drains.

### D — Logs estruturados em `stdout`, sem plataforma

Emitir JSON no log da função e consultar pelo painel/CLI da plataforma, sem nenhum provedor novo.

## Critérios comparativos

| Critério | A — Sentry | B — Better Stack | C — Vercel nativa | D — Só `stdout` |
| --- | --- | --- | --- | --- |
| D-1 Erro client-side | **Sim**, com `global-error.tsx` e SDK de browser (S-1) | Parcial: captura manual em `error.tsx` (B-1) | **Não**: eventos são de plataforma (V-1) | **Não** |
| D-1 Erro server-side | **Sim**, com agrupamento em issues (S-1) | Sim, como log; sem agrupamento em issue | Sim, como log de runtime (V-1) | Sim, como texto |
| D-2 Logs estruturados | Sim, no mesmo produto (S-2) | **Sim**, é o seu núcleo (B-1) | Sim (V-1) | Sim, sem consulta estruturada |
| Tracing | Sim, 5M spans na franquia (S-1, S-9) | Sim, por OpenTelemetry (B-1) | Sim, traces de requisição (V-1) | Não |
| D-3 Sinais de AR-14.3 | Alcançável: logs/métricas derivadas do estado, consultáveis e alertáveis | Alcançável | Parcial, e limitado pela retenção (V-2) | Inviável na prática |
| D-4 Retenção no plano de entrada | **30 dias** (S-8) | **3 dias** (B-3) | **12 h Hobby / 1 dia Pro**; 30 dias só em Plus pago (V-2) | Igual a C |
| D-5 Isolamento por ambiente | Projeto e DSN por ambiente, projetos ilimitados (S-10) | Source em variável **pública** (B-1) — conflita com a seção 3.2 | Escopo é o projeto Vercel, não o ambiente | Não se aplica |
| D-6 Redaction de PII no provedor | **Sim, ligado por padrão** (S-7); `sendDefaultPii` `false` (S-6) | **Não documentado** no cliente Next.js (B-2) | Não há scrubbing de aplicação | Não há |
| Source maps | Sim, documentado (S-3) | **Não documentado** (B-2) | Não se aplica | Não |
| Alertas e dashboards | Sim, inclusive por ambiente | Sim | Alertas de anomalia; Query só em Plus (V-2) | Não |
| D-8 Custo de entrada | **US$ 0** (5k erros, 5M spans, 5 GB logs) (S-9) | US$ 0 com 3 dias; ~US$ 25/mês para 30 dias (B-3) | US$ 0 com 12 h; Plus exige Paid Pro + US$ 1,20/1M eventos (V-2); Drains US$ 0,50/GB e só Pro (V-3) | US$ 0 |
| D-7 Complexidade operacional | Baixa: SaaS, um SDK | Baixa a média | Mínima | Mínima |
| Lock-in | Médio: SDK proprietária, atenuada por OpenTelemetry | Médio | **Alto**: só existe dentro da Vercel (RNF-017) | Nenhum |
| D-10 Não confundir com auditoria | Preservável por norma (decisão 8) | Igual | Igual | Igual |

**C é rejeitada** por falhar em D-1 e D-4 ao mesmo tempo: não captura erro de navegador e a retenção acessível ao MVP é de horas. Somam-se o acoplamento ao provedor de deploy, que RNF-017 pede evitar, e o fato de que Drains **pressupõem** um destino externo — isto é, pressupõem esta mesma decisão, em vez de substituí-la. **B é rejeitada** por D-5 e D-6: a credencial de ingestão documentada para Next.js vive em variável `NEXT_PUBLIC_`, o que colide com a proibição sem exceção da seção 3.2 do contrato de ambientes, e o cliente não documenta scrubbing de PII nem source maps, deixando a fronteira de privacidade sem mecanismo de provedor. **D é rejeitada** por D-1, D-3 e D-4: sem agrupamento de erro, sem captura de cliente e sem retenção útil, não há como tornar AR-14.3 operacionalmente observável.

## Decisão

1. **Sentry SaaS é a plataforma de observabilidade do MVP.** Error monitoring, logs estruturados e tracing do TROQ vivem no Sentry. Nenhuma segunda plataforma de observabilidade é adotada, e nenhum broker, agente ou coletor próprio é introduzido. Isso **não** proíbe usar, para o que ela já faz, a Observability que a Vercel oferece sem custo nem configuração: ela permanece disponível como visão de plataforma, e **não** é a observabilidade da aplicação exigida por RNF-018.

2. **Um projeto Sentry por ambiente, e um DSN por ambiente.** São previstos três projetos — `development`, `preview` e, futuramente, `production`. **Nenhum projeto e nenhum DSN é compartilhado entre ambientes.** Uma mesma organização Sentry pode conter os três projetos, mas a telemetria de cada ambiente permanece segregada por credencial, e não apenas por rótulo. Fundamento: [../engineering/environments.md](../engineering/environments.md), seções 2 e 6.1 regra 3, e S-10. A orientação em sentido diverso do provedor (S-11) é conhecida e está registrada na pesquisa: a norma de isolamento do TROQ prevalece.

3. **Escopo funcional da instrumentação futura.** Quando instrumentada, a telemetria deve cobrir:
   - erros **não tratados no browser**;
   - erros **não tratados no servidor**, incluindo Route Handlers, Server Actions, renderização de servidor e endpoints de trabalho periódico;
   - exceções **explicitamente capturadas** onde o diagnóstico exigir, sem transformar erro esperado de domínio em ruído;
   - **logs estruturados** da aplicação;
   - **tracing** suficiente para diagnóstico operacional, sem meta numérica de amostragem fixada aqui;
   - associação de toda telemetria ao **ambiente** e à **release/deployment** correspondente;
   - os sinais necessários para tornar **AR-14.3 operacionalmente observável**, nos seis itens que aquela decisão enumera, sem reduzi-los, reinterpretá-los ou substituí-los.

4. **Telemetria nunca é estado autoritativo.** Estado financeiro, trilha de auditoria, autorização, capacidade de vagas e todas as demais invariantes continuam pertencendo ao **banco** e aos **módulos de domínio**. Nenhuma decisão de negócio, nenhuma verificação de autorização e nenhuma reconciliação lê o Sentry. Um sinal de AR-14.3 é **derivado** do estado persistido e enviado como telemetria; o estado permanece no PostgreSQL. Telemetria é descartável por construção — a retenção é de 30 dias (S-8) —, e nada que precise sobreviver a isso pode viver só lá.

5. **Dados que a telemetria não pode conter — proibição normativa.** É **proibido** enviar ao Sentry, em qualquer campo, sob qualquer forma — mensagem, tag, atributo, contexto, breadcrumb, extra, nome de issue, nome de span, nome de transação, chave de log, anexo ou corpo:
   - telefone;
   - WhatsApp;
   - email de pessoa usuária, quando não estritamente necessário;
   - nome de pessoa;
   - CPF;
   - endereço;
   - tokens de qualquer natureza;
   - cookies de sessão;
   - cabeçalhos `Authorization`;
   - credenciais;
   - secrets;
   - strings de conexão;
   - request bodies arbitrários;
   - respostas integrais de provedores externos;
   - payloads integrais de webhooks;
   - dados financeiros sensíveis;
   - qualquer outro dado protegido ou pessoal desnecessário.

   Isto é a aplicação direta de AR-14.4, RNF-018, RNF-008, DEC-023 e da seção 6.5 de [../engineering/environments.md](../engineering/environments.md), e **não** cria política nova: dá-lhe superfície concreta.

6. **Telefone/WhatsApp nunca é chave de correlação.** Telefone ou WhatsApp **não** é usado como tag, atributo, breadcrumb, contexto, mensagem, identificador de usuário nem chave de correlação — nem mesmo em forma derivada, truncada, mascarada ou com hash. Correlação técnica usa identificadores internos do TROQ (identificador de solicitação, de pagamento, de tentativa, de trabalho), e só quando necessários e seguros. Um identificador interno que permita reidentificar pessoa por junção com dado público **não** é seguro por ser interno.

7. **Preservar ou reforçar o scrubbing do provedor; nunca afrouxá-lo.** A implementação futura mantém habilitado o *data scrubbing* server-side do provedor, que já é o padrão (S-7), e pode **acrescentar** campos sensíveis e regras avançadas. **É proibido** desabilitá-lo, reduzi-lo, ou declarar como *safe field* qualquer campo capaz de conter dado da decisão 5. **`sendDefaultPii` — ou a opção que o suceder, como `dataCollection` (S-6) — não é habilitada por conveniência.** O padrão do provedor é `false`; mantê-lo assim é a configuração correta, e ligá-lo exige decisão registrada com análise de privacidade própria, não um ajuste de configuração.

8. **Observabilidade não é auditoria.** AR-14.2 é reafirmada integralmente: auditoria é estado versionado no PostgreSQL, com valor probatório e retenção normativa definida por DEC-033; telemetria é operacional e descartável. **Uma operação crítica nunca é considerada auditada porque apareceu no Sentry**, e a ausência de um evento no Sentry nunca é prova de que a operação não ocorreu. A trilha de auditoria não é substituída, espelhada nem complementada por telemetria, e nenhum requisito de auditoria é satisfeito por configuração de observabilidade.

9. **Session Replay fica fora do MVP e permanece desabilitado.** O recurso não é habilitado em nenhum ambiente. Motivos: **não** é necessário a RNF-018, que exige logs estruturados e rastreamento de erros; amplia materialmente a coleta de dados, capturando interação em telas que exibem contato liberado (RB-001); aumenta a superfície de privacidade justamente onde R-03 é mais sensível; e acrescenta custo e complexidade sem necessidade comprovada — a franquia gratuita oferece 50 replays por mês (S-9), número que não sustenta uso operacional e apenas convida a um upgrade não justificado. A instalação do provedor **não** marca Session Replay por padrão (S-1), de modo que manter-se fora exige apenas não ligá-lo. Habilitá-lo no futuro exige **nova análise explícita de privacidade e de necessidade**, registrada — não decisão de implementação.

10. **Contrato de variáveis.** As variáveis de observabilidade são exatamente as quatro registradas em [../engineering/environments.md](../engineering/environments.md), seção 5.8, com os nomes que são **convenção documentada da ferramenta** (S-3, S-4), conforme a regra 4 da seção 4 daquele documento: `NEXT_PUBLIC_SENTRY_DSN` (pública, não segredo), `SENTRY_AUTH_TOKEN` (server-side, **segredo**), `SENTRY_ORG` e `SENTRY_PROJECT` (server-side, não segredos, configuração de build). Todas estão em estado **`previsto`**: nenhum código versionado as lê.

11. **O ambiente já é representado por `APP_ENV`; a release vem do deployment.** **Não** se cria `SENTRY_ENVIRONMENT` nem `NEXT_PUBLIC_SENTRY_ENVIRONMENT`: o rótulo do ambiente é `APP_ENV`, variável já existente do catálogo (seção 5.1), e a configuração da SDK recebe esse valor explicitamente — o guia de JavaScript não declara variável de ambiente para `environment` (S-5), de modo que não há convenção de ferramenta a preservar. **Não** se cria variável própria de release enquanto os metadados de deployment/Git/Vercel forem suficientes para identificá-la. Nenhuma variável especulativa é criada.

12. **Uma única DSN, usada explicitamente nos dois lados.** A DSN do navegador é necessariamente pública (S-5) e por isso vive em `NEXT_PUBLIC_SENTRY_DSN`. A configuração server-side **usa essa mesma DSN, referenciada explicitamente**. **Não** se cria uma segunda variável `SENTRY_DSN` apenas para duplicar o mesmo valor: duas variáveis com o mesmo conteúdo produzem duas fontes de verdade e um modo de falha — divergirem. Se uma necessidade comprovada de DSN server-side distinta aparecer, ela é adição de variável pelo procedimento da seção 6.2, com justificativa própria. O fato de a DSN ser pública **não** autoriza expor nenhuma outra credencial: `SENTRY_AUTH_TOKEN` continua segredo server-side, nunca prefixado com `NEXT_PUBLIC_`.

13. **A `SENTRY_AUTH_TOKEN` é de build/CI, de menor escopo e por ambiente.** Ela existe apenas para operações que realmente exijam autenticação na organização — upload de source maps e criação de release —, nunca é acessível ao browser, nunca é lida em runtime de requisição, usa o **menor escopo** que o provedor permitir e é distinta por ambiente quando aplicável ([../engineering/environments.md](../engineering/environments.md), seção 6.1, regras 3 e 4). A sua ausência não pode impedir `npm run dev`, `npm run build` local, `npm run lint`, `npm run typecheck` nem `npm run test:ci`: a integração de source maps é **condicional**, e a sua falta degrada o diagnóstico, não o desenvolvimento.

14. **Dependência de serviço externo e custo.** O Sentry passa a ser dependência externa do MVP, no escopo de **R-08**: franquia, retenção, termos e preço devem ser acompanhados, e a franquia do plano Developer (S-9) é limite real, não teórico — 5 mil erros por mês e um único usuário. Esta ADR **não** contrata plano, **não** promete upgrade e **não** cria compromisso comercial futuro. Se o volume ou a operação exigirem plano pago, isso é decisão própria, registrada, como qualquer outro custo recorrente.

15. **O que esta ADR não decide.** Ficam expressamente fora: criação de conta, organização ou projeto; obtenção de DSN ou token real; configuração de painel; instalação de `@sentry/nextjs` ou de qualquer dependência; arquivos de instrumentação; `next.config.*`; logger da aplicação; taxas de amostragem de tracing; dashboards; alertas e seus limiares; integração Vercel–Sentry; configuração de source maps; e qualquer recurso de `production`. São três trabalhos **distintos e nesta ordem** — **decisão** (esta ADR), **provisionamento** e **instrumentação** —, e misturá-los é o que esta separação existe para impedir ([../delivery/backlog.md](../delivery/backlog.md)).

## Consequências

Positivas:

- **A lacuna de AR-14.1 fecha.** A ferramenta e o escopo passam a estar definidos, e **RNF-018** sai de `parcialmente definido` para `definido` — definição do requisito, não implementação.
- A observabilidade que [ADR-0006](0006-async-work-scheduling-concurrency.md) declarou **obrigatória** ganha destino concreto: a última execução bem-sucedida de cada trabalho periódico tem onde ser vista.
- A fronteira de privacidade é decidida **antes** do primeiro log existir, e não no commit que precisar dele. A decisão 5 é uma lista que a revisão pode conferir, não um princípio a interpretar.
- O mecanismo de proteção não depende só de disciplina: o scrubbing do provedor é padrão (S-7) e `sendDefaultPii` é `false` por padrão (S-6), de modo que o caminho correto é também o caminho de menor esforço.
- Retenção de 30 dias na franquia gratuita (S-8) torna investigável um caso notado dias depois — o que a retenção de horas da alternativa nativa (V-2) não permitiria.
- Isolamento por ambiente é garantido por credencial, não por rótulo: um erro de configuração em `preview` não contamina a telemetria de `production`.

Negativas e trade-offs:

- **Mais uma dependência externa e mais uma fatura potencial** (R-08). Atenuado por começar em plano gratuito e por esta ADR não contratar nada.
- **Franquia baixa e um único usuário** no plano Developer (S-9). Um pico de erros pode esgotar 5 mil eventos e produzir cegueira exatamente quando a observabilidade importa. Acompanhamento é obrigatório, e a resposta é decisão registrada, não upgrade silencioso.
- **Lock-in de SDK.** A instrumentação usará a SDK do provedor, não OpenTelemetry puro. É trade-off aceito: o valor está no agrupamento de erros e nos source maps, que o OpenTelemetry não fornece. Trocar de provedor exigiria reescrever a instrumentação — não o domínio, que por decisão 4 não depende de telemetria.
- **A divergência de S-11 tem custo real de ergonomia:** comparar ambientes exigirá alternar de projeto, em vez de filtrar por tag. Aceito em favor de D-5.
- **`sendDefaultPii` é deprecado** (S-6), e a opção sucessora `dataCollection` terá granularidade maior. A decisão 7 governa a **intenção** — não ampliar coleta por conveniência —, e vale igualmente para a opção que a suceder; a implementação deverá conferir o nome vigente na versão adotada, como a seção 5.5 daquele mesmo contrato já exige para o Better Auth.
- **Sem Session Replay, há classe de defeito de interface mais difícil de diagnosticar.** Aceito: não é requisito do MVP e o custo de privacidade é desproporcional.

## Riscos

| Risco | Tratamento |
| --- | --- |
| Dado protegido enviado à telemetria por descuido | Decisões 5, 6 e 7, com lista explícita e conferível; scrubbing do provedor como segunda camada (S-7); revisão reforçada de dados e pagamentos ([../engineering/ai-agent-workflow.md](../engineering/ai-agent-workflow.md)); R-03 |
| `sendDefaultPii` (ou sucessora) habilitado "para investigar melhor" | Decisão 7: o padrão é `false` e ligá-lo exige decisão registrada com análise de privacidade |
| Session Replay habilitado por conveniência de debug | Decisão 9: fora do MVP; habilitar exige nova análise explícita |
| DSN tratado como segredo, ou segredo tratado como DSN | Decisão 12 e seção 5.8 do contrato: a DSN é pública por natureza e a `SENTRY_AUTH_TOKEN` é segredo server-side; o teste da seção 3.1 é mecânico |
| DSN compartilhado entre ambientes | Decisão 2 e seção 6.1 regra 3; projetos são ilimitados (S-10), logo não há pretexto de economia |
| Telemetria usada como prova de auditoria | Decisão 8, que reafirma AR-14.2; a trilha de auditoria permanece no banco |
| Sinal de AR-14.3 lido como estado de negócio | Decisão 4: o sinal é derivado do estado persistido, nunca a sua fonte |
| Franquia esgotada, produzindo cegueira operacional | Decisão 14 e R-08: franquia acompanhada; a resposta é decisão registrada |
| `SENTRY_AUTH_TOKEN` exigida para desenvolvimento ou CI comum | Decisão 13: condicional; a sua ausência degrada diagnóstico, não desenvolvimento |
| AR-14.3 enfraquecida ao ser instrumentada | Decisão 3, último item: os seis sinais não podem ser reduzidos, reinterpretados nem substituídos |

## Política de evolução

- Trocar de provedor de observabilidade, adotar um segundo provedor, ou adotar coletor/agente próprio exige **ADR própria**, com necessidade comprovada — não preferência e não antecipação de escala.
- **Habilitar Session Replay** exige decisão registrada com análise de privacidade e de necessidade (decisão 9). Não é ajuste de configuração.
- **Habilitar `sendDefaultPii`** ou equivalente exige decisão registrada (decisão 7).
- Acrescentar campo à lista de dados proibidos da decisão 5 **não** exige ADR: a lista é piso, não teto. **Remover** um item dela exige decisão registrada.
- Ajustar taxa de amostragem de tracing, limiar de alerta, conteúdo de dashboard ou nível de log **não** exige ADR: é design, ajustável por medição.
- Adicionar, renomear ou remover variável de observabilidade segue o procedimento da seção 6.2 de [../engineering/environments.md](../engineering/environments.md) — documento primeiro, exemplo junto, código depois.
- Esta ADR deve ser revisitada se o provedor alterar os fatos S-1 a S-11 — em especial retenção (S-8), franquia (S-9) ou o padrão de scrubbing (S-7) —, ou se a operação do MVP demonstrar que os sinais de AR-14.3 não são observáveis como decidido.

## Rastreabilidade

- **Registra:** DEC-039 em [../decisions/decision-log.md](../decisions/decision-log.md).
- **Produzida por:** F1-008, em [../delivery/backlog.md](../delivery/backlog.md).
- **Fecha:** a lacuna de **AR-14.1** (ferramenta concreta e escopo) e leva **RNF-018** de `parcialmente definido` a `definido` em [../product/requirements.md](../product/requirements.md). **Não** fecha decisão aberta: não havia nenhuma ([../decisions/open-decisions.md](../decisions/open-decisions.md)).
- **Não conclui:** o entregável **E-7** da Fase 1, que permanece **não iniciado** — não há projeto Sentry, não há SDK instalado e não há telemetria instrumentada.
- **Depende de:** [ADR-0001](0001-modular-monolith-nextjs.md) (Next.js e App Router) e do contrato de [../engineering/environments.md](../engineering/environments.md).
- **Preserva integralmente:** **AR-14.2**, **AR-14.3** — os seis sinais mínimos, sem redução — e **AR-14.4**; RB-001 a RB-006; DEC-023, DEC-033, DEC-037 e DEC-038; e todos os ADRs anteriores.
- **Sustenta:** [../architecture/overview.md](../architecture/overview.md), seção 14, e a consequência de [ADR-0006](0006-async-work-scheduling-concurrency.md) que declara a observabilidade obrigatória.
- **Amplia:** **R-08**, com mais uma dependência externa e mais uma franquia a acompanhar.
- **Não altera:** nenhuma regra de negócio, nenhum requisito além do status de RNF-018, nenhum ADR anterior e nenhuma decisão de produto.
