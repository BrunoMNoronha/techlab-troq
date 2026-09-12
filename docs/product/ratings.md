# Avaliações

Fonte oficial da política de avaliações no MVP do TROQ. Este documento fecha **OD-02** e é registrado como **DEC-030** em [../decisions/decision-log.md](../decisions/decision-log.md).

## 1. Objetivo

Definir quem avalia quem, quando, em qual formato, por quanto tempo, como a avaliação é publicada, quando pode ser alterada, como a reputação pública é calculada e como o abuso é tratado.

O objetivo de produto é dar sinal de confiança entre desconhecidos que negociaram pelo TROQ, com o menor custo operacional possível e sem criar superfície de moderação desnecessária.

## 2. Escopo

Este documento define a política **normativa de produto** das avaliações do MVP. Não é decisão arquitetural e **não** cria ADR.

Este documento **não** define schema, migrations, endpoints, Server Actions, componentes de interface, notificações, emails nem Web Push. Também **não** define desistência ou reseleção (OD-06), exceções financeiras (OD-07), moderação de anúncios e itens proibidos (OD-03) nem retenção e expurgo de dados e trilhas de auditoria (OD-10).

Preserva integralmente RB-001 a RB-006, o ciclo de vida do anúncio em [listing-lifecycle.md](listing-lifecycle.md) (DEC-027), a política de imagens em [image-policy.md](image-policy.md) (DEC-028) e o ciclo de vida da negociação em [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029).

## 3. Definições

| Termo | Definição |
| --- | --- |
| Avaliação | Registro de uma nota atribuída por um participante de uma negociação à sua contraparte naquela negociação |
| Avaliador | O participante que submete a avaliação |
| Avaliado | A contraparte que recebe a avaliação |
| Direção | O par ordenado (avaliador, avaliado) dentro de uma negociação; existem exatamente duas direções possíveis |
| Janela de avaliação | Período de 14 dias corridos a partir do instante em que a negociação transita para `closed` |
| Avaliação submetida | Avaliação já registrada pelo avaliador, ainda não necessariamente publicada |
| Avaliação publicada | Avaliação cuja nota passou a ser visível e a integrar a reputação pública do avaliado |
| Avaliação válida | Avaliação elegível que não foi invalidada administrativamente |
| Avaliação invalidada | Avaliação removida integralmente do cálculo público por decisão de moderação |
| Reputação pública | Média e contagem das avaliações publicadas e válidas recebidas por um usuário |

## 4. Natureza e participantes elegíveis

A avaliação é **sobre a contraparte da negociação**. Não é avaliação do anúncio, nem do item, nem da plataforma.

Cada negociação pode originar, no máximo, duas avaliações:

| Direção | Avaliador | Avaliado |
| --- | --- | --- |
| 1 | O anunciante | O solicitante escolhido |
| 2 | O solicitante escolhido | O anunciante |

Consequências normativas:

- **no máximo uma** avaliação por direção por negociação, portanto no máximo duas por negociação;
- nenhum outro solicitante pago daquele anúncio pode avaliar com base naquela negociação;
- nenhum usuário externo, visitante, terceiro ou observador pode avaliar;
- **autoavaliação é proibida**: o avaliado é sempre a contraparte, nunca o próprio avaliador;
- as duas direções são independentes entre si quanto à submissão; a publicação é acoplada conforme a seção 8.

## 5. Pré-condições

Uma avaliação somente pode existir se **todas** as condições abaixo forem satisfeitas no momento da submissão:

1. a negociação correspondente existe;
2. o avaliador é um dos dois participantes daquela negociação;
3. o avaliado é exatamente a contraparte daquele avaliador naquela negociação;
4. a negociação está `closed`;
5. a submissão ocorre dentro da janela de 14 dias corridos (seção 7);
6. ainda não existe avaliação válida daquele avaliador para aquela contraparte naquela negociação.

RB-002 é preservada literalmente: *avaliação somente após encerramento da negociação no sistema*.

Consequências:

- negociação `active` **nunca** permite avaliação; qualquer tentativa é rejeitada;
- `closed` é pré-condição **necessária**, não suficiente: as demais condições desta seção também se aplicam.

### 5.1 `closed` não afirma sucesso

Conforme DEC-029, `closed` **não** afirma que a troca foi concluída com sucesso e **não** registra motivo, culpado ou resultado.

Portanto, a elegibilidade da avaliação **não** exige:

- resultado positivo da troca;
- conclusão ou entrega do item;
- motivo de encerramento;
- confirmação bilateral do encerramento;
- concordância da contraparte.

### 5.2 O estado do anúncio é irrelevante

O gatilho da elegibilidade é o **estado da negociação**. O estado do anúncio (`draft`, `published`, `paused`, `closed` ou `removed`, conforme DEC-027) **não** altera a elegibilidade, não a cria e não a revoga. Os dois ciclos permanecem independentes.

