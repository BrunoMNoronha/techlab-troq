# Ciclo de vida do anúncio — TROQ

Documento normativo do ciclo de vida do anúncio no MVP. Fecha [OD-04](../decisions/open-decisions.md) e é registrado como DEC-027 em [../decisions/decision-log.md](../decisions/decision-log.md).

Este documento define **apenas** o ciclo de vida do anúncio. Não define o ciclo de vida da negociação, do interesse, da solicitação ou do pagamento; define somente os efeitos observáveis que o estado do anúncio produz sobre essas entidades. Quando um comportamento depende de decisão ainda aberta, a dependência é apontada explicitamente e **não** é resolvida aqui.

Regras de negócio preservadas integralmente: RB-001 a RB-006 em [business-rules.md](business-rules.md).

## 1. Princípios adotados

1. **Máquina de estados mínima.** Um estado só existe quando altera visibilidade pública, permissão de ação ou autorização. Fatos que podem ser representados por timestamp, motivo ou entidade separada não viram estado.
2. **Anúncio não é negociação.** O estado do anúncio governa a *oferta pública*; o encerramento da negociação é outro ciclo, definido em [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029).
3. **Ação do anunciante é distinta da ação administrativa.** Encerramento voluntário e remoção por moderação são transições diferentes, com atores diferentes e leitura diferente para o usuário.
4. **Nenhuma transição do anúncio desfaz um pagamento.** RB-004 é definitiva.
5. **Nenhuma transição do anúncio revoga uma liberação de contato já autorizada.** A liberação já ocorreu e é auditada (RB-001, RF-015, RF-022).

## 2. Estados do MVP

Cinco estados. O identificador técnico é a forma canônica para modelo de dados e API; o nome em português é a forma de apresentação.

| Identificador técnico | Nome | Público? | Reversível? | Significado |
| --- | --- | --- | --- | --- |
| `draft` | rascunho | não | sim | Anúncio criado pelo anunciante e ainda não publicado. Existe apenas para o próprio anunciante. |
| `published` | publicado | **sim** | sim | Anúncio ativo e consultável por qualquer usuário. Único estado que aceita novos interesses e novas solicitações de desbloqueio. |
| `paused` | pausado | não | sim | Suspensão temporária e voluntária pelo anunciante. O anúncio deixa de ser consultável publicamente, mas continua existindo e pode voltar a `published`. |
| `closed` | encerrado | não | **não** | Encerramento definitivo pelo anunciante. O anúncio deixa de ser consultável e não volta a ser público. |
| `removed` | removido | não | **não** | Remoção administrativa por moderação (RB-006). O anúncio deixa de ser consultável e não volta a ser público. |

`draft` é o **estado inicial**: todo anúncio nasce em `draft` no momento da criação (RF-004). A publicação é sempre uma transição explícita do anunciante.

`closed` e `removed` são **estados terminais**: não existe transição de saída.

### 2.1 Por que `closed` e `removed` são estados separados

São operacionalmente idênticos quanto a visibilidade e a novas solicitações, mas diferentes em tudo o que importa depois:

- **Autor da decisão:** o anunciante em `closed`, a moderação em `removed`.
- **Direito de ação do anunciante:** um anúncio `removed` não pode ser recriado com o mesmo conteúdo (RB-006); um anúncio `closed` pode ser republicado como um **novo** anúncio.
- **Consequências futuras:** reincidência, recurso e efeitos sobre a conta pertencem a OD-03 e precisam distinguir a origem da saída.

Modelar `removed` como um sinalizador sobre `closed` misturaria decisão do usuário com decisão administrativa e tornaria essa distinção dependente de um campo acessório. O custo de um estado adicional é menor que o custo dessa ambiguidade.

### 2.2 Estados avaliados e rejeitados

