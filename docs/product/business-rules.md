# Regras de negócio homologadas

Regras de negócio vigentes do TROQS. A semântica de cada regra é preservada literalmente; a coluna de implicação operacional é apenas um resumo do efeito esperado e não substitui a regra.

Observações aparecem somente quando já confirmadas. Questões derivadas que ainda não foram decididas estão em [../decisions/open-decisions.md](../decisions/open-decisions.md).

## Regras de troca e escopo

Desde DEC-052 ([../adr/0009-trade-rules-environment-selector.md](../adr/0009-trade-rules-environment-selector.md)) o TROQS tem **duas regras de troca cadastradas**, e a regra dos fluxos novos de cada ambiente é escolhida pela variável `TRADE_RULE`. Cada regra de negócio indica, no item **Escopo**, a que regra de troca se aplica:

| Regra de troca | Regras de negócio |
| --- | --- |
| Solicitação paga (`paid_request`) | RB-001, RB-003, RB-004 |
| Proposta de troca (`trade_proposal`) | RB-007, RB-008, RB-009, RB-010 |
| As duas | RB-002, RB-005, RB-006 |

RB-001 a RB-006 **não** foram alteradas por DEC-052 nem por DEC-053. Limitar o escopo de uma regra não muda o que ela diz.

## RB-001 — Liberação de contato

- **Regra:** WhatsApp/telefone só pode ser liberado ao solicitante escolhido e com pagamento aprovado.
- **Implicação operacional:** a liberação depende de duas condições simultâneas: o solicitante foi escolhido pelo anunciante e seu pagamento está aprovado. Solicitantes não escolhidos, ou escolhidos sem pagamento aprovado, não recebem o contato.
- **Observações confirmadas:** telefone/WhatsApp é dado protegido e não pode aparecer em payload público, cache público ou logs. A liberação deve ter autorização server-side e auditoria. A trilha de auditoria da liberação é retida por 24 meses e, após a exclusão da conta, não conserva telefone/WhatsApp em texto puro ([data-retention-policy.md](data-retention-policy.md), DEC-033). Uma liberação já concedida nunca é revogada, inclusive em caso de desistência e reseleção; cada nova escolha gera nova autorização independente, igualmente sujeita a esta regra ([reselection-policy.md](reselection-policy.md), DEC-032).
- **Escopo:** regra de troca solicitação paga (`paid_request`). Na proposta de troca vale RB-010.

## RB-002 — Avaliação

- **Regra:** avaliação somente após encerramento da negociação no sistema.
- **Implicação operacional:** nenhuma avaliação pode ser registrada enquanto a negociação não estiver encerrada no sistema.
- **Observações confirmadas:** o mecanismo de encerramento da negociação está definido em [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029): a negociação tem os estados `active` e `closed`, e qualquer uma das duas partes pode encerrá-la unilateralmente, de forma explícita, imediata e irreversível. Uma negociação `closed` satisfaz a pré-condição temporal desta regra; ela não afirma que a troca foi bem-sucedida. As regras detalhadas de avaliação estão definidas em [ratings.md](ratings.md) (DEC-030): avaliação bilateral sobre a contraparte, no máximo uma por direção, nota inteira de 1 a 5 sem texto livre, janela de 14 dias corridos, publicação cega, imutabilidade após a publicação, média simples com contagem e invalidação administrativa auditada em caso de abuso.
- **Escopo:** as duas regras de troca. Na proposta de troca, a negociação nasce com o pagamento aprovado e é encerrada pela primeira declaração de uma das partes ([trade-proposal.md](trade-proposal.md), seções 10 e 11).

## RB-003 — Limite de solicitações pagas

- **Regra:** cada anúncio aceita no máximo 3 solicitações pagas.
- **Implicação operacional:** a quarta tentativa de solicitação paga para o mesmo anúncio deve ser recusada. O limite precisa ser garantido mesmo sob solicitações concorrentes.
- **Observações confirmadas:** a recomendação vigente é reserva atômica de vaga antes da cobrança, com expiração, a detalhar no design de pagamentos; a janela de reserva tem piso normativo de 30 minutos e nenhuma exceção de pagamento pode produzir uma quarta solicitação paga válida, sendo o consumo de vaga fato histórico que não é devolvido por reversão posterior ([payment-exceptions.md](payment-exceptions.md), DEC-037). A demonstração de interesse é gratuita e **não** ocupa vaga ([interest-flow.md](interest-flow.md), DEC-035). A reseleção **não** cria vaga, **não** reinicia nem devolve o limite de três e **não** permite uma quarta solicitação paga; como cada solicitação paga pode ser escolhida no máximo uma vez, no máximo três pessoas são escolhidas sequencialmente no ciclo inteiro do anúncio ([reselection-policy.md](reselection-policy.md), DEC-032).
- **Escopo:** regra de troca solicitação paga (`paid_request`). Na proposta de troca vale RB-008.

