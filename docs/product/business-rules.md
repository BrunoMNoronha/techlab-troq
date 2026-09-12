# Regras de negócio homologadas

Regras de negócio vigentes do TROQ. A semântica de cada regra é preservada literalmente; a coluna de implicação operacional é apenas um resumo do efeito esperado e não substitui a regra.

Observações aparecem somente quando já confirmadas. Questões derivadas que ainda não foram decididas estão em [../decisions/open-decisions.md](../decisions/open-decisions.md).

## RB-001 — Liberação de contato

- **Regra:** WhatsApp/telefone só pode ser liberado ao solicitante escolhido e com pagamento aprovado.
- **Implicação operacional:** a liberação depende de duas condições simultâneas: o solicitante foi escolhido pelo anunciante e seu pagamento está aprovado. Solicitantes não escolhidos, ou escolhidos sem pagamento aprovado, não recebem o contato.
- **Observações confirmadas:** telefone/WhatsApp é dado protegido e não pode aparecer em payload público, cache público ou logs. A liberação deve ter autorização server-side e auditoria.

## RB-002 — Avaliação

- **Regra:** avaliação somente após encerramento da negociação no sistema.
- **Implicação operacional:** nenhuma avaliação pode ser registrada enquanto a negociação não estiver encerrada no sistema.
- **Observações confirmadas:** o mecanismo de encerramento da negociação está definido em [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029): a negociação tem os estados `active` e `closed`, e qualquer uma das duas partes pode encerrá-la unilateralmente, de forma explícita, imediata e irreversível. Uma negociação `closed` satisfaz a pré-condição temporal desta regra; ela não afirma que a troca foi bem-sucedida. As regras detalhadas de avaliação estão definidas em [ratings.md](ratings.md) (DEC-030): avaliação bilateral sobre a contraparte, no máximo uma por direção, nota inteira de 1 a 5 sem texto livre, janela de 14 dias corridos, publicação cega, imutabilidade após a publicação, média simples com contagem e invalidação administrativa auditada em caso de abuso.

## RB-003 — Limite de solicitações pagas

- **Regra:** cada anúncio aceita no máximo 3 solicitações pagas.
- **Implicação operacional:** a quarta tentativa de solicitação paga para o mesmo anúncio deve ser recusada. O limite precisa ser garantido mesmo sob solicitações concorrentes.
- **Observações confirmadas:** a recomendação vigente é reserva atômica de vaga antes da cobrança, com expiração, a detalhar no design de pagamentos.

## RB-004 — Cobrança definitiva

- **Regra:** a cobrança de R$ 0,99 é definitiva, mesmo quando o solicitante não for escolhido.
- **Implicação operacional:** não há reembolso pelo fato de o solicitante não ter sido escolhido. O valor deve ser cobrado exatamente como R$ 0,99.
- **Observações confirmadas:** o tratamento de chargebacks, duplicidade e outras exceções de pagamento ainda não foi definido.

## RB-005 — Localização pública

- **Regra:** localização pública limitada a cidade/UF.
- **Implicação operacional:** nenhuma informação de localização mais precisa que cidade/UF pode ser exibida publicamente.
- **Observações confirmadas:** localização precisa não deve ser coletada nem exposta no MVP sem necessidade posteriormente documentada.

## RB-006 — Itens proibidos

- **Regra:** anúncios com itens proibidos devem ser removidos.
- **Implicação operacional:** deve existir um caminho de denúncia e moderação que resulte na remoção de anúncios com itens proibidos.
- **Observações confirmadas:** o catálogo/política de itens proibidos ainda não foi definido.

## Referência cruzada

| Regra | Etapas do fluxo central afetadas | Ver também |
| --- | --- | --- |
| RB-001 | 7, 8 | [mvp-scope.md](mvp-scope.md) |
| RB-002 | 9, 10 | [mvp-scope.md](mvp-scope.md), [negotiation-lifecycle.md](negotiation-lifecycle.md) |
| RB-003 | 5, 6 | [../delivery/risks.md](../delivery/risks.md) |
| RB-004 | 5 | [../delivery/risks.md](../delivery/risks.md) |
| RB-005 | 2 | [mvp-scope.md](mvp-scope.md) |
| RB-006 | 11 | [../delivery/risks.md](../delivery/risks.md) |