| Estado avaliado | Origem | Decisão | Motivo |
| --- | --- | --- | --- |
| `expired` / expirado | Prática comum de marketplaces com prazo de veiculação | **Fora do MVP** | Ver seção 7. |
| `under_review` / em análise | `under_review` do Mercado Livre | **Fora do MVP** | Exigiria definir gatilhos, critérios e SLA de análise, que são OD-03. Uma denúncia é uma entidade própria (RF-018) e não precisa alterar o estado do anúncio para existir. Um anúncio permanece `published` até que a moderação decida removê-lo. |
| `inactive` / inativo | `inactive` do Mercado Livre | **Fora do MVP** | É consequência de `under_review` no modelo de origem; sem `under_review`, não tem função. Não acrescenta nada a `paused`. |
| `out_of_stock` / esgotado | `OUT_OF_STOCK` do eBay | **Fora do MVP** | Pressupõe estoque e quantidade. O TROQ não é comércio de estoque: o anúncio é uma oferta única de contato controlado. `paused` cobre o caso de indisponibilidade temporária. |
| `deleted` / excluído | `sub_status: deleted` do Mercado Livre | **Fora do MVP** | Exclusão de dados é assunto de retenção e LGPD ([OD-10](../decisions/open-decisions.md)), não de ciclo de vida da oferta. Introduzir esse estado agora anteciparia OD-10. |
| `negotiating` / em negociação | Direcionamento interno | **Rejeitado** | Confundiria anúncio com negociação. Ver seção 8. |
| `fulfilled` / concluído | Direcionamento interno | **Rejeitado** | O desfecho da negociação pertence ao ciclo próprio da negociação ([negotiation-lifecycle.md](negotiation-lifecycle.md), DEC-029). Um anúncio cuja negociação terminou é encerrado pelo anunciante via `closed`, se ele assim decidir. |

### 2.3 Fatos que não são estados

Registrados como atributos do anúncio, não como estados:

- instante de publicação, de pausa, de reativação, de encerramento e de remoção (timestamps, base de auditoria em RF-022);
- motivo da remoção administrativa e identificação do moderador (RF-019, detalhamento em OD-03);
- existência e quantidade de interesses, solicitações e solicitações pagas (entidades próprias, RF-008 a RF-010);
- existência de solicitante escolhido (atributo da escolha, RF-013);
- estado da negociação (ciclo próprio, [negotiation-lifecycle.md](negotiation-lifecycle.md), DEC-029).

## 3. Capacidades por estado

| Estado | Consultável publicamente (RF-005) | Aceita novo interesse (RF-008) | Aceita nova solicitação de desbloqueio (RF-009) | Editável pelo anunciante | Visível ao anunciante em "meus anúncios" |
| --- | --- | --- | --- | --- | --- |
| `draft` | não | não | não | **sim** | sim |
| `published` | **sim** | **sim** | **sim** | **sim** | sim |
| `paused` | não | não | não | **sim** | sim |
| `closed` | não | não | não | não | sim, como histórico |
| `removed` | não | não | não | não | sim, como histórico |

Notas normativas:

- **Consulta pública.** Somente `published` aparece em listagem, detalhe público, busca, feed ou qualquer cache público. Requisição ao detalhe de um anúncio em qualquer outro estado, por usuário que não seja o anunciante, deve responder como recurso não disponível, sem revelar a existência prévia nem o estado interno do anúncio.
- **Interesse.** A linha "aceita novo interesse" pressupõe que a demonstração de interesse exista como ação própria. Se [OD-12](../decisions/open-decisions.md) concluir que ela é apenas o início da solicitação paga, a coluna passa a ser lida como parte da coluna seguinte, sem alterar as demais definições deste documento.
- **Edição.** Edição em `published` altera conteúdo público imediatamente e não muda o estado. Os campos editáveis seguem RF-004; a adição, remoção, ordenação e o reprocessamento de imagens seguem [image-policy.md](image-policy.md), que também impede que uma edição em `published` resulte em zero imagens válidas.
- **Verificação server-side.** Toda checagem de estado é feita no servidor. A ausência de um botão na interface nunca é o controle de acesso (RF-014, RNF-007).

## 4. Matriz de transições

