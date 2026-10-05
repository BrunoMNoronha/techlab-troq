# Design System — TROQS

Fundação visual da aplicação: identidade, tokens, layout, componentes e padrões de tela. Este documento é a referência para criar ou alterar qualquer interface. A regra central é simples: **uma tela nova se monta com os componentes de `src/components`, sem CSS novo e sem estilo inline.**

Documentos irmãos: [conventions.md](conventions.md) (código e fronteiras) e [testing.md](testing.md). Este documento não altera regra de negócio, contrato de módulo nem decisão registrada.

## 1. Princípios

1. **Mobile-first.** Todo estilo parte de 320px; telas maiores só acrescentam (`min-width`). Nada é desenhado para desktop e depois espremido.
2. **Tarefa antes de decoração.** Uma ação principal por tela, informação essencial primeiro, conteúdo secundário recolhido ou abaixo.
3. **Consistência por construção.** Cor, espaçamento, raio e tipografia vêm de tokens; padrões de tela vêm de componentes. Não há valor mágico em tela.
4. **Acessível por padrão.** Semântica HTML nativa, foco visível, alvo de toque de 44px, contraste AA, estado nunca comunicado só por cor.
5. **Sem dependência para o que a plataforma faz.** CSS Modules nativos do Next.js, `<dialog>`, `<details>`, seletores nativos de data e arquivo. Não há framework de UI nem biblioteca de ícones.

## 2. Arquitetura visual

```
src/
  styles/
    tokens.css          tokens (custom properties) — fonte única de valores
    globals.css         reset, tipografia dos elementos, foco, .sr-only
  components/
    ui/                 primitivas: Button, Icon, Card (CardBody, CardFooter), Badge, Divider, Accordion, Tooltip, Heading, Text, TextLink, Prose
    forms/              Form, Field, Input, Textarea, Select, Checkbox, Radio, Switch, SearchInput, DateInput, FileUpload, Fieldset, FieldRow, FormActions, Filters
    feedback/           Alert, EmptyState, ErrorState, Spinner, Skeleton, Progress, ToastProvider/useToast
    layout/             AppShell, PageContainer, PageHeader, Section, Stack, Cluster, Grow, Grid, GridItem
    navigation/         BackLink, Breadcrumb, Pagination, Stepper, Tabs
    data-display/       DataTable, List/ListItem, CardList, DescriptionList, StatCard, MediaFrame
    overlay/            Dialog (Modal, Drawer, Sheet), Dropdown, Popover
  app/
    layout.tsx          importa globals.css e monta o AppShell
    design-system/      vitrine e páginas-modelo (fora de produção)
```

Composição, de fora para dentro: **Página → Seções → Componentes de funcionalidade → Componentes de UI → Primitivas.**

- **Componentes de UI** (`src/components`) não conhecem regra de negócio, módulo de domínio nem sessão. Recebem dados prontos por props.
- **Componentes de funcionalidade** moram junto da rota (`src/app/<rota>/_components`), conhecem o domínio e são montados só com componentes de UI.
- **Estilo** mora em CSS Module ao lado do componente de UI e consome apenas tokens semânticos. `globals.css` não recebe estilo de tela nem de componente.
- Cada pasta tem um `index.ts`; importe de `@/components/<pasta>`.

## 3. Identidade

Sistema claro, sóbrio e direto: superfícies brancas sobre fundo cinza-azulado muito claro, um único azul de ação, tipografia de sistema e bordas finas no lugar de sombras. A cor de destaque (verde-água) fica reservada ao que é próprio do produto — a troca. Transmite confiança e organização sem competir com o conteúdo dos anúncios.

### 3.1 Cores

Use sempre o token semântico (`var(--color-*)`). A paleta crua (`--palette-*`) só existe dentro de `tokens.css`.

