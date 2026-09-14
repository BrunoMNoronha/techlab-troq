# Liberação de contato — desenho técnico — TROQ

Desenho técnico de RB-001 no MVP. Produzido por **F0-022**, junto com [overview.md](overview.md), [data-model.md](data-model.md) e [payments-design.md](payments-design.md).

> **RB-001:** WhatsApp/telefone só pode ser liberado ao solicitante escolhido e com pagamento aprovado.

Este documento converte essa regra em mecanismo. Ele não altera RB-001, não cria exceção, não cria caminho administrativo de acesso e não implementa nada.

Os itens são identificados como `CR-x`.

## 1. A fronteira que organiza todo o desenho

**CR-1.1 (decisão arquitetural).** Três fatos distintos são frequentemente confundidos, e confundi-los é a origem da maioria dos vazamentos. Neste desenho eles são **três coisas separadas**, com entidade própria, momento próprio e autorização própria:

| # | Fato | O que é | Quando ocorre | Entidade |
| --- | --- | --- | --- | --- |
| 1 | **Armazenar** o contato | O anunciante cadastrou seu telefone/WhatsApp | No cadastro ou na edição do perfil | `UserContact` |
| 2 | **Autorizar** o acesso | O escolhido passou a ter direito de ver aquele contato | No ato da escolha, quando RB-001 é satisfeita | `ContactRelease` |
| 3 | **Retornar** o contato | O dado efetivamente saiu do servidor para o escolhido | A cada leitura, quantas vezes ele quiser ver | `ContactAccessEvent` |

**CR-1.2 (decisão arquitetural).** As consequências da separação são o núcleo do desenho:

1. **Armazenar não autoriza.** Ter o dado no banco não concede acesso a ninguém. Não existe consulta de leitura de contato fora do módulo `contact` (AR-3.4).
2. **Autorizar não entrega.** A autorização é um registro; ela não coloca o dado em lugar nenhum. Nenhuma tela, payload ou cache passa a conter o telefone só porque a autorização existe.
3. **Entregar é um ato próprio, reverificado e auditado.** A autorização é condição necessária da entrega, nunca suficiente: cada entrega reverifica, no servidor, no instante da leitura (CR-5).

Sem essa separação, "liberar o contato" viraria um campo booleano em algum objeto — e todo objeto que o carregasse passaria a carregar o telefone junto.

## 2. Armazenar

**CR-2.1 (decisão arquitetural).** O contato vive em `UserContact`, tabela própria sob o módulo `contact`, e **não** como coluna de `User` ou de `Listing` (DM-4.1).

O motivo é estrutural, não estilístico: a falha mais comum e mais difícil de revisar é uma consulta que seleciona a entidade inteira e a devolve para uma camada que "vai filtrar". Se o telefone for coluna de `User`, essa falha vaza; se for tabela separada sob módulo com ponto de entrada autorizado, a mesma falha não alcança o dado. A proteção deixa de depender de revisão e passa a depender do modelo.

**CR-2.2 (invariante).** Nenhum módulo além de `contact` lê `UserContact`. O ponto de entrada público do módulo expõe duas operações, e apenas duas:

| Operação | Quem pode chamar | O que devolve |
| --- | --- | --- |
| Registrar ou alterar o próprio contato | O dono do contato | Confirmação, nunca o valor |
| Obter o contato autorizado de uma negociação | O caso de uso de leitura, com a identidade do ator | O valor, se e somente se CR-5 for satisfeita |

**CR-2.3 (invariante).** Cadastrar contato **não** o expõe. O contato do anunciante nunca é servido em listagem, detalhe público, busca, feed, sitemap, resposta de API pública, cache público ou payload de Server Component renderizado para quem não é o destinatário autorizado (RF-014).

**CR-2.4 (normativa).** Após a exclusão da conta, o contato é eliminado nos prazos de DEC-033, e a auditoria **não** conserva telefone/WhatsApp em texto puro, usando identificadores internos ou pseudonimizados (DEC-033, seções 3.2 e 6).

## 3. Autorizar

### 3.1 `ContactRelease`

