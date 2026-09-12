# Política de imagens do anúncio — TROQ

Documento normativo das imagens de anúncio no MVP. Fecha [OD-05](../decisions/open-decisions.md) e é registrado como DEC-028 em [../decisions/decision-log.md](../decisions/decision-log.md).

Regras de negócio preservadas integralmente: RB-001 a RB-006 em [business-rules.md](business-rules.md). O ciclo de vida do anúncio permanece exatamente como definido em [listing-lifecycle.md](listing-lifecycle.md) (DEC-027); este documento **não** altera a máquina de estados.

## 1. Propósito e escopo

Este documento define **quantidade, obrigatoriedade, formatos, limites, validação de segurança, processamento, derivados públicos e visibilidade** das imagens de anúncio no MVP.

Está **fora** deste escopo e **não** é decidido aqui:

- implementação de upload, código, bibliotecas concretas de processamento, filas, jobs ou workers;
- schema de banco, migrations, contratos de API e telas;
- catálogo de conteúdo proibido, critérios, SLAs e recurso de moderação, que permanecem em [OD-03](../decisions/open-decisions.md);
- prazos de retenção e expurgo definitivo dos objetos após encerramento, remoção ou exclusão de conta, que permanecem em [OD-10](../decisions/open-decisions.md);
- metas numéricas de desempenho (LCP, bytes por página, tempo de carregamento), que pertencem ao gate de performance das fases seguintes.

O armazenamento continua sendo Cloudflare R2 via API S3-compatible, conforme [ADR-0003](../adr/0003-object-storage-r2.md) (DEC-014). Este documento **complementa** o ADR-0003; não o substitui nem o altera.

## 2. Relação com regras e requisitos

| Referência | Relação |
| --- | --- |
| RB-006 | Imagens fazem parte do conteúdo do anúncio e podem ser evidência de moderação; a remoção do anúncio retira as imagens da superfície pública. Os critérios de conteúdo proibido continuam em OD-03. |
| RF-004 | A publicação exige pelo menos uma imagem processada com sucesso (seção 3). |
| RF-006 | Requisito diretamente definido por este documento, exceto expurgo/retenção, que segue OD-10. |
| RF-020 | Anúncio `removed` deixa de expor imagens publicamente e de forma imediata; nenhum expurgo físico é decidido aqui. |
| RNF-005 | Critérios objetivos de otimização passam a ser os derivados e o formato público da seção 7. |
| R-10 | Mitigado por derivados dimensionados, formato normalizado e dimensões conhecidas para reserva de espaço. |

## 3. Quantidade, obrigatoriedade e ordenação

- Um anúncio precisa ter **no mínimo 1 imagem processada com sucesso** para entrar no estado `published`.
- **Máximo de 6 imagens por anúncio** no MVP.
- A **primeira imagem na ordenação é a imagem de capa**.
- Enquanto o anúncio for editável conforme [listing-lifecycle.md](listing-lifecycle.md), o anunciante pode **ordenar, adicionar e remover** imagens.
- Uma edição de anúncio `published` **não pode resultar em zero imagens válidas**.

Imagens ainda não processadas com sucesso não contam para o mínimo nem habilitam a publicação.

## 4. Formatos e limites de entrada

### 4.1 Allowlist do MVP

Formatos aceitos como upload de origem:

- JPEG/JPG;
- PNG;
- WebP estático.

Qualquer formato fora desta allowlist é rejeitado.

### 4.2 Formatos não aceitos no MVP

SVG; GIF; imagens animadas ou multipágina; TIFF; BMP; AVIF como upload de origem; HEIC/HEIF.

HEIC/HEIF **não** deve ser silenciosamente declarado suportado em interface, documentação ou mensagem de erro. Pode ser reavaliado futuramente mediante necessidade e compatibilidade comprovada do pipeline.

### 4.3 Limites por arquivo

| Limite | Valor |
| --- | --- |
| Tamanho máximo | 10 MB |
| Largura e altura mínimas, após considerar a orientação | 320 px |
| Total de pixels | `largura × altura <= 50.000.000` (50 megapixels) |

O limite de pixels existe para conter consumo de memória e CPU no processamento de entrada não confiável.

Validação client-side pode melhorar a experiência, mas **não é controle de segurança**. Todos os limites desta seção devem ser validados novamente pelo servidor/pipeline confiável (RNF-007).

## 5. Fluxo conceitual de upload

Em razão do limite de payload das Vercel Functions (4,5 MB por requisição) e do limite de produto de 10 MB por arquivo:

1. O binário **não** trafega pelo body de uma Vercel Function.
2. O direcionamento é **upload direto do cliente ao Cloudflare R2**, por URL/operação S3-compatible de curta duração autorizada pelo backend.
3. A **autorização do upload permanece server-side**: somente usuário autenticado, verificado e autorizado a editar o anúncio obtém a autorização.
4. O objeto recém-enviado permanece em **área lógica não pública/temporária** até concluir validação e processamento.
5. Somente **derivados processados e aprovados tecnicamente** podem ser servidos publicamente.