## 6. Formato da avaliação

Cada avaliação contém, obrigatoriamente e exclusivamente:

| Campo | Conteúdo | Obrigatório |
| --- | --- | --- |
| Nota | Um inteiro de 1 a 5 ("estrelas") | Sim |

Valores fora de `{1, 2, 3, 4, 5}` são inválidos. Não há nota 0, nota fracionária, meia-estrela nem nota em branco.

O MVP **não** possui:

- comentário em texto livre (nem opcional);
- título;
- imagens ou anexos;
- subnotas ou categorias de nota;
- tags públicas;
- resposta pública do avaliado;
- réplica ou tréplica.

A ausência de texto livre é **deliberada**: mantém o MVP simples, reduz o risco de exposição de dados pessoais e diminui a superfície de moderação de conteúdo gerado por usuário.

## 7. Janela de 14 dias

A janela de avaliação é de **14 dias corridos**, iniciada no instante em que a negociação transita para `closed`.

| Aspecto | Regra |
| --- | --- |
| Início | Instante da transição `active -> closed` |
| Duração | 14 dias corridos (não dias úteis) |
| Quem usa a janela | Cada um dos dois participantes, para sua única avaliação |
| Após o fim | Quem não avaliou **perde** a possibilidade de avaliar aquela negociação |
| Extensão | Não há extensão automática da janela |

A janela é a mesma para as duas direções, porque as duas derivam do mesmo instante de encerramento.

## 8. Submissão, idempotência e publicação cega

### 8.1 Submissão e idempotência

- A primeira submissão válida de uma direção vence e constitui a avaliação daquela direção.
- Uma segunda submissão na mesma direção **não** cria uma segunda avaliação: ou substitui a nota conforme a seção 9, ou é rejeitada se a avaliação já estiver publicada ou a janela já tiver terminado.
- Repetições técnicas da mesma intenção não devem produzir avaliações duplicadas nem múltiplos registros de negócio.
- A autorização é verificada **server-side** (seção 12).

### 8.2 Publicação cega bilateral

Uma avaliação submetida **não** tem sua nota revelada à contraparte antes do **primeiro** dos seguintes eventos:

1. ambas as partes submeteram suas avaliações; ou
2. a janela de 14 dias terminou.

| Cenário | Resultado |
| --- | --- |
| Ambas avaliam dentro da janela | As duas avaliações são publicadas **simultaneamente**, no momento em que a segunda submissão válida é aceita |
| Apenas uma parte avalia | Essa avaliação é publicada somente ao **término da janela** |
| Nenhuma parte avalia | Nada é publicado; a negociação não gera avaliação |

Antes da publicação, **não** se revela à contraparte:

- a nota;
- qualquer representação que permita inferir a nota individual (faixa, agregado derivável, variação de média, ícone, ordenação ou qualquer sinal equivalente).

O fato de que a contraparte já submeteu sua avaliação não é, por si, a nota; a regra protege a **nota**, não a existência do ato. Ainda assim, nenhuma exibição pode permitir inferir a nota individual antes da publicação.

### 8.3 Ausência de avaliação não gera nota

Não se cria avaliação automática para quem não avaliou. A ausência de avaliação **não** equivale a nota neutra, nota zero, nota 3 nem nota 5. Ela simplesmente não existe e não entra em nenhum cálculo.

## 9. Edição antes da publicação

Enquanto a avaliação, cumulativamente:

- estiver dentro dos 14 dias corridos da janela; **e**
- ainda **não** tiver sido publicada,

o próprio autor pode **substituir sua nota**. A substituição mantém a mesma avaliação daquela direção, apenas com outra nota; não cria avaliação adicional e não altera a contagem.

Somente o próprio avaliador pode substituir sua nota. A contraparte não pode editar, solicitar edição nem bloquear a substituição.

## 10. Imutabilidade após a publicação

Depois de publicada, a avaliação torna-se **imutável pelo usuário**:

- a nota não pode ser alterada pelo avaliador;
- a nota não pode ser alterada pelo avaliado;
- não existe fluxo de pedido de revisão da nota dirigido à contraparte;
- não existe remoção da avaliação a pedido de qualquer das partes.

A única alteração possível após a publicação é a **invalidação administrativa integral** prevista na seção 13.

## 11. Cálculo e exposição da reputação pública

Avaliações **publicadas e válidas** alimentam a reputação do usuário avaliado.

| Aspecto | Regra do MVP |
| --- | --- |
| Fórmula | Média aritmética simples das notas publicadas e válidas recebidas |
| Conjunto considerado | Avaliações recebidas pelo usuário atuando como anunciante **e** como solicitante, em conjunto |
| Exibição da média | Uma casa decimal |
| Exibição da contagem | Quantidade de avaliações válidas recebidas |
| Peso por recência | Não se aplica |
| Peso por papel | Não se aplica |
| Score proprietário | Não existe no MVP |
| Ranking | Não existe no MVP |

