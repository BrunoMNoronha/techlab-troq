# Modelo de dados — TROQ

Modelo **lógico** de dados do MVP, suficiente para orientar o schema e as migrations da Fase 1. Produzido por **F0-022**, junto com [overview.md](overview.md), [payments-design.md](payments-design.md) e [contact-release.md](contact-release.md).

**Este documento não é schema.** Não cria migration, não define nomes físicos de tabela ou coluna, não escolhe tipos do PostgreSQL e não contém código Prisma. Ele define **entidades, relações, cardinalidades, estados, unicidades e invariantes**, e diz **onde cada invariante é protegida** — aplicação, transação ou restrição de banco. A materialização segue [ADR-0005](../adr/0005-prisma-orm-migrations.md).

Os itens são identificados como `DM-x`.

## 1. Convenções

**DM-1.1.** Identificador: toda entidade tem identificador interno, opaco, gerado pela aplicação, estável e **não sequencial adivinhável**. Identificador de recurso exposto em URL pública nunca revela volume nem ordem.

**DM-1.2.** Instantes são armazenados com fuso, em UTC. Cálculo de prazo em dias corridos (14 dias da avaliação, 7 dias da contestação, 30 dias da exclusão) usa o instante absoluto; prazo em dias úteis da moderação usa o fuso oficial de Brasília, conforme DEC-031, seção 9, item 3.

**DM-1.3.** Valores monetários **nunca** usam ponto flutuante. A representação persistida é exata — inteiro em centavos ou decimal — e a conversão para exibição é da camada de apresentação ([conventions.md](../engineering/conventions.md), seção 4). R$ 0,99 é exatamente esse valor (RB-004).

**DM-1.4.** Estados são conjuntos fechados e explícitos, com a grafia técnica definida pelo documento normativo de origem. Valor desconhecido nunca é tratado por analogia.

**DM-1.5.** "Fato histórico" significa: linha imutável depois de escrita, nunca apagada por evento posterior de negócio, e sujeita apenas ao expurgo por prazo de DEC-033. Escolha, liberação de contato, consumo de vaga, aprovação de pagamento, reversão e decisão de moderação são fatos históricos.

**DM-1.6.** Onde este documento diz **restrição de banco**, a garantia é do PostgreSQL e não pode depender de verificação prévia da aplicação. Onde diz **transação**, a garantia é do conjunto "ler travado, decidir, escrever" em uma única transação. Onde diz **aplicação**, a regra não é disputada por concorrência e a verificação em código basta.

## 2. Mapa das entidades

```
User ──1:0..1── UserContact              (dado protegido, modulo `contact`)
 │  └──1:N── TermsAcceptance
 │  └──0..1── AccountDeletionRequest
 │
 ├──1:N── Listing ──1:N── ListingTransition
 │            └──1:N── ListingImage ──1:N── ImageDerivative
 │            └──1:N── ContactRequest        (max 3 vagas ocupadas — RB-003)
 │            └──1:N── Report
 │
ContactRequest ──1:0..1── PaymentAttempt ──1:N── Payment
 │                              │                  └──0..1── TechnicalRefund
 │                              └──1:N── PaymentNotification
 │                              └──0..N── ReconciliationCase
 └──0..1── Selection ──1:1── Negotiation ──1:N── Rating
                │                 └──1:1── ContactRelease ──1:N── ContactAccessEvent
                │
Report ──1:0..1── ModerationDecision ──0..1── Appeal
                        └──0..N── Sanction

AuditEvent   (trilha unica, referencia alvo por tipo + id; ver DM-11)
```

**Não existe entidade `Interest`.** A demonstração de interesse é ação de interface sem persistência (DEC-035, IF-7). Telemetria agregada de funil, se existir, não é entidade funcional e não pertence a este modelo.

## 3. Identidade e conta

### 3.1 `User`

| Aspecto | Definição |
| --- | --- |
| Papel | Pessoa usuária; atua como anunciante e como solicitante, sem entidades separadas |
| Campos de negócio | Nome de exibição, email, estado da verificação de email, estado da conta, instantes |
| Estado da conta | `active`, `blocked_age` (bloqueio cautelar de DEC-034, seção 5), `blocked_admin` (DEC-031, seção 10), `deletion_requested` |
| Unicidade | Email único entre contas não excluídas |
| Não contém | Telefone/WhatsApp (DM-4.1); data de nascimento, documento, selfie ou biometria (DEC-034, seção 4); qualquer localização mais precisa que cidade/UF (RB-005) |

**DM-3.1 (invariante, aplicação).** Ação que exige conta verificada é rejeitada quando o email não está verificado (RF-002). Conta em qualquer estado `blocked_*` não publica, não solicita, não paga, não é escolhida e não recebe contato liberado (DEC-034, seção 5).

**DM-3.2.** Reputação pública **não** é campo de `User`: é derivada das avaliações publicadas e válidas (DM-9.4). Persistir média como campo criaria uma segunda fonte de verdade que diverge silenciosamente quando uma avaliação é invalidada.

### 3.2 `TermsAcceptance`

Registra cada aceitação com **instante e versão dos termos** (DEC-034, seção 3). Cobre a declaração de 18 anos completos ou mais no cadastro e a declaração de conformidade na publicação (DEC-031, seção 5, item 1), distinguidas por tipo.

