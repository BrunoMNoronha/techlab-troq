# Categorias de produto (#89)

Decisão de Bruno em 2026-10-05: usar categorias comuns de produtos do e-commerce; permitir rascunhos sem categoria, exigir na publicação/reativação e manter anúncios já publicados visíveis até a regularização pelo dono.

O catálogo inicial abaixo é a seleção de implementação desse direcionamento, inspirado nas [categorias da Amazon Brasil](https://venda.amazon.com.br/sellerblog/nichos-de-mercado-vendidos-no-marketplace-da-amazon). Não representa um ranking de vendas. Cada produto tem uma única categoria, sem texto livre, subcategorias ou classificação automática. “Outros” é uma escolha explícita do anunciante, nunca preenchimento de legados.

| Código persistido | Nome exibido |
| --- | --- |
| `celulares` | Celulares e acessórios |
| `informatica` | Informática |
| `eletronicos` | Eletrônicos, áudio e vídeo |
| `games` | Games e consoles |
| `casa` | Casa, móveis e decoração |
| `eletrodomesticos` | Eletrodomésticos |
| `moda` | Moda e acessórios |
| `beleza` | Beleza e cuidados pessoais |
| `esportes` | Esportes e lazer |
| `brinquedos` | Brinquedos e jogos |
| `livros` | Livros e papelaria |
| `ferramentas` | Ferramentas e jardim |
| `pets` | Acessórios para pets |
| `outros` | Outros |

A categoria comercial não é uma categoria de denúncia ou moderação, nem uma autorização para anunciar itens proibidos. A [política de itens proibidos](prohibited-items.md) e a declaração de conformidade continuam valendo para todas as escolhas.

## Regras e compatibilidade

- Rascunho: categoria opcional. Ausência, `null` ou texto vazio/apenas espaços resultam em `null`; código válido é aparado. Tipos diferentes de string/null e códigos desconhecidos são recusados com erro `category`.
- Patch: categoria omitida mantém a escolha gravada; `null` ou vazio remove a escolha apenas no rascunho. As demais alterações são atômicas com a categoria.
- Publicação e reativação: categoria válida obrigatória, conferida junto do conteúdo e das alternativas sob a trava do anúncio. Repetição de uma transição já concluída preserva a idempotência existente.
- Edição de `published`/`paused`: exige categoria no conteúdo resultante, inclusive na primeira edição de legado. O dono deve selecionar antes de salvar; rascunhos podem continuar incompletos.
- Legados: migration incremental adiciona coluna nullable, sem backfill, mudança de estado ou ocultação. Leitura privada e pública continua disponível conforme os gates existentes. Ausência é apresentada como “Categoria não informada”; no formulário, orienta a seleção. Regularização pelo dono na edição ou antes da próxima publicação/reativação; sem prazo ou preenchimento fictício.
- Catálogo versionado em código, compartilhado entre seletor, validação e labels. A coluna `category` é `varchar(40)` nullable com CHECK de códigos aceitos. Ampliar o catálogo exige alteração deliberada do código e migration incremental; não existe painel de manutenção neste recorte.
- Projeções privadas e públicas permitem somente o código da categoria, junto da allowlist anterior. Cards da home/explorar e detalhe exibem o nome pelo catálogo comum. Sem filtro por categoria.

## Validação prevista

Cobrir códigos válidos/desconhecidos, tipos inválidos, rascunho ausente, patch omitido, publicação/reativação e primeira edição de legados; autorização A/B e estados terminais; rollback; migration sobre banco descartável vazio e com legado; round-trip no formulário, erro/foco acessível e cards/detalhe públicos sem contato privado. Prova local, CI, navegador e homologação de Preview são evidências distintas.
