# Emails transacionais da Fase 3 — TROQS

Contrato do catálogo de emails transacionais dos fluxos de solicitação, pagamento e escolha. Registra **DEC-048** e reduz a lacuna de [RF-021](requirements.md) para a Fase 3. Produzido por F3-013 ([#103](https://github.com/BrunoMNoronha/techlab-troq/issues/103)).

Fontes: [requirements.md](requirements.md) (RF-021), [../architecture/contact-release.md](../architecture/contact-release.md) (CR-5, CR-6.1), [../architecture/payments-design.md](../architecture/payments-design.md) (PD-6.6, PD-6.7), [reselection-policy.md](reselection-policy.md) (DEC-032), [../architecture/overview.md](../architecture/overview.md) (AR-3.3, AR-14), [../adr/0007-observability-sentry.md](../adr/0007-observability-sentry.md) (DEC-039).

**Escopo de regra (DEC-052, 2026-10-05).** O catálogo da seção 2 (TE-1, TE-2, TE-3 e TE-6) é o da regra de troca **solicitação paga** e não foi alterado. As regras de conteúdo, envio e falha das seções 3 e 4 valem para as duas regras. O catálogo da regra **proposta de troca** ainda não existe: é decisão pendente do Bruno, a ser registrada neste documento por PT-09 ([#195](https://github.com/BrunoMNoronha/techlab-troq/issues/195)).

## 1. Escopo

Este documento define:

- quais emails a Fase 3 envia, a quem e por qual transição;
- o que um email pode e não pode conter;
- quando o envio acontece e como ele não se repete;
- o que acontece quando o envio falha.

Este documento **não** define:

| Assunto | Onde permanece |
| --- | --- |
| Email de verificação de conta | [../architecture/identity-contract.md](../architecture/identity-contract.md), IC-9 (DEC-015) |
| Emails de encerramento de negociação, avaliação e moderação | Fase 4 ([#55](https://github.com/BrunoMNoronha/techlab-troq/issues/55)), no design de cada fluxo |
| Avisos recusados ou adiados | Seção 5 |
| Telas e textos de interface | F3-012 ([#102](https://github.com/BrunoMNoronha/techlab-troq/issues/102)) |

## 2. Catálogo

| ID | Transição que dispara | Destinatário | Assunto | Link | Justificativa no fluxo |
| --- | --- | --- | --- | --- | --- |
| **TE-1** | Solicitação `reserved` → `paid` com a tentativa em `pagamento_confirmado` (PD-6.6, passo 4) | Quem pagou | "TROQS: pagamento da sua solicitação confirmado" | `/explorar/<anúncio>` | O Pix é pago fora do TROQS e a confirmação pode chegar minutos depois, inclusive pela reconciliação (PE-4.2, PE-6.6). Sem aviso, quem pagou não sabe que a solicitação entrou na lista do anunciante |
| **TE-2** | A mesma transição de TE-1 | O anunciante dono do anúncio | "TROQS: nova solicitação paga em um anúncio seu" | `/anuncios` | A escolha (RF-013) depende de o anunciante saber que existe solicitação paga elegível. Sem aviso, a vaga consumida fica parada |
| **TE-3** | Escolha ou reseleção que grava `Selection`, `Negotiation` `active` e `ContactRelease` (CR-3.3, DEC-032) | A pessoa escolhida | "TROQS: o anunciante escolheu você e liberou o contato" | `/contatos` | A liberação é o produto pago (RB-001). Quem foi escolhido precisa saber que o contato está disponível — e onde, porque ele não vai por email |
| **TE-6** | `TechnicalRefund` → `concluido` (RT-1 a RT-4; PD-8), gravado pela execução que recebeu a devolução do provedor | Quem pagou | "TROQS: devolvemos um pagamento seu" | `/explorar/<anúncio>` | Decisão do Bruno em 2026-10-04 (seção 5). Quem pagou e não recebeu o que pagou precisa saber que o dinheiro voltou. O texto não diz a causa técnica nem o valor, e vale igualmente para duplicidade, fora da janela e sem vaga |

Uma transição que não está na tabela **não** envia email. Acrescentar uma linha é decisão registrada neste documento, com a transição e a justificativa no fluxo.

## 3. Conteúdo

**TE-4.1 (normativa).** Um email transacional contém **somente** texto fixo do TROQS, a origem pública do ambiente (`BETTER_AUTH_URL`, a mesma regra de URL base de IC-12.3) e identificadores internos usados no link. **Nenhum** texto escrito por pessoa usuária entra no email: título, descrição e alternativas de troca do anúncio, nome de exibição de qualquer pessoa.

Por quê: esses textos são livres. Desde DEC-049 ([#86](https://github.com/BrunoMNoronha/techlab-troq/issues/86)), título, descrição e alternativas recusam contato e endereço, mas essa recusa é um filtro, que pode deixar passar uma forma não prevista, e o texto gravado antes dela só é mascarado na exibição, não corrigido no banco; o nome de exibição continua livre. Excluir o texto da pessoa torna CR-6.1 uma propriedade estrutural do template, e não um filtro que pode falhar.

**TE-4.2 (normativa).** O contato liberado **nunca** vai por email, nem para quem foi escolhido (CR-6.1, [contact-release.md](../architecture/contact-release.md), seção 11, alternativa rejeitada). TE-3 manda a pessoa a `/contatos`, onde a entrega passa por A1 a A6 e é auditada (CR-5).

**TE-4.3 (normativa).** O endereço de email do destinatário é lido por `identity`, dono dele (AR-3.3). Os outros módulos pedem o aviso por **tipo** e destinatário por **id interno**, e nunca veem o endereço.

**TE-4.4 (normativa).** Conta que não está `active` com email verificado não recebe aviso. Isso inclui conta bloqueada e conta com exclusão solicitada.

## 4. Envio, idempotência e falha

**TE-5.1 (decisão técnica).** O envio acontece **depois do COMMIT** da transição, fora da transação e fora da trava do anúncio, e **somente** pela chamada que efetuou a transição. Um email nunca sai de transação que depois é desfeita.

**TE-5.2 (decisão técnica).** Reprocessar a mesma transição **não** reenvia. A garantia primária é do banco: toda transição é `UPDATE` condicionado ao estado de origem (PD-5.4) e só uma chamada a efetua; as outras — notificação duplicada, fora de ordem, reconciliação depois do webhook, escolha repetida — recebem `already_confirmed` ou `changed: false` e não chamam o envio. A segunda camada é a chave de idempotência do Resend, `troq-notice/<tipo>/<id da transição>`, que absorve retentativa HTTP e corrida residual.

**TE-5.3 (decisão técnica).** O envio é **melhor esforço**: nunca lança, nunca desfaz a transição e não tem retentativa automática. O aviso informa um estado que já está persistido e visível na conta (`/explorar/<anúncio>`, `/anuncios`, `/contatos`); a perda de um email não perde direito, vaga nem dinheiro. Uma fila persistida de emails exigiria migration e trabalho periódico novo sem regra que a peça — fica como evolução se a operação mostrar perda relevante.

**TE-5.4 (decisão técnica).** Falha de envio vira o sinal `email.delivery_failed` no Sentry, com o tipo do aviso e o motivo codificado, **sem** endereço, assunto ou corpo (ADR-0007, decisão 5). Destinatário indisponível (TE-4.4) é só log; configuração ausente, recusa e exceção do provedor são alerta.

**TE-5.5 (decisão técnica).** Destinatário em domínio reservado (RFC 2606 e RFC 6761: `.test`, `.invalid`, `.example`, `.localhost`, `example.com`, `example.net`, `example.org`) nunca chega ao provedor. Os dados sintéticos dos testes usam esses domínios, e um servidor de teste com chave de desenvolvimento não manda email a endereço inexistente.

## 5. Decisões de produto sobre avisos candidatos

Três avisos plausíveis dependiam de escolha de produto. O Bruno decidiu em 2026-10-04:

| Candidato | Transição | Decisão |
| --- | --- | --- |
| Reembolso técnico concluído | `TechnicalRefund` → `concluido` (RT-1 a RT-4) | **Avisar**: virou TE-6, sem a causa técnica |
| Reserva expirada sem pagamento | `reserved` → `expired`/`failed` | **Não avisar**: a pessoa não pagou, e o aviso seria ruído. Ela pode solicitar de novo se houver vaga |
| Solicitação paga não escolhida | Escolha de outra pessoa no mesmo anúncio | **Não avisar agora**: pela reseleção (DEC-032) a pessoa ainda pode ser escolhida, e "não foi escolhido" seria enganoso. Revisitar na Fase 4, com o encerramento |
| Negociação anterior encerrada na reseleção | Reseleção | Fase 4: o encerramento é de [#55](https://github.com/BrunoMNoronha/techlab-troq/issues/55) |

## 6. Rastreabilidade

- **Registra:** DEC-048 em [../decisions/decision-log.md](../decisions/decision-log.md).
- **Implementação:** `src/modules/identity/notifications.ts` (catálogo e templates), `src/modules/identity/email-transport.ts` (transporte), chamadas em `src/modules/request/payment-confirmation.ts` (TE-1, TE-2), `src/modules/negotiation/selection.ts` (TE-3) e `src/modules/payments/refund.ts` (TE-6).
- **Provas:** testes unitários de template e transporte; integração sobre PostgreSQL efêmero com transporte simulado, inclusive T-3 (cinco notificações simultâneas, um aviso de cada tipo), T-4 (reentrega e reconciliação depois da confirmação, sem reenvio) C-9 (N escolhas concorrentes, um aviso) e T-7/T-16 (um TE-6 por devolução, nenhum enquanto o reembolso falha, nenhum na reexecução já concluída).
- **Não altera:** nenhuma regra de negócio, RB-001 a RB-006, DEC-015, DEC-032 ou DEC-037.