## RB-004 — Cobrança definitiva

- **Regra:** a cobrança de R$ 0,99 é definitiva, mesmo quando o solicitante não for escolhido.
- **Implicação operacional:** não há reembolso pelo fato de o solicitante não ter sido escolhido. O valor deve ser cobrado exatamente como R$ 0,99.
- **Observações confirmadas:** o tratamento das exceções de pagamento — duplicidade, pagamento acreditado após a expiração da reserva, falhas de confirmação, reembolso técnico e reversões posteriores — está definido em [payment-exceptions.md](payment-exceptions.md) (DEC-037), que fechou OD-07. Essa política preserva RB-004 literalmente e explicita sua fronteira: a cobrança é definitiva para uma **solicitação paga válida**, e a regra **não** autoriza reter dinheiro recebido por erro técnico, como cobrança duplicada, cobrança fora de reserva válida ou cobrança criada por defeito. O termo `chargeback` pertence aos arranjos de cartão e não descreve o Pix. A desistência do escolhido e a reseleção **não** geram reembolso automático nem qualquer compensação ([reselection-policy.md](reselection-policy.md), DEC-032). O valor pertence à solicitação de desbloqueio, não à demonstração de interesse, que é gratuita ([interest-flow.md](interest-flow.md), DEC-035).
- **Escopo:** regra de troca solicitação paga (`paid_request`). Na proposta de troca vale RB-009.

## RB-005 — Localização pública

- **Regra:** localização pública limitada a cidade/UF.
- **Implicação operacional:** nenhuma informação de localização mais precisa que cidade/UF pode ser exibida publicamente.
- **Observações confirmadas:** localização precisa não deve ser coletada nem exposta no MVP sem necessidade posteriormente documentada.
- **Escopo:** as duas regras de troca.

## RB-006 — Itens proibidos

- **Regra:** anúncios com itens proibidos devem ser removidos.
- **Implicação operacional:** deve existir um caminho de denúncia e moderação que resulte na remoção de anúncios com itens proibidos.
- **Observações confirmadas:** o catálogo/política de itens proibidos está definido em [prohibited-items.md](prohibited-items.md) (DEC-031): catálogo por categorias PI-01 a PI-12 com fundamento `ilegal`, `regulado` ou `política`; ausência de um item na lista não o torna permitido; o MVP não oferece fluxo de autorização documental para categorias reguladas; a denúncia exige usuário autenticado e verificado e não altera o estado do anúncio; a moderação decide `procedente`, `improcedente` ou `sem_acao`; a remoção usa exclusivamente as transições administrativas de [listing-lifecycle.md](listing-lifecycle.md) e é terminal; os prazos de decisão são de 24 horas corridas na classe crítica e 5 dias úteis na comum; há reincidência progressiva e contestação administrativa sem restauração automática; a identidade do denunciante não é revelada ao anunciante.
- **Escopo:** as duas regras de troca.

## RB-007 — Proposta de troca

- **Regra:** só propõe quem tem anúncio publicado; a proposta oferece um anúncio próprio por um anúncio de outra pessoa, é gratuita e não tem texto livre.
- **Implicação operacional:** quem não tem anúncio publicado não propõe. A proposta é só o par de anúncios: não carrega mensagem, imagem nem valor, e enviá-la não gera cobrança.
- **Observações confirmadas:** decisão do Bruno em 2026-10-05, detalhada em [trade-proposal.md](trade-proposal.md) (DEC-053), seção 3. Antes do pagamento, o anunciante vê só o anúncio oferecido e a reputação de quem propõe; o nome aparece depois do pagamento. A diferença em dinheiro entre os itens fica fora do produto.
- **Escopo:** regra de troca proposta de troca (`trade_proposal`).

## RB-008 — Limite de propostas abertas

