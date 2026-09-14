# Política de retenção e exclusão de dados — TROQ

Documento normativo que fecha [OD-10](../decisions/open-decisions.md) e registra DEC-033. Define prazos de retenção, exclusão de conta, anonimização e retenção das trilhas de auditoria.

Fontes: [business-rules.md](business-rules.md) (RB-001, RB-005), [image-policy.md](image-policy.md) (DEC-028), [listing-lifecycle.md](listing-lifecycle.md) (DEC-027), [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029), [ratings.md](ratings.md) (DEC-030), [prohibited-items.md](prohibited-items.md) (DEC-031), [requirements.md](requirements.md) (RF-006, RF-020, RF-022, RF-023, RNF-008, RNF-009, RNF-011), [../delivery/risks.md](../delivery/risks.md) (R-03, R-06).

## 1. Princípio — minimização de dados

O TROQ coleta e conserva o mínimo necessário para operar, e conserva cada dado apenas enquanto a finalidade que o justificou permanecer válida. Quando a finalidade se esgota, o dado é eliminado ou anonimizado irreversivelmente.

Não existe retenção indefinida genérica. Todo prazo abaixo é expresso, e toda exceção precisa de fundamento registrado (seção 9).

Este documento **não** substitui a política de privacidade nem os termos de uso, que serão escritos na Fase 5 ([roadmap](../delivery/roadmap.md)). Ele fixa os prazos e os efeitos que o produto deve implementar.

## 2. Categorias de dado

A retenção é decidida por categoria, nunca por tabela ou por arquivo.

| Categoria | O que é | Prazo de referência | Seção |
| --- | --- | --- | --- |
| Operacional | Dado necessário para a operação corrente do produto: conta, perfil, anúncio, solicitação, negociação | Enquanto a finalidade existir; até 30 dias após a exclusão da conta | 3 |
| Público | Dado exposto na superfície pública: anúncio `published`, derivados de imagem, cidade/UF, reputação agregada | Enquanto o anúncio estiver `published` e a conta ativa; retirada imediata na exclusão | 3, 4 |
| Auditoria | Trilha imutável de operações críticas (RF-022) | 24 meses; ver seção 6 para liberação de contato | 6 |
| Segurança e abuso | Denúncia, moderação, sanção, reincidência, contestação, incidente | 24 meses após o encerramento do caso | 7 |
| Pagamento | Metadados financeiros mínimos da transação | 5 anos após a transação | 8 |
| Log de acesso | Registro de acesso à aplicação | 6 meses | 5 |
| Backup | Cópia para recuperação de desastre | Ciclo normal de expiração, no máximo 30 dias adicionais | 10 |
| Obrigação legal | Conjunto mínimo sob legal hold | Enquanto durar o fundamento | 9 |

Telefone/WhatsApp permanece dado protegido em todas as categorias (DEC-023): nunca em payload público, cache público ou logs, e nunca em texto claro fora da própria liberação autorizada.

## 3. Exclusão de conta

O usuário pode solicitar a exclusão da conta e de seus dados pessoais (RF-023).

### 3.1 Efeitos imediatos

A partir do aceite da solicitação, sem espera:

- novos logins são impedidos;
- as sessões são invalidadas quando tecnicamente aplicável;
- o perfil e o conteúdo saem da exposição pública;
- novas operações de produto em nome da conta são impedidas (publicar, demonstrar interesse, solicitar desbloqueio, pagar, escolher, reselecionar, avaliar, denunciar);
- os anúncios deixam de estar publicamente disponíveis.

A saída da exposição pública **não** é exclusão física: é interrupção imediata da superfície pública, inclusive caches, coerente com o tratamento já definido em DEC-027 e DEC-028.

### 3.2 Efeitos em até 30 dias

Dentro de 30 dias corridos da solicitação, e quando não houver outra base legítima de retenção (seções 5 a 9), são eliminados ou anonimizados:

- nome;
- email;
- telefone/WhatsApp;
- informações de perfil;
- conteúdo pessoal desnecessário;
- anúncios;
- derivados de imagens;
- dados operacionais que perderam sua finalidade.

### 3.3 O que a exclusão não apaga

A exclusão **não** apaga fatos cuja conservação seja necessária para:

- obrigação legal;
- prevenção ou investigação de abuso;
- segurança;
- defesa de direitos;
- auditoria;
- registros financeiros mínimos.

Nesses casos conserva-se o **conjunto mínimo** que cumpre a finalidade, pseudonimizado sempre que o identificador interno for suficiente. Conservar um fato nunca autoriza conservar o dado pessoal inteiro que o acompanhava.

### 3.4 Efeito sobre a contraparte

A exclusão da conta de um participante não apaga a negociação, a escolha nem a liberação já ocorrida, que são fatos históricos imutáveis (DEC-029, [reselection-policy.md](reselection-policy.md) seção 3). O que se elimina é o dado pessoal identificável, na medida da seção 3.2, preservando-se a integridade das trilhas conforme a seção 6.