| Aspecto | Definição |
| --- | --- |
| Papel | O registro de que RB-001 foi satisfeita para uma negociação específica |
| Cardinalidade | **Uma por negociação**, garantida por restrição de banco (DM-8.8) |
| Campos | Negociação, anúncio, solicitação escolhida, anunciante (titular do contato), solicitante escolhido (destinatário), instante da autorização, referência à evidência de pagamento aceita |
| Natureza | **Imutável.** Fato histórico (DM-1.5) |
| Não contém | O telefone/WhatsApp. A autorização aponta para quem é o titular; ela não copia o dado |

**CR-3.1 (decisão arquitetural).** `ContactRelease` **não** armazena o número. Se armazenasse, cada autorização seria uma segunda cópia do dado protegido, com o mesmo risco de vazamento e nenhuma vantagem — e a eliminação do contato na exclusão de conta teria de perseguir N cópias em vez de uma.

### 3.2 O ato de autorizar

**CR-3.2 (invariante, transação).** A autorização é criada **na mesma transação da escolha**, e nunca em outra. Nessa transação, com a solicitação e a negociação travadas, verifica-se:

| # | Pré-condição | Origem |
| --- | --- | --- |
| P1 | O ator é o **dono do anúncio** | RF-013 |
| P2 | A solicitação pertence **àquele** anúncio | RF-013 |
| P3 | A solicitação está em **`paid`** — isto é, existe pagamento canônico acreditado dentro da janela (PD-3.3) | RB-001, PE-1.4 |
| P4 | A solicitação **ainda não foi escolhida** antes | RS-5, DM-8.3 |
| P5 | O anúncio **não** está `removed` | DEC-027, seção 6 |
| P6 | Sendo **reseleção**, valem cumulativamente RS-1 a RS-5: escolha anterior existente, negociação anterior `closed`, anúncio atualmente `published`, candidato com pagamento aprovado e candidato ainda não selecionado nesse anúncio | DEC-032, seção 2 |
| P7 | Não existe outra negociação `active` naquele anúncio | DEC-032, seção 4.1; DM-8.5 |

Falhando qualquer uma, a escolha é **rejeitada no servidor** e nenhuma autorização é criada.

**CR-3.3 (invariante).** A escolha, a criação da negociação `active` e a criação da autorização são **um único ato atômico**. Não existe instante observável com escolha sem autorização, nem autorização sem negociação. Verificar pré-condição numa transação e criar a autorização em outra seria uma corrida (AR-7.3).

**CR-3.4 (invariante).** A autorização é **auditada** com ator, alvo, instante e resultado, na mesma transação (AR-9.4, RF-022). Cada escolha e cada reseleção são auditadas **independentemente** (DEC-032, seção 4).

**CR-3.5 (invariante).** A autorização **nunca é revogada, apagada nem revertida**. Isso é consequência direta e simultânea de: DEC-032 seção 3 (reseleção não revoga a liberação anterior), DEC-027 seção 5 (nenhuma transição do anúncio revoga liberação autorizada), PE-8.7 (reversão externa não revoga contato já liberado), DEC-034 seção 5.1 (bloqueio cautelar etário não revoga) e DEC-031 seção 7.2 (o moderador não pode revogar). O modelo não possui coluna, estado nem operação capaz de revogar — e essa ausência é deliberada.

**CR-3.6 (decisão arquitetural — o que "não revogar" significa tecnicamente).** Não revogar **não** significa que a autorização seja um cheque em branco. Significa que o **registro** do fato é imutável. A pergunta que a entrega faz (CR-5) é sempre sobre o estado **atual**; a autorização é uma das condições dessa pergunta, e as demais continuam sendo verificadas a cada acesso. A distinção importa: a plataforma não pode desfazer uma divulgação que já ocorreu — isso é tecnicamente impossível —, mas continua controlando cada nova entrega.

## 4. Elegibilidade e o efeito da reversão

**CR-4.1 (invariante).** **Elegibilidade** e **autorização concedida** são coisas distintas:

| Conceito | O que é | Muda com o tempo? |
| --- | --- | --- |
| Elegibilidade | A solicitação pode ser escolhida **agora** | **Sim** |
| Autorização concedida | Uma escolha já ocorreu e foi registrada | **Não.** Fato histórico |

**CR-4.2 (invariante).** Reversão externa do pagamento (PE-8.6, PE-8.7):

- se a solicitação **ainda não foi escolhida**, ela deixa de estar elegível e deixa de ser apresentada ao anunciante como opção — porque RB-001 exige pagamento aprovado, e o pagamento deixou de estar aprovado;
- se o contato **já foi liberado**, a divulgação é fato consumado. Registra-se que ela ocorreu e **não** se finge que pode ser desfeita. A negociação existente segue DEC-029.

