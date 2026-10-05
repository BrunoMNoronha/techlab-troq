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
- **Contrato concreto:** o gateway foi homologado em [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036), as exceções de pagamento foram definidas em [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037) e o contrato concreto de teste foi fixado por F0-022 em [../architecture/payments-design.md](../architecture/payments-design.md), seção 13 (casos T-1 a T-18), complementado por [../architecture/contact-release.md](../architecture/contact-release.md), seção 10 (casos C-1 a C-11). Esses casos são o mínimo exigido pelo gate da Fase 3.

## 3. Stack de testes

| Camada | Ferramenta | Situação |
| --- | --- | --- |
| Unitários e integração leve | **Vitest 5.x** | Runner oficial do projeto |
| Comportamento de componentes | **React Testing Library** | Sobre o Vitest |
| E2E | **Playwright** | Escolha **prevista** para quando a camada E2E for introduzida |

- **Nenhuma dessas dependências é instalada ou configurada nesta tarefa.** A materialização pertence ao scaffold.
- Vitest e React Testing Library são normativos: testes unitários, de integração leve e de componentes usam essa combinação.
- Playwright é a escolha prevista e registrada para E2E. Registrar a escolha evita rediscussão futura; ela não autoriza instalação nem configuração agora, e a introdução efetiva da camada E2E é trabalho de fase posterior.
- Os comandos `pnpm test` e `pnpm test:ci` ([conventions.md](conventions.md), seção 5.1) são a interface estável da suíte. `test:ci` é não interativo e determinístico.

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

**Cenários de exceção de pagamento:** o comportamento esperado deixou de ser indefinido e está em [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037), que é a fonte das asserções. Os testes devem provar, no mínimo, que uma mesma tentativa lógica nunca gera duas cobranças; que dois pagamentos acreditados para a mesma reserva produzem uma única solicitação paga válida, consomem uma única vaga e levam o excedente a reembolso; que pagamento acreditado dentro da janela vale mesmo quando a confirmação chega atrasada; que pagamento acreditado fora da janela não cria solicitação nem consome vaga; que estado incerto ou não mapeado nunca concede direito de negócio; e que reversão posterior não devolve vaga nem revoga contato já liberado. A escolha de mecanismo — deduplicação, reconciliação, atomicidade, tempos — foi feita por F0-022 em [../architecture/payments-design.md](../architecture/payments-design.md), e é contra esse desenho que os testes são escritos. O termo `chargeback` não é usado para Pix.

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

O **que** cada evento de pagamento significa está em [../product/payment-exceptions.md](../product/payment-exceptions.md) (DEC-037) e **como** ele é tratado está em [../architecture/payments-design.md](../architecture/payments-design.md); este documento normatiza que essas condições precisam ser exercidas por teste real, e o contrato concreto está na seção 13 daquele desenho.

### 6.2 Política de test doubles

- **Mock apenas em fronteira externa**, e apenas quando adequado: provedor de email, armazenamento de objetos, gateway de pagamento, relógio quando o teste depende de tempo. Fora disso, usa-se o código real.
- **Nunca se mocka a própria regra que está sendo testada.** Substituir o objeto sob teste, ou a peça que carrega a invariante, produz um teste que prova apenas que o mock funciona.
- **Não se mocka o banco em teste que depende de constraint, transação, bloqueio ou concorrência.** Esses testes usam banco real efêmero (ou ambiente equivalente que preserve o mesmo comportamento). Um banco em memória com semântica diferente não prova nada sobre a garantia real.
- **Nenhuma aprovação baseada em teste que nunca executou a condição real relevante.** Um teste de concorrência que roda sequencialmente, um teste de idempotência que envia o evento uma única vez e um teste de autorização que não exercita o ator não autorizado não aprovam a regra — mesmo passando.
- Dado de teste é sintético. Nenhum dado pessoal real, nenhuma credencial real e nenhum telefone real em fixture, seed ou snapshot ([ai-agent-workflow.md](ai-agent-workflow.md), seção 7).

