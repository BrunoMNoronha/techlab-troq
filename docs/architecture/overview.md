# Visão geral da arquitetura — TROQ

Documento de arquitetura pré-implementação do MVP. Produzido por **F0-022**, junto com [data-model.md](data-model.md), [payments-design.md](payments-design.md) e [contact-release.md](contact-release.md).

Este documento **converte decisões já homologadas em arquitetura**. Ele não cria regra de negócio, não reabre decisão registrada e não implementa código. Onde uma decisão já existe, ela é citada e obedecida; onde faltava escolha técnica, ela é feita aqui e marcada como decisão arquitetural; onde a escolha depende de informação que ainda não existe, ela é marcada como detalhe de implementação.

## 1. Como ler este documento

Cada afirmação pertence a exatamente uma destas três classes, sempre indicada:

| Classe | Significado | Quem pode mudar |
| --- | --- | --- |
| **Normativa** | Regra de negócio ou decisão já homologada. Reproduzida aqui apenas para ancorar o desenho | Somente nova decisão registrada (RB, DEC ou ADR) |
| **Decisão arquitetural** | Escolha técnica feita por F0-022, dentro do espaço que as decisões vigentes deixaram aberto | Nova decisão arquitetural registrada; ADR quando for estruturante |
| **Detalhe de implementação** | Fica em aberto de propósito, para ser resolvido na fase correspondente com informação que hoje não existe | A própria implementação, sem nova decisão |

Os itens deste documento são identificados como `AR-x.y` e são referenciáveis pelos demais documentos de arquitetura.

## 2. Contexto e objetivos arquiteturais

O TROQ é uma plataforma de anúncios entre pessoas em que o contato (WhatsApp/telefone) do anunciante só é liberado a um interessado **escolhido** e com **pagamento aprovado** de R$ 0,99, com no máximo três solicitações pagas por anúncio ([product/mvp-scope.md](../product/mvp-scope.md), [product/business-rules.md](../product/business-rules.md)).

**AR-2.1 (decisão arquitetural).** A arquitetura é julgada por cinco objetivos, nesta ordem de prioridade. A ordem importa: quando dois objetivos colidirem, o de cima vence.

| # | Objetivo | Origem | Como se verifica |
| --- | --- | --- | --- |
| 1 | **Não vazar o contato protegido** | RB-001, RNF-008, DEC-023 | Nenhum payload público, cache público, log, URL, telemetria ou mensagem de erro contém telefone/WhatsApp |
| 2 | **Não violar invariante financeira nem de capacidade** | RB-003, RB-004, DEC-037 | Nunca mais de três solicitações pagas válidas; nunca direito de negócio concedido com estado de pagamento incerto |
| 3 | **Ser auditável** | RF-022, RNF-011 | Toda operação crítica tem ator, alvo, instante e resultado em trilha imutável |
| 4 | **Ser operável por equipe pequena** | ADR-0001, DEC-025 | Um deploy, um banco, nenhum broker, nenhum componente que exija plantão |
| 5 | **Ser rápida em 3G/4G no celular** | RNF-001, RNF-003, RNF-004, R-10 | Fluxos obrigatórios completáveis em smartphone sob rede móvel |

**AR-2.2 (decisão arquitetural).** O objetivo 1 é **absoluto**: nenhuma otimização de desempenho, nenhuma conveniência de cache e nenhuma simplificação de modelo pode ser adotada se criar um caminho pelo qual o contato protegido alcance uma superfície não autorizada. O objetivo 2 vem logo depois pela mesma razão: ambos produzem dano irreversível.

## 3. Arquitetura lógica

**AR-3.1 (normativa).** Monólito modular, aplicação única Next.js + TypeScript com App Router, sem microserviços e sem API Node separada ([ADR-0001](../adr/0001-modular-monolith-nextjs.md)). PostgreSQL com Neon como provedor preferencial ([ADR-0002](../adr/0002-postgresql-neon.md)), Prisma ORM 7.x e Prisma Migrate ([ADR-0005](../adr/0005-prisma-orm-migrations.md)), Cloudflare R2 por API S3-compatible ([ADR-0003](../adr/0003-object-storage-r2.md)), Mercado Pago por Checkout Transparente via Orders API ([ADR-0004](../adr/0004-mercado-pago-pix.md)), Better Auth, Resend e deploy na Vercel.

**AR-3.2 (decisão arquitetural).** A aplicação tem **quatro camadas**, e a dependência só aponta para baixo:

```
  composicao        src/app — rotas, layouts, Route Handlers, Server Actions, telas
       |            (adapta, valida, autoriza, delega; nao contem regra)
       v
  dominio           modulos de negocio — casos de uso e invariantes
       |            (importavel e testavel sem HTTP e sem React)
       v
  persistencia      repositorios e transacoes sobre PostgreSQL
       |            (unico lugar que fala Prisma/SQL)
       v
  adaptadores       gateway de pagamento, armazenamento de objetos, email
                    (unico lugar que fala o vocabulario de cada provedor externo)
```

Um módulo de domínio **nunca** importa de `src/app`. Um componente React **nunca** importa de persistência ou de adaptador. Essa direção é o que torna as regras de [engineering/conventions.md](../engineering/conventions.md) verificáveis, e não apenas desejáveis.

**AR-3.3 (decisão arquitetural).** Os módulos de domínio do MVP são exatamente estes nove. A lista fecha o que [conventions.md](../engineering/conventions.md), seção 2, deixou expressamente para este documento:

| Módulo | Responsabilidade | Entidades próprias (ver [data-model.md](data-model.md)) |
| --- | --- | --- |
| `identity` | Conta, sessão, verificação de email, declaração etária, exclusão de conta | `User`, `TermsAcceptance`, `AccountDeletionRequest` |
| `contact` | Guarda do dado protegido, autorização e entrega do contato | `UserContact`, `ContactRelease`, `ContactAccessEvent` |
| `listing` | Anúncio, ciclo de vida, localização pública | `Listing`, `ListingTransition` |
| `media` | Upload autorizado, validação, derivados, visibilidade | `ListingImage`, `ImageDerivative` |
| `request` | Solicitação de desbloqueio e **reserva de vaga** (RB-003) | `ContactRequest` |
| `payments` | Tentativa, cobrança, confirmação, reembolso, reconciliação | `PaymentAttempt`, `Payment`, `TechnicalRefund`, `PaymentNotification`, `ReconciliationCase` |
| `negotiation` | Escolha, reseleção, negociação e encerramento | `Selection`, `Negotiation` |
| `reputation` | Avaliações e reputação pública | `Rating` |
| `moderation` | Denúncia, decisão, sanção, contestação | `Report`, `ModerationDecision`, `Sanction`, `Appeal` |

Mais dois módulos transversais, que **não** são de domínio e não possuem regra própria: `audit` (trilha imutável, seção 9) e `platform` (configuração, relógio, identificadores, log estruturado).

**AR-3.4 (decisão arquitetural).** `contact` é um módulo separado de `identity` e de `listing` **de propósito**. O telefone/WhatsApp não é um campo do usuário nem do anúncio: é uma entidade sob guarda de um módulo cujo único ponto de entrada público exige autorização. Nenhum outro módulo lê esse dado diretamente. Isso transforma o objetivo AR-2.1 em propriedade estrutural, e não em disciplina de revisão. Detalhamento em [contact-release.md](contact-release.md).

**AR-3.5 (decisão arquitetural).** `request` e `payments` são módulos distintos. `request` é dono da vaga de RB-003; `payments` é dono do dinheiro. A vaga é reservada **antes** da cobrança (DEC-019) e `payments` nunca cria, devolve nem reabre vaga por conta própria: ele informa um fato de pagamento, e `request` decide o efeito sobre a vaga. Essa fronteira é o que impede que uma exceção financeira produza uma quarta vaga por caminho indireto.

## 4. Fronteiras de confiança

**AR-4.1 (decisão arquitetural).** Existem quatro fronteiras. Tudo que atravessa uma delas é entrada não confiável e é validado no servidor antes de qualquer uso (RNF-014).

| # | Fronteira | O que entra | Tratamento obrigatório |
| --- | --- | --- | --- |
| F1 | Navegador -> servidor | Formulários, parâmetros de rota, query, corpo, Server Actions | Autenticar, autorizar, validar e só então usar. O cliente nunca autoriza (RNF-007) |
| F2 | Mercado Pago -> servidor | Notificação do tópico `order` | Identificar, validar a assinatura pela **única** regra oficial de manifesto HMAC e só então processar (ADR-0004, decisões 8 e 9). O corpo **nunca** é prova de pagamento (PE-1.2) |
| F3 | Servidor -> Mercado Pago | Criação, consulta, reembolso e cancelamento | Credencial apenas server-side; `X-Idempotency-Key` em toda operação que cria efeito |
| F4 | Navegador -> R2 | Upload direto do binário da imagem | Autorização server-side de curta duração; o objeto só vira público depois de validado e reprocessado ([image-policy.md](../product/image-policy.md)) |