| # | De | Para | Ator autorizado | Reversível | Gatilho |
| --- | --- | --- | --- | --- | --- |
| T1 | `draft` | `published` | anunciante (dono) | sim, via T3 | Publicação |
| T2 | `draft` | `closed` | anunciante (dono) | **não** | Descarte de rascunho |
| T3 | `published` | `paused` | anunciante (dono) | sim, via T4 | Pausa voluntária |
| T4 | `paused` | `published` | anunciante (dono) | sim, via T3 | Reativação |
| T5 | `published` | `closed` | anunciante (dono) | **não** | Encerramento definitivo |
| T6 | `paused` | `closed` | anunciante (dono) | **não** | Encerramento definitivo a partir da pausa |
| T7 | `draft` | `removed` | moderação | **não** | Remoção administrativa (RB-006) |
| T8 | `published` | `removed` | moderação | **não** | Remoção administrativa (RB-006) |
| T9 | `paused` | `removed` | moderação | **não** | Remoção administrativa (RB-006) |

Qualquer par (origem, destino) ausente desta matriz é **proibido**. Em particular são proibidas: `closed` → qualquer estado; `removed` → qualquer estado; `published` → `draft`; `paused` → `draft`; e qualquer transição de saída de terminal.

Regras adicionais:

- **Autorização.** T1 a T6 exigem sessão autenticada e verificada, e que o autor seja o **dono** do anúncio (RF-003). T7 a T9 exigem perfil de moderação; o desenho desse perfil pertence a RF-019 e à Fase 4 do [roadmap](../delivery/roadmap.md).
- **Auditoria.** T5, T6, T7, T8 e T9 são operações críticas e geram registro de auditoria com ator, alvo, instante e resultado (RF-022). T7 a T9 registram também o motivo da remoção.
- **Idempotência.** Aplicar uma transição a um anúncio que já está no estado de destino não é erro de negócio nem gera novo registro de auditoria; aplicar uma transição proibida é rejeitada.
- **Confirmação.** T2, T5 e T6 são irreversíveis e devem exigir confirmação explícita do anunciante na interface.
- **Ausência de transições automáticas.** Nenhuma transição deste documento é disparada por tempo, por job ou por evento de pagamento, interesse, escolha ou negociação. Toda transição tem um ator humano.

### 4.1 Representação

```
                    T1              T3
  (criação) → draft ────► published ────► paused
                 │            │      ◄────   │
                 │            │        T4    │
                 │ T2         │ T5           │ T6
                 │            │              │
                 ▼            ▼              ▼
                       [ closed ]  (terminal)

                 │            │              │
                 │ T7         │ T8           │ T9
                 ▼            ▼              ▼
                       [ removed ] (terminal)
```

Leitura: as colunas do diagrama correspondem, da esquerda para a direita, a `draft`, `published` e `paused`. Cada uma delas tem uma saída para `closed` (T2, T5, T6) e uma saída para `removed` (T7, T8, T9). `closed` e `removed` não possuem setas de saída.

## 5. Efeitos das transições sobre entidades relacionadas

O anúncio nunca apaga, cancela ou reverte o que já ocorreu. Ele apenas deixa de **admitir coisas novas**.

| Transição | Interesses já existentes | Solicitações já iniciadas e não pagas | Solicitações com pagamento aprovado | Solicitante já escolhido |
| --- | --- | --- | --- | --- |
| T1 `draft`→`published` | não se aplica (não podem existir) | não se aplica | não se aplica | não se aplica |
| T2 `draft`→`closed` | não se aplica | não se aplica | não se aplica | não se aplica |
| T3 `published`→`paused` | preservados; nenhum é apagado | não avançam enquanto pausado; nenhuma nova é aceita | preservadas e válidas; continuam elegíveis à escolha | preservado; contato já liberado continua liberado |
| T4 `paused`→`published` | preservados | voltam a poder avançar, respeitando RB-003 e a reserva de vaga (RF-010) | inalteradas | inalterado |
| T5/T6 →`closed` | preservados como histórico; nenhum novo é aceito | encerradas sem cobrança; a vaga reservada é liberada | **preservadas; a cobrança permanece definitiva (RB-004)**; continuam elegíveis à escolha | preservado; contato já liberado continua liberado |
| T7/T8/T9 →`removed` | preservados como histórico; nenhum novo é aceito | encerradas sem cobrança; a vaga reservada é liberada | **preservadas; a cobrança permanece definitiva (RB-004)**; ver seção 6 quanto à escolha | preservado; contato já liberado **não** é revogado |