As avaliações publicadas permanecem válidas na média da contraparte (DEC-030), já que não são vinculadas publicamente ao avaliador nem à negociação.

## 4. Imagens

A regra de original temporário permanece exatamente como definida em [image-policy.md](image-policy.md) (DEC-028): o original nunca é público, é descartado após o processamento e a área temporária é limpa em **no máximo 24 horas**. Este documento não altera esse prazo.

Após a exclusão da conta ou o expurgo definitivo do anúncio:

- as imagens deixam de ser públicas **imediatamente**;
- os objetos persistentes — `thumb`, `medium`, `large` e o que mais houver sido derivado — são removidos em **até 30 dias**, quando não houver retenção legitimamente necessária.

A retenção legitimamente necessária inclui, notadamente, imagem que seja evidência de caso de moderação em aberto ou de item proibido (seção 7) ou que esteja sob legal hold (seção 9). Nesses casos a imagem deixa de ser pública na mesma hora e é conservada fora da superfície pública, pelo prazo da finalidade correspondente.

Isso fecha a lacuna que [image-policy.md](image-policy.md) deixou expressamente aberta para OD-10.

## 5. Logs de acesso à aplicação

Os registros de acesso à aplicação são retidos por **6 meses**, quando a obrigação correspondente do Marco Civil da Internet for aplicável.

Findo o período, os registros são:

- eliminados; ou
- anonimizados irreversivelmente, quando houver finalidade estatística legítima.

Logs de acesso **nunca** contêm telefone/WhatsApp (DEC-023, RNF-018).

## 6. Auditoria de liberação de contato

A trilha de auditoria da liberação de contato é retida por **24 meses a partir da liberação**.

Preservam-se somente os campos necessários para comprovar:

- quem realizou a ação;
- qual solicitação foi escolhida;
- qual anúncio estava envolvido;
- o instante;
- a autorização;
- o resultado.

Após a exclusão da conta:

- **não** se mantém telefone/WhatsApp em texto puro na auditoria;
- usam-se identificadores internos, pseudonimizados ou equivalentes, sempre que suficientes para a finalidade probatória.

A trilha continua imutável e não editável (RNF-011). Reter por prazo definido não é o mesmo que permitir edição: nada nesta política autoriza alterar um registro de auditoria; autoriza apenas eliminá-lo ou pseudonimizá-lo ao fim do prazo, de forma registrada.

As demais trilhas de RF-022 — escolha e reseleção, aprovação de pagamento, encerramento da negociação (DEC-029), invalidação administrativa de avaliação (DEC-030) — seguem o mesmo prazo de 24 meses a partir do evento, salvo quando a seção 7 ou a seção 8 impuser prazo superior ao caso concreto.

## 7. Moderação, segurança e abuso

Os registros necessários para denúncia, moderação, reincidência, bloqueio, contestação e incidente de segurança podem ser mantidos por **24 meses após o encerramento do caso**, salvo necessidade legal superior.

Mantêm-se somente os dados estritamente necessários à finalidade. O prazo conta do encerramento do caso, não do fato: uma contestação decidida (DEC-031) encerra o caso e inicia a contagem.

A identidade do denunciante permanece confidencial durante e após a retenção (DEC-031): a conservação do registro nunca autoriza revelá-la ao anunciante nem expô-la publicamente.

A progressão de reincidência de DEC-031 — advertência, restrição de 7 dias, bloqueio administrativo — depende do histórico conservado nesta seção. Expirado o prazo, o histórico correspondente deixa de existir e deixa de contar para reincidência.

## 8. Pagamentos

Os metadados financeiros mínimos relacionados às transações são preservados por **5 anos após a transação**, como baseline conservador para obrigações financeiras, contábeis, fiscais e defesa de direitos.

Essa retenção **não** justifica conservar desnecessariamente:

- telefone;
- WhatsApp;
- descrição de anúncio;
- imagens;
- conteúdo pessoal não relacionado.

O período e o conjunto mínimo de registros financeiros **deverão ser revisados por responsável jurídico e contábil antes da produção comercial**. Esta política fixa um baseline operacional para o MVP, não um parecer jurídico.

Os dados mantidos pelo próprio gateway seguem também as obrigações e políticas do controlador ou operador correspondente. Este documento **não** pressupõe o comportamento de um provedor específico, nem antes nem depois da homologação do gateway em [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036): a retenção definida aqui é do TROQ, e o que o gateway retém por conta própria segue a política dele.

## 9. Legal hold

Obrigação legal, ordem judicial ou necessidade documentada de defesa de direitos pode suspender a eliminação de um **conjunto mínimo** de dados.

Toda exceção precisa registrar:

- fundamento;
- escopo;
- início;
- responsável;
- condição de encerramento.

Cessada a condição de encerramento, o dado volta ao prazo normal desta política e é eliminado ou anonimizado. **Não existe retenção indefinida genérica.**

## 10. Backups