**AR-4.2 (normativa).** O cliente **não** é fronteira de confiança em nenhuma hipótese. Esconder botão, rota ou trecho de tela é apresentação, nunca autorização ([conventions.md](../engineering/conventions.md), seção 3.4).

**AR-4.3 (decisão arquitetural).** Nenhum segredo atravessa F1. O Access Token do Mercado Pago, a chave secreta de webhook, a credencial do R2, a chave do Resend, a URL do banco e o segredo de agendamento vivem apenas no servidor, por ambiente (RNF-015, ADR-0004 decisão 6). Variável prefixada como pública é, por definição, conteúdo público.

## 5. Componentes externos

**AR-5.1 (normativa).** Nenhum componente externo além dos já decididos é introduzido por F0-022. Em particular, **não** se adota broker de mensagens, fila gerenciada, Redis, cache distribuído, motor de busca, serviço de feature flag nem provedor de verificação de identidade.

| Componente | Papel no MVP | Decisão de origem |
| --- | --- | --- |
| Vercel | Hospedagem da aplicação, execução das funções e **agendamento** dos trabalhos periódicos | DEC-011; agendamento em [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md) |
| Neon (PostgreSQL) | Estado autoritativo local, transações, restrições e **fila de trabalho** | ADR-0002, ADR-0006 |
| Cloudflare R2 | Binários de imagem e derivados públicos | ADR-0003 |
| Mercado Pago | Cobrança Pix, estado autoritativo do pagamento, reembolso e cancelamento | ADR-0004 |
| Resend | Email transacional | DEC-015 |
| Better Auth | Autenticação email/senha com verificação | DEC-012, DEC-013 |

**AR-5.2 (decisão arquitetural).** Todo componente externo é alcançado por um **adaptador** com fronteira explícita. O domínio fala de solicitação paga, reserva de vaga, pagamento aprovado, contato liberado e imagem publicada — nunca de `order`, `x-signature`, `data.id`, bucket, objeto S3 ou template de email. Trocar um provedor deve custar a reescrita do adaptador, não do domínio (ADR-0004 decisão 10, RNF-017).

## 6. Jornadas principais

As jornadas abaixo mostram **onde cada garantia mora**. Nenhuma delas cria comportamento novo.

### 6.1 Publicar anúncio

1. Sessão autenticada e verificada (RF-003). O anúncio nasce `draft` (DEC-027).
2. Imagens: o servidor autoriza um upload direto ao R2 (F4); o binário não passa por função da Vercel; validação por conteúdo, regravação, remoção de EXIF/GPS e derivados `thumb`/`medium`/`large` ([image-policy.md](../product/image-policy.md)).
3. Publicar (T1) exige dono do anúncio, ao menos uma imagem processada com sucesso e aceitação registrada da declaração de conformidade (DEC-031, seção 5), auditada.
4. Só `published` é consultável publicamente. Qualquer outro estado responde ao público como recurso não disponível, **sem revelar existência prévia nem estado interno** (DEC-027).

### 6.2 Solicitar, pagar e ser escolhido

1. "Tenho interesse" é ação gratuita de interface. **Não** persiste entidade, **não** ocupa vaga e **não** é visível ao anunciante (DEC-035). A persistência funcional começa na solicitação.
2. A solicitação **reserva atomicamente uma das três vagas antes da cobrança** (DEC-019, RB-003). O mecanismo está em [data-model.md](data-model.md) (DM-6) e em [payments-design.md](payments-design.md) (PD-4).
3. A tentativa de pagamento é criada, com identidade estável derivada da reserva, e a cobrança Pix de exatamente R$ 0,99 é criada no Mercado Pago com `X-Idempotency-Key` (CI-1, CI-2).
4. A notificação é **gatilho**; o estado autoritativo vem de `GET /v1/orders/{id}` (PE-1.1, PE-1.3). Só `processed`/`accredited` com acreditação **dentro da janela** torna a solicitação paga válida (PE-1.4, PE-4.1).
5. O anunciante vê apenas as solicitações pagas válidas do seu anúncio e escolhe uma (RF-013). A escolha cria a negociação `active` e a **autorização** de liberação de contato (DEC-029).
6. A entrega do contato ao escolhido é um ato próprio, autorizado server-side no instante da leitura e auditado ([contact-release.md](contact-release.md)).

### 6.3 Encerrar, avaliar, denunciar