Detalhamento normativo:

- **Solicitações pagas nunca são canceladas pelo estado do anúncio.** Nem `paused`, nem `closed`, nem `removed` invalidam uma solicitação paga. RB-004 é preservada literalmente: a cobrança de R$ 0,99 é definitiva. Este documento **não** cria política de reembolso, estorno, chargeback ou compensação; qualquer exceção pertence a [OD-07](../decisions/open-decisions.md) e a [OD-08](../decisions/open-decisions.md).
- **Solicitações não pagas não ocupam vaga** (RF-009, RF-010): encerrá-las junto com o anúncio não afeta RB-003.
- **O limite de 3 solicitações pagas (RB-003) é do anúncio e não é reiniciado por nenhuma transição.** Uma pausa seguida de reativação não devolve vagas; um anúncio que já acumulou 3 solicitações pagas continua com 3 após T3+T4.
- **Escolha do solicitante.** O anunciante continua podendo escolher entre as solicitações pagas de um anúncio `paused` ou `closed`, porque a negociação é um ciclo distinto (seção 8) e a cobrança já foi definitiva. As regras de desistência e reseleção permanecem em [OD-06](../decisions/open-decisions.md) e não são decididas aqui.
- **Contato já liberado.** Nenhuma transição revoga uma liberação já autorizada e auditada (RB-001, RF-015). Uma liberação **nova** exige, além do estado do anúncio, as duas condições de RB-001; ver seção 6 para o caso de remoção.
- **Imagens.** As imagens de um anúncio `closed` ou `removed` deixam imediatamente de ser servidas pela superfície pública, junto com o restante do conteúdo, conforme [image-policy.md](image-policy.md) (DEC-028). Isso **não** implica exclusão física dos objetos: a retenção e o expurgo definitivo dos derivados persistidos continuam dependendo de [OD-10](../decisions/open-decisions.md).

## 6. Remoção por moderação

`removed` existe para satisfazer RB-006: anúncios com itens proibidos devem ser removidos.

Definido aqui:

- a moderação pode levar um anúncio de `draft`, `published` ou `paused` para `removed` (T7, T8, T9);
- `removed` é terminal e o anúncio não volta a ser público (RF-020);
- a remoção deixa o anúncio não consultável imediatamente, em qualquer superfície pública, incluindo caches;
- a remoção gera registro de auditoria com moderador, instante, anúncio e motivo (RF-019, RF-022);
- a remoção **não** revoga liberações de contato já autorizadas, por serem fatos já consumados e auditados;
- em anúncio `removed`, **nenhuma nova liberação de contato deve ser autorizada**, ainda que exista solicitação paga elegível. Esta é a única restrição que a remoção impõe além da visibilidade, e ela protege RB-006: a plataforma não intermedia novos contatos originados de um anúncio reconhecidamente proibido;
- a escolha de solicitante em anúncio `removed` fica igualmente indisponível, por ser o passo anterior à liberação (RF-013).

**Não** definido aqui, e permanece em [OD-03](../decisions/open-decisions.md): catálogo de itens proibidos, critérios de classificação, gatilhos de análise, SLA, direito de recurso, revisão da decisão, reincidência e efeitos sobre a conta do anunciante. **Não** definido aqui, e permanece em [OD-07](../decisions/open-decisions.md): tratamento financeiro das solicitações pagas de um anúncio removido.

## 7. Expiração automática — decisão explícita

**Decisão: não haverá expiração automática de anúncios no MVP.** Não existe estado `expired` e nenhum job altera o estado de um anúncio por decurso de prazo.

Fundamentação:

- Marketplaces com prazo de veiculação usam expiração porque vendem tempo de exposição ou gerenciam estoque. O TROQ não faz nenhum dos dois: o anúncio é gratuito e a receita vem da solicitação paga de desbloqueio (RB-004).
- Expiração exigiria decidir prazo, política de renovação, aviso prévio e efeito sobre solicitações em andamento — quatro decisões novas sem regra de negócio vigente que as sustente.
- Um anúncio obsoleto tem saída explícita e barata: `paused` ou `closed`, ambos sob controle do anunciante.
- Introduzir expiração seria o único mecanismo do sistema capaz de mudar o estado de um anúncio sem ator humano, o que contraria a seção 4 e complicaria auditoria.

