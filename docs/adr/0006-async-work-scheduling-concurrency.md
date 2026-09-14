# ADR-0006 — Trabalho assíncrono, agendamento e concorrência no monólito serverless

## Status

Aceito — Fase 0 (2026-09-14). Produzida por F0-022 e registrada como **DEC-038** em [../decisions/decision-log.md](../decisions/decision-log.md).

## Contexto

As decisões já vigentes exigem trabalho que **não** cabe no caminho de uma requisição interativa:

- **Reconciliação de pagamentos.** [product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037) determina que o estado local seja reconstruível por consulta autoritativa **sem nenhuma notificação** (PE-9.2, CI-3), que reversões sejam detectadas por reconciliação periódica sobre pagamentos já confirmados (PE-8.4, CI-8) e que casos de reembolso pendente permaneçam abertos e reconciliados até desfecho real (PE-7.9, CI-7).
- **Reembolso técnico com retentativa.** As duas causas documentadas de falha — saldo insuficiente e prazo de 180 dias — são do provedor e exigem retentar ao longo do tempo (PE-7.8, R-11).
- **Processamento de imagem.** [product/image-policy.md](../product/image-policy.md) (DEC-028) exige decodificar entrada não confiável de até 50 megapixels, regravar e gerar três derivados, e deixou expressamente em aberto o mecanismo de execução.
- **Prazos de retenção.** [product/data-retention-policy.md](../product/data-retention-policy.md) (DEC-033) fixa expurgos por prazo: 24 horas do original temporário, 30 dias do expurgo de conta, 6 meses de log de acesso, 24 meses de trilhas.
- **Publicação de avaliações ao fim da janela.** [product/ratings.md](../product/ratings.md) (DEC-030) exige publicar ao término dos 14 dias corridos, mesmo que só uma das partes tenha avaliado.

Nada nas decisões vigentes diz **como** esse trabalho executa. [ADR-0001](0001-modular-monolith-nextjs.md) proíbe microserviço e API separada no MVP; [ADR-0005](0005-prisma-orm-migrations.md) proíbe que migrations rodem em Serverless Function ou no startup; nenhum ADR trata de execução assíncrona, agendamento ou exclusão mútua entre execuções concorrentes.

Sem esta decisão, a Fase 3 escolheria por conta própria — provavelmente adotando uma fila gerenciada ou um Redis para travas, ambos dependências novas — e o desenho de [architecture/payments-design.md](../architecture/payments-design.md) não teria fundamento para as suas cadências e para a sua garantia de idempotência.

Além disso, dois fatos externos tornam a escolha ingênua **incorreta**, e não apenas subótima. Eles estão na seção de pesquisa.

## Drivers arquiteturais

| # | Driver | Origem |
| --- | --- | --- |
| D-1 | Nenhuma invariante pode depender de um trabalho periódico disparar | DEC-037 (CI-3, CI-6), R-02, R-04 |
| D-2 | Toda execução periódica é idempotente e convergente | PE-9.4, CI-2 |
| D-3 | Execuções sobrepostas não podem produzir efeito duplicado nem corromper estado | RNF-016 |
| D-4 | Nenhuma dependência nova sem necessidade comprovada | ADR-0001, [engineering/conventions.md](../engineering/conventions.md) seção 1.2 |
| D-5 | Operável por equipe pequena, sem plantão e sem infraestrutura própria | DEC-025, ADR-0001 |
| D-6 | Compatível com execução serverless e com as conexões do Neon | ADR-0002, DEC-011 |
| D-7 | Nenhum caminho assíncrono acionável por pessoa usuária final | PE-11.5, CI-11 |

## Pesquisa externa

Consultas realizadas em **2026-09-14**, contra documentação oficial. Cada linha é fato apurado na fonte indicada.

