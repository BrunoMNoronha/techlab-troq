# ADR-0008 — Instante de acreditação lido da Payments API, só para leitura

## Status

Aceito — Fase 3 (2026-10-01). Fecha **OD-16** e é registrada como **DEC-043** em [../decisions/decision-log.md](../decisions/decision-log.md). Decisão do Bruno (opção 1 de OD-16), validada no sandbox do Mercado Pago com a credencial de teste PX-2 em 2026-10-01.

Complementa [ADR-0004](0004-mercado-pago-pix.md), decisão 3, sem substituí-la: a Orders API continua sendo a superfície principal do fluxo.

## Contexto

A tempestividade do pagamento compara o **instante de acreditação autoritativo** com o fim da reserva (PE-4.1, PE-4.2, CI-4; [../architecture/data-model.md](../architecture/data-model.md), DM-7.5; [../architecture/payments-design.md](../architecture/payments-design.md), PD-6.6 passo 4 e PD-6.7). F3-004 ([#94](https://github.com/BrunoMNoronha/techlab-troq/issues/94)) verificou que a Orders API não documenta esse instante no pagamento da order, e o adaptador passou a devolver `accreditedAt = null`. Sem fonte, a #96 não consegue confirmar nenhum pagamento.

ADR-0004, decisão 3, exige ADR própria para usar a Payments API (`/v1/payments`) como superfície principal. Esta ADR **não** faz isso: autoriza uma leitura pontual e delimitada.

## Evidência (sandbox, 2026-10-01)

Credencial de teste automática de uma aplicação nova de Checkout Transparente com Orders ("TROQ Sandbox", criada no painel do Bruno). Duas execuções independentes, cada uma com uma order Pix de R$ 0,99 criada pelo mesmo corpo do adaptador:

| Consulta | Resultado nas duas execuções |
| --- | --- |
| `POST /v1/orders` | `201`; a credencial de teste automática é aceita pela Orders API |
| `transactions.payments[0]` da order | Campos `amount`, `date_of_expiration`, `expiration_time`, `id` (`PAY01…`), `payment_method`, `reference_id`, `status`, `status_detail` e, depois da acreditação, `paid_amount`. **Nenhum campo de aprovação ou acreditação** |
| `GET /v1/payments/{PAY01…}` | `404` |
| `GET /v1/payments/{reference_id}` | `404` |
| `GET /v1/payments/{id numérico da ticket_url}` | `200`, `status = approved`, `status_detail = accredited`, `date_approved` preenchida, `external_reference` igual à da order, `transaction_amount = 0.99` |
| `GET /v1/payments/search?external_reference=<da order>` | `200`, exatamente um resultado: o mesmo pagamento, com a mesma `date_approved`. Funciona **antes e depois** da acreditação |
| `ticket_url` da order depois da acreditação | Ausente (confirma o spike F0-010, experimento 4) |
| `last_updated_date` da order × `date_approved` | A order foi atualizada 3 a 4 s **depois** da aprovação: `last_updated_date` não é o instante de acreditação |

A referência da API de `GET /v1/orders/{id}` ainda cita `invalid_credentials` para credencial de teste. Para aplicações novas, a evidência acima e a [notícia oficial de 2025-11-19](https://www.mercadopago.com.br/developers/pt/news/2025/11/19/Streamlined-integration-testing-with-automatic-credentials) prevalecem.

## Alternativas consideradas

| Alternativa | Desfecho | Motivo |
| --- | --- | --- |
| **A** — `GET /v1/payments/search?external_reference=…` | **Adotada** | Usa o identificador que o TROQ já controla e persiste (`external_reference` única por tentativa, `troq-pa-<id>`); funciona depois que a `ticket_url` some; não exige extrair nada de URL |
| **B** — `GET /v1/payments/{id}` com o id numérico extraído da `ticket_url` | Rejeitada | Depende do formato de uma URL de apresentação, não de campo de contrato; a `ticket_url` some depois da acreditação, então o id teria de ser extraído e persistido na criação, e uma cobrança retomada depois da acreditação não o teria |
| **C** — `GET /v1/payments/{id}` com `PAY01…` ou `reference_id` | Rejeitada | `404` nas duas execuções |
| **D** — campo não documentado da order (opção 2 de OD-16) | Rejeitada | Não existe: a order não traz campo de aprovação |
| **E** — primeiro instante em que o TROQ observou a acreditação (opção 3 de OD-16) | Rejeitada | Alteraria o efeito de PE-4.2; desnecessária, porque a fonte autoritativa existe |

## Decisão

1. **A Orders API continua sendo a superfície principal** (ADR-0004, decisão 3): criar, consultar, cancelar e reembolsar a cobrança, e classificar o estado autoritativo (PD-6.6, passo 3), seguem em `/v1/orders`.
2. **A Payments API é usada só para leitura, só para o instante de acreditação**, por `GET /v1/payments/search?external_reference=<externalReference da tentativa>`. Nenhuma escrita, cancelamento, reembolso ou classificação de estado sai dela.
3. **O instante de acreditação autoritativo** é a `date_approved` do pagamento encontrado, e só vale quando, ao mesmo tempo:
   - a order está acreditada pela classificação de PD-6.6 (`processed`/`accredited` na order e na transação Pix);
   - o pagamento tem `status = approved`, `status_detail = accredited`, `external_reference` igual à da tentativa, valor igual ao da cobrança e `date_approved` presente e interpretável.

   O valor é usado como o provedor o reporta, com a precisão e o fuso que ele declara. O TROQ não o refina, não o arredonda e não o substitui por `last_updated_date`, pelo instante de chegada da notificação nem pelo de processamento (PD-6.7).
4. **Falhas e divergências nunca viram aprovação:**
   - consulta indisponível, erro `5xx`, tempo esgotado ou **nenhum resultado** com a order já acreditada: a tentativa fica pendente e sob reconciliação (PD-6.9), porque a busca pode ter atraso de indexação;
   - resultado que contradiz a order (pagamento não aprovado, `external_reference` ou valor divergentes, `date_approved` ausente ou ilegível): `inconsistente`, sem eleição por analogia (PE-1.5, CI-9);
   - mais de um pagamento aprovado para a mesma `external_reference`: segue para o tratamento de duplicidade (PD-7; F3-007), sem escolher um sozinho.
5. **Adaptador.** A leitura vive no adaptador do Mercado Pago (`src/modules/payments/mercado-pago/`), devolvendo ao domínio só o fato traduzido (ADR-0004, decisão 10; PD-11.5). A mesma credencial, o mesmo tempo limite e a mesma regra de falha fechada valem para as duas APIs.
6. **Revalidação obrigatória** antes de operar com credenciais de produção, porque o comportamento observado é de sandbox. A ADR é revista se a busca, a semântica de `date_approved` ou o formato do vínculo por `external_reference` mudarem.

## Consequências

- A #96 (F3-006) pode implementar a transação de efeito com tempestividade (T-2, T-6, T-10), e T-5 a T-8 deixam de estar bloqueados por fonte.
- Cada confirmação faz uma consulta a mais (`/v1/orders/{id}` e a busca), dentro do orçamento de tempo do receptor (PD-6.3, PD-6.4).
- O provedor simulado dos testes precisa responder também à busca por `external_reference`, com os casos: ausente, aprovado, divergente e múltiplo.
- `external_reference` passa a ser também chave de leitura; ela já é única por tentativa e não carrega dado pessoal (PD-5).

## Riscos

| Risco | Tratamento |
| --- | --- |
| Precisão de segundo em `date_approved`: um pagamento aprovado no último segundo da janela pode ser reportado como dentro dela | Aceito: o instante autoritativo é o do provedor (decisão 3); o efeito é a favor de quem pagou e se limita a menos de 1 s |
| Atraso de indexação da busca | Tratado como indisponibilidade, nunca como recusa (decisão 4); a reconciliação reconsulta |
| Comportamento diferente em produção | Revalidação obrigatória (decisão 6) |
| Divergência entre a referência da API e a notícia de 2025-11-19 sobre credenciais de teste | Registrada; a credencial de PX-2 foi provada na prática |

## Rastreabilidade

- **Fecha:** OD-16 em [../decisions/open-decisions.md](../decisions/open-decisions.md).
- **Registra:** DEC-043 em [../decisions/decision-log.md](../decisions/decision-log.md).
- **Complementa:** [ADR-0004](0004-mercado-pago-pix.md), decisão 3.
- **Aplica-se a:** PD-6.6 e PD-6.7 em [../architecture/payments-design.md](../architecture/payments-design.md); DM-7.5 em [../architecture/data-model.md](../architecture/data-model.md); PE-4.1 e PE-4.2 e CI-4 em [../product/payment-exceptions.md](../product/payment-exceptions.md).
- **Implementação:** [#96](https://github.com/BrunoMNoronha/techlab-troq/issues/96) (F3-006).