Dados removidos do armazenamento ativo podem permanecer temporariamente em backup, apenas até o ciclo normal de expiração do backup.

Baseline do MVP: **máximo de 30 dias adicionais** além da eliminação no armazenamento ativo.

Backups:

- **não** voltam ao uso normal;
- **não** são pesquisáveis para finalidade comum;
- somente são usados para recuperação de desastre;
- se restaurados, as exclusões pendentes devem ser reaplicadas ao conjunto restaurado.

A reaplicação das exclusões após uma restauração é parte obrigatória do procedimento de recuperação, não uma tarefa opcional posterior.

## 11. Quadro-resumo de prazos

| Dado | Gatilho | Prazo |
| --- | --- | --- |
| Exposição pública (perfil, anúncios, imagens) | Solicitação de exclusão de conta | Imediato |
| Sessão e login | Solicitação de exclusão de conta | Imediato |
| Dados pessoais e operacionais da conta | Solicitação de exclusão de conta | Até 30 dias |
| Original de imagem na área temporária | Upload | Máximo 24 horas (DEC-028, inalterado) |
| Derivados de imagem persistidos | Exclusão de conta ou expurgo do anúncio | Até 30 dias |
| Log de acesso à aplicação | Registro do acesso | 6 meses |
| Auditoria de liberação de contato | Liberação | 24 meses |
| Demais trilhas de RF-022 | Evento auditado | 24 meses |
| Moderação, segurança e abuso | Encerramento do caso | 24 meses |
| Metadados financeiros mínimos | Transação | 5 anos |
| Backup | Eliminação no ativo | Ciclo normal, máximo +30 dias |
| Qualquer categoria sob legal hold | Fundamento registrado | Enquanto durar o fundamento |

## 12. Alternativas rejeitadas

| Alternativa | Decisão | Razão |
| --- | --- | --- |
| Exclusão física imediata e total na solicitação | **Rejeitada** | Inviabilizaria auditoria, defesa de direitos, obrigações financeiras e apuração de abuso; e é impossível de garantir em backup |
| Retenção indefinida "por segurança" | **Rejeitada** | Contraria a minimização (RNF-008) e a LGPD (RNF-009); é o oposto de política de retenção |
| Prazo único para todas as categorias | **Rejeitada** | Categorias têm finalidades e obrigações distintas; um prazo único seria excessivo para umas e insuficiente para outras |
| Manter telefone/WhatsApp em texto puro na auditoria após a exclusão | **Rejeitada** | Contraria DEC-023 e R-03; identificadores internos cumprem a finalidade probatória |
| Editar ou corrigir registros de auditoria em vez de expirá-los | **Rejeitada** | A trilha é imutável por RNF-011; expiração registrada não é edição |
| Fixar prazo financeiro sem revisão jurídica posterior | **Rejeitada** | O baseline de 5 anos é conservador e operacional; a definição final exige responsável jurídico e contábil |
| Excluir avaliações publicadas da contraparte junto com a conta | **Rejeitada** | A reputação da contraparte não é dado pessoal do excluído; DEC-030 já desvincula publicamente a nota do avaliador |

## 13. Rastreabilidade

| Item | Efeito desta decisão |
| --- | --- |
| RF-023 | Deixa de estar `bloqueado por decisão aberta` e passa a `definido`. Efeitos imediatos e prazo de 30 dias definidos na seção 3 |
| RF-006 | Passa a `definido`. O expurgo dos derivados persistidos, única lacuna que restava, está na seção 4 |
| RF-020 | Permanece `definido`. A retenção e o expurgo do anúncio `removed` seguem as seções 4 e 7; o tratamento financeiro de exceção continua em OD-07 |
| RF-022 | A retenção das trilhas está definida na seção 6. O requisito permanece `parcialmente definido` porque a extensão à aprovação de pagamento continua dependendo do design de pagamentos (OD-07) |
| RNF-009 | Passa a `definido`. Retenção, exclusão e transparência definidas aqui; elegibilidade etária definida em [age-eligibility.md](age-eligibility.md) (DEC-034) |
| RNF-011 | Passa a `definido`. Trilha imutável com prazo expresso de 24 meses |
| RNF-008 | Preservado e reforçado. A minimização passa a ter prazos verificáveis |
| DEC-028 | Preservada integralmente. O prazo de 24 horas da área temporária é mantido sem alteração |
| DEC-027, DEC-029, DEC-030, DEC-031 | Preservadas integralmente. Nenhum fato histórico é reescrito; apenas dados pessoais são eliminados ou pseudonimizados ao fim dos prazos |
| RB-001 a RB-006 | Preservadas literalmente |
| R-03, R-06 | Mitigados: contato protegido com prazo expresso; retenção e exclusão definidas antes de coletar dados reais |
| OD-10 | **Fechada** por este documento (DEC-033) |
| OD-07 | Permanece aberta. Nada aqui antecipa exceções financeiras. OD-08 foi fechada depois por [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036) |