| Papel | Token | Valor | Uso |
| --- | --- | --- | --- |
| Primária | `--color-primary` (+ `-hover`, `-active`) | `#1d4ed8` | Ação principal, link, item ativo |
| Primária suave | `--color-primary-soft`, `--color-primary-border` | `#eff6ff`, `#bfdbfe` | Fundo de seleção e destaque leve |
| Secundária | `--color-secondary` | `#0f172a` | Botão neutro forte, toast, tooltip |
| Destaque | `--color-accent` (+ `-soft`, `-border`, `-text`) | `#0f766e` | Elementos de troca; uso pontual |
| Fundo | `--color-background` | `#f8fafc` | Fundo da página |
| Superfície | `--color-surface` | `#ffffff` | Cartões, cabeçalho, controles |
| Superfície suave | `--color-surface-muted` | `#f1f5f9` | Painéis, hover, desabilitado |
| Texto | `--color-text` | `#0f172a` | Texto principal (17,8:1 sobre a superfície) |
| Texto suave | `--color-text-muted` | `#475569` | Descrições e apoio (7,6:1) |
| Texto sutil | `--color-text-subtle` | `#64748b` | Placeholder e ícones de apoio (4,8:1) |
| Borda | `--color-border`, `--color-border-strong` | `#e2e8f0`, `#cbd5e1` | Divisórias e contornos decorativos |
| Borda de controle | `--color-border-control` | `#76859b` | Campos de formulário (≥ 3:1) |
| Sucesso | `--color-success` (+ `-soft`, `-border`, `-text`) | `#15803d` | Confirmação, concluído |
| Atenção | `--color-warning` (+ `-soft`, `-border`, `-text`) | `#b45309` | Pendência, prazo |
| Erro | `--color-error` (+ `-soft`, `-border`, `-text`) | `#b91c1c` | Falha, validação, ação destrutiva |
| Informação | `--color-info` (+ `-soft`, `-border`, `-text`) | `#0369a1` | Aviso neutro, orientação |

Cada cor de estado tem quatro tons: a cor cheia (ícone, botão), `-soft` (fundo), `-border` e `-text` (texto sobre o fundo suave, sempre AA). O tema é só claro (`color-scheme: light`).

### 3.2 Tipografia

Fonte de sistema (`--font-sans`): sem download, sem salto de layout. Tamanhos em `rem`.

| Estilo | Token | Tamanho | Peso | Altura de linha |
| --- | --- | --- | --- | --- |
| Display | `--text-display` | 28 → 40px (fluido) | 700 | 1,15 |
| H1 | `--text-h1` | 24 → 28px (fluido) | 700 | 1,3 |
| H2 | `--text-h2` | 20px | 600 | 1,3 |
| H3 | `--text-h3` | 18px | 600 | 1,3 |
| H4 | `--text-h4` | 16px | 600 | 1,3 |
| Body | `--text-body` | 16px | 400 | 1,5 |
| Body small | `--text-body-small` | 14px | 400 | 1,4 |
| Caption | `--text-caption` | 12px | 400 | 1,4 |
| Label | `--text-label` | 14px | 600 | 1,4 |

`<h1>`–`<h4>` já saem estilizados pelo `globals.css`. Use `Heading` quando o tamanho visual precisar diferir do nível semântico, e `Text` para corpo com variação (`size`, `tone`, `weight`, `clamp`, `wrapAnywhere`). Há um `<h1>` por página, renderizado pelo `PageHeader`.

### 3.3 Espaçamento

Escala única: **4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64** px → `--space-1`, `-2`, `-3`, `-4`, `-6`, `-8`, `-10`, `-12`, `-16`. Em tela, o espaçamento vem do `gap` de `Stack`, `Cluster` e `Grid` (`gap={1|2|3|4|6|8|12}`), nunca de margem avulsa.

Referência: 8px dentro de um grupo, 16px entre campos e itens, 24px entre blocos, 32–48px entre seções.

### 3.4 Raio, sombra e camadas

| Token | Valor | Uso |
| --- | --- | --- |
| `--radius-sm` | 6px | Botões, campos, itens de menu |
| `--radius-md` | 10px | Cartões, alertas, painéis |
| `--radius-lg` | 16px | Diálogos e folhas |
| `--radius-full` | 999px | Badges, etapas, botões de ícone |
| `--shadow-sm` | — | Cartão elevado (raro) |
| `--shadow-md` | — | Hover de cartão clicável, menus |
| `--shadow-lg` | — | Diálogos e toasts |

Separação se faz com borda de 1px; sombra só para o que flutua. Camadas: `--z-sticky` (100) < `--z-nav` (200) < `--z-dropdown` (300) < `--z-overlay` (400) < `--z-toast` (500).

