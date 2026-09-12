# Política de itens proibidos — TROQ

Documento normativo da política de itens proibidos, denúncia, moderação e remoção no MVP. Fecha [OD-03](../decisions/open-decisions.md) e é registrado como DEC-031 em [../decisions/decision-log.md](../decisions/decision-log.md).

Este documento é a **fonte normativa** de RB-006 e dos requisitos RF-018, RF-019 e RF-020. Ele define o catálogo por categorias, a regra para casos ambíguos, o comportamento na publicação, o fluxo de denúncia, o fluxo de moderação, os critérios e efeitos da remoção, os prazos de tratamento, a reincidência, a contestação, a auditoria e os limites de privacidade.

Regras de negócio preservadas integralmente: RB-001 a RB-006 em [business-rules.md](business-rules.md). Decisões preservadas integralmente: DEC-001 a DEC-030, em especial DEC-027 ([listing-lifecycle.md](listing-lifecycle.md)), DEC-028 ([image-policy.md](image-policy.md)), DEC-029 ([negotiation-lifecycle.md](negotiation-lifecycle.md)) e DEC-030 ([ratings.md](ratings.md)).

Este documento **não** é parecer jurídico, **não** é termo de uso, **não** é política de privacidade e **não** fecha nenhuma outra decisão aberta. Ver seção 14.

## 1. Finalidade e princípios

RB-006 determina que anúncios com itens proibidos devem ser removidos. A regra existe desde o baseline; o que faltava era o catálogo, os critérios e o fluxo. Este documento supre exatamente essa lacuna, de modo que as fases de implementação não precisem inventar a política do produto.

Objetivos, em ordem de prioridade:

1. reduzir risco legal e regulatório para a plataforma e para os usuários;
2. reduzir risco sanitário e de segurança física;
3. reduzir risco de fraude e de uso do TROQ como canal de escoamento de bens de origem ilícita;
4. manter a moderação operável por uma equipe pequena, com critérios verificáveis.

Princípios adotados:

1. **A política do TROQ pode ser mais restritiva que a legislação.** Proibir uma categoria no TROQ **não** afirma que negociá-la seja ilegal no Brasil. A recíproca também vale: permitir um item não atesta legalidade.
2. **Ausência na lista não é permissão.** O catálogo é por categorias e critérios, não por enumeração de produtos. Um item duvidoso não se torna permitido por não estar nomeado; ele é resolvido pela regra da seção 4.
3. **Conservadorismo deliberado por ausência de capacidade de compliance.** Quando um item depende de licença, autorização, prescrição, registro do vendedor, certificado de procedência, controle etário ou mecanismo equivalente que o TROQ não possui, a solução do MVP é **não permitir o anúncio**. Ver seção 2.
4. **O moderador não produz parecer jurídico.** As decisões usam critérios de categoria e de evidência observável no anúncio, não análise normativa caso a caso.
5. **Toda decisão administrativa é motivada e auditável.** Sem exceção (seção 12).
6. **Simplicidade.** O MVP não constrói uma plataforma de trust & safety. O que não é necessário para satisfazer RB-006 de forma defensável fica fora.

## 2. Decisão estruturante: sem fluxo de documentação no MVP

**Decisão: o TROQ não implementa, no MVP, nenhum fluxo de autorização documental para categorias reguladas.** Não existe, nesta fase, a categoria funcional "permitido mediante documento", "permitido mediante licença" ou "permitido mediante comprovação".

Consequência direta: **se a legalidade da oferta depender de licença, autorização, prescrição, registro sanitário, certificado de procedência, habilitação do vendedor como estabelecimento comercial, ou de verificação de idade do adquirente, a categoria é proibida no TROQ MVP.**

Fundamentação:

- O TROQ é um marketplace C2C simples entre pessoas. Não há cadastro de pessoa jurídica, não há verificação de licença, não há verificação de idade — a elegibilidade etária formal permanece aberta em [OD-11](../decisions/open-decisions.md) — e não há verificação de procedência.
- A pesquisa externa (seção 16) mostra que várias categorias reguladas só são lícitas quando o **vendedor** é um estabelecimento autorizado: medicamentos só podem ser dispensados a distância por farmácia ou drogaria licenciada e com farmacêutico presente; fauna silvestre só pode ser comercializada por criadouro ou empreendimento licenciado, com marcação individual e documentação de origem; armas, munições e produtos controlados dependem de autorização e registro. Nenhuma dessas condições pode ser verificada pelo TROQ no MVP.
- Construir um fluxo de compliance documental exigiria coleta e guarda de documentos, verificação de autenticidade e decisão sobre validade — atividade de risco alto, custo alto e fora do escopo das fases previstas no [roadmap](../delivery/roadmap.md).
- Proibir a categoria é reversível: se o produto amadurecer e ganhar capacidade de verificação, uma permissão condicionada pode ser criada por decisão nova e registrada. O inverso — permitir e não conseguir verificar — não é reversível quanto ao dano já causado.

Esta é uma **decisão de escopo e mitigação de risco**, não uma afirmação de ilegalidade das categorias envolvidas.

## 3. Catálogo de categorias proibidas

### 3.1 Como ler o catálogo

Cada categoria registra um **fundamento**, classificado em um de três tipos. A distinção é obrigatória e não deve ser perdida em nenhuma superfície derivada deste documento (interface, termos, mensagens de moderação):

| Fundamento | Significado | Leitura correta |
| --- | --- | --- |
| `ilegal` | A conduta de vender, oferecer ou expor à venda é vedada por legislação, conforme fonte registrada na seção 16 | "Isto é proibido por lei" |
| `regulado` | A comercialização é lícita apenas sob licença, autorização, registro, prescrição ou controle equivalente, incompatível com um marketplace C2C sem verificação; bloqueado no TROQ pela decisão da seção 2 | "Isto pode ser lícito no Brasil, mas o TROQ não tem como verificar as condições, então não aceita" |
| `política` | Não há vedação legal clara aplicável, mas o risco jurídico, sanitário, de segurança ou operacional é desproporcional para o MVP | "O TROQ escolheu não aceitar" |

Os exemplos são **não exaustivos** e ilustram a categoria; não constituem a definição.

### 3.2 Categorias

#### PI-01 — Itens cuja comercialização é ilegal

- **Definição:** qualquer bem cuja venda, oferta ou exposição à venda seja vedada por legislação brasileira, ainda que a categoria não esteja nomeada nas demais linhas deste catálogo.
- **Fundamento:** `ilegal`.
- **Exemplos não exaustivos:** documentos de identificação falsos ou de terceiros; diplomas e certificados falsos; meios de fraude a sistemas de pagamento; dados pessoais de terceiros; serviços de invasão de contas ou dispositivos.
- **Casos limítrofes:** esta é a categoria residual legal. Se a ilegalidade não for sustentada por fonte, o caso **não** pertence a PI-01 e deve ser tratado por PI-12 ou pela regra da seção 4, sem afirmar ilegalidade.

