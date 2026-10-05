# Contrato do formulário e da consulta de anúncios — TROQS

Contrato técnico canônico do anúncio no MVP: campos, validação do formulário, rascunho e publicação, estados, contratos de saída (DTOs), visibilidade, consulta pública, conteúdo livre e requisitos de interface. Entregável de F2-005 ([#43](https://github.com/BrunoMNoronha/techlab-troq/issues/43)).

**Reconciliado em 2026-09-29** sobre `main` em `7296cb3`. A versão anterior deste documento divergia das fontes normativas (máximo de 5 imagens, estados `DRAFT`/`PUBLISHED`/`INACTIVE` e contato por "aceite mútuo"); a seção 14 registra o que mudou.

**Atualização de F2-010 ([#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48), 2026-09-30).** As transições T1 a T6 pelo dono foram implementadas conforme as seções 4.3, 4.4 e 5, com interface na edição privada. As divergências D-1 a D-4 e a parte de #48 em D-6 foram resolvidas (seção 12). Estado, decisões e provas estão na seção 15.

**Atualização de F2-011 ([#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49), 2026-09-30).** A vitrine pública (`/explorar`, `/explorar/[id]` e home) passou a cumprir as seções 9 e 11: parâmetros normalizados no servidor, ordem total, paginação e filtro pela URL, galeria completa no detalhe e prova por HTTP real de que nenhuma superfície pública carrega contato ou dado privado. D-10 a D-12 foram resolvidas, e a parte pública de D-13 também (seção 12). Estado, decisões e provas estão na seção 16.

**Atualização de [#76](https://github.com/BrunoMNoronha/techlab-troq/issues/76) (2026-10-04, DEC-046).** O anúncio passou a ter as **três alternativas de troca** aceitas pelo anunciante: campo novo de conteúdo (seções 2.1 e 3.1), pré-condição de T1 e T4 (seções 4.4 e 5), restrição da edição de anúncio `published` ou `paused` (seção 4.2), DTO do dono e do detalhe público (seções 6.1 e 6.3) e regra para os anúncios anteriores (seção 17.3). Estado, decisões e provas estão na seção 17; a homologação em `preview`, na seção 17.5.

**Atualização de [#86](https://github.com/BrunoMNoronha/techlab-troq/issues/86) (2026-10-04, DEC-049).** Título, descrição e alternativas de troca passaram a **recusar telefone, WhatsApp, e-mail e endereço detectáveis** pelas regras documentadas, na criação, na edição e na releitura de T1 e T4 (seções 3, 3.1 e 10.1). O anúncio público gravado antes da regra continua público, com o campo afetado mascarado nas consultas públicas até o dono corrigi-lo (seção 10.2). Estado, decisões e provas estão na seção 18.

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

O MVP adota o **conjunto mínimo já homologado** de conteúdo fornecido pelo anunciante: **título, descrição, imagens e cidade/UF** e, desde DEC-046 ([#76](https://github.com/BrunoMNoronha/techlab-troq/issues/76)), as **três alternativas de troca** aceitas pelo anunciante (seção 3.1). Desde [#89](https://github.com/BrunoMNoronha/techlab-troq/issues/89), inclui também uma categoria de produto, segundo [product-categories.md](../product/product-categories.md). Isso fecha a lacuna que mantinha RF-004 em `parcialmente definido` sem criar regra ou decisão nova.

### 2.1 Conteúdo fornecido pelo anunciante

| Campo (entrada/DTO) | Coluna (`Listing`) | Obrigatório | Público quando `published` |
| --- | --- | --- | --- |
| `title` | `title` | sim | sim |
| `description` | `description` | sim | sim |
| `city` | `city` | sim | sim |
| `state` (UF) | `uf` (`CHAR(2)`) | sim | sim |
| `category` | `category` (`VARCHAR(40)`, nullable) | opcional no rascunho; obrigatória para publicar, reativar e editar `published`/`paused` | sim, código do catálogo comum; nome no card/detalhe |
| imagens | entidade `ListingImage` (seção 2.4) | não no rascunho; de 1 a 6 prontas para publicar | somente derivados processados |
| `tradeOptions` (alternativas de troca) | entidade `ListingTradeOption` (`position` 1 a 3, `label`) | de 0 a 3 no rascunho; exatamente 3 para publicar, reativar e editar `published`/`paused` (seção 3.1) | sim, somente no detalhe (seção 6.1) |

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

**`termsVersion` (F2-010).** Identifica o texto efetivamente aceito, no formato `DEC-031/<data da revisão de prohibited-items.md>/declaracao-<n>`; valor atual `DEC-031/2026-09-14/declaracao-2` (a redação 1 trazia o nome do produto como "TROQ"; a redação 2 corrige para TROQS, sem mudança de teor). O texto exibido e a versão gravada vêm da mesma constante (`src/modules/listing/compliance.ts`), e um teste fixa o hash do texto: mudar a declaração ou a política exige nova versão. É decisão técnica de rastreabilidade, sem regra nova.

### 2.4 Imagens: entidade separada

Imagens não são campo textual do anúncio. Cada uma é um `ListingImage` (`position`, `status` em `uploaded`/`processing`/`ready`/`failed`, chave do objeto, dimensões) com derivados `ImageDerivative` (`thumb`, `medium`, `large`, cada um com `width` e `height`). Upload, validação, processamento e reserva de posição pertencem a [image-policy.md](../product/image-policy.md) e ao pipeline ([#46](https://github.com/BrunoMNoronha/techlab-troq/issues/46)); este contrato fixa apenas o que o formulário e a consulta precisam:

- **Somente imagens `ready` contam** para a pré-condição de publicação e aparecem em qualquer superfície pública.
- **A ordem é `position` crescente; a primeira imagem pronta é a capa.**
- O original enviado **nunca** é público; só derivados processados o são.

### 2.5 Fora do MVP

Não existem, e não devem ser introduzidos sem decisão própria: preço, valor estimado, estoque, quantidade, condição do produto, CEP, bairro, endereço, coordenadas, geolocalização ou qualquer outro campo comercial. A localização coletada e exibida é **somente cidade/UF** (RB-005, RF-007, RNF-008).

A categoria comercial é distinta das categorias de denúncia/moderação. Catálogo, cardinalidade única, normalização, patches e compatibilidade de legados são normativos em [product-categories.md](../product/product-categories.md).

## 3. Validação do formulário

Os limites abaixo são **contrato técnico do formulário do MVP**, e não regras de negócio: preservam os valores já adotados na implementação e podem ser ajustados por mudança técnica documentada, sem RB nova.

| Campo | Normalização | Regra |
| --- | --- | --- |
| `title` | `trim` | obrigatório; de **5 a 60** caracteres após `trim`; sem contato nem endereço detectável (seção 10.1) |
| `description` | `trim` | obrigatório; de **1 a 1000** caracteres após `trim` (vazio ou só espaços é inválido); sem contato nem endereço detectável (seção 10.1) |
| `city` | `trim` | obrigatório; não vazio após `trim`; texto informado pelo anunciante, sem integração com serviço de CEP |
| `state` (UF) | `trim` + maiúsculas | obrigatório; após normalização, uma das **27 siglas** da lista de UFs (seção 3.2). `ZZ` e outras siglas inexistentes são recusadas |

Regras de aplicação:

- **O servidor é a autoridade** (RNF-007, RNF-014). A validação no cliente (`required`, `minLength`, `maxLength`) melhora a experiência, mas não é controle.
- As **mesmas regras** valem na criação e na edição: editar não pode gravar valor que a criação recusaria.
- O servidor usa **apenas** os campos de conteúdo da seção 2.1. `ownerId`, `status`, timestamps e dados de conformidade eventualmente enviados pelo cliente são ignorados.
- Erro de validação retorna mensagem por campo, sem expor detalhe interno, e **não** persiste escrita parcial.

### 3.1 Alternativas de troca (DEC-046, #76)

O anunciante informa **três alternativas do que aceita receber** em troca do item — por exemplo, ao anunciar uma bicicleta, "um notebook", "um videogame" e "uma câmera". São **opções alternativas**: o interessado não precisa oferecer as três juntas. São preferências do próprio anunciante, informadas no cadastro, e **não** são contrapropostas, mensagens ou ofertas de interessados.

| Aspecto | Regra |
| --- | --- |
| Entrada | `tradeOptions`: lista de **exatamente 3** textos, na ordem dos campos do formulário. Lista com outro tamanho, ou valor que não seja lista, é recusada inteira (erro `tradeOptions`) em qualquer estado |
| Normalização | `trim` em cada texto |
| Texto | de **1 a 60** caracteres após `trim` quando preenchido; acima de 60 é recusado em qualquer estado (erro do campo `tradeOption1`, `tradeOption2` ou `tradeOption3`) |
| Completude | vazio ou só espaços só é aceito enquanto o anúncio está em `draft`. Publicar (T1), reativar (T4) e editar anúncio `published` ou `paused` exigem as três preenchidas |
| Ordem | cada texto guarda a posição do seu campo (1 a 3); reabrir a edição devolve cada um no mesmo campo |
| Persistência | entidade própria `ListingTradeOption`, separada da descrição: uma linha por posição preenchida, com `CHECK` de posição e de texto aparado e não vazio ([data-model.md](data-model.md), DM-5.10) |

- **O limite de 60 caracteres é técnico**, como os da seção 3: proporcional ao título (até 60), suficiente para nomear um item e sem criar regra comercial.
- **Completude sob a trava.** A completude não é restrição de banco — o rascunho pode ficar incompleto e o anúncio anterior a DEC-046 não tem alternativas (seção 17.3). Por isso ela é verificada pela aplicação **sob a trava de linha do anúncio**, a mesma das transições: a edição e a publicação se serializam, e nenhuma corrida publica um anúncio com alternativa esvaziada.
- **Edição.** `tradeOptions` ausente mantém as gravadas; presente, substitui as três posições. Em `published` ou `paused`, o resultado precisa ter as três — inclusive quando a edição só muda o título de um anúncio anterior a DEC-046.
- **Privacidade.** É texto livre, com o mesmo tratamento da seção 10: a instrução do formulário pede para não incluir telefone, WhatsApp, e-mail ou endereço, o texto é sempre renderizado como texto e a recusa de contato e endereço de [#86](https://github.com/BrunoMNoronha/techlab-troq/issues/86) (seção 10.1) vale também aqui, em qualquer estado, com erro no campo da alternativa. Nada do dono entra no DTO por causa delas.
- **Não confundir com RB-003.** As três alternativas de troca **não** têm relação com o limite de **três solicitações pagas** por anúncio (RB-003, [data-model.md](data-model.md), seção 6). Esta regra não altera cobrança, vaga, escolha do solicitante nem liberação de contato, e o solicitante não precisa escolher uma das alternativas.
- **Fora do escopo:** chat, contraproposta de interessado, escolha obrigatória de uma alternativa pelo solicitante, matching automático, vínculo a outros anúncios e oferta em dinheiro.

### 3.2 Lista de UFs ([#90](https://github.com/BrunoMNoronha/techlab-troq/issues/90))

| Aspecto | Regra |
| --- | --- |
| Lista | as **27 unidades federativas** (26 estados e o Distrito Federal), com sigla e nome, numa fonte única: `src/modules/listing/uf.ts`. A validação do servidor, o formulário e o filtro de `/explorar` leem a mesma lista |
| Interface | seletor (`<select>`) com as opções em ordem alfabética pelo nome, no formato "Nome (UF)". No cadastro, a opção inicial é "Selecione o estado", sem valor válido; nenhuma UF vem escolhida. No filtro, a opção vazia é "Todos os estados" |
| Contrato | inalterado: `state` nos DTOs e parâmetros, `uf` (`CHAR(2)`) com a sigla na persistência, cidade como campo independente. Sem migration |
| Servidor | criação, edição, publicação (T1) e reativação (T4) aplicam a mesma regra (seção 3, linha `state`). `trim` + maiúsculas continua valendo para chamadas diretas: ` sp ` grava `SP`. Valor vazio, que não seja texto ou fora da lista é recusado com "Selecione o estado.", sem escrita parcial. Na edição, `state` omitido mantém o valor gravado |
| Filtro público | sigla inexistente informada na URL **continua filtrando** e não corresponde a nenhum anúncio (seção 9.1): o filtro nunca é removido em silêncio para devolver a vitrine inteira. O seletor mostra a sigla como "UF inválida (XX)", em vez de "Todos os estados" ou de outra UF, e o link "Limpar filtro" continua disponível |

**Registros anteriores a #90 com UF fora da lista.** A regra anterior aceitava qualquer par de letras, então pode existir anúncio gravado com sigla inexistente. Nenhum dado é corrigido para um estado presumido, apagado ou retirado do ar:

- a edição mostra o seletor **sem UF escolhida** (nunca outra UF no lugar), com o aviso de que a UF gravada não é válida; salvar exige escolher uma UF da lista, e nada é gravado antes disso;
- publicar (T1) ou reativar (T4) recusa a UF com erro de campo, como qualquer conteúdo inválido;
- um anúncio já `published` com UF fora da lista **continua público** até a próxima edição do dono, como os anúncios anteriores a DEC-046 (seção 17.3). Retirá-lo, pausá-lo ou restringi-lo automaticamente seria decisão de produto nova e não foi tomada.

**Provas.** Unitárias: `uf.test.ts` (27 UFs únicas e em ordem, `SP`, `DF`, normalização, `ZZ`, vazio, tipo inválido, patch omitido, filtro), `listing-form-uf.test.tsx` (seletor sem escolha inicial, erro e foco no seletor, escolha preservada em erro de outro campo, edição selecionada, legado sem UF escolhida) e `explorar.test.tsx` ("Todos os estados" e UF inválida da URL). Integração em PostgreSQL descartável com o Better Auth real: `listing-uf.integration.test.ts` (criação e edição sem escrita parcial, reabertura, legado em rascunho recusado em T1 e liberado depois da escolha, legado pausado recusado em T4, legado publicado visível e filtro `ZZ`/`XX1` vazio).

## 4. Rascunho, edição e publicação

### 4.1 Criação

- Todo anúncio **nasce em `draft`** (RF-004, [listing-lifecycle.md](../product/listing-lifecycle.md), seção 2), criado por conta autenticada, com email verificado e `status = active` (guard `validateSession`).
- A criação exige título, descrição, cidade e UF válidos (seção 3). **O rascunho pode existir sem nenhuma imagem**, e com imagens ainda não processadas, e com as alternativas de troca incompletas (seção 3.1).
- Criar rascunho não publica, não aceita termos e não torna nada visível a terceiros.

### 4.2 Edição

- Editável pelo dono em `draft`, `published` e `paused`; `closed` e `removed` são histórico somente leitura ([listing-lifecycle.md](../product/listing-lifecycle.md), seção 3).
- Edição em `published` altera o conteúdo público imediatamente e **não** muda o estado.
- Edição de anúncio `published` **não pode resultar em zero imagens válidas** ([image-policy.md](../product/image-policy.md), seção 3).
- Edição de anúncio `published` ou `paused` **não pode resultar em conteúdo com contato ou endereço detectável** (seção 10.1): o conteúdo resultante inteiro é revalidado, e o anúncio gravado antes de DEC-049 corrige o campo afetado na primeira edição (seção 10.2).
- Edição de anúncio `published` ou `paused` **não pode resultar em menos de três alternativas de troca** (seção 3.1). Desde #76, a edição roda numa transação sob a trava de linha do anúncio, filtrada pelo dono: o estado e as alternativas são lidos depois da trava, e a recusa não grava nada.
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
3. campos de conteúdo válidos segundo a seção 3, revalidados no ato, **incluindo as três alternativas de troca** (seção 3.1), lidas sob a trava;
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
| T4 | `paused` → `published` | dono | Reativar; exige pelo menos 1 imagem `ready` e as três alternativas de troca (seção 3.1), além da categoria comercial válida (seção 19) |
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
| `category` | string ou null | código do catálogo comercial (#89); null em rascunhos/legados sem escolha |
| `city` | string | `Listing.city` |
| `state` | string (UF) | `Listing.uf` |
| `createdAt` | data/hora | `Listing.createdAt` |
| `images[]` | lista | somente `ListingImage` `ready`, em `position` crescente |
| `images[].id` | UUID | identificador opaco da imagem, usado como chave de renderização |
| `images[].position` | inteiro | ordem; a primeira é a capa |
| `images[].derivatives[]` | lista | `kind` (`thumb`/`medium`/`large`), `url`, `width`, `height` |
| `tradeOptions` | lista de strings | **somente no detalhe** (`PublicListingDetail`): `ListingTradeOption.label`, em `position` crescente. Anúncio anterior a DEC-046 ainda não completado devolve lista vazia (seção 17.3). Listagem e home **não** carregam este campo |

```json
{
  "id": "5b0c…",
  "title": "Bicicleta aro 29",
  "description": "Bicicleta em ótimo estado.",
  "city": "Campinas",
  "state": "SP",
  "category": "esportes",
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

`title`, `description` e cada item de `tradeOptions` são o texto gravado, exceto quando contêm contato ou endereço detectável (anúncio gravado antes de DEC-049): então o campo vem com o texto neutro da seção 10.2.

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

Usado em "meus anúncios" e na edição, somente para o dono autenticado: `id`, `title`, `description`, `category` (código ou null), `city`, `state`, `tradeOptions` (as três posições, com texto vazio onde nada foi informado), `status`, `createdAt`, `updatedAt` e, para a gestão de imagens, as imagens do próprio anúncio com seu estado de processamento. `ownerId` não é devolvido: o dono é a própria sessão. O aceite de termos não é exibido como campo editável.

### 6.4 Entrada

- Criação: `{ title, description, city, state }`, todos obrigatórios, `category` opcional (#89, seção 19) e `tradeOptions` opcional (seção 3.1).
- Edição: subconjunto dos mesmos quatro campos, `category` e `tradeOptions`; os informados são validados como na criação, e a completude das alternativas depende do estado (seção 3.1).
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
| `state` | string (UF) | — | opcional; `trim` + maiúsculas; vazio é ignorado; sigla fora da lista de UFs (seção 3.2), como `ZZ` ou `XX1`, não corresponde a nenhum anúncio |

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
- Exibe as alternativas de troca (seção 3.1) numa seção "Aceita em troca", como lista de texto na ordem do anunciante e com a orientação de que basta uma delas. Anúncio anterior a DEC-046 ainda sem alternativas não exibe a seção.
- Na navegação pelo cliente (payload RSC), o Next.js 16.3.5 responde **HTTP 200** com o marcador de "não encontrado" no conteúdo, e não 404: é o comportamento do framework para qualquer página que chame `notFound()`, inclusive rota inexistente. O requisito "da mesma forma" vale nesse canal também: o conteúdo é o mesmo para todo anúncio indisponível (seção 16.3).

### 9.5 Home (`/`)

Pública. Apresenta o TROQS, mostra as ofertas recentes pela primeira página de `getPublicFeed` (mesma regra de visibilidade e ordenação, `limit = 12`) e navega para `/explorar`, `/login` e `/cadastro`. Carregamento, catálogo vazio e erro têm estados próprios; nenhuma oferta fictícia é exibida.

## 10. Conteúdo livre e dados pessoais

Título, descrição, alternativas de troca e cidade são **texto livre fornecido pelo usuário**.

- A plataforma **não** instrui o usuário a inserir telefone, WhatsApp, email, endereço ou outro dado pessoal no conteúdo. Rótulos, dicas e exemplos do formulário orientam a descrever o item e informar apenas a cidade e a UF.
- **Título, descrição e alternativas de troca não podem conter telefone, WhatsApp, e-mail ou endereço** (DEC-049, [#86](https://github.com/BrunoMNoronha/techlab-troq/issues/86)): contato escrito no anúncio público contornaria a liberação controlada de RB-001. A recusa automática cobre **os formatos documentados na seção 10.1**; é prevenção auxiliar ([prohibited-items.md](../product/prohibited-items.md), seção 5, itens 3 a 6), e **não se promete detecção perfeita** de telefone, endereço ou similar em texto livre.
- A proteção de RF-014 depende principalmente de **não serializar os campos protegidos do cadastro e do dono** (seção 6.2); a recusa no texto digitado é camada adicional.
- **Prevenção não é moderação.** Uma gravação recusada não é decisão de moderação, não conta para reincidência e não gera sanção (prohibited-items.md, seção 5, item 5). Conteúdo que escape à detecção continua tratável por denúncia e moderação no nível do anúncio (RF-018 a RF-020).
- O texto é sempre renderizado como texto, nunca como HTML.

Não fazem parte do MVP NLP, IA, serviço externo de análise, OCR de imagens nem moderação automática de conteúdo: a detecção é um conjunto de regras determinísticas no próprio código.

### 10.1 Contato e endereço no texto livre (DEC-049)

**Onde vale.** `title`, `description` e cada alternativa de troca preenchida. Cidade e UF têm regra própria de formato (seção 3) e não passam por esta verificação.

**Quando vale.** No servidor, que é a autoridade: criação, edição integral ou parcial (só os campos informados são lidos da entrada, e cada um passa pela regra) e chamada direta da Server Action com payload arbitrário. T1 (publicar) e T4 (reativar) **releem o conteúdo gravado sob a trava** e recusam o que a regra não aceita, sem transição, aceite ou auditoria. Editar anúncio `published` ou `paused` revalida o **conteúdo resultante inteiro**, não só o campo enviado (seção 10.2). Recusa não grava nada, nem o campo válido enviado junto.

**Erro.** Cada campo afetado recebe, no próprio campo, **"Não inclua telefone, WhatsApp, e-mail ou endereço neste campo."**; se título e descrição forem inválidos, os dois recebem o erro. A mensagem é fixa e **nunca reproduz o trecho detectado**; o detector devolve só a categoria, e nada é registrado em log ou telemetria. O formulário antecipa a mesma regra e a mesma mensagem, mantém o texto no campo para correção e não remove nada silenciosamente.

**Normalização só para detectar.** O texto gravado é o digitado (aparado). Para a detecção: NFKC (dígitos e letras de largura total, dígitos matemáticos, circulados e sobrescritos viram ASCII), remoção de caracteres invisíveis (largura zero, hífen suave, marcas de direção), traços Unicode unificados em `-`, acentos removidos, minúsculas e espaços colapsados.

| Categoria | Reconhecido | Não bloqueado de propósito |
| --- | --- | --- |
| Telefone | Número brasileiro com DDD (11 a 99, sem zero), com ou sem `+55`/`55`, `0` de longa distância e parênteses no DDD, e número de 9 dígitos começando por 9 ou de 8 começando por 2 a 9; separadores espaço, ponto e hífen; dígitos contínuos (`11987654321`); celular sem DDD (`98765-4321`, `9 8765-4321`, `987654321`); fixo sem DDD só como `XXXX-XXXX` ou `XXXX.XXXX`. Evasões: dígitos espalhados por espaço, ponto, hífen, `_` ou `*` (`1 1 9 8 …`), letra `O` no lugar de zero entre dígitos ou no fim | Medidas e quantidades (`55 polegadas`, `128 GB`, `120 x 80 cm`), anos e intervalos de anos (`2019/2020`, `2019-2020`, `2019 2020`), oito dígitos soltos (`código 12345678`), IMEI (15 dígitos), EAN-13, listas de tamanhos (`38 39 40 41 42`), preço |
| WhatsApp | `wa.me/…`, `wa.link/…`, `api.whatsapp.com`, `web.whatsapp.com`, `chat.whatsapp.com`, `whatsapp.com/send`, tolerando espaços em volta de `.` e `/` | A mera menção a "WhatsApp" ou "whats" |
| E-mail | `local@domínio.tld` usual; espaços em volta de `@` e `.`; `arroba`, `(at)`/`[at]`/`{at}`, `ponto`/`(dot)`/`[dot]` entre as partes; provedor conhecido sem domínio de topo (`fulano@gmail`) | "e-mail" como palavra, `@perfil` sem domínio, "arroba" como unidade de peso |
| Link de contato | `mailto:`, `tel:`, `callto:`, `sms:` com alvo colado aos dois-pontos; `whatsapp://` | O rótulo "Tel: a combinar" |
| Endereço | Logradouro (`rua`, `avenida`, `av`/`av.`, `al.`, `alameda`, `travessa`/`trav.`, `estrada`/`estr.`, `rodovia`/`rod.`, `praça`, `largo`, `viela`, `beco`, `servidão`, `ladeira`) + nome de até 6 palavras + número marcado por vírgula ou `nº`/`n.`/`número`, ou número seguido de complemento (`apto`, `bloco`, `casa`, `sala`, `conj.`, `andar`, `lote`, `quadra`…); `quadra … lote/conjunto/casa …`; CEP com hífen (`01310-100`, `01.310-100`) ou precedido de "CEP"; coordenadas decimais (`-23.5505, -46.6333`) e em graus/minutos; links de mapa (Google Maps, `goo.gl/maps`, `maps.app.goo.gl`, Waze) | A palavra isolada "rua"; o tipo usado como adjetivo ou seguido de conjunção ("bike de rua aro 29, 21 marchas", "para rua ou esteira, 42"); número seguido de unidade ou quantidade (`, 10 km`, `, 3 anos`); `TV` (travessa colide com televisão), `R.` e `AL` sem ponto (UF); cidade/UF |

**Limites conhecidos.** A regra é determinística e **contornável**: número por extenso ("onze nove oito…"), letras em outros alfabetos com aparência latina, dígitos espalhados com grupos de dois, endereço sem número marcado ("Rua Augusta 500") e outras redes sociais não são detectados. Falsos positivos possíveis: código de 10 ou 11 dígitos contínuos com a forma de DDD + número (inclusive ISBN-10), código no formato `12345-678`, e trechos como "estrada urbana, 18 marchas" fora dos padrões excluídos. O corpus está em `src/modules/listing/contact-detection.test.ts`; cada ajuste de regra entra com o caso que o motivou.

### 10.2 Anúncios gravados antes de DEC-049

A regra **não** executa limpeza em massa, **não** muda o estado de nenhum anúncio e **não** reescreve texto gravado.

| Estado | Efeito |
| --- | --- |
| `published` | **Continua público.** Nas consultas públicas (`getPublicFeed` e `getPublicListingDetail`, base da home, de `/explorar`, do detalhe, da metadata e do payload RSC), cada campo afetado sai substituído por um texto neutro: título "Anúncio em revisão", descrição "A descrição deste anúncio está em revisão pelo anunciante." e alternativa "Alternativa em revisão". Os demais campos seguem intactos. O `alt` das imagens e o `<title>` derivam do título já mascarado |
| `published`, `paused` (edição) | A primeira edição do dono, de qualquer campo, exige corrigir o campo afetado: o conteúdo resultante inteiro é revalidado. O formulário abre com o campo já marcado e a mensagem da seção 10.1, com o texto preservado |
| `paused` (T4), `draft` (T1) | Reativar e publicar recusam por campo até a correção. O rascunho aceita edição parcial de outro campo |
| `closed`, `removed` | Histórico somente leitura do dono, sem exposição pública |

**Cache.** Não há o que invalidar: as superfícies públicas são dinâmicas e respondem `private, no-cache, no-store` (seção 16), e a máscara é aplicada na própria consulta, a cada requisição. Uma regra nova ou ajustada passa a valer para o legado na requisição seguinte.

**Área privada.** O dono continua vendo o próprio texto ("Meus anúncios", edição): é o dado dele, e é dali que corrige. O DTO privado não é mascarado.

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
- **Contato e endereço** (seção 10.1): título e descrição têm dica associada por `aria-describedby` ("Não inclua telefone, WhatsApp, e-mail ou endereço"); a recusa aparece no campo, com foco no primeiro inválido e o texto preservado. A edição de anúncio gravado antes de DEC-049 abre com o campo afetado já marcado (seção 10.2).
- **Alternativas de troca** (seção 3.1): três campos rotulados "Alternativa 1" a "Alternativa 3", agrupados por `fieldset` com a legenda "O que você aceita em troca" e uma instrução comum (alternativas, não precisa oferecer as três, sem dado de contato, obrigatórias para publicar ou enquanto o anúncio estiver publicado ou pausado). Erro por campo, foco no primeiro inválido na ordem do formulário. O painel "Situação do anúncio" cita as alternativas como pré-condição de publicar e de reativar.

## 12. Divergências da implementação atual e destino

Conferência feita em `7296cb3`. Nenhuma foi corrigida por F2-005, que é documental; cada uma segue na issue indicada. D-7 a D-9 foram corrigidas depois, por F2-006 ([#44](https://github.com/BrunoMNoronha/techlab-troq/issues/44)); D-1 a D-4 e a parte de publicação de D-6, por F2-010 ([#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48)); D-10 a D-12 e a parte pública de D-13, por F2-011 ([#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49)); a verificação abrangente de D-8 e D-13 e o registro de D-5, por F2-012 ([#50](https://github.com/BrunoMNoronha/techlab-troq/issues/50)).

| # | Contrato | Implementação atual | Destino |
| --- | --- | --- | --- |
| D-1 | Descarte de rascunho é T2 `draft` → `closed` (seção 5) | **Corrigida em 2026-09-30.** O descarte grava `closed` e `closedAt`, nunca `removed`. Antes, `discardDraft` gravava `removed` e `removedAt` | [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48) |
| D-2 | Pré-condições de T1 verificadas na mesma transação do efeito; campos revalidados; versão do termo vinculada ao texto aceito (seção 4.4) | **Corrigida em 2026-09-30.** Estado, conteúdo e imagens prontas são lidos sob a trava do anúncio, na transação do efeito; `termsVersion` segue a seção 2.3; a repetição é idempotente. Antes, `publishListing` lia tudo fora da transação, não revalidava campos, gravava `'1.0'` fixo e dava erro à repetição | [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48) |
| D-3 | T4 exige pelo menos 1 imagem `ready` (seção 4.3) | **Corrigida em 2026-09-30.** A reativação exige imagem `ready` e conteúdo válido, sob a trava. Antes, `reactivateListing` não verificava imagens | [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48) |
| D-4 | Ações de ciclo de vida acessíveis pela interface, com confirmação em T2/T5/T6 | **Corrigida em 2026-09-30.** Painel "Situação do anúncio" na edição privada, com confirmação explícita em T2/T5/T6. Antes, as ações não tinham tela | [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48) |
| D-5 | Máximo de 6 imagens mesmo sob concorrência; posições consistentes | **Corrigida por #46 (F2-008)**; registro atualizado em 2026-09-30 por #50. A reserva roda sob a trava de linha do anúncio (`FOR UPDATE` em `src/modules/media/upload.ts`), e a posição é escolhida dentro da transação. Prova: "sexta e sétima concorrentes" e "reordenações concorrentes" em `media-pipeline.integration.test.ts`. Antes, a posição era `images.length + 1`, fora de transação | [#46](https://github.com/BrunoMNoronha/techlab-troq/issues/46) |
| D-6 | Remover imagem de anúncio `published` não pode deixar zero `ready`; `closed`/`removed` não são editáveis | **Corrigida.** A remoção recusa a última `ready` de anúncio `published` (#46, `last_ready_image`); publicação e reativação usam a mesma trava do anúncio e releem as imagens prontas, e a corrida com a remoção foi provada em 2026-09-30 (#48). Antes, `deleteListingImage` não verificava o estado nem a última imagem pronta | [#46](https://github.com/BrunoMNoronha/techlab-troq/issues/46), com a invariante de publicação em [#48](https://github.com/BrunoMNoronha/techlab-troq/issues/48) |
| D-7 | Descrição obrigatória após `trim`; mesmas regras na criação e na edição; UF com duas letras `A`–`Z` (seção 3) | **Corrigida em 2026-09-29.** Criação e edição usam a mesma validação (`src/modules/listing/validation.ts`). Antes, a criação aceitava descrição só com espaços e UF de dois caracteres quaisquer, e a edição não validava cidade nem UF | [#44](https://github.com/BrunoMNoronha/techlab-troq/issues/44) |
| D-8 | Anúncio alheio indistinguível de inexistente na área privada (seção 7) | **Corrigida em 2026-09-29.** A busca e o `UPDATE` são filtrados pelo dono da sessão, e alheio, inexistente e ID malformado dão a mesma resposta `not_found`. Antes, a resposta era "sem permissão" **Verificação abrangente concluída em 2026-09-30 (#50)**: as 13 actions sobre recurso e a edição por HTTP real respondem ao terceiro exatamente como a inexistente e a malformado ([phase-2-security-verification.md](../delivery/phase-2-security-verification.md), seções 3 e 4) | [#44](https://github.com/BrunoMNoronha/techlab-troq/issues/44) (correção) e [#50](https://github.com/BrunoMNoronha/techlab-troq/issues/50) (verificação abrangente) |
| D-9 | Erro por campo, foco em erro e dados preservados (seção 11) | **Corrigida em 2026-09-29.** O formulário marca o campo com `aria-invalid` e associa a mensagem, foca o primeiro erro, preserva os valores e bloqueia envio duplicado. Antes, havia só um aviso geral | [#44](https://github.com/BrunoMNoronha/techlab-troq/issues/44) |
| D-10 | `page` e `limit` validados, teto de 50, resposta com `page`/`limit` (seção 9) | **Corrigida em 2026-09-30.** `getPublicFeed` normaliza `page`, `limit`, `city` e `state` na própria função, inclusive quando chamada como Server Action com argumentos arbitrários, e responde `{ listings, total, page, limit }` (`src/modules/listing/public-query.ts`). Antes, aceitava qualquer `page`/`limit`, sem teto, e não devolvia os valores aplicados | [#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49) |
| D-11 | Desempate por `id` (seção 9.2) | **Corrigida em 2026-09-30.** Ordem `createdAt desc, id desc`; paginar 25 anúncios com o mesmo `createdAt` não repete nem omite nenhum (banco real). Antes, ordenava só por `createdAt` | [#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49) |
| D-12 | `/explorar` pagina e filtra por cidade/UF, com estados de carregamento e erro | **Corrigida em 2026-09-30.** `/explorar` lê `page`, `city` e `state`; tem filtro por formulário `GET`, paginação por links que preservam o filtro, estados de carregamento, vazio (com e sem filtro), página além da última e erro com nova tentativa. Antes, lia só `city`/`state`, sem paginação, filtro nem erro, e `city` só com espaços virava filtro vazio | [#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49) |
| D-13 | Ausência de contato e de dados privados provada em HTML/RSC/JSON/metadata/erros/cache | **Superfícies públicas provadas em 2026-09-30** por HTTP real contra build de produção, com banco descartável e R2 de `development`: home, `/explorar` e detalhe, em HTML e RSC, para anônimo, dono e terceiro; 404 uniforme; `Cache-Control` nunca público; retirada imediata após T3/T5 com cache aquecido (seção 16). **Verificação abrangente concluída em 2026-09-30 (#50)**: páginas privadas em HTML e RSC, as 15 actions para 9 atores, `/api/jobs`, `/api/auth` e telemetria com erro real, sem contato nem segredo ([phase-2-security-verification.md](../delivery/phase-2-security-verification.md)) | [#49](https://github.com/BrunoMNoronha/techlab-troq/issues/49) e [#50](https://github.com/BrunoMNoronha/techlab-troq/issues/50) |
| D-14 | URL de derivado revogável e retirada imediata do público ao sair de `published`; contrato em [media-pipeline-contract.md](media-pipeline-contract.md), seção 9 (rota `/media/{imageId}/{kind}`, bucket privado, `private, no-store`) | **Resolvida por F2-009:** DTO com `/media/{imageId}/{kind}`, rota com revogação por requisição, `private, no-store` ([media-pipeline-contract.md](media-pipeline-contract.md), seção 21) | [#47](https://github.com/BrunoMNoronha/techlab-troq/issues/47) |
| D-15 | Publicação respeita restrição/bloqueio de publicação (seção 4.4, item 6) | Sanções de moderação não implementadas | Fase 4 ([#55](https://github.com/BrunoMNoronha/techlab-troq/issues/55)) |

## 13. Rastreabilidade

| Referência | Relação com este contrato |
| --- | --- |
| RB-001 | Seção 8: contato só ao escolhido com pagamento aprovado; nunca no anúncio público |
| RB-005, RF-007, RNF-008 | Seções 2.5, 6.2 e 7: cidade/UF é a única localização coletada e exibida |
| RB-006, RF-018 a RF-020 | Seções 4.4, 5 e 10: declaração de conformidade, validações auxiliares, `removed` só por moderação |
| RB-001 | Seção 10.1: contato escrito no anúncio contornaria a liberação controlada, e por isso é recusado (DEC-049) |
| RF-004 | Seções 2 a 5: campos do MVP, validação, rascunho, publicação; RF-004 passa a `definido`. Seção 3.1 e 17: alternativas de troca (DEC-046) |
| RF-005 | Seções 7 e 9: visibilidade, paginação, ordenação, filtros e detalhe |
| RF-006, RNF-005 | Seções 2.4, 4.3 e 6.1: 1 a 6 imagens, somente derivados `ready`, dimensões conhecidas |
| RF-014 | Seções 6.2, 8 e 10: allowlist, contato fora de qualquer payload público, limites do texto livre; seções 10.1, 10.2 e 18: recusa de contato e endereço no texto livre e máscara do legado (DEC-049) |
| RF-022 | Seções 2.2, 2.3 e 4.4: transições e aceitação de conformidade registradas |
| RNF-001, RNF-010 | Seção 11 |
| RNF-007, RNF-014 | Seções 3, 4 e 9.1: validação e autorização no servidor |
| DEC-027, DEC-028, DEC-031 | Preservadas integralmente |
| DEC-049 | Seções 10.1, 10.2 e 18 |

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

Deployment `dpl_EtNnj2TESSMUToYP5enpYqghX5oB` (alias da branch `feat/f2-010-listing-lifecycle`, commit `c6e4c37`), com `BETTER_AUTH_URL` restrito à branch só para a prova. Conta sintética `@resend.dev`, cuja senha foi digitada pelo responsável. As superfícies públicas foram conferidas por HTTP **sem sessão do TROQS**, com acesso temporário de compartilhamento da Vercel.

| Passo | Resultado |
| --- | --- |
| Publicar rascunho com imagem pronta e aceite | `Publicado`; detalhe 200, `/media` 200 (`private, no-store`), presente em `/explorar` e na home |
| Pausar | detalhe e `/media` 404 na mesma URL, fora de `/explorar` e da home; o dono ainda recebe a miniatura (200) |
| Reativar | de volta a 200 e às listagens |
| Encerrar | a confirmação recebe o foco; antes de confirmar o anúncio segue publicado; depois, 404 e página somente leitura |
| Rascunho novo: publicar sem aceite e depois sem imagem | alerta focado com `compliance_required`; depois `no_ready_image` |
| Descartar: cancelar e depois confirmar | cancelar devolve o foco e mantém o rascunho; confirmar grava `closed` |
| Neon de `preview` (consulta somente leitura) | anúncio do ciclo: `draft>published, published>paused, paused>published, published>closed`; auditoria `listing.published(T1)` e `listing.closed(T5)`; um aceite `DEC-031/2026-09-14/declaracao-1` no mesmo instante da auditoria; `removed_at` nulo. Rascunho descartado: `draft>closed`, sem auditoria |

## 16. Estado da implementação de #49 (F2-011)

### 16.1 O que existe

| Mecanismo | Onde |
| --- | --- |
| Normalização de `page`, `limit`, `city` e `state` (seção 9.1), independente do tipo declarado | `src/modules/listing/public-query.ts` |
| `getPublicFeed` com ordem total, resposta `{ listings, total, page, limit }`, UF inválida sem consulta e deslocamento acima de int32 respondido só com a contagem | `src/modules/listing/actions.ts` |
| `/explorar`: formulário `GET` com rótulos, paginação por links (`aria-current` na posição, alvos de 44 px), estados de carregamento, vazio com e sem filtro, página além da última e erro com nova tentativa | `src/app/explorar/page.tsx`, `explorar-results.tsx` e `explorar-query.ts` |
| Detalhe com todas as imagens `ready` em ordem, `width`/`height`, `srcset`/`sizes` entre os três derivados e `alt` "Imagem i de n: título"; card com o mesmo `alt` e `srcset` | `src/app/explorar/[id]/page.tsx`, `src/app/_components/listing-card.tsx` e `listing-image.ts` |

A home não mudou: continua na primeira página com `limit = 12` (seção 9.5), agora recebendo `page`/`limit` aplicados. Nenhuma migration nem dependência nova.

### 16.2 Decisões técnicas

- **Carregamento sem amolecer o 404.** Não há `loading.tsx` em `/explorar`: ele envolveria `/explorar/[id]` e faria o `notFound()` do detalhe responder 200 (doc do Next, `loading.md`, Status Codes). O estado de carregamento é um `Suspense` **dentro** de `/explorar/page.tsx`, com chave pela URL. O erro é tratado no próprio componente, como na home, sem `error.tsx`.
- **Normalização fora de `actions.ts`.** Um módulo `'use server'` só exporta funções assíncronas. Por isso as funções puras ficam em `public-query.ts`, e `getPublicFeed` as aplica sobre o argumento recebido, sem confiar no tipo.
- **Texto da URL.** `/explorar` aceita `page` só com dígitos. `"1e3"`, `"2.0"` e `"-1"` valem 1. `limit` nunca é lido da URL.
- **Imagens.** Continuam sendo `<img>` pela rota `/media`, sem Image Optimization (media-pipeline-contract.md, 9.2). O `srcset` usa a largura real de cada derivado.

### 16.3 Comportamento do Next.js observado na prova

- **Payload RSC.** No Next 16.3.5, a requisição de navegação (`RSC: 1`) precisa do parâmetro `_rsc`, que é o hash dos cabeçalhos de roteamento: sem nenhum deles, o valor é vazio, e sem o parâmetro a resposta é 307 para `?_rsc`.
- **404 em RSC.** Para uma página que chama `notFound()`, a resposta RSC é **HTTP 200** com a linha `E{"digest":"NEXT_HTTP_ERROR_FALLBACK;404"}`. Rota inexistente se comporta igual. Em HTML, o status é 404 real.
- **Diferenças que não carregam dado.** O que muda entre duas respostas 404 é só isto: o próprio ID pedido (eco da URL); a posição dessa linha no stream (ID malformado é recusado antes da consulta, e a linha sai mais cedo); chaves por requisição derivadas do `requestId` nos elementos de metadata; os rastros do Sentry; e, desde que o layout raiz carrega a moldura da aplicação, a **divisão do payload RSC em linhas**, que o React faz por orçamento de bytes e que por isso depende do comprimento do ID pedido (um valor que quem pede já conhece) — o conteúdo é o mesmo. A prova normaliza exatamente isso e compara o resto byte a byte (no RSC, o conjunto de linhas), usando um ID malformado com o comprimento de um UUID; um malformado curto continua provado como 404 sem marcador privado, fora da comparação byte a byte.

### 16.4 Provas

| Camada | O que provou |
| --- | --- |
| Unitário (Prisma e consulta simulados) | tabela de normalização (`page`, `limit`, cidade e UF, inclusive `NaN`, `Infinity`, `2^60`, texto e não objeto); `orderBy` com desempate; `skip`/`take`; chamada como Server Action com valores arbitrários; UF inválida sem banco; deslocamento enorme só com contagem; allowlist. `/explorar`: links que preservam o filtro, `aria-current`, limites da paginação, vazio com e sem filtro, página além da última, erro sem detalhe interno, formulário `GET` rotulado. Detalhe: todas as imagens em ordem, `alt` posicional, dimensões, `srcset`, 404 e metadata genérica |
| PostgreSQL descartável (`public-listing.integration.test.ts`) | só `published` de dono `active` (4 estados ocultos e 3 contas não elegíveis); 25 anúncios com o mesmo `createdAt` paginados de 10 em 10 cobrem todos uma única vez, em `id` decrescente; página repetida estável; página além da última com deslocamentos até `Number.MAX_SAFE_INTEGER`; `limit` 10 000 → 50; filtros; detalhe só com imagens `ready` em ordem; DTO sem marcador de contato, email, dono ou estado |
| Build de produção + HTTP real (`public-surface.http.integration.test.ts`, com R2 de `development`) | `/` encaminha a `/explorar` (307); `/explorar` (filtro e duas páginas) e detalhe em HTML e RSC, para anônimo, terceiro e dono: 200, sem telefone, email, ids de usuário, ids de anúncios ocultos, imagem `uploaded`, `ownerId`, `termsVersion`, `updatedAt`, `publishedAt`, chaves de objeto ou estado; `Cache-Control` `private, no-cache, no-store`; paginação real com 20 + 3 anúncios distintos; 404 idêntico em HTML (e marcador idêntico em RSC) para `draft`, `paused`, `closed`, `removed`, as três contas não elegíveis, inexistente e malformado, inclusive para o dono; detalhe e `/media` aquecidos (200, bytes reais do R2) → pausa e encerramento pelas actions do dono → detalhe 404, RSC com o marcador, fora de `/explorar`, `/media` 404 `private, no-store`. Estável em 5 execuções seguidas; banco e bucket limpos ao final |
| Navegador a 375 px | `/explorar` com filtro sem rolagem horizontal; ordem de foco: voltar, cidade, UF, Filtrar, limpar filtro e ação do estado vazio |
| Vercel Preview | ver a seção 16.5 |

**Limites.** O erro de carregamento de `/explorar` e da home é provado só com consulta simulada: não há como derrubar o banco sob o servidor de prova sem afetar as demais suítes. A verificação abrangente das superfícies restritas continua na [#50](https://github.com/BrunoMNoronha/techlab-troq/issues/50).

### 16.5 Prova em Preview

Deployment `dpl_EDzuWuXqsJdCHKvmEg1Fnr2GYyMG` (branch `feat/f2-011-public-listing`, commit `2f77128`), sobre o Neon de `preview`. As requisições foram feitas **sem sessão do TROQS**, com acesso temporário de compartilhamento da Vercel e somente leitura. Nenhum dado foi gravado no banco compartilhado. O banco tinha dois anúncios, ambos `closed` (um com imagem pronta), e nenhum publicado.

| Verificação | Resultado |
| --- | --- |
| `/`, `/explorar`, `/explorar?page=2` e `/explorar?city=Recife&state=PE`, em HTML e RSC | 200; RSC `text/x-component`; nenhum marcador privado; `Cache-Control` `private, no-cache, no-store, max-age=0, must-revalidate` |
| Estados vazios | home sem oferta fictícia; `/explorar` vazio sem filtro; com filtro, sugere remover; UF `XX1` não corresponde; formulário `GET` com rótulos |
| Detalhe dos dois anúncios `closed`, de um UUID inexistente e de um ID malformado | HTML 404 idêntico após normalização; RSC 200 com o marcador de 404 e conteúdo idêntico; nenhum marcador privado |
| `/media` da imagem pronta do anúncio `closed` (`thumb`, `medium`, `large`) | 404 com `private, no-store` |

Resultado: 71 verificações, 0 falhas.

**Limite.** Paginação com dados, detalhe visível e retirada após T3/T5 **não** foram exercitados no Preview, porque não havia anúncio publicado, e publicar exigiria escrever no banco compartilhado com a conta do responsável. Essas provas estão na seção 16.4, sobre build de produção local, com banco descartável e R2 de `development`.

## 17. Estado da implementação de #76 (DEC-046)

### 17.1 O que existe

- **Modelo.** `ListingTradeOption` (`listing_trade_options`): `listing_id`, `position` (`SMALLINT`), `label`, com `UNIQUE (listing_id, position)`, `CHECK (position BETWEEN 1 AND 3)` e `CHECK (label = btrim(label) AND char_length(label) BETWEEN 1 AND 60)`. A chave estrangeira usa `ON DELETE CASCADE`: a alternativa é conteúdo do anúncio, sem objeto externo nem fato histórico. Migration aditiva `20261004232041_listing_trade_options` ([../engineering/database.md](../engineering/database.md), seção 19).
- **Validação.** `validateTradeOptions(input, requireComplete)` e `toTradeOptionSlots` em `src/modules/listing/validation.ts`, reutilizadas pelo formulário só para antecipar a mensagem.
- **Escrita.** `createDraftListing` grava o anúncio e as alternativas preenchidas numa criação aninhada (tudo ou nada). `updateListing` passou de `updateMany` condicionado para uma transação sob `lockOwnedListing` (`FOR UPDATE` filtrado pelo dono, exportado de `lifecycle.ts`): anúncio alheio ou inexistente continua `not_found`, terminal continua `not_editable`, e a completude em `published`/`paused` é verificada antes de qualquer escrita.
- **Transições.** `transitionListing` lê as alternativas depois da trava e recusa T1 e T4 incompletos com `validation` e erro por campo (`tradeOption1` a `tradeOption3`), junto com os erros de conteúdo.
- **Leitura.** `getListingForEdit` e `getOwnerListings` devolvem `tradeOptions` com as três posições; `getPublicListingDetail` devolve `PublicListingDetail`, com os textos em ordem. `getPublicFeed` não mudou.
- **Interface.** Formulário de criação e edição (seção 11), histórico somente leitura de `closed`/`removed` com as alternativas, seção "Aceita em troca" no detalhe público e textos do painel de situação.

### 17.2 Decisões técnicas

- **Tabela própria em vez de coluna `text[]`.** Dá `CHECK` por linha (posição e texto), unicidade da posição e o mesmo padrão de `ListingImage`, sem `CHECK` sobre elementos de vetor.
- **Posição preservada no rascunho.** Só as posições preenchidas viram linha; a posição vazia volta como texto vazio no mesmo campo.
- **Completude como regra de aplicação sob a trava**, e não de banco (seção 3.1), por causa do rascunho e do legado.
- **Mensagem única por campo** ("Informe esta alternativa de troca, com até 60 caracteres."), para vazio e para excesso, no estilo das mensagens da seção 3.

### 17.3 Anúncios anteriores a DEC-046

A migration **não** preenche alternativas, **não** muda o estado de nenhum anúncio e **não** apaga nada. O tratamento dos registros existentes:

| Estado no momento da migration | Efeito |
| --- | --- |
| `draft` | Nada muda; o dono completa as três antes de publicar (T1 recusa incompleto) |
| `published` | **Continua público**, sem retirada silenciosa. O detalhe não mostra a seção "Aceita em troca". A primeira edição do dono, de qualquer campo, exige completar as três; até lá, o anúncio segue como está |
| `paused` | Continua pausado. Reativar (T4) e editar exigem as três |
| `closed`, `removed` | Histórico somente leitura, sem alternativas ("Não informado") |

Nenhum anúncio é retirado do ar por esta regra. Retirar ou pausar automaticamente os publicados incompletos seria decisão de produto nova e não foi tomada. Conferência só de leitura e por agregados no Neon de `preview` em 2026-10-04, antes do `migrate deploy`: 4 anúncios, todos `closed`; nenhum `draft`, `published` ou `paused` fica sem alternativas. `production` não está provisionado.

### 17.4 Provas

| Camada | O que prova | Onde |
| --- | --- | --- |
| Unitária | Forma (0, 2 e 4 itens, texto, objeto, nulo), vazio e só espaços por estado, limite de 60 após `trim`, item não texto, posições | `validation.test.ts` |
| Unitária | Criação aninhada, rascunho incompleto por posição, recusa antes do banco, edição sob a trava filtrada pelo dono, `published`/`paused` sem esvaziar, legado exigindo completar, terminal e alheio sem escrita | `listing.test.ts`, `security-audit.test.ts` |
| Unitária | T1 recusado sem as três, com erro por campo e sem transição, aceite ou auditoria | `lifecycle.test.ts` |
| Unitária (interface) | Grupo com legenda e instrução, três campos com rótulo e `maxLength`, rascunho incompleto enviado na ordem, exigência em publicado com foco no primeiro inválido, erro do servidor no campo; detalhe com lista de texto (marcação injetada continua texto) e legado sem seção | `listing-form.test.tsx`, `explorar/[id]/page.test.tsx` |
| Integração (PostgreSQL descartável, Better Auth real) | Criar, reabrir e editar preservando conteúdo e ordem; rascunho incompleto retomado; publicado recusando 2, 4, vazio, só espaços e 61 caracteres sem alteração parcial (nem do título enviado junto); terceiro recebendo o mesmo `not_found` de um UUID inexistente sem alterar nada; legado publicado visível e completado pela edição; corrida com transição para `closed` | `listing-drafts.integration.test.ts` |
| Integração | T1 incompleto recusado e liberado depois de completar; `CHECK` do banco recusando texto só com espaços; corrida determinística (edição segura a trava e esvazia uma alternativa, a publicação espera e recusa); corrida pelas actions reais em 6 rodadas sem anúncio público incompleto; T4 de pausado sem alternativas recusado e liberado depois de completar | `listing-lifecycle.integration.test.ts` |
| Integração | Allowlist: o feed mantém os sete campos e só o detalhe acrescenta `tradeOptions`; ordem por posição mesmo gravadas fora de ordem; legado publicado continua no detalhe com lista vazia | `public-listing.integration.test.ts` |
| HTTP real (build de produção) | Detalhe anônimo com as três alternativas em ordem e marcação escapada; listagem e home sem o campo; nenhuma regressão de RF-014 nas superfícies públicas e privadas | `public-surface.http.integration.test.ts`, `private-surface.http.integration.test.ts` |

### 17.5 Homologação em `preview` (2026-10-05)

| Item | Valor |
| --- | --- |
| Código | `main` em `af43ac2` (squash da [#121](https://github.com/BrunoMNoronha/techlab-troq/pull/121)), na branch `proof-76-preview`, com um commit vazio só para disparar o deploy |
| Deployment | `dpl_HUbBFVkZsNjTJdbEqpzhXaiD48aF`, alias da branch, Neon `preview`, R2 `troq-media-preview` |
| Migration | `migrate-preview` run `37247431974` (`success`) aplicou `20261004232041_listing_trade_options`. Conferência só de leitura: registrada sem rollback, tabela vazia com os dois `CHECK` e a FK `ON DELETE CASCADE`; os 4 anúncios existentes eram `closed` e não mudaram |
| Configuração temporária | `BETTER_AUTH_URL` restrita à branch, criada antes do deploy e **removida** depois da prova; no Preview volta a restar só `BETTER_AUTH_SECRET` |
| Método | Navegador embutido a 375 × 812, pelo método assistido: Bruno digitou a senha de uma conta de teste já verificada; o agente fez o resto. Consulta anônima por script com cookie jar e link de acesso da Vercel (só `_vercel_jwt`, sem sessão do app) |

| Passo | Resultado |
| --- | --- |
| Rascunho com só a alternativa 2 | salvo; reaberto com `['', 'Um videogame', '']`, campos não obrigatórios e a instrução de rascunho |
| Publicar incompleto, com aceite | recusado: "Campos a corrigir: alternativa de troca 1, alternativa de troca 3"; estado `draft` |
| Imagem enviada pelo navegador | `ready` pelo `after()` em cerca de 10 s |
| Completar e publicar | as três salvas na ordem, inclusive `Uma câmera <b>digital</b>`; publicado |
| Esvaziar a alternativa 2 do publicado | recusado no campo, com foco e `aria-invalid`; instrução "obrigatórias enquanto o anúncio estiver publicado ou pausado" |
| Pausar e reativar | `published → paused → published`; o painel pausado cita as alternativas como pré-condição |
| Detalhe anônimo | HTTP 200, `Cache-Control: private, no-cache, no-store`; seção "Aceita em troca" com a orientação, as três em ordem e a marcação escapada (nunca como elemento); `get-session` nulo; listagem com o anúncio e sem as alternativas; home sem elas |
| Banco (agregados do anúncio) | 3 alternativas nas posições 1 a 3, 1 imagem `ready`, transições `draft>published,published>paused,paused>published`, 1 aceite, 1 auditoria |
| Logs do deployment | nenhum 4xx ou 5xx; os únicos registros de nível erro são o aviso preexistente de `sslmode` do `pg` |
| Encerramento | o anúncio de teste foi encerrado (T5) com confirmação; o histórico somente leitura mostra "Aceita em troca"; o detalhe anônimo passou a 404 e o anúncio saiu da listagem |

Não exercitado em `preview`: anúncio publicado anterior a DEC-046, porque não existe nenhum no Neon de `preview`. O comportamento está provado em banco descartável (seção 17.4).

## 18. Estado da implementação de #86 (DEC-049)

### 18.1 O que existe

| Mecanismo | Onde |
| --- | --- |
| Detector determinístico e puro: normalização só para detectar e regras por categoria (seção 10.1); devolve só as categorias, nunca o trecho | `src/modules/listing/contact-detection.ts` |
| Regra aplicada a `title`, `description` e alternativas de troca, com a mensagem fixa por campo; `contactFieldErrors` para o formulário marcar o conteúdo gravado | `src/modules/listing/validation.ts` |
| Criação, edição (patch validado antes do banco; conteúdo resultante inteiro revalidado sob a trava em `published`/`paused`) | `createDraftListing` e `updateListing` em `src/modules/listing/actions.ts` |
| T1 e T4 | sem mudança de código: `transitionListing` já relia o conteúdo sob a trava com `validateListingContent` e `validateTradeOptions`, que agora incluem a regra |
| Máscara do legado nas consultas públicas (seção 10.2) | `src/modules/listing/public-content.ts`, aplicada em `getPublicFeed` e `getPublicListingDetail` |
| Formulário: dica no título e na descrição, erro no campo, foco no primeiro inválido, texto preservado, campo legado marcado ao abrir | `src/app/anuncios/_components/listing-form.tsx` |

Nenhuma migration, dependência ou variável de ambiente nova. Nada é registrado em log quando a regra recusa.

### 18.2 Decisões técnicas

- **Alternativas de troca incluídas.** A issue foi escrita antes de [#76](https://github.com/BrunoMNoronha/techlab-troq/issues/76) e deixou as alternativas fora do escopo; a seção 3.1, escrita depois por #76, já determinava que a validação de #86 valesse também para elas, e elas são texto livre público no detalhe. Excluí-las deixaria o mesmo desvio de RB-001 em outro campo.
- **Máscara em vez de retirar o anúncio do ar.** Esconder o anúncio exigiria filtrar depois da consulta (o detector é código, não SQL), quebrando `total` e a paginação (seção 9), ou mudar o estado, o que seria decisão de produto nova (DEC-027). A máscara campo a campo mantém o contrato da listagem, não depende de cache e passa a valer na requisição seguinte a qualquer ajuste de regra. Mesmo critério do legado de DEC-046 (seção 17.3).
- **Revalidação do conteúdo resultante só em `published`/`paused`.** É o conteúdo exposto (ou prestes a voltar); no rascunho, a edição parcial continua livre e T1 barra a publicação.
- **Regex com lookbehind.** Suportado por todos os navegadores do alvo do Next 16 (Safari 16.4+); o detector roda também no cliente, só para antecipar a mensagem.

### 18.3 Provas

| Camada | O que prova | Onde |
| --- | --- | --- |
| Unitária (corpus) | 75 textos recusados por categoria — telefone (formatos e evasões: espalhado, `_`, largura total, dígitos matemáticos, largura zero, travessão, `O` por zero), WhatsApp, e-mail (ofuscações), links `mailto:`/`tel:`/`sms:`/`whatsapp://`, endereço (logradouro, complemento, quadra/lote, CEP, coordenadas, mapas) — e 41 aceitos, inclusive os casos da issue, anos, códigos, IMEI, EAN, tamanhos, "de rua"/"de estrada", menções a WhatsApp/e-mail e "Tel: a combinar"; categorias sem o trecho | `contact-detection.test.ts` |
| Unitária | Cada categoria em título e descrição, erro nos dois campos, edição parcial, alternativa em qualquer estado, mensagem sem o dado; edição recusada antes do banco; legado `published`/`paused` exige corrigir sem escrita; correção aceita; rascunho legado com edição parcial; T1 e T4 recusados sem transição, aceite ou auditoria; feed e detalhe mascarando campo a campo | `validation.test.ts`, `listing.test.ts`, `lifecycle.test.ts` |
| Unitária (interface) | Dica associada ao título e à descrição; erro antecipado nos dois campos com foco no título e texto preservado, sem chamar o servidor; recusa do servidor no campo; edição de legado abre com o campo marcado | `listing-form.test.tsx` |
| Integração (PostgreSQL 17 descartável, Better Auth real) | Criação recusada sem linha nova; edição em `draft`/`published`/`paused` sem gravar nem o campo válido enviado junto; chamada direta com `status` adulterado; legado publicado bloqueia edição de outro campo, aceita a correção e o detalhe passa a mostrar o texto corrigido; T1 recusado e liberado após a correção; T4 recusado com o anúncio `paused` e contagens intactas; feed e detalhe mascarando título, descrição e alternativa sem alterar o banco; a prova de telemetria de #50 passou a separar o erro real de banco (conteúdo válido) da recusa da entrada com contato, que não chega ao banco nem ecoa o número | `listing-drafts`, `listing-lifecycle`, `public-listing` e `telemetry-redaction.integration.test.ts` |
| HTTP real (`pnpm build` + `pnpm start`) | Legado publicado com telefone, endereço, e-mail e link de WhatsApp: home, `/explorar` e detalhe, em HTML e RSC, para anônimo, terceiro e dono, sem nenhum dos trechos no corpo nem nos cabeçalhos; `<title>`, `alt` e listagem com o texto neutro; `Cache-Control` nunca público | `public-surface.http.integration.test.ts` |
| Navegador embutido, 375 px, build de produção local com banco descartável | Criar com telefone no título e endereço na descrição → erro nos dois campos, foco no título, texto mantido, sem rolagem horizontal → corrigir e salvar ("aro 29, 21 marchas" aceito) → editar com e-mail ofuscado na alternativa → erro no campo → corrigir e salvar → publicar (imagem pronta semeada no banco; sem R2 neste ambiente) → pausar → contato gravado direto no banco → edição abre com a descrição marcada → reativar recusado, segue `paused`, alerta sem o número → status forçado a `published` → detalhe com a descrição mascarada e título intacto; HTML e RSC anônimos de detalhe, `/explorar` e home sem o número → salvar sem corrigir recusado → corrigir → detalhe anônimo com o texto novo. Log do servidor sem nenhum dos dados | — |

**Não executado:** homologação em `preview`. Não há migration; a prova em `preview` depende do deploy da branch com `BETTER_AUTH_URL` restrita a ela e de login assistido, como na seção 17.5.

## 19. Categoria de produto (#89)

As allowlists de entrada, DTO do dono, feed público e detalhe público incluem explicitamente `category: string | null`. Somente códigos do catálogo comercial são aceitos. Ausência é exibida como “Categoria não informada”. O patch omitido não altera a categoria; null/vazio limpa somente rascunhos. Categoria e demais alterações são gravadas na mesma transação, sob a trava do anúncio. Publicar, reativar e editar `published`/`paused` exigem categoria válida no conteúdo resultante. Legados continuam visíveis conforme os gates anteriores, sem backfill ou mudança de estado, e são regularizados pelo dono. Cards da home/explorar compartilham catálogo e apresentação; não há filtro por categoria. Regras completas: [product-categories.md](../product/product-categories.md).