**CR-4.3 (decisão arquitetural — a única questão que este documento precisa decidir sobre reversão).** Havendo autorização concedida e reversão posterior do pagamento, **novas entregas do contato ao mesmo destinatário continuam permitidas**.

Fundamento: PE-8.7 determina que a liberação já concedida não é revogada e que a plataforma não finge que a divulgação pode ser desfeita; DEC-032, seção 3, determina o mesmo para a reseleção. Bloquear a releitura seria **revogação disfarçada**: o destinatário já possui o número, de modo que o bloqueio não protegeria dado nenhum — apenas inventaria uma revogação retroativa que as fontes normativas rejeitam expressamente, e criaria um estado que nenhuma delas prevê.

O que a reversão **de fato** produz é o que CR-4.2 já diz: perda de elegibilidade para escolhas **futuras**, e um evento novo na auditoria (PE-8.5).

## 5. Retornar

### 5.1 A verificação de acesso

**CR-5.1 (invariante).** Toda entrega do contato passa por uma verificação **server-side**, executada **no instante da leitura** e contra o estado **atual** do servidor. A ausência, presença ou habilitação de controle na interface **nunca** é o mecanismo de autorização (RNF-007).

**CR-5.2 (invariante).** A verificação exige, cumulativamente:

| # | Condição | Como é verificada |
| --- | --- | --- |
| A1 | Existe sessão válida e o email está verificado | Autenticação, na entrada da operação |
| A2 | A **identidade do ator autenticado** é exatamente a do destinatário registrado na autorização | Comparação com o solicitante escolhido de `ContactRelease` — nunca com um identificador vindo do cliente |
| A3 | Existe `ContactRelease` para aquela negociação | Consulta pela negociação, não por parâmetro do cliente |
| A4 | A negociação, a escolha, a solicitação e o anúncio são **o mesmo encadeamento** | Correlação verificada no servidor, e não montada a partir da requisição |
| A5 | A solicitação correlacionada está em `paid` | Estado atual, não estado no momento da escolha |
| A6 | A conta do ator não está bloqueada | DEC-034, seção 5 |

**CR-5.3 (decisão arquitetural — por que A2 e A4 são enunciados separadamente).** O erro clássico desta classe de recurso é aceitar do cliente o identificador de "qual liberação quero ver" e verificar apenas se ela existe. Isso troca autorização por conhecimento de identificador. Aqui a pergunta é sempre a inversa: **dado este ator autenticado, quais autorizações são dele?** — e a resposta é derivada do servidor. Um identificador enviado pelo cliente pode selecionar dentro desse conjunto; nunca defini-lo.

**CR-5.4 (invariante).** Qualquer falha em A1 a A6 resulta em **negação**, e a negação **não** revela a existência do recurso, o estado interno, o motivo detalhado nem qualquer sinal a partir do qual se possa inferir que a liberação existe para outra pessoa (DEC-027 seção 3, [conventions.md](../engineering/conventions.md) seção 3.7). Uma resposta não pode ser canal lateral de informação.

**CR-5.5 (invariante).** Cada entrega bem-sucedida grava um `ContactAccessEvent` — ator, negociação, instante, resultado — e um registro na trilha única (DM-11.3), na mesma transação da leitura. Tentativas **negadas** também são registradas, como evento de segurança, sem revelar o dado e sem identificar o titular além do necessário.

**CR-5.6 (decisão arquitetural).** Registrar **cada** acesso, e não apenas o primeiro, é o que permite responder à pergunta que importa em um incidente: quantas vezes, quando e a partir de qual sessão o dado saiu. Uma autorização criada uma vez, sem registro das entregas, não responde a isso.

### 5.2 Retenção da trilha

**CR-5.7 (normativa).** A trilha da liberação é retida por **24 meses a partir da liberação**, preservando apenas os campos necessários para comprovar quem agiu, qual solicitação foi escolhida, qual anúncio, o instante, a autorização e o resultado. Após a exclusão da conta, **não** se conserva telefone/WhatsApp em texto puro (DEC-033, seção 6).

## 6. Superfícies

**CR-6.1 (invariante — o que nunca contém contato).**