#### PI-02 — Bens de origem ilícita ou razoavelmente suspeita

- **Definição:** bens furtados, roubados, obtidos por fraude, provenientes de crime, ou cuja origem o anúncio indique ser irregular, incluindo mercadoria estrangeira sem comprovação de importação regular.
- **Fundamento:** `ilegal`.
- **Exemplos não exaustivos:** aparelhos celulares com registro de roubo, furto ou extravio; itens com número de série, IMEI ou identificação removida, raspada ou adulterada; peças automotivas sem procedência; produtos importados anunciados como "sem nota" ou "trazido de fora" quando somados a outro indício.
- **Casos limítrofes:** a ausência de nota fiscal, **isoladamente**, é normal em negociação entre pessoas e **não** caracteriza PI-02. O que caracteriza é o conjunto de indícios: identificação suprimida, preço incompatível de forma extrema, quantidade incompatível com uso pessoal, menção a origem irregular, ou registro público de restrição. Em categorias de alto risco, aplica-se a seção 4.

#### PI-03 — Armas de fogo, munições, explosivos, acessórios e simulacros

- **Definição:** armas de fogo e suas partes, munições, insumos de recarga, pólvora, explosivos, artefatos explosivos, fogos de artifício de potencial lesivo e simulacros ou réplicas que possam ser confundidos com arma de fogo.
- **Fundamento:** `ilegal` para a transferência entre particulares sem autorização e para simulacros que se confundam com arma de fogo; `regulado` para o restante.
- **Exemplos não exaustivos:** revólveres, pistolas, espingardas, carregadores, munição virgem ou recarregada, pólvora, explosivos, airsoft e airgun com aparência de arma de fogo, armas de choque.
- **Casos limítrofes:** itens de colecionismo, desportivos ou de caça **também** são proibidos no TROQ, porque a transferência lícita exige autorização e registro que o TROQ não verifica. Facas e ferramentas de uso comum não pertencem a PI-03, salvo quando o anúncio as apresente como arma ou as associe a violência; nesse caso, PI-12.

#### PI-04 — Drogas, entorpecentes e substâncias controladas

- **Definição:** drogas ilícitas, substâncias sujeitas a controle especial, precursores químicos e insumos destinados à produção dessas substâncias.
- **Fundamento:** `ilegal`.
- **Exemplos não exaustivos:** maconha, cocaína, drogas sintéticas, anabolizantes sem prescrição, precursores químicos, sementes e insumos anunciados para cultivo de espécie controlada, parafernália anunciada com finalidade explícita de uso de droga ilícita.
- **Casos limítrofes:** a legislação de drogas alcança expressamente **oferecer e expor à venda**, ainda que a título gratuito. Portanto, um anúncio sem preço ou apresentado como doação **não** sai da categoria.

#### PI-05 — Medicamentos e produtos sujeitos à vigilância sanitária

- **Definição:** medicamentos de qualquer natureza, incluindo os isentos de prescrição e os manipulados; produtos para saúde, dispositivos médicos, testes diagnósticos, vacinas e insumos correlatos; cosméticos, saneantes e suplementos sem registro ou de procedência não identificável.
- **Fundamento:** `regulado`.
- **Exemplos não exaustivos:** sobras de medicamento de uso domiciliar; medicamentos controlados; injetáveis; lentes de contato com grau; aparelhos médicos; produtos importados sem registro.
- **Casos limítrofes:** a dispensação a distância é reservada a farmácias e drogarias licenciadas com farmacêutico presente. Uma pessoa física anunciando medicamento no TROQ nunca satisfaz essa condição, o que torna a categoria integralmente proibida no MVP, **independentemente** de o medicamento ser ou não de venda livre. Cosméticos e suplementos lacrados, com marca e registro identificáveis, não são alcançados por esta linha; sem isso, aplica-se a seção 4.

#### PI-06 — Tabaco, dispositivos eletrônicos para fumar e correlatos

- **Definição:** cigarros, charutos, tabaco para consumo, narguilé e essências, e **todos** os dispositivos eletrônicos para fumar, seus componentes, refis e líquidos.
- **Fundamento:** `ilegal` para dispositivos eletrônicos para fumar, cuja fabricação, importação, comercialização, distribuição, armazenamento, transporte e propaganda são proibidos no Brasil; `regulado` e `política` para os demais produtos de tabaco, que dependem de controle etário e de regime tributário específico.
- **Exemplos não exaustivos:** cigarro eletrônico, vape, pod, e-liquid, cigarros de qualquer marca, tabaco a granel.
- **Casos limítrofes:** objetos de coleção sem produto fumígeno — por exemplo, isqueiros, cinzeiros ou latas vazias — não pertencem a PI-06.

#### PI-07 — Bebidas alcoólicas e outros itens sob controle etário

- **Definição:** bebidas alcoólicas e qualquer item cuja oferta lícita dependa de verificação de idade do adquirente.
- **Fundamento:** `regulado`, combinado com a decisão da seção 2.
- **Exemplos não exaustivos:** destilados, vinhos, cervejas, coleções de bebidas fechadas, fogos de artifício, bilhetes de loteria e equivalentes.
- **Casos limítrofes:** a vedação de venda desses itens a menores é legal e expressa. O TROQ **não possui** verificação de idade no MVP — [OD-11](../decisions/open-decisions.md) segue aberta — e, portanto, não pode cumprir o controle. A proibição é da categoria, **não** uma afirmação de que a venda entre adultos seja ilegal. Garrafa vazia de valor decorativo, sem conteúdo alcoólico, não pertence a PI-07.

#### PI-08 — Fauna, flora, partes de animais e produtos de origem biológica controlada

- **Definição:** animais vivos silvestres ou exóticos, partes, ovos, ninhos, produtos e subprodutos de fauna, espécies de flora protegidas, madeira e produtos florestais de origem controlada.
- **Fundamento:** `ilegal` quando não houver origem autorizada; `regulado` no restante, porque a comercialização lícita exige criadouro ou empreendimento licenciado, marcação individual e documentação de origem.
- **Exemplos não exaustivos:** aves, répteis, primatas, peles e couros de espécie protegida, penas, marfim, corais, cactos e orquídeas de espécie protegida, madeira de espécie controlada.
- **Casos limítrofes:** animais domésticos não são alcançados por esta linha quanto à origem, mas a **oferta de animais mediante pagamento** envolve legislação de bem-estar e regulação local heterogênea; por decisão de produto (`política`), anúncios de animais vivos de qualquer espécie são proibidos no TROQ MVP.

#### PI-09 — Substâncias e materiais perigosos