**DM-3.3 (invariante, aplicação).** Publicar (T1) exige uma aceitação de declaração de conformidade registrada para aquele anúncio. A aceitação é fato histórico e é auditada.

### 3.3 `AccountDeletionRequest`

Solicitação de exclusão (RF-023), com instante do pedido, instante do efeito imediato e instante da conclusão do expurgo.

**DM-3.4 (invariante, transação).** O efeito imediato — impedir login, invalidar sessões, retirar perfil, conteúdo e anúncios da exposição pública, impedir novas operações — é aplicado na mesma transação que aceita a solicitação (DEC-033, seção 3.1). Não depende de trabalho periódico (AR-15.3).

**DM-3.5 (invariante, aplicação).** O expurgo dos 30 dias **não** apaga fatos históricos (DM-1.5): elimina ou anonimiza o dado pessoal identificável, preservando a integridade das trilhas e o conjunto mínimo de registros financeiros (DEC-033, seções 3.2, 3.3 e 8).

## 4. Contato protegido

### 4.1 `UserContact`

| Aspecto | Definição |
| --- | --- |
| Papel | Guarda do telefone/WhatsApp de um usuário |
| Cardinalidade | 1 usuário : 0..1 contato |
| Campos | Referência ao usuário, número em formato canônico, instantes |
| Módulo dono | `contact` (AR-3.4). Nenhum outro módulo lê esta entidade diretamente |

**DM-4.1 (decisão arquitetural).** O contato vive em **tabela própria**, e não como coluna de `User` ou de `Listing`. Razão estrutural: uma consulta descuidada que selecione a entidade inteira do usuário ou do anúncio — o erro mais comum e mais difícil de revisar — não pode alcançar o dado protegido, porque ele não está lá. Isso implementa AR-2.1 como propriedade do modelo, não como disciplina de código.

**DM-4.2 (invariante, aplicação).** Nenhuma projeção pública, nenhum índice de busca, nenhum cache público, nenhuma URL, nenhum log, nenhuma telemetria e nenhuma mensagem de erro contém este dado (RF-014, DEC-023). O detalhamento do caminho autorizado está em [contact-release.md](contact-release.md).

**DM-4.3 (invariante, aplicação).** Após a exclusão da conta, a auditoria **não** conserva telefone/WhatsApp em texto puro; usa identificadores internos ou pseudonimizados (DEC-033, seção 6).

### 4.2 `ContactRelease` e `ContactAccessEvent`

Modeladas em [contact-release.md](contact-release.md), CR-3 e CR-4. Em resumo, para efeito do mapa de entidades:

- `ContactRelease` é a **autorização**, criada no ato da escolha, uma por negociação, imutável, fato histórico, **nunca revogada** (PE-8.7, DEC-032 seção 3).
- `ContactAccessEvent` é cada **entrega efetiva** do dado ao escolhido, append-only.

**DM-4.4.** Autorizar e entregar são fatos distintos e entidades distintas, de propósito. A separação é o que permite auditar quantas vezes o dado foi efetivamente divulgado, sem duplicar a autorização e sem sugerir que a autorização possa ser desfeita.

## 5. Anúncio e imagens

### 5.1 `Listing`

| Aspecto | Definição |
| --- | --- |
| Estados | `draft`, `published`, `paused`, `closed`, `removed` (DEC-027, seção 2) |
| Inicial / terminais | Inicial `draft`; terminais `closed` e `removed` |
| Campos de negócio | Dono, título, descrição, cidade, UF, ordenação das imagens, instantes de cada transição |
| Localização | Apenas cidade e UF. **Sem** coordenadas, endereço, CEP ou bairro (RF-007, RB-005) |

**DM-5.1 (invariante, restrição de banco + transação).** As transições permitidas são exatamente T1 a T9 de DEC-027, seção 4. Toda transição é aplicada por atualização condicionada ao estado de origem esperado — de modo que duas transições concorrentes não se sobreponham — e qualquer par (origem, destino) fora da matriz é rejeitado. `closed` e `removed` não têm transição de saída.

**DM-5.2 (invariante, aplicação).** Somente `published` é consultável publicamente. Qualquer outro estado responde ao público como recurso não disponível, sem revelar existência prévia nem estado interno (DEC-027, seção 3).

**DM-5.3 (invariante, transação).** Publicar exige, verificado na mesma transação: dono autenticado e verificado; ao menos **uma** imagem processada com sucesso; e aceitação da declaração de conformidade registrada (DEC-028 seção 3, DEC-031 seção 5).

**DM-5.4 (invariante, transação).** Edição de anúncio `published` **não pode** resultar em zero imagens válidas (DEC-028, seção 3).

**DM-5.5 (invariante, transação).** Sair de `published` retira as imagens da superfície pública **imediatamente**, inclusive de caches, sem implicar exclusão física dos objetos (DEC-028 seção 8, DEC-033 seção 4).

**DM-5.6.** `ListingTransition` registra cada mudança de estado com ator, instante, estado anterior, estado resultante e, na remoção administrativa, o motivo e a categoria (DEC-027 seção 4, DEC-031 seção 12). É fato histórico e alimenta `AuditEvent`.