| Superfície | Regra |
| --- | --- |
| Listagem, detalhe público, busca, feed, sitemap | **Nunca.** A projeção pública não tem o campo, e o dado nem está na tabela que ela lê (CR-2.1) |
| Qualquer resposta a usuário não autenticado | **Nunca** |
| Resposta a usuário autenticado que não seja o destinatário | **Nunca** |
| URL, rota, query string, fragmento | **Nunca** (CR-6.3) |
| Log de aplicação, log de acesso, rastreamento de erro | **Nunca**, em nenhum nível e em nenhum ambiente |
| Telemetria e analytics | **Nunca** |
| Mensagem de erro | **Nunca** |
| Email transacional | **Nunca** fora da própria liberação autorizada (RF-021) |
| Objeto público no R2 e metadado de imagem | **Nunca** (DEC-028, critério 17) |
| Trilha de auditoria | **Nunca** em texto claro fora da própria liberação autorizada (AR-9.5) |
| Payload de Server Component enviado ao navegador | Somente na tela do destinatário autorizado, após CR-5.2 |

**CR-6.2 (decisão arquitetural).** A tela que exibe o contato ao escolhido **não** é um Client Component que recebe o número por propriedade. Duas formas são admitidas, e apenas elas:

1. renderização no servidor, na tela do destinatário, após a verificação de CR-5.2; ou
2. obtenção sob demanda, por ação de servidor autorizada, disparada por gesto explícito do destinatário.

Motivo: uma propriedade entregue a um Client Component **está no payload**, mesmo que a interface só a exiba depois de um clique, e mesmo que ela esteja visualmente oculta. Payload é acessível; ocultação visual não é proteção ([conventions.md](../engineering/conventions.md), seção 3.3).

**CR-6.3 (invariante).** O contato **nunca** aparece em URL, em nenhuma circunstância, nem como parâmetro, nem como fragmento, nem codificado. URLs são registradas em log de servidor, em histórico de navegador, em cabeçalho de referência e em ferramentas de análise — quatro lugares onde o dado não pode estar. Pelo mesmo motivo, a entrega nunca acontece por redirecionamento que carregue o valor.

**CR-6.4 (decisão arquitetural).** Se a interface oferecer um atalho para abrir a conversa em aplicativo externo, ele é construído **no cliente do destinatário, a partir do valor já legitimamente entregue a ele** — nunca por uma rota do TROQ que receba o número e redirecione. Uma rota assim colocaria o contato na URL, violando CR-6.3.

## 7. Cache

**CR-7.1 (invariante).** Nenhuma resposta que contenha contato participa de cache **compartilhado**, em nenhuma camada: nem CDN, nem cache de borda, nem cache de dados do framework, nem cache de rota, nem cache de aplicação.

**CR-7.2 (decisão arquitetural).** As respostas que carregam contato são marcadas explicitamente como privadas e não armazenáveis, e a rota que as serve é sempre dinâmica — nunca estática, nunca pré-renderizada, nunca revalidada por tempo. A configuração é explícita e não pode depender de o framework "decidir certo" por inferência.

**CR-7.3 (decisão arquitetural).** Esta é a aplicação concreta de AR-2.2: aqui o objetivo de desempenho **cede** ao objetivo de não vazar. Não existe argumento de latência que justifique cachear uma resposta com dado protegido, porque o erro não é lento — é irreversível.

## 8. Quem não recebe o contato

**CR-8.1 (invariante).** Lista fechada de quem **não** recebe, e por qual condição de CR-5.2 falha:

| Quem | Falha em |
| --- | --- |
| Visitante não autenticado | A1 |
| Usuário autenticado sem relação com a negociação | A2, A3 |
| Solicitante **não escolhido**, ainda que tenha pagado | A3 — não há autorização para ele. RB-004 continua valendo: não há reembolso por isso |
| Solicitante escolhido cujo pagamento **não** está aprovado | A5 — hipótese impedida na origem por P3 (CR-3.2) |
| Solicitante com solicitação em `reserved`, `expired` ou `failed` | A5 |
| Solicitante cuja tentativa está em `em_confirmacao`, `reembolso_pendente` ou `inconsistente` | A5 — estado incerto nunca concede direito (PE-1.6, PE-6.11) |
| Escolhido de negociação **anterior**, para a negociação **nova** | A3 — ele mantém o acesso à **sua** autorização (CR-4.3), não à de outra |
| **Moderador** | A2, A3 — ser moderação não concede acesso ao contato (DEC-031, seção 13, item 3; AR-7.4) |
| Conta bloqueada por evidência de inelegibilidade etária | A6 (DEC-034, seção 5) |
| O próprio anunciante, quanto ao contato **do solicitante** | Não há autorização nesse sentido: o MVP libera o contato **do anunciante** ao escolhido, e RB-001 não cria a via inversa |