- **Definição:** produtos tóxicos, corrosivos, inflamáveis, radioativos, gases pressurizados, agrotóxicos e demais materiais cujo transporte, posse ou transferência exija regulamentação especializada ou apresente risco material em uma entrega entre pessoas.
- **Fundamento:** `regulado` e `política`.
- **Exemplos não exaustivos:** agrotóxicos, mercúrio, ácidos, solventes industriais, botijões e cilindros, baterias danificadas ou infladas, fontes radioativas.
- **Casos limítrofes:** produtos de limpeza e manutenção de uso doméstico, lacrados e com rótulo de marca, não pertencem a PI-09.

#### PI-10 — Falsificações e violações de propriedade intelectual

- **Definição:** produtos falsificados, contrafeitos, cópias não autorizadas de obra protegida e itens que violem marca, patente, desenho industrial ou direito autoral de forma evidente no próprio anúncio.
- **Fundamento:** `ilegal`.
- **Exemplos não exaustivos:** vestuário, calçados, acessórios, eletrônicos e peças com marca falsificada; réplicas anunciadas como "primeira linha", "AAA" ou "réplica premium"; mídias piratas; chaves de software ou credenciais de serviço revendidas; dispositivos de acesso irregular a conteúdo por assinatura.
- **Casos limítrofes:** a evidência exigida é a do próprio anúncio — declaração de réplica, preço e descrição incompatíveis com o produto original, marca adulterada. O TROQ **não** julga autenticidade técnica de produto usado nem atua como perito. Dúvida sem evidência no anúncio não sustenta remoção por PI-10; havendo dúvida material em categoria de alto risco, aplica-se a seção 4.

#### PI-11 — Serviços, bens imateriais e itens fora da natureza do TROQ

- **Definição:** ofertas que não são um bem físico pessoal transferível: serviços, empregos, empréstimos e crédito, investimentos, criptoativos, valores mobiliários, jogos de azar e apostas, ingressos revendidos acima do valor, cotas, rifas e sorteios, arrecadação de valores e conteúdo adulto.
- **Fundamento:** `política`, com componente `regulado` nas linhas financeiras e de apostas.
- **Exemplos não exaustivos:** "faço bicos", "empresto dinheiro", "invista comigo", venda de criptoativo, rifa de eletrônico, conteúdo íntimo.
- **Casos limítrofes:** o TROQ é uma plataforma de anúncios de itens entre pessoas com liberação controlada de contato. Categorias financeiras e de apostas possuem regulação própria e são vetor conhecido de fraude; conteúdo adulto exigiria controle etário inexistente ([OD-11](../decisions/open-decisions.md)). Nenhuma dessas linhas é afirmada como ilegal por este documento.

#### PI-12 — Conteúdo e conduta do anúncio

- **Definição:** o anúncio em si é proibido quando promove crime ou violência, incita discriminação ou ódio, envolve exploração ou material de abuso sexual, expõe dados pessoais de terceiros, é fraudulento ou enganoso, ou é deliberadamente evasivo para escapar deste catálogo.
- **Fundamento:** `ilegal` nas linhas criminais; `política` nas demais.
- **Exemplos não exaustivos:** anúncio-fachada com descrição genérica e imagem que revela item proibido; código, emoji ou grafia alterada para contornar filtros; anúncio que expõe telefone, endereço ou foto de terceiro; anúncio que promete produto inexistente.
- **Casos limítrofes:** material de abuso sexual infantil, tráfico de pessoas e terrorismo são tratados como **categoria crítica** para efeito de prazo (seção 9) e de sanção (seção 10), e não admitem progressão gradual.

### 3.3 O que o catálogo deliberadamente não faz

- Não enumera produtos existentes. Enumeração envelhece e cria a leitura falsa de que o não enumerado é permitido.
- Não cria subcategorias por marca, modelo ou faixa de preço.
- Não copia catálogo de outra plataforma. Políticas de marketplaces brasileiros foram observadas apenas como referência operacional comparativa e **não** são fonte normativa do TROQ.
- Não cria classificação automática por risco, score ou fila priorizada por algoritmo.

## 4. Casos ambíguos — regra operacional

Esta seção é a regra de decisão para o que o catálogo não resolve diretamente. Ela existe para que o moderador **não** precise interpretar legislação.

**Definição de categoria de alto risco.** Para efeito desta seção, são de alto risco: PI-01, PI-02, PI-03, PI-04, PI-05, PI-06 e as linhas criminais de PI-12.

**Regra.** Diante de um anúncio cuja classificação não seja direta, o moderador aplica, em ordem:

1. **O anúncio pertence claramente a uma categoria do catálogo?** Se sim, decide por ela.
2. **O anúncio é deliberadamente evasivo** — descrição genérica incompatível com a imagem, código, grafia alterada, convite a tratar o produto fora do anúncio? Se sim, decide por PI-12, sem necessidade de identificar a categoria final.
3. **O contexto ou as imagens contradizem a descrição?** Prevalece o conjunto observável, não o texto declarado. As imagens seguem [image-policy.md](image-policy.md) e são parte do anúncio para efeito de avaliação.
4. **Há dúvida material razoável sobre pertencer a uma categoria de alto risco?** Então o anúncio é **removido** e o motivo registra expressamente que a decisão se deu por dúvida material em categoria de alto risco, indicando a categoria suspeitada. O ônus de tornar o anúncio verificável é do anunciante, não da moderação.
5. **Há dúvida em categoria que não é de alto risco?** Então o anúncio é **mantido**, a denúncia é decidida como improcedente e o motivo registra a dúvida. O TROQ não remove por suspeita fraca fora de alto risco.
6. **A legalidade ou a procedência simplesmente não podem ser determinadas** e a categoria é de alto risco? Recai no item 4.

**Vedação expressa.** O moderador **não** deve, para decidir, produzir análise jurídica, consultar assessoria jurídica como etapa do fluxo, nem exigir do anunciante documento, licença, receita ou certificado — isso reintroduziria o fluxo de documentação rejeitado na seção 2. Consultar um registro público, gratuito e de consulta direta, quando existir e for pertinente — por exemplo, um cadastro público de aparelhos com restrição por roubo ou furto —, é permitido como auxílio ao moderador, **não** é etapa obrigatória do fluxo e **não** é condição para decidir.

**Ausência de estado intermediário.** O TROQ **não** cria estado de anúncio "em análise", "suspenso" ou "oculto por moderação". DEC-027 é preservada integralmente: os estados do anúncio continuam sendo `draft`, `published`, `paused`, `closed` e `removed`, e `removed` é terminal. Consequentemente, "manter fora do ar até decisão administrativa" **não** existe como estado próprio: a saída do ar por decisão administrativa é a própria remoção (T7 a T9 de [listing-lifecycle.md](listing-lifecycle.md)), que é definitiva. O remédio para uma remoção equivocada está na seção 11, não em uma restauração de estado.