1. Qualquer uma das duas partes encerra a negociação, de forma unilateral, imediata, irreversível e auditada (DEC-029).
2. `closed` habilita a avaliação: uma nota inteira de 1 a 5 por direção, janela de 14 dias corridos, publicação cega bilateral e imutabilidade após a publicação (DEC-030).
3. Denúncia por usuário autenticado e verificado, única por par (denunciante, anúncio), que **não** altera o estado do anúncio; a moderação decide `procedente`, `improcedente` ou `sem_acao`, e a remoção usa exclusivamente T7 a T9 (DEC-031, DEC-027).

## 7. Autenticação e autorização

**AR-7.1 (normativa).** Autenticação por email/senha com verificação de email, via Better Auth (DEC-012, DEC-013). Login social fora do núcleo inicial.

**AR-7.2 (decisão arquitetural).** Autorização é **sempre** decidida no servidor, no instante da execução, a partir do estado do servidor — nunca a partir do que o cliente afirmou. Ela é expressa em três níveis, todos obrigatórios e cumulativos:

| Nível | Pergunta | Onde vive |
| --- | --- | --- |
| N1 — autenticação | Existe sessão válida e email verificado? | Camada de composição, na entrada de toda ação restrita |
| N2 — papel na operação | Este ator é dono do anúncio, participante da negociação, solicitante desta solicitação ou moderador? | Caso de uso do módulo dono da operação |
| N3 — pré-condição de estado | O estado atual permite esta operação **agora**? | Transação que executa a operação, sobre linhas travadas |

**AR-7.3 (decisão arquitetural).** N3 é verificado **dentro da mesma transação que aplica o efeito**, nunca antes dela. Verificar pré-condição em uma transação e aplicar o efeito em outra é, por construção, uma corrida. Esta regra vale para todas as operações críticas: alocar vaga, confirmar pagamento, escolher solicitante, reselecionar, encerrar negociação, submeter avaliação e remover anúncio.

**AR-7.4 (decisão arquitetural).** O perfil de moderação é o **único** perfil administrativo do MVP (DEC-031, seção 7.1) e seus poderes são os enumerados naquela fonte. Ser moderador **não** concede acesso ao contato protegido: `contact` não possui caminho de leitura administrativa no MVP (DEC-031, seção 13, item 3).

**AR-7.5 (detalhe de implementação).** Duração de sessão, política de rotação, limite de tentativas de login e forma concreta de armazenamento da senha seguem o padrão seguro da solução adotada e são fixados na Fase 2.

## 8. Dados pessoais

**AR-8.1 (normativa).** Minimização: coleta-se o mínimo necessário e conserva-se apenas enquanto a finalidade durar ([data-retention-policy.md](../product/data-retention-policy.md), DEC-033). Localização pública limitada a cidade/UF; localização precisa **não** é coletada (RB-005, DEC-022). Nenhum documento, data de nascimento, selfie ou biometria é coletado para comprovação etária (DEC-034).

**AR-8.2 (decisão arquitetural).** Os dados pessoais são classificados em três faixas, e a faixa determina o tratamento técnico:

| Faixa | Exemplos | Regra técnica |
| --- | --- | --- |
| **Protegido** | Telefone/WhatsApp | Tabela própria sob `contact`; nunca em projeção pública, cache público, URL, log, telemetria ou mensagem de erro; acesso sempre autorizado e auditado |
| **Pessoal comum** | Nome, email, cidade/UF | Fora de payload público quando não for parte da exposição decidida; sujeito aos prazos de DEC-033 |
| **Operacional** | Identificadores internos, instantes, estados | Base das trilhas; pseudonimizável quando o identificador interno bastar |

**AR-8.3 (decisão arquitetural).** Toda consulta que alimenta superfície pública usa **projeção explícita de campos permitidos**, nunca a entidade inteira. Não se entrega o registro completo confiando que a camada de cima filtre ([conventions.md](../engineering/conventions.md), seção 3.3). Dado protegido nem sequer pertence à tabela que essas consultas leem (AR-3.4).

**AR-8.4 (normativa).** Exclusão de conta: efeito imediato sobre login, sessão e exposição pública; eliminação ou anonimização em até 30 dias, ressalvados os fatos necessários a obrigação legal, abuso, segurança, defesa de direitos, auditoria e registros financeiros mínimos (DEC-033, RF-023). Fatos históricos — escolha, liberação já ocorrida, negociação — **não** são apagados; elimina-se o dado pessoal identificável.

## 9. Auditoria

