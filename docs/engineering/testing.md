# Estratégia de testes — TROQ

Base normativa de testes para a implementação da aplicação. Este documento é **preparatório da Fase 1**: define níveis, stack, prioridade por risco e política de test doubles, para que o futuro scaffold e o futuro CI não precisem rediscutir esses padrões.

**O que este documento não faz:** não instala dependência, não cria arquivo de teste, não cria configuração de test runner, não implementa funcionalidade; não fecha decisão aberta; não define comportamento funcional de pagamentos.

Documento irmão: [conventions.md](conventions.md). O que aqui se chama "código testável" é o código de domínio descrito na seção 2 daquele documento — regra fora de componente React e fora de handler de rota.

## 1. Princípios

1. **Teste existe para provar invariante, não para produzir número.** A pergunta é sempre "qual afirmação do produto este teste torna impossível de quebrar em silêncio".
2. **Cobertura é de risco, não de percentual.** Meta artificial de cobertura percentual **não** é usada como critério de aceite nem como substituto de cobertura de risco. Percentual de linhas pode ser observado como sinal diagnóstico; ele nunca é o objetivo.
3. **O nível do teste segue a garantia que se quer.** Uma garantia que depende do banco não pode ser provada sem banco. Ver seções 2 e 6.
4. **Teste que nunca executou a condição real relevante não aprova nada.** Ver seção 6.
5. **Defeito corrigido ganha teste que falha antes da correção.** Regressão em regra crítica não volta em silêncio.
6. **Teste é código sob as mesmas convenções**: legível, sem dado pessoal real, sem segredo, determinístico e independente de ordem de execução.

## 2. Níveis de teste

### 2.1 Testes unitários

- **O que:** regra de domínio e caso de uso isolados, sem I/O, sem rede, sem banco e sem framework.
- **Quando:** sempre que houver decisão, cálculo, transição de estado, invariante ou validação. É o nível padrão para lógica pura.
- **Por que:** rápidos o suficiente para rodar a toda hora e precisos o suficiente para apontar a causa.
- **Limite:** não provam integração, não provam consulta, não provam concorrência e não provam constraint de banco.

### 2.2 Testes de integração

- **O que:** a colaboração real entre partes — caso de uso, camada de dados, banco, transação, constraint, índice — e o comportamento de Route Handlers e Server Actions como fronteira.
- **Quando:** sempre que a garantia depender de mais de uma peça em conjunto, e obrigatoriamente quando depender do banco (transação, restrição de unicidade, bloqueio, `ON CONFLICT`).
- **Por que:** as garantias mais caras do TROQ — limite de solicitações pagas, idempotência, autorização de liberação — vivem na fronteira entre código e banco.
- **Ambiente:** banco real efêmero, ou ambiente equivalente que preserve o comportamento transacional e as restrições do PostgreSQL ([ADR-0002](../adr/0002-postgresql-neon.md)). Ver seção 6.

### 2.3 Testes de componentes

- **O que:** comportamento observável de componentes de interface: o que a pessoa usuária vê, o que consegue fazer e o que o componente comunica.
- **Quando:** quando o componente carrega comportamento próprio que agrega valor testar — estado de formulário, validação visível, estados de carregamento, erro e vazio, acessibilidade do fluxo.
- **Quando não:** componente puramente apresentacional, sem lógica. Teste que apenas repete o JSX é custo sem garantia.
- **Regra:** testa-se comportamento e papéis acessíveis, não estrutura interna nem detalhe de implementação.

### 2.4 Testes E2E

- **O que:** jornadas críticas atravessando a aplicação como a pessoa usuária a atravessa.
- **Quando:** para as jornadas de ponta a ponta cujo valor está exatamente na composição — publicar e consultar anúncio, solicitar e pagar, escolher e receber contato, encerrar e avaliar, denunciar e moderar.
- **Escopo deliberadamente pequeno:** E2E cobre caminho principal e poucas variações de alto valor. Matriz de casos pertence aos níveis inferiores.
- **Nesta tarefa:** esta camada **não** é introduzida. Nenhuma dependência de E2E é instalada ou configurada agora.

### 2.5 Testes de contrato e de integração com serviços externos

- **O que:** a conformidade com o contrato de serviços externos (provedor de email, armazenamento S3-compatible, gateway de pagamento quando houver um homologado) e o comportamento da aplicação diante das respostas e eventos desse serviço.
- **Quando:** sempre que houver integração externa cuja mudança de contrato quebre a aplicação em silêncio.
- **Como:** o serviço externo é a fronteira legítima de substituição (seção 6). Quando o provedor oferecer ambiente de teste ou sandbox, ele é usado para validar o contrato real; testes internos validam o comportamento da aplicação diante de respostas conhecidas.
- **Limite atual:** o gateway foi homologado em [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036) e as exceções de pagamento foram definidas em [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037), mas o contrato concreto de teste só é fixado quando o design de pagamentos (F0-022) existir. Até lá, nenhum contrato de gateway é normatizado aqui.