O mecanismo concreto de execução do processamento (fila, worker, job, síncrono ou assíncrono) **não** é escolhido aqui e pertence ao design e à implementação posteriores.

## 6. Validação de segurança

Toda imagem enviada é tratada como **entrada não confiável**. O pipeline deve:

- aceitar somente usuário autenticado/verificado e autorizado a editar o anúncio;
- **não confiar** na extensão do arquivo nem no `Content-Type` informado pelo cliente;
- verificar assinatura/conteúdo e efetivamente **decodificar** a imagem;
- rejeitar arquivos inválidos, truncados, animados/multipágina ou incompatíveis com a allowlist;
- aplicar o limite explícito de pixels da seção 4.3;
- gerar identificadores/chaves **controlados pela aplicação**;
- **nunca** usar o nome original do arquivo como chave pública;
- **regravar** a imagem antes de torná-la pública;
- **corrigir a orientação visual antes** da remoção de EXIF;
- remover EXIF e demais metadados desnecessários, **incluindo coordenadas GPS**;
- não armazenar telefone, WhatsApp ou outro dado protegido em metadados públicos (DEC-023, RB-005).

A defesa é em profundidade: nenhuma dessas verificações substitui as demais.

## 7. Processamento e derivados

A imagem original é **material de entrada**, não o artefato público definitivo.

Após auto-orientação e validação, o pipeline produz derivados **mantendo a proporção** e **sem ampliação artificial** (uma imagem menor que o alvo não é esticada):

| Derivado | Lado maior máximo |
| --- | --- |
| `thumb` | 320 px |
| `medium` | 768 px |
| `large` | 1600 px |

- **Formato público normalizado:** WebP.
- **Qualidade inicial normativa:** 80.
- Não é necessário criar JPEG de fallback no MVP.
- Os derivados devem ter **dimensões conhecidas**, para que a interface reserve espaço e evite layout shift.

A implementação pode otimizar internamente codificação e consumo de CPU desde que não altere esses resultados contratuais.

Sobre o original temporário:

- **nunca** é servido publicamente;
- deve ser **descartado** após processamento bem-sucedido;
- uploads abandonados ou com falha devem possuir **limpeza automática** e permanecer **no máximo 24 horas** na área temporária.

Esses prazos valem para a área temporária. A retenção e o expurgo dos **derivados persistidos** após encerramento, remoção ou exclusão de conta continuam dependendo de [OD-10](../decisions/open-decisions.md), que permanece aberta.

## 8. Publicação, visibilidade e ciclo de vida

Conforme [listing-lifecycle.md](listing-lifecycle.md), preservado integralmente:

- somente anúncio `published` é consultável publicamente;
- ao sair de `published`, as imagens do anúncio **também deixam de ser servidas publicamente**, de forma imediata e em qualquer superfície pública, incluindo caches;
- `paused`, `closed` e `removed` **não** expõem as imagens ao público;
- isso **não** implica necessariamente exclusão física imediata dos objetos;
- o expurgo definitivo continua condicionado a OD-10.

## 9. Moderação

Duas coisas distintas, que não devem ser confundidas:

| Tema | Onde é resolvido |
| --- | --- |
| Validação **técnica** da imagem (formato, integridade, limites, metadados, regravação) | Este documento |
| Moderação do **conteúdo representado** na imagem | RB-006 e [OD-03](../decisions/open-decisions.md) |

Para o MVP:

- **não** se introduz serviço de visão computacional ou IA para pré-moderação automática;
- **não** existe estado próprio de moderação por imagem;
- imagens fazem parte do conteúdo do anúncio e podem ser consideradas evidência pela moderação;
- denúncia e moderação ocorrem no **nível do anúncio** (RF-018 a RF-020);
- quando a moderação leva o anúncio a `removed`, as imagens deixam imediatamente de ser públicas, conforme a seção 8;
- catálogo de conteúdo proibido, SLAs, recurso e critérios de decisão permanecem em OD-03 e **não** são antecipados aqui.

## 10. Retenção e limites de escopo

- Área temporária: limpeza automática, no máximo 24 horas (seção 7).
- Derivados persistidos: retenção e expurgo definitivo seguem OD-10, que permanece **aberta**.
- Nada neste documento fecha OD-03, OD-10 ou qualquer outra decisão aberta além de OD-05.

## 11. Decisões rejeitadas ou adiadas

| Item | Situação | Motivo |
| --- | --- | --- |
| HEIC/HEIF como upload de origem | adiado | Compatibilidade do pipeline não comprovada; reavaliável mediante necessidade. |
| AVIF como upload de origem | rejeitado no MVP | Fora da allowlist de entrada; não impede avaliação futura como formato de saída. |
| SVG | rejeitado | Formato com superfície de ataque ativa (script/XML), incompatível com entrada não confiável. |
| GIF e imagens animadas/multipágina | rejeitado | Custo de processamento e ambiguidade de derivados; sem valor para o caso de uso. |
| JPEG de fallback junto ao WebP | adiado | Suporte a WebP é adequado ao público-alvo; duplicaria armazenamento e processamento. |
| Pré-moderação automática por IA/visão computacional | rejeitado no MVP | Custo e complexidade; a moderação é no nível do anúncio e segue OD-03. |
| Upload do binário através de Vercel Function | rejeitado | Limite de payload de 4,5 MB incompatível com o limite de produto de 10 MB. |
| Estado de moderação por imagem | rejeitado | A unidade de moderação é o anúncio; um estado por imagem não altera visibilidade nem autorização. |