## 7. Testes no CI

O CI de validação existe desde antes da Fase 1 (`.github/workflows/ci.yml`, job `validate`). Desde F1-004 existe também uma validação **pós-merge** contra o banco de `preview` (`.github/workflows/migrate-preview.yml`; [database.md](database.md), seção 15). Desde F2-013 (#51), o mesmo `ci.yml` tem o job `integration`, com as suítes que escrevem num PostgreSQL efêmero do próprio job. São três coisas distintas:

| | CI de PR — `Validação (format, lint, typecheck, test, build)` | CI de PR — `Integração (PostgreSQL efêmero)` | Validação pós-merge contra o Neon |
| --- | --- | --- | --- |
| Quando | toda PR e todo push em `main` | toda PR e todo push em `main` | push em `main` que toque migrations, schema, configuração do Prisma, dependências, `src/persistence/**` ou o próprio workflow; ou disparo manual sobre `main` |
| O que roda | `format:check`, `lint`, `typecheck`, `test:ci`, `build` ([conventions.md](conventions.md), seção 5.1) | `prisma migrate deploy` num banco vazio, `build`, servidor `pnpm start -p 3100` e `pnpm test:integration` com `INTEGRATION_EPHEMERAL_DB=1` e as duas provas HTTP; as suítes do R2 real ficam puladas | `prisma migrate deploy`, `prisma migrate status`, `pnpm test:integration` (só as suítes somente leitura) |
| Banco | **nenhum** — `test:ci` é determinístico e sem banco | PostgreSQL 17 de serviço do próprio job, descartado ao fim; segredos (`BETTER_AUTH_SECRET`, `CRON_SECRET`) gerados no job e mascarados | o Neon de `preview`, compartilhado e alinhado a `main`; nunca produção |
| Papel na governança | é o required status check de `main` | **ainda não** é required check: torná-lo obrigatório é mudança do ruleset `Protect main`, decisão do responsável pelo repositório | **não** é required check: executa depois do merge e não bloqueia PR |

Regras e expectativas:

- Testes que dependem de banco em **CI de PR** devem rodar contra banco efêmero do próprio pipeline, jamais contra `preview` ou produção. Esse job é o `integration` do `ci.yml`, criado por F2-013 (#51): ele aplica o histórico inteiro por `migrate deploy` num banco vazio, que é a validação de migration em CI de PR prevista por [ADR-0005](../adr/0005-prisma-orm-migrations.md) ([database.md](database.md), seção 11), e roda as suítes que escrevem. A prova de migration local, em banco descartável ([database.md](database.md), seção 12), continua valendo para criar e revisar migrations.
- `pnpm test:integration` é **somente leitura**: conecta, executa `SELECT 1`, lê `_prisma_migrations` e faz `count()` em tabelas do schema ([database.md](database.md), seção 13.7). É por isso que a mesma suíte pode rodar tanto contra banco descartável quanto, pós-merge, contra o Neon compartilhado: ela não escreve, não faz seed e não altera estado. Um teste futuro que precise escrever não entra nessa suíte sem banco efêmero próprio. A primeira suíte que escreve, `src/modules/identity/auth-flow.integration.test.ts` (login, logout, revogação e isolamento de sessões — #42 / F2-004), só executa com `INTEGRATION_EPHEMERAL_DB=1`, declaração explícita de que `DATABASE_URL` aponta para um banco efêmero próprio; sem essa variável ela é pulada, e a execução pós-merge contra o Neon de `preview` continua somente leitura. Os dados são sintéticos e removidos ao final.
- O pipeline de imagens (#46 / F2-008) tem duas suítes que escrevem. `src/modules/media/media-pipeline.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1` e usa R2 simulado em memória. `src/modules/media/media-r2.integration.test.ts` exige **também** `R2_INTEGRATION=1` e as variáveis `R2_*` do bucket de **`development`** (recusa bucket cujo nome não termine em `-development`); ela cria e apaga objetos reais e confere que o bucket termina vazio. A primeira roda no job `integration` do CI; a segunda, que exige o R2 real, não roda no CI. Nenhuma das duas roda no pós-merge. A medição de memória de 50 MP fica fora do Vitest, em `scripts/media-benchmark/` (Docker `--memory=2g --cpus=1`).
- Entrega e limpeza de mídia (#47 / F2-009): `src/modules/media/media-cleanup.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1` e usa R2 em memória com ganchos de falha; `src/modules/media/media-delivery-r2.integration.test.ts` exige também `R2_INTEGRATION=1` e o bucket de `development`, e executa a rota `/media` com sessões Better Auth reais. As duas estacionam (`due_at = 'infinity'`) as pendências de exclusão de outras suítes em vez de apagá-las. Suítes que falam com o R2 real declaram limite de teste e de hook explícito: o `afterAll` de limpeza passa de 8 s, perto do padrão de 10 s, e estourá-lo deixava objetos sintéticos no bucket.
- Ciclo de vida do anúncio (#48 / F2-010): `src/modules/listing/listing-lifecycle.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1`, usa sessões Better Auth reais e não fala com o R2. As corridas são determinísticas: uma transação concorrente segura a trava do anúncio e a ação precisa esperar o COMMIT. O rollback da auditoria usa uma restrição `CHECK … NOT VALID` temporária em `audit_events`, removida no próprio teste e de novo no `afterAll`. A suíte só limpa as pendências de exclusão das imagens que criou.
- Reserva atômica de vaga (#93 / F3-003): `src/modules/request/reservation.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1`, usa sessões Better Auth reais de várias pessoas ao mesmo tempo (o mock de `headers()` lê o cookie de um `AsyncLocalStorage`, uma sessão por chamada) e não fala com o provedor de pagamento. O T-1 de [payments-design.md](../architecture/payments-design.md), PD-13, roda de duas formas: com uma transação segurando a trava do anúncio, o teste só a solta depois de ver em `pg_stat_activity` os N backends distintos esperando por ela (N = 8, cabendo no pool de 10 do `pg`), e sem trava segurada, com os N disparos livres. A suíte também cobre DEC-041 (uma reserva viva por conta em cada anúncio: recusa, nova reserva depois de vencer, N pedidos simultâneos da mesma conta com a trava segurada e violação direta do índice parcial), a expiração no ato da alocação, o encerramento pela action composta e a corrida entre encerramento e nova solicitação. O rollback usa a mesma restrição `CHECK … NOT VALID` temporária em `audit_events`. A prova por mutação (sem trava, sem índice e sem os dois) é local e está registrada na PR de F3-003; nenhuma mutação fica no código.
- Cobrança Pix da reserva (#95 / F3-005): `src/modules/request/charge.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1` e usa um provedor **simulado** local (`node:http`) que guarda as orders por `X-Idempotency-Key`, como o Mercado Pago. Ele consegue criar a order e **derrubar a resposta** (o socket cai), que é como se prova o T-15 e a recuperação de PD-4.2. A falha local do passo 3 usa a mesma restrição `CHECK … NOT VALID` temporária em `audit_events`. Nenhuma chamada sai da máquina.
- Contato do anunciante (#92 / F3-002): `src/modules/contact/contact.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1`, usa sessões Better Auth reais e exercita cada ator recusado (anônimo, não verificado, bloqueado, com exclusão solicitada), conferindo o banco depois; confere também que nenhum log nem evento de auditoria recebeu o número. A pré-condição de DEC-040 é provada em `reservation.integration.test.ts`: recusa sem criar nada e, com a trava do anúncio segurada, o contato cadastrado enquanto a reserva espera vale — a prova por mutação (contato lido antes da trava) é local e está na PR de F3-002. `src/modules/contact/boundary.test.ts`, na suíte padrão, falha se qualquer arquivo de `src/` fora de `src/modules/contact` citar `userContact`, `UserContact` ou `user_contacts`; as exceções são só os testes de integração que semeiam e removem o contato sintético, listados no próprio teste. C-1 roda em `src/app/public-surface.http.integration.test.ts`.
- Webhook e confirmação (#96 / F3-006), duas suítes:
  - `src/modules/request/payment-confirmation.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1` e usa o Better Auth real e um provedor **simulado** (`node:http`) da Orders API e da busca da Payments API. O receptor é exercitado pela função da rota com `Request` e HMAC reais.
    - T-2 é concorrente: duas confirmações esperam a trava do anúncio, vistas em `pg_stat_activity`;
    - T-3 entrega a mesma notificação 5 vezes ao mesmo tempo;
    - T-10 usa a restrição `CHECK … NOT VALID` temporária em `audit_events`;
    - também cobre T-4, T-6, T-11, T-12, T-13, T-14, o orçamento do receptor e os encaminhamentos de F3-007.
  - `src/app/api/webhooks/mercadopago/webhook.http.integration.test.ts` prova T-13/T-14 na **rota real** do servidor. Exige `PRIVATE_SURFACE_BASE_URL`, `MERCADO_PAGO_WEBHOOK_SECRET` e `MERCADO_PAGO_APPLICATION_ID` iguais no servidor e no teste; a CI gera os dois por job.

  A prova por mutação (sem conferência da aplicação, manifesto do corpo, sem trava, tempestividade pelo reconhecimento e `last_updated_date` como acreditação) é local e está na PR de F3-006.
- Reembolso técnico, duplicidade e cancelamento (#97 / F3-007): `src/modules/request/technical-refund.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1`, usa o Better Auth real e o provedor **simulado** com reembolso total, reembolso por transação, resposta perdida depois de devolver, `order_already_refunded` e cancelamento. Cobre:
  - T-7, T-9 e T-16;
  - T-8, com duas confirmações concorrentes esperando a trava (vistas em `pg_stat_activity`), eleição repetida com a busca em outra ordem e desempate lexicográfico;
  - o reembolso por transação sem tocar o canônico;
  - os desfechos de PD-8.5 e o cancelamento depois de T5.

  Os ids sintéticos da Payments API são únicos por execução, porque `payments.provider_payment_id` é único no banco. A suíte opcional de sandbox ganhou o reembolso real de uma order `APRO` e a retentativa.
- Entrega do contato ao escolhido (#100 / F3-010), três camadas:
  - `src/app/contatos/contact-delivery.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1` e exercita a composição real da Server Action com o Better Auth real. Cobre C-6, com cada acesso registrado; C-2, C-4 e C-5 (substituta de DV-13, mais o próprio anunciante), sempre com a resposta idêntica à de um id inexistente; A1; A6, sem revogar; a releitura depois da reversão, do encerramento da negociação e da remoção do anúncio; e C-3 e A4 sobre uma cadeia **forjada** no banco, que o caso de uso nunca produz;
  - `src/app/contatos/contact-delivery.http.integration.test.ts` exige também `PRIVATE_SURFACE_BASE_URL` e o servidor do `pnpm build`. O id da action vem de `.next/server/server-reference-manifest.json`. Cobre C-7 (página `private` e `no-store`, action `no-store`, rota fora do manifesto de pré-renderização) e C-11 no payload (HTML e RSC sem o número). Mostra também que pago não escolhido, terceiro, dono e anônimo não recebem o número por HTTP;
  - `src/app/contatos/contact-reveal.test.tsx` (suíte padrão) prova C-11 no componente: a única propriedade é o id, nada aparece antes do gesto, e o atalho é montado no cliente.

  As mutações locais (buscar a autorização só pelo id; porta da cadeia sempre verdadeira) são detectadas por C-2, C-4 e C-5 e por C-3 e A4.
- Escolha, negociação e autorização (#99 / F3-009): `src/modules/negotiation/selection.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1` e usa o Better Auth real. A reserva é real; o estado pago, a reversão e os estados incertos são semeados como F3-006 os grava, porque o caminho da confirmação já é provado na suíte de F3-006. Cobre:
  - **C-9 concorrente:** com a trava do anúncio segurada, N escolhas do dono esperam em `pg_stat_activity` e terminam com uma única autorização e uma única negociação `active`. Há também uma variante de disparo livre e a recusa do banco a uma segunda negociação `active` forjada fora do caso de uso (DM-8.5);
  - um teste negativo para cada pré-condição, de P1 a P7, mais sessão e confirmação explícita, sem criar autorização;
  - a reseleção válida, que preserva a escolha, a negociação e a autorização anteriores intactas;
  - a repetição idempotente;
  - a falha de auditoria que desfaz o ato inteiro;
  - a lista ao dono, que exclui solicitação não paga, em confirmação, revertida, inconsistente ou já escolhida.

  A prova por mutação é local. Sem as travas, a garantia continua no índice, e as recusas viram `conflict`. Sem as travas e sem o índice, surgem três autorizações. Sem só o índice, a trava sozinha serializa.
- Reconciliação periódica e retentativa de reembolso (#98 / F3-008): `src/modules/request/payment-reconciliation.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1`, usa o Better Auth real e o provedor **simulado** com a busca de orders por `external_reference`, consulta indisponível por order, criação com resposta derrubada e reembolso indisponível, `429` ou com código não documentado. Cobre:
  - **T-5:** nenhuma notificação é entregue (zero `PaymentNotification`), e só a reconciliação leva a `paid` com o instante de acreditação;
  - **T-18 durante a reclamação:** a primeira execução segura a transação de reclamação aberta (gancho de teste `onClaimed`) enquanto a segunda reclama. A segunda termina sem nenhuma espera de trava em `pg_stat_activity`, os conjuntos são disjuntos e há um efeito por caso: duas aprovações, um reembolso e um cancelamento;
  - **T-18 depois do commit:** quem reclama enquanto a outra execução ainda processa não recebe os mesmos casos;
  - indisponibilidade sem mudança e com convergência posterior;
  - o cancelamento pendente de PD-8.10, inclusive com acreditação (RT-3);
  - `tentativa_criada` viva (não busca), órfã achada e confirmada, e órfã não achada (nada inventado);
  - `inconsistente` só reobservado;
  - recuo exponencial persistido até `pendente_operacional` com caso aberto, o `429` documentado e o código não documentado.

  As provas comuns usam `park` para tirar da elegibilidade tudo o que não é da prova, porque os trabalhos são globais. Com `PRIVATE_SURFACE_BASE_URL` e `CRON_SECRET` iguais no servidor e no teste, quatro provas usam a **rota real**:
  - recusa sem segredo, com segredo errado e com esquema errado, sem efeito;
  - reclamação autorizada com falha fechada, porque o servidor não tem `MERCADO_PAGO_ACCESS_TOKEN`;
  - resposta só de contagens.

  A prova por mutação é local e está na PR de F3-008: reclamar sem `SKIP LOCKED`, não avançar o próximo instante, fechar caso por esgotamento e aceitar requisição sem segredo.

  DEC-045 (2026-10-01) acrescentou três provas à retentativa:
  - `cannot_refund_order` com a order acreditada → `falhou_retentando` com recuo, sem `inconsistente`, e conclusão posterior com a mesma chave;
  - a mesma recusa com a order não acreditada → `inconsistente`;
  - aprovação com 180 dias → `pendente_operacional` sem chamada ao provedor, e com 179 dias o reembolso ainda é feito.

  Mutações locais pegas: sem a guarda de prazo, prazo de 181 dias, sem o mapeamento de `cannot_refund_order` e sem conferir o estado da order. A suíte de sandbox ganhou a busca de orders por `external_reference` (F3-008): credencial de teste aceita, referência inexistente → lista vazia, e a order criada é achada.
- Adaptador do Mercado Pago (#94 / F3-004): os testes de `src/modules/payments/mercado-pago/` rodam na suíte padrão (`test:ci`), sem rede externa. O contrato HTTP é conferido contra um servidor **simulado** local (`node:http`), que recebe o que o adaptador envia e devolve cada resposta documentada. A assinatura usa segredo sintético gerado por execução. `src/modules/payments/mercado-pago/mercado-pago-sandbox.integration.test.ts` é **opcional**: exige `MERCADO_PAGO_INTEGRATION=1`, `APP_ENV=development` e Access Token **de teste**, cria orders reais de R$ 0,99 no sandbox e **não** roda na CI, no mesmo padrão de `R2_INTEGRATION`.
- Vitrine pública (#49 / F2-011), duas suítes:
  - `src/modules/listing/public-listing.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1` e prova a consulta pública contra o banco: visibilidade, desempate por `id`, limites e filtros. Isola os próprios dados por uma cidade única da execução e não fala com o R2.
  - `src/app/public-surface.http.integration.test.ts` exige também `PUBLIC_SURFACE_BASE_URL`, o endereço de um servidor Next.js **real** que usa o **mesmo** banco efêmero e o **mesmo** `BETTER_AUTH_SECRET` do processo de teste. Com `R2_INTEGRATION=1` e o bucket de `development`, prova também `/media` com bytes reais; sem isso, só grava os derivados no banco. Sequência usada:
    1. `pnpm build`;
    2. com `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3100` e `APP_ENV=development` no ambiente, `pnpm start -p 3100`;
    3. no mesmo ambiente, com as variáveis `R2_*` exportadas de `.env.local` (o Vitest não carrega `.env*`), `PUBLIC_SURFACE_BASE_URL=http://localhost:3100 pnpm test:integration`.
  - As requisições RSC levam o cabeçalho `RSC: 1` e o parâmetro `_rsc`. As respostas 404 são comparadas depois de normalizar só o que varia por requisição ([listing-contract.md](../architecture/listing-contract.md), seção 16.3).
  - As duas rodam no job `integration` do CI; a vitrine por HTTP roda sem `R2_INTEGRATION`, portanto sem bytes reais em `/media`. Nenhuma roda no pós-merge.
- Verificação de segurança da Fase 2 (#50 / F2-012), três suítes. A matriz, as camadas e os achados estão em [phase-2-security-verification.md](../delivery/phase-2-security-verification.md).
  - `src/modules/platform/authorization-matrix.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1` e não fala com o R2. Chama as 15 Server Actions de anúncio e mídia para 9 atores, com sessões Better Auth reais e sessões remanescentes de conta não verificada, bloqueada ou em exclusão. Cada recusa é conferida por uma fotografia antes e depois de 11 tabelas de domínio.
  - `src/modules/platform/telemetry-redaction.integration.test.ts` exige `INTEGRATION_EPHEMERAL_DB=1`. Inicializa o SDK real do Sentry com as opções de produção e um transporte que só captura (nada sai da máquina). Produz erros reais: renomeia `listings` temporariamente, abre conexão com senha errada e faz login recusado. Se a suíte for interrompida no meio, confira se `listings` voltou ao nome original.
  - `src/app/private-surface.http.integration.test.ts` exige `PRIVATE_SURFACE_BASE_URL` e um servidor real sobre o **mesmo** banco, com os **mesmos** `BETTER_AUTH_SECRET` e `CRON_SECRET`: acrescente `CRON_SECRET` ao ambiente do `pnpm start` e do teste, na sequência da vitrine pública acima. O mesmo servidor atende às duas provas HTTP.
  - As três rodam no job `integration` do CI. Nenhuma roda no pós-merge.
- Intermitências conhecidas em testes antigos (2026-09-30). As quatro primeiras aconteciam só na rodada completa, e as suítes passavam isoladas; a quinta é aleatória. Todas têm diagnóstico abaixo; as quatro últimas foram corrigidas no teste, sem mudança no código de produção:
  - `media-pipeline.integration.test.ts`: "recuperação periódica" e "claim concorrente", com a imagem ainda `processing`. Diagnóstico:
    - A hipótese do `after()` está **descartada**. A suíte usa o núcleo `upload.ts`, que não agenda nada; só `actions.ts` chama `after()`, e fora de uma requisição do Next o `after()` lança (`E468`) em vez de agendar. Não existe caminho rápido rodando na suíte.
    - A falha não se reproduziu em 23 rodadas num banco descartável exclusivo: suíte completa com R2 real, com e sem a prova HTTP (servidor `pnpm start` no mesmo banco), com as suítes de #50, sob carga de CPU e com o threadpool do libuv reduzido a 1. Uma linha reclamável que sobrou de outra suíte é consumida pela primeira recuperação global sem quebrar nada.
    - Pelo código de `processor.ts`, depois de `processPendingImages()` retornar, uma linha reclamada por ela só fica em `processing` por exceção inesperada em `processClaim` (desfecho `fenced`, registrado como `[media] falha inesperada no processamento`) ou porque **outro executor no mesmo banco** a segura. As duas afetadas são exatamente as que reclamam no banco inteiro (`processPendingImages()` e `maxImages`). Um segundo processo apontado para o mesmo banco (outra sessão rodando a suíte, ou `GET /api/jobs/media-process` num servidor ligado a ele) reclama as linhas desta suíte: chamando o cron em laço durante a suíte, ele reclamou e fez falhar imagens dela (`source_missing`, porque o objeto só existe no R2 em memória do teste).
    - Os dois testes agora afirmam o diagnóstico inteiro numa só comparação: o resumo de cada executor (`claimed`, `ready`, `fenced`), os erros inesperados registrados e `status`/`attempts`/`failureCode` de cada imagem. Se voltar a falhar, o diff diz qual das duas causas foi, sem enfraquecer o que o teste prova.
  - `email-verification.integration.test.ts`: "falha de envio…". Comparava o `expires_at` gravado pelo relógio do banco (Docker) com o `Date.now()` do host. **Corrigida por #84:** a validade é julgada pelo próprio banco (`"expires_at" > now()`).
  - `login-rate-limit.integration.test.ts`: "10 tentativas simultaneas…" (`expected [] to have a length of 8`, 1 em 5 rodadas). **Causa, demonstrada em F2-013 (#51):** as 10 tentativas abrem 10 transações interativas ao mesmo tempo, e o pool (`pg`, `max = 10`) só tinha 1 ou 2 conexões abertas; as demais precisavam de conexão nova dentro do `maxWait` do Prisma (2 s). Uma demora na abertura de conexão derrubava essas transações com `P2028` **antes** do limitador — resposta de erro técnico, sem chamar o provedor —, e as que tinham conexão aberta passavam: "2 chegaram, 8 nem limitadas nem inválidas". Reprodução: um proxy TCP que atrasa em 2,5 s cada conexão nova produziu 9 × `P2028` com 1 conexão aberta. Em condição normal a rajada inteira termina em ~0,3 s. **Correção:** o teste abre as 10 conexões do pool antes da rajada, e passa pelo mesmo proxy; a mutação que remove a trava da reserva continua reprovando o teste. O limitador está correto: diante de falha de infraestrutura ele falha fechado.
  - `media-cleanup.integration.test.ts`: "dois consumidores…". As asserções de correção passavam, mas a de divisão entre consumidores falhava quando o primeiro levava a fila inteira. Houve duas causas, corrigidas em sequência na F2-013 (#51):
    - **Primeira (PR #85):** um consumidor esvazia as 20 pendências em ~0,7 s, e nada garantia que o segundo reclamasse antes. Atrasar o segundo em 3 s reproduzia a falha (20 reclamadas, 20 concluídas). **Correção:** o primeiro consumidor a apagar segura o próprio lote, já com lease gravado, até o banco mostrar que o outro reclamou um lote diferente.
    - **Segunda, residual:** uma rodada local completa (R2 real e HTTP) falhou em `expected 0 to be greater than 0` no teste que já segurava o lote, em 711 ms. A hipótese de a espera estourar o próprio prazo de 5 s foi **refutada por mutação**: com o segundo consumidor atrasado 6 s, o Vitest reprova por `Test timed out in 5000ms` (o timeout padrão do teste vence antes), e com 4 s o teste passa. O sintoma exato só aparece quando a espera do primeiro consumidor **falha depressa** e a primeira reclamação do segundo chega depois de o primeiro esvaziar a fila. O erro, lançado dentro do `DeleteObject` simulado, virava `retried` no `processDeletion`, e a falha aparecia numa asserção posterior. Reprodução por mutação: espera que lança na hora e segundo consumidor atrasado 800 ms dão a mesma mensagem, com o primeiro em 20 reclamadas, 19 concluídas e 1 `retried`; sem o atraso, a mesma falha aparece como `expected 19 to be 20`. O erro original da espera não ficou no log daquela rodada, então o gatilho exato não é recuperável; a família é a da conexão nova lenta sob carga do `login-rate-limit`. **Correção, só no teste:** o pool é aquecido antes da corrida; a espera não tem prazo próprio e termina pelo `signal` do teste (timeout explícito de 20 s); o erro dela é guardado e afirmado ausente antes das demais asserções. Provas: passa com qualquer um dos dois consumidores atrasado 6 s; a espera que falha reprova com a própria mensagem. A remoção do lease (`due_at = now()` no claim) é reprovada de forma determinística pelo teste "segundo executor iniciado DEPOIS do claim" (3 de 3); no "dois consumidores" ela só é pega às vezes, antes e depois da correção (2 de 5 e 1 de 5), porque depende do entrelaçamento.
  - `public-listing.integration.test.ts`: "DTO so tem a allowlist…". Encontrada na primeira execução do job `integration` da CI (F2-013, #51): a lista de proibidos incluía `'90000'`, e um UUID aleatório de anúncio do próprio teste terminava em `…90000`. **Não era vazamento:** a coincidência cabe em qualquer id hexadecimal (cerca de 0,1% por rodada, pelo número de ids no payload). **Correção:** o teste procura o número nas grafias completas (`+55 11 90000-0000`, `90000-0000`, `11900000000`), como as suítes da #50 já faziam.
  - Na verificação da #50, cada rodada completa teve 1 falha desse grupo, e as suítes novas passaram em todas.
- Cada sessão ou worktree usa o **próprio** banco descartável (contêiner e porta exclusivos) e o próprio servidor da prova HTTP. As suítes de mídia pressupõem ser o único executor do processamento naquele banco; compartilhar a porta com outra sessão invalida a prova.
- Teste intermitente é tratado como defeito: investiga-se a causa. Marcar como `skip` ou reexecutar até passar não é solução ([conventions.md](conventions.md), seção 6, item 8).

## 8. Referências

- [conventions.md](conventions.md) — convenções de engenharia
- [ai-agent-workflow.md](ai-agent-workflow.md) — modo operacional, relatório obrigatório e proporcionalidade de revisão
- [../product/business-rules.md](../product/business-rules.md) — RB-001 a RB-006
- [../product/requirements.md](../product/requirements.md) — RF-xxx e RNF-xxx, em especial RNF-016 (consistência sob concorrência)
- [../adr/0002-postgresql-neon.md](../adr/0002-postgresql-neon.md) — transações e restrições do PostgreSQL
- [../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md) — migrations e validação em CI
- [../architecture/payments-design.md](../architecture/payments-design.md) — contrato de teste de pagamentos (seção 13)
- [../architecture/contact-release.md](../architecture/contact-release.md) — contrato de teste da liberação de contato (seção 10)
- [../decisions/open-decisions.md](../decisions/open-decisions.md) — decisões abertas; atualmente nenhuma