## 5. Prevenção na publicação (RF-004, RF-020)

Comportamento normativo de alto nível, sem definir arquitetura, algoritmo ou fornecedor:

1. **Declaração de conformidade.** No ato da publicação (T1 de [listing-lifecycle.md](listing-lifecycle.md)), o anunciante deve aceitar expressamente que o item anunciado não pertence a nenhuma categoria deste documento. A aceitação é condição da publicação e é registrada com instante.
2. **Acesso à política.** A política deve estar acessível a partir do fluxo de publicação e do fluxo de denúncia. O texto exibido ao usuário é derivado deste documento e não pode contradizê-lo.
3. **Validações preventivas são permitidas e são auxiliares.** O sistema **pode** aplicar verificações preventivas simples na publicação e na edição — por exemplo, bloqueio ou sinalização de termos inequívocos de categoria crítica. Elas são um auxílio; **não** são a autoridade final de classificação.
4. **Sem moderação automática obrigatória no MVP.** Nenhuma pré-moderação automática por IA é criada aqui. Isso é coerente com DEC-028, que já decidiu não haver pré-moderação automática por IA das imagens nem estado de moderação por imagem.
5. **Falso positivo não é infração.** Uma publicação barrada por validação preventiva **não** constitui decisão de moderação, **não** conta para reincidência (seção 10) e **não** gera advertência, restrição ou bloqueio. Gera, no máximo, registro técnico.
6. **A prevenção não substitui a remoção.** A existência de validação preventiva não reduz a obrigação de remover quando a denúncia for procedente (RB-006).

## 6. Denúncia (RF-018)

| Aspecto | Definição do MVP |
| --- | --- |
| Quem pode denunciar | Qualquer usuário autenticado e com email verificado |
| Autenticação | **Obrigatória.** Não há denúncia anônima no MVP |
| Alvo | Um anúncio identificado, em qualquer estado em que o denunciante possa vê-lo |
| Unicidade | **Uma denúncia por par (denunciante, anúncio).** Uma segunda tentativa do mesmo usuário sobre o mesmo anúncio é aceita de forma idempotente e não cria nova denúncia |
| Motivo | Obrigatório; exatamente uma categoria escolhida em lista fechada derivada da seção 3, mais a opção `outro` |
| Texto complementar | Opcional, campo único de texto livre, limitado a 500 caracteres |
| Estado inicial | `recebida` |
| Confirmação | O denunciante recebe confirmação imediata de que a denúncia foi registrada, sem prometer resultado |
| Confidencialidade | A identidade do denunciante **nunca** é revelada ao anunciante nem exposta publicamente (seções 7.4 e 13) |

Detalhamento normativo:

- **Por que autenticação obrigatória.** Denúncia anônima em um MVP sem controle de abuso transformaria o canal em vetor de ataque contra concorrentes e desafetos, e tornaria impossível aplicar a regra de unicidade. O custo aceito é que parte das denúncias não será feita.
- **Minimização de dados.** A denúncia armazena apenas: anúncio, denunciante, categoria, texto complementar opcional, instante e estado. Nenhum dado adicional do denunciante é coletado para esta finalidade (RNF-008).
- **Antiabuso.** São aplicados: a regra de unicidade acima; limite de volume de denúncias por usuário por janela de tempo, com o número definido na implementação; e a possibilidade de restringir administrativamente o uso do canal por usuário cujas denúncias sejam reiteradamente improcedentes e manifestamente abusivas, com a mesma auditoria da seção 12. Denúncia improcedente, isoladamente, **não** é abuso.
- **Denúncia não altera o anúncio.** Registrar uma denúncia **não** muda o estado do anúncio, **não** o retira da consulta pública e **não** interrompe interesses, solicitações, pagamentos, escolha ou negociação. Isso preserva DEC-027 e a rejeição do estado `under_review`.
- **O anunciante não é notificado da existência da denúncia.** Ele é notificado apenas de uma decisão que o afete, conforme a seção 7.4.
- **Denúncia não é disputa entre usuários.** Divergência sobre a negociação, sobre o item recebido ou sobre avaliação não é objeto deste canal; avaliações seguem [ratings.md](ratings.md) (DEC-030).

## 7. Moderação (RF-019)

### 7.1 Estados da denúncia

Quatro estados. `recebida` é inicial; os três demais são terminais.

| Estado | Significado |
| --- | --- |
| `recebida` | Denúncia registrada e ainda não analisada |
| `procedente` | A análise concluiu que o anúncio viola este documento; o anúncio é removido (seção 8) |
| `improcedente` | A análise concluiu que o anúncio não viola este documento; o anúncio permanece no estado em que estava |
| `sem_acao` | A denúncia não demanda decisão própria: é duplicada de outra já decidida sobre o mesmo anúncio, ou o anúncio já está `removed` por decisão anterior |

Não existe estado "em análise" da denúncia como etapa obrigatória: a análise é a própria transição, e o instante da decisão já é registrado em auditoria. Não há fila priorizada, SLA empresarial, escalonamento, níveis de atendimento nem papéis administrativos além de um único perfil de moderação.

### 7.2 Poderes mínimos do moderador

O moderador pode, e apenas pode:

1. listar e ler denúncias e os anúncios denunciados, incluindo anúncios não públicos;
2. decidir a denúncia como `procedente`, `improcedente` ou `sem_acao`, sempre com motivo registrado;
3. remover o anúncio (T7, T8 ou T9), exclusivamente como efeito de uma decisão `procedente` ou de decisão de ofício;
4. aplicar advertência, restrição temporária ou bloqueio administrativo ao anunciante, conforme a seção 10;
5. decidir contestações, conforme a seção 11;
6. restringir administrativamente o canal de denúncia de um usuário abusivo, conforme a seção 6.

O moderador **não** pode: editar conteúdo de anúncio; alterar nota de avaliação — DEC-030 permite apenas manter ou invalidar integralmente; cancelar pagamento, gerar reembolso ou estorno — RB-004 é definitiva e exceções são [OD-07](../decisions/open-decisions.md); revogar liberação de contato já autorizada — vedado por DEC-027; restaurar anúncio removido — `removed` é terminal; acessar telefone/WhatsApp fora do previsto por DEC-023; alterar o estado da negociação, cujo encerramento é exclusivo das partes por DEC-029.

### 7.3 Decisão de ofício

A moderação **pode** remover um anúncio sem denúncia prévia, quando tomar conhecimento por outra via — inclusive notificação de autoridade competente ou de titular de direito. O registro de auditoria indica a origem do conhecimento; os efeitos e os prazos são os mesmos. Não existe, no MVP, cadastro de notificantes qualificados nem fluxo próprio para eles.

### 7.4 Comunicação da decisão