## 12. Critérios verificáveis

1. Anúncio sem nenhuma imagem processada com sucesso **não** entra em `published`.
2. Tentativa de anexar a sétima imagem a um anúncio é rejeitada.
3. Edição de anúncio `published` que removeria a última imagem válida é rejeitada.
4. Arquivo com extensão `.jpg` cujo conteúdo não decodifica como JPEG, PNG ou WebP estático é rejeitado.
5. SVG, GIF, TIFF, BMP, AVIF, HEIC/HEIF e WebP animado são rejeitados, ainda que o `Content-Type` declarado esteja na allowlist.
6. Arquivo acima de 10 MB é rejeitado pelo servidor/pipeline, mesmo que a validação client-side seja contornada.
7. Imagem com lado menor que 320 px, após orientação aplicada, é rejeitada.
8. Imagem cujo produto `largura × altura` excede 50.000.000 é rejeitada antes do processamento completo.
9. Derivado público não contém EXIF, incluindo coordenadas GPS.
10. Imagem com EXIF de rotação aparece visualmente correta no derivado público.
11. A chave pública do objeto não contém o nome original do arquivo.
12. Cada imagem publicada possui derivados `thumb`, `medium` e `large` em WebP, com lado maior de no máximo 320, 768 e 1600 px respectivamente, sem ampliação.
13. Cada derivado tem dimensões conhecidas disponíveis para a interface.
14. O objeto original temporário não é acessível por URL pública.
15. Upload abandonado não permanece na área temporária por mais de 24 horas.
16. Ao sair de `published`, nenhuma imagem do anúncio continua acessível por superfície pública ou cache público.
17. Nenhum dado protegido (telefone/WhatsApp) aparece em objeto público ou em metadados de imagem.

## 13. Rastreabilidade

| Referência | Relação com este documento |
| --- | --- |
| OD-05 | **Fechada** por este documento. |
| DEC-028 | Registro da decisão em [../decisions/decision-log.md](../decisions/decision-log.md). |
| DEC-014, ADR-0003 | Preservada; R2 via API S3-compatible continua sendo o armazenamento. Este documento complementa o ADR. |
| DEC-023 | Preservada; dado protegido nunca em objeto público nem em metadados. |
| DEC-027, listing-lifecycle.md | Preservado integralmente; a visibilidade das imagens segue o estado do anúncio. |
| RB-005, RB-006 | Preservadas. |
| RF-004 | Publicação exige ao menos uma imagem processada com sucesso. |
| RF-006 | Definido por este documento, exceto expurgo/retenção (OD-10). |
| RF-020 | Anúncio `removed` deixa de expor imagens; expurgo segue OD-10. |
| RNF-005 | Critérios objetivos passam a ser os da seção 7. |
| OD-03 | Permanece **aberta**; nada aqui a fecha ou antecipa. |
| OD-10 | Permanece **aberta**; retenção e expurgo definitivo dos derivados persistidos seguem nela. |
| Demais decisões abertas | Inalteradas. Nenhuma outra decisão aberta é fechada por este documento. |

## 14. Referências externas consultadas

Consultadas como fundamentação, não como dependência a instalar nesta fase.

| Fonte | Padrão observado | Uso no TROQ |
| --- | --- | --- |
| [OWASP — File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) | Allowlist, validação por conteúdo/assinatura, nome gerado pela aplicação, limites, regravação e defesa em profundidade | Base da seção 6. |
| [Cloudflare R2](https://developers.cloudflare.com/r2/) | API S3-compatible; limites de armazenamento muito acima dos limites de produto adotados | Confirma ADR-0003 e o upload direto da seção 5. |
| [Vercel Functions](https://vercel.com/docs/functions/limitations) | Payload de requisição limitado a 4,5 MB | Justifica não transportar o binário pela função (seção 5). |
| [Sharp 0.35.x](https://sharp.pixelplumbing.com/) | Suporte prebuilt a JPEG, PNG e WebP; limite de pixels; remoção de metadados por padrão ao regravar | Fundamenta a viabilidade das seções 4, 6 e 7. Nenhuma biblioteca é escolhida aqui. |
| OLX Brasil | Exige ao menos uma imagem; limite de 6 imagens nas categorias gerais | Fundamenta o mínimo de 1 e o máximo de 6 (seção 3). |
| Mercado Livre | Aceita uploads de até 10 MB; recomenda redimensionamento/normalização | Fundamenta o limite de 10 MB e a normalização (seções 4 e 7). |