## 3. Stack de testes

| Camada | Ferramenta | Situação |
| --- | --- | --- |
| Unitários e integração leve | **Vitest 5.x** | Runner oficial do projeto |
| Comportamento de componentes | **React Testing Library** | Sobre o Vitest |
| E2E | **Playwright** | Escolha **prevista** para quando a camada E2E for introduzida |

- **Nenhuma dessas dependências é instalada ou configurada nesta tarefa.** A materialização pertence ao scaffold.
- Vitest e React Testing Library são normativos: testes unitários, de integração leve e de componentes usam essa combinação.
- Playwright é a escolha prevista e registrada para E2E. Registrar a escolha evita rediscussão futura; ela não autoriza instalação nem configuração agora, e a introdução efetiva da camada E2E é trabalho de fase posterior.
- Os comandos `npm run test` e `npm run test:ci` ([conventions.md](conventions.md), seção 5.1) são a interface estável da suíte. `test:ci` é não interativo e determinístico.

## 4. Prioridade por risco

Estas áreas recebem **cobertura reforçada**: mais casos, mais níveis e revisão reforçada ([ai-agent-workflow.md](ai-agent-workflow.md), seção 8). Uma entrega que toque qualquer uma delas sem teste correspondente não está pronta.

| Área | Por que é de risco alto | Nível mínimo esperado |
| --- | --- | --- |
| Autenticação | Porta de entrada de tudo | Unitário + integração |
| Autorização | Interface não autoriza; a falha é silenciosa e grave | Integração, no caminho real |
| Pagamentos | Valor exato, cobrança definitiva, dinheiro de terceiros | Unitário + integração + contrato |
| Limite de 3 solicitações pagas (RB-003) | Invariante numérica sob concorrência | Integração com banco real e concorrência |
| Concorrência | Falha só aparece sob execução simultânea | Integração com banco real |
| Webhooks e idempotência | Entrega duplicada e fora de ordem são normais, não exceção | Integração |
| Liberação de WhatsApp/telefone | Dado protegido; vazamento é irreversível | Integração + verificação de payload |
| Encerramento da negociação | Irreversível; habilita avaliação | Unitário + integração |
| Avaliações | Elegibilidade, janela, publicação cega, imutabilidade | Unitário + integração |
| Moderação | Remoção é terminal; afeta terceiros | Integração |
| Retenção e exclusão de dados | Obrigação legal, efeito irreversível | Integração |
| Migrations | Aplicadas em ambiente compartilhado; erro é caro | Validação contra banco efêmero em CI |
| Validações de segurança | Entrada externa é hostil por padrão | Unitário + integração na fronteira |

Fora dessas áreas vale o julgamento normal: testar onde há decisão, e não testar o que é trivial e estável.

## 5. Regras críticas a provar

Os futuros testes devem provar explicitamente, entre outras invariantes, as seis regras homologadas em [../product/business-rules.md](../product/business-rules.md). A lista abaixo enuncia o que precisa ser provado; ela **não** altera, amplia nem reinterpreta nenhuma regra.

| Regra | Invariante que o teste deve provar |
| --- | --- |
| **RB-001** | O contato (WhatsApp/telefone) só chega a quem foi **escolhido** e tem **pagamento aprovado**. Quem não foi escolhido, e quem foi escolhido sem pagamento aprovado, não recebe o contato por nenhum caminho — resposta, payload, cache público ou log. A liberação é autorizada no servidor e auditada |
| **RB-002** | Nenhuma avaliação é registrada enquanto a negociação não estiver encerrada no sistema. Com negociação `closed`, a avaliação é permitida nos termos de [../product/ratings.md](../product/ratings.md) |
| **RB-003** | Nunca existem mais de 3 solicitações pagas por anúncio. A quarta tentativa é recusada, **inclusive sob solicitações concorrentes**. A demonstração de interesse, sendo gratuita, não ocupa vaga; a reseleção não cria vaga, não reinicia o limite e não permite uma quarta paga |
| **RB-004** | Não há reembolso pelo fato de o solicitante não ter sido escolhido. O valor cobrado é exatamente R$ 0,99, sem erro de arredondamento ([conventions.md](conventions.md), seção 4) |
| **RB-005** | Nenhuma superfície pública expõe localização mais precisa que cidade/UF |
| **RB-006** | Um anúncio com item proibido, decidido conforme a política vigente ([../product/prohibited-items.md](../product/prohibited-items.md)), é removido pelas transições administrativas previstas e deixa de ser público |