### 5.2 `ListingImage` e `ImageDerivative`

| Aspecto | Definição |
| --- | --- |
| Estados da imagem | `uploaded` (original temporário recebido), `processing`, `ready`, `failed` |
| Campos | Anúncio, posição na ordenação, chave do objeto gerada pela aplicação, dimensões, instantes |
| Derivados | `thumb` 320 px, `medium` 768 px, `large` 1600 px, em WebP qualidade 80, com dimensões conhecidas (DEC-028, seção 7) |

**DM-5.7 (invariante, restrição de banco).** No máximo **6** imagens por anúncio, e a posição na ordenação é única dentro do anúncio. A primeira posição é a capa (DEC-028, seção 3).

**DM-5.8 (invariante, aplicação).** Somente imagem em `ready` conta para o mínimo de publicação e pode ser servida publicamente. Original temporário **nunca** é público e é expurgado em no máximo 24 horas (DEC-028, seção 7).

**DM-5.9 (invariante, aplicação).** A chave pública do objeto não contém o nome original do arquivo, e nenhum objeto público ou metadado de imagem contém dado protegido (DEC-028, critérios 11 e 17).

## 6. Solicitação, vaga e o limite de três — o núcleo de concorrência

Esta seção responde ao critério de aceite mais exigente de F0-022: **como o limite de três é protegido sob concorrência, no banco, e não por verificação prévia da aplicação.**

### 6.1 `ContactRequest`

A solicitação de desbloqueio **é** a reserva de vaga. Não são duas entidades: a reserva é o conjunto de atributos que faz a solicitação ocupar uma das três vagas do anúncio. Isso mantém literal a exigência de DEC-037 de que toda tentativa de pagamento pertence a **exatamente uma** reserva (PE-2.1).

| Aspecto | Definição |
| --- | --- |
| Papel | Pedido de desbloqueio de contato de um anúncio por um solicitante, ocupando uma vaga |
| Cardinalidade | N solicitações : 1 anúncio; N : 1 solicitante |
| Campos de negócio | Anúncio, solicitante, **índice da vaga**, início e fim da janela de reserva, estado, instantes |
| Índice da vaga | Inteiro em `{1, 2, 3}` |
| Janela de reserva | `reservedFrom` e `reservedUntil`; duração fixada em [payments-design.md](payments-design.md), PD-3 |

Estados de `ContactRequest`:

| Estado | Significado | Ocupa vaga? | Terminal |
| --- | --- | --- | --- |
| `reserved` | Vaga ocupada provisoriamente; cobrança em criação ou aguardando pagamento | **Sim, provisoriamente** | Não |
| `paid` | Solicitação paga válida: pagamento canônico acreditado dentro da janela | **Sim, definitivamente** | Sim |
| `expired` | Janela encerrada sem pagamento acreditado tempestivo | Não | Sim |
| `failed` | Estado autoritativo terminal sem acreditação, ou cancelamento | Não | Sim |

**DM-6.1.** O mapeamento com os estados de tentativa de DEC-037, seção 15, é direto: `paid` existe se e somente se a tentativa da reserva está em `pagamento_confirmado`. Os estados intermediários da tentativa (`em_confirmacao`, `reembolso_pendente`, `inconsistente`) pertencem a `PaymentAttempt`, não à solicitação — e **nenhum deles** move a solicitação para `paid`.

### 6.2 A invariante e sua proteção

**DM-6.2 (invariante, restrição de banco — a proteção principal de RB-003).**

> Existe **índice único parcial** sobre `(listingId, slotIndex)` restrito às linhas cujo estado é `reserved` ou `paid`.

Consequências, todas garantidas pelo PostgreSQL e não pela aplicação:

1. Um anúncio tem, em qualquer instante, no máximo **três** linhas ocupando vaga, porque `slotIndex` só admite 1, 2 e 3 e cada valor é único entre as linhas ocupantes.
2. Uma quarta solicitação concorrente **não tem valor de `slotIndex` disponível**: qualquer valor que ela tente viola o índice, e a transação falha. A recusa é estrutural, não condicional.
3. Linhas em `expired` e `failed` saem do índice e **liberam** o valor para reuso, sem apagar a linha: o histórico permanece (DM-1.5).
4. Não existe instante observável com mais de três solicitações pagas válidas (CI-6), porque `paid` é um dos estados cobertos pelo índice e a transição para `paid` nunca muda o `slotIndex`.

**DM-6.3 (invariante, transação).** A expiração **não** pode ser condição do índice: uma restrição de banco não pode depender do relógio. Portanto a liberação da vaga expirada é resolvida **no ato da alocação**, e não por trabalho periódico (AR-15.3). A transação que aloca vaga executa, em ordem, em uma única transação:

1. adquire trava de **escopo de transação** derivada do identificador do anúncio (`pg_advisory_xact_lock`), serializando as alocações daquele anúncio e apenas daquele anúncio;
2. move para `expired` as linhas daquele anúncio em `reserved` cuja janela já terminou **e** que não possuam pagamento acreditado tempestivo reconhecido;
3. calcula o menor `slotIndex` livre entre 1, 2 e 3;
4. insere a nova solicitação em `reserved` com esse índice;
5. grava o evento de auditoria (AR-9.4).

