# Imagens dos produtos exemplares

As 30 imagens PNG deste diretório são ilustrações vetoriais próprias, criadas
para o catálogo sintético `products-v1` da issue #201. Cada produto tem uma
geometria específica; não representam marcas, pessoas, bens de terceiros ou
fotografias de produtos reais. O sinal discreto “EXEMPLO” identifica a
ilustração como demonstrativa.

Origem: o código SVG original está em `scripts/demo/generate-assets.mjs`.
As formas são desenhadas diretamente no código e rasterizadas pelo `sharp`
já instalado no projeto. Não houve download, hotlink, uso de imagens externas,
serviço de geração de imagens ou chamada paga.

Para regenerar somente os arquivos locais, a partir da raiz do projeto:

```powershell
pnpm exec node scripts/demo/generate-assets.mjs
```

O comando grava `product-01.png` a `product-30.png` em 960 × 960 pixels. Não
escreve no banco nem envia imagens ao armazenamento. O manifesto em
`src/modules/demo-data/manifest.ts` associa cada arquivo à sua chave estável.
O povoamento autorizado processa os PNG reais pelo mesmo pipeline de imagens
do domínio, que produz os derivados WebP `thumb`, `medium` e `large`.

Os arquivos podem ser usados e regenerados como parte deste projeto. Os
exemplares são inteiramente fictícios e destinam-se exclusivamente à
demonstração nos ambientes de desenvolvimento e Preview.
