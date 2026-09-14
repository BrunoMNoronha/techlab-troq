# Natureza da demonstração de interesse — TROQ

Documento normativo que fecha [OD-12](../decisions/open-decisions.md) e registra DEC-035. Define o que é, tecnicamente, o passo "Tenho interesse" do fluxo central.

Fontes: [mvp-scope.md](mvp-scope.md) (fluxo central), [business-rules.md](business-rules.md) (RB-003, RB-004), [listing-lifecycle.md](listing-lifecycle.md) (DEC-027), [requirements.md](requirements.md) (RF-008, RF-009, RF-010).

## 1. Decisão

**A demonstração de interesse NÃO é uma entidade persistida independente no MVP.**

"Tenho interesse" é uma **ação gratuita de interface** que inicia o fluxo da solicitação de desbloqueio. É uma transição de UX para o passo seguinte, não um objeto de negócio.

## 2. Semântica

A ação "Tenho interesse":

| # | Regra |
| --- | --- |
| IF-1 | Exige usuário autenticado |
| IF-2 | Exige email verificado (RF-002) |
| IF-3 | Exige anúncio no estado `published` (DEC-027) |
| IF-4 | Inicia o fluxo da solicitação de desbloqueio |
| IF-5 | **Não** libera contato |
| IF-6 | **Não** ocupa uma das três vagas pagas (RB-003) |
| IF-7 | **Não** cria entidade `Interest` |
| IF-8 | **Não** cria registro funcional visível ao anunciante |

IF-1 a IF-3 são as mesmas pré-condições que RF-008 já registrava. O que esta decisão acrescenta é a natureza: satisfeitas as pré-condições, a ação leva o usuário adiante — ela não grava um estado que precise ser consultado, listado, contado ou cancelado depois.

Qualquer tentativa de agir sobre anúncio que não esteja `published` continua rejeitada no servidor, sem revelar existência nem estado anterior do anúncio (DEC-027, seção 9).

## 3. Persistência

**Não se persiste uma entidade de negócio separada apenas porque o usuário clicou em "Tenho interesse".**

A persistência funcional começa quando houver uma **solicitação de desbloqueio** que precise:

- reservar vaga (RF-010);
- relacionar usuário e anúncio;
- acompanhar pagamento;
- receber webhook;
- permitir reconciliação.

Os detalhes dessa solicitação — quando exatamente a vaga é reservada, por quanto tempo, e como o pagamento e o webhook a movem — não eram antecipados por este documento e foram decididos depois: o gateway foi homologado em [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036) e as exceções de pagamento, inclusive o piso de 30 minutos da janela de reserva e o efeito do pagamento tardio, em [payment-exceptions.md](payment-exceptions.md) (DEC-037), que fechou OD-07. O que resta é design (F0-022).

## 4. Gratuidade

A ação inicial "Tenho interesse" é **gratuita**.

O valor de R$ 0,99 pertence à **solicitação de desbloqueio**, não ao clique inicial. RB-004 incide sobre a cobrança da solicitação, e permanece literal: a cobrança é definitiva mesmo quando o solicitante não for escolhido.

## 5. Cancelamento

**Não existe "cancelamento de interesse"**, porque não existe entidade persistida independente para cancelar.

O usuário simplesmente abandona o fluxo antes de criar ou avançar a solicitação. Abandonar o fluxo não gera cobrança, não consome vaga, não deixa rastro funcional e não exige nenhuma ação de desfazimento.

## 6. Visibilidade para o anunciante

O anunciante:

- **não** vê usuários que apenas clicaram em "Tenho interesse";
- **não** recebe notificação desse clique;
- **não** vê lista de interessados gratuitos;
- **não** vê contador individualizado desses usuários.

O que o anunciante vê continua sendo o que já estava definido: as solicitações pagas do seu anúncio, elegíveis à escolha (RF-013).

### 6.1 Telemetria agregada

O produto **pode** coletar telemetria agregada de funil para analytics, desde que isso:

- **não** transforme o evento em entidade funcional;
- **não** exponha identidade desnecessariamente;
- **não** seja apresentado ao anunciante como lista, contador individualizado ou sinal sobre pessoas específicas.

Telemetria de funil serve para o produto entender conversão, nunca para criar um canal paralelo de informação sobre quem olhou um anúncio. Ela segue a minimização de RNF-008 e os prazos de [data-retention-policy.md](data-retention-policy.md) (DEC-033) aplicáveis à sua categoria.

## 7. Efeito sobre o fluxo central e sobre DEC-027

O fluxo central de [mvp-scope.md](mvp-scope.md) continua com os mesmos passos; o passo 3 passa a ser lido como **início do passo 4**, e não como uma funcionalidade separada com estado próprio.

[listing-lifecycle.md](listing-lifecycle.md) já havia antecipado essa possibilidade expressamente: a coluna "aceita novo interesse" passa a ser lida como parte da coluna seguinte, **sem alterar as demais definições** daquele documento. DEC-027 é preservada integralmente.

As linhas da tabela de efeitos de DEC-027 que falavam em "interesses preservados como histórico" perdem objeto: não há interesse persistido a preservar. Isso não altera nenhum outro efeito das transições — solicitações, cobranças, escolha e liberação de contato seguem exatamente como definidos ali.

## 8. Motivação

Esta decisão:

- reduz spam;
- reduz entidade e estado desnecessários;
- simplifica o modelo de dados;
- protege privacidade;
- evita criar um "lead gratuito" paralelo ao modelo pago;
- mantém clara a distinção entre intenção exploratória e solicitação efetiva.

## 9. Alternativas rejeitadas

| Alternativa | Decisão | Razão |
| --- | --- | --- |
| Entidade `Interest` persistida, gratuita, visível ao anunciante | **Rejeitada** | Criaria um canal de lead gratuito paralelo ao modelo pago, esvaziando o incentivo da solicitação de R$ 0,99 e abrindo superfície de spam |
| Entidade `Interest` persistida e invisível ao anunciante | **Rejeitada** | Todo o custo de modelo de dados, estado, cancelamento e retenção, sem nenhum benefício funcional que a telemetria agregada não entregue |
| Contador público de interessados no anúncio | **Rejeitada** | Sinal manipulável, pressiona o interessado e expõe comportamento de navegação sem finalidade de produto |
| Notificar o anunciante a cada clique | **Rejeitada** | Ruído para o anunciante e vetor trivial de assédio |
| Cobrar pelo clique inicial | **Rejeitada** | Contraria a decisão de gratuidade e transformaria exploração em transação |
| Permitir cancelar o interesse | **Rejeitada** | Não há o que cancelar; criaria uma operação sobre um objeto inexistente |
| Eliminar o passo 3 do fluxo central | **Rejeitada** | O passo descreve corretamente a intenção do usuário; o que faltava era decidir sua natureza, não removê-lo |

## 10. Rastreabilidade

| Item | Efeito desta decisão |
| --- | --- |
| RF-008 | Passa a `definido`. A demonstração de interesse é ação gratuita de interface, sem entidade persistida, sem cancelamento e sem visibilidade ao anunciante |
| RF-009 | Inalterado quanto à natureza; a persistência funcional começa nele. Passou depois a `definido` com [payment-exceptions.md](payment-exceptions.md) (DEC-037) |
| RF-010 | Inalterado. A vaga é da solicitação, nunca do interesse |
| RB-003 | Preservada literalmente. O clique não ocupa vaga |
| RB-004 | Preservada literalmente. O valor pertence à solicitação |
| DEC-027 | Preservada integralmente. A leitura da coluna de interesse é a que aquele documento já previa |
| RNF-008 | Preservado. Menos dado pessoal persistido |
| OD-12 | **Fechada** por este documento (DEC-035) |
| OD-07 | Estava aberta quando este documento foi escrito e foi fechada depois por [payment-exceptions.md](payment-exceptions.md) (DEC-037). OD-08 foi fechada antes dela por [../adr/0004-mercado-pago-pix.md](../adr/0004-mercado-pago-pix.md) (DEC-036) |