- **Decisão `procedente`:** o anunciante é informado da remoção, da categoria aplicada e da possibilidade de contestar (seção 11). A comunicação **não** identifica o denunciante e **não** revela se houve denúncia ou decisão de ofício.
- **Decisão `improcedente` ou `sem_acao`:** o anunciante não é comunicado, porque nada o afeta.
- **Denunciante:** recebe, no máximo, a informação de que sua denúncia foi analisada e concluída. Não recebe a categoria aplicada, o motivo, a identidade do anunciante nem detalhes de sanção. O envio dessa comunicação segue RF-021 e nunca contém dado protegido.

## 8. Remoção (RF-020, RB-006)

A remoção é a execução de RB-006 e usa exclusivamente o mecanismo já homologado em [listing-lifecycle.md](listing-lifecycle.md) (DEC-027). Nada aqui redesenha estados ou transições.

### 8.1 Quando remover

Um anúncio é removido quando, e somente quando:

1. uma denúncia é decidida como `procedente`; ou
2. a moderação, de ofício (seção 7.3), conclui que o anúncio viola este documento; ou
3. aplica-se o item 4 da regra de casos ambíguos (seção 4), isto é, dúvida material razoável em categoria de alto risco.

Não remove: nota baixa, discordância entre usuários, negociação malsucedida, denúncia improcedente, denúncia não analisada, suspeita fraca fora de alto risco, ou publicação barrada por validação preventiva.

### 8.2 Efeitos

Os efeitos são exatamente os de T7, T8 e T9 de [listing-lifecycle.md](listing-lifecycle.md), reafirmados aqui sem alteração:

| Dimensão | Efeito |
| --- | --- |
| Exposição pública | Imediata e integral saída de listagem, busca, detalhe, feed e qualquer cache público. O detalhe responde ao público como recurso não disponível, sem revelar existência prévia nem estado interno |
| Reversibilidade | Nenhuma. `removed` é terminal |
| Imagens | Deixam imediatamente de ser servidas pela superfície pública, junto com o restante do conteúdo, conforme [image-policy.md](image-policy.md). Isso **não** implica exclusão física dos objetos; retenção e expurgo definitivo seguem [OD-10](../decisions/open-decisions.md) |
| Dados de auditoria | Preservados. O anúncio, seu conteúdo, o motivo, o moderador e o instante são conservados como base da trilha de auditoria (seção 12) e do direito de contestação (seção 11) |
| Visibilidade ao anunciante | O anúncio permanece visível ao próprio anunciante como histórico |
| Interesses existentes | Preservados como histórico; nenhum novo é aceito |
| Solicitações iniciadas e não pagas | Encerradas sem cobrança; a vaga reservada é liberada |
| Solicitações com pagamento aprovado | **Preservadas. A cobrança permanece definitiva (RB-004).** Este documento **não** cria reembolso, estorno, compensação ou crédito. O tratamento financeiro de exceção permanece em [OD-07](../decisions/open-decisions.md) |
| Limite de RB-003 | Não é reiniciado nem devolvido |
| Escolha e nova liberação de contato | Indisponíveis em anúncio `removed`, conforme a seção 6 de [listing-lifecycle.md](listing-lifecycle.md) |
| Liberação de contato já autorizada | **Não** é revogada. É fato consumado e auditado (RB-001, RF-015) |
| Negociação existente | **Inalterada.** O ciclo da negociação é distinto do ciclo do anúncio (DEC-029). Uma negociação `active` continua `active`; seu encerramento permanece exclusivo das duas partes. Avaliações continuam regidas por [ratings.md](ratings.md) (DEC-030) e não dependem do estado do anúncio |

### 8.3 Remoção antes e depois de solicitações pagas

- **Remoção antes de qualquer solicitação paga:** não há efeito financeiro. Solicitações não pagas em andamento são encerradas sem cobrança e a vaga reservada é liberada.
- **Remoção depois de uma ou mais solicitações pagas:** as solicitações pagas são preservadas e as cobranças permanecem definitivas (RB-004). O anúncio sai do ar e nenhuma nova escolha ou liberação é autorizada. **Nenhuma inferência de reembolso é autorizada por este documento.** Se o produto decidir tratar esse caso financeiramente, será por [OD-07](../decisions/open-decisions.md), em decisão própria.
- **Remoção depois de escolha e liberação já realizadas:** a liberação permanece válida e auditada; a negociação segue seu próprio ciclo.

### 8.4 Recriação do mesmo conteúdo

[listing-lifecycle.md](listing-lifecycle.md) já estabelece que um anúncio `removed` não pode ser recriado com o mesmo conteúdo. Este documento acrescenta o efeito operacional: republicar conteúdo substancialmente equivalente ao de um anúncio removido é, por si, nova violação, tratada como reincidência (seção 10). A única exceção é a prevista na seção 11.2, após contestação revista.

## 9. Prazos de tratamento

Prazos verificáveis, aplicáveis como critério de produto, calibrados para a capacidade operacional real de um MVP operado por equipe pequena. **Não** há compromisso de operação 24x7.

| Classe | Escopo | Prazo de decisão | Contagem |
| --- | --- | --- | --- |
| Crítica | Linhas criminais de PI-12 — material de abuso sexual infantil, tráfico de pessoas, terrorismo — e PI-03 e PI-04 | **24 horas corridas** | A partir do registro da denúncia ou do conhecimento de ofício |
| Comum | Todas as demais categorias | **5 dias úteis** | A partir do registro da denúncia ou do conhecimento de ofício |

Regras de contagem e de verificação:

1. **O prazo é de decisão**, não de primeira resposta. Uma denúncia é tempestiva quando alcança um estado terminal — `procedente`, `improcedente` ou `sem_acao` — dentro do prazo.
2. **A classe é determinada pela categoria informada na denúncia**, para fins de prazo. Se a análise reclassificar o caso, considera-se cumprido o prazo da classe originalmente aplicável, o que evita que uma classificação incorreta do denunciante gere descumprimento artificial.
3. **Dias úteis** consideram o fuso horário oficial de Brasília e excluem sábados, domingos e feriados nacionais.
4. **A classe crítica não pressupõe plantão 24x7.** O prazo de 24 horas corridas é compromisso de decisão dentro da janela, não de atendimento imediato.
5. **Métrica de acompanhamento:** percentual de denúncias decididas dentro do prazo da sua classe, por classe, em janela mensal. A meta inicial é 95% na classe comum e 100% na classe crítica. A métrica é derivada da trilha de auditoria (seção 12) e não exige instrumentação nova.
6. **O descumprimento de prazo não altera a decisão** nem cria remoção automática ou manutenção automática. É indicador operacional, tratado no gate correspondente do [roadmap](../delivery/roadmap.md).
7. **Contestações** seguem o prazo próprio da seção 11.

## 10. Reincidência e casos graves