### 3.5 Breakpoints e containers

Breakpoints fixos, sempre `min-width`: **sm 480px · md 768px · lg 1024px · xl 1280px.** Media query só existe dentro de CSS Module de componente de UI; tela não declara breakpoint.

Larguras de conteúdo (`PageContainer width`): `narrow` 30rem (autenticação, mensagens), `content` 40rem (formulários, listas, detalhes), `wide` 65rem (vitrines, painéis). A calha lateral (`--gutter`) é 16px e passa a 24px em md.

### 3.6 Movimento e foco

Transições de 150ms (`--duration-fast`) ou 200ms (`--duration-base`) com `--ease-standard`, só em cor, borda, sombra e entrada de overlay. Com `prefers-reduced-motion`, os tokens de duração zeram e as animações de entrada são removidas.

Foco: contorno de 2px na cor primária em todo elemento interativo (`:focus-visible`), definido uma vez em `globals.css`. Nenhum componente remove o contorno.

### 3.7 Ícones

Conjunto próprio em `src/components/ui/icon.tsx`: traço de 2px, grade de 24px, cor herdada do texto. Tamanhos: 16 (em linha), 20 (controles), 24 (navegação), 32/40 (estados). Ícone é decorativo por padrão (`aria-hidden`); passe `label` quando ele for a única informação. Não use emoji como ícone nem outra biblioteca: ícone novo entra em `icon.tsx`, no mesmo traço.

## 4. Layout e App Shell

`AppShell` (montado em `src/app/layout.tsx`) envolve todas as rotas:

- **Cabeçalho fixo** com marca, navegação principal (a partir de md) e a ação principal do produto ("Anunciar").
- **Navegação inferior** no celular (até cinco destinos, com ícone e rótulo), ao alcance do polegar e respeitando a área segura do aparelho. Some a partir de md, quando a navegação vai para o cabeçalho.
- **Link "Pular para o conteúdo"** como primeiro elemento focável.
- **Rodapé** em telas largas.

O shell não lê sessão: os destinos são os mesmos para todos, e as rotas privadas continuam redirecionando no servidor. Destino novo se acrescenta nas listas de `layout.tsx`.

Toda página renderiza um `PageContainer` (que é o `<main>`) e, dentro dele, um `PageHeader`:

```tsx
<PageContainer width="content">
  <PageHeader
    navigation={<BackLink href="/anuncios">Meus anúncios</BackLink>}
    title="Editar anúncio"
    description="As alterações valem assim que você salvar."
    meta={<Badge tone="success">Publicado</Badge>}
    actions={<ButtonLink href="/anuncios/novo" iconStart="plus">Novo anúncio</ButtonLink>}
  />
  <Stack gap={6}>…seções…</Stack>
</PageContainer>
```

Primitivas de layout: `Stack` (coluna), `Cluster` (linha que quebra; `justify="between"` para título + ação), `Grow` (filho que ocupa o resto), `Grid` (`columns="sm|md|lg"` para grades automáticas, `columns="split"` para conteúdo + lateral que empilha até lg; `GridItem full` ocupa a linha inteira) e `Section` (título + descrição + ações + conteúdo).

## 5. Componentes

### 5.1 Ações

| Componente | Quando usar |
| --- | --- |
| `Button` | Ação na própria tela (enviar, confirmar). `variant`: `primary` (uma por tela), `secondary`, `outline`, `ghost`, `danger`, `dangerOutline`. `size`: `sm`, `md` (44px), `lg`. `loading` desabilita e marca `aria-busy`. `fullWidth` no celular. |
| `ButtonLink` | Navegação com aparência de botão. `reload` usa `<a>` nativo (recarga completa). |
| `IconButton` | Ação só com ícone; `label` obrigatório. |
| `TextLink` | Link de texto em destaque; `touch` garante 44px quando está sozinho na linha. |

Navegação é link, ação é botão. Estados cobertos: padrão, hover, foco, ativo, desabilitado e carregando.

### 5.2 Formulários

`Form` empilha campos com o espaçamento padrão. Cada campo é um `Field` com `label`, `htmlFor`, `hint`, `error`, `required`/`optional`:

```tsx
<Field label="Cidade" htmlFor="city" hint="Aparece no anúncio." error={errors.city}>
  <Input
    id="city"
    name="city"
    aria-invalid={errors.city ? true : undefined}
    aria-describedby={describedBy('city-hint', errors.city && 'city-error')}
  />
</Field>
```

- Controles: `Input`, `Textarea`, `Select`, `DateInput`, `SearchInput`, `Checkbox`, `Radio`, `Switch`, `FileUpload`. Todos repassam os atributos nativos (`disabled`, `readOnly`, `required`, `placeholder`, `ref`).
- Erro: o chamador marca `aria-invalid` no controle; o estilo decorre do atributo. A mensagem tem ícone além da cor e fica ligada por `aria-describedby` (ids padrão `<id>-hint` e `<id>-error`).
- Texto do controle em 16px (sem zoom automático no iOS) e altura mínima de 44px.
- `Fieldset` agrupa campos relacionados com legenda; `FieldRow` põe campos curtos lado a lado quando cabem.
- `FormActions`: primária primeiro; empilha no celular e alinha em linha a partir de 480px. `sticky` fixa as ações acima da navegação inferior em formulários longos.
- Resultado do envio: erro geral em `Alert tone="error" role="alert"` no topo do formulário, recebendo o foco; sucesso por redirecionamento, `Alert tone="success"` ou toast.
- Placeholder é exemplo, nunca substitui o rótulo.

### 5.3 Feedback e estados

| Estado | Componente |
| --- | --- |
| Carregando conteúdo | `Skeleton` (`text`, `title`, `block`, `media`) na forma do que virá, dentro de um contêiner `role="status"` |
| Operação em andamento | `Button loading` ou `Spinner` |
| Progresso determinado | `Progress` |
| Vazio / sem resultados | `EmptyState` com título, explicação e a ação de saída |
| Falha ao carregar | `ErrorState` com "Tentar novamente" |
| Aviso em linha | `Alert` (`info`, `success`, `warning`, `error`, `neutral`), com `title` opcional |
| Confirmação breve | `useToast().show('Salvo')` |
| Rótulo de estado | `Badge` (`neutral`, `primary`, `accent`, `success`, `warning`, `error`, `info`) |

Toda operação assíncrona mostra estado: desabilite o gatilho enquanto roda, preserve o que a pessoa digitou em caso de erro e diga o que fazer em seguida. Reserve o espaço do conteúdo que vai chegar (`Skeleton`, `MediaFrame`) para a tela não saltar.

### 5.4 Dados e listagens

- **`CardList` + `Card as="li"`**: padrão de listagem de registros ricos (título, estado, resumo, ações). É o que o celular pede e escala bem até telas largas.
- **`DataTable`**: dados tabulares comparáveis. A partir de 768px é uma tabela; abaixo disso cada linha vira um cartão, sem rolagem horizontal. Defina o papel das colunas: `primary` (título do cartão), `actions` (rodapé do cartão), `secondary` (só no desktop).
- **`List` / `ListItem`**: itens de uma ou duas linhas, opcionalmente navegáveis.
- **`DescriptionList`**: metadados de um registro (`stacked`, `columns`, `inline`).
- **`StatCard`**: indicador numérico de painel.
- **`MediaFrame`**: imagem com proporção fixa e marcador de "sem imagem"; `size="thumb"` para miniatura e `size="sm"` para QR code.
- **`Filters`** (formulário `GET` com `role="search"`) e **`Pagination`** (por links): a URL é a fonte de verdade.

Em qualquer listagem a pessoa identifica de imediato: qual é o registro, o estado dele, a informação principal e a ação principal.

### 5.5 Navegação

`BackLink` (retorno ao nível anterior), `Breadcrumb` (três níveis ou mais), `Stepper` (fluxo linear), `Tabs` (visões do mesmo contexto; setas navegam) e `Pagination`.

### 5.6 Overlays

`Dialog` usa `<dialog>` nativo: foco preso, Esc e devolução do foco são do navegador. No celular todo diálogo é uma folha inferior; a partir de md, `Modal` centraliza, `Drawer` encosta à direita e `Sheet` fica na base. `Dropdown` é o menu de ações secundárias de um registro; `Popover` ancora conteúdo livre; `Tooltip` é só para dica não essencial.