Não se associa **publicamente** uma nota individual a uma negociação específica, a um anúncio específico ou ao avaliador.

A plataforma **pode** manter internamente a relação avaliação ↔ negociação ↔ avaliador, para autorização, auditoria e moderação. Essa relação é interna e não compõe a exposição pública.

A reputação pública expõe somente o necessário para média e contagem. Ela **não** expõe telefone/WhatsApp nem qualquer outro dado protegido (DEC-023, RB-005).

Usuário sem nenhuma avaliação publicada e válida não possui média; a ausência é exibida como ausência, nunca como nota.

## 12. Autorização e segurança

- Toda submissão, substituição e consulta é autorizada **server-side**.
- A presença, ausência ou habilitação de controle na interface **nunca** é mecanismo de autorização.
- Tentativa de avaliar feita por quem não participa daquela negociação é **rejeitada**.
- Tentativa de avaliar a si mesmo é **rejeitada**.
- Tentativa de avaliar negociação `active`, inexistente ou fora da janela é **rejeitada**.
- A autorização verifica a identidade do avaliador, sua participação naquela negociação, o estado `closed`, a janela e a inexistência de avaliação válida anterior naquela direção.
- Nenhuma resposta do sistema, antes da publicação, pode vazar a nota submetida pela contraparte.

## 13. Abuso e invalidação administrativa

### 13.1 O que não justifica remoção

Uma avaliação **não** pode ser invalidada apenas porque:

- a nota é baixa;
- o avaliado discorda dela;
- uma das partes encerrou a negociação;
- a troca não foi concluída.

Divergência de opinião, isoladamente, **não** é motivo de remoção.

### 13.2 Motivos legítimos de análise

São motivos legítimos para análise de abuso, entre outros equivalentes:

- coerção ou ameaça para obter determinada nota;
- troca de benefício por avaliação;
- conluio para manipular reputação;
- fraude;
- uso de contas coordenadas para inflar ou destruir reputação;
- avaliação originada de ator ou negociação inelegível;
- violação técnica que tenha criado avaliação duplicada ou indevida.

Qualquer um dos dois participantes pode solicitar análise de possível abuso relacionado àquela avaliação ou negociação.

### 13.3 Resultados possíveis da moderação

Uma decisão de moderação pode apenas:

| Resultado | Efeito |
| --- | --- |
| Manter a avaliação | Nenhuma alteração |
| Invalidar a avaliação | Remoção integral do cálculo público |

A moderação **não** ajusta notas: não converte 1 estrela em 3, 4 ou 5, e não cria nota substituta.

Uma avaliação invalidada:

- deixa de participar da média;
- deixa de participar da contagem pública;
- permanece rastreável conforme as regras de auditoria e a futura política de retenção.

A invalidação **não** devolve a possibilidade de nova avaliação na mesma direção: a janela e o limite de uma avaliação por direção continuam valendo.

## 14. Auditoria

Toda decisão de invalidação administrativa gera registro de auditoria contendo, no mínimo conceitualmente:

| Campo | Conteúdo |
| --- | --- |
| Ator | O ator administrativo que decidiu |
| Alvo | A avaliação afetada |
| Contexto | A negociação correspondente |
| Instante | Momento da decisão |
| Motivo | Motivo da invalidação |

Essa auditoria integra RF-022. O registro **não** contém telefone/WhatsApp (DEC-023).

Este documento **não** define prazo de retenção nem expurgo dessas trilhas: isso permanece subordinado a **OD-10**.

## 15. Interações com anúncio, negociação, pagamento e contato

A avaliação é um fato posterior e independente. Registrar, substituir, publicar ou invalidar uma avaliação:

| Não faz | Observação |
| --- | --- |
| Não altera o estado da negociação | `closed` continua terminal e irreversível (DEC-029) |
| Não altera o estado do anúncio | Ciclos independentes (DEC-027) |
| Não gera reembolso | Exceções financeiras permanecem em OD-07 |
| Não cancela pagamento | O pagamento é fato financeiro concluído |
| Não revoga contato já liberado | A liberação é fato auditado (RB-001, RF-015) |
| Não altera o solicitante escolhido | A escolha é fato histórico |
| Não devolve vaga | RB-003 e RB-004 permanecem inalteradas |
| Não autoriza reseleção | Reseleção permanece em OD-06 |

O encerramento da negociação continua **unilateral** e sem aceite da contraparte. A existência ou ausência de avaliação não condiciona o encerramento.

## 16. Casos-limite