| # | Fonte oficial | Fato apurado |
| --- | --- | --- |
| V-1 | Vercel — *Managing Cron Jobs*, `vercel.com/docs/cron-jobs/manage-cron-jobs` | A entrega do agendamento é **best effort**: a documentação afirma que erros transitórios de rede podem impedir a execução de um disparo, sem que a função execute e sem registro para aquele disparo, e que o mesmo disparo pode ocasionalmente ser invocado **mais de uma vez**. Recomenda explicitamente projetar operações **idempotentes e baseadas em reconciliação**, capazes de reprocessar o trabalho pendente desde a última execução bem-sucedida |
| V-2 | Vercel — *Managing Cron Jobs* | **Falha não é retentada.** Se a execução falhar, a plataforma não a repete |
| V-3 | Vercel — *Managing Cron Jobs* | **Execuções podem se sobrepor**: se um trabalho durar mais que o intervalo, a plataforma pode disparar uma segunda instância com a primeira ainda em execução, com risco de corrida e processamento duplicado. A documentação recomenda mecanismo de trava, além de reduzir o tempo de execução ou aumentar o intervalo |
| V-4 | Vercel — *Managing Cron Jobs* | No plano **Hobby** o agendamento é limitado a **uma execução por dia**, e a invocação pode ocorrer em qualquer ponto da hora indicada. Nos demais planos, a invocação ocorre dentro do minuto especificado |
| V-5 | Vercel — *Managing Cron Jobs* | O disparo é uma requisição `GET` ao caminho configurado na implantação de produção. A proteção recomendada é a variável de ambiente `CRON_SECRET`, enviada automaticamente como cabeçalho `Authorization`, comparada pelo próprio endpoint |
| V-6 | Vercel — *Managing Cron Jobs* / *Cron Jobs* | O agendamento é declarado em `vercel.json` (ou pela Build Output API), sempre em **UTC**; a duração máxima é a mesma das funções |
| V-7 | Vercel — *Vercel Functions Limits* | Duração máxima com fluid compute: Hobby 300 s de padrão e de máximo; Pro e Enterprise 300 s de padrão, 800 s de máximo e 1800 s de máximo estendido em beta. Corpo de requisição e de resposta limitado a **4,5 MB** |
| N-1 | Neon — *Connection pooling* | O endpoint **pooled** usa **PgBouncer em modo transação**. Entre os recursos **não suportados** nesse modo está, explicitamente, o **lock consultivo de sessão**. Conexão direta é recomendada para migrations e para operações que dependam de recursos de sessão |
| P-1 | PostgreSQL — *Explicit Locking* | Lock consultivo de **sessão** (`pg_advisory_lock`) é mantido até ser liberado explicitamente ou a sessão terminar, e **não honra a semântica transacional**: um lock adquirido em transação depois revertida **continua retido** após o rollback. O lock consultivo de **transação** (`pg_advisory_xact_lock`) é liberado automaticamente ao fim da transação e não exige liberação explícita |
| P-2 | PostgreSQL — *Explicit Locking* | `SELECT ... FOR UPDATE` trava as linhas selecionadas contra modificação, remoção e travamento concorrente até o fim da transação; `SKIP LOCKED` pula as linhas que não puderem ser travadas de imediato, em vez de esperar |

### O que esta pesquisa muda

1. **A entrega best effort de V-1 a V-3 transforma D-1 de boa prática em requisito.** Um desenho em que uma invariante dependa do disparo é incorreto nesta plataforma, não apenas frágil: a própria documentação avisa que o disparo pode não ocorrer, pode ocorrer duas vezes e, se falhar, não é retentado.
2. **N-1 combinado com P-1 torna incorreta a trava consultiva de sessão.** Sobre o endpoint pooled do Neon, em modo transação, uma trava de sessão não é suportada e — pela semântica de P-1 — sobreviveria ao fim da transação, vazando para a próxima requisição que reutilizasse aquela conexão de servidor. A trava de **transação** não tem esse defeito: é liberada no commit ou no rollback, e a conexão de servidor permanece atribuída à mesma transação durante toda a sua duração.
3. **V-4 torna o plano Hobby inadequado à operação do MVP, e não apenas ao uso comercial.** A reconciliação de pagamentos precisa de cadência de minutos ([payments-design.md](../architecture/payments-design.md), PD-3.4); uma execução diária não atende. Isso acrescenta fundamento **técnico** a uma restrição que até aqui era apenas comercial (DEC-011, R-09).

Nenhum fato encontrado contradiz decisão vigente. O item 3 **reforça** DEC-011 em vez de alterá-la.

## Alternativas consideradas

### A — PostgreSQL como fila e autoridade de trava, com agendamento da plataforma