Se não houver índice livre, a transação termina recusando a solicitação — a quarta tentativa é recusada (RF-010).

**DM-6.4.** A trava do passo 1 é **otimização de comportamento**, não a garantia: ela evita que solicitações concorrentes ao mesmo anúncio colidam no índice e tenham de ser retentadas. A garantia continua sendo DM-6.2. Se a trava falhasse ou fosse removida, o índice único ainda impediria a quarta vaga; a diferença seria apenas mais retentativas. Desenho em que a corretude depende da trava seria frágil; aqui ela depende da restrição.

**DM-6.5 (normativa, AR-15.5).** A trava é obrigatoriamente de escopo de **transação**. Trava consultiva de **sessão** é proibida: o endpoint pooled do Neon usa PgBouncer em modo transação e não a suporta, e uma trava de sessão sobre conexão reciclada vaza para outra requisição.

**DM-6.6 (invariante, transação).** Confirmação tardia **não** ressuscita reserva expirada e **não** toma vaga de outra solicitação. A transação de confirmação, sob a mesma trava do anúncio, verifica que a linha ainda está em `reserved` e que o instante de acreditação autoritativo é menor ou igual a `reservedUntil`. Falhando qualquer das duas condições, a solicitação **não** vira `paid`, nenhuma vaga é consumida e o caso vira exceção técnica (PE-4.3, PE-4.8 a PE-4.13, PE-5.5). Detalhe em [payments-design.md](payments-design.md), PD-6.

**DM-6.7 (invariante, restrição de banco).** Consumo de vaga é fato histórico. A transição `paid` -> qualquer outro estado é **proibida**. Reversão externa posterior **não** devolve a vaga: ela grava um evento novo e a linha permanece `paid`, exatamente como determina PE-8.9 e PE-12.6.

**DM-6.8 (invariante, aplicação).** Reseleção não cria vaga, não reinicia o limite e não permite uma quarta paga (DEC-032, seção 5): ela só relaciona uma solicitação `paid` já existente a uma nova escolha, e nada neste modelo permite outro caminho.

**DM-6.9 (invariante, transação).** Nova solicitação só é aceita em anúncio `published` (DEC-027, seção 3). O estado do anúncio é lido sob a mesma transação da alocação, para que uma transição concorrente do anúncio não deixe passar uma solicitação já inválida.

**DM-6.10 (invariante, transação).** Quando o anúncio vai para `closed` ou `removed`, as solicitações em `reserved` são encerradas sem cobrança e as vagas liberadas; as solicitações `paid` são preservadas e a cobrança permanece definitiva (DEC-027 seção 5, DEC-031 seção 8.2).

**DM-6.11.** Não há restrição de unicidade entre solicitante e anúncio: o modelo **não** proíbe que a mesma pessoa tenha duas solicitações no mesmo anúncio, porque nenhuma decisão vigente proíbe isso. O que existe é o limite de três vagas por anúncio (RB-003) e o limite de uma escolha por solicitação (DM-8.3). Criar a proibição seria inventar requisito ausente.

## 7. Pagamento

As entidades desta seção são especificadas em [payments-design.md](payments-design.md); aqui ficam apenas o lugar no modelo e as invariantes estruturais.

| Entidade | Papel | Cardinalidade |
| --- | --- | --- |
| `PaymentAttempt` | A tentativa lógica de cobrar R$ 0,99 por **uma** reserva. Unidade de idempotência | 1 solicitação : 0..1 tentativa |
| `Payment` | Um pagamento reportado pelo provedor, com seu estado autoritativo e o instante de acreditação | 1 tentativa : N pagamentos |
| `TechnicalRefund` | Devolução integral de um pagamento que nunca deveria ter virado solicitação paga válida | 1 pagamento : 0..1 reembolso |
| `PaymentNotification` | Registro de cada notificação recebida, para auditoria e diagnóstico | 1 tentativa : N notificações |
| `ReconciliationCase` | Caso aberto de divergência, pendência ou inconsistência | 1 tentativa : N casos |

**DM-7.1 (invariante, restrição de banco).** `PaymentAttempt` é **única por solicitação**. Isso realiza literalmente PE-2.1 — a identidade da tentativa deriva da reserva — e torna impossível, por construção, haver duas tentativas lógicas concorrentes para a mesma vaga (CI-1).

**DM-7.2 (invariante, restrição de banco).** A chave de idempotência enviada ao provedor é **persistida na tentativa** e **única** entre tentativas. Persistir, em vez de rederivar a cada chamada, garante que uma retentativa reutilize exatamente a mesma chave mesmo que a fórmula de derivação mude no futuro (CI-1, CI-2).

**DM-7.3 (invariante, restrição de banco).** `Payment` é único pelo identificador do pagamento no provedor. Reprocessar a mesma notificação, ou a mesma consulta, não cria uma segunda linha (CI-2).

**DM-7.4 (invariante, restrição de banco).** Cada tentativa tem **no máximo um** pagamento canônico. A eleição é determinística, aplicada uma única vez e registrada (PE-3.1). Regra concreta em [payments-design.md](payments-design.md), PD-7.