| Caso | Resultado |
| --- | --- |
| Negociação `active` e tentativa de avaliar | Rejeitada (seção 5) |
| Negociação inexistente | Rejeitada |
| Avaliador não participa daquela negociação | Rejeitada |
| Avaliado não é a contraparte | Rejeitada |
| Tentativa de autoavaliação | Rejeitada |
| Segunda avaliação da mesma direção, ainda não publicada e dentro da janela | Tratada como substituição da nota (seção 9) |
| Segunda avaliação da mesma direção, já publicada | Rejeitada |
| Submissão no dia 15 após o encerramento | Rejeitada; a janela terminou |
| Apenas uma parte avaliou e a janela terminou | Aquela avaliação é publicada; a outra direção deixa de ser possível |
| Nenhuma parte avaliou e a janela terminou | Nenhuma avaliação existe; nenhuma nota é inferida |
| Substituição de nota após publicação antecipada por dupla submissão | Rejeitada; a publicação tornou a avaliação imutável |
| Anúncio `removed` pela moderação após o encerramento | Não afeta a elegibilidade nem a avaliação já existente |
| Avaliação invalidada após a publicação | Sai da média e da contagem; a direção não é reaberta |
| Usuário sem avaliações publicadas | Não possui média; ausência exibida como ausência |
| Mesma dupla de usuários em negociações distintas | Cada negociação tem suas próprias duas direções e sua própria janela |

## 17. Explicitamente fora do escopo

| Tema | Onde permanece |
| --- | --- |
| Comentário em texto livre, resposta pública, réplica | Fora do MVP; eventual candidato pós-MVP |
| Catálogo/política de itens proibidos e moderação de anúncios | OD-03 |
| Desistência e reseleção | OD-06 |
| Chargebacks e exceções de pagamento | OD-07 |
| Escolha do gateway | OD-08 |
| Retenção, expurgo e exclusão de avaliações e trilhas de auditoria | OD-10 |
| Elegibilidade etária formal | OD-11 |
| Natureza da demonstração de interesse | OD-12 |
| Schema, migrations, API, telas, notificações, emails e Web Push | Fases posteriores |

## 18. Alternativas rejeitadas

| Alternativa | Decisão | Motivo |
| --- | --- | --- |
| Comentário em texto livre no MVP | **Rejeitada** | Cria superfície de moderação de UGC e risco de exposição de dados pessoais sem necessidade para o sinal de confiança mínimo |
| Publicação imediata de cada avaliação | **Rejeitada** | Induz retaliação: quem avalia primeiro fica exposto a nota vingativa |
| Nota automática para quem não avaliou | **Rejeitada** | Inventaria um juízo que ninguém emitiu e distorceria a reputação |
| Exigir troca concluída com sucesso para avaliar | **Rejeitada** | `closed` não registra resultado (DEC-029); a exigência tornaria a avaliação impraticável |
| Exigir confirmação bilateral do encerramento para avaliar | **Rejeitada** | Permitiria bloqueio permanente, incompatível com DEC-029 |
| Ajuste de nota pela moderação | **Rejeitado** | A moderação julga legitimidade, não mérito; alterar nota falsificaria o juízo do avaliador |
| Score proprietário, peso por recência ou ranking | **Rejeitados** no MVP | Complexidade e opacidade sem ganho comprovado nesta etapa |
| Vincular publicamente nota, avaliador e negociação | **Rejeitado** | Expõe as partes sem necessidade e facilita retaliação fora da plataforma |
| Janela ilimitada para avaliar | **Rejeitada** | Avaliação muito posterior perde valor informativo e manteria a publicação cega indefinidamente pendente |

## 19. Rastreabilidade

| Item | Relação |
| --- | --- |
| OD-02 | **Fechada** por este documento (DEC-030) |
| DEC-030 | Registro da decisão em [../decisions/decision-log.md](../decisions/decision-log.md) |
| RB-002 | Preservada literalmente; `closed` é a pré-condição necessária |
| RB-001, RB-003, RB-004, RB-005, RB-006 | Inalteradas |
| RF-017 | **Definido** por este documento |
| RF-022 | Passa a incluir a invalidação administrativa de avaliação entre as operações críticas auditadas |
| DEC-027 / [listing-lifecycle.md](listing-lifecycle.md) | Preservada; o estado do anúncio não altera a elegibilidade |
| DEC-028 / [image-policy.md](image-policy.md) | Preservada; avaliações não possuem imagens |
| DEC-029 / [negotiation-lifecycle.md](negotiation-lifecycle.md) | Preservada integralmente; `closed` continua terminal, irreversível e unilateral |
| OD-03, OD-06, OD-07, OD-08, OD-10, OD-11, OD-12 | Permanecem abertas; nada aqui as fecha ou antecipa |
| F0-016 | Concluído por esta entrega |