**AR-9.1 (normativa).** Operações críticas produzem trilha imutável e não editável, com ator, alvo, instante e resultado (RF-022, RNF-011). Retenção de 24 meses a partir do evento, e de 24 meses após o encerramento do caso para moderação, segurança e abuso; metadados financeiros mínimos por 5 anos (DEC-033).

**AR-9.2 (decisão arquitetural).** Existe **uma única trilha**, a entidade `AuditEvent` ([data-model.md](data-model.md), DM-11), com tipo discriminado por evento, e não uma tabela de log por módulo. Razão: a retenção, a imutabilidade e a proibição de conter dado protegido são propriedades da trilha, e propriedade espalhada por N tabelas é violada em uma delas.

**AR-9.3 (decisão arquitetural).** A trilha é **append-only** por construção: sem `UPDATE` e sem `DELETE` no caminho da aplicação. O expurgo por prazo (DEC-033) é uma operação administrativa registrada, executada pelo trabalho de retenção, que elimina ou pseudonimiza — nunca edita (DEC-033, seção 6).

**AR-9.4 (decisão arquitetural).** O registro de auditoria é escrito **na mesma transação do efeito que ele descreve**. Efeito aplicado sem trilha, ou trilha sem efeito, são ambos defeito. A única exceção são os eventos que descrevem uma **rejeição** (assinatura inválida, tentativa não autorizada), que não têm efeito a acompanhar e são gravados isoladamente.

**AR-9.5 (normativa).** A trilha **nunca** contém telefone/WhatsApp em texto claro fora da própria liberação autorizada, nem segredo, nem payload capaz de reconstituir um segredo (DEC-023, PE-6.3, PE-10.2).

Eventos auditados: os de RF-022, os de DEC-031 seção 12 e os de DEC-037 seção 13. A enumeração consolidada está em [data-model.md](data-model.md), DM-11.

## 10. Arquivos e imagens

**AR-10.1 (normativa).** Upload direto do cliente ao R2, autorizado server-side por operação S3-compatible de curta duração, sem o binário trafegar por função da Vercel; validação por conteúdo com decodificação efetiva; chave gerada pela aplicação; regravação; auto-orientação antes da remoção de EXIF/GPS; derivados públicos `thumb` 320 px, `medium` 768 px e `large` 1600 px em WebP qualidade 80, sem ampliação e com dimensões conhecidas; original temporário nunca público e limpo em no máximo 24 horas ([image-policy.md](../product/image-policy.md), DEC-028).

**AR-10.2 (fato externo, verificado em 2026-09-14).** O limite de **4,5 MB** de corpo de requisição e de resposta das funções da Vercel foi reconfirmado na documentação oficial. Ele é a razão técnica do upload direto, já registrada em DEC-028, e permanece válida.

**AR-10.3 (decisão arquitetural).** O processamento da imagem é um **trabalho assíncrono**, disparado pela confirmação do upload e reprocessável com segurança, nos termos de [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md). Motivos: a decodificação de entrada não confiável de até 50 megapixels não pertence ao caminho de uma requisição interativa, e o resultado precisa sobreviver a falhas parciais. Enquanto não houver ao menos uma imagem processada com sucesso, o anúncio não publica — a própria regra de DEC-028 é o critério de conclusão.

**AR-10.4 (decisão arquitetural).** O bucket tem **duas áreas lógicas**: temporária (nunca pública, expurgo em até 24 horas) e pública (apenas derivados aprovados). Nenhum objeto público contém dado protegido nem metadado que o revele (DEC-028, critério 17).

## 11. Pagamentos e webhooks — visão macro

O desenho completo está em [payments-design.md](payments-design.md). Em nível macro:

**AR-11.1 (normativa).** O estado autoritativo do pagamento é o que o Mercado Pago reporta em consulta direta à order. A notificação é **gatilho de processamento**, nunca fonte de estado, e estado incerto **nunca** é resolvido a favor da aprovação (PE-1.1 a PE-1.6).

**AR-11.2 (decisão arquitetural).** O receptor de webhook **não** é o lugar onde a verdade se decide. Ele valida a autenticidade, registra a notificação, marca a tentativa como pendente de reconciliação e responde. A decisão de negócio acontece contra o estado autoritativo, na reconciliação — no mesmo ciclo, quando há orçamento de tempo, ou no ciclo periódico. Consequência deliberada: **o sistema funciona corretamente mesmo que nenhuma notificação chegue** (PE-1.3, CI-3).

