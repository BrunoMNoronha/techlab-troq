# Regras de negócio homologadas

Regras de negócio vigentes do TROQ. A semântica de cada regra é preservada literalmente; a coluna de implicação operacional é apenas um resumo do efeito esperado e não substitui a regra.

Observações aparecem somente quando já confirmadas. Questões derivadas que ainda não foram decididas estão em [../decisions/open-decisions.md](../decisions/open-decisions.md).

## RB-001 — Liberação de contato

- **Regra:** WhatsApp/telefone só pode ser liberado ao solicitante escolhido e com pagamento aprovado.
- **Implicação operacional:** a liberação depende de duas condições simultâneas: o solicitante foi escolhido pelo anunciante e seu pagamento está aprovado. Solicitantes não escolhidos, ou escolhidos sem pagamento aprovado, não recebem o contato.
- **Observações confirmadas:** telefone/WhatsApp é dado protegido e não pode aparecer em payload público, cache público ou logs. A liberação deve ter autorização server-side e auditoria. A trilha de auditoria da liberação é retida por 24 meses e, após a exclusão da conta, não conserva telefone/WhatsApp em texto puro ([data-retention-policy.md](data-retention-policy.md), DEC-033). Uma liberação já concedida nunca é revogada, inclusive em caso de desistência e reseleção; cada nova escolha gera nova autorização independente, igualmente sujeita a esta regra ([reselection-policy.md](reselection-policy.md), DEC-032).

## RB-002 — Avaliação

- **Regra:** avaliação somente após encerramento da negociação no sistema.
- **Implicação operacional:** nenhuma avaliação pode ser registrada enquanto a negociação não estiver encerrada no sistema.
- **Observações confirmadas:** o mecanismo de encerramento da negociação está definido em [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029): a negociação tem os estados `active` e `closed`, e qualquer uma das duas partes pode encerrá-la unilateralmente, de forma explícita, imediata e irreversível. Uma negociação `closed` satisfaz a pré-condição temporal desta regra; ela não afirma que a troca foi bem-sucedida. As regras detalhadas de avaliação estão definidas em [ratings.md](ratings.md) (DEC-030): avaliação bilateral sobre a contraparte, no máximo uma por direção, nota inteira de 1 a 5 sem texto livre, janela de 14 dias corridos, publicação cega, imutabilidade após a publicação, média simples com contagem e invalidação administrativa auditada em caso de abuso.

## RB-003 — Limite de solicitações pagas

- **Regra:** cada anúncio aceita no máximo 3 solicitações pagas.
- **Implicação operacional:** a quarta tentativa de solicitação paga para o mesmo anúncio deve ser recusada. O limite precisa ser garantido mesmo sob solicitações concorrentes.
- **Observações confirmadas:** a recomendação vigente é reserva atômica de vaga antes da cobrança, com expiração, a detalhar no design de pagamentos; a janela de reserva tem piso normativo de 30 minutos e nenhuma exceção de pagamento pode produzir uma quarta solicitação paga válida, sendo o consumo de vaga fato histórico que não é devolvido por reversão posterior ([payment-exceptions.md](payment-exceptions.md), DEC-037). A demonstração de interesse é gratuita e **não** ocupa vaga ([interest-flow.md](interest-flow.md), DEC-035). A reseleção **não** cria vaga, **não** reinicia nem devolve o limite de três e **não** permite uma quarta solicitação paga; como cada solicitação paga pode ser escolhida no máximo uma vez, no máximo três pessoas são escolhidas sequencialmente no ciclo inteiro do anúncio ([reselection-policy.md](reselection-policy.md), DEC-032).

## RB-004 — Cobrança definitiva

- **Regra:** a cobrança de R$ 0,99 é definitiva, mesmo quando o solicitante não for escolhido.
- **Implicação operacional:** não há reembolso pelo fato de o solicitante não ter sido escolhido. O valor deve ser cobrado exatamente como R$ 0,99.
- **Observações confirmadas:** o tratamento das exceções de pagamento — duplicidade, pagamento acreditado após a expiração da reserva, falhas de confirmação, reembolso técnico e reversões posteriores — está definido em [payment-exceptions.md](payment-exceptions.md) (DEC-037), que fechou OD-07. Essa política preserva RB-004 literalmente e explicita sua fronteira: a cobrança é definitiva para uma **solicitação paga válida**, e a regra **não** autoriza reter dinheiro recebido por erro técnico, como cobrança duplicada, cobrança fora de reserva válida ou cobrança criada por defeito. O termo `chargeback` pertence aos arranjos de cartão e não descreve o Pix. A desistência do escolhido e a reseleção **não** geram reembolso automático nem qualquer compensação ([reselection-policy.md](reselection-policy.md), DEC-032). O valor pertence à solicitação de desbloqueio, não à demonstração de interesse, que é gratuita ([interest-flow.md](interest-flow.md), DEC-035).

## RB-005 — Localização pública

- **Regra:** localização pública limitada a cidade/UF.
- **Implicação operacional:** nenhuma informação de localização mais precisa que cidade/UF pode ser exibida publicamente.
- **Observações confirmadas:** localização precisa não deve ser coletada nem exposta no MVP sem necessidade posteriormente documentada.

## RB-006 — Itens proibidos

- **Regra:** anúncios com itens proibidos devem ser removidos.
- **Implicação operacional:** deve existir um caminho de denúncia e moderação que resulte na remoção de anúncios com itens proibidos.
- **Observações confirmadas:** o catálogo/política de itens proibidos está definido em [prohibited-items.md](prohibited-items.md) (DEC-031): catálogo por categorias PI-01 a PI-12 com fundamento `ilegal`, `regulado` ou `política`; ausência de um item na lista não o torna permitido; o MVP não oferece fluxo de autorização documental para categorias reguladas; a denúncia exige usuário autenticado e verificado e não altera o estado do anúncio; a moderação decide `procedente`, `improcedente` ou `sem_acao`; a remoção usa exclusivamente as transições administrativas de [listing-lifecycle.md](listing-lifecycle.md) e é terminal; os prazos de decisão são de 24 horas corridas na classe crítica e 5 dias úteis na comum; há reincidência progressiva e contestação administrativa sem restauração automática; a identidade do denunciante não é revelada ao anunciante.

## Referência cruzada

| Regra | Etapas do fluxo central afetadas | Ver também |
| --- | --- | --- |
| RB-001 | 7, 8 | [mvp-scope.md](mvp-scope.md), [reselection-policy.md](reselection-policy.md), [data-retention-policy.md](data-retention-policy.md) |
| RB-002 | 9, 10 | [mvp-scope.md](mvp-scope.md), [negotiation-lifecycle.md](negotiation-lifecycle.md) |
| RB-003 | 5, 6 | [../delivery/risks.md](../delivery/risks.md), [reselection-policy.md](reselection-policy.md), [interest-flow.md](interest-flow.md), [payment-exceptions.md](payment-exceptions.md) |
| RB-004 | 5 | [../delivery/risks.md](../delivery/risks.md), [reselection-policy.md](reselection-policy.md), [interest-flow.md](interest-flow.md), [payment-exceptions.md](payment-exceptions.md) |
| RB-005 | 2 | [mvp-scope.md](mvp-scope.md) |
| RB-006 | 11 | [prohibited-items.md](prohibited-items.md), [listing-lifecycle.md](listing-lifecycle.md), [../delivery/risks.md](../delivery/risks.md) |
