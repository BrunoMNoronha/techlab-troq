# Contrato do pipeline de imagens — TROQ

Contrato técnico de upload, confirmação, processamento, recuperação, concorrência, privacidade, entrega, revogação, limpeza e retenção das imagens de anúncio. Entregável de F2-007 ([#45](https://github.com/BrunoMNoronha/techlab-troq/issues/45)); é o contrato que [#46](https://github.com/BrunoMNoronha/techlab-troq/issues/46) (upload e processamento) e [#47](https://github.com/BrunoMNoronha/techlab-troq/issues/47) (entrega, limpeza e expurgo) implementam.

**Reconciliado em 2026-09-29** sobre `main` em `d2d681c`. Substitui integralmente a versão anterior, que previa derivados servidos de uma área pública do bucket e de `Next/Image`, um "Image Processor Worker" sem mecanismo e estados em maiúsculas. O que mudou está na seção 17.

Este documento **não** implementa nada, **não** altera schema nem cria migration e **não** configura bucket, CORS, lifecycle, cron ou Vercel. Cada mecanismo é contrato para a issue indicada; a seção 15 lista o delta de modelo que #46 precisa aplicar.

## 1. Fontes e hierarquia

| Fonte | O que determina aqui |
| --- | --- |
| [image-policy.md](../product/image-policy.md) (DEC-028) | Quantidade, formatos, limites, validação, derivados e visibilidade. **Preservada literalmente** |
| [data-retention-policy.md](../product/data-retention-policy.md) (DEC-033) | 24 h do original temporário; retirada imediata e expurgo em até 30 dias dos derivados |
| [listing-lifecycle.md](../product/listing-lifecycle.md) (DEC-027) | Estados do anúncio e visibilidade pública |
| [listing-contract.md](listing-contract.md) (F2-005) | DTO público, allowlist, `ready` como único estado público |
| [ADR-0003](../adr/0003-object-storage-r2.md) | R2 por API S3-compatible |
| [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md) (DEC-038) | PostgreSQL como fila e autoridade; `FOR UPDATE SKIP LOCKED`; trava de transação; trabalho periódico idempotente e protegido por segredo |
| [data-model.md](data-model.md) | `ListingImage`, `ImageDerivative`, DM-5.4, DM-5.5, DM-5.7 a DM-5.9 |

Quando este contrato e uma fonte normativa parecerem divergir, prevalece a fonte normativa. Nenhum limite normativo é alterado aqui: 10 MB, 320 px, 50 MP, JPEG/PNG/WebP estático, WebP qualidade 80, 320/768/1600 px, 6 imagens, 24 h e 30 dias continuam exatamente como estão.

## 2. Fatos externos verificados em 2026-09-29

Consultas feitas na documentação oficial dos provedores. Cada linha é fato apurado na fonte indicada; valores podem mudar e devem ser reconferidos por #46/#47 no momento da implementação.

| # | Fonte oficial | Fato |
| --- | --- | --- |
| R2-1 | [Cloudflare R2 — Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) | Presigned URL suporta `GET`, `HEAD`, `PUT` e `DELETE`; validade de 1 s a 7 dias; **a mesma URL pode ser reutilizada várias vezes até expirar**; deve ser tratada como bearer token; `Content-Type` assinado faz o provedor recusar outro valor com `403`; só funciona no domínio da API S3, não em custom domain |
| R2-2 | [Cloudflare R2 — S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/) | `GetObject`, `HeadObject`, `PutObject` e `CopyObject` aceitam `If-Match`, `If-None-Match`, `If-Modified-Since` e `If-Unmodified-Since`; **versionamento de objeto não é suportado** |
| R2-3 | [Cloudflare R2 — CORS](https://developers.cloudflare.com/r2/buckets/cors/) | Upload do navegador por presigned URL exige política CORS no bucket; origem sem caminho; no máximo um `*` por origem; propagação pode levar até 30 s |
| R2-4 | [Cloudflare R2 — Public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) | Com acesso público (`r2.dev` ou custom domain), qualquer objeto fica acessível por URL direta a qualquer pessoa; `r2.dev` é para tráfego de desenvolvimento, com limite de taxa; custom domain usa o cache da Cloudflare |
| R2-5 | [Cloudflare R2 — Object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) | Regras por prefixo, com prazo em **dias**; os objetos são removidos **"tipicamente em até 24 horas"** depois do vencimento, podendo demorar mais conforme o volume |
| R2-6 | [Cloudflare R2 — Limits](https://developers.cloudflare.com/r2/platform/limits/) | Upload single-part de até 5 GiB; chave de até 1.024 bytes; **uma escrita por segundo na mesma chave** (excedente recebe `429`) |
| V-1 | [Vercel — Functions limits](https://vercel.com/docs/functions/limitations) (atualizada em 2026-08-24) | Com Fluid compute, duração padrão de 300 s em todos os planos; máximo de 300 s no Hobby e 800 s no Pro/Enterprise (1.800 s em beta); memória de 2 GB/1 vCPU no Hobby e até 4 GB/2 vCPU no Pro/Enterprise; **corpo de requisição e de resposta limitado a 4,5 MB** |
| V-2 | [Vercel — Fluid compute](https://vercel.com/docs/fluid-compute) | Ativado por padrão em projetos novos desde 2025-04-23; **várias invocações podem compartilhar a mesma instância** (Node.js) |
| V-3 | [Vercel — @vercel/functions](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package) | Em Next.js 15.1+, usar `after()` de `next/server`; o trabalho de `waitUntil` tem o mesmo limite de tempo da função e é cancelado se ela exceder a duração |
| V-4 | [Vercel — Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) (atualizada em 2026-08-11) | Entrega best effort, podendo perder ou duplicar execuções; falha não é retentada; execuções podem se sobrepor; `CRON_SECRET` chega como `Authorization: Bearer`; **no Hobby, uma execução por dia**, em qualquer minuto da hora; nos demais planos, dentro do minuto |
| V-5 | [Vercel — CDN Cache](https://vercel.com/docs/caching/cdn-cache) (atualizada em 2026-09-14) | Resposta de função **não** é armazenada no CDN se tiver `private`, `no-cache` ou `no-store`, `Set-Cookie`, requisição com `Authorization` ou sem diretiva `s-maxage` |
| V-6 | [Vercel — Purging CDN cache](https://vercel.com/docs/caching/cdn-cache/purge) | "Invalidate" serve o conteúdo **stale** e revalida em segundo plano; "delete" marca a entrada para regeneração; nenhum dos dois documenta garantia de propagação instantânea |
| V-7 | [Vercel — Image Optimization](https://vercel.com/docs/image-optimization) (atualizada em 2026-08-13) | Imagem remota transformada fica em cache pelo maior entre o `max-age` da origem e `minimumCacheTTL` (padrão 3.600 s) e **continua servida mesmo que a fonte mude**, até expirar ou ser purgada |
| V-8 | [Vercel — Bypass do limite de 4,5 MB](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) | Resposta em streaming não está sujeita ao limite de 4,5 MB |
| N-1 | [Next.js 16.3 — `after`](https://nextjs.org/docs/app/api-reference/functions/after) | Executa depois da resposta, em Route Handlers e Server Functions, dentro do `maxDuration` da rota; roda mesmo se a resposta falhar |
| N-2 | Next.js 16.3.5 (docs locais, `route.md`) | Desde a v15, `GET` de Route Handler é dinâmico por padrão |
| S-1 | [sharp — constructor](https://sharp.pixelplumbing.com/api-constructor) | `limitInputPixels` (padrão 268.402.689) recusa entrada acima do limite antes de processar; `failOn: 'warning'` é o padrão recomendado para entrada não confiável; `pages`/`animated` controlam multipágina |
| S-2 | [sharp — utilities](https://sharp.pixelplumbing.com/api-utility) | `sharp.concurrency` usa, por padrão, o número de núcleos (1 em glibc sem jemalloc); cache interno de 50 MB por padrão |

Os fatos de ADR-0006 (V-1 a V-7, N-1, P-1, P-2, de 2026-09-14) continuam válidos. Esta pesquisa os reconfirma e acrescenta R2-1 a R2-6, V-5 a V-8, N-1, N-2 e S-1/S-2.

## 3. Arquitetura

```
navegador ──(1) pedir upload──► Server Action TROQ ──► PostgreSQL (reserva, trava do anúncio)
navegador ──(2) PUT presigned──► R2 privado  originals/…
navegador ──(3) confirmar─────► Server Action TROQ ──► HeadObject no R2 ──► PostgreSQL (fila)
                                     └─ after(): tentativa imediata, sem garantia
cron Vercel (CRON_SECRET) ──────► executor TROQ ──► PostgreSQL (claim SKIP LOCKED) ──► R2 (If-Match) ──► sharp ──► R2 derivatives/…
navegador ──(4) GET /media/{imageId}/{kind} ──► Route Handler TROQ ──► PostgreSQL (estado atual) ──► R2 privado (stream)
```

- **MP-3.1 — O bucket é privado e continua privado.** Sem `r2.dev`, sem custom domain, sem objeto público, sem URL estável que leia o objeto sem passar pela autorização do TROQ. Fundamento: R2-4 torna qualquer objeto público legível por quem retiver a URL, e sair de `published` precisa retirar a imagem de toda superfície pública imediatamente (DEC-027, DEC-028 seção 8, DM-5.5).
- **MP-3.2 — Nenhum componente novo.** Execução em Vercel Functions Node.js com o `sharp` já instalado; fila e travas no PostgreSQL (ADR-0006, decisões 1 a 6). Nada de Vercel Queues, Cloudflare Queues, Workers, Redis, SQS, RabbitMQ, processo dedicado ou microserviço.
- **MP-3.3 — Chaves no bucket, todas geradas pelo servidor, nenhuma com nome de arquivo:**

| Prefixo | Chave | Natureza |
| --- | --- | --- |
| `originals/` | `originals/{imageId}/{uploadGeneration}` | Original temporário; nunca servido; apagado em até 24 h (seção 11) |
| `derivatives/` | `derivatives/{imageId}/{uploadGeneration}/{processingVersion}/{kind}.webp` | Derivado persistente, privado, servido **somente** pela rota da seção 9 |

`processingVersion` é constante de código (inicialmente `v1`); `kind` ∈ `thumb`, `medium`, `large`. Incluir `uploadGeneration` impede que a limpeza de uma geração antiga apague derivados de uma geração nova (seção 11). Os prefixos `temp/` e `public/` do código atual deixam de existir (#46).

## 4. Estados técnicos da imagem

O enum atual `uploaded | processing | ready | failed` é **mantido**; as distinções que ele não carrega sozinho vêm de campos auxiliares (seção 15), escolha menor que ampliar o enum.

| Situação | `status` | Campos que a distinguem | Público? | Conta para publicar? |
| --- | --- | --- | --- | --- |
| Reserva criada, PUT não confirmado | `uploaded` | `sourceConfirmedAt IS NULL` | não | não |
| Upload confirmado, aguardando processamento (inclusive depois de falha transitória) | `uploaded` | `sourceConfirmedAt` preenchido; `nextAttemptAt` nulo ou no futuro | não | não |
| Processamento em andamento | `processing` | `leaseExpiresAt` no futuro; `attempts` é o token da tentativa | não | não |
| Processamento abandonado por queda | `processing` | `leaseExpiresAt` no passado (reclamável) | não | não |
| Pronta | `ready` | três `ImageDerivative` persistidos; `processedAt` | só com anúncio `published` e conta `active` | **sim** |
| Falha permanente | `failed` | `failureCode` da lista fechada (seção 8) | não | não |

O nome `uploaded` para "reserva ainda sem upload" é aceito conscientemente: renomear o valor exigiria migration de enum sem ganho funcional. Semântica normativa: **`uploaded` = geração de upload autorizada e ainda não processada**; a confirmação é `sourceConfirmedAt`.

## 5. Upload

### 5.1 Autorização e reserva (#46)

Quem emite a autorização é uma **Server Action do TROQ**, nunca o cliente. Sequência, toda no servidor:

1. Sessão válida, e-mail verificado, conta `active` (`validateSession`).
2. Tipo declarado ∈ `image/jpeg`, `image/png`, `image/webp`. É **pré-checagem de experiência**, não prova de formato (seção 7).
3. Transação curta:
   1. `SELECT … FROM listings WHERE id = $listing AND owner_id = $sessionUser FOR UPDATE`. Sem linha → `not_found`, a mesma resposta para anúncio alheio e inexistente ([listing-contract.md](listing-contract.md), seção 7). A trava de linha do anúncio serializa todas as reservas, reordenações e remoções de imagem daquele anúncio, e só dele. `pg_advisory_xact_lock` sobre o id do anúncio é alternativa equivalente; trava de **sessão** é proibida (ADR-0006, decisão 6).
   2. Estado do anúncio ∈ `draft`, `published`, `paused`; senão `not_editable`.
   3. Contar as `ListingImage` do anúncio, **em qualquer estado**. Se já houver 6, recusar com `limit_reached`.
   4. Inserir a `ListingImage` na **menor posição livre de 1 a 6**, com `status = uploaded`, `uploadGeneration = 1`, `uploadAuthorizedAt = now()` e `objectKey = originals/{imageId}/1`.
   5. Commit.
4. Só depois do commit, gerar a presigned URL (5.2). **Se a reserva não persistir, nenhuma URL é emitida.**

A sétima reserva simultânea espera a trava, conta seis e é recusada. O `CHECK (position BETWEEN 1 AND 6)` e o `UNIQUE (listing_id, position)` já existentes são **defesa adicional**, não o mecanismo principal (ADR-0006, decisão 7). O defeito atual — `images.length + 1` fora de transação, em `src/modules/media/service.ts` — é substituído por este fluxo (#46).

Limite de abuso: a emissão de autorizações de upload tem limite por usuário (baseline: 30 por hora, ajustável por medição, no mesmo padrão persistente do limite de login de IC-10.2). Isso contém o custo de reservas abandonadas.

### 5.2 Presigned PUT (#46)

| Aspecto | Contrato |
| --- | --- |
| Operação | somente `PUT`, single-part; multipart não é usado (10 MB ≪ 5 GiB de R2-6) |
| Chave | exatamente `objectKey` da reserva; gerada pelo servidor |
| Validade | **900 s (15 min)**, preservada da versão anterior; não há evidência que justifique outro valor |
| Cabeçalhos assinados | `Content-Type` igual ao tipo declarado (R2-1). Endurecimentos adicionais a **provar em #46** antes de depender deles: `If-None-Match: *` assinado, para que a URL só crie o objeto e não o sobrescreva (R2-2), e `Content-Length` assinado com o tamanho declarado |
| Endpoint | domínio da API S3 do R2 (R2-1); presigned URL não funciona em custom domain |
| CORS | política no bucket de cada ambiente: `AllowedOrigins` = origens TROQ daquele ambiente (development: `http://localhost:3000`; preview: padrão dos domínios de preview do projeto, com no máximo um `*` — R2-3); `AllowedMethods` = `PUT`; `AllowedHeaders` = apenas os cabeçalhos assinados. CORS **não** é controle de acesso — a assinatura é —, apenas viabiliza o navegador |
| Sigilo | a URL é credencial temporária (R2-1): nunca registrada em log, telemetria, auditoria ou mensagem de erro, nem persistida no banco |

O binário **nunca** atravessa o corpo de uma Vercel Function (V-1, DEC-028 seção 5).

## 6. Confirmação (#46)

Quem confirma é o dono, por Server Action, depois do `PUT`. O servidor **não confia** em `fileSize`, `Content-Type`, ETag nem em "upload concluído" vindos do cliente.

1. Sessão válida e posse da imagem, por consulta filtrada pelo dono; imagem alheia ou inexistente → `not_found`.
2. Se `sourceConfirmedAt` já estiver preenchido → sucesso idempotente, sem novo `HeadObject`.
3. `status` precisa ser `uploaded`; senão, devolve o estado atual.
4. `HeadObject` na chave esperada (`objectKey`):
   - `404` → `upload_not_found`; nada muda (o cliente pode repetir o `PUT` enquanto a URL valer);
   - `ContentLength` > 10 MB (10.485.760 bytes) ou `0` → `failed` com `too_large_bytes`/`empty`; o original entra na fila de exclusão com `dueAt = now()`; **não processa**;
   - senão, grava `sourceEtag = ETag` retornado pelo R2 e `sourceConfirmedAt = now()` com `UPDATE … WHERE id = $id AND sourceConfirmedAt IS NULL AND status = 'uploaded'`. Duas confirmações concorrentes resultam em uma gravação e um no-op.
5. **Autoridade de tamanho:** o `ContentLength` do `HeadObject`. O `Content-Type` do objeto é ignorado como prova; formato é decidido pela decodificação (seção 7).
6. Com a confirmação persistida, a imagem **está na fila**. Nenhum outro registro é necessário: a fila é o próprio estado (ADR-0006, decisão 1).
7. **Caminho rápido:** a mesma requisição agenda, com `after()` (N-1), uma tentativa de processar **aquela** imagem pelo mesmo executor da seção 8. É apenas latência: a corretude não depende dessa tentativa (ADR-0006, decisão 3), porque a recuperação periódica encontra a mesma linha. A rota ou página que hospeda a confirmação declara `maxDuration` ≥ 300 s, já que `after()` herda esse limite (N-1, V-3).

### 6.1 Objeto substituído depois da confirmação

A presigned URL continua válida por até 15 min e pode ser reutilizada (R2-1); o R2 não tem versionamento (R2-2). A defesa é o ETag **devolvido pelo R2 ao servidor**:

- o processador lê o original com `GetObject` e `If-Match: <sourceEtag>`;
- se o objeto foi sobrescrito, o R2 responde `412` e a imagem vai para `failed` com `source_replaced`, uma **falha permanente e fechada**. O conteúdo substituto nunca é processado;
- o ETag informado pelo navegador é ignorado; só o do `HeadObject` do servidor vale;
- sobrescrever com bytes idênticos produz o mesmo ETag e o mesmo conteúdo, sem efeito.

Se `If-None-Match: *` assinado for provado em #46 (5.2), a sobrescrita passa a falhar já no `PUT`; o `If-Match` continua obrigatório como segunda barreira.

## 7. Validação do conteúdo (#46)

Preserva literalmente [image-policy.md](../product/image-policy.md), seções 4, 6 e 7. Toda decisão vem do **conteúdo decodificado**, nunca de extensão, nome ou tipo declarado.

| Verificação | Regra | Falha |
| --- | --- | --- |
| Tamanho | ≤ 10 MB pelo `HeadObject` (seção 6) e pelo `ContentLength` do `GetObject` | `too_large_bytes` |
| Formato | `metadata.format` ∈ `jpeg`, `png`, `webp`; qualquer outro, inclusive SVG, GIF, TIFF, BMP, AVIF e HEIC/HEIF | `unsupported_format` |
| Animação/multipágina | `pages > 1` recusado, inclusive WebP animado | `animated` |
| Pixels | `sharp(…, { limitInputPixels: 50_000_000 })` recusa antes de decodificar por completo (S-1) | `too_large_pixels` |
| Integridade | `failOn: 'warning'` (S-1); arquivo truncado ou corrompido é recusado | `corrupt` |
| Dimensões mínimas | largura e altura ≥ 320 px **depois** de aplicar a orientação | `too_small` |

Processamento, na ordem: decodificar uma vez → auto-orientar → **sem** `withMetadata`/`keepMetadata`, de modo que EXIF, GPS e demais metadados não chegam à saída → redimensionar com `fit: 'inside'` e `withoutEnlargement: true` para 1600, 768 e 320 px no lado maior → WebP qualidade 80. Recomendação de desempenho, sem efeito contratual: gerar `medium` e `thumb` a partir do resultado de `large`, em vez de decodificar a entrada três vezes. Nenhum formato de entrada novo (HEIC/HEIF, AVIF) é aceito.

## 8. Execução, recuperação e retentativa (#46)

### 8.1 Executor

Um único executor interno, `processPendingImages`, é chamado por dois gatilhos:

| Gatilho | Mecanismo | Garantia |
| --- | --- | --- |
| Caminho rápido | `after()` na confirmação, restrito àquela imagem | nenhuma; só reduz latência |
| Recuperação | Cron da Vercel em `GET /api/jobs/media-process`, **a cada 5 min** | convergência; protegido por `CRON_SECRET` (V-4, ADR-0006 decisão 9) |

O endpoint de cron compara `Authorization: Bearer <CRON_SECRET>` e recusa qualquer outra chamada. Não é alcançável por navegação, formulário ou ação do usuário. Execuções sobrepostas, perdidas ou duplicadas são a hipótese normal (V-4) e são inofensivas pelo claim abaixo.

### 8.2 Claim e lease

Claim em **transação curta**, sem segurar a transação durante o processamento (pool do Neon em modo transação, ADR-0006 N-1):

```sql
WITH c AS (
  SELECT id FROM listing_images
  WHERE (status = 'uploaded' AND source_confirmed_at IS NOT NULL
         AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
     OR (status = 'processing' AND lease_expires_at < now())
  ORDER BY coalesce(next_attempt_at, source_confirmed_at)
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE listing_images i
SET status = 'processing', attempts = i.attempts + 1,
    lease_expires_at = now() + interval '360 seconds', next_attempt_at = NULL
FROM c WHERE i.id = c.id
RETURNING i.id, i.attempts, i.object_key, i.source_etag, i.upload_generation;
```

- O caminho rápido acrescenta `AND id = $imageId`.
- **Lease de 360 s**, maior que o `maxDuration` de 300 s: uma invocação morta por timeout, OOM ou deploy libera a imagem para o próximo claim, sem intervenção.
- `attempts` é incrementado **no claim**, e não no fim. Queda em loop (por exemplo, OOM determinístico numa entrada adversarial) consome o orçamento de tentativas e termina em `failed`; nunca vira retry infinito.
- Se o claim fosse levar `attempts` acima de 5, a linha vai direto a `failed` (`transient_exhausted`) na mesma transação.
- Cada invocação processa **uma imagem por vez** e para de reclamar quando restar menos de 120 s do orçamento de 300 s (ADR-0006, decisão 8).

### 8.3 Processamento idempotente

1. `GetObject(objectKey, If-Match: sourceEtag)` (seção 6.1).
2. Validar e gerar os três derivados (seção 7).
3. `PutObject` dos três derivados nas chaves determinísticas da seção 3. Reexecução sobrescreve o mesmo resultado lógico; objetos já escritos antes de uma queda são sobrescritos.
4. Finalização em **uma** transação, com o token da tentativa como fencing:
   - `UPDATE listing_images SET status = 'ready', processed_at = now(), width, height, lease_expires_at = NULL, failure_code = NULL WHERE id = $id AND status = 'processing' AND attempts = $attempt`;
   - se 0 linhas (imagem removida, reclamada por outra tentativa depois do lease ou alterada): **rollback**, e as chaves de derivados que esta tentativa escreveu entram na fila de exclusão, salvo se referenciadas por um `ImageDerivative` vivo;
   - se 1 linha: `upsert` dos três `ImageDerivative` por `(imageId, kind)` — o `UNIQUE` já existe —, **nunca** duplicando, e enfileiramento da exclusão do original (`dueAt = now()`).
5. **`ready` só é gravado** depois de: entrada validada, três derivados produzidos, três objetos gravados e metadados dos três persistidos, na mesma transação do `ready`. Objeto parcial nunca é público: a entrega (seção 9) exige `ready`.

### 8.4 Classificação de falhas

| Classe | Exemplos | Efeito |
| --- | --- | --- |
| **Permanente** | `unsupported_format`, `animated`, `too_small`, `too_large_pixels`, `too_large_bytes`, `corrupt`, `empty`, `source_replaced` (412), `source_missing` (404 depois de confirmada), `expired` (seção 11) | `failed` com `failure_code`; sem retentativa automática; original e derivados parciais desta geração vão para a fila de exclusão |
| **Transitória** | R2 `429` (inclusive o limite de uma escrita por segundo por chave, R2-6), R2 `5xx`, timeout, erro de rede, invocação interrompida (lease vencido) | volta a `uploaded` com `next_attempt_at = now() + recuo`, condicionado a `attempts = $attempt`; `failure_code` guarda o último código técnico |

**Recuo entre tentativas:** 1 min, 5 min, 15 min e 60 min depois da 1ª, 2ª, 3ª e 4ª falha. **Máximo de 5 tentativas automáticas.** A 5ª falha transitória leva a `failed` com `transient_exhausted`. Pior caso até `failed`: cerca de 81 min mais a cadência do cron, muito abaixo do teto de 20 h do original (seção 11). Os valores são design, ajustáveis por medição sem ADR (ADR-0006, decisão 12).

### 8.5 Reenvio pelo usuário

Imagem `failed` pode ser **removida** ou **reenviada**. Reenviar é operação do dono, sob a trava do anúncio:

- mantém `id` e `position`, sem nova reserva e sem duplicar imagem;
- incrementa `uploadGeneration`, com nova `objectKey` = `originals/{imageId}/{nova geração}`;
- zera `sourceEtag`, `sourceConfirmedAt`, `attempts`, `nextAttemptAt`, `leaseExpiresAt` e `failureCode`, volta a `uploaded` e atualiza `uploadAuthorizedAt`;
- enfileira a exclusão do original e dos derivados da geração anterior;
- emite nova presigned URL (5.2).

Como a geração faz parte das chaves, a limpeza da geração antiga nunca atinge a nova.

## 9. Entrega dos derivados e revogação (#47)

### 9.1 Rota de mídia

`GET /media/{imageId}/{kind}` é um Route Handler Node.js do TROQ, dinâmico (N-2), sem `use cache`. A cada requisição, no momento da requisição:

1. `imageId` é UUID e `kind` ∈ `thumb`, `medium`, `large`.
2. Uma consulta junta `ListingImage` → `Listing` → `User` e `ImageDerivative` do `kind` pedido, exigindo imagem `ready` e, para **acesso público**, anúncio `published` e dono com conta `active`.
3. **Acesso privado do dono:** sessão válida cujo usuário é o dono do anúncio também recebe o derivado de imagem `ready` de anúncio próprio em qualquer estado, inclusive a pré-visualização de rascunho. Conta em exclusão não tem sessão (IC-5.6).
4. Com autorização, `GetObject` da chave do derivado e **stream** do corpo para a resposta.
5. Qualquer falha — ID malformado, `kind` inválido, imagem inexistente, alheia, não `ready`, anúncio não público, conta inativa, objeto ausente — responde **404 com corpo idêntico**, sem revelar estado interno.

Cabeçalhos da resposta de sucesso: `Content-Type: image/webp`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`. Nenhum `s-maxage`, `CDN-Cache-Control` ou `Vercel-CDN-Cache-Control`. A resposta 404 leva o mesmo `Cache-Control`.

O DTO público passa a expor `url = /media/{imageId}/{kind}`, relativo, em vez de `NEXT_PUBLIC_MEDIA_BASE_URL/objectKey` ([listing-contract.md](listing-contract.md), D-14). A chave do objeto nunca aparece em DTO, HTML ou RSC.

### 9.2 Revogação imediata

"Imediata" significa: **toda requisição cuja verificação da etapa 2 rode depois do commit da transição é negada**. Não há outro estado a invalidar:

| Camada | Por que não reexpõe |
| --- | --- |
| Bucket | privado; nenhuma URL direta existe (MP-3.1) |
| URL antiga `/media/…` | cada requisição reconsulta o estado; URL retida não carrega autorização |
| Vercel CDN | `private, no-store` impede o armazenamento (V-5) |
| Navegador e proxies | `no-store` impede cópia reutilizável |
| `Next/Image` e Vercel Image Optimization | **proibidos** para imagens de anúncio: o cache transformado sobrevive à fonte (V-7). Usar `<img>` com `width`/`height` do DTO, ou `next/image` com `unoptimized` |
| HTML/RSC de páginas | as páginas públicas são dinâmicas e só trazem imagens de anúncios visíveis ([listing-contract.md](listing-contract.md), seção 7) |

Uma resposta já em curso no instante da transição pode terminar; nenhuma requisição posterior é servida.

`paused` revoga sem apagar nada: os derivados continuam no bucket e voltam a ser servidos em T4, sem reprocessar. `closed`, `removed` e exclusão de conta revogam da mesma forma; o expurgo físico segue a seção 12.

### 9.3 Alternativas comparadas

| Alternativa | Decisão | Motivo |
| --- | --- | --- |
| Bucket ou custom domain público + CDN | **Rejeitada** | URL retida continua funcionando (R2-4); retirada dependeria de apagar o objeto ou de purgar o cache |
| Presigned `GET` de curta duração no DTO | **Rejeitada** | É bearer válido até expirar (R2-1); TTL curto não é revogação imediata; a URL ficaria embutida em HTML/RSC |
| Rota do TROQ com cache no CDN e purga por tag na transição | **Rejeitada no MVP** | "Invalidate" serve stale (V-6); "delete" não documenta propagação instantânea; exigiria que toda transição purgasse com garantia, com mais um caminho de falha que manteria o conteúdo público |
| Rota do TROQ com `private, no-store` | **Adotada** | Revogação imediata por construção, sem componente novo |

**Trade-off aceito:**
- cada exibição é uma invocação de função, uma consulta ao banco e uma leitura do R2;
- mais consumo de CPU ativa, memória provisionada e transferência na Vercel, sem cache de CDN;
- latência maior que a de um CDN público.

O custo é aceito no MVP para preservar DEC-027/DEC-028. Revisão só com medição e decisão registrada; cache por tag só se provar revogação imediata.

### 9.4 Limite de resposta

Os derivados têm no máximo 1600 px no lado maior, em WebP qualidade 80. O Route Handler faz **stream** do corpo, e resposta em streaming não está sujeita ao limite de 4,5 MB (V-8). Mesmo assim, #46/#47 medem o maior `large` produzível, com fixture de ruído 1600×1600. Se algum derivado válido não puder ser entregue pela função, é **bloqueio arquitetural** registrado: não se altera qualidade 80 nem 1600 px e não se publica o bucket como atalho.

## 10. Concorrência

| Situação | Resolução |
| --- | --- |
| Sexta e sétima reserva simultâneas | Trava de linha do anúncio + contagem na mesma transação (5.1); a sétima é recusada; `UNIQUE` e `CHECK 1..6` como defesa |
| Confirmação repetida ou concorrente | `UPDATE … WHERE source_confirmed_at IS NULL` (seção 6); a segunda é no-op |
| Processamento repetido ou concorrente | `SKIP LOCKED` + lease + fencing por `attempts` (8.2, 8.3); `upsert` por `(imageId, kind)`; chaves determinísticas |
| Remoção da imagem durante o processamento | A remoção apaga a linha sob a trava do anúncio e enfileira as chaves conhecidas; a finalização não encontra a linha (0 linhas), faz rollback e enfileira os derivados que escreveu; nada fica acessível, porque a entrega exige linha `ready` |
| Publicação durante o processamento | Só `ready` conta para T1/T4 (DM-5.3); imagem em `processing` não habilita publicar |
| Remoção da última imagem `ready` de anúncio `published` | Recusada na transação de remoção, sob a trava do anúncio (DM-5.4; [listing-contract.md](listing-contract.md), D-6). Implementação em #46/#48 |
| Reordenação concorrente | Sob a trava do anúncio: a entrada é a lista completa dos ids atuais, e as posições são reatribuídas de 1 a N na mesma transação. Exige o `UNIQUE (listing_id, position)` como `DEFERRABLE INITIALLY DEFERRED` (seção 15), porque trocar posições com seis imagens não tem posição livre intermediária |
| Transição de estado do anúncio durante reserva ou remoção | As transições atualizam a mesma linha de `listings`; a trava de linha serializa ambas |

## 11. Original temporário

- Nunca é público: está em `originals/`, num bucket privado, e nenhuma rota o serve.
- É apagado, pela aplicação, **depois do processamento bem-sucedido** (enfileirado na transação do `ready`) e **depois de falha permanente** (enfileirado na transação do `failed`).
- **Reserva abandonada:** `sourceConfirmedAt IS NULL` e `uploadAuthorizedAt` há mais de **1 h** (a URL expirou em 15 min). A linha é removida sob a trava do anúncio, as posições são compactadas e a chave vai para a fila de exclusão.
- **Teto absoluto:** original com `uploadAuthorizedAt` há mais de **20 h** e imagem ainda não `ready` → `failed` com `expired` e exclusão enfileirada.
- **Cadência da limpeza:** cron `GET /api/jobs/media-cleanup` **a cada hora**, com `CRON_SECRET`. Pior caso: 20 h + 1 h + tempo de execução < **24 h**.
- **Fallback:** regra de lifecycle do R2 no prefixo `originals/` com expiração de **1 dia**. Ela **não** substitui a limpeza da aplicação: a granularidade é de dias e a remoção ocorre "tipicamente em até 24 h" depois do vencimento (R2-5), ou seja, pode passar de 24 h desde o upload. Ela só impede acúmulo indefinido se a aplicação falhar.

**Dependência de plano (bloqueio operacional registrado):** no Hobby o cron roda uma vez por dia, em qualquer minuto da hora (V-4), o que **não** garante 24 h. Cumprir o prazo exige plano com agendamento de minutos, o que ADR-0006 (decisão 11) já registra como necessário para operar o MVP; não é serviço novo. Além disso, cron só executa no deployment de produção (ADR-0006, V-5): em `preview`, a limpeza depende de acionamento manual autenticado e do fallback de lifecycle, com dados sintéticos.

## 12. Derivados e retenção

| Evento | Acesso público | Objetos |
| --- | --- | --- |
| `draft` | nenhum (seção 9) | mantidos |
| `paused` | revogado imediatamente | **mantidos**; voltam em T4 sem reprocessar |
| `closed` | revogado imediatamente | mantidos em armazenamento **privado** enquanto o anúncio existir como histórico do dono (DEC-027, seção 3; DEC-033, seção 4); expurgo no gatilho definido por DEC-033, que no MVP é a exclusão da conta. Nenhum prazo corre a partir de `closed` |
| `removed` | revogado imediatamente | mantidos como evidência de moderação pelo prazo de DEC-033, seção 7; depois, expurgo em até 30 dias |
| Imagem removida pelo dono | a linha deixa de existir; a rota responde 404 | exclusão enfileirada com `dueAt = now()`, salvo retenção legítima (caso de moderação aberto sobre o anúncio ou legal hold, DEC-033 seções 7 e 9) |
| Exclusão da conta (RF-023) | revogado imediatamente (conta não `active`) | exclusão enfileirada com prazo máximo de 30 dias a partir da solicitação, salvo retenção legítima |

O prazo de 30 dias é **prazo máximo de expurgo** (DEC-033, seção 4); não é período de auditoria nem de disputa, como dizia a versão anterior. A execução é a mesma fila de exclusão, com o job horário.

**Anúncio `closed`.** Conforme [data-retention-policy.md](../product/data-retention-policy.md), seção 4 (esclarecimento de DEC-027 e DEC-033, sem regra nova):

- `closed` retira as imagens do público imediatamente;
- `closed` não é expurgo definitivo do anúncio;
- os derivados permanecem privados enquanto o anúncio for histórico de conta ativa;
- o expurgo acontece na exclusão da conta, em até 30 dias, salvo retenção legítima.

Não existe, no MVP, outro gatilho nem recurso de apagar histórico. Remover uma imagem individual segue a linha própria da tabela.

## 13. Fila de exclusão de objetos

Um único mecanismo convergente para original processado, original falho ou abandonado, derivado órfão, imagem removida e expurgo por retenção. É uma **tabela de pendências no PostgreSQL** (seção 15), coerente com ADR-0006:

- a linha é inserida **na mesma transação** do fato que torna o objeto descartável (`ready`, `failed`, remoção da imagem, reenvio, exclusão da conta). Não há fato sem a pendência correspondente;
- inserção idempotente (`ON CONFLICT DO NOTHING` sobre a chave pendente);
- o job horário reclama lotes vencidos com `FOR UPDATE SKIP LOCKED` e executa `DeleteObject`. Apagar chave inexistente é sucesso;
- **antes de apagar uma chave de `derivatives/`, confere que nenhum `ImageDerivative` vivo a referencia.** É a segunda barreira, depois da geração na chave;
- falha mantém a pendência com `attempts` e `lastErrorCode`, retentada no ciclo seguinte. Nunca é marcada como concluída sem sucesso real. A função atual `deleteR2Object`, que engole o erro, é substituída (#47);
- a limpeza usa as chaves que o banco conhece; **não** depende de listar o bucket.

## 14. Privacidade e logs

Nunca registrar em log, Sentry, auditoria, mensagem de erro ou resposta:

- bytes da imagem;
- presigned URL ou sua query string assinada;
- credenciais do R2;
- EXIF, GPS ou o objeto de metadados do `sharp`;
- nome original do arquivo;
- dado pessoal extraído da imagem.

Podem ser registrados: `imageId`, `listingId`, `attempts`, `failureCode`, códigos HTTP do provedor e duração, conforme a telemetria de [ADR-0007](../adr/0007-observability-sentry.md). Mensagens ao usuário vêm de `failureCode` (por exemplo, "formato não suportado", "imagem menor que 320 px") e nunca repassam a mensagem crua da biblioteca, como faz hoje `confirmAndProcessImage`.

## 15. Delta mínimo de modelo necessário para #46

O schema atual **não** é suficiente: não guarda o ETag confirmado, não distingue reserva de upload confirmado, não tem lease nem contagem de tentativas, não permite reordenar seis imagens e não registra exclusões pendentes. **#46 aplica este delta em migration própria**; nada disso é feito aqui.

### 15.1 `ListingImage` (`listing_images`)

| Campo | Tipo | Motivo |
| --- | --- | --- |
| `sourceEtag` | `text NULL` | ETag do `HeadObject` do servidor; usado em `If-Match` (6.1) |
| `sourceConfirmedAt` | `timestamptz NULL` | Distingue reserva de upload confirmado; confirmação idempotente (seção 6) |
| `uploadGeneration` | `int NOT NULL DEFAULT 1` | Compõe as chaves; reenvio sem colisão (8.5, seção 13) |
| `uploadAuthorizedAt` | `timestamptz NOT NULL DEFAULT now()` | Início da geração corrente; abandono em 1 h e teto de 20 h (seção 11) |
| `attempts` | `int NOT NULL DEFAULT 0` | Orçamento de 5 tentativas e token de fencing (8.2, 8.3) |
| `nextAttemptAt` | `timestamptz NULL` | Recuo entre tentativas (8.4) |
| `leaseExpiresAt` | `timestamptz NULL` | Recuperação de queda (8.2) |
| `failureCode` | `text NULL`, com `CHECK` na lista fechada da seção 8.4 mais os códigos transitórios | Motivo apresentável e diagnóstico, sem dado pessoal |

`objectKey` permanece e passa a significar a chave do original da geração corrente. Não entram `sourceSize` (o tamanho só decide na confirmação e fica no log técnico) nem `sourceDeletedAt` (substituído pela fila da seção 13).

Restrições e índices:

- `CHECK (status <> 'ready' OR (source_confirmed_at IS NOT NULL AND processed_at IS NOT NULL))`;
- `CHECK (attempts >= 0)`;
- `UNIQUE (listing_id, position)` recriado como **`DEFERRABLE INITIALLY DEFERRED`**, por SQL próprio da migration, já que o Prisma não expressa isso. Consequência registrada: essa restrição não pode ser árbitro de `ON CONFLICT`, e nenhum fluxo a usa assim;
- índice parcial para o claim: `(coalesce(next_attempt_at, source_confirmed_at)) WHERE status IN ('uploaded', 'processing')`;
- índice parcial para a limpeza: `(upload_authorized_at) WHERE status <> 'ready'`.

### 15.2 Nova tabela `MediaObjectDeletion` (`media_object_deletions`)

| Campo | Tipo | Motivo |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `objectKey` | `text NOT NULL` | Chave a apagar |
| `reason` | enum `source_processed`, `source_failed`, `source_abandoned`, `derivative_orphan`, `image_removed`, `retention_purge` | Diagnóstico e prova de prazo |
| `dueAt` | `timestamptz NOT NULL` | Imediato ou prazo de retenção (seções 11 e 12) |
| `attempts` | `int NOT NULL DEFAULT 0` | Retentativa |
| `lastErrorCode` | `text NULL` | Falha visível, sem mensagem crua |
| `completedAt` | `timestamptz NULL` | Conclusão real |
| `createdAt` | `timestamptz NOT NULL DEFAULT now()` | |

- `UNIQUE (object_key) WHERE completed_at IS NULL`, para inserção idempotente;
- índice `(due_at) WHERE completed_at IS NULL`.

Linhas concluídas podem ser apagadas pelo próprio job depois de 30 dias; elas contêm apenas chaves com UUID, sem dado pessoal.

`ImageDerivative` não muda: o `UNIQUE (imageId, kind)` necessário ao `upsert` já existe.

## 16. Orçamento de execução e prova exigida em #46

| Parâmetro | Baseline |
| --- | --- |
| Runtime | Node.js, Fluid compute (V-2) |
| `maxDuration` | 300 s, portátil em todos os planos (V-1); nada depende de 800 s nem do máximo estendido de 30 min |
| Memória | Planejada para **2 GB / 1 vCPU**, o padrão e o teto do Hobby (V-1) |
| Unidade de trabalho | uma imagem por claim; `sharp.cache(false)` e `sharp.concurrency` explícito, a fixar por medição (S-2) |
| Lease | 360 s |

Fluid compute pode colocar várias invocações na mesma instância (V-2), então a memória de duas decodificações simultâneas se soma. #46 **deve provar**, com fixtures sintéticas adversariais:

- PNG de 16 bits próximo de 50 MP com orientação EXIF que exija rotação;
- JPEG próximo de 50 MP;
- WebP animado, PNG truncado e arquivo com extensão falsa;
- entrada sem imagem;
- ruído 1600×1600 para o maior `large`.

Deve mostrar que o pico de memória, inclusive com duas execuções concorrentes na mesma instância, fica dentro do ambiente escolhido, com margem; que a duração fica abaixo de 300 s; que não há OOM; e que os três derivados saem corretos. Se 50 MP não couber com margem no recurso disponível, é **bloqueio de capacidade ou custo**, registrado com a medição. **O limite de 50 MP não é reduzido silenciosamente.**

## 17. Divergências da versão anterior e do código

| # | Antes | Agora | Destino no código |
| --- | --- | --- | --- |
| M-1 | Derivados em `public/`, servidos "via CDN / Next.js Image Optimization" | Bucket privado; rota `/media/{imageId}/{kind}` com `private, no-store`; `Next/Image` proibido para anúncios | #47 (rota), #49 (páginas) |
| M-2 | "Image Processor Worker" sem mecanismo | Executor no PostgreSQL com claim, lease, fencing e recuo; `after()` + cron | #46 |
| M-3 | Estados `PUBLISHED`, `DRAFT`, `PAUSED`, `CLOSED`, `REMOVED`, `READY`, `FAILED` | Estados canônicos em minúsculas; semântica técnica da seção 4 | — |
| M-4 | Revogação por "invalidar chaves nas bordas" | Revogação por verificação a cada requisição; purga de cache rejeitada | #47 |
| M-5 | Expurgo de 30 dias "respeitando o período de auditoria" | 30 dias como prazo máximo, a partir dos gatilhos de DEC-033; `closed` mantém derivados privados e expurga na exclusão da conta | #47 |
| M-6 | `images.length + 1` fora de transação | Trava do anúncio + contagem + menor posição livre | #46 |
| M-7 | Tamanho e tipo do cliente como autoridade | `HeadObject` no servidor; formato pela decodificação | #46 |
| M-8 | Processamento síncrono na confirmação; `syntheticBuffer` na assinatura pública | Fila + executor; `syntheticBuffer` só em teste | #46 |
| M-9 | `imageDerivative.create` em rerun; `ready` antes de confirmar derivados | `upsert` e `ready` na transação final com fencing | #46 |
| M-10 | `deleteR2Object` engole o erro | Fila de exclusão com retentativa visível | #47 |
| M-11 | Upload a anúncio alheio responde "sem permissão" | `not_found` uniforme | #46 (verificação em #50) |
| M-12 | `NEXT_PUBLIC_MEDIA_BASE_URL/objectKey` no DTO (`listing/actions.ts`, `media/service.ts`) | URL relativa da rota de mídia; variável aposentada | #47 |
| M-13 | Limpeza de 24 h "automática", sem mecanismo | Job horário + teto de 20 h + lifecycle de 1 dia como fallback; dependência de plano registrada | #47 |
| M-14 | [payments-design.md](payments-design.md), PD-3.4, punha a expurgação de originais na higiene **diária** | Originais e fila de exclusão saem da higiene diária e seguem o job horário da seção 11; PD-3.4 corrigido nesta entrega (cadência é design, sem nova decisão) | #47 |

## 18. Riscos

| Risco | Tratamento |
| --- | --- |
| 50 MP não caber em 2 GB com Fluid compute concorrente | Prova obrigatória em #46 (seção 16); bloqueio registrado se falhar, sem reduzir o limite |
| Plano sem cron de minutos não cumpre 24 h | Dependência já registrada por ADR-0006, decisão 11; lifecycle como fallback |
| Custo de entrega sem CDN | Aceito no MVP (9.3); medir em #47 |
| PUT de até 5 GiB antes da confirmação | Confirmação recusa > 10 MB e apaga imediatamente; abandono limpo em até 1 h + cadência; limite de autorizações por usuário; `Content-Length` assinado a provar em #46 |
| CORS de preview com curinga | Assinatura é o controle de acesso; curinga restrito ao padrão de domínio do projeto (R2-3) |
| Mudança de limites dos provedores | Reconferir a seção 2 em #46/#47 |

## 19. Rastreabilidade

| Referência | Relação |
| --- | --- |
| DEC-028 / image-policy.md | Preservada literalmente; critérios 1 a 17 mapeados nas seções 5 a 12 |
| DEC-033 / data-retention-policy.md | 24 h (seção 11) e 30 dias (seção 12) preservados; retenção de `closed` conforme o esclarecimento da seção 4 da política |
| DEC-027 / listing-lifecycle.md | Visibilidade por estado (seção 9); `paused` sem exclusão |
| ADR-0003 | Preservado: R2 por API S3; "servidas publicamente" passa a significar entrega ao público pela rota autorizada, não bucket público |
| ADR-0006 / DEC-038 | Preservado: fila no PostgreSQL, `SKIP LOCKED`, trava de transação, idempotência, `CRON_SECRET`, decisão 11 |
| DM-5.4, DM-5.5, DM-5.7 a DM-5.9 | Seções 9, 10, 3 e 14 |
| RF-006, RNF-005, RF-014, RF-020, RF-023 | Seções 5 a 13 |
| #46, #47, #48, #49, #50 | Destinos da seção 17 |