**CR-8.2.** A última linha registra uma fronteira que nenhum documento anterior precisou enunciar: RB-001 fala do contato do **anunciante**. Este desenho **não** cria liberação no sentido contrário, porque nenhuma decisão vigente a prevê — e inventá-la seria criar requisito de produto ausente. A comunicação entre as partes, depois da liberação, ocorre fora da plataforma, exatamente como DEC-029 já reconhece.

## 9. Cenários de consistência

| Cenário | Comportamento esperado |
| --- | --- |
| Escolhido acessa o contato várias vezes | Permitido. Cada acesso é reverificado e registrado (CR-5.5) |
| Duas escolhas concorrentes no mesmo anúncio | No máximo uma cria negociação `active` e autorização; a outra falha por P7 ou P4 (DM-8.5, DM-8.3) |
| Reseleção após negociação anterior `closed` | Nova autorização, independente e auditada. A anterior permanece válida (CR-3.5) |
| Escolhido anterior tenta acessar a autorização do novo escolhido | Negado: falha em A2 e A3 |
| Anúncio removido por moderação após a liberação | A liberação anterior permanece válida e auditada; **nenhuma** nova escolha ou liberação é autorizada (DEC-027, seção 6) |
| Anúncio pausado ou encerrado após a liberação | Nada muda para a liberação já concedida. A **reseleção** exigiria `published` (RS-3) |
| Reversão do pagamento antes da escolha | Solicitação fica inelegível e some das opções do anunciante (CR-4.2) |
| Reversão do pagamento depois da liberação | Nada é revogado; evento novo na auditoria; releituras continuam permitidas (CR-4.3) |
| Negociação encerrada | Não afeta a liberação já concedida (DEC-029, seção 9.2) |
| Conta do anunciante excluída | Contato eliminado nos prazos de DEC-033; a trilha permanece, sem o número em texto puro (CR-2.4) |
| Conta do escolhido bloqueada por evidência etária | Negado por A6, sem revogar o que já foi divulgado (DEC-034, seção 5.1) |
| Requisição com identificador de liberação de terceiro | Negada por A2, sem revelar a existência do recurso (CR-5.4) |

## 10. Contrato de teste

Complementa PD-13 e as áreas de risco de [testing.md](../engineering/testing.md), seção 4.

| # | Teste | Nível mínimo | Prova |
| --- | --- | --- | --- |
| C-1 | Inspeção do payload de toda resposta pública de anúncio | Integração com verificação de payload | Nenhuma contém contato, em nenhum campo, em nenhum nível de aninhamento |
| C-2 | Solicitante pago **não escolhido** tenta acessar | Integração | Negado, sem revelar existência |
| C-3 | Escolhido com solicitação fora de `paid` | Integração | Negado |
| C-4 | Ator autenticado apresenta identificador de liberação alheia | Integração | Negado por A2 |
| C-5 | Moderador tenta acessar | Integração | Negado |
| C-6 | Acesso legítimo | Integração | Entregue **e** registrado em `ContactAccessEvent` e na trilha |
| C-7 | Cabeçalhos da resposta que carrega contato | Integração | Privada e não armazenável; rota não estática e não revalidada por tempo |
| C-8 | Varredura de logs, telemetria e mensagens de erro durante um fluxo completo | Integração | Nenhuma ocorrência do número em nenhum deles |
| C-9 | Escolhas concorrentes no mesmo anúncio | Integração concorrente | No máximo uma autorização; nunca duas negociações `active` |
| C-10 | Reversão depois da liberação | Integração | Autorização intacta; releitura permitida; evento de reversão registrado; solicitação não escolhida fica inelegível |
| C-11 | Fluxo do escolhido com JavaScript inspecionado | Componentes + integração | O número não está em propriedade de Client Component antes da ação autorizada |

## 11. Alternativas rejeitadas