Progressão simples, proporcional e contada por **decisão `procedente` sobre anúncio do mesmo anunciante**. Decisões `improcedente` e `sem_acao` não contam; publicações barradas por validação preventiva não contam.

| Ocorrência | Medida |
| --- | --- |
| 1ª | **Advertência** registrada, com indicação da categoria e da política |
| 2ª | **Restrição temporária de publicação por 7 dias corridos**, mantida a advertência |
| 3ª ou mais | **Bloqueio administrativo da conta** para publicar novos anúncios |

Regras:

- **Casos graves justificam bloqueio imediato,** sem progressão: linhas criminais de PI-12, PI-04, PI-03 e reincidência em PI-02. A gravidade é registrada no motivo.
- **Efeito da restrição e do bloqueio.** Ambos impedem **publicar novos anúncios** e republicar conteúdo equivalente ao removido. Nenhum deles apaga anúncios existentes, cancela pagamento, gera reembolso, revoga liberação de contato já autorizada, encerra negociação em curso, invalida avaliações nem altera reputação pública — avaliações seguem [ratings.md](ratings.md) (DEC-030) e só podem ser invalidadas pelos motivos lá previstos.
- **Exclusão de conta e de dados** não é sanção deste documento. Permanece em RF-023 e [OD-10](../decisions/open-decisions.md).
- **A contagem não expira no MVP.** Criar prescrição de reincidência exigiria decidir janela, critério e efeito, sem regra vigente que os sustente. Se necessário, será decisão nova e registrada.
- **Advertência, restrição e bloqueio são auditados** (seção 12) e comunicados ao usuário afetado, sem identificar denunciante.
- **O MVP não constrói sistema de trust & safety.** Não há score de risco, reputação interna de moderação, análise de rede de contas nem sanção automática por volume de denúncias.

## 11. Contestação

**Decisão: o MVP terá mecanismo de contestação administrativa.** Sem ele, a remoção seria definitiva, irrecorrível e sem correção de erro — desproporcional, sobretudo porque a seção 4 autoriza remover por dúvida material.

| Aspecto | Definição |
| --- | --- |
| Quem pode contestar | Exclusivamente o anunciante do anúncio removido, ou o usuário alvo de advertência, restrição ou bloqueio |
| Objeto | Uma decisão administrativa específica |
| Prazo para contestar | **7 dias corridos** a partir da comunicação da decisão |
| Quantidade | **Uma contestação por decisão.** A segunda é recusada de forma idempotente |
| Conteúdo | Categoria da discordância e um texto único de até 1000 caracteres. **Não** há anexo de documento, licença, receita ou certificado — isso reintroduziria o fluxo rejeitado na seção 2 |
| Prazo de decisão | **5 dias úteis** a partir do registro da contestação, em qualquer classe |
| Resultados possíveis | `mantida` ou `revista` |
| Auditoria | Obrigatória, com ator, alvo, instante, resultado e motivo (seção 12) |

### 11.1 Efeito de `mantida`

A decisão original permanece integralmente. Nada muda.

### 11.2 Efeito de `revista`

1. A sanção de conta é desfeita: a advertência, a restrição temporária ou o bloqueio é removido e **a ocorrência deixa de contar para a reincidência** (seção 10).
2. **O anúncio removido não é restaurado.** `removed` é terminal em DEC-027 e este documento não altera essa decisão.
3. Em lugar da restauração, a revisão **autoriza expressamente** o anunciante a publicar um **novo** anúncio com o mesmo conteúdo, afastando, apenas para aquele conteúdo, a vedação de recriação da seção 8.4. A autorização é registrada em auditoria.
4. A revisão **não** gera reembolso, crédito, compensação ou indenização, e **não** restaura solicitações encerradas, vagas liberadas ou posições no limite de RB-003. RB-004 permanece integralmente vigente.

### 11.3 Limites

- A contestação **não** suspende a remoção enquanto é analisada. Não existe estado intermediário de anúncio (seção 4).
- **A contestação não produz restauração automática.** O único resultado possível favorável é o da seção 11.2, que depende de decisão administrativa expressa.
- A contestação **não** é disputa entre usuários. Discordância entre anunciante e solicitante sobre a negociação, o item ou a avaliação não é objeto deste canal.
- O denunciante **não** participa da contestação, **não** é informado dela e **não** é identificado nela.
- A contestação não alcança decisões de outra natureza, como validações preventivas, invalidação de avaliação (DEC-030) ou exceções de pagamento ([OD-07](../decisions/open-decisions.md)).

## 12. Auditoria

Alinhado a RF-022, que já exige trilha imutável para operações críticas, e a RNF-011. Este documento **estende** RF-022 aos eventos administrativos abaixo e **não** define prazo de retenção — retenção e expurgo permanecem em [OD-10](../decisions/open-decisions.md).

Eventos que geram registro de auditoria:

| Evento | Observação |
| --- | --- |
| Registro de denúncia | Inclui a categoria informada |
| Decisão de denúncia | `procedente`, `improcedente` ou `sem_acao` |
| Remoção administrativa de anúncio | Já exigida por DEC-027 (T7 a T9) |
| Remoção de ofício | Registra a origem do conhecimento |
| Advertência, restrição temporária e bloqueio administrativo | Inclui o prazo, quando houver |
| Restrição administrativa do canal de denúncia | Seção 6 |
| Registro e decisão de contestação | Inclui a autorização de republicação, quando `revista` |
| Aceitação da declaração de conformidade na publicação | Seção 5, item 1 |

Campos mínimos de cada registro:

1. **ator** — usuário ou moderador que praticou o ato, ou indicação de origem externa no caso de ofício;
2. **alvo** — anúncio, denúncia, contestação ou conta afetada;
3. **instante**;
4. **ação**;
5. **motivo/categoria** — categoria do catálogo aplicada e, quando a decisão se der por dúvida material (seção 4, item 4), essa circunstância de forma expressa;
6. **resultado**.

Restrições:

- O registro **nunca** contém telefone/WhatsApp em texto claro, conforme DEC-023.
- O registro é imutável e não editável (RNF-011).
- A trilha é a fonte das métricas de prazo da seção 9.

## 13. Privacidade

Definido aqui apenas o necessário para OD-03. Retenção, exclusão e anonimização permanecem em [OD-10](../decisions/open-decisions.md).

