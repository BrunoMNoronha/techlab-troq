# Marca, ícones e imagens sociais do TROQS

Marca criada em azul `#2563eb`, texto `#111827` e branco. O símbolo é um Q geométrico; a palavra TROQS também usa traços vetoriais, sem depender de uma fonte instalada. As artes usam Arial/sans-serif para o texto de apoio.

## Arquivos para uso

| Uso | Arquivo | Dimensões |
| --- | --- | --- |
| Logo Google OAuth | `public/brand/logo-oauth-120.png` | 120 × 120, PNG opaco |
| Logo horizontal | `public/brand/logo.svg` e `logo.png` | SVG; PNG 1200 × 320 transparente |
| Logo em fundo escuro | `public/brand/logo-white.svg` e `logo-white.png` | SVG; PNG 1200 × 320 transparente |
| Símbolo | `public/brand/logo-mark.svg`, `logo-512.png`, `logo-1024.png` | SVG; PNG 512 e 1024 |
| Favicon | `src/app/favicon.ico`, `src/app/icon.svg` | ICO 16/32/48; SVG |
| Favicon PNG | `public/icons/favicon-{16,32,48}.png` | 16, 32 e 48 |
| Apple touch icon | `src/app/apple-icon.png`; cópia em `public/icons/apple-touch-icon.png` | 180 × 180, opaco |
| Ícones de instalação | `public/icons/icon-{192,512}.png` | 192 e 512 |
| Ícones adaptáveis | `public/icons/icon-maskable-{192,512}.png` | 192 e 512, opacos |
| Avatar | `public/social/avatar-1080.png` | 1080 × 1080 |
| Imagem de links compartilhados | `public/social/share-1200x630.png` | 1200 × 630 |
| Post | `public/social/post-1080x1080.png` | 1080 × 1080 |
| Story | `public/social/story-1080x1920.png` | 1080 × 1920 |
| Capa horizontal | `public/social/cover-1584x396.png` | 1584 × 396 |

`public/brand/assets-manifest.json` cataloga os arquivos com uso, dimensões, URL, tamanho e SHA-256. Os caminhos em `public/` são servidos sem esse prefixo; por exemplo, `/brand/logo-oauth-120.png`.

## Integração no app

- `src/app/manifest.webmanifest` define nome, idioma, escopo, cores, abertura em janela própria e os quatro ícones de instalação. O Next.js publica `/manifest.webmanifest` e inclui o link automaticamente.
- `favicon.ico`, `icon.svg` e `apple-icon.png` são descobertos pelo Next.js por convenção de arquivo.
- `opengraph-image.png` e `twitter-image.png`, com textos alternativos, são cópias da arte de compartilhamento. Open Graph atende previews de links em redes e mensageiros; `summary_large_image` configura o cartão do X.
- O layout define nome do app, idioma social, cor do navegador e `metadataBase`. A origem usa `BETTER_AUTH_URL` quando configurada e `https://troqs.app` como fallback exclusivo dos metadados. Isso não altera a resolução da origem nem as exigências da autenticação. Configure a origem do ambiente antes do build para que os links das imagens apontem ao deployment correto.
- Títulos e descrições das páginas continuam sendo resolvidos pelo Next.js. Não há `og:url` nem canonical global que faça todos os anúncios apontarem à página inicial.

O manifesto fornece identidade e apresentação de instalação. Não acrescenta Service Worker ou funcionamento offline.

## Google OAuth

Selecione `public/brand/logo-oauth-120.png` no campo de logotipo da plataforma Google Auth. O arquivo segue a recomendação de 120 × 120 px e fica abaixo do limite de 1 MB. O upload e o envio para verificação devem ser feitos no projeto Google correspondente; gerar os arquivos localmente não realiza essas etapas.

Referências: [requisitos de branding do Google](https://support.google.com/cloud/answer/15549049?hl=en) e [identidade visual na verificação](https://support.google.com/cloud/answer/13804963?hl=en). Para instalação, os ícones adaptáveis mantêm o símbolo dentro do círculo central seguro, com diâmetro de 80% do ícone, conforme a [orientação do MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons).

## Regeneração

```powershell
pnpm brand:generate
```

O gerador `scripts/brand/generate.mjs` define a geometria e as artes e usa o `sharp` já presente no projeto para exportar SVG, PNG e ICO. Os arquivos gerados ficam prontos para versionamento; o build e o servidor não geram imagens nem acessam provedores externos. Para trocar a marca, altere o gerador e regenere o pacote. A cor do navegador (`theme_color` no manifesto e `viewport.themeColor` no layout) é o branco da moldura do app e deve mudar nos dois lugares juntos.

Os tamanhos das artes são formatos de exportação; confira o recorte mostrado por cada rede ao publicar, especialmente em capas exibidas em celular.