Consequência aceita: a base pode acumular anúncios `published` antigos. A mitigação é de apresentação (ordenação e sinalização de idade na listagem, a definir na Fase 2 do [roadmap](../delivery/roadmap.md)), não de ciclo de vida. Se surgir necessidade comprovada de expiração, ela será uma decisão nova, com ADR ou documento de produto próprio, e não deve ser inferida deste documento.

## 8. Anúncio e negociação são ciclos distintos

| | Ciclo do anúncio | Ciclo da negociação |
| --- | --- | --- |
| Objeto | A oferta pública | A relação entre anunciante e solicitante escolhido |
| Escopo | Um anúncio | Uma escolha dentro de um anúncio |
| Estados | Este documento (`draft`, `published`, `paused`, `closed`, `removed`) | `active` e `closed`, definidos em [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029) |
| Quem governa | Anunciante e moderação | Qualquer uma das duas partes da negociação, unilateralmente (DEC-029) |
| Habilita avaliação | Não | Sim, após encerramento (RB-002) |

Consequências normativas:

- **`closed` não é encerramento de negociação.** Um anúncio `closed` significa apenas que a oferta saiu do ar. A negociação relacionada pode continuar existindo, e seu encerramento — que é a pré-condição das avaliações (RB-002, RF-016) — é um evento próprio, definido em [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029). Os dois ciclos permanecem independentes.
- **Encerrar a negociação não encerra o anúncio.** Nada neste documento faz um anúncio mudar de estado por causa de um evento de negociação. DEC-029 confirma essa independência: sugerir ao anunciante que encerre o anúncio após o encerramento da negociação será sempre uma ação voluntária dele (T5 ou T6), nunca uma transição automática.
- **Um anúncio pode deixar de aceitar novos interessados e ainda ter negociação viva.** É exatamente o caso de `paused` e `closed` com solicitante escolhido.
- **Avaliações (RB-002, RF-017) nunca dependem do estado do anúncio.** Dependem do encerramento da negociação, conforme [ratings.md](ratings.md) (DEC-030).

## 9. Cenários de consistência

| Cenário | Comportamento esperado |
| --- | --- |
| Criação ainda não publicada | Anúncio em `draft`, invisível para terceiros, editável, sem interesses nem solicitações possíveis. |
| Publicação | T1. Passa a ser consultável e a aceitar interesses e solicitações. |
| Pausa voluntária | T3. Sai da consulta pública; nenhum interesse ou solicitação nova é aceito; nada existente é perdido. |
| Reativação | T4. Volta à consulta pública; contadores de RB-003 permanecem como estavam. |
| Encerramento pelo anunciante | T5 ou T6, com confirmação explícita. Irreversível. Solicitações pagas preservadas; cobranças definitivas. |
| Remoção administrativa | T7, T8 ou T9. Irreversível, auditada com motivo; além da invisibilidade, bloqueia nova escolha e nova liberação de contato (seção 6). |
| Tentativa de agir sobre anúncio não consultável | Qualquer tentativa de interesse, solicitação, pagamento ou escolha em anúncio que não esteja `published` é rejeitada no servidor. A resposta ao público não revela existência nem estado anterior do anúncio. |
| Anúncio sem nenhuma solicitação | Todas as transições permitidas ocorrem sem efeito colateral. |
| Anúncio com solicitações em andamento e não pagas | Pausa suspende o avanço; encerramento e remoção as terminam sem cobrança e liberam a vaga reservada. |
| Anúncio com 1 a 3 solicitações pagas | Nenhuma transição as cancela nem devolve o valor (RB-004). Ao atingir 3, novas solicitações pagas são recusadas mesmo com o anúncio `published` (RB-003, RF-010). |
| Anúncio com solicitante já escolhido | A escolha e a liberação já feita permanecem em qualquer estado. Pausar ou encerrar o anúncio não afeta a negociação em curso (seção 8). |
| Anúncio `published` com 3 solicitações pagas e sem escolha | Continua público e continua aceitando interesses, mas recusa novas solicitações pagas. A distinção entre "sem vaga" e "não público" é do contador de RB-003, não do estado do anúncio. |
| Anúncio removido cujo contato já havia sido liberado | A liberação anterior permanece válida e auditada; nenhuma nova liberação é autorizada. |

