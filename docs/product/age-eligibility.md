# Elegibilidade etária — TROQ

Documento normativo que fecha [OD-11](../decisions/open-decisions.md) e registra DEC-034. Define a idade mínima do MVP e a forma de declaração.

Fontes: [mvp-scope.md](mvp-scope.md) (DEC-024, público-alvo), [requirements.md](requirements.md) (RF-001, RNF-008, RNF-009), [prohibited-items.md](prohibited-items.md) (DEC-031), [data-retention-policy.md](data-retention-policy.md) (DEC-033).

## 1. Decisão

**O MVP do TROQ é destinado exclusivamente a pessoas com 18 anos completos ou mais.**

## 2. Natureza desta decisão

Esta é uma **decisão conservadora de escopo do TROQ para o MVP**. Ela existe para:

- reduzir complexidade regulatória;
- evitar tratamento desnecessário de dados de crianças e adolescentes;
- alinhar o produto ao público-alvo adulto já definido em DEC-024;
- reduzir risco operacional.

Este documento **não** afirma que a legislação brasileira proíbe menores de idade em um produto deste tipo. A restrição é uma escolha de produto, não uma afirmação jurídica. Qualquer texto futuro de termos de uso deve preservar essa distinção.

A distinção que [mvp-scope.md](mvp-scope.md) já fazia permanece válida em outro sentido: o intervalo "18 a 50 anos" continua descrevendo **público-alvo**, e não regra de cadastro. A regra de cadastro é apenas o piso de 18 anos fixado aqui; não há teto de idade, e 50 anos nunca foi e não se torna limite de nada.

## 3. Cadastro

No cadastro (RF-001), o usuário faz uma declaração explícita:

> Declaro que tenho 18 anos completos ou mais.

A declaração é um ato afirmativo próprio, não uma caixa pré-marcada e não uma cláusula presumida por uso do produto.

Registram-se:

- a aceitação;
- o timestamp;
- a versão dos termos aplicáveis.

Esse registro é o que comprova a declaração. Ele é dado operacional para efeito de [data-retention-policy.md](data-retention-policy.md) e acompanha a conta.

## 4. Minimização — o que não é coletado

No MVP, **não** se coleta, apenas para comprovação etária:

- data de nascimento;
- RG;
- CPF;
- CNH;
- selfie;
- documento de identidade;
- biometria.

**Não** se introduz serviço externo de verificação etária.

A elegibilidade é baseada em **declaração contratual**, coerente com RNF-008 (minimização) e com a decisão estruturante de DEC-031 de que o MVP não implementa fluxo de autorização documental.

Se algum desses dados vier a ser coletado no futuro por outra finalidade legítima e documentada, isso será decisão própria e registrada; comprovação etária, isoladamente, não a justifica.

## 5. Evidência razoável de menoridade

Havendo evidência razoável de que uma conta pertence a pessoa menor de 18 anos, o sistema:

- impede operações;
- bloqueia temporariamente a conta;
- não permite pagamento;
- não permite publicação;
- não permite solicitação de desbloqueio;
- não libera contato.

O procedimento administrativo detalhado — quem analisa, como o titular se manifesta, prazos e desfecho — pode ser definido posteriormente. O que **não** é admissível é o sistema continuar operando normalmente para uma conta com evidência razoável de inelegibilidade etária.

O bloqueio desta seção é **preventivo e cautelar**, distinto das sanções de [prohibited-items.md](prohibited-items.md) (DEC-031): não decorre de denúncia de item proibido, não conta para a reincidência progressiva daquele documento e não é remoção de anúncio.

### 5.1 Efeitos sobre o que já ocorreu

O bloqueio preventivo é olhando para a frente. Ele **não**:

- revoga liberação de contato já autorizada e auditada;
- cria reembolso, estorno ou compensação — RB-004 permanece integralmente válida, e as exceções financeiras foram definidas depois em [payment-exceptions.md](payment-exceptions.md) (DEC-037), que também **não** cria reembolso por bloqueio cautelar etário;
- altera o estado do anúncio por si só; a remoção, se cabível, usa exclusivamente as transições administrativas de [listing-lifecycle.md](listing-lifecycle.md);
- encerra negociação por conta própria — o encerramento continua exclusivo das partes (DEC-029).

Se a conta bloqueada for excluída, a exclusão segue integralmente [data-retention-policy.md](data-retention-policy.md) (DEC-033).

## 6. Alternativas rejeitadas

| Alternativa | Decisão | Razão |
| --- | --- | --- |
| Não definir idade mínima no MVP | **Rejeitada** | Deixaria RF-001 e RNF-009 permanentemente ambíguos e exporia o produto ao tratamento de dados de crianças e adolescentes sem base definida |
| Coletar data de nascimento no cadastro | **Rejeitada** | É dado pessoal adicional sem ganho real de garantia — uma data declarada não é mais verificável que uma declaração — e contraria RNF-008 |
| Exigir documento, selfie ou biometria | **Rejeitada** | Custo, atrito e risco de dados sensíveis desproporcionais para um MVP; coerente com a ausência de fluxo documental de DEC-031 |
| Contratar serviço externo de verificação etária | **Rejeitada** | Dependência externa, custo recorrente e compartilhamento de dados pessoais incompatíveis com o estágio do produto (R-08) |
| Usar o intervalo 18–50 de DEC-024 como regra de cadastro | **Rejeitada** | O intervalo descreve público-alvo; transformá-lo em regra criaria um teto de idade arbitrário e excludente |
| Permitir menores com consentimento de responsável | **Rejeitada** | Exigiria verificação de vínculo, tratamento de dados de terceiros e regime jurídico próprio, fora do escopo do MVP |
| Ignorar evidência de menoridade até haver procedimento formal | **Rejeitada** | Manteria o produto operando para conta sabidamente inelegível; o bloqueio cautelar não depende do procedimento detalhado |

## 7. Rastreabilidade

| Item | Efeito desta decisão |
| --- | --- |
| RF-001 | Passa a `definido`. O cadastro exige declaração explícita de 18 anos completos ou mais, registrada com instante e versão dos termos |
| RNF-009 | Contribui para passar a `definido`, em conjunto com [data-retention-policy.md](data-retention-policy.md) (DEC-033) |
| RNF-008 | Preservado e reforçado. Nenhum dado novo é coletado para comprovação etária |
| DEC-024 | Preservada. O público-alvo de 18 a 50 anos continua sendo perfil, não regra; a regra é apenas o piso de 18 anos |
| DEC-031 | Preservada integralmente. A ausência de verificação de idade que aquele documento registrava passa a ter uma decisão correspondente: a elegibilidade é declaratória, e as categorias que exigiriam controle etário continuam proibidas |
| RB-001 a RB-006 | Preservadas literalmente |
| OD-11 | **Fechada** por este documento (DEC-034) |
| OD-07 | Nada aqui a antecipou; foi fechada depois por [payment-exceptions.md](payment-exceptions.md) (DEC-037). OD-08 foi fechada antes dela por [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036) |
