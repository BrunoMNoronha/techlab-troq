# Proposta de troca — TROQS

Documento normativo da regra de troca **proposta de troca** (`trade_proposal`). Registra **DEC-054** em [../decisions/decision-log.md](../decisions/decision-log.md), com as decisões do Bruno de 2026-10-05 reunidas em [#185](https://github.com/BrunoMNoronha/techlab-troq/issues/185). Produzido por **PT-00** ([#186](https://github.com/BrunoMNoronha/techlab-troq/issues/186)).

Fontes: [business-rules.md](business-rules.md) (RB-001 a RB-010), [listing-lifecycle.md](listing-lifecycle.md) (DEC-027), [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029), [ratings.md](ratings.md) (DEC-030), [payment-exceptions.md](payment-exceptions.md) (DEC-037), [advertiser-contact.md](advertiser-contact.md) (DEC-040), [../adr/0009-trade-rules-environment-selector.md](../adr/0009-trade-rules-environment-selector.md) (DEC-053). O desenho técnico está em [../architecture/trade-proposal-design.md](../architecture/trade-proposal-design.md).

## 1. Escopo e leitura

**TP-1.1.** O TROQS tem duas regras de troca cadastradas (DEC-053). Este documento rege a **proposta de troca**. A outra, a **solicitação paga** (`paid_request`), continua regida por RB-001, RB-003, RB-004 e pelas políticas que as detalham, e **nada aqui a altera**.

**TP-1.2.** A regra dos fluxos novos de cada ambiente é escolhida pela variável `TRADE_RULE` (ADR-0009). Este documento só produz efeito num ambiente cuja variável seja `trade_proposal` e depois de implementado ([../delivery/trade-proposal-plan.md](../delivery/trade-proposal-plan.md)). Até lá ele é contrato, não comportamento.

**TP-1.3.** Cada item traz a sua origem entre parênteses:

| Marca | Significado |
| --- | --- |
| `R-n` | Item `n` do texto-base da regra, abaixo |
| `D-n` | Decisão `n` do Bruno em #185, seção "Decisões do Bruno em 2026-10-05" |
| `derivada de …` | Consequência de uma decisão já vigente, citada. Não é decisão nova do Bruno e está listada na seção 15 para homologação |

Nenhum item deste documento tem outra origem. O que não foi decidido nem decorre de decisão vigente está na seção 16, como pendência, e **não** deve ser inferido.

**TP-1.4 (texto-base).** A regra nasceu deste texto, que o Bruno trouxe do brainstorming de produto de 2026-10-05, a "Regra v2":

1. Só propõe quem tem anúncio publicado; a proposta é item por item, grátis e sem texto.
2. Cada anúncio tem até três propostas abertas; recusar ou expirar libera a vaga.
3. No aceite, o proponente paga e o contato é liberado para os dois.
4. Os dois anúncios saem da vitrine durante a negociação.
5. "Trocamos" encerra os dois e abre a avaliação; "não deu certo" devolve os dois à vitrine.
6. A volta fica por fora, depois do contato.

As decisões `D-n` detalham o texto-base e prevalecem onde divergem dele. É o caso do item 5: D-17 decidiu que cada parte fecha o seu anúncio, e D-18 que a avaliação vale nos dois desfechos.

## 2. Definições

| Termo | Significado |
| --- | --- |
| Anúncio alvo | O anúncio que alguém quer receber na troca |
| Anúncio oferecido | O anúncio próprio que o proponente oferece em troca do alvo |
| Proponente | Quem envia a proposta; é o dono do anúncio oferecido |
| Anunciante | O dono do anúncio alvo; é quem aceita ou recusa |
| Proposta | O pedido "meu anúncio oferecido pelo seu anúncio alvo" |
| Proposta aberta | Proposta `pending` ou `accepted`; é a que ocupa vaga |
| Aceite | O ato do anunciante de aceitar uma proposta pendente. Abre o prazo de pagamento |
| Feed | As superfícies de descoberta: listagem, busca e vitrine. O detalhe por link direto não é feed |
| Compromisso | A condição do anúncio que está num aceite ainda não encerrado ou numa negociação desta regra ainda não resolvida para ele. Não é estado do anúncio (seção 8) |
| Declaração | O que cada parte informa ao fim da negociação: "Trocamos" ou "Não deu certo" |

## 3. Quem pode propor (RB-007)

**TP-3.1 (D-5).** Só propõe quem tem anúncio publicado. A proposta oferece **exatamente um** anúncio próprio por **exatamente um** anúncio alvo, de outra pessoa.

**TP-3.2 (R-1).** A proposta é **gratuita** e não tem texto livre, imagem, valor nem qualquer conteúdo escrito por quem propõe. Ela é só o par de anúncios.

**TP-3.3 (derivada de DEC-027, DEC-034 e RF-002).** Propor exige, no servidor e no instante da ação:

- sessão válida, e-mail verificado e conta `active`;
- anúncio alvo `published`, de outra pessoa, com dono de conta `active` e sem compromisso;
- anúncio oferecido `published`, do próprio proponente e sem compromisso.

**TP-3.4 (derivada de DEC-040).** Ninguém paga por um contato que não existe. O proponente precisa ter contato cadastrado para propor, o anunciante precisa ter contato cadastrado para aceitar, e as duas condições são conferidas de novo antes de a cobrança ser criada. A verificação só olha se o contato existe: nunca lê nem expõe o número. Quando o impedimento é da outra parte, a mensagem é neutra, como em AC-4.

**TP-3.5 (D-9).** Antes do pagamento, o anunciante vê só o **anúncio oferecido** e a **reputação pública** de quem propõe. O nome de exibição do proponente não aparece: ele não passa pelo filtro de DEC-049 e pode carregar contato. O nome aparece depois do pagamento, junto com o contato.

**TP-3.6 (D-20).** O anúncio não ganha faixa de valor nem valor estimado por causa desta regra. [../architecture/listing-contract.md](../architecture/listing-contract.md) continua sem esses campos.

**TP-3.7 (D-5).** A "volta" em dinheiro fica fora do produto. As partes a combinam depois do contato, e o TROQS não a registra, não a sugere e não a intermedeia.

## 4. Limites (RB-008)

**TP-4.1 (D-6).** Cada anúncio recebe **no máximo 3** propostas abertas.

**TP-4.2 (D-6).** Cada anúncio pode ser oferecido em **no máximo 3** propostas abertas.

**TP-4.3 (D-6).** Não há teto por conta. Quem tem mais anúncios pode enviar e receber mais propostas.

**TP-4.4 (D-22).** Cada conta tem **no máximo uma** proposta aberta em cada anúncio alvo. Para oferecer outro item ao mesmo alvo, a pessoa retira a proposta e faz outra.

**TP-4.5 (D-14, D-24).** A conta que foi aceita num anúncio e **não pagou no prazo**, ou que **desistiu depois do aceite**, não pode propor de novo àquele anúncio. O bloqueio vale para aquele par de conta e anúncio alvo, e só para ele.

**TP-4.6 (R-2, D-7, D-13, D-23).** A vaga é devolvida quando a proposta deixa de estar aberta sem pagamento: recusa, retirada, expiração, revogação do aceite, desistência, prazo de pagamento vencido ou cancelamento.

**TP-4.7 (derivada de DEC-038).** Os limites de TP-4.1, TP-4.2 e TP-4.4 e o bloqueio de TP-4.5 são garantidos por restrição de banco, não só por verificação da aplicação.

## 5. Ciclo da proposta

| Estado | Nome | Significado | Aberta? | Terminal |
| --- | --- | --- | --- | --- |
| `pending` | pendente | Aguardando resposta do anunciante | sim | não |
| `accepted` | aceita | Aceita, aguardando o pagamento do proponente | sim | não |
| `paid` | paga | Pagamento aprovado no prazo; a negociação existe | não | sim |
| `declined` | recusada | Recusada pelo anunciante, inclusive por revogação do aceite | não | sim |
| `withdrawn` | retirada | Retirada pelo proponente, antes ou depois do aceite | não | sim |
| `expired` | expirada | Passou a validade sem resposta | não | sim |
| `payment_expired` | não paga | Aceita e não paga no prazo | não | sim |
| `cancelled` | cancelada | Caiu porque outra proposta com um dos dois anúncios foi paga, ou porque um dos anúncios deixou de poder trocar | não | sim |

| De | Para | Quem aciona | Origem |
| --- | --- | --- | --- |
| — | `pending` | Proponente, ao propor | R-1, D-5 |
| `pending` | `accepted` | Anunciante | R-3 |
| `pending` | `declined` | Anunciante | R-2 |
| `pending` | `withdrawn` | Proponente | D-13 |
| `pending` | `expired` | Decurso da validade | D-7 |
| `pending` | `cancelled` | Pagamento de outra proposta com um dos dois anúncios; encerramento ou remoção de um dos anúncios | D-8; derivada de DEC-027 |
| `accepted` | `paid` | Pagamento aprovado dentro do prazo | D-11, D-12 |
| `accepted` | `declined` | Anunciante, ao revogar o aceite | D-13, D-23 |
| `accepted` | `withdrawn` | Proponente, ao desistir | D-13 |
| `accepted` | `payment_expired` | Decurso do prazo de pagamento | D-12 |
| `accepted` | `cancelled` | Encerramento ou remoção de um dos anúncios | derivada de DEC-027 |

Qualquer par ausente da tabela é proibido. Nenhum estado terminal tem saída, e `paid` é fato histórico.

**TP-5.1 (D-7).** A proposta sem resposta vale **7 dias corridos**, contados da criação.

**TP-5.2 (derivada de D-7, D-10 e PE-4.7).** A validade é um instante fixado na criação. Ela **não** é prorrogada, suspensa nem reiniciada por pausa, por congelamento ou por qualquer outro evento.

**TP-5.3 (derivada de DEC-038, AR-15.3).** Validade e prazo de pagamento vencidos valem a partir do instante em que vencem, e não do instante em que um trabalho periódico os grava. Nenhuma regra desta seção depende de um trabalho periódico disparar.

**TP-5.4 (derivada de DEC-027, seção 4, e DEC-029, seção 8).** Recusar, retirar, aceitar, revogar e desistir são sempre atos explícitos de uma pessoa, autorizados no servidor. Além da validade e do prazo de pagamento, nada muda o estado de uma proposta sozinho.

## 6. Aceite, revogação e desistência

**TP-6.1 (R-2, R-3).** O anunciante aceita ou recusa cada proposta pendente do seu anúncio. Só o dono do anúncio alvo pode fazê-lo.

**TP-6.2 (derivada de D-8 e D-16).** Cada anúncio tem **no máximo um** compromisso por vez. Por isso só é possível aceitar uma proposta cujos dois anúncios estejam sem compromisso: não há dois aceites vivos, nem aceite com negociação ativa, envolvendo o mesmo anúncio.

**TP-6.3 (D-8).** O mesmo anúncio pode estar em várias propostas abertas. Quando uma é aceita:

- as outras propostas pendentes que envolvem qualquer um dos dois anúncios ficam **congeladas**: continuam abertas, ocupam vaga e não podem ser aceitas enquanto o aceite durar;
- se o aceite terminar **sem pagamento**, elas voltam a valer, com a validade que tinham;
- se o pagamento for **aprovado**, elas são canceladas.

**TP-6.4 (R-4, D-16).** No aceite, os dois anúncios saem do feed (seção 8).

**TP-6.5 (D-13).** O proponente pode retirar a proposta pendente e pode desistir depois do aceite, antes de pagar.

**TP-6.6 (D-13, D-23).** O anunciante pode revogar o aceite antes do pagamento. Revogar encerra a proposta como **recusada**. Quem teve o aceite revogado não fez nada de errado e pode propor de novo, dentro dos limites da seção 4.

**TP-6.7 (D-14, D-24).** Aceite não pago no prazo e desistência depois do aceite produzem o bloqueio de TP-4.5. Retirar uma proposta ainda pendente não produz bloqueio.

**TP-6.8 (derivada de D-8, D-16 e D-23).** Todo fim de aceite sem pagamento — revogação, desistência, prazo vencido ou cancelamento — devolve a vaga, devolve os dois anúncios ao feed e descongela as outras propostas.

## 7. Pagamento (RB-009)

**TP-7.1 (D-11).** Só o proponente paga, e só depois do aceite.

**TP-7.2 (D-11).** O preço candidato é **R$ 2,99**. Ele vale para o spike no sandbox (PT-01) e para o primeiro teste; o preço final está aberto em [OD-17](../decisions/open-decisions.md).

**TP-7.3 (D-12).** O aceito tem **24 horas**, contadas do aceite, para pagar. O prazo não é prorrogado, nem por indisponibilidade do provedor (derivada de PE-4.7).

**TP-7.4 (D-15).** A cobrança é **definitiva**. Pagou no prazo, recebeu o contato: o valor não volta se a negociação terminar em "Não deu certo", se uma das partes sumir ou se a troca não acontecer.

**TP-7.5 (derivada de DEC-037).** A fonte de verdade do pagamento, a idempotência, a reconciliação e o tratamento de estado incerto são os de [payment-exceptions.md](payment-exceptions.md), sem mudança: a notificação é gatilho, o estado autoritativo é o do provedor, e estado incerto nunca concede direito. O instante decisivo é o de **acreditação** (PE-4.1): pagamento acreditado dentro do prazo vale mesmo que o TROQS só saiba dele depois (PE-4.2).

**TP-7.6 (derivada de D-12, D-13, D-15 e de PE-7.2 e PE-12.2).** O reembolso é só técnico e sempre integral. As hipóteses desta regra são, exaustivamente, as mesmas quatro de PE-7.2, lidas com "aceite" no lugar de "reserva":

| Hipótese | Nesta regra |
| --- | --- |
| RT-1 | Pagamento excedente em duplicidade técnica |
| RT-2 | Pagamento acreditado depois do fim do prazo de pagamento |
| RT-3 | Pagamento acreditado sem aceite vigente: aceite revogado, desistência ou proposta cancelada antes da acreditação |
| RT-4 | Cobrança criada por defeito técnico do TROQS |

Nenhuma outra situação gera reembolso. Em especial, não geram: "Não deu certo", declaração divergente, encerramento ou remoção de anúncio depois do pagamento, bloqueio de conta, insatisfação e arrependimento.

**TP-7.7 (derivada de PE-7.4 e PD-8.3).** Cobrança ainda não paga de um aceite que terminou é **cancelada**, não reembolsada.

**TP-7.8 (derivada de ADR-0009, decisão 9).** O valor cobrado é o que valia quando a proposta foi criada. Ele é mostrado antes de propor e fica gravado no fluxo: mudar o preço da regra não alcança propostas já criadas.

## 8. Feed, pausa e edição

**TP-8.1 (D-16).** Do aceite em diante, os dois anúncios ficam **fora do feed**. O link direto continua abrindo o detalhe, com o aviso de que o anúncio está em negociação.

**TP-8.2 (derivada de D-16 e DEC-027).** Estar fora do feed **não** é estado do anúncio. O anúncio continua `published`, a máquina de estados de [listing-lifecycle.md](listing-lifecycle.md) não muda e o estado `negotiating` continua rejeitado. O que muda é o compromisso (seção 2), que tira o anúncio das superfícies de descoberta e o impede de entrar em fluxo novo: ele não recebe proposta nova e não pode ser oferecido.

**TP-8.3 (D-16, D-17, D-23).** O anúncio volta ao feed quando o compromisso termina sem troca: fim do aceite sem pagamento (TP-6.8), "Não deu certo" ou a resposta de que não trocou (seção 10).

**TP-8.4 (D-10).** Pausar um anúncio **não derruba** as suas propostas. As pendentes ficam congeladas — não podem ser aceitas enquanto ele estiver pausado — e a validade continua correndo.

**TP-8.5 (derivada de D-8, D-10, D-12 e D-14).** "Congelada" significa "não pode ser aceita" (TP-6.3). Por isso a pausa não interrompe um aceite já dado: o proponente continua podendo pagar dentro do prazo. Impedir o pagamento faria o proponente perder o prazo por um ato da outra parte e sofrer o bloqueio de TP-4.5, que D-14 reserva a quem não pagou.

**TP-8.6 (D-10).** Editar um anúncio é livre enquanto as suas propostas estão pendentes. A edição fica **bloqueada** nos dois anúncios do aceite até o compromisso de cada um terminar.

**TP-8.7 (derivada de DEC-027).** Encerrar o próprio anúncio (T5, T6) continua sempre permitido. O anúncio encerrado deixa de poder trocar: as suas propostas abertas são canceladas, e se havia aceite vivo ele termina sem pagamento (TP-6.8), sem bloqueio para ninguém. Uma negociação já ativa não é tocada pelo encerramento do anúncio (DEC-029, seção 9.1).

**TP-8.8 (derivada de DEC-027 e DEC-031).** Remoção administrativa, sanção e exclusão de conta seguem o mesmo princípio de DEC-027, seção 5: nada do que já ocorreu é desfeito, e o anúncio deixa de admitir coisas novas. O detalhe de cada efeito é de PT-10.

## 9. Contato (RB-010)

**TP-9.1 (R-3).** Com o pagamento aprovado dentro do prazo, o contato é liberado **para os dois**: o proponente recebe o contato do anunciante, e o anunciante recebe o contato do proponente.

**TP-9.2 (derivada de DEC-023 e de [../architecture/contact-release.md](../architecture/contact-release.md)).** Cada uma das duas liberações tem todas as proteções da liberação de RB-001: autorização no servidor, auditoria da autorização e de cada acesso, entrega só ao destinatário autenticado, nenhuma superfície pública, nenhum envio por e-mail e nenhuma revogação depois de concedida.

**TP-9.3 (D-9).** O nome de exibição do proponente passa a ser visível ao anunciante só depois do pagamento.

## 10. Negociação e desfecho

**TP-10.1 (derivada de DEC-029).** A negociação nasce `active` no mesmo ato em que o pagamento é confirmado e as duas liberações são autorizadas. As partes são o anunciante e o proponente, e ela está ligada aos dois anúncios. Os estados continuam sendo só `active` e `closed`.

**TP-10.2 (D-17).** Cada parte pode declarar **"Trocamos"** ou **"Não deu certo"**. A **primeira** declaração encerra a negociação. O encerramento continua unilateral, imediato e irreversível, como em DEC-029: não exige aceite da outra parte.

**TP-10.3 (D-17).** Cada parte fecha o seu:

| Primeira declaração | Negociação | Anúncio de quem declarou | Anúncio da outra parte |
| --- | --- | --- | --- |
| "Não deu certo" | `closed` | Volta ao feed | Volta ao feed |
| "Trocamos" | `closed` | Encerrado (T5 ou T6) | Continua fora do feed até a outra parte responder |

Depois de um "Trocamos", a outra parte responde quando quiser:

| Resposta | Efeito sobre o anúncio de quem responde |
| --- | --- |
| "Trocamos" | Encerrado (T5 ou T6) |
| "Não troquei" | Volta ao feed |

**TP-10.4 (derivada de DEC-029, seção 8).** Não há prazo, encerramento automático nem trabalho periódico para a resposta. O anúncio de quem ainda não respondeu fica fora do feed até a própria pessoa responder, e ela continua podendo pausar ou encerrar o seu anúncio pelas transições normais.

**TP-10.5 (derivada de DEC-027 e DEC-029, seção 7).** As declarações são irreversíveis. "Trocamos" encerra o próprio anúncio de forma definitiva e por isso exige confirmação explícita de quem declara.

**TP-10.6 (derivada de DEC-029, seção 9.3).** A declaração é um fato registrado por parte. Ela não cria estado novo de negociação, não atribui culpa e não é julgada: se uma parte diz "Trocamos" e a outra diz "Não troquei", as duas declarações ficam registradas como estão.

**TP-10.7 (D-15).** Nenhum desfecho gera reembolso, crédito ou compensação.

**TP-10.8 (derivada de DEC-032).** Não existe reseleção nesta regra. Depois de "Não deu certo", os anúncios voltam ao feed e qualquer nova proposta é um fluxo novo, com cobrança nova se for aceita e paga.

## 11. Avaliação

**TP-11.1 (D-18).** As partes podem se avaliar depois que a negociação está `closed`, nos dois desfechos. RB-002 e [ratings.md](ratings.md) (DEC-030) valem integralmente, lendo "anunciante" como o dono do anúncio alvo e "solicitante escolhido" como o proponente: nota de 1 a 5, janela de 14 dias contada do encerramento, publicação cega e reputação calculada.

## 12. Convivência com a solicitação paga

**TP-12.1 (D-4).** Depois que um ambiente troca de regra, um anúncio com solicitações pagas aguardando escolha pode receber proposta e pode ser oferecido. Solicitação paga não bloqueia; só negociação ativa bloqueia. Se o anúncio for encerrado por "Trocamos", quem pagou e não foi escolhido continua sem reembolso, como RB-004 já prevê.

**TP-12.2 (ADR-0009, decisão 4).** Cada fluxo termina na regra em que nasceu. Propostas abertas continuam valendo se o ambiente voltar a `paid_request`, e solicitações em andamento continuam valendo se ele passar a `trade_proposal`. Só o nascimento de fluxos novos segue a variável.

**TP-12.3 (derivada de D-4, D-16 e DM-8.5).** Um anúncio com compromisso não admite nova solicitação, escolha nem reseleção da regra solicitação paga enquanto o compromisso durar. É a mesma exclusão de TP-6.2, vista do outro lado.

**TP-12.4 (D-6).** Os limites são por regra. As três vagas pagas de RB-003 e as três propostas abertas de RB-008 são contagens independentes.

## 13. Termos e consentimento

**TP-13.1 (D-19).** Cada regra tem o seu texto de Termos e de Privacidade. O consentimento desta regra é gravado **no próprio fluxo**, ao propor e ao aceitar, com a versão do texto aceito, como já acontece na publicação de anúncio. Não há reaceite geral dos Termos por causa da troca de regra.

**TP-13.2 (D-19).** A forma final do consentimento e o aviso prévio que os Termos 1.0 prometem antes de uma mudança relevante dependem de revisão jurídica ([#173](https://github.com/BrunoMNoronha/techlab-troq/issues/173)) e estão abertos em [OD-18](../decisions/open-decisions.md). Enquanto OD-18 estiver aberta, trocar a regra de um ambiente com usuários reais contraria essa promessa dos Termos; quando trocar continua sendo decisão do Bruno (ADR-0009, decisões 2 e 3).

## 14. Relação com as decisões vigentes

| Decisão | Na proposta de troca |
| --- | --- |
| RB-001 / DEC-001 | Não se aplica. A regra equivalente é RB-010, com as mesmas proteções (TP-9.2) |
| RB-002 / DEC-002 | Vale igual (TP-11.1) |
| RB-003 / DEC-003, DEC-019, DEC-041, DEC-051 | Não se aplicam. Os limites são os de RB-008 (seção 4) |
| RB-004 / DEC-004 | Não se aplica. A cobrança é a de RB-009, também definitiva (TP-7.4) |
| RB-005, RB-006 | Valem igual |
| DEC-023 | Vale igual, nos dois sentidos da liberação |
| DEC-027 | Vale igual. O compromisso não é estado, e a única transição disparada por esta regra é o encerramento do próprio anúncio por quem declara "Trocamos" (TP-10.3), que é ato do dono |
| DEC-029 | Valem os dois estados e o encerramento unilateral e irreversível. Deixam de valer, só nesta regra, a ausência de resultado (seção 9.3) e a independência total entre negociação e anúncio (seção 9.1): aqui a declaração existe e devolve ou encerra anúncios |
| DEC-030 | Vale igual (TP-11.1) |
| DEC-031 | Vale igual. Efeitos sobre propostas e negociações em PT-10 |
| DEC-032 | Não se aplica (TP-10.8) |
| DEC-033 | Vale igual, por categoria: a proposta é dado operacional, os eventos são auditoria, o pagamento é metadado financeiro e as duas liberações têm a trilha de 24 meses |
| DEC-034 | Vale igual |
| DEC-035 | Não se aplica. A proposta é gratuita, persistida e visível ao anunciante por decisão desta regra |
| DEC-036, DEC-043 a DEC-045 | Valem igual, salvo o valor da cobrança, que é o de TP-7.2 (ADR-0009, decisão 13) |
| DEC-037 | Vale igual, com as hipóteses de reembolso lidas como em TP-7.6 |
| DEC-038 | Vale igual (TP-4.7, TP-5.3) |
| DEC-040 | O princípio vale para as duas partes (TP-3.4) |
| DEC-046 | Vale igual. As alternativas de troca continuam informativas e não limitam o que pode ser oferecido |
| DEC-048 | Não se aplica. O catálogo de e-mails desta regra é pendência (seção 16) |
| DEC-049 | Vale igual. A proposta não tem texto (TP-3.2) e o nome fica oculto até o pagamento (TP-3.5) |

## 15. Itens derivados, para homologação

Os itens abaixo não foram decididos um a um pelo Bruno. Eles decorrem das decisões citadas e ficam sujeitos à homologação dele na revisão de #186.

| Item | Resumo | Decorre de |
| --- | --- | --- |
| TP-3.3 | Pré-condições de quem propõe e dos dois anúncios | DEC-027, DEC-034, RF-002 |
| TP-3.4 | Contato cadastrado das duas partes antes da cobrança | DEC-040 |
| TP-4.7 | Limites garantidos no banco | DEC-038 |
| TP-5.2 | Validade fixa, sem prorrogação | D-7, D-10, PE-4.7 |
| TP-5.3 | Vencimentos valem do instante em que vencem, sem depender de trabalho periódico | DEC-038, AR-15.3 |
| TP-5.4 | Só validade e prazo mudam o estado da proposta sem ato de uma pessoa | DEC-027, DEC-029 |
| TP-6.2 | Um compromisso por anúncio | D-8, D-16 |
| TP-6.8 | Efeitos de todo fim de aceite sem pagamento | D-8, D-16, D-23 |
| TP-7.5 | Fonte de verdade, idempotência e tempestividade do pagamento | DEC-037 |
| TP-7.6 | Hipóteses de reembolso técnico lidas com "aceite" | D-12, D-13, D-15, PE-7.2, PE-12.2 |
| TP-7.7 | Cobrança não paga de aceite encerrado é cancelada, não reembolsada | PE-7.4, PD-8.3 |
| TP-7.8 | O valor cobrado é o vigente na criação da proposta | ADR-0009, decisão 9 |
| TP-8.2 | Fora do feed não é estado; anúncio comprometido não entra em fluxo novo | D-16, DEC-027 |
| TP-8.5 | A pausa não interrompe um aceite já dado | D-8, D-10, D-12, D-14 |
| TP-8.7 | Encerrar o anúncio cancela as propostas abertas, sem bloqueio | DEC-027 |
| TP-8.8 | Remoção, sanção e exclusão de conta não desfazem o que já ocorreu | DEC-027, DEC-031 |
| TP-9.2 | As proteções de RB-001 valem para cada um dos dois sentidos | DEC-023, contact-release.md |
| TP-10.1 | A negociação nasce `active` no pagamento, com os dois estados de sempre | DEC-029 |
| TP-10.4 | Sem prazo para a resposta ao "Trocamos" | DEC-029 |
| TP-10.5 | Declarações irreversíveis | DEC-027, DEC-029 |
| TP-10.6 | A declaração não cria estado, não atribui culpa e não é julgada | DEC-029 |
| TP-10.8 | Sem reseleção | DEC-032 |
| TP-12.3 | Anúncio comprometido não admite fluxo novo da solicitação paga | D-4, D-16, DM-8.5 |

## 16. Pendências

| Pendência | Onde |
| --- | --- |
| Preço final | [OD-17](../decisions/open-decisions.md); sai de PT-01 e do primeiro teste |
| Aviso prévio de troca de regra e forma final do consentimento | [OD-18](../decisions/open-decisions.md); revisão jurídica de #173 |
| Catálogo de e-mails desta regra | PT-09, com decisão do Bruno sobre quais avisos existem |
| Efeitos de remoção, sanção e exclusão de conta | PT-10, com #166 e #171 |
| Textos de interface | PT-09 |

## 17. Alternativas descartadas pelo Bruno

| Alternativa | Decisão |
| --- | --- |
| Os dois pagam, ou só o anunciante paga | Só o proponente (D-11) |
| Devolver o valor quando termina em "Não deu certo" | Cobrança definitiva (D-15) |
| Teto de 5 propostas por conta | Limites por anúncio, sem teto por conta (D-6) |
| Várias propostas da mesma conta no mesmo alvo | Uma por conta em cada alvo (D-22) |
| As outras propostas caem já no aceite | Congelam no aceite e caem no pagamento (D-8) |
| Só o proponente pode voltar atrás, ou ninguém depois do aceite | Os dois podem antes do pagamento (D-13) |
| Revogação devolve a proposta a pendente, ou bloqueia nova proposta | Encerra como recusada, sem bloqueio (D-23) |
| Aceite não pago sem consequência, ou restrição geral na conta | Bloqueio só para aquele anúncio (D-14) |
| Anúncios saem do feed só no pagamento, ou ficam inacessíveis por link direto | Saem do feed no aceite; o link direto segue abrindo (D-16) |
| Mostrar o nome de quem propõe antes do pagamento | Só anúncio oferecido e reputação (D-9) |
| "Trocamos" unilateral encerrando os dois anúncios, ou só com as duas confirmações | Cada parte fecha o seu (D-17) |
| Avaliar só quando a troca acontece | Avaliação nos dois desfechos (D-18) |
| Reaceite geral dos Termos | Consentimento no fluxo (D-19) |
| Faixa de valor no anúncio | Fora desta frente (D-20) |

## 18. Rastreabilidade

| Origem | Registro | Onde está |
| --- | --- | --- |
| R-1 | DEC-054 | TP-3.1, TP-3.2; RB-007 |
| R-2 | DEC-054 | TP-4.1, TP-4.6, TP-6.1; RB-008 |
| R-3 | DEC-054 | TP-6.1, TP-7.1, TP-9.1; RB-009, RB-010 |
| R-4 | DEC-054 | TP-6.4, TP-8.1 |
| R-5 | DEC-054 | TP-10.2, TP-10.3, TP-11.1, com D-17 e D-18 prevalecendo |
| R-6 | DEC-054 | TP-3.7 |
| D-1, D-2, D-3 | DEC-053 | [ADR-0009](../adr/0009-trade-rules-environment-selector.md), decisões 1 a 4 |
| D-4 | DEC-054 | TP-12.1 |
| D-5 | DEC-054 | TP-3.1, TP-3.7; RB-007 |
| D-6 | DEC-054 | TP-4.1 a TP-4.3, TP-12.4; RB-008 |
| D-7 | DEC-054 | TP-5.1 |
| D-8 | DEC-054 | TP-6.3 |
| D-9 | DEC-054 | TP-3.5, TP-9.3 |
| D-10 | DEC-054 | TP-8.4, TP-8.6 |
| D-11 | DEC-054 | TP-7.1, TP-7.2; RB-009; OD-17 |
| D-12 | DEC-054 | TP-7.3; RB-009 |
| D-13 | DEC-054 | TP-6.5, TP-6.6 |
| D-14 | DEC-054 | TP-4.5, TP-6.7 |
| D-15 | DEC-054 | TP-7.4, TP-10.7; RB-009 |
| D-16 | DEC-054 | TP-6.4, TP-8.1, TP-8.3 |
| D-17 | DEC-054 | TP-10.2, TP-10.3 |
| D-18 | DEC-054 | TP-11.1 |
| D-19 | DEC-054 | TP-13.1; OD-18 |
| D-20 | DEC-055 | TP-3.6; [../delivery/trade-proposal-plan.md](../delivery/trade-proposal-plan.md) |
| D-21 | DEC-055 | [../delivery/trade-proposal-plan.md](../delivery/trade-proposal-plan.md) |
| D-22 | DEC-054 | TP-4.4; RB-008 |
| D-23 | DEC-054 | TP-6.6 |
| D-24 | DEC-054 | TP-4.5, TP-6.7 |

Não altera: RB-001 a RB-006 e nenhuma decisão vigente da regra solicitação paga.