| Alternativa | Decisão | Razão |
| --- | --- | --- |
| Contato como coluna de `User` ou de `Listing` | **Rejeitada** | A consulta que seleciona a entidade inteira passaria a vazar o dado; a tabela separada torna esse caminho estruturalmente impossível (CR-2.1) |
| Booleano `contatoLiberado` no anúncio ou na solicitação | **Rejeitada** | Confunde autorização com entrega, não registra destinatário nem instante, não é auditável e convida a carregar o número junto do objeto |
| Copiar o número dentro de `ContactRelease` | **Rejeitada** | Criaria N cópias do dado protegido e N lugares a expurgar na exclusão de conta (CR-3.1) |
| Verificar a autorização apenas na escolha e confiar depois | **Rejeitada** | Autorização é condição necessária, nunca suficiente; A5 e A6 são estado **atual** (CR-5.2) |
| Aceitar do cliente o identificador da liberação e apenas checar existência | **Rejeitada** | Troca autorização por conhecimento de identificador (CR-5.3) |
| Entregar o contato como propriedade de Client Component, oculto até o clique | **Rejeitada** | O payload é acessível; ocultação visual não é proteção (CR-6.2) |
| Rota do TROQ que receba o número e redirecione para o aplicativo externo | **Rejeitada** | Colocaria o contato na URL, logo em log, histórico e cabeçalho de referência (CR-6.3, CR-6.4) |
| Cachear a resposta que contém contato, ainda que por poucos segundos | **Rejeitada** | Não há ganho de latência que justifique um vazamento irreversível (CR-7.3) |
| Registrar apenas o primeiro acesso | **Rejeitada** | Não responde quantas vezes e quando o dado saiu, que é a pergunta de um incidente (CR-5.6) |
| Revogar a liberação após reversão do pagamento | **Rejeitada** | Contraria PE-8.7 e DEC-032 seção 3; é tecnicamente inócuo, pois o dado já foi divulgado, e inventaria revogação retroativa (CR-4.3) |
| Dar ao moderador acesso ao contato para investigar denúncia | **Rejeitada** | DEC-031, seção 13, item 3, e seção 7.2 vedam expressamente |
| Liberar o contato do **solicitante** ao anunciante | **Rejeitada** | RB-001 não prevê; criá-la seria inventar requisito de produto ausente (CR-8.2) |
| Notificar o anunciante por email contendo o próprio contato liberado | **Rejeitada** | Email não é canal autorizado para o dado protegido fora da liberação; RF-021 já o proíbe |

## 12. Rastreabilidade

| Item | Efeito deste documento |
| --- | --- |
| F0-022 | Entrega parcial: desenho de liberação de contato exigido pelo item |
| RB-001 | **Materializada.** As duas condições simultâneas são verificadas na criação (P3, CR-3.2) e reverificadas em cada entrega (A5, CR-5.2) |
| RF-014 | Superfícies proibidas enumeradas em CR-6.1; proteção estrutural em CR-2.1 |
| RF-015 | Autorização server-side, auditoria por liberação e por acesso, e imutabilidade em CR-3 e CR-5 |
| RF-013 | Pré-condições P1 a P7 da escolha e da reseleção |
| RF-022 | Autorização e cada acesso integram a trilha única (DM-11.1) |
| RNF-007, RNF-008, RNF-011, RNF-018 | Convertidos em regra verificável nas seções 5, 6 e 7 |
| DEC-023 | Obedecida integralmente |
| DEC-027 | Remoção bloqueia nova escolha e nova liberação; liberações anteriores preservadas |
| DEC-029 | Negociação nasce com a autorização; encerramento não a afeta |
| DEC-031 | Moderação não acessa contato e não revoga liberação |
| DEC-032 | Reseleção gera autorização nova e independente; a anterior é imutável |
| DEC-033 | Retenção de 24 meses e ausência de número em texto puro após exclusão |
| DEC-034 | Conta bloqueada não recebe contato; o bloqueio não revoga o já divulgado |
| DEC-037 | Estado incerto nunca concede acesso; reversão não revoga (CR-4) |
| R-03 | Mitigação deixa de ser princípio e passa a ter mecanismo, superfícies proibidas e contrato de teste |

## 13. Revisão

Revisado quando uma decisão alterar RB-001 ou as políticas que a detalham; quando a Fase 3 implementar a escolha e a liberação; ou quando um teste da seção 10 demonstrar que alguma proteção aqui declarada é insuficiente.