**DM-7.5 (invariante, restrição de banco).** O instante de **acreditação autoritativo** e o instante de **reconhecimento pelo TROQ** são campos distintos e ambos persistidos (CI-4). Confundi-los destruiria a regra de tempestividade de PE-4.1 e PE-4.2.

**DM-7.6 (invariante, aplicação).** `ReconciliationCase` em `reembolso_pendente` ou `inconsistente` **nunca** confere direito de negócio e **não** pode ser fechado sem desfecho real (PE-7.9, PE-7.10, PE-9.5, CI-7).

**DM-7.7 (invariante, aplicação).** Os metadados financeiros mínimos são retidos por 5 anos após a transação e **não** justificam conservar telefone, WhatsApp, descrição de anúncio, imagens ou conteúdo pessoal não relacionado (DEC-033, seção 8).

## 8. Escolha, negociação e liberação

### 8.1 `Selection`

| Aspecto | Definição |
| --- | --- |
| Papel | O ato do anunciante de escolher uma solicitação paga válida |
| Cardinalidade | 1 solicitação : 0..1 escolha; N escolhas : 1 anúncio, sequenciais |
| Campos | Anúncio, solicitação escolhida, ator, instante |
| Natureza | Fato histórico imutável (DEC-032, seção 3) |

**DM-8.1 (invariante, transação).** Escolher exige, verificado na mesma transação: ator é o dono do anúncio; a solicitação pertence àquele anúncio; a solicitação está em `paid`; o anúncio não está `removed` (DEC-027, seção 6).

**DM-8.2 (invariante, transação).** A **reseleção** — segunda escolha em diante na cadeia do mesmo anúncio — exige adicionalmente as cinco pré-condições simultâneas RS-1 a RS-5 de DEC-032, seção 2, com destaque para: negociação anterior `closed`, anúncio atualmente `published` e candidato ainda não selecionado antes nesse anúncio.

**DM-8.3 (invariante, restrição de banco).** `Selection` é **única por solicitação**: cada solicitação paga é escolhida no máximo uma vez (RS-5). Como existem no máximo três solicitações pagas, no máximo três pessoas são escolhidas sequencialmente no ciclo inteiro do anúncio (DEC-032, seção 5).

### 8.2 `Negotiation`

| Aspecto | Definição |
| --- | --- |
| Estados | `active` e `closed` (DEC-029, seção 3). Nenhum outro |
| Cardinalidade | 1 escolha : 1 negociação |
| Campos | Escolha, anunciante, solicitante escolhido, estado, instante de criação, instante e ator do encerramento |

**DM-8.4 (invariante, transação).** A negociação nasce `active` **na mesma transação** da escolha e da criação da autorização de liberação (DEC-029, seção 4). Não há estado anterior a `active` e não há outro caminho de criação.

**DM-8.5 (invariante, restrição de banco).** Existe **no máximo uma** negociação `active` por anúncio, garantida por índice único parcial sobre o anúncio restrito às linhas `active`. Isso realiza a exclusividade exigida por DEC-032, seção 4.1, sem depender de verificação prévia: duas reseleções concorrentes não podem ambas criar negociação viva.

**DM-8.6 (invariante, transação).** `active -> closed` é a única transição, é unilateral, imediata e irreversível; o ator é uma das duas partes; repetir a intenção sobre negociação já `closed` é idempotente e não cria nova transição de negócio (DEC-029, seções 5, 6 e 11.1). Não existe `closed -> active`, não existe timeout e não existe autoencerramento.

**DM-8.7.** O encerramento **não** registra motivo, culpado nem resultado, e **não** afirma sucesso da troca (DEC-029, seções 9.3 e 3). O modelo não tem campo para isso, de propósito.

### 8.3 `ContactRelease`

**DM-8.8 (invariante, transação + restrição de banco).** A autorização de liberação é criada **na mesma transação** da escolha, é **única por negociação** e é imutável. As duas condições de RB-001 — escolhido e pagamento aprovado — são verificadas naquela transação, sobre a solicitação travada. Modelo e caminho de acesso em [contact-release.md](contact-release.md).

**DM-8.9 (invariante, aplicação).** Liberação concedida **nunca** é revogada, apagada nem revertida — nem por reseleção (DEC-032, seção 3), nem por transição do anúncio (DEC-027, seção 5), nem por reversão externa do pagamento (PE-8.7), nem por bloqueio cautelar etário (DEC-034, seção 5.1), nem por sanção de moderação (DEC-031, seção 10).

## 9. Avaliações

### 9.1 `Rating`

| Aspecto | Definição |
| --- | --- |
| Campos | Negociação, avaliador, avaliado, nota inteira de 1 a 5, instante de submissão, instante de publicação, estado de validade |
| Cardinalidade | 1 negociação : 0..2 avaliações, uma por direção |
| Validade | `valid` ou `invalidated` (invalidação administrativa auditada, DEC-030, seção 13) |

**DM-9.1 (invariante, restrição de banco).** `Rating` é **única por (negociação, avaliador)**: no máximo uma avaliação por direção, portanto no máximo duas por negociação (DEC-030, seção 4).