## 10. Rastreabilidade

| Referência | Relação com este documento |
| --- | --- |
| OD-04 | Fechada por este documento. |
| DEC-027 | Registro da decisão em [../decisions/decision-log.md](../decisions/decision-log.md). |
| RB-001 | Liberação preservada; remoção não revoga liberação anterior e impede nova (seção 6). |
| RB-002 | Preservada; avaliação depende do encerramento da negociação, não do estado do anúncio (seção 8). |
| RB-003 | Preservada; limite é do anúncio e não é reiniciado por transição (seção 5). |
| RB-004 | Preservada; nenhuma transição gera reembolso (seção 5). |
| RB-005 | Inalterada; localização pública segue cidade/UF em `published`. |
| RB-006 | Atendida pelo estado `removed` e por T7 a T9 (seção 6). |
| RF-004 | Estado inicial `draft`; publicação por T1; edição conforme seção 3. |
| RF-005 | Somente `published` é consultável publicamente. |
| RF-006 | Imagens deixam de ser servidas publicamente com o anúncio; regras de imagem em [image-policy.md](image-policy.md) (DEC-028); expurgo definitivo segue OD-10. |
| RF-008 | Novos interesses somente em `published`. |
| RF-009, RF-010 | Novas solicitações somente em `published`; vagas reservadas e não pagas são liberadas em `closed`/`removed`. |
| RF-013, RF-015 | Escolha e liberação indisponíveis em `removed`; efeitos de desistência e reseleção seguem OD-06. |
| RF-016, RF-017 | Independentes do estado do anúncio; RF-016 segue [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029) e RF-017 segue [ratings.md](ratings.md) (DEC-030). |
| RF-019, RF-020 | Moderação usa T7 a T9; critérios seguem OD-03. |
| RF-022 | Transições T5 a T9 são auditadas. |
| OD-05 | Fechada posteriormente por [image-policy.md](image-policy.md) (DEC-028); nada neste documento a antecipou. |
| OD-01 | Fechada posteriormente por [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029); nada neste documento a antecipou, e DEC-029 preserva integralmente a máquina de estados do anúncio. |
| OD-03, OD-06, OD-07, OD-08, OD-10, OD-11, OD-12 | Permanecem abertas. Nada neste documento as fecha ou antecipa. |
| OD-02 | Permanecia aberta nesta decisão; foi fechada depois por [ratings.md](ratings.md) (DEC-030), que preserva a independência entre o estado do anúncio e a elegibilidade da avaliação. |

## 11. Referências externas consultadas

Consultadas para avaliar padrões de mercado, não para copiar modelo.

| Fonte | Padrão observado | Uso no TROQ |
| --- | --- | --- |
| [Mercado Livre — Items & Searches](https://developers.mercadolivre.com.br/en_us/items-and-searches) | Distinção entre `paused` (oculto, reativável) e `closed` (definitivo); `under_review` e `inactive` para o fluxo de moderação; `sub_status: deleted` | Confirmou a separação pausa × encerramento, adotada. `under_review`, `inactive` e `deleted` foram rejeitados (seção 2.2). |
| [eBay — ListingStatusEnum (Sell Inventory API)](https://developer.ebay.com/api-docs/sell/inventory/types/slr:ListingStatusEnum) | `ACTIVE`, `OUT_OF_STOCK` (ativo porém oculto da busca), `ENDED`, `INACTIVE` | Confirmou que "ativo" e "fim de vida" são estados distintos. `OUT_OF_STOCK` foi rejeitado por pressupor estoque, inexistente no TROQ (seção 2.2). |

Nenhuma das fontes justificou, por si só, a adoção de expiração automática; a decisão de excluí-la está fundamentada na seção 7 em características próprias do TROQ.
