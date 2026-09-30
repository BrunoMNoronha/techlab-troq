# Contrato do formulário e da consulta de anúncios — TROQ

Contrato técnico canônico do anúncio no MVP: campos, validação do formulário, rascunho e publicação, estados, contratos de saída (DTOs), visibilidade, consulta pública, conteúdo livre e requisitos de interface. Entregável de F2-005 ([#43](https://github.com/BrunoMNoronha/techlab-troq/issues/43)).

**Reconciliado em 2026-09-29** sobre `main` em `7296cb3`. A versão anterior deste documento divergia das fontes normativas (máximo de 5 imagens, estados `DRAFT`/`PUBLISHED`/`INACTIVE` e contato por "aceite mútuo"); a seção 14 registra o que mudou.

**Atualização de F2-010 ([#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48), 2026-09-30).** As transições T1 a T6 pelo dono foram implementadas conforme as seções 4.3, 4.4 e 5, com interface na edição privada. As divergências D-1 a D-4 e a parte de #48 em D-6 foram resolvidas (seção 12). Estado, decisões e provas estão na seção 15.

## 1. Escopo e hierarquia

Este documento **não** cria regra de negócio, decisão de produto nem decisão aberta. Ele consolida, em forma de contrato técnico, o que já está definido em:

| Fonte normativa | O que determina aqui |
| --- | --- |
| [business-rules.md](../product/business-rules.md) | RB-001 (contato), RB-005 (cidade/UF), RB-006 (itens proibidos); RB-002 a RB-004 preservadas sem efeito direto neste contrato |
| [listing-lifecycle.md](../product/listing-lifecycle.md) (DEC-027) | Estados, transições T1 a T9, capacidades por estado e visibilidade |
| [image-policy.md](../product/image-policy.md) (DEC-028) | Quantidade de imagens, pré-condição de publicação, derivados públicos |
| [prohibited-items.md](../product/prohibited-items.md) (DEC-031) | Declaração de conformidade na publicação e validações preventivas auxiliares |
| [data-retention-policy.md](../product/data-retention-policy.md) (DEC-033) | Retenção e expurgo; nada deste contrato a altera |
| [requirements.md](../product/requirements.md) | RF-004 a RF-007, RF-014, RNF-001, RNF-005, RNF-007, RNF-008, RNF-010, RNF-014 |
| [data-model.md](data-model.md) e `prisma/schema.prisma` | Entidades e nomes físicos (`Listing`, `ListingImage`, `ImageDerivative`, `TermsAcceptance`, `ListingTransition`) |

Quando este contrato e uma fonte normativa de produto parecerem divergir, **prevalece a fonte normativa**. Comportamento existente no código que contradiga essas fontes **não** é regra homologada: é divergência, registrada na seção 12 com a issue que a corrige.

Estão fora deste contrato: execução do pipeline de imagens ([media-pipeline-contract.md](media-pipeline-contract.md), [#45](https://github.com/BrunoMNoronha/techlab-troq/issues/45), [#46](https://github.com/BrunoMNoronha/techlab-troq/issues/46)), política de URLs e cache das imagens ([#47](https://github.com/BrunoMNoronha/techlab-troq/issues/47)), solicitação paga, pagamento, escolha e liberação de contato (Fase 3, [contact-release.md](contact-release.md)) e moderação administrativa (Fase 4).

## 2. Campos do anúncio (RF-004)

O MVP adota o **conjunto mínimo já homologado** de conteúdo fornecido pelo anunciante: **título, descrição, imagens e cidade/UF**. Não há outro campo de conteúdo. Isso fecha a lacuna que mantinha RF-004 em `parcialmente definido` sem criar regra ou decisão nova.

### 2.1 Conteúdo fornecido pelo anunciante

| Campo (entrada/DTO) | Coluna (`Listing`) | Obrigatório | Público quando `published` |
| --- | --- | --- | --- |
| `title` | `title` | sim | sim |
| `description` | `description` | sim | sim |
| `city` | `city` | sim | sim |
| `state` (UF) | `uf` (`CHAR(2)`) | sim | sim |
| imagens | entidade `ListingImage` (seção 2.4) | não no rascunho; de 1 a 6 prontas para publicar | somente derivados processados |

O nome externo da UF é **`state`** nos DTOs e nos parâmetros de consulta; a coluna física é `uf`. Os dois nomes designam o mesmo dado.

### 2.2 Campos técnicos gerados pelo sistema

Nunca aceitos do cliente. O servidor os define.

| Campo | Origem | Observação |
| --- | --- | --- |
| `id` | UUID gerado pelo banco | Identificador do anúncio; é o único identificador do anúncio exposto publicamente |
| `ownerId` | sessão autenticada no servidor | Nunca informado pelo cliente e nunca exposto em DTO público |
| `status` | `draft` na criação; depois, somente por transição (seção 5) | Nunca informado pelo cliente em criação ou edição |
| `publishedAt`, `pausedAt`, `closedAt`, `removedAt` | instante da transição correspondente | Fatos do ciclo de vida ([listing-lifecycle.md](../product/listing-lifecycle.md), seção 2.3) |
| `createdAt`, `updatedAt` | banco | `createdAt` é público; `updatedAt` só aparece ao dono |

O histórico de transições (`ListingTransition`: ator, origem, destino, instante) também é gerado pelo sistema e nunca é público.

### 2.3 Metadados de conformidade

A declaração de conformidade com [prohibited-items.md](../product/prohibited-items.md) **não** é campo do anúncio: é um registro `TermsAcceptance` do tipo `listing_compliance`, criado na publicação (seção 4.4), com `userId`, `listingId`, `termsVersion` e `acceptedAt`. É dado de auditoria, nunca público e nunca editável pelo usuário.

**`termsVersion` (F2-010).** Identifica o texto efetivamente aceito, no formato `DEC-031/<data da revisão de prohibited-items.md>/declaracao-<n>`; valor atual `DEC-031/2026-09-14/declaracao-1`. O texto exibido e a versão gravada vêm da mesma constante (`src/modules/listing/compliance.ts`), e um teste fixa o hash do texto: mudar a declaração ou a política exige nova versão. É decisão técnica de rastreabilidade, sem regra nova.

### 2.4 Imagens: entidade separada

Imagens não são campo textual do anúncio. Cada uma é um `ListingImage` (`position`, `status` em `uploaded`/`processing`/`ready`/`failed`, chave do objeto, dimensões) com derivados `ImageDerivative` (`thumb`, `medium`, `large`, cada um com `width` e `height`). Upload, validação, processamento e reserva de posição pertencem a [image-policy.md](../product/image-policy.md) e ao pipeline ([#46](https://github.com/BrunoMNoronha/techlab-troq/issues/46)); este contrato fixa apenas o que o formulário e a consulta precisam:

- **Somente imagens `ready` contam** para a pré-condição de publicação e aparecem em qualquer superfície pública.
- **A ordem é `position` crescente; a primeira imagem pronta é a capa.**
- O original enviado **nunca** é público; só derivados processados o são.

### 2.5 Fora do MVP

Não existem, e não devem ser introduzidos sem decisão própria: categoria, preço, valor estimado, estoque, quantidade, condição do produto, CEP, bairro, endereço, coordenadas, geolocalização ou qualquer outro campo comercial. A localização coletada e exibida é **somente cidade/UF** (RB-005, RF-007, RNF-008).

## 3. Validação do formulário

Os limites abaixo são **contrato técnico do formulário do MVP**, e não regras de negócio: preservam os valores já adotados na implementação e podem ser ajustados por mudança técnica documentada, sem RB nova.

| Campo | Normalização | Regra |
| --- | --- | --- |
| `title` | `trim` | obrigatório; de **5 a 60** caracteres após `trim` |
| `description` | `trim` | obrigatório; de **1 a 1000** caracteres após `trim` (vazio ou só espaços é inválido) |
| `city` | `trim` | obrigatório; não vazio após `trim`; texto informado pelo anunciante, sem integração com serviço de CEP |
| `state` (UF) | `trim` + maiúsculas | obrigatório; exatamente **duas letras** (`A`–`Z`) após normalização |

Regras de aplicação:

- **O servidor é a autoridade** (RNF-007, RNF-014). A validação no cliente (`required`, `minLength`, `maxLength`) melhora a experiência, mas não é controle.
- As **mesmas regras** valem na criação e na edição: editar não pode gravar valor que a criação recusaria.
- O servidor usa **apenas** os campos de conteúdo da seção 2.1. `ownerId`, `status`, timestamps e dados de conformidade eventualmente enviados pelo cliente são ignorados.
- Erro de validação retorna mensagem por campo, sem expor detalhe interno, e **não** persiste escrita parcial.

## 4. Rascunho, edição e publicação

### 4.1 Criação

- Todo anúncio **nasce em `draft`** (RF-004, [listing-lifecycle.md](../product/listing-lifecycle.md), seção 2), criado por conta autenticada, com email verificado e `status = active` (guard `validateSession`).
- A criação exige título, descrição, cidade e UF válidos (seção 3). **O rascunho pode existir sem nenhuma imagem**, e com imagens ainda não processadas.
- Criar rascunho não publica, não aceita termos e não torna nada visível a terceiros.

### 4.2 Edição

- Editável pelo dono em `draft`, `published` e `paused`; `closed` e `removed` são histórico somente leitura ([listing-lifecycle.md](../product/listing-lifecycle.md), seção 3).
- Edição em `published` altera o conteúdo público imediatamente e **não** muda o estado.
- Edição de anúncio `published` **não pode resultar em zero imagens válidas** ([image-policy.md](../product/image-policy.md), seção 3).
- Só o dono edita. Para quem não é o dono, a resposta não pode distinguir anúncio alheio de anúncio inexistente (seção 7).

### 4.3 Quantidade de imagens

| Situação | Imagens |
| --- | --- |
| `draft` | de **0 a 6**, em qualquer estado de processamento |
| Publicação (T1) e reativação (T4) | pelo menos **1** imagem `ready`; no máximo **6** no total |
| `published` após edição | nunca **0** imagens `ready` |
| Qualquer estado | a sétima imagem é recusada, inclusive sob concorrência |

### 4.4 Publicação (T1 `draft` → `published`)

A publicação é **sempre uma transição explícita** do dono. Pré-condições, todas verificadas no servidor:

1. sessão válida do dono, com email verificado e conta `active`;
2. anúncio em `draft`;
3. campos de conteúdo válidos segundo a seção 3, revalidados no ato;
4. entre **1 e 6** imagens, com **pelo menos uma `ready`**; imagens que não estejam `ready` não contam;
5. **aceitação expressa** da declaração de conformidade com [prohibited-items.md](../product/prohibited-items.md) (seção 5, item 1), registrada como `TermsAcceptance` `listing_compliance` com **instante** (`acceptedAt`) e **versão** (`termsVersion`) do texto aceito;
6. ausência de restrição ou bloqueio de publicação vigente ([prohibited-items.md](../product/prohibited-items.md), seção 10), quando as sanções existirem (Fase 4).

Efeitos, na **mesma transação**: `status = published`, `publishedAt`, o registro de aceitação, a linha de `ListingTransition` e o evento de auditoria `listing.published` ([data-model.md](data-model.md), DM-11.1; AR-9.4). Repetir a publicação de anúncio já `published` não gera novo aceite nem nova transição ([listing-lifecycle.md](../product/listing-lifecycle.md), seção 4, idempotência).

Validações preventivas de conteúdo podem existir e são **auxiliares**; uma publicação barrada por elas não é decisão de moderação nem conta para reincidência ([prohibited-items.md](../product/prohibited-items.md), seção 5).

## 5. Estados e transições do anunciante

Os **únicos** identificadores de estado são os cinco de [listing-lifecycle.md](../product/listing-lifecycle.md), preservado integralmente:

| Estado | Público | Editável pelo dono | Terminal |
| --- | --- | --- | --- |
| `draft` | não | sim | não |
| `published` | **sim** | sim | não |
| `paused` | não | sim | não |
| `closed` | não | não | **sim** |
| `removed` | não | não | **sim** |

Não existe estado `INACTIVE`, "inativo", "vendido", "expirado" ou "em análise".

| # | Transição | Ator | Uso no formulário/gestão |
| --- | --- | --- | --- |
| T1 | `draft` → `published` | dono | Publicar (seção 4.4) |
| T2 | `draft` → `closed` | dono | Descartar rascunho, com confirmação explícita |
| T3 | `published` → `paused` | dono | Pausar |
| T4 | `paused` → `published` | dono | Reativar; exige pelo menos 1 imagem `ready` |
| T5 | `published` → `closed` | dono | Encerrar, com confirmação explícita |
| T6 | `paused` → `closed` | dono | Encerrar, com confirmação explícita |
| T7–T9 | `draft`/`published`/`paused` → `removed` | **somente moderação** | Nenhuma ação do dono produz `removed` |

**Divergência resolvida em 2026-09-30 (F2-010):** o descarte de rascunho gravava `draft` → `removed`, contrariando T2; agora grava `draft` → `closed` (seção 12, D-1).

## 6. Contratos de saída e de entrada

### 6.1 DTO público (allowlist)

Usado por listagem, detalhe, home e metadata. Somente estes campos existem; qualquer campo novo exige alteração deste contrato.

| Campo | Tipo | Origem |
| --- | --- | --- |
| `id` | UUID | `Listing.id` |
| `title` | string | `Listing.title` |
| `description` | string | `Listing.description` |
| `city` | string | `Listing.city` |
| `state` | string (UF) | `Listing.uf` |
| `createdAt` | data/hora | `Listing.createdAt` |
| `images[]` | lista | somente `ListingImage` `ready`, em `position` crescente |
| `images[].id` | UUID | identificador opaco da imagem, usado como chave de renderização |
| `images[].position` | inteiro | ordem; a primeira é a capa |
| `images[].derivatives[]` | lista | `kind` (`thumb`/`medium`/`large`), `url`, `width`, `height` |

```json
{
  "id": "5b0c…",
  "title": "Bicicleta aro 29",
  "description": "Bicicleta em ótimo estado.",
  "city": "Campinas",
  "state": "SP",
  "createdAt": "2026-09-29T12:00:00.000Z",
  "images": [
    {
      "id": "9e1f…",
      "position": 1,
      "derivatives": [
        { "kind": "thumb", "url": "…", "width": 320, "height": 240 },
        { "kind": "medium", "url": "…", "width": 768, "height": 576 },
        { "kind": "large", "url": "…", "width": 1600, "height": 1200 }
      ]
    }
  ]
}
```

A forma de construir `url` e sua revogação pertencem a [#47](https://github.com/BrunoMNoronha/techlab-troq/issues/47); este contrato só exige que a URL aponte para um derivado processado. Desde F2-009, `url` é sempre a rota relativa `/media/{imageId}/{kind}` ([media-pipeline-contract.md](media-pipeline-contract.md), seção 21).

### 6.2 Proibido em qualquer resposta pública

Não pertencem ao DTO público, nem a HTML, payload RSC, JSON, metadata, mensagens de erro ou cache público:

- `ownerId` ou qualquer identificador, nome, email, telefone ou WhatsApp do dono;
- `status`, timestamps de ciclo de vida, `updatedAt` e histórico de transições;
- aceitação de termos, versão aceita e qualquer dado de auditoria;
- chave do objeto original, objeto original, imagens que não estejam `ready` e metadados de imagem além de `kind`, `width` e `height`;
- relações privadas (solicitações, pagamentos, escolhas, negociações, denúncias, decisões de moderação);
- tokens, credenciais e segredos;
- localização mais precisa que cidade/UF.

A projeção é explícita (`select` campo a campo); serializar a entidade inteira ou relações completas é proibido (RF-014).

### 6.3 DTO privado do dono

Usado em "meus anúncios" e na edição, somente para o dono autenticado: `id`, `title`, `description`, `city`, `state`, `status`, `createdAt`, `updatedAt` e, para a gestão de imagens, as imagens do próprio anúncio com seu estado de processamento. `ownerId` não é devolvido: o dono é a própria sessão. O aceite de termos não é exibido como campo editável.

### 6.4 Entrada

- Criação: `{ title, description, city, state }`, todos obrigatórios.
- Edição: subconjunto dos mesmos quatro campos; os informados são validados como na criação.
- Publicação: identificador do anúncio e confirmação explícita da declaração de conformidade.
- Pausar, reativar, encerrar e descartar: identificador do anúncio e, quando exigida, confirmação explícita.

## 7. Visibilidade

- Só aparece em superfície pública — listagem, detalhe, home, metadata, busca, feed ou cache público — o anúncio que esteja **`published` e pertença a conta `active`**. Conta bloqueada (`blocked_age`, `blocked_admin`) ou em exclusão (`deletion_requested`) tem seus anúncios fora da exposição pública, sem que isso mude o estado do anúncio ou o apague.
- Para terceiros e anônimos, anúncio em qualquer outro estado, de conta não elegível, inexistente ou com identificador malformado responde **da mesma forma: recurso indisponível (404)**, sem revelar existência anterior nem estado interno ([listing-lifecycle.md](../product/listing-lifecycle.md), seção 3).
- O dono vê seus anúncios não públicos apenas na área privada (seção 6.3).
- Na área privada, anúncio alheio também é indistinguível de inexistente: `getListingForEdit` e `updateListing` filtram pelo dono da sessão e respondem `not_found`, e a página de edição devolve o mesmo 404 ([#44](https://github.com/BrunoMNoronha/techlab-troq/issues/44)); a verificação abrangente segue em [#50](https://github.com/BrunoMNoronha/techlab-troq/issues/50).
- Ao sair de `published`, o anúncio e suas imagens deixam de ser servidos publicamente de imediato, inclusive em cache ([image-policy.md](../product/image-policy.md), seção 8; [#47](https://github.com/BrunoMNoronha/techlab-troq/issues/47)).

## 8. Contato (RB-001)

**WhatsApp/telefone só pode ser liberado ao solicitante escolhido e com pagamento aprovado** (RB-001). Não existe liberação por "match", "aceite mútuo", mensagem interna ou qualquer outro mecanismo.

- O anúncio público **nunca** carrega telefone, WhatsApp ou outro meio de contato do dono, nem antecipadamente, nem oculto no cliente.
- O contato é dado protegido em tabela própria ([data-model.md](data-model.md), DM-4.1) e só transita em resposta autorizada server-side ao escolhido com pagamento aprovado ([contact-release.md](contact-release.md)), fluxo da Fase 3 ainda não implementado.
- O detalhe público exibe um bloco "Contato do anunciante" calculado no servidor por `getContactRequestEntry` (`src/modules/request`) a cada requisição: visitante ou sessão expirada/revogada vê "Entrar para solicitar" (`/login?motivo=solicitar&next=/explorar/<id>`); email não verificado, conta bloqueada ou em exclusão e anúncio próprio veem o motivo; o elegível vê que a solicitação paga ainda não está disponível. **Nenhum** estado desse bloco cria solicitação, reserva vaga, cobra ou expõe contato — isso é da Fase 3 ([#54](https://github.com/BrunoMNoronha/techlab-troq/issues/54)) —, e nenhum botão com ação fictícia de pagamento é exibido.
- O retorno após o login usa `next`, validado no servidor por `sanitizeReturnPath` (`src/modules/identity`): só caminho interno; URL absoluta, `//host`, barra invertida e caracteres de controle levam a `/conta`.

## 9. Consulta pública

A consulta do MVP é simples: listagem paginada e detalhe. **Não** há busca textual, busca avançada, filtro por categoria, preço ou raio, mapa nem geolocalização.

### 9.1 Parâmetros da listagem (`/explorar` e `getPublicFeed`)

| Parâmetro | Tipo | Padrão | Regra server-side |
| --- | --- | --- | --- |
| `page` | inteiro | `1` | inteiro `>= 1`; ausente, não numérico, fracionário ou `< 1` é tratado como `1` |
| `limit` | inteiro | `20` | inteiro de `1` a **`50`**; ausente ou inválido vale `20`; acima de `50` é limitado a `50` |
| `city` | string | — | opcional; `trim`; vazio após `trim` é ignorado; comparação exata, sem diferenciar maiúsculas |
| `state` | string (UF) | — | opcional; `trim` + maiúsculas; vazio é ignorado; UF fora do formato de duas letras não corresponde a nenhum anúncio |

- O teto de `limit` (**50**) é **limite técnico deste contrato**, e não regra de negócio: impede payload arbitrariamente grande. Ele vale na própria função de consulta, porque `getPublicFeed` é exportada de um módulo `'use server'` e, portanto, pode ser invocada diretamente como Server Action com argumentos arbitrários.
- `/explorar` não expõe `limit` na URL: usa o padrão `20`. Chamadores internos podem pedir página menor — a home usa a primeira página com `limit = 12` —, sem alterar o contrato geral.
- Página além da última devolve lista vazia com o `total` correto, e não erro.

### 9.2 Ordenação

Uma única ordenação no MVP: **mais recentes primeiro**, por `createdAt` decrescente, com **desempate por `id` decrescente**. O desempate torna a ordem total e determinística, de modo que a paginação por página não repete nem omite anúncios com o mesmo `createdAt` enquanto o conjunto não muda.

### 9.3 Resposta da listagem

`{ listings: PublicListing[], total, page, limit }`, em que `listings` segue a allowlist da seção 6.1, `total` conta apenas anúncios visíveis (seção 7) com os mesmos filtros, e `page`/`limit` são os valores efetivamente aplicados após a normalização.

### 9.4 Detalhe (`/explorar/[id]`)

- Abre sem login, inclusive por URL direta.
- Devolve o mesmo DTO público (seção 6.1), com todas as imagens `ready` em ordem.
- Identificador que não seja UUID é tratado como anúncio inexistente (404), sem erro de consulta; anúncio não visível também é 404 (seção 7).
- A metadata usa somente campos do DTO público (título, cidade e UF); anúncio indisponível recebe metadata genérica.

### 9.5 Home (`/`)

Pública. Apresenta o TROQ, mostra as ofertas recentes pela primeira página de `getPublicFeed` (mesma regra de visibilidade e ordenação, `limit = 12`) e navega para `/explorar`, `/login` e `/cadastro`. Carregamento, catálogo vazio e erro têm estados próprios; nenhuma oferta fictícia é exibida.

## 10. Conteúdo livre e dados pessoais

Título, descrição e cidade são **texto livre fornecido pelo usuário**.

- A plataforma **não** instrui o usuário a inserir telefone, WhatsApp, email, endereço ou outro dado pessoal no conteúdo. Rótulos, dicas e exemplos do formulário orientam a descrever o item e informar apenas a cidade e a UF.
- Podem existir validações preventivas e moderação auxiliares ([prohibited-items.md](../product/prohibited-items.md), seção 5). Elas **não** garantem detecção de dados pessoais: **não se promete detecção perfeita** de telefone, endereço ou similar em texto livre.
- A proteção de RF-014 depende principalmente de **não serializar os campos protegidos do cadastro e do dono** (seção 6.2), e não de filtrar o texto digitado.
- Conteúdo que exponha dado pessoal pode ser tratado por denúncia e moderação no nível do anúncio (RF-018 a RF-020).
- O texto é sempre renderizado como texto, nunca como HTML.

Não faz parte do MVP nenhum detector automático de telefone, NLP ou moderação automática de conteúdo.

## 11. Interface e acessibilidade

Requisitos proporcionais ao contrato, sem redesign; o nível formal de acessibilidade segue RNF-010.

| Superfície | Rota |
| --- | --- |
| Criar rascunho | `/anuncios/novo` |
| Editar, gerir imagens e ciclo de vida | `/anuncios/[id]/editar` |
| Meus anúncios | `/anuncios` |
| Listagem pública | `/explorar` |
| Detalhe público | `/explorar/[id]` |
| Home | `/` |

- **Mobile-first** (RNF-001): todo fluxo é completável em smartphone.
- **Rótulos associados** a cada campo (`<label for>`), inclusive cidade e UF.
- **Erros associados ao campo** (por exemplo, `aria-describedby`) e anunciados a tecnologia assistiva; mensagem geral só para falha não atribuível a um campo.
- **Foco previsível em erro:** após submissão inválida, o foco vai para o primeiro campo inválido ou para o resumo de erros.
- **Operação completa por teclado** no formulário, na gestão e na listagem, incluindo a navegação entre páginas.
- **Estados de carregamento, vazio e erro** em listagem, detalhe, home, "meus anúncios" e formulário; o estado vazio da listagem com filtro sugere remover o filtro; erro de carregamento oferece nova tentativa.
- **Dados preservados em falha:** submissão recusada ou com erro não apaga o que foi digitado.
- **Confirmação explícita** antes de T2, T5 e T6.
- **Imagens com dimensões conhecidas** (`width`/`height` dos derivados), para reservar espaço, e **texto alternativo** derivado do título e da posição (por exemplo, "Imagem 1 de 3: Bicicleta aro 29").
- A política de itens proibidos é acessível a partir do fluxo de publicação.

## 12. Divergências da implementação atual e destino

Conferência feita em `7296cb3`. Nenhuma foi corrigida por F2-005, que é documental; cada uma segue na issue indicada. D-7 a D-9 foram corrigidas depois, por F2-006 ([#44](https://github.com/BrunoMNoronha/techlab-troq/issues/44)); D-1 a D-4 e a parte de publicação de D-6, por F2-010 ([#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48)).

| # | Contrato | Implementação atual | Destino |
| --- | --- | --- | --- |
| D-1 | Descarte de rascunho é T2 `draft` → `closed` (seção 5) | **Corrigida em 2026-09-30.** O descarte grava `closed` e `closedAt`, nunca `removed`. Antes, `discardDraft` gravava `removed` e `removedAt` | [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48) |
| D-2 | Pré-condições de T1 verificadas na mesma transação do efeito; campos revalidados; versão do termo vinculada ao texto aceito (seção 4.4) | **Corrigida em 2026-09-30.** Estado, conteúdo e imagens prontas são lidos sob a trava do anúncio, na transação do efeito; `termsVersion` segue a seção 2.3; a repetição é idempotente. Antes, `publishListing` lia tudo fora da transação, não revalidava campos, gravava `'1.0'` fixo e dava erro à repetição | [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48) |
| D-3 | T4 exige pelo menos 1 imagem `ready` (seção 4.3) | **Corrigida em 2026-09-30.** A reativação exige imagem `ready` e conteúdo válido, sob a trava. Antes, `reactivateListing` não verificava imagens | [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48) |
| D-4 | Ações de ciclo de vida acessíveis pela interface, com confirmação em T2/T5/T6 | **Corrigida em 2026-09-30.** Painel "Situação do anúncio" na edição privada, com confirmação explícita em T2/T5/T6. Antes, as ações não tinham tela | [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48) |
| D-5 | Máximo de 6 imagens mesmo sob concorrência; posições consistentes | Limite de 6 existe, mas a posição é `images.length + 1` fora de transação ([`media/service.ts`](../../src/modules/media/service.ts)) | [#46](https://github.com/BrunoMNoronha/techlab-troq/issues/46) |
| D-6 | Remover imagem de anúncio `published` não pode deixar zero `ready`; `closed`/`removed` não são editáveis | **Corrigida.** A remoção recusa a última `ready` de anúncio `published` (#46, `last_ready_image`); publicação e reativação usam a mesma trava do anúncio e releem as imagens prontas, e a corrida com a remoção foi provada em 2026-09-30 (#48). Antes, `deleteListingImage` não verificava o estado nem a última imagem pronta | [#46](https://github.com/BrunoMNoronha/techlab-troq/issues/46), com a invariante de publicação em [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48) |
| D-7 | Descrição obrigatória após `trim`; mesmas regras na criação e na edição; UF com duas letras `A`–`Z` (seção 3) | **Corrigida em 2026-09-29.** Criação e edição usam a mesma validação (`src/modules/listing/validation.ts`). Antes, a criação aceitava descrição só com espaços e UF de dois caracteres quaisquer, e a edição não validava cidade nem UF | [#44](https://github.com/BrunoMNoronha/techlab-troq/issues/44) |
| D-8 | Anúncio alheio indistinguível de inexistente na área privada (seção 7) | **Corrigida em 2026-09-29.** A busca e o `UPDATE` são filtrados pelo dono da sessão, e alheio, inexistente e ID malformado dão a mesma resposta `not_found`. Antes, a resposta era "sem permissão" | [#44](https://github.com/BrunoMNoronha/techlab-troq/issues/44) (correção) e [#50](https://github.com/BrunoMNoronha/techlab-troq/issues/50) (verificação abrangente) |
| D-9 | Erro por campo, foco em erro e dados preservados (seção 11) | **Corrigida em 2026-09-29.** O formulário marca o campo com `aria-invalid` e associa a mensagem, foca o primeiro erro, preserva os valores e bloqueia envio duplicado. Antes, havia só um aviso geral | [#44](https://github.com/BrunoMNoronha/techlab-troq/issues/44) |
| D-10 | `page` e `limit` validados, teto de 50, resposta com `page`/`limit` (seção 9) | `getPublicFeed` aceita qualquer `page`/`limit` sem validação nem teto e não devolve os valores aplicados | [#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49) |
| D-11 | Desempate por `id` (seção 9.2) | Ordena só por `createdAt` | [#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49) |
| D-12 | `/explorar` pagina e filtra por cidade/UF, com estados de carregamento e erro | Lê só `city`/`state` da URL, sem `page`, sem controles de navegação ou filtro, sem estado de erro próprio; `city` só com espaços vira filtro vazio | [#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49) |
| D-13 | Ausência de contato e de dados privados provada em HTML/RSC/JSON/metadata/erros/cache | Projeções explícitas existem; a prova sobre HTTP real e cache aquecido não | [#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49) e [#50](https://github.com/BrunoMNoronha/techlab-troq/issues/50) |
| D-14 | URL de derivado revogável e retirada imediata do público ao sair de `published`; contrato em [media-pipeline-contract.md](media-pipeline-contract.md), seção 9 (rota `/media/{imageId}/{kind}`, bucket privado, `private, no-store`) | **Resolvida por F2-009:** DTO com `/media/{imageId}/{kind}`, rota com revogação por requisição, `private, no-store` ([media-pipeline-contract.md](media-pipeline-contract.md), seção 21) | [#47](https://github.com/BrunoMNoronha/techlab-troq/issues/47) |
| D-15 | Publicação respeita restrição/bloqueio de publicação (seção 4.4, item 6) | Sanções de moderação não implementadas | Fase 4 ([#55](https://github.com/BrunoMNoronha/techlab-troq/issues/55)) |

## 13. Rastreabilidade

| Referência | Relação com este contrato |
| --- | --- |
| RB-001 | Seção 8: contato só ao escolhido com pagamento aprovado; nunca no anúncio público |
| RB-005, RF-007, RNF-008 | Seções 2.5, 6.2 e 7: cidade/UF é a única localização coletada e exibida |
| RB-006, RF-018 a RF-020 | Seções 4.4, 5 e 10: declaração de conformidade, validações auxiliares, `removed` só por moderação |
| RF-004 | Seções 2 a 5: campos do MVP, validação, rascunho, publicação; RF-004 passa a `definido` |
| RF-005 | Seções 7 e 9: visibilidade, paginação, ordenação, filtros e detalhe |
| RF-006, RNF-005 | Seções 2.4, 4.3 e 6.1: 1 a 6 imagens, somente derivados `ready`, dimensões conhecidas |
| RF-014 | Seções 6.2, 8 e 10: allowlist, contato fora de qualquer payload público, limites do texto livre |
| RF-022 | Seções 2.2, 2.3 e 4.4: transições e aceitação de conformidade registradas |
| RNF-001, RNF-010 | Seção 11 |
| RNF-007, RNF-014 | Seções 3, 4 e 9.1: validação e autorização no servidor |
| DEC-027, DEC-028, DEC-031 | Preservadas integralmente |

## 14. Histórico desta versão

Mudanças em relação à versão anterior (criada em [#52](https://github.com/BrunoMNoronha/techlab-troq/pull/52), `098d171`, e ampliada por [#60](https://github.com/BrunoMNoronha/techlab-troq/pull/60), `4bb78fe`):

- máximo de imagens corrigido de 5 para **6**, e mínimo de 1 imagem **pronta** exigido só na publicação, não no rascunho;
- estados `DRAFT`, `PUBLISHED` e `INACTIVE` substituídos pelos cinco estados canônicos; `INACTIVE` eliminado;
- o texto de contato por "aceite mútuo" foi removido e substituído por RB-001;
- `userId` passou a `ownerId`, nunca público; `updatedAt` e `status` saíram do DTO público; `location` aninhado deu lugar a `city`/`state`, como na implementação;
- "campos incompletos são permitidos no rascunho" deixou de valer: o rascunho exige os campos textuais válidos e dispensa apenas imagens;
- a ordenação "mais antigos" saiu do MVP; ficam uma ordenação determinística e os filtros por cidade/UF;
- a seção sobre home e entrada da solicitação ([#59](https://github.com/BrunoMNoronha/techlab-troq/issues/59)) foi preservada, distribuída entre as seções 8, 9.4 e 9.5.

## 15. Estado da implementação de #48 (F2-010)

### 15.1 O que existe

| Mecanismo | Onde |
| --- | --- |
| Transições T1 a T6 numa transação, sob `SELECT … FOR UPDATE` do anúncio filtrado pelo dono (a mesma trava da gestão de imagens) | `src/modules/listing/lifecycle.ts`; Server Actions finas em `src/modules/listing/actions.ts` |
| Auditoria transacional mínima: `listing.published` (T1, com o aceite) e `listing.closed` (T5/T6), no mesmo `now()` da transação | `recordAuditEvent` em `src/modules/audit/index.ts` |
| Declaração de conformidade e `termsVersion` (seção 2.3) | `src/modules/listing/compliance.ts` |
| Política de itens proibidos acessível pelo aceite: títulos e fundamentos das 12 categorias e a leitura dos três fundamentos, copiados literalmente de [prohibited-items.md](../product/prohibited-items.md), com link para o texto completo | `/politica/itens-proibidos` (`src/app/politica/itens-proibidos/page.tsx`); um teste compara a página com o documento |
| Painel "Situação do anúncio" (publicar com aceite, pausar, reativar, encerrar, descartar), com confirmação em linha para T2/T5/T6, foco gerenciado, erros anunciados e bloqueio de envio duplicado | `src/app/anuncios/[id]/editar/_components/lifecycle-panel.tsx` |

**Regras aplicadas.** Anúncio alheio, inexistente ou com ID malformado recebe a mesma resposta `not_found`. Sessão sem e-mail verificado ou com conta não `active` é recusada (`unauthenticated`). Se o anúncio já está no estado de destino, a resposta é sucesso sem efeito (`changed: false`) e sem novo aceite, transição ou auditoria. Transição fora da matriz é recusada com `invalid_transition` e o estado atual. T1 e T4 revalidam o conteúdo (seção 3) e exigem ao menos uma imagem `ready`. O dono nunca produz `removed`. Códigos fechados: `unauthenticated`, `not_found`, `invalid_transition`, `compliance_required`, `validation`, `no_ready_image`, `error`.

**Decisões de detalhe, sem efeito contratual.** T4 não altera `publishedAt`, que guarda a primeira publicação. O instante do efeito, da transição, do aceite e da auditoria é o `now()` do banco na transação: o `@default(now())` do Prisma é preenchido no cliente, consulta a consulta, e produziu instantes diferentes na primeira prova. Nenhuma migration foi necessária.

**Dados legados.** Consulta agregada em 2026-09-30: nem `troq_dev` nem o Neon de `preview` tinham anúncio gravado como `removed` pelo descarte antigo (0 em ambos); nada a corrigir.

### 15.2 Provas

| Camada | O que provou |
| --- | --- |
| Unitário (transação simulada) | matriz T1–T6 sem `removed`; eventos auditados; sessão e ID malformado sem tocar no banco; cada pré-condição de T1/T4; idempotência sem gravação; terminais; erro de banco sem detalhe cru; hash da declaração ↔ versão; painel (aceite, confirmação, cancelar sem chamada e com foco devolvido, alerta focado, envio duplicado bloqueado); página da política igual ao documento |
| PostgreSQL descartável + Better Auth real | 20 cenários: T1 com transição, aceite versionado e auditoria no mesmo instante; repetição sem duplicar; sem aceite, sem imagem pronta e só com imagem `uploaded`/`failed`; conteúdo revalidado; duas publicações simultâneas (um efeito); **corridas determinísticas por trava**: remoção da única imagem pronta × publicação e × reativação (a ação espera o COMMIT e recusa); publicação × remoção pela action real em 8 rodadas, nunca publicado sem imagem pronta; T2 grava `closed`; terminais; T3/T4 preservando `publishedAt`; T5/T6 auditados; encerramento × pausa; **rollback real** por restrição temporária em `audit_events` (encerramento e publicação desfeitos por inteiro, sem aceite órfão); anúncio alheio igual a inexistente; sem sessão, e-mail não verificado e conta bloqueada. **Mutação:** sem `FOR UPDATE`, 5 cenários falham; sem a checagem de idempotência, 6 falham |
| Build de produção local + HTTP real + navegador a 375 px | publicar sem aceite → alerta focado; publicar → detalhe, home e `/explorar` com o anúncio e `/media` anônimo 200 (`private, no-store`); pausar → detalhe e `/media` anônimos 404 na mesma URL, fora de home e `/explorar`, dono ainda vê a miniatura; reativar → 200; encerrar pelo teclado na confirmação → 404 e página somente leitura; descartar outro rascunho, com cancelar antes → `closed`, sem `removed_at`. No banco: T1, T3, T4 e T5; auditoria só em T1 e T5; um aceite com a versão atual. Sem rolagem horizontal |
| Vercel Preview | ver a seção 15.3 |

### 15.3 Prova em Preview

Deployment `dpl_EtNnj2TESSMUToYP5enpYqghX5oB` (alias da branch `feat/f2-010-listing-lifecycle`, commit `c6e4c37`), com `BETTER_AUTH_URL` restrito à branch só para a prova. Conta sintética `@resend.dev`, cuja senha foi digitada pelo responsável. As superfícies públicas foram conferidas por HTTP **sem sessão do TROQ**, com acesso temporário de compartilhamento da Vercel.

| Passo | Resultado |
| --- | --- |
| Publicar rascunho com imagem pronta e aceite | `Publicado`; detalhe 200, `/media` 200 (`private, no-store`), presente em `/explorar` e na home |
| Pausar | detalhe e `/media` 404 na mesma URL, fora de `/explorar` e da home; o dono ainda recebe a miniatura (200) |
| Reativar | de volta a 200 e às listagens |
| Encerrar | a confirmação recebe o foco; antes de confirmar o anúncio segue publicado; depois, 404 e página somente leitura |
| Rascunho novo: publicar sem aceite e depois sem imagem | alerta focado com `compliance_required`; depois `no_ready_image` |
| Descartar: cancelar e depois confirmar | cancelar devolve o foco e mantém o rascunho; confirmar grava `closed` |
| Neon de `preview` (consulta somente leitura) | anúncio do ciclo: `draft>published, published>paused, paused>published, published>closed`; auditoria `listing.published(T1)` e `listing.closed(T5)`; um aceite `DEC-031/2026-09-14/declaracao-1` no mesmo instante da auditoria; `removed_at` nulo. Rascunho descartado: `draft>closed`, sem auditoria |