**DM-9.2 (invariante, restrição de banco + transação).** A nota pertence ao conjunto `{1,2,3,4,5}`, garantido por restrição de domínio. Avaliador e avaliado são obrigatoriamente as duas partes daquela negociação, e são obrigatoriamente distintos: autoavaliação e terceiros são rejeitados (DEC-030, seções 4 e 12).

**DM-9.3 (invariante, transação).** Submeter exige, na mesma transação: negociação `closed`; submissão dentro de 14 dias corridos do encerramento; e inexistência de avaliação válida anterior naquela direção (DEC-030, seção 5). Substituir a nota só é possível enquanto a avaliação estiver dentro da janela e **não publicada** (DEC-030, seção 9); depois de publicada é imutável pelo usuário (seção 10).

**DM-9.4 (decisão arquitetural — publicação cega sem depender de job).** A publicação cega bilateral de DEC-030, seção 8.2, exige publicar quando **ambas** submeteram **ou** quando a janela terminou. A segunda condição depende do tempo. O modelo resolve assim:

- quando a segunda submissão válida é aceita, a transação grava `publishedAt` nas **duas** avaliações, simultaneamente;
- a publicidade é **derivada na leitura**: uma avaliação conta como publicada se tem `publishedAt` **ou** se a janela de 14 dias da sua negociação já terminou;
- um trabalho periódico materializa `publishedAt` nas avaliações cuja janela terminou, **apenas** como higiene.

Consequência: se o trabalho periódico não disparar — e ele é best effort (AR-15.2) —, a regra continua correta, porque a leitura já a aplica. Nenhuma invariante depende do job (AR-15.3).

**DM-9.5 (invariante, aplicação).** Antes da publicação, nenhuma resposta do sistema revela a nota da contraparte nem qualquer representação da qual ela possa ser inferida (DEC-030, seções 8.2 e 12).

**DM-9.6 (invariante, aplicação).** Ausência de avaliação **não** gera nota automática e não entra em nenhum cálculo (DEC-030, seção 8.3).

**DM-9.7 (decisão arquitetural).** A reputação pública é **calculada**, nunca persistida como campo (DM-3.2): média aritmética simples das notas publicadas e válidas recebidas, com uma casa decimal, mais a quantidade de avaliações válidas, somando os papéis de anunciante e solicitante (DEC-030, seção 11). Publicamente, a nota individual não é vinculada ao avaliador nem à negociação; a relação interna existe para autorização, auditoria e moderação.

## 10. Denúncia e moderação

| Entidade | Papel | Estados |
| --- | --- | --- |
| `Report` | Denúncia de um anúncio por um usuário | `recebida` (inicial), `procedente`, `improcedente`, `sem_acao` (terminais) |
| `ModerationDecision` | A decisão sobre uma denúncia, ou de ofício | — |
| `Sanction` | Advertência, restrição temporária de 7 dias ou bloqueio administrativo | — |
| `Appeal` | Contestação administrativa de uma decisão | `mantida`, `revista` |

**DM-10.1 (invariante, restrição de banco).** `Report` é **única por (denunciante, anúncio)**. Uma segunda tentativa do mesmo usuário sobre o mesmo anúncio é aceita de forma idempotente e não cria nova denúncia (DEC-031, seção 6).

**DM-10.2 (invariante, aplicação).** A denúncia coleta **apenas** anúncio, denunciante, categoria de lista fechada derivada de PI-01 a PI-12 mais `outro`, texto opcional de até 500 caracteres, instante e estado (DEC-031, seção 6). Nada além disso.

**DM-10.3 (invariante, aplicação).** Registrar denúncia **não** altera o estado do anúncio, não o retira da consulta pública e não interrompe solicitações, pagamentos, escolha ou negociação. Não existe estado intermediário de análise no anúncio nem na denúncia (DEC-031, seções 6 e 7.1).

**DM-10.4 (invariante, aplicação).** A identidade do denunciante nunca é revelada ao anunciante, não aparece em payload público nem em cache público e não é exposta na contestação (DEC-031, seção 13). Ela é, portanto, dado de acesso restrito ao perfil de moderação — ainda que não seja "protegido" no sentido de DM-4.1, que é reservado ao contato.

**DM-10.5 (invariante, restrição de banco).** `Appeal` é **única por decisão**: uma contestação por decisão, a segunda é recusada de forma idempotente (DEC-031, seção 11).

**DM-10.6 (invariante, aplicação).** A remoção usa exclusivamente T7, T8 ou T9 e é terminal; `revista` **não** restaura o anúncio removido, apenas desfaz a sanção, retira a ocorrência da reincidência e autoriza expressamente republicar aquele conteúdo como **novo** anúncio (DEC-031, seções 8 e 11.2).

**DM-10.7 (invariante, aplicação).** A contagem de reincidência considera apenas decisões `procedente` sobre anúncios do mesmo anunciante; `improcedente`, `sem_acao` e bloqueios preventivos de publicação não contam (DEC-031, seção 10).

## 11. Auditoria

### 11.1 `AuditEvent`

| Aspecto | Definição |
| --- | --- |
| Papel | Trilha única, imutável e não editável das operações críticas (AR-9.2) |
| Campos mínimos | Tipo do evento, ator, tipo e identificador do alvo, instante, resultado, e os campos adicionais que a fonte normativa exigir |
| Escrita | Append-only, na mesma transação do efeito (AR-9.3, AR-9.4) |
| Retenção | 24 meses do evento; 24 meses do encerramento do caso para moderação, segurança e abuso; 5 anos para metadados financeiros mínimos (DEC-033) |