**AR-11.3 (decisão arquitetural).** A reserva de vaga, a expiração, a confirmação tardia e a solicitação concorrente são resolvidas **atomicamente no banco**, sob a mesma trava por anúncio, e não por coordenação entre processos (CI-6). Mecanismo em [data-model.md](data-model.md) (DM-6) e [payments-design.md](payments-design.md) (PD-4).

**AR-11.4 (normativa).** RB-004 não é alterada: a cobrança de R$ 0,99 é definitiva para uma **solicitação paga válida**. Ela não autoriza reter dinheiro recebido por erro técnico, que segue o reembolso técnico de DEC-037, seção 10 (PE-12.1 a PE-12.4).

## 12. Mobile-first e PWA

**AR-12.1 (normativa).** Mobile-first: todo fluxo obrigatório é completável em smartphone, sem funcionalidade exclusiva de desktop (RNF-001, RNF-002). PWA é direcionamento; Web Push não bloqueia o MVP (RNF-006, DEC-020, DEC-021).

**AR-12.2 (decisão arquitetural).** Server Components são o padrão; `"use client"` é decisão localizada, o mais próximo possível da folha ([conventions.md](../engineering/conventions.md), seção 3.1). Além do desempenho, isso serve ao objetivo AR-2.1: o que não vai para o cliente não pode vazar pelo payload.

**AR-12.3 (decisão arquitetural).** As telas que exibem contato liberado **não** são Client Components que recebem o contato por propriedade. O contato é renderizado no servidor ou obtido por ação autorizada sob demanda ([contact-release.md](contact-release.md), CR-6).

**AR-12.4 (detalhe de implementação).** Capacidades PWA mínimas exigidas no MVP são fixadas na Fase 5 (RNF-006).

## 13. Desempenho em 3G/4G

**AR-13.1 (normativa).** Nenhuma meta numérica de desempenho está homologada. LCP, orçamento de JavaScript, bytes por página e limiares de rede são definidos no gate da Fase 5 (RNF-003, RNF-004).

**AR-13.2 (decisão arquitetural).** O que a arquitetura já fixa, por ser estrutural e não métrica:

1. Imagens são servidas por derivados dimensionados em WebP, com dimensões conhecidas para reservar espaço e evitar layout shift (DEC-028, RNF-005).
2. Listagem e detalhe público leem **projeções explícitas** e enxutas (AR-8.3): menos bytes e menos risco de vazamento, pela mesma decisão.
3. A demonstração de interesse não persiste entidade e não faz ida ao banco no caminho crítico (DEC-035), o que já foi registrado como mitigação de R-10.
4. Trabalho pesado — processamento de imagem, consulta ao gateway, reconciliação, reembolso — fica **fora** do caminho da requisição interativa ([ADR-0006](../adr/0006-async-work-scheduling-concurrency.md)).

**AR-13.3 (decisão arquitetural).** Nenhuma resposta que contenha dado protegido participa de cache compartilhado, em nenhuma camada, sob nenhum argumento de desempenho (CR-7). Este é o caso em que o objetivo 5 cede ao objetivo 1.

## 14. Observabilidade mínima

**AR-14.1 (normativa).** Logs estruturados e rastreamento de erros suficientes para operar o MVP, sem dados protegidos e sem segredos (RNF-018). A ferramenta concreta e o escopo, que esta seção atribuía à Fase 1, foram definidos por [ADR-0007](../adr/0007-observability-sentry.md) (DEC-039): a plataforma é o **Sentry SaaS**, com **um projeto e um DSN por ambiente**, cobrindo erro não tratado de browser e de servidor, logs estruturados, tracing de diagnóstico e a associação da telemetria ao ambiente e à release, com **Session Replay fora do MVP** e fronteiras de privacidade explícitas. Aquele ADR é **decisão e contrato**: na data desta revisão nada está provisionado, nenhum SDK está instalado e nenhuma telemetria é emitida.

**AR-14.2 (decisão arquitetural).** Observabilidade é **distinta** de auditoria e não a substitui: auditoria é estado versionado no banco, com valor probatório e retenção normativa; log é telemetria operacional, descartável. Uma operação crítica nunca é considerada auditada porque apareceu em log.

**AR-14.3 (decisão arquitetural).** O mínimo que a operação precisa enxergar no MVP, porque sem isso as garantias de DEC-037 não são verificáveis:

| Sinal | Por que é mínimo |
| --- | --- |
| Tentativas de pagamento em estado não terminal, por idade | Revela reconciliação travada antes que vire prejuízo ou reclamação |
| Casos em `reembolso_pendente`, por idade | PE-7.9 e PE-7.10 exigem que a pendência permaneça **visível**; o prazo de 180 dias do provedor corre |
| Casos em `inconsistente`, abertos | PE-9.6 proíbe tratamento por analogia; alguém precisa ver |
| Notificações rejeitadas por autenticidade, por janela | Sinal de ataque ou de configuração errada (PE-6.3) |
| Última execução bem-sucedida de cada trabalho periódico | O agendamento é **best effort** (AR-15.2); sem isso, uma falha silenciosa é indistinguível de "não havia trabalho" |
| Denúncias decididas dentro do prazo, por classe | Métrica já exigida por DEC-031, seção 9, item 5 |

**AR-14.4 (normativa).** Nenhum desses sinais contém telefone/WhatsApp, credencial, token ou conteúdo integral de requisição capaz de contê-los (RNF-018, PE-11.3).

## 15. Trabalho assíncrono e agendamento

O tema é estruturante e foi registrado em ADR própria: [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md) (DEC-038). Resumo do que a arquitetura assume:

**AR-15.1 (decisão arquitetural).** Não há broker nem fila gerenciada. O **PostgreSQL é a fila de trabalho e a autoridade de exclusão mútua**, e o agendamento é feito pelo agendador da própria plataforma de deploy já adotada. Nenhuma tecnologia nova entra.

**AR-15.2 (fato externo, verificado em 2026-09-14).** A documentação oficial da Vercel declara que a entrega do agendamento é **best effort**: uma execução agendada pode não ocorrer e pode ocorrer mais de uma vez; falha **não** é retentada; duas execuções do mesmo trabalho podem se sobrepor; e no plano Hobby o agendamento é limitado a **uma vez por dia**, com invocação em qualquer ponto da hora indicada.

**AR-15.3 (decisão arquitetural — a consequência que governa todo o resto).** **Nenhuma invariante do TROQ pode depender de um trabalho periódico disparar.** Todo trabalho periódico é higiene e convergência, nunca a fonte de uma garantia. Onde uma regra depende do tempo, o estado correto é resolvido no **instante da escrita** (dentro da transação que aplica o efeito) ou **derivado no instante da leitura** — nunca esperado de um disparo futuro.

Consequências concretas, cada uma detalhada no documento indicado:

| Regra dependente de tempo | Como a invariante é garantida sem depender do job |
| --- | --- |
| Vaga reservada que expirou volta a ficar disponível | A transação que aloca vaga **expira e realoca no mesmo ato**, sob a trava do anúncio ([data-model.md](data-model.md), DM-6) |
| Pagamento acreditado fora da janela não cria vaga | A comparação é feita na transação de confirmação, entre o instante de acreditação autoritativo e o fim da janela ([payments-design.md](payments-design.md), PD-6) |
| Avaliação é publicada ao fim da janela de 14 dias | A publicidade é **derivada na leitura**: publicada se há `publishedAt` ou se a janela já terminou ([data-model.md](data-model.md), DM-9) |
| Reembolso pendente não pode ser esquecido | O caso permanece aberto por estado persistido e visível (AR-14.3), não por lembrete agendado |

**AR-15.4 (decisão arquitetural).** O plano Hobby da Vercel é **incompatível** com a operação do MVP, e não apenas com o uso comercial: a reconciliação de pagamentos exige cadência de minutos, e o Hobby permite uma execução diária. Isso **reforça** a decisão já vigente de que a produção comercial não depende do Hobby (DEC-011, R-09) e acrescenta que qualquer ambiente onde se pretenda exercitar o fluxo de pagamento de ponta a ponta precisa do mesmo tratamento.

**AR-15.5 (fato externo, verificado em 2026-09-14).** O endpoint **pooled** do Neon usa PgBouncer em modo transação e **não suporta locks consultivos de sessão**. Consequência normativa para o TROQ: usa-se exclusivamente trava de **escopo de transação** (`pg_advisory_xact_lock`) ou trava de linha; a trava consultiva de **sessão** (`pg_advisory_lock`) é **proibida** no caminho da aplicação. Uma trava de sessão sobre conexão em modo transação vaza para outra requisição e deixa de proteger o que deveria.

## 16. Evolução sem microserviços prematuros

**AR-16.1 (normativa).** Não se cria microserviço nem API Node separada no MVP sem necessidade futura comprovada e documentada (ADR-0001).

