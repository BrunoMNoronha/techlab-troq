# Proposta de troca — desenho técnico — TROQS

Desenho técnico da regra de troca **proposta de troca** (`trade_proposal`). Produzido por **PT-00** ([#186](https://github.com/BrunoMNoronha/techlab-troq/issues/186)), junto com [../adr/0009-trade-rules-environment-selector.md](../adr/0009-trade-rules-environment-selector.md) (DEC-052) e [../product/trade-proposal.md](../product/trade-proposal.md) (DEC-053).

Este documento **converte a política em mecanismo**. Ele não cria regra de negócio: onde decide, decide entidades, invariantes, travas e contrato de teste. Não é schema, não cria migration e não implementa nada. A regra **solicitação paga** continua desenhada em [data-model.md](data-model.md), [payments-design.md](payments-design.md) e [contact-release.md](contact-release.md), e nada aqui a altera.

Os itens são identificados como `TD-x.y`. Os testes do contrato são `TT-n`.

## 1. Como ler

As classes são as de [overview.md](overview.md), seção 1: **normativa** (regra já decidida, citada), **decisão arquitetural** (escolha técnica desta entrega) e **detalhe de implementação** (deixado para a entrega executora). Nomes de entidade e de campo são lógicos; os físicos são da migration de cada entrega ([../adr/0005-prisma-orm-migrations.md](../adr/0005-prisma-orm-migrations.md)).

Vocabulário: **alvo** é o anúncio que recebe a proposta, **oferecido** é o anúncio que o proponente oferece, **compromisso** é a condição definida em [../product/trade-proposal.md](../product/trade-proposal.md), seção 2.

## 2. Entidades

```
Listing (alvo) ──1:N── TradeProposal ──N:1── Listing (oferecido)
   │                        │
   │                        ├──0..1── PaymentAttempt ──1:N── Payment ──0..1── TechnicalRefund
   │                        │
   │                        └──0..1── Negotiation ──0..2── NegotiationDeclaration
   │                                       ├──2── ContactRelease ──1:N── ContactAccessEvent
   │                                       └──0..2── Rating
   │
   └──0..1 vivo── ListingCommitment

ProposalBlock   (conta, anuncio alvo)
```

| Entidade | Módulo dono | Papel |
| --- | --- | --- |
| `TradeProposal` | `proposal` | A proposta: alvo, oferecido, proponente, estado, vagas, validade, prazo de pagamento, valor e versão dos termos |
| `ProposalBlock` | `proposal` | O bloqueio de TP-4.5: uma linha por par de conta e anúncio alvo |
| `ListingCommitment` | `listing` | O compromisso de um anúncio: a proposta que o causou e, durante o aceite, o prazo até o qual ele vale |
| `NegotiationDeclaration` | `negotiation` | A declaração de uma parte: "Trocamos" ou "Não deu certo" |
| `PaymentAttempt` | `payments` | Passa a ter sujeito e valor próprios (ADR-0009, decisão 13) |
| `Negotiation` | `negotiation` | Passa a gravar a regra e, nesta regra, a proposta e o anúncio oferecido |
| `ContactRelease` | `contact` | Passa a admitir duas por negociação desta regra, uma por destinatário |

**TD-2.1 (decisão arquitetural).** `TradeProposal` é entidade nova, e não uma `ContactRequest` com outro estado. A solicitação **é** a reserva de vaga paga (DM-6.1); a proposta não reserva vaga paga, não tem janela de 30 minutos e não segue DEC-041 nem DEC-051. Reaproveitar a entidade misturaria as duas contagens.

**TD-2.2 (decisão arquitetural).** `ListingCommitment` pertence a `listing`, e não a `proposal`. É o que permite ao feed, à mídia e às guardas da solicitação paga perguntarem "este anúncio tem compromisso?" sem depender do módulo `proposal`.

**TD-2.3 (decisão arquitetural).** O compromisso é registro de exclusão mútua com restrição de banco, não um contador derivado. Não repete o `paidCount` rejeitado em [data-model.md](data-model.md), seção 14.

**TD-2.4 (decisão arquitetural).** As mudanças em entidades existentes são compatíveis com os dados atuais:

| Entidade | Mudança | Linhas existentes |
| --- | --- | --- |
| `PaymentAttempt` | Valor da cobrança em centavos; referência opcional à proposta; a referência à solicitação passa a ser opcional, com a restrição "exatamente um sujeito" | Recebem valor 99 e continuam ligadas à sua solicitação |
| `Negotiation` | Regra; referência opcional à proposta e ao anúncio oferecido; a escolha passa a ser opcional, com restrição que amarra a forma à regra | Recebem `paid_request` e continuam ligadas à sua escolha |
| `ContactRelease` | Referência opcional à proposta; a referência à solicitação passa a ser opcional; unicidade por negociação e destinatário | Continuam únicas por negociação (TD-7.2) |

## 3. Estados da proposta

Os estados e as transições são os de [../product/trade-proposal.md](../product/trade-proposal.md), seção 5: `pending`, `accepted`, `paid`, `declined`, `withdrawn`, `expired`, `payment_expired` e `cancelled`.

**TD-3.1 (invariante, restrição de banco + transação).** Toda transição é uma atualização condicionada ao estado de origem, e todo par fora da tabela de TP é rejeitado. Estado terminal não tem saída.

**TD-3.2 (invariante, restrição de banco).** `paid` é fato histórico: a linha `paid` não muda mais, como a solicitação `paid` de DM-6.7.

**TD-3.3 (decisão arquitetural).** A proposta grava dois instantes fixos: o fim da validade, calculado na criação, e o fim do prazo de pagamento, calculado no aceite. Os dois vêm do `now()` do banco, lido uma vez na transação (DM-6.12, item 4), e nunca são alterados depois (TP-5.2, TP-7.3).

**TD-3.4 (decisão arquitetural — vencimento sem depender de trabalho periódico).** Validade e prazo vencidos são **derivados na leitura** e **gravados na próxima escrita** sob as travas dos dois anúncios, como a expiração de reserva de DM-6.3:

- proposta `pending` com validade vencida conta como expirada em toda leitura e passa a `expired` na primeira transação que travar um dos seus anúncios;
- proposta `accepted` com prazo vencido segue TD-5.6.

**TD-3.5 (decisão arquitetural).** "Congelada" não é estado. Uma proposta `pending` está congelada quando um dos seus anúncios tem compromisso de outra proposta ou está `paused`. O congelamento é calculado, nunca gravado: assim ele some sozinho quando a causa some (TP-6.3, TP-8.4).

## 4. Limites e garantias de banco

| Regra | Garantia |
| --- | --- |
| No máximo 3 propostas abertas por anúncio alvo (TP-4.1) | Vaga de recebimento em `{1, 2, 3}` e índice único parcial sobre (alvo, vaga), restrito às abertas |
| No máximo 3 propostas abertas por anúncio oferecido (TP-4.2) | Vaga de envio em `{1, 2, 3}` e índice único parcial sobre (oferecido, vaga), restrito às abertas |
| Uma proposta aberta por conta em cada alvo (TP-4.4) | Índice único parcial sobre (alvo, proponente), restrito às abertas |
| Bloqueio depois de aceite não pago ou de desistência (TP-4.5) | `ProposalBlock` com chave (alvo, conta); nova proposta do par é recusada no banco, como a guarda de DEC-051 |
| Um compromisso por anúncio (TP-6.2) | Índice único parcial sobre o anúncio, restrito aos compromissos não liberados |
| Uma tentativa por proposta | Referência única da tentativa à proposta |
| Tentativa com exatamente um sujeito | Restrição de verificação na tentativa |
| Uma negociação por proposta | Referência única da negociação à proposta |
| Uma liberação por destinatário em cada negociação | Índice único sobre (negociação, destinatário) |
| Uma declaração por parte em cada negociação | Índice único sobre (negociação, parte) |
| Proposta `paid` imutável | Gatilho, como em DM-6.7 |

**TD-4.1 (normativa, DEC-038).** A trava dá a recusa limpa; a restrição impede a violação mesmo sem a trava. Nenhuma linha da tabela acima depende de verificação prévia da aplicação.

**TD-4.2 (decisão arquitetural).** O relógio não entra em condição de índice. Por isso um compromisso de aceite com prazo vencido continua ocupando o índice até ser liberado por uma escrita (TD-3.4). A leitura já o trata como inexistente quando TD-5.6 permite.

**TD-4.3 (decisão arquitetural).** As três vagas de recebimento desta regra e as três vagas pagas de RB-003 são contagens independentes, em entidades diferentes (TP-12.4).

## 5. Travas e transações

**TD-5.1 (normativa, ADR-0009, decisão 12).** Toda transação desta regra adquire, nesta ordem: as travas de linha dos dois anúncios, juntas e em ordem crescente de identificador, por um único ajudante de `listing`; as linhas de proposta, em ordem crescente de identificador; as de negociação; e a tentativa. Nenhuma chamada de rede acontece com trava segurada.

**TD-5.2 (decisão arquitetural).** Colisão em índice que escape da trava, e deadlock que o banco detecte, refazem a transação um número limitado de vezes, como a alocação de vaga de DM-6.12, item 5. Recusa por regra não é refeita.

**TD-5.3 (decisão arquitetural — propor).** Uma transação: trava os dois anúncios; grava os vencimentos pendentes deles (TD-3.4); confere as pré-condições de TP-3.3 e TP-3.4, a ausência de compromisso, o bloqueio e a proposta única por conta; aloca a menor vaga livre de recebimento e de envio; cria a proposta `pending` com validade, valor e versão dos termos; audita.

**TD-5.4 (decisão arquitetural — aceitar).** Uma transação: trava os dois anúncios e a proposta; grava os vencimentos pendentes; confere que o ator é o dono do alvo, que a proposta está `pending` e válida, que os dois anúncios estão `published` com donos ativos, que o anunciante tem contato, que nenhum dos dois anúncios tem compromisso e que nenhum deles tem negociação ativa de qualquer regra; cria os dois compromissos com o prazo de pagamento; passa a proposta a `accepted`; grava o consentimento do anunciante; audita.

**TD-5.5 (decisão arquitetural — recusar, retirar, revogar e desistir).** Uma transação: trava os dois anúncios e a proposta; confere ator e estado; grava o estado terminal; se havia aceite, libera os dois compromissos; se foi desistência depois do aceite, cria o `ProposalBlock`; audita. Depois do COMMIT, a cobrança ainda não paga é cancelada (TD-6.6).

**TD-5.6 (decisão arquitetural — prazo de pagamento vencido).** Uma proposta `accepted` com prazo vencido só passa a `payment_expired` quando **não existe tentativa** ou quando a tentativa está em **estado terminal sem acreditação**. Havendo tentativa não terminal, a proposta continua `accepted` e os compromissos continuam valendo até a confirmação resolver:

| Estado autoritativo | Efeito |
| --- | --- |
| Acreditado dentro do prazo | `paid` (TD-6.4) |
| Acreditado depois do prazo | RT-2, `payment_expired` e bloqueio |
| Terminal sem acreditação | `payment_expired` e bloqueio |

Motivo: TP-7.5 e PE-4.2 exigem que pagamento feito a tempo valha mesmo reconhecido depois. Esta é uma **diferença deliberada** em relação ao achado de F3-006 registrado em [payments-design.md](payments-design.md), PD-6.12: lá a vaga vencida é disputada por outra solicitação no mesmo ato; aqui o custo de esperar a confirmação é manter dois anúncios fora do feed por alguns minutos.

**TD-5.7 (decisão arquitetural).** Encerrar a espera de TD-5.6 depende da reconciliação de tentativas, como já depende toda tentativa não terminal ([payments-design.md](payments-design.md), PD-10). Isso é convergência, não invariante: enquanto a espera dura, nenhum direito é concedido e nenhum limite é violado (AR-15.3).

## 6. Pagamento

**TD-6.1 (normativa, ADR-0009, decisão 13).** A tentativa pertence à proposta e grava o valor da cobrança, que é o valor fixado na criação da proposta (TP-7.2). `payments` não conhece a proposta: recebe o sujeito como referência opaca, informa o fato e deixa o efeito para o dono do sujeito (AR-3.5).

**TD-6.2 (decisão arquitetural).** A tentativa é criada quando o proponente pede o Pix, e não no aceite. Um aceite que ninguém paga não deixa tentativa aberta por 24 horas, e a ordem de três passos de PD-4.1 é mantida: registrar a intenção numa transação, chamar o provedor fora de transação, gravar o resultado em outra.

**TD-6.3 (decisão arquitetural).** O passo que registra a intenção roda sob as travas dos dois anúncios e exige proposta `accepted`, do próprio ator, com prazo não vencido e os dois contatos cadastrados (TP-3.4). A cobrança é criada com validade igual ao tempo que falta para o fim do prazo, nunca abaixo do mínimo de 30 minutos do provedor (MP-1). O resíduo não cria direito: a tempestividade é conferida pelo TROQS contra o fim do prazo (PE-4.6), e pagamento acreditado depois dele é RT-2.

**TD-6.4 (decisão arquitetural — o efeito do pagamento).** A rotina de confirmação lê o estado autoritativo fora de transação, como em PD-6.6, e entrega o fato ao dono do sujeito. Para a proposta, uma única transação, sob as travas dos dois anúncios:

1. relê a proposta travada;
2. exige `accepted` e instante de acreditação menor ou igual ao fim do prazo;
3. elege o pagamento canônico e confirma a tentativa (PD-7);
4. passa a proposta a `paid`;
5. cria a negociação `active` desta regra, com o alvo, o oferecido, o anunciante e o proponente;
6. cria as duas autorizações de liberação de contato (TD-7.1);
7. retira o prazo dos dois compromissos, que passam a durar até o desfecho;
8. cancela as outras propostas abertas que envolvem qualquer um dos dois anúncios, liberando as vagas delas (TP-6.3);
9. audita cada efeito.

Não existe instante observável com proposta `paid` sem negociação, com negociação sem as duas autorizações ou com outra proposta ainda aberta sobre os mesmos anúncios.

**TD-6.5 (normativa, TP-7.6).** Falhando o passo 2 de TD-6.4, o pagamento é exceção técnica e segue o reembolso de [payments-design.md](payments-design.md), seção 8, com a hipótese persistida no ato (PD-8.2): RT-2 quando a acreditação é posterior ao prazo; RT-3 quando a proposta não está mais `accepted`; RT-1 para o excedente de duplicidade.

**TD-6.6 (normativa, PD-8.3 e PD-8.10).** Cobrança sem acreditação de um aceite que terminou segue o caminho de cancelamento, fora da transação que encerrou o aceite. O cancelamento é defesa adicional: se a acreditação ocorrer mesmo assim, vale TD-6.5.

**TD-6.7 (decisão arquitetural).** Um único roteador entrega o fato de pagamento ao dono do sujeito da tentativa. Ele serve ao webhook, à reconciliação, à retentativa de reembolso e à varredura de reversões. Nenhum desses caminhos lê o seletor de regra (ADR-0009, decisão 8).

**TD-6.8 (normativa, PD-9 e CR-4.3).** Reversão posterior do pagamento não desfaz a negociação nem as liberações. Ela é evento novo na auditoria.

**TD-6.9 (detalhe de implementação).** O limiar do alerta de tentativa parada e a cadência de reconsulta são ajustados por sujeito em PT-04: o prazo de 24 horas desta regra não pode disparar o alerta desenhado para a janela de 30 minutos.

## 7. Contato

**TD-7.1 (normativa, RB-010 e TP-9.1).** O efeito do pagamento cria **duas** `ContactRelease` na mesma transação, ambas com o pagamento canônico do proponente como evidência:

| Titular do contato | Destinatário |
| --- | --- |
| Anunciante | Proponente |
| Proponente | Anunciante |

**TD-7.2 (decisão arquitetural).** A unicidade passa a ser por negociação e destinatário. Para as liberações da solicitação paga, um índice parcial mantém a garantia de DM-8.8: continua existindo no máximo uma por negociação.

**TD-7.3 (normativa, [contact-release.md](contact-release.md)).** Armazenar, autorizar e retornar continuam sendo três fatos separados (CR-1.1). `ContactRelease` não guarda o número (CR-3.1), nunca é revogada (CR-3.5) e cada entrega passa por A1 a A6 e é registrada (CR-5). As superfícies proibidas de CR-6.1 e o cache de CR-7 valem para os dois sentidos.

**TD-7.4 (decisão arquitetural).** A entrega usa o caminho único que já existe. A verificação de cadeia (A4 e A5) é escolhida pela forma da autorização: a da solicitação paga confere a solicitação `paid`; a desta regra confere a proposta `paid` e a negociação a que ela pertence. `contact` continua sem depender de quem implementa a verificação (porta `ContactChainCheck`).

**TD-7.5 (normativa, TP-3.5).** Antes do pagamento, nenhuma resposta ao anunciante contém o nome de exibição do proponente, e nenhuma resposta ao proponente contém mais do que o detalhe público do anúncio alvo.

## 8. Feed e compromisso

**TD-8.1 (decisão arquitetural).** Passam a existir dois predicados distintos, cada um definido num único lugar de `listing`:

| Predicado | Definição | Quem usa |
| --- | --- | --- |
| Consultável publicamente | `published` e dono com conta `active`. É o critério de hoje, sem mudança | Detalhe por link direto e entrega de imagens |
| No feed | Consultável publicamente **e** sem compromisso | Listagem, busca, vitrine e as guardas de nascimento das duas regras |

**TD-8.2 (decisão arquitetural).** O critério de hoje está repetido em pontos de `listing` e de `media`. PT-03 unifica esse critério antes de acrescentar o segundo predicado, e a unificação vale pela regressão das provas de vitrine da Fase 2.

**TD-8.3 (normativa, TP-8.2).** O anúncio com compromisso continua `published`. Nenhum estado novo é criado e a matriz T1 a T9 não muda.

**TD-8.4 (decisão arquitetural).** O detalhe por link direto de um anúncio com compromisso responde normalmente e informa, sem identificar ninguém, que o anúncio está em negociação.

**TD-8.5 (normativa, TP-8.6).** A edição do anúncio é recusada no servidor enquanto ele tiver compromisso.

## 9. Negociação, declaração e encerramento

**TD-9.1 (normativa, DEC-029).** A negociação desta regra tem os mesmos dois estados. `active -> closed` continua sendo a única transição, unilateral, imediata e irreversível.

**TD-9.2 (decisão arquitetural).** A declaração é entidade própria, uma por parte. O desfecho não vira estado nem campo único da negociação: as duas declarações podem divergir e ficam registradas como estão (TP-10.6).

**TD-9.3 (decisão arquitetural — declarar).** Uma transação, sob as travas dos dois anúncios e a linha da negociação:

| Situação | Efeito |
| --- | --- |
| Negociação `active`, declaração "Não deu certo" | Grava a declaração, encerra a negociação e libera os dois compromissos |
| Negociação `active`, declaração "Trocamos" | Grava a declaração, encerra a negociação, encerra o anúncio de quem declarou (T5 ou T6) e mantém o compromisso do anúncio da outra parte |
| Negociação `closed`, resposta "Trocamos" de quem ainda não declarou | Grava a declaração e encerra o anúncio de quem respondeu |
| Negociação `closed`, resposta "Não troquei" de quem ainda não declarou | Grava a declaração e libera o compromisso do anúncio de quem respondeu |
| Repetição da mesma declaração pela mesma parte | Idempotente, sem novo efeito nem novo registro |

**TD-9.4 (normativa, DEC-027).** O encerramento do anúncio por "Trocamos" usa a transição T5 ou T6 existente, com o dono como ator, a mesma auditoria e a mesma porta de efeitos de encerramento.

**TD-9.5 (normativa, DEC-030).** A janela de avaliação conta do encerramento da negociação. `reputation` não lê a declaração (TP-11.1).

**TD-9.6 (decisão arquitetural).** Negociação da solicitação paga não tem declaração. A restrição que amarra a declaração à regra da negociação é de banco.

## 10. Eventos no meio do fluxo

| Evento | Efeito |
| --- | --- |
| Pausa de um dos anúncios (T3) | Nenhuma escrita em propostas. As pendentes ficam congeladas (TD-3.5). Um aceite já dado segue, e o Pix continua podendo ser pago (TP-8.5) |
| Reativação (T4) | Nenhuma escrita em propostas |
| Encerramento pelo dono (T5, T6) | Pela porta `ListingClosureEffect`: as propostas abertas do anúncio passam a `cancelled`; se havia aceite, os compromissos são liberados e a cobrança é cancelada depois do COMMIT. Negociação ativa não é tocada |
| Remoção administrativa (T7 a T9) | A mesma porta, quando a moderação existir (PT-10) |
| Conta de uma das partes deixa de estar `active` | Proposta com parte inativa não pode ser aceita nem paga. O detalhe é de PT-10 |
| Reversão do pagamento | TD-6.8 |

**TD-10.1 (decisão arquitetural).** `ListingClosureEffect` passa a compor dois efeitos em `src/app`: o que já encerra as reservas da solicitação paga e o que cancela as propostas. `listing` continua recusando o encerramento sem a porta.

**TD-10.2 (decisão arquitetural).** Nenhuma invariante depende da cascata imediata. O aceite e o efeito do pagamento reconferem tudo sob trava, e os estados terminais do anúncio não têm volta. Derivar "esta proposta não pode mais ser aceita" do estado atual dos anúncios não tem corrida.

**TD-10.3 (normativa, TP-12.3).** A reserva e a escolha da solicitação paga passam a recusar anúncio com compromisso. É a única mudança desta regra no caminho da outra, e ela só tem efeito quando existe compromisso.

## 11. Auditoria

**TD-11.1 (normativa, AR-9.4).** Os eventos abaixo entram na trilha única, na mesma transação do efeito, sem número de telefone e sem texto de pessoa usuária:

| Origem | Eventos |
| --- | --- |
| Proposta | Criação; recusa; retirada; expiração; aceite; revogação do aceite; desistência; prazo de pagamento vencido; cancelamento, com a causa; pagamento |
| Bloqueio | Criação do bloqueio de TP-4.5 |
| Pagamento | Os de DM-11.1, sem mudança |
| Negociação | Criação; cada declaração, com a parte e o conteúdo; encerramento |
| Contato | Cada uma das duas autorizações; cada entrega; cada negativa |
| Anúncio | T5 ou T6 disparado por "Trocamos", como qualquer encerramento |

**TD-11.2 (normativa, TP-13.1).** O consentimento de cada parte fica gravado no fluxo, com versão e instante. Onde ele é guardado é detalhe de implementação de PT-05 e PT-06.

## 12. Seletor

**TD-12.1 (normativa, ADR-0009, decisão 8).** Nesta regra, só a transação de TD-5.3 confere o seletor: ela recusa propor quando o ambiente não está em `trade_proposal`. Aceitar, pagar, declarar e todo o resto seguem pela proposta que já existe.

**TD-12.2 (normativa, ADR-0009, decisão 7).** Com o seletor inválido, propor e solicitar são recusados com a mesma indisponibilidade neutra, e os fluxos em andamento das duas regras continuam.

## 13. Contrato de teste

**TD-13.1.** Os testes abaixo são o contrato desta regra. Valem PD-13.2 e PD-13.3: teste de concorrência que roda em sequência não aprova nada, e todo dado de teste é sintético.

| # | Teste | Prova |
| --- | --- | --- |
| TT-1 | N propostas simultâneas ao mesmo alvo, com N maior que 3 | Exatamente 3 ficam abertas; as demais são recusadas |
| TT-2 | N propostas simultâneas oferecendo o mesmo anúncio, com N maior que 3 | Exatamente 3 ficam abertas |
| TT-3 | Duas propostas simultâneas da mesma conta ao mesmo alvo | Uma só fica aberta |
| TT-4 | Violação direta de cada índice da seção 4, sem a trava | O banco recusa |
| TT-5 | Aceites simultâneos em ordem oposta de anúncios e em ciclo de três anúncios | Nenhum anúncio fica com dois compromissos e nenhuma transação fica presa |
| TT-6 | Dois aceites simultâneos de propostas do mesmo alvo | Um só aceite |
| TT-7 | Aceitar contra recusar, retirar e expirar a mesma proposta | Um só desfecho |
| TT-8 | Revogação e desistência contra a confirmação do pagamento | Ou `paid` com negociação, ou fim do aceite com RT-3; nunca os dois |
| TT-9 | Pagamento acreditado dentro do prazo e reconhecido depois dele | `paid`; a proposta não vence enquanto a tentativa não é terminal |
| TT-10 | Pagamento acreditado depois do prazo | RT-2; sem negociação e sem contato; bloqueio criado |
| TT-11 | Pagamento acreditado sem aceite vigente | RT-3 |
| TT-12 | Dois pagamentos acreditados para a mesma proposta | Uma negociação; excedente em RT-1 |
| TT-13 | Notificação duplicada, fora de ordem e ausente | Um único efeito; a reconciliação sozinha chega a `paid` |
| TT-14 | Efeito do pagamento | Uma negociação, duas autorizações, compromissos sem prazo e demais propostas dos dois anúncios canceladas, tudo ou nada |
| TT-15 | Acesso ao contato nos dois sentidos | Cada parte lê só o contato da outra, só depois do pagamento; terceiro, outro proponente e moderador são negados; nada em payload, log ou telemetria |
| TT-16 | Respostas ao anunciante antes do pagamento | Nenhuma contém o nome do proponente |
| TT-17 | Feed | Anúncio com compromisso fora de listagem e busca; detalhe por link direto disponível com o aviso; volta ao feed em cada fim sem troca |
| TT-18 | Declarações simultâneas das duas partes | Uma encerra a negociação; cada anúncio recebe o efeito da declaração do seu dono |
| TT-19 | "Trocamos" seguido de "Não troquei" | Só o anúncio de quem declarou "Trocamos" é encerrado; o outro volta ao feed |
| TT-20 | Avaliação | Recusada com a negociação `active`; aceita nos dois desfechos |
| TT-21 | Bloqueio | Aceite não pago e desistência depois do aceite impedem nova proposta ao mesmo alvo; revogação e retirada de pendente não impedem |
| TT-22 | Encerramento do anúncio contra aceite e contra pagamento | Propostas canceladas; pagamento posterior em RT-3 |
| TT-23 | Escolha ou reserva da solicitação paga contra aceite no mesmo anúncio | Exclusão mútua |
| TT-24 | Mesmo build com `paid_request`, com `trade_proposal` e com valor inválido | Cada servidor só deixa nascer o fluxo da sua regra; o inválido não deixa nascer nenhum; fluxo nascido num é pago e encerrado pelo outro |
| TT-25 | Trabalhos de reconciliação, retentativa e reversão | Reclamam tentativas dos dois sujeitos |
| TT-26 | Reversão depois do pagamento | Negociação e autorizações intactas; evento novo |
| TT-27 | Edição | Recusada nos dois anúncios com compromisso; aceita com proposta pendente |
| TT-28 | Pausa | Proposta pendente não pode ser aceita; aceite já dado continua pagável |

## 14. O que este documento não decide

| Tema | Onde fica |
| --- | --- |
| Schema, nomes físicos, tipos e migrations | Entrega executora de cada parte |
| Rotas, telas e textos | PT-09 |
| Catálogo de e-mails | PT-09, com decisão do Bruno |
| Efeitos de remoção, sanção e exclusão de conta | PT-10 |
| Preço final | OD-17 |
| Aviso prévio e forma final do consentimento | OD-18 |
| Limiares de alerta e cadências | PT-04, por medição |

## 15. Alternativas rejeitadas

| Alternativa | Razão |
| --- | --- |
| Estado `negotiating` no anúncio | Rejeitado por DEC-027; alteraria a matriz T1 a T9 e todo código que lê o estado (TD-8.3) |
| Derivar "fora do feed" por junção com propostas e negociações | `listing` e `media` passariam a ler tabelas de outro módulo, e não haveria garantia de compromisso único (TD-2.2) |
| Gravar o congelamento na proposta | Exigiria descongelar em cascata; o cálculo some sozinho com a causa (TD-3.5) |
| Criar a tentativa no aceite | Deixaria tentativas paradas por 24 horas e cobranças abertas para aceites que ninguém paga (TD-6.2) |
| Vencer o aceite na primeira escrita depois do prazo, mesmo com tentativa não terminal | Transformaria pagamento feito a tempo em reembolso e bloqueio (TD-5.6) |
| Uma liberação com dois destinatários | Quebraria a pergunta "esta autorização é deste ator?" de CR-5.3 |
| Resultado único na negociação | Não comporta declarações divergentes e criaria julgamento que DEC-029 afastou (TD-9.2) |
| Vencer validade e prazo por trabalho periódico | AR-15.3: nenhuma invariante depende de trabalho periódico disparar |

## 16. Rastreabilidade

| Item | Efeito deste documento |
| --- | --- |
| DEC-052, ADR-0009 | Decisões 8, 12 e 13 materializadas nas seções 5, 6 e 12 |
| DEC-053 | TP-3 a TP-12 têm entidade, invariante e teste correspondentes |
| RB-007, RB-008 | Seções 3 e 4; TT-1 a TT-4, TT-21 |
| RB-009 | Seções 5 e 6; TT-8 a TT-13 |
| RB-010 | Seção 7; TT-14 a TT-16 |
| RB-002 | TD-9.5; TT-20 |
| DEC-027 | Preservada: nenhum estado novo (TD-8.3, TD-9.4) |
| DEC-029 | Preservada nos estados e no encerramento unilateral (TD-9.1) |
| DEC-037 | Fonte de verdade, idempotência e reembolso técnico reaproveitados (seção 6) |
| DEC-038 | Seção 4 e TD-3.4 |
| RB-001, RB-003, RB-004 | Não alteradas. A única mudança no caminho delas é TD-10.3 |

## 17. Revisão

Revisado quando uma decisão alterar [../product/trade-proposal.md](../product/trade-proposal.md), quando uma entrega executora materializar uma parte deste desenho ou quando um teste do contrato mostrar que alguma proteção é insuficiente.