**DM-11.1.** Eventos auditados no MVP, consolidando RF-022, DEC-031 seção 12 e DEC-037 seção 13:

| Origem | Eventos |
| --- | --- |
| Anúncio | Publicação com aceitação da declaração de conformidade; T5, T6, T7, T8 e T9 |
| Solicitação e vaga | Criação da reserva e da tentativa; expiração da reserva |
| Pagamento | Aprovação (com os dois instantes de DM-7.5 e a origem do reconhecimento); recusa, expiração ou falha; duplicidade detectada com o canônico eleito e o excedente; reembolso técnico com a hipótese RT aplicada e o desfecho de cada tentativa; reembolso pendente; reversão externa com o efeito sobre elegibilidade e sobre vaga; abertura e fechamento de inconsistência; rejeição de notificação por autenticidade |
| Escolha e contato | Cada escolha e cada reseleção, independentemente; autorização de liberação de contato; cada acesso efetivo ao contato liberado |
| Negociação | Encerramento, com estado anterior e estado resultante |
| Avaliação | Invalidação administrativa, com ator administrativo, avaliação, negociação, instante e motivo |
| Moderação | Registro e decisão de denúncia; remoção administrativa, inclusive de ofício com a origem do conhecimento; advertência, restrição e bloqueio; restrição do canal de denúncia; registro e decisão de contestação |
| Conta | Solicitação de exclusão e conclusão do expurgo; bloqueio cautelar etário |

**DM-11.2 (invariante, aplicação).** Nenhum evento contém telefone/WhatsApp em texto claro fora da própria liberação autorizada, nem segredo, nem payload capaz de reconstituí-lo (AR-9.5, PE-6.3, PE-10.2).

**DM-11.3.** O evento de acesso ao contato é modelado como `ContactAccessEvent` (DM-4.4) **e** referenciado na trilha única. A entidade especializada existe porque a liberação tem retenção e campos próprios (DEC-033, seção 6); a referência na trilha existe para que a auditoria seja consultável por um único caminho.

## 12. Quadro de invariantes críticas

Consolidação verificável. A coluna "protegida por" é o compromisso que a Fase 1 e a Fase 3 devem cumprir e que os testes devem exercitar.

| # | Invariante | Origem | Protegida por |
| --- | --- | --- | --- |
| I-1 | Máximo de 3 solicitações ocupando vaga por anúncio | RB-003 | **Restrição de banco**: índice único parcial `(listingId, slotIndex)` sobre `reserved` e `paid` (DM-6.2) |
| I-2 | Uma cobrança válida nunca gera duas vagas | RB-003, PE-3.3 | **Restrição de banco**: tentativa única por solicitação (DM-7.1) + I-1 |
| I-3 | Pagamento excedente não gera vaga | PE-3.4 | **Transação** de confirmação elege o canônico e manda o excedente a reembolso (DM-7.4, PD-7) |
| I-4 | Pagamento acreditado fora da janela não gera vaga | PE-4.3 | **Transação** de confirmação compara acreditação com `reservedUntil` sob a trava do anúncio (DM-6.6) |
| I-5 | Somente uma solicitação por anúncio pode estar escolhida e viva | DEC-032, seção 4.1 | **Restrição de banco**: índice único parcial de negociação `active` por anúncio (DM-8.5) |
| I-6 | Cada solicitação paga é escolhida no máximo uma vez | RS-5 | **Restrição de banco**: escolha única por solicitação (DM-8.3) |
| I-7 | Reversão não apaga histórico | PE-8.5 | **Modelo**: reversão é evento novo; linhas anteriores imutáveis (DM-1.5, DM-6.7) |
| I-8 | Reversão não devolve vaga | PE-8.9, PE-12.6 | **Restrição de banco**: transição de saída de `paid` proibida (DM-6.7) |
| I-9 | Avaliação depende de negociação encerrada | RB-002 | **Transação** de submissão verifica `closed` e janela (DM-9.3) |
| I-10 | Liberação de contato exige escolhido **e** pagamento aprovado, simultaneamente | RB-001 | **Transação** que cria a autorização + reverificação server-side a cada acesso (DM-8.8, [contact-release.md](contact-release.md)) |
| I-11 | Contato nunca em superfície pública | RB-001, RF-014 | **Modelo**: tabela própria sob módulo com ponto de entrada autorizado (DM-4.1) |
| I-12 | Estado incerto de pagamento não concede direito | PE-1.6, CI-9 | **Modelo**: `paid` só existe com pagamento canônico acreditado tempestivo (DM-6.1) |
| I-13 | Trilha de auditoria é imutável | RNF-011 | **Modelo** append-only, sem caminho de `UPDATE`/`DELETE` na aplicação (AR-9.3) |
| I-14 | Nenhuma invariante depende de trabalho periódico disparar | AR-15.3 | **Modelo**: resolução no ato da escrita (DM-6.3) ou derivação na leitura (DM-9.4) |

## 13. O que este documento não faz

