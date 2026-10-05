# ADR-0009 — Regras de troca cadastradas e seletor por variável de ambiente

## Status

Aceito — 2026-10-05. Produzida por **PT-00** ([#186](https://github.com/BrunoMNoronha/techlab-troq/issues/186)) e registrada como **DEC-052** em [../decisions/decision-log.md](../decisions/decision-log.md).

As decisões 1 a 4 registram escolhas do Bruno em 2026-10-05 ([#185](https://github.com/BrunoMNoronha/techlab-troq/issues/185), decisões 1 a 4). As decisões 5 a 13 são decisões arquiteturais desta entrega, tomadas dentro do espaço que aquelas deixaram, e passam pela homologação dele na revisão de #186.

Esta ADR é **decisão e contrato**. Ela não cria a variável em nenhum ambiente, não escreve código, não altera schema e não muda o comportamento da regra vigente. A implementação está em [../delivery/trade-proposal-plan.md](../delivery/trade-proposal-plan.md) (PT-02 a PT-11).

Emenda o número de módulos de domínio fixado por [../architecture/overview.md](../architecture/overview.md), AR-3.3, e o alcance da decisão 5 de [ADR-0004](0004-mercado-pago-pix.md) (valor da cobrança). Nenhuma outra decisão de ADR anterior é alterada.

## Contexto

Até esta ADR o TROQS tinha uma única regra de troca, escrita como única em toda a documentação normativa: o interessado paga R$ 0,99 antes da escolha, cada anúncio aceita três solicitações pagas e o anunciante escolhe uma (RB-001 a RB-004). A Fase 3 implementou essa regra.

Em 2026-10-05 o Bruno decidiu cadastrar uma segunda regra, a **proposta de troca** ([../product/trade-proposal.md](../product/trade-proposal.md), DEC-053), sem substituir a primeira: as duas ficam cadastradas e ele opta por qual usar. Ele também decidiu como opta: por **variável de ambiente no servidor, por ambiente**, sem tela administrativa, sem papel de operador e sem segunda chave em `production`.

O que existia na data desta ADR, conferido em `main@373748f`:

| Fato | Onde |
| --- | --- |
| Preço, limite e prazos da regra vigente são constantes de código e restrições de banco (`REQUEST_PRICE_CENTS = 99`, vagas 1 a 3, janela de 30 minutos) | `src/modules/payments/charge.ts`, `src/modules/request/reservation.ts`, migration inicial |
| Não há seletor de regra, tabela de configuração, papel de operador nem área administrativa | `prisma/schema.prisma`, `src/app` |
| AR-3.3 fixa nove módulos de domínio; `request` é o dono da vaga e `payments` o dono do dinheiro (AR-3.5) | [../architecture/overview.md](../architecture/overview.md) |
| A tentativa de pagamento pertence a exatamente uma solicitação e não guarda o valor cobrado | `PaymentAttempt.contactRequestId` obrigatório e único; [../architecture/data-model.md](../architecture/data-model.md), DM-7.1 |
| Toda operação que disputa um anúncio usa a mesma trava de linha, e nenhuma transação trava dois anúncios | DM-6.12 |
| `APP_ENV` chega ao código pela chave `env` de `next.config.ts`, que fixa o valor no build | [../engineering/environments.md](../engineering/environments.md), seção 5.1 |
| Já existe uma flag server-side de conjunto fechado, que falha fechada em valor desconhecido | [../architecture/payments-design.md](../architecture/payments-design.md), PD-4.8 |
| O preflight de deploy exige as variáveis de runtime por ambiente e confere o valor das que são `plain` | `scripts/deploy/policy.mjs` |
| `preview` e `production` são publicados a partir do mesmo SHA, em dois disparos manuais | DEC-050; [../engineering/deployment.md](../engineering/deployment.md) |

**Fato externo, verificado em 2026-10-05 na documentação instalada do Next.js 16.3.5** (`node_modules/next/dist/docs/01-app/`): variável sem o prefixo `NEXT_PUBLIC_` só existe no servidor e é lida em runtime durante a renderização dinâmica (`02-guides/environment-variables.md`, "Runtime Environment Variables"); variável com o prefixo, ou declarada na chave `env` de `next.config`, é substituída pelo valor no build e deixa de responder a mudanças do ambiente (`02-guides/environment-variables.md`; `03-api-reference/05-config/01-next-config-js/env.md`).

## Drivers arquiteturais

| # | Driver | Origem |
| --- | --- | --- |
| D-1 | Um fluxo nunca muda de regra depois de nascer: direito concedido, cobrança e contato liberado são fatos históricos | DM-1.5, RB-004, CR-3.5 |
| D-2 | O mesmo build serve as duas regras, porque `preview` e `production` saem do mesmo SHA | DEC-050 |
| D-3 | Erro de configuração não pode fazer nascer fluxo na regra errada: o fluxo é permanente | D-1 |
| D-4 | A escolha da regra não se espalha pelo código: cada regra é um caminho inteiro e testável | [../engineering/conventions.md](../engineering/conventions.md), seção 2.2 |
| D-5 | A regra vigente não muda de comportamento por causa da segunda | Decisão 1 do Bruno |
| D-6 | Nenhum componente externo novo e nenhum perfil administrativo novo | AR-5.1, AR-7.4 |
| D-7 | Trava é comportamento, restrição de banco é garantia | DEC-038 |

## Alternativas consideradas

| Alternativa | Desfecho | Motivo |
| --- | --- | --- |
| **A** — variável de ambiente por ambiente | **Adotada** (decisão do Bruno) | Sem tela, sem papel novo e sem tabela; `preview` e `production` podem divergir; segue o padrão das capacidades já ligadas por ambiente |
| **B** — tela de operador com a configuração no banco | Descartada pelo Bruno | Exige papel de operador e área administrativa, que não existem (AR-7.4), e cria uma superfície privilegiada nova para revisar |
| **C** — as duas regras abertas para fluxos novos no mesmo ambiente | Descartada pelo Bruno | Duas jornadas na vitrine ao mesmo tempo e termos cobrindo ambas; é o caminho mais caro |
| **D** — segunda chave no preflight para `production` aceitar a regra nova | Descartada pelo Bruno | Ele preferiu um único controle: a variável (decisão 3) |
| **E** — cair para a regra vigente quando a variável falta ou é inválida | Rejeitada | Um erro de digitação faria nascer fluxos, permanentes, numa regra que ninguém escolheu (D-3) |
| **F** — fixar a regra no build (`NEXT_PUBLIC_` ou `env` de `next.config.ts`) | Rejeitada | O valor ficaria congelado no build e a prova "mesmo build, dois valores" seria impossível (D-2) |
| **G** — implementar a regra nova dentro de `request` e `negotiation` | Rejeitada | Os dois módulos passariam a ter dois modos, e a decisão que AR-3.5 dá a um dono só ficaria dividida por regra (D-4) |
| **H** — tabelas de pagamento próprias para a regra nova | Rejeitada | Duplicaria reembolso técnico, reconciliação e reversão, que são os caminhos com mais prova acumulada |
| **I** — uma `ContactRequest` por proposta aceita, para reaproveitar a tentativa | Rejeitada | Arrastaria vaga, janela de reserva e os limites de DEC-041 e DEC-051 para uma regra que não os tem, e misturaria as contagens |
| **J** — gravar a regra no anúncio | Rejeitada | O anúncio atravessa trocas de regra e pode ter fluxos das duas ao mesmo tempo (decisão 4 da #185); quem tem regra é o fluxo |

## Decisão

1. **Duas regras de troca cadastradas.** O TROQS tem um catálogo fechado de regras de troca, com dois valores:
   - `paid_request`, a **solicitação paga**: RB-001, RB-003 e RB-004 e as políticas que as detalham (DEC-019, DEC-032, DEC-035, DEC-040, DEC-041, DEC-051);
   - `trade_proposal`, a **proposta de troca**: RB-007 a RB-010 e [../product/trade-proposal.md](../product/trade-proposal.md) (DEC-053).

   Cadastrar a segunda não substitui nem revoga nenhuma decisão da primeira. Uma terceira regra exige nova decisão registrada.
2. **O seletor é uma variável de ambiente no servidor.** A regra dos fluxos novos de um ambiente é a que a variável indica. Cada ambiente tem o seu valor: `preview` pode operar `trade_proposal` enquanto `production` opera `paid_request`. Trocar a regra é alterar o valor no ambiente e republicar. Não há tela administrativa, papel de operador nem configuração em banco.
3. **`production` não tem segunda chave.** A variável, validada pelo preflight (decisão 10), basta para trocar a regra de qualquer ambiente.
4. **A regra é do fluxo, não do ambiente.** Um fluxo nasce sob a regra do ambiente naquele instante, grava essa regra e termina nela. Fluxo é a solicitação (`paid_request`) ou a proposta (`trade_proposal`) e tudo o que dela decorre: tentativa, pagamento, negociação, liberação de contato e avaliação. Trocar a variável não migra, não cancela e não reclassifica nada em andamento.
5. **Nome, valores e classificação.** A variável é `TRADE_RULE`. Os valores são exatamente `paid_request` e `trade_proposal`, em minúsculas. Ela é server-side, não é segredo e é obrigatória em `development`, `preview` e `production`. O catálogo está em [../engineering/environments.md](../engineering/environments.md), seção 5.1.
6. **Leitura em runtime, num ponto único.** Uma única função, em `src/modules/platform`, resolve a regra a partir do ambiente no momento da chamada. O prefixo `NEXT_PUBLIC_` e a chave `env` de `next.config.ts` são **proibidos** para esta variável. Toda superfície cuja apresentação depende da regra é renderizada dinamicamente, nunca pré-renderizada no build.
7. **Falha fechada.** Com a variável ausente, vazia, com valor de exemplo ou fora do conjunto, o ponto único devolve erro tipado e **nenhum fluxo novo nasce, em nenhuma regra**. As entradas mostram indisponibilidade neutra. Não existe valor padrão. Fluxos já nascidos seguem, porque não leem o seletor (decisão 8).
8. **Quem lê o seletor.** A lista é fechada:
   - a guarda do nascimento da solicitação (`paid_request`);
   - a guarda do nascimento da proposta (`trade_proposal`);
   - a apresentação por regra em `src/app`: entrada no detalhe do anúncio, "como funciona" e textos legais.

   Cobrança, webhook, reconciliação, reembolso, reversão, escolha, aceite, entrega de contato, encerramento, avaliação e trabalhos periódicos decidem pelo que está gravado no fluxo. Um teste de fronteira textual, no molde de `src/modules/contact/boundary.test.ts`, garante a lista.
9. **O que o fluxo grava ao nascer.** A regra, o valor da cobrança, os prazos aplicados e a versão dos termos aceita no fluxo. A regra é dada pela entidade raiz (a solicitação é `paid_request` por construção, a proposta é `trade_proposal` por construção) e gravada na negociação. Mudar preço ou prazo de uma regra não alcança fluxos existentes.
10. **Preflight e evidência de deploy.** `scripts/deploy/policy.mjs` passa a exigir `TRADE_RULE` em `preview` e `production`, do tipo `plain` e com valor no conjunto, e a evidência do deploy registra o valor.
11. **Módulo `proposal`.** A regra `trade_proposal` vive num décimo módulo de domínio, `proposal`, dono da proposta, do aceite e do efeito do pagamento da proposta. Ele depende de `listing`, `payments`, `contact`, `negotiation`, `identity` e `audit`, e nenhum módulo depende dele: os efeitos cruzados entram por portas compostas em `src/app`, como já acontece com `ListingClosureEffect` e `ContactChainCheck`. `request` continua dono da vaga de RB-003 e da regra `paid_request`.
12. **Ordem de travas com dois anúncios.** Toda transação que precise de mais de um anúncio adquire as travas de linha deles (DM-6.12) de uma vez, em ordem crescente de identificador, por um único ajudante de `listing`, antes de qualquer outra trava. Depois vêm as linhas de proposta, em ordem crescente de identificador, as de negociação e, por fim, a tentativa. Nenhuma trava de anúncio é pedida depois de outra coisa ter sido travada. Os fluxos de `paid_request`, que usam um anúncio só, já cumprem a ordem.
13. **Tentativa com sujeito e valor próprios.** A tentativa de pagamento passa a pertencer a **exatamente um sujeito** — uma solicitação ou uma proposta aceita — e a gravar o valor da cobrança. A confirmação compara o pagamento com o valor **da tentativa**, não com uma constante. `payments` continua sem conhecer vaga nem proposta: informa o fato, e o dono do sujeito decide o efeito (AR-3.5). A decisão 5 de ADR-0004 ("exatamente R$ 0,99") passa a valer para a regra `paid_request`; cobrar outro valor depende da prova de PT-01 no sandbox.

## Consequências

- AR-3.3 e [../engineering/conventions.md](../engineering/conventions.md), seção 2.5, passam de nove para dez módulos de domínio.
- AR-5.1 continua valendo como está: uma variável de ambiente lida pelo próprio servidor não é um "serviço de feature flag" nem um componente externo.
- DM-7.1, PD-2.1 e PD-4.5 passam a ser lidos por sujeito e por regra. O desenho está em [../architecture/trade-proposal-design.md](../architecture/trade-proposal-design.md).
- O schema muda só por migrations aditivas e compatíveis com os dados existentes: as tentativas atuais recebem o valor 99 e continuam ligadas à sua solicitação.
- As entregas que introduzem o seletor, a trava ordenada e o sujeito da tentativa (PT-02 a PT-04) **não mudam comportamento**. Elas valem pela reexecução do contrato da Fase 3 (T-1 a T-18, C-1 a C-11).
- Passam a existir dois caminhos completos, e a matriz de testes e a documentação normativa dobram nos pontos em que as regras diferem.
- A página que descreve a regra ao público não pode ser estática. `/termos` e `/privacidade` hoje são pré-renderizadas; o tratamento dos textos legais por regra está em [../product/trade-proposal.md](../product/trade-proposal.md), seção 13, e depende de OD-18.
- A troca de regra de um ambiente é uma mudança de configuração seguida de publicação. O roteiro e o limite de rollback entram em [../engineering/deployment.md](../engineering/deployment.md) com PT-02.

## Riscos

| Risco | Tratamento |
| --- | --- |
| Variável ausente ou com erro de digitação em `production` | O preflight recusa o deploy (decisão 10); se ainda assim acontecer, nenhum fluxo novo nasce e os existentes seguem (decisão 7) |
| A regra de `production` é trocada por um único valor, sem segunda chave | Aceito pelo Bruno (decisão 3). O preflight valida o valor, não a intenção. Registrado como R-13 em [../delivery/risks.md](../delivery/risks.md) |
| Voltar a um build anterior à regra nova com fluxos dela no banco | Não é seguro: esse build não sabe pagar nem encerrar esses fluxos. O roteiro de PT-02 registra o limite, e PT-11 ensaia a troca nos dois sentidos |
| O seletor se espalha pelo código | Lista fechada e teste de fronteira (decisão 8) |
| A generalização da tentativa deixa uma cobrança fora da reconciliação ou do reembolso, em silêncio | PT-04 reexecuta T-1 a T-18 e prova que tentativas dos dois sujeitos são reclamadas pelos três trabalhos |
| Ordem de travas errada em algum fluxo gera deadlock | Um único ajudante adquire as travas de anúncio (decisão 12); o contrato de teste de [../architecture/trade-proposal-design.md](../architecture/trade-proposal-design.md) cobre aceites cruzados e em ciclo |
| O `preview` aprova um SHA sob uma regra e `production` roda a outra | PT-11 homologa as duas regras no mesmo SHA antes de qualquer troca em `production` |

## Política de evolução

- Acrescentar uma regra é nova decisão registrada e um valor novo no conjunto. Um valor só sai do conjunto depois de não haver fluxo vivo daquela regra, também por decisão registrada.
- Mudar o mecanismo do seletor (tela, banco, segunda chave) reabre as decisões 2 e 3, que são do Bruno.
- Adotar `cacheComponents` ou outro modelo de cache do framework exige revisar a decisão 6 antes, pela mesma razão de [../architecture/contact-release.md](../architecture/contact-release.md), CR-7.4.

## Rastreabilidade

- **Registra:** DEC-052 em [../decisions/decision-log.md](../decisions/decision-log.md).
- **Emenda:** AR-3.3 em [../architecture/overview.md](../architecture/overview.md); seção 2.5 de [../engineering/conventions.md](../engineering/conventions.md); alcance da decisão 5 de [ADR-0004](0004-mercado-pago-pix.md).
- **Aplica-se a:** DM-6.12 e DM-7.1 em [../architecture/data-model.md](../architecture/data-model.md); PD-2.1 e PD-4.5 em [../architecture/payments-design.md](../architecture/payments-design.md); seção 5.1 de [../engineering/environments.md](../engineering/environments.md).
- **Preserva:** RB-001 a RB-006, AR-3.5, AR-5.1, AR-7.4, AR-15.3, DEC-038 e DEC-050.
- **Implementação:** PT-02 (seletor), PT-03 (trava ordenada), PT-04 (sujeito e valor da tentativa) e PT-05 em diante (módulo `proposal`), em [../delivery/trade-proposal-plan.md](../delivery/trade-proposal-plan.md).