- **Regra:** cada anúncio recebe no máximo 3 propostas abertas e pode ser oferecido em no máximo 3 propostas abertas; cada conta tem no máximo uma proposta aberta em cada anúncio.
- **Implicação operacional:** a quarta proposta aberta para o mesmo anúncio, a quarta proposta aberta oferecendo o mesmo anúncio e a segunda proposta aberta da mesma conta no mesmo anúncio são recusadas. Os limites precisam ser garantidos mesmo sob propostas concorrentes. Recusar, retirar ou expirar devolve a vaga.
- **Observações confirmadas:** não há teto por conta. A proposta sem resposta vale 7 dias. Quem foi aceito e não pagou no prazo, ou desistiu depois do aceite, não propõe de novo àquele anúncio ([trade-proposal.md](trade-proposal.md), seções 4 e 5). Estas vagas são independentes das três vagas pagas de RB-003.
- **Escopo:** regra de troca proposta de troca (`trade_proposal`).

## RB-009 — Pagamento no aceite

- **Regra:** só o proponente paga, depois que o anunciante aceita a proposta e em até 24 horas; a cobrança é definitiva, mesmo quando a negociação termina sem troca.
- **Implicação operacional:** ninguém paga para propor nem para ser considerado. Aceite não pago no prazo termina sem cobrança. Não há reembolso porque a negociação terminou em "Não deu certo".
- **Observações confirmadas:** o preço candidato é R$ 2,99; o preço final está aberto em [OD-17](../decisions/open-decisions.md). O anunciante pode revogar o aceite e o proponente pode desistir antes do pagamento. O reembolso é só técnico, nas hipóteses de [payment-exceptions.md](payment-exceptions.md) (DEC-037) lidas como em [trade-proposal.md](trade-proposal.md), TP-7.6.
- **Escopo:** regra de troca proposta de troca (`trade_proposal`).

## RB-010 — Liberação de contato nos dois sentidos

- **Regra:** WhatsApp/telefone só é liberado às duas partes de uma proposta aceita e com pagamento aprovado; cada parte recebe o contato da outra.
- **Implicação operacional:** antes do pagamento aprovado, nenhuma das partes recebe contato. Quem propôs e não foi aceito, quem foi aceito e não pagou e qualquer terceiro não recebem contato por nenhum caminho.
- **Observações confirmadas:** valem, para cada um dos dois sentidos, as proteções de RB-001: dado protegido, autorização server-side, auditoria da autorização e de cada acesso, e liberação que nunca é revogada ([../architecture/contact-release.md](../architecture/contact-release.md); [trade-proposal.md](trade-proposal.md), seção 9).
- **Escopo:** regra de troca proposta de troca (`trade_proposal`).

## Referência cruzada

| Regra | Etapas do fluxo central afetadas | Ver também |
| --- | --- | --- |
| RB-001 | 7, 8 | [mvp-scope.md](mvp-scope.md), [reselection-policy.md](reselection-policy.md), [data-retention-policy.md](data-retention-policy.md) |
| RB-002 | 9, 10 | [mvp-scope.md](mvp-scope.md), [negotiation-lifecycle.md](negotiation-lifecycle.md) |
| RB-003 | 5, 6 | [../delivery/risks.md](../delivery/risks.md), [reselection-policy.md](reselection-policy.md), [interest-flow.md](interest-flow.md), [payment-exceptions.md](payment-exceptions.md) |
| RB-004 | 5 | [../delivery/risks.md](../delivery/risks.md), [reselection-policy.md](reselection-policy.md), [interest-flow.md](interest-flow.md), [payment-exceptions.md](payment-exceptions.md) |
| RB-005 | 2 | [mvp-scope.md](mvp-scope.md) |
| RB-006 | 11 | [prohibited-items.md](prohibited-items.md), [listing-lifecycle.md](listing-lifecycle.md), [../delivery/risks.md](../delivery/risks.md) |
| RB-007 | P3 | [trade-proposal.md](trade-proposal.md) |
| RB-008 | P3, P4 | [trade-proposal.md](trade-proposal.md), [../delivery/risks.md](../delivery/risks.md) |
| RB-009 | P5, P6 | [trade-proposal.md](trade-proposal.md), [payment-exceptions.md](payment-exceptions.md) |
| RB-010 | P7 | [trade-proposal.md](trade-proposal.md), [../architecture/trade-proposal-design.md](../architecture/trade-proposal-design.md) |

As etapas de RB-001 a RB-006 são as do fluxo central de [mvp-scope.md](mvp-scope.md). As de RB-007 a RB-010 são as do fluxo da proposta de troca, no mesmo documento (P1 a P10).