**AR-16.2 (decisão arquitetural).** A extração futura de um módulo é preservada por três propriedades, e nenhuma delas exige separação física agora: ponto de entrada público único por módulo; dependências direcionais e sem ciclo; e nenhum acesso a dado protegido de outro módulo sem interface explícita ([conventions.md](../engineering/conventions.md), seção 2.2).

**AR-16.3 (decisão arquitetural).** Os dois candidatos naturais a extração, **se** um dia houver necessidade comprovada, são `payments` e `media`: são os que têm fronteira externa mais clara e perfil de carga mais distinto do resto. Registrar os candidatos **não** autoriza extraí-los; autoriza apenas não destruir a fronteira que tornaria a extração possível.

**AR-16.4 (decisão arquitetural).** Gatilhos que **não** justificam extração: preferência de estilo, vontade de usar outra tecnologia, crescimento de time sem problema de acoplamento medido, ou tamanho do repositório. Gatilho que justificaria: uma restrição operacional medida e documentada que o monólito não consiga atender — por exemplo, um perfil de execução incompatível com o limite de duração das funções, comprovado e registrado em ADR própria.

## 17. O que este documento deliberadamente não decide

| Tema | Onde fica |
| --- | --- |
| Schema, migrations, nomes de tabela e de coluna | Fase 1, a partir de [data-model.md](data-model.md) e de [ADR-0005](../adr/0005-prisma-orm-migrations.md) |
| Endpoints, rotas, contratos HTTP e telas | Fases 2 a 4 |
| Metas numéricas de desempenho, acessibilidade e disponibilidade | Gate da Fase 5 (RNF-003, RNF-004, RNF-010, RNF-012) |
| Ferramenta concreta de observabilidade | **Decidida** por [ADR-0007](../adr/0007-observability-sentry.md) (DEC-039) na Fase 1, com o contrato de variáveis em [environments.md](../engineering/environments.md), seção 5.8 (RNF-018). Taxas de amostragem, dashboards e limiares de alerta continuam sendo design |
| Catálogo completo de emails transacionais | RF-021, na fase de cada fluxo |
| Provisionamento de Vercel, Neon, R2 e Resend | Fase 1 |

## 18. Rastreabilidade

| Item | Efeito deste documento |
| --- | --- |
| F0-022 | Entrega parcial: este é um dos quatro documentos exigidos |
| RB-001 | Sustentada por AR-2.1, AR-3.4, AR-4.2, AR-8.2, AR-8.3, AR-13.3 e por [contact-release.md](contact-release.md) |
| RB-002 | Sustentada por 6.3 e pelo modelo de avaliação de [data-model.md](data-model.md) |
| RB-003 | Sustentada por AR-3.5, AR-7.3, AR-11.3 e por [data-model.md](data-model.md), DM-6 |
| RB-004 | Preservada literalmente; AR-11.4 explicita a fronteira já fixada por PE-12.1 a PE-12.4 |
| RB-005 | Sustentada por AR-8.1 e AR-8.3 |
| RB-006 | Sustentada por 6.3 e pelo modelo de moderação de [data-model.md](data-model.md) |
| RNF-007, RNF-008, RNF-013, RNF-014, RNF-015, RNF-016, RNF-017, RNF-018 | Convertidos em regra estrutural nas seções 4, 7, 8, 9, 14 e 16 |
| ADR-0001 a ADR-0005 | Obedecidos integralmente; nenhum é alterado |
| [ADR-0006](../adr/0006-async-work-scheduling-concurrency.md) | **Criado** por F0-022 (DEC-038), para o tema que a seção 15 exigia decidir |
| [ADR-0007](../adr/0007-observability-sentry.md) | **Criado** por F1-008 (DEC-039), que fechou a lacuna de ferramenta e escopo de AR-14.1. **Preserva integralmente AR-14.2, AR-14.3 — os seis sinais mínimos, sem redução — e AR-14.4**; nenhuma outra parte deste documento é alterada |
| DEC-019 | Materializada: a reserva atômica antes da cobrança deixa de ser recomendação e ganha mecanismo |
| DEC-037 | Obedecida integralmente; CI-1 a CI-12 são rastreados em [payments-design.md](payments-design.md) |
| R-02, R-04 | Mitigação sai do plano normativo e ganha mecanismo; residual fica no teste de concorrência do gate da Fase 3 |
| R-09 | Reforçado por AR-15.4, com fundamento técnico novo além do comercial |

## 19. Revisão

Este documento é revisado quando uma nova decisão de produto ou ADR alterar o que ele assume, quando a Fase 1 materializar o scaffold e o schema, ou quando um fato externo aqui registrado deixar de valer.