Prefira resolver na própria página. Diálogo é para confirmação destrutiva ou tarefa curta que não merece rota.

### 5.7 Containers

`Card` (`variant`: `default`, `muted`, `dashed`; `padding`: `none`, `sm`, `md`, `lg`; `interactive` para cartão clicável; `media` + `CardBody`/`CardFooter` para cartão com imagem no topo), `Panel` (cartão suave), `Divider` (com rótulo opcional), `Accordion` (`<details>`), `Section`.

## 6. Páginas-modelo

Exemplos vivos, sem regra de negócio, em `src/app/design-system/` (rota `/design-system`, indisponível em produção):

| Modelo | Rota | Estrutura |
| --- | --- | --- |
| Painel | `/design-system/painel` | `PageHeader` → grade de `StatCard` → `Grid columns="split"` com atividade recente e atalhos |
| Listagem | `/design-system/lista` | `PageHeader` com ação → `Filters` → `DataTable` → `Pagination`; estados vazio, carregando e erro |
| Formulário | `/design-system/formulario` | `PageHeader` com `BackLink` → `Form` em `Section`s → `FormActions sticky` |
| Detalhes | `/design-system/detalhes` | `PageHeader` com `Badge` e ações → `Grid columns="split"`: conteúdo, `DescriptionList`, histórico |
| Configurações | `/design-system/configuracoes` | `PageHeader` → `Tabs` por categoria → `Switch`es e formulários com estado de salvamento |

A vitrine em `/design-system` mostra tokens e todos os componentes com seus estados.

## 7. Como criar uma tela nova

1. Escolha o modelo mais próximo na seção 6 e copie a estrutura.
2. Comece por `PageContainer` + `PageHeader`. Escolha a largura pelo conteúdo, não pela tela.
3. Monte o corpo com `Stack`, `Section`, `Card` e os componentes da seção 5. Espaçamento só por `gap`.
4. Trate os cinco estados antes de considerar pronto: carregando, vazio, erro, sucesso e desabilitado.
5. Confira em 320px e em 1280px, navegue só com o teclado e leia a tela sem as cores.
6. Faltou algo? Primeiro procure variação em componente existente. Se for realmente novo e reutilizável, crie em `src/components`, com CSS Module só de tokens, e documente aqui. Estilo que só uma tela usa é sinal de que o padrão está errado ou de que falta um componente.

**Não faça:** `style={{…}}` (a exceção é valor realmente dinâmico, como a largura de uma barra de progresso), cor ou medida literal fora de `tokens.css`, CSS global novo, `!important`, media query em tela, emoji como ícone, `<div onClick>`, rótulo por placeholder, estado só por cor, remoção de contorno de foco.

## 8. Acessibilidade

- **Semântica**: um `<main>` e um `<h1>` por página; títulos em ordem; listas em `<ul>/<ol>`; tabela em `<table>` com `<caption>`.
- **Teclado**: tudo que se clica se alcança por Tab, na ordem visual; Esc fecha overlays; setas navegam em abas e menus.
- **Foco**: sempre visível. Após erro de envio, o foco vai para o primeiro campo inválido ou para a mensagem geral.
- **Nome acessível**: todo controle tem rótulo; `IconButton` exige `label`; ícone informativo recebe `label`.
- **Anúncio de mudanças**: `role="alert"` para erro que interrompe, `role="status"` para o que não interrompe.
- **Toque**: alvos de 44px (`--control-height`); links de texto isolados usam `TextLink touch`.
- **Contraste**: texto ≥ 4,5:1, contornos de controle ≥ 3:1 — garantido pelos tokens.
- **Cor**: todo estado tem texto ou ícone além da cor.
- **Zoom e texto longo**: tamanhos em `rem`; textos digitados por pessoas usam `wrapAnywhere`; nada depende de largura fixa.

## 9. Responsividade

Verifique em 320, 375, 390, 430, 768, 1024, 1280 e 1440px ou mais:

- sem rolagem horizontal da página;
- ação principal visível sem rolar ou fixa (`FormActions sticky`);
- navegação inferior no celular, no cabeçalho a partir de md;
- tabelas viram cartões abaixo de md;
- diálogos viram folha inferior no celular;
- imagens dentro de `MediaFrame`;
- grades por `Grid`, que encaixa as colunas possíveis.
