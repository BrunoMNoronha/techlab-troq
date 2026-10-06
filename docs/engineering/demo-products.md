# Produtos exemplares em desenvolvimento e Preview

Implementação da issue #201. O conjunto `products-v1` contém exatamente 30 anúncios de troca com conteúdo fictício e imagens próprias. Não é executado automaticamente por instalação, migration, build ou deploy.

Decisão de Bruno nesta execução: **qualquer usuário autenticado, com conta ativa e email verificado, pode remover os produtos exemplares em Configurações**. Não é necessária permissão administrativa. A operação continua exclusiva do lote demonstrativo, em banco e mídia isolados de desenvolvimento ou Preview.

## Ativar e cadastrar

1. Confirme o ambiente real (`APP_ENV=development` ou `preview`), o banco e o bucket exclusivos desse ambiente. Confira a custódia e o isolamento antes de habilitar; uma impressão digital confirma o destino configurado, não certifica por si só que ele está separado de Production.
2. Configure as variáveis de conexão e de R2 existentes. `pnpm demo:target` imprime somente `DEMO_DATA_TARGET`, `DEMO_DATABASE_FINGERPRINT` e `DEMO_MEDIA_FINGERPRINT`, sem credenciais. O comando não escreve no banco ou na mídia.
3. Registre esses três valores no ambiente correspondente. Eles ficam vazios por padrão em `.env.example`. Banco/endpoint/bucket divergentes, configuração ausente ou target hospedado de Production são recusados. Não habilite em Production e não copie sua conexão ou credencial para os outros ambientes.
4. Aplique as migrations incrementais pelo fluxo vigente. Em desenvolvimento, use banco local/descartável; em Preview, use o pipeline controlado. Não resetar banco nem usar `db push` no compartilhado.
5. Na raiz do checkout validado, execute **`pnpm demo:seed`**. O comando lê `.env.local`/`.env` opcionais; variáveis do processo prevalecem. Confirme o alvo previamente. A operação informa `created`, `existing`, `removed` e `pendingMedia` separadamente.

O manifesto e os PNGs próprios estão em `src/modules/demo-data/manifest.ts` e `public/demo-products/`. `pnpm demo:assets` reproduz as ilustrações usando o gerador versionado. O provisionador passa os PNGs pelo processamento existente, envia os três derivados WebP ao bucket privado e somente então publica o conjunto completo. Não há chamada a serviço de geração ou notificação externa.

## Remover pela interface

Entre com uma conta ativa/verificada e abra **Minha conta → Configurações → Dados demonstrativos**. A tela mostra ambiente, versão, quantidade e situação da mídia. “Remover produtos exemplares” abre confirmação. Cancelar não altera dados. A confirmação está vinculada ao lote mostrado: uma tela antiga não pode remover uma recriação posterior.

Para um lote intacto, a exclusão é física dos 30 registros de produto e de suas dependências operacionais sintéticas. Cadastros independentes, usuários, eventos de auditoria e metadados mínimos da execução permanecem. Não são selecionados os últimos 30 registros nem registros pelo título.

Qualquer vínculo posterior com fatos humanos ou de negócio (aceite/transição, solicitação, pagamento, negociação, denúncia ou moderação) bloqueia **o lote inteiro**, sem exclusão parcial. Esta função não apaga históricos nem cancela pagamentos; trate conflitos em escopo separado.

As URLs de mídia deixam de autorizar acesso assim que os registros são removidos. Os objetos são excluídos pela fila/job de mídia existente, fora da transação. Falha externa deixa pendência recuperável. Não confundir “produtos removidos” com “todos os objetos já excluídos”. Uma nova geração usa novas identidades de mídia para que a fila antiga não apague imagens novas.

## Fronteira de dados sintéticos

O provisionador é uma fronteira técnica exclusiva de desenvolvimento e Preview. A identidade proprietária é sintética, sem senha compartilhada ou vínculo social. Os exemplos nascem em `published`, após validar conteúdo, categorias, alternativas e mídia. Não são forjados aceites ou transições humanas. Auditorias `demo.seeded` e `demo.deleted` descrevem o fato técnico, e são preservadas após a limpeza. A publicação e a autorização dos anúncios comuns não mudam.

Procedência, versão, lote e chave de exemplar vivem no banco e não podem ser alterados pelo formulário comum. Preparações e objetos são rastreados antes do envio; transações, locks e controle de preparação impedem conjuntos ativos duplicados e permitem recuperar falhas sem reutilizar chaves de mídia.

Cada preparação tem um lease de 15 minutos, superior ao limite global de cinco minutos do provisionador e ao prazo abortável de 30 segundos por envio. Uma preparação interrompida só pode ser substituída após vencer o lease; a fila durável já conhece suas chaves. Lote terminal com ponteiros para produtos vivos é tratado como conflito de procedência, não como autorização para cadastrar mais 30.

## Evidência e operação

Validar cardinalidade, idempotência, concorrência, rollback, histórico conflitante, destino adulterado, confirmação antiga e o ciclo criar → remover → criar em PostgreSQL efêmero próprio. Testes de escrita exigem `INTEGRATION_EPHEMERAL_DB=1`. Conferir vitrine/detalhes e paginação: o feed mostra 20 por página, por padrão.

Banco efêmero, transporte S3 simulado e navegador local provam essas fronteiras locais; não comprovam um bucket R2 real ou Preview. A evidência externa deve registrar revisão/deployment, ambiente, contagens e navegação autenticada em Preview autorizado, sem credenciais, PII ou URLs assinadas. A issue só pode ser encerrada quando todas as evidências exigidas forem verificadas.