1. **Identidade do denunciante.** Não é pública, não é revelada ao anunciante, não aparece em nenhuma comunicação ao anunciante, não aparece em payload público nem em cache público, e não é exposta no fluxo de contestação. É acessível apenas à moderação, para analisar a denúncia e aplicar as regras antiabuso da seção 6.
2. **Dados administrativos de moderação** — denúncias, categorias, motivos, decisões, sanções, contestações e trilha de auditoria — **não** integram nenhum payload público e não são expostos a outros usuários.
3. **Privilégio mínimo.** O acesso administrativo é restrito ao perfil de moderação e limitado ao necessário para as decisões deste documento. O perfil de moderação **não** recebe, por ser moderação, acesso a telefone/WhatsApp; DEC-023 continua governando esse dado.
4. **Minimização.** A denúncia e a contestação coletam apenas os campos previstos nas seções 6 e 11 (RNF-008).
5. **Cooperação com autoridades.** O TROQ preserva a trilha de auditoria e o conteúdo removido para permitir resposta a requisição de autoridade competente. Este documento **não** define procedimento de atendimento a requisições, prazo, autoridade legitimada nem canal formal: isso depende de retenção ([OD-10](../decisions/open-decisions.md)) e de termos de uso e política de privacidade completos, que estão fora deste escopo.

## 14. Limites explícitos desta política

Esta política **não** resolve e **não** antecipa:

| Fora de escopo | Onde permanece |
| --- | --- |
| Desistência do escolhido e reseleção | [OD-06](../decisions/open-decisions.md) |
| Chargebacks, duplicidade, reembolso, estorno e demais exceções de pagamento, incluindo o tratamento financeiro das solicitações pagas de anúncio removido | [OD-07](../decisions/open-decisions.md) |
| Escolha e validação do gateway para R$ 0,99 | [OD-08](../decisions/open-decisions.md) |
| Prazos de retenção, exclusão de conta, anonimização e expurgo de imagens e trilhas | [OD-10](../decisions/open-decisions.md) |
| Elegibilidade etária formal, idade mínima e verificação de idade | [OD-11](../decisions/open-decisions.md) |
| Natureza da demonstração de interesse | [OD-12](../decisions/open-decisions.md) |

Também **não** definidos aqui: schema de banco, API, interface, painel administrativo, autenticação, moderação automática, fornecedor de IA, termos de uso completos, política de privacidade completa e parecer jurídico. A implementação pertence à Fase 4 do [roadmap](../delivery/roadmap.md).

## 15. Rastreabilidade

| Referência | Relação com este documento |
| --- | --- |
| OD-03 | **Fechada** por este documento |
| DEC-031 | Registro da decisão em [../decisions/decision-log.md](../decisions/decision-log.md) |
| RB-001 | Preservada. A remoção não revoga liberação já autorizada e impede nova liberação (seção 8.2). O perfil de moderação não ganha acesso ao contato (seção 13) |
| RB-002 | Preservada. Nada aqui altera a pré-condição de avaliação |
| RB-003 | Preservada. O limite é do anúncio e não é reiniciado nem devolvido por remoção ou sanção |
| RB-004 | **Preservada literalmente.** Nenhuma remoção, sanção ou contestação gera reembolso, estorno ou compensação. Exceções seguem OD-07 |
| RB-005 | Inalterada |
| RB-006 | **Fonte normativa desta política.** O catálogo (seção 3), os critérios (seção 4) e a remoção (seção 8) executam a regra |
| RF-004 | Declaração de conformidade na publicação e validações preventivas auxiliares (seção 5) |
| RF-006 | Imagens integram a avaliação do anúncio (seção 4, item 3) e seguem [image-policy.md](image-policy.md) na remoção |
| RF-018 | Fluxo de denúncia definido na seção 6 |
| RF-019 | Fluxo e poderes de moderação definidos na seção 7; prazos na seção 9; reincidência na seção 10; contestação na seção 11 |
| RF-020 | Critérios e efeitos de remoção definidos na seção 8, sobre T7 a T9 de [listing-lifecycle.md](listing-lifecycle.md) |
| RF-021 | Comunicações de decisão seguem o email transacional e nunca contêm dado protegido (seção 7.4) |
| RF-022 | **Estendido** aos eventos administrativos da seção 12. Retenção segue OD-10 |
| RNF-007, RNF-008, RNF-011, RNF-014 | Autorização server-side, minimização, trilha imutável e validação das entradas de denúncia e contestação |
| DEC-027 | **Preservada integralmente.** Nenhum estado novo de anúncio; `removed` terminal; remoção por T7 a T9 |
| DEC-028 | **Preservada integralmente.** Sem pré-moderação automática por IA e sem estado de moderação por imagem |
| DEC-029 | **Preservada integralmente.** A remoção não altera a negociação; o encerramento segue exclusivo das partes |
| DEC-030 | **Preservada integralmente.** A moderação de avaliação continua limitada a manter ou invalidar integralmente |
| R-05 | **Mitigado.** O catálogo, o fluxo e os prazos existiam como lacuna; passam a existir como política verificável |
| OD-06, OD-07, OD-08, OD-10, OD-11, OD-12 | Permanecem abertas. Nada aqui as fecha ou antecipa |

## 16. Fontes externas consultadas

Fontes oficiais brasileiras consultadas em **2026-09-12**. Foram usadas para fundamentar a classificação `ilegal` e `regulado` da seção 3 e para calibrar o desenho do fluxo. Políticas de marketplaces privados **não** foram usadas como fonte normativa.