| Tema | Onde fica |
| --- | --- |
| Schema Prisma, migrations, nomes físicos, tipos e índices concretos | Fase 1, conforme [ADR-0005](../adr/0005-prisma-orm-migrations.md) |
| Estratégia de paginação, filtros e ordenação da listagem pública | Fase 2 (RF-005) |
| Campos do anúncio além de título, descrição, imagens e cidade/UF | RF-004, que permanece `parcialmente definido` por decisão de produto |
| Modelagem interna da solução de autenticação | Better Auth, na Fase 2 |
| Estrutura de telemetria agregada de funil | Fase 2; não é entidade funcional (DEC-035, seção 6.1) |

## 14. Alternativas rejeitadas

| Alternativa | Decisão | Razão |
| --- | --- | --- |
| Contar solicitações pagas com `COUNT` antes de inserir | **Rejeitada** | É exatamente a corrida que R-02 descreve: entre o `COUNT` e o `INSERT`, outra transação insere. Só uma restrição de banco recusa a quarta de forma incondicional |
| Coluna `paidCount` no anúncio, incrementada na confirmação | **Rejeitada** | Cria segunda fonte de verdade sobre a capacidade, que diverge em qualquer falha parcial, e ainda exige trava para ser correta — todo o custo, nenhuma garantia adicional sobre DM-6.2 |
| Índice único simples sobre `(listingId, slotIndex)`, sem cláusula parcial | **Rejeitada** | Impediria o reuso da vaga após expiração sem apagar a linha, e apagar a linha destruiria o histórico exigido por DM-1.5 |
| Liberar vaga expirada por trabalho periódico | **Rejeitada** | O agendamento é best effort (AR-15.2): uma execução perdida deixaria vagas presas e recusaria solicitações legítimas. A liberação no ato da alocação não tem esse modo de falha |
| Telefone como coluna de `User` ou de `Listing` | **Rejeitada** | Qualquer consulta que selecione a entidade inteira passaria a vazar o dado protegido; a separação torna o vazamento estruturalmente impossível por esse caminho (DM-4.1) |
| Entidade `Interest` persistida | **Rejeitada** | Contraria DEC-035 diretamente |
| Reserva de vaga como entidade separada da solicitação | **Rejeitada** | Duplicaria a identidade que PE-2.1 exige que seja uma só e criaria um segundo lugar onde a vaga poderia ser contada errado |
| Persistir a média de avaliações no usuário | **Rejeitada** | Invalidação administrativa (DEC-030, seção 13) tornaria o campo silenciosamente errado; o cálculo derivado não tem esse defeito |
| Estados de negociação além de `active` e `closed` | **Rejeitada** | DEC-029, seção 3, proíbe expressamente |
| Modelar "desistência" como estado, evento ou motivo | **Rejeitada** | DEC-029, seção 9.3, e DEC-032, seção 7, rejeitaram motivo, culpado e resultado |
| Uma tabela de log por módulo | **Rejeitada** | Imutabilidade, retenção e proibição de dado protegido são propriedades da trilha; espalhá-las garante que uma das cópias as viole (AR-9.2) |
| Proibir duas solicitações do mesmo usuário no mesmo anúncio | **Rejeitada** | Nenhuma decisão vigente proíbe; criar a regra aqui seria inventar requisito de produto ausente (DM-6.11) |

## 15. Rastreabilidade

| Item | Efeito deste documento |
| --- | --- |
| F0-022 | Entrega parcial: modelo de dados exigido pelo item |
| RB-001 | I-10 e I-11; detalhamento em [contact-release.md](contact-release.md) |
| RB-002 | I-9 |
| RB-003 | I-1, I-2, I-3, I-4, I-6, I-8 — com proteção de concorrência explícita em DM-6.2 e DM-6.3 |
| RB-004 | Preservada: nenhuma entidade cria reembolso fora das quatro hipóteses de DEC-037 |
| RB-005 | `Listing` sem qualquer campo de localização além de cidade/UF (DM-5.1) |
| RB-006 | Modelo de denúncia, decisão, sanção e contestação da seção 10 |
| RF-004 a RF-023 | Cada requisito funcional tem entidade e invariante correspondentes neste modelo |
| RNF-016 | I-1 a I-6 e I-14 são a materialização da consistência sob concorrência |
| DEC-019 | Materializada em DM-6.2 e DM-6.3 |
| DEC-027 a DEC-035 | Obedecidas integralmente; nenhuma é alterada |
| DEC-037 | PE-2.1, PE-3.x, PE-4.x, PE-5.x, PE-8.x e PE-12.x têm proteção estrutural correspondente |
| [ADR-0005](../adr/0005-prisma-orm-migrations.md) | Este documento é a entrada do schema inicial; nenhuma migration é criada aqui |
| [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md) | DM-6.3, DM-6.5 e DM-9.4 aplicam suas decisões |
| R-02 | Mitigação deixa de ser recomendação e passa a ser restrição de banco (I-1) |

## 16. Revisão

Revisado quando uma decisão de produto criar, alterar ou remover entidade ou invariante; quando a Fase 1 materializar o schema; ou quando um teste de concorrência demonstrar que alguma proteção aqui declarada é insuficiente.