O estado do trabalho pendente já vive no banco (tentativas não terminais, reembolsos pendentes, imagens em processamento, casos abertos). O agendador da plataforma invoca endpoints protegidos que **reclamam** lotes de trabalho por seleção travada com `SKIP LOCKED` e convergem o estado.

### B — Fila gerenciada ou broker de mensagens

Serviço externo de fila, com consumidores acionados por mensagem, entrega ao menos uma vez e retentativa gerenciada.

### C — Processo de trabalho dedicado, de execução contínua

Um segundo componente sempre ativo, fora do modelo serverless, executando laços de reconciliação.

### D — Redis para travas distribuídas

Redis gerenciado apenas como autoridade de exclusão mútua, mantido o restante em A.

## Critérios comparativos

| Critério | A — Postgres + agendador | B — Fila gerenciada | C — Processo dedicado | D — Redis para travas |
| --- | --- | --- | --- | --- |
| D-1 Invariante independente do disparo | Alcançável: o estado pendente está no banco e é reencontrável | Alcançável, mas o estado passa a viver em dois lugares | Alcançável | Igual a A |
| D-2 Idempotência | Natural: o trabalho é derivado do estado, não de uma mensagem | Exige deduplicação própria, pois a entrega é ao menos uma vez | Natural | Igual a A |
| D-3 Execuções sobrepostas | Resolvido por `FOR UPDATE SKIP LOCKED` (P-2), sem trava global | Resolvido pelo broker, com custo de configuração | Resolvido por ser único, ao custo de ponto único de falha | Resolvido, com dependência nova |
| D-4 Sem dependência nova | **Sim** | Não | Não | Não |
| D-5 Operável por equipe pequena | Alta: nada a operar além do que já existe | Média: mais um serviço, mais uma fatura, mais um modo de falha | Baixa: exige processo sempre ativo e supervisão | Média |
| D-6 Serverless e Neon | Compatível, observadas N-1 e P-1 | Compatível | Incompatível com o modelo de deploy vigente (ADR-0001) | Compatível |
| D-7 Não acionável por cliente | Endpoint protegido por segredo (V-5) | Igual | Igual | Igual |
| Custo de decisão | Baixo | Alto: escolher provedor, homologar, versionar contrato | Alto: contraria ADR-0001 | Médio, sem benefício sobre A |

**B** e **D** são rejeitadas por D-4: nenhuma necessidade comprovada as justifica. Uma fila gerenciada resolve entrega e retentativa — problemas que o TROQ já resolve por reconciliação, porque **precisa** resolvê-los por reconciliação de qualquer forma (CI-3). Redis para travas é dependência nova para um problema que o PostgreSQL resolve com P-1 e P-2, ambos já disponíveis. **C** é rejeitada por contrariar ADR-0001 e D-5.

## Decisão

1. **PostgreSQL é a fila de trabalho e a autoridade de exclusão mútua.** Não se adota broker de mensagens, fila gerenciada, Redis, cache distribuído nem qualquer componente novo para esta finalidade. O trabalho pendente é **derivado do estado persistido**, nunca de uma mensagem em trânsito.

2. **O agendamento é o da plataforma de deploy já adotada.** Os trabalhos periódicos são declarados na configuração do projeto e invocados como endpoints da própria aplicação. Nenhum agendador externo é introduzido.

3. **Nenhuma invariante depende de um trabalho periódico disparar.** Todo trabalho periódico é **higiene e convergência**. Onde uma regra depende do tempo, o estado correto é resolvido no **instante da escrita**, dentro da transação que aplica o efeito, ou **derivado no instante da leitura**. Um desenho em que a corretude dependa do disparo é defeito, não escolha de cadência. Fundamento: V-1, V-2 e V-3.

4. **Toda execução periódica é idempotente e convergente.** Executá-la N vezes sobre o mesmo caso produz o mesmo resultado; uma execução perdida é recuperada pela seguinte, que reprocessa o pendente desde a última convergência. Nenhum trabalho pressupõe ter sido executado na cadência nominal.