| Fonte | Órgão | URL | Uso nesta política |
| --- | --- | --- | --- |
| Legislação e normativos de armas de fogo (Lei 10.826/2003; Decretos 9.847/2019, 10.030/2019, 11.615/2023 e 12.345/2024; portarias de calibres e munições) | Polícia Federal | https://www.gov.br/pf/pt-br/assuntos/armas/normativos/legislacao | Fundamenta PI-03: comercialização e transferência dependem de autorização, registro e calibre correspondente; produtos controlados têm regime próprio |
| Regulamento de Produtos Controlados (Decreto 10.030/2019, sucessor do R-105) | Ministério da Defesa / Exército — DFPC | https://www.gov.br/defesa/pt-br/arquivos/File/legislacao/emcfa/2020/seprod/dec.10030.pdf | Fundamenta PI-03 e PI-09: explosivos, munições e correlatos são produtos controlados, com restrições até no ponto de venda autorizado |
| Lei 11.343/2006, art. 33 (texto legal) | Câmara dos Deputados | https://www2.camara.leg.br/legin/fed/lei/2006/lei-11343-23-agosto-2006-545399-publicacaooriginal-57861-pl.html | Fundamenta PI-04: **oferecer e expor à venda** droga sem autorização é conduta típica, ainda que a título gratuito — decisivo para uma plataforma de anúncios |
| Autorização de Funcionamento (AFE) e regras de farmácias e drogarias, incluindo venda por meios remotos | Anvisa | https://www.gov.br/anvisa/pt-br/setorregulado/regularizacao/farmacias-e-drogarias/autorizacao-de-funcionamento-afe-ou-autorizacao-especial-ae/perguntas-frequentes/informacoes-gerais-sobre-autorizacao-de-funcionamento-afe | Fundamenta PI-05: a dispensação a distância é reservada a farmácia ou drogaria licenciada com farmacêutico; pessoa física nunca satisfaz a condição |
| RDC 855/2024 — proíbe fabricação, importação, comercialização, distribuição, armazenamento, transporte e propaganda de dispositivos eletrônicos para fumar | Anvisa | https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2024/anvisa-atualiza-regulacao-de-cigarro-eletronico-e-mantem-proibicao | Fundamenta a classificação `ilegal` dos dispositivos eletrônicos para fumar em PI-06 |
| Cigarro eletrônico — página temática e histórico regulatório (RDC 46/2009 e AIR) | Anvisa | https://www.gov.br/anvisa/pt-br/assuntos/tabaco/cigarro-eletronico | Confirma que a proibição é contínua desde 2009 e alcança qualquer modalidade de importação |
| Estatuto da Criança e do Adolescente, art. 81 (legislação citada) | Senado Federal | https://legis.senado.leg.br/sdleg-getter/documento?dm=4741204 | Fundamenta PI-07: é vedada a venda a menores de armas, munições, explosivos, bebidas alcoólicas, produtos que causem dependência, fogos e bilhetes de loteria — base do bloqueio por ausência de verificação de idade |
| Autorização de empreendimentos utilizadores de fauna silvestre | Ibama | https://www.gov.br/ibama/pt-br/assuntos/biodiversidade/fauna-silvestre/empreendimentos-utilizadores-de-fauna-silvestre | Fundamenta PI-08: o comércio lícito exige empreendimento licenciado, marcação individual e documentação de origem |
| Operação contra o tráfico de animais silvestres vendidos na internet (2025) | Ibama | https://www.gov.br/ibama/pt-br/assuntos/noticias/2025/ibama-participa-de-operacao-contra-o-trafico-de-animais-silvestres-vendidos-na-internet-em-pe | Confirma que a venda on-line é vetor conhecido de tráfico de fauna, sustentando o tratamento conservador de PI-08 |
| Combate ao contrabando e descaminho; apreensão de mercadoria estrangeira sem comprovação de importação regular | Receita Federal | https://www.gov.br/receitafederal/pt-br/assuntos/noticias/contrabando | Fundamenta PI-02: adquirir, receber ou ocultar mercadoria estrangeira sem documentação legal em atividade comercial é conduta típica |
| Combate à pirataria; Plano Nacional e mesa de diálogo com plataformas de comércio eletrônico | Ministério da Justiça e Segurança Pública — Senacon/CNCP | https://www.gov.br/mj/pt-br/assuntos/sua-protecao/combate-a-pirataria | Fundamenta PI-10 e confirma a expectativa regulatória de cooperação de plataformas digitais |
| Diretório Nacional de Combate à Falsificação de Marcas CNCP–INPI | INPI | https://www.gov.br/inpi/pt-br/projetos-estrategicos/combate-a-falsificacao-de-marcas | Confirma a existência de canal institucional para falsificação de marcas; não cria obrigação assumida por este MVP |
| Celular Legal — o que fazer em caso de roubo, furto ou extravio; cadastro de aparelhos com restrição | Anatel | https://www.gov.br/anatel/pt-br/assuntos/celular-legal/o-que-fazer | Fundamenta o indício de PI-02 e o auxílio **opcional** ao moderador previsto na seção 4 |
| Regulamentação do Marco Civil da Internet — Decretos 12.975/2026 e 12.976/2026 | ANPD | https://www.gov.br/anpd/pt-br/assuntos/marco-civil-da-internet | Calibrou o desenho do fluxo: canal permanente de denúncia, análise após notificação, comunicação motivada ao autor do conteúdo e ao denunciante, possibilidade de contestação e responsabilização por **falha sistêmica**, não por decisão isolada |
| Decretos que atualizam regras do Marco Civil da Internet, de 20/05/2026 | Casa Civil | https://www.gov.br/casacivil/pt-br/assuntos/noticias/2026/maio/governo-do-brasil-publica-decretos-que-atualizam-regras-do-marco-civil-da-internet-e-reforca-protecao-as-mulheres-no-ambiente-digital | Confirma a vigência e a data dos decretos citados |
| Tese do Tema 987 — art. 19 do Marco Civil parcialmente inconstitucional; remoção após notificação extrajudicial para ilícitos graves | Supremo Tribunal Federal | https://noticias.stf.jus.br/postsnoticias/stf-define-parametros-para-responsabilizacao-de-plataformas-por-conteudos-de-terceiros/ | Justifica a existência de canal de denúncia efetivo, a decisão de ofício (seção 7.3) e a classe crítica de 24 horas da seção 9 |

### 16.1 Limitações da análise

Registradas de forma explícita, para que nenhuma afirmação deste documento seja lida como conclusão jurídica definitiva:

1. **A aplicabilidade dos decretos de 2026 ao TROQ não é inequívoca.** Os Decretos 12.975/2026 e 12.976/2026 alcançam provedores de aplicações que intermedeiam conteúdo de terceiros e preveem critérios diferenciados por porte econômico e nível de risco, ainda a serem detalhados pela ANPD. Não está determinado se, e em que medida, um marketplace C2C de pequeno porte como o TROQ será alcançado, nem quais prazos e obrigações específicas lhe serão aplicáveis. O fluxo desta política foi desenhado de forma compatível com esse conjunto de obrigações, **sem** afirmar que elas já incidem sobre o TROQ.
2. **A tese do STF sobre o art. 19 do Marco Civil** trata de responsabilidade civil por conteúdo de terceiros em hipóteses de ilícitos graves. Sua extensão exata a anúncios de itens proibidos em marketplace não está delimitada por este documento.
3. **A classificação `ilegal` da seção 3 é de categoria, não de item.** Ela afirma que a categoria abrange condutas vedadas por legislação, com fonte registrada. Não afirma que todo item concebível dentro da categoria seja ilegal em toda circunstância.
4. **A classificação `regulado` não afirma ilegalidade.** Afirma que a licitude depende de condições que o TROQ não verifica. A proibição correspondente é decisão de produto (seção 2).
5. **Legislação estadual e municipal não foi levantada.** Podem existir exigências locais adicionais, especialmente quanto a animais, bebidas e comércio, não refletidas neste documento.
6. **Fontes de texto legal.** O portal do Planalto esteve inacessível na data da consulta; os dispositivos legais foram confirmados por fontes oficiais alternativas — Câmara dos Deputados, Senado Federal, Polícia Federal, Ministério da Defesa e as próprias agências reguladoras. A verificação final da redação vigente de cada dispositivo continua recomendada antes da redação de termos de uso.
7. **Este documento não substitui assessoria jurídica** antes da abertura da plataforma ao público, especialmente para termos de uso, política de privacidade e procedimento de atendimento a requisições de autoridade.