**Cenários de exceção de pagamento:** o comportamento esperado deixou de ser indefinido e está em [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037), que é a fonte das asserções. Os testes devem provar, no mínimo, que uma mesma tentativa lógica nunca gera duas cobranças; que dois pagamentos acreditados para a mesma reserva produzem uma única solicitação paga válida, consomem uma única vaga e levam o excedente a reembolso; que pagamento acreditado dentro da janela vale mesmo quando a confirmação chega atrasada; que pagamento acreditado fora da janela não cria solicitação nem consome vaga; que estado incerto ou não mapeado nunca concede direito de negócio; e que reversão posterior não devolve vaga nem revoga contato já liberado. A escolha de mecanismo — deduplicação, reconciliação, atomicidade, tempos — continua sendo design de F0-022, e nenhum teste deve presumir um mecanismo que ainda não foi desenhado. O termo `chargeback` não é usado para Pix.

## 6. Concorrência, idempotência e test doubles

### 6.1 Concorrência e idempotência — requisitos futuros de teste

Estes são requisitos de teste registrados agora e implementados quando a funcionalidade correspondente existir. Nenhum deles é implementado nesta tarefa. O comportamento funcional que eles exercem está definido em [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037).

- **Concorrência real no banco para o limite de vagas.** O limite de RB-003 é exercido com execuções realmente simultâneas contra um banco real, provando que a invariante se sustenta sob disputa — não apenas em execução sequencial.
- **Webhook duplicado.** O mesmo evento entregue mais de uma vez não produz efeito duplicado nem estado inconsistente.
- **Webhook fora de ordem.** Eventos que chegam em ordem diferente da ordem em que ocorreram não corrompem o estado.
- **Retry.** Reenvio do provedor, ou nova tentativa da própria aplicação, é seguro.
- **Operações idempotentes.** Operações que precisam ser idempotentes são exercidas duas vezes ou mais, provando que o resultado final é o mesmo.
- **Race conditions de seleção.** Escolhas simultâneas do anunciante não produzem duas negociações `active` originadas por escolhas sequenciais do mesmo anúncio, nem violam as pré-condições de reseleção.
- **Autorização de liberação de contato.** Tentativas concorrentes e tentativas de ator não autorizado não liberam contato.

O **que** cada evento de pagamento significa e **qual** deve ser o desfecho de cada exceção pertence ao design de pagamentos e às decisões abertas; este documento normatiza apenas que essas condições precisam ser exercidas por teste real quando o comportamento estiver definido.

### 6.2 Política de test doubles

- **Mock apenas em fronteira externa**, e apenas quando adequado: provedor de email, armazenamento de objetos, gateway de pagamento, relógio quando o teste depende de tempo. Fora disso, usa-se o código real.
- **Nunca se mocka a própria regra que está sendo testada.** Substituir o objeto sob teste, ou a peça que carrega a invariante, produz um teste que prova apenas que o mock funciona.
- **Não se mocka o banco em teste que depende de constraint, transação, bloqueio ou concorrência.** Esses testes usam banco real efêmero (ou ambiente equivalente que preserve o mesmo comportamento). Um banco em memória com semântica diferente não prova nada sobre a garantia real.
- **Nenhuma aprovação baseada em teste que nunca executou a condição real relevante.** Um teste de concorrência que roda sequencialmente, um teste de idempotência que envia o evento uma única vez e um teste de autorização que não exercita o ator não autorizado não aprovam a regra — mesmo passando.
- Dado de teste é sintético. Nenhum dado pessoal real, nenhuma credencial real e nenhum telefone real em fixture, seed ou snapshot ([ai-agent-workflow.md](ai-agent-workflow.md), seção 7).

## 7. Testes no CI

O CI é materializado na Fase 1 e não faz parte desta tarefa. Ficam registradas as expectativas que ele deve atender:

- `format:check`, `lint`, `typecheck`, `test:ci` e `build` executam em toda PR ([conventions.md](conventions.md), seção 5.1).
- Testes que dependem de banco rodam contra banco efêmero do próprio pipeline, jamais contra staging ou produção.
- A validação de migration em CI de PR ocorre contra banco efêmero, conforme [ADR-0005](../adr/0005-prisma-orm-migrations.md).
- Teste intermitente é tratado como defeito: investiga-se a causa. Marcar como `skip` ou reexecutar até passar não é solução ([conventions.md](conventions.md), seção 6, item 8).

## 8. Referências

- [conventions.md](conventions.md) — convenções de engenharia
- [ai-agent-workflow.md](ai-agent-workflow.md) — modo operacional, relatório obrigatório e proporcionalidade de revisão
- [../product/business-rules.md](../product/business-rules.md) — RB-001 a RB-006
- [../product/requirements.md](../product/requirements.md) — RF-xxx e RNF-xxx, em especial RNF-016 (consistência sob concorrência)
- [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md) — transações e restrições do PostgreSQL
- [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md) — migrations e validação em CI
- [../decisions/open-decisions.md](../decisions/open-decisions.md) — decisões ainda abertas