5. **Reclamação de trabalho por `FOR UPDATE SKIP LOCKED`.** Cada execução reclama um lote de casos por seleção travada que pula as linhas já travadas por outra execução (P-2). Execuções sobrepostas — hipótese normal por V-3 — processam conjuntos disjuntos. Uma execução interrompida libera suas linhas ao fim da transação, e a seguinte as reencontra.

6. **Exclusão mútua por trava de escopo de transação, nunca de sessão.** Onde for necessário serializar operações sobre um mesmo agregado — notadamente a alocação de vaga por anúncio —, usa-se `pg_advisory_xact_lock` ou trava de linha. **É proibido** usar `pg_advisory_lock` de sessão no caminho da aplicação. Fundamento: N-1 e P-1 — a trava de sessão não é suportada sobre o endpoint pooled em modo transação e, por não honrar a semântica transacional, vazaria para outra requisição na mesma conexão de servidor.

7. **Trava é comportamento; restrição de banco é garantia.** Onde existir invariante de negócio, ela é protegida por **restrição do banco** — índice único, índice único parcial, restrição de domínio —, e a trava serve apenas para evitar colisões e retentativas. Nenhum desenho em que a corretude dependa exclusivamente da trava é aceito. Aplicação concreta: [architecture/data-model.md](../architecture/data-model.md), DM-6.2 e DM-6.4.

8. **Orçamento de tempo e processamento em lotes.** Toda execução periódica tem orçamento de tempo explícito e processa em lotes, terminando com o que couber e deixando o resto para a execução seguinte. Motivo: a duração é limitada (V-7) e a falha não é retentada (V-2); um trabalho que tenta esgotar a fila é interrompido no meio, que é o pior desfecho possível.

9. **Endpoints de trabalho protegidos por segredo, e nunca acionáveis por pessoa usuária final.** Cada endpoint de trabalho periódico exige o segredo de agendamento fornecido pela plataforma como cabeçalho de autorização (V-5), recusa qualquer chamada sem ele e não é alcançável por navegação, formulário, ação de cliente ou parâmetro. Isso satisfaz D-7, PE-11.5 e CI-11. O segredo é credencial server-side por ambiente, sujeito a RNF-015.

10. **Reprocessar é sempre seguro.** Todo trabalho pode ser executado manualmente por operação, a qualquer momento, sem efeito colateral distinto do da execução agendada. Um trabalho que só é correto se executado exatamente uma vez viola a decisão 4.

11. **O plano Hobby não suporta a operação do MVP.** Por V-4, o Hobby limita o agendamento a uma execução diária, incompatível com a cadência de minutos que a reconciliação de pagamentos exige. Qualquer ambiente em que se pretenda exercitar o fluxo de pagamento de ponta a ponta precisa de plano que permita a cadência real. Isto **reforça** DEC-011 e R-09, e não os altera.

12. **O que esta ADR não decide.** Cadências concretas de cada trabalho, tamanho de lote, política de recuo entre retentativas e orçamento numérico de tempo são **design**, definidos em [architecture/payments-design.md](../architecture/payments-design.md) (PD-3.4, PD-10.3, PD-10.6) e ajustáveis por medição sem nova decisão registrada. Esta ADR também **não** autoriza mover migrations para dentro de função ou de trabalho periódico: [ADR-0005](0005-prisma-orm-migrations.md), decisão 7, permanece integralmente vigente.

## Consequências

Positivas:

- Nenhuma dependência nova entra no projeto (D-4). A superfície operacional continua sendo aplicação, banco e provedores já decididos.
- A garantia que DEC-037 mais exige — reconstruir o estado sem nenhuma notificação (CI-3) — é a **mesma** propriedade que torna o desenho imune à entrega best effort do agendamento. Uma decisão paga por duas exigências.
- A proibição da trava de sessão elimina, antes de existir, uma classe de defeito que seria intermitente, difícil de reproduzir e específica do ambiente de produção.
- A decisão 7 mantém a corretude em restrições de banco, que não dependem de ordem de execução, de disponibilidade de trava nem de acerto da aplicação.
- Reprocessamento seguro (decisão 10) dá à operação uma ferramenta de recuperação sem procedimento especial.

Negativas e trade-offs:

- **Não há retentativa gerenciada.** A convergência depende da execução seguinte, e não de um mecanismo de repetição do agendador. Mitigado pelas decisões 3 e 4: a execução seguinte reprocessa o pendente por completo.
- **O banco acumula uma responsabilidade adicional.** Reclamação de trabalho e travas competem por conexão e por recursos com o tráfego interativo. Mitigado pelo processamento em lotes (decisão 8) e pela observabilidade mínima de [architecture/overview.md](../architecture/overview.md), AR-14.3. Se a medição futura demonstrar contenção real, será decisão nova e registrada — não um desvio silencioso.
- **A latência de convergência é a cadência do trabalho**, não a de uma mensagem. Para o MVP isso é aceitável: o caminho rápido de confirmação continua sendo a notificação, e a reconciliação é a garantia, não a via primária.
- **Custo de plano.** A decisão 11 antecipa que a operação exige plano pago, com fundamento técnico além do comercial.
- **A observabilidade passa a ser obrigatória**, não opcional: sem saber a última execução bem-sucedida de cada trabalho, uma falha silenciosa é indistinguível de ausência de trabalho (AR-14.3).

## Riscos

| Risco | Tratamento |
| --- | --- |
| Alguém escrever um trabalho cuja corretude dependa do disparo | Decisão 3, verificada em revisão reforçada de pagamentos e dados ([ai-agent-workflow.md](../engineering/ai-agent-workflow.md)) |
| Trava consultiva de sessão usada por engano | Decisão 6, com o fundamento factual N-1 e P-1 registrado para que não seja reaberto por suposição |
| Execuções sobrepostas produzindo efeito duplicado | Decisão 5, verificada pelo teste T-18 de [payments-design.md](../architecture/payments-design.md) |
| Trabalho interrompido por limite de duração | Decisão 8; lotes e orçamento explícito |
| Endpoint de trabalho exposto e acionável | Decisão 9; segredo obrigatório e recusa incondicional sem ele |
| Contenção no banco sob carga | Lotes, observabilidade de AR-14.3 e revisão desta ADR se a medição indicar |
| Deploy antigo continuar executando trabalhos após reversão de versão | A documentação da plataforma registra que agendamentos ativos não são atualizados por reversão instantânea; mitigado pelas decisões 4 e 10, que tornam a execução de uma versão anterior inofensiva por ser idempotente e convergente |

## Política de evolução

- Adotar fila gerenciada, broker, Redis ou qualquer componente novo para trabalho assíncrono exige **ADR própria**, com necessidade **comprovada por medição** — não por preferência e não por antecipação de escala.
- Mudar a cadência, o tamanho do lote ou a política de retentativa **não** exige ADR: é design (decisão 12).
- Esta ADR deve ser revisitada se a plataforma alterar as garantias de V-1 a V-7, se o Neon alterar o comportamento de N-1, ou se a medição da Fase 3 demonstrar contenção no banco.

## Rastreabilidade

- **Registra:** DEC-038 em [../decisions/decision-log.md](../decisions/decision-log.md).
- **Produzida por:** F0-022, em [../delivery/backlog.md](../delivery/backlog.md).
- **Fecha:** nenhuma decisão aberta. Não havia decisão aberta na Fase 0 quando esta ADR foi escrita; o tema era lacuna de **design** que se mostrou estruturante ao ser desenhado.
- **Depende de:** [ADR-0001](0001-modular-monolith-nextjs.md), [ADR-0002](0002-postgresql-neon.md) e [ADR-0004](0004-mercado-pago-pix.md).
- **Preserva integralmente:** [ADR-0005](0005-prisma-orm-migrations.md), em especial a proibição de executar migrations em função ou no startup; RB-001 a RB-006; DEC-037 e todas as decisões de produto.
- **Sustenta:** [architecture/overview.md](../architecture/overview.md) seção 15, [architecture/data-model.md](../architecture/data-model.md) DM-6.3 e DM-9.4, e [architecture/payments-design.md](../architecture/payments-design.md) PD-3.4, PD-10.3 e PD-10.6.
- **Reforça:** DEC-011 e R-09, com fundamento técnico novo (decisão 11).
- **Mitiga:** R-02 e R-04, ao dar mecanismo à atomicidade e à reconciliação que ambos apontavam como residuais.
- **Não altera:** nenhuma regra de negócio, nenhum ADR anterior e nenhuma decisão de produto.
