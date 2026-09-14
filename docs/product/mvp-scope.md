# Escopo do MVP — TROQ

Documento de escopo inicial do MVP. Registra apenas o que foi definido até a Fase 0. Detalhes ainda não definidos estão em [../decisions/open-decisions.md](../decisions/open-decisions.md) e não devem ser inferidos deste documento.

## Objetivo do MVP

Permitir que pessoas publiquem anúncios e que interessados obtenham o contato (WhatsApp/telefone) do anunciante de forma controlada: o contato só é liberado a um interessado escolhido pelo anunciante, mediante uma solicitação paga de R$ 0,99, com no máximo 3 solicitações pagas por anúncio.

## Público principal

### Perfil do público-alvo

- Adultos entre 18 e 50 anos.
- Principalmente usuários de grandes centros urbanos.
- Familiarizados com marketplaces.
- Uso prioritário em smartphones.
- Experiência projetada para funcionar adequadamente também em redes móveis 3G/4G.

Este perfil orienta decisões de produto, design e prioridade (mobile-first, desempenho em 3G/4G, otimização de imagens). Os requisitos não funcionais derivados estão em [requirements.md](requirements.md).

**Distinção obrigatória sobre idade:** o intervalo "18 a 50 anos" descreve o público-alvo, não uma regra técnica de cadastro. A regra de cadastro está definida em [age-eligibility.md](age-eligibility.md) (DEC-034) e é apenas o piso de **18 anos completos ou mais**, por declaração explícita do usuário, sem coleta de documento, data de nascimento, selfie, biometria ou serviço externo de verificação. Não há teto de idade: os 50 anos do perfil nunca foram e não se tornam limite de nada.

### Papéis no produto

- **Anunciantes:** pessoas que publicam anúncios e escolhem com quem negociar.
- **Interessados (solicitantes):** pessoas que consultam anúncios e pagam R$ 0,99 para solicitar o desbloqueio de contato.

A elegibilidade etária formal está definida em [age-eligibility.md](age-eligibility.md) (DEC-034): 18 anos completos ou mais, declarados no cadastro.

## Fluxo central

1. Usuário cria conta.
2. Publica ou consulta anúncios.
3. Interessado demonstra interesse (ação gratuita de interface, sem entidade persistida).
4. Solicita desbloqueio de contato.
5. Paga R$ 0,99.
6. Cada anúncio aceita no máximo 3 solicitações pagas.
7. Anunciante escolhe uma solicitação.
8. Apenas o escolhido recebe WhatsApp/telefone.
9. Negociação pode ser encerrada.
10. Após o encerramento, avaliações são permitidas.
11. Anúncios podem ser denunciados e moderados.

O modo como o encerramento (passo 9) é tecnicamente confirmado está definido em [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029): a negociação tem os estados `active` e `closed`, e qualquer uma das duas partes pode encerrá-la unilateralmente, de forma explícita e irreversível. As regras detalhadas das avaliações (passo 10) estão definidas em [ratings.md](ratings.md) (DEC-030): avaliação bilateral sobre a contraparte, no máximo uma por direção, nota inteira de 1 a 5 sem texto livre, janela de 14 dias corridos e publicação cega até que ambas avaliem ou a janela termine.

A denúncia e a moderação (passo 11) seguem [prohibited-items.md](prohibited-items.md) (DEC-031): catálogo de itens proibidos por categorias, denúncia por usuário autenticado sem alterar o estado do anúncio, moderação com decisão `procedente`, `improcedente` ou `sem_acao`, remoção definitiva por transição administrativa do anúncio, prazos de 24 horas corridas na classe crítica e 5 dias úteis na comum, reincidência progressiva e contestação administrativa.

O passo 3 está definido em [interest-flow.md](interest-flow.md) (DEC-035): "Tenho interesse" é uma **ação gratuita de interface** que exige usuário autenticado, email verificado e anúncio `published` e apenas inicia o passo 4. Ela não é entidade persistida, não ocupa vaga paga, não pode ser cancelada — não há o que cancelar — e não é visível ao anunciante. O passo 3 deve ser lido como o início do passo 4, não como funcionalidade separada com estado próprio.

A escolha do passo 7 está definida em [reselection-policy.md](reselection-policy.md) (DEC-032) quanto à desistência e à reseleção: encerrada a negociação, o anunciante pode escolher outro solicitante pago elegível, com o anúncio `published`, sem que a liberação anterior seja revogada e sem criar vaga nova — no máximo três pessoas podem ser escolhidas sequencialmente, porque RB-003 limita a três as solicitações pagas.

As regras de negócio que governam este fluxo estão em [business-rules.md](business-rules.md).

## Capacidades obrigatórias

| Capacidade | Regras relacionadas | Observação |
| --- | --- | --- |
| Cadastro e login por email/senha com verificação de email | — | Better Auth como solução inicial |
| Publicação e consulta de anúncios com imagens | RB-005, RB-006 | Localização pública limitada a cidade/UF; ciclo de vida do anúncio definido em [listing-lifecycle.md](listing-lifecycle.md); regras de imagens em [image-policy.md](image-policy.md); publicação exige aceitação da declaração de conformidade com [prohibited-items.md](prohibited-items.md) |
| Demonstração de interesse e solicitação de desbloqueio de contato | RB-003, RB-004 | Demonstração de interesse gratuita e sem entidade persistida, definida em [interest-flow.md](interest-flow.md) (DEC-035); máximo de 3 solicitações pagas por anúncio; cobrança definitiva |
| Cobrança de R$ 0,99 via Pix | RB-004 | Gateway não decidido; depende de spike |
| Escolha de solicitante pelo anunciante | RB-001 | Desistência e reseleção definidas em [reselection-policy.md](reselection-policy.md) (DEC-032) |
| Liberação de contato somente ao escolhido, com pagamento aprovado | RB-001 | Autorização server-side e auditoria obrigatórias |
| Encerramento da negociação | RB-002 | Estados `active` e `closed`; encerramento unilateral por qualquer uma das partes, definido em [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029) |
| Avaliação após encerramento | RB-002 | Regras detalhadas em [ratings.md](ratings.md) (DEC-030) |
| Denúncia e moderação de anúncios | RB-006 | Política de itens proibidos, denúncia, moderação, remoção e prazos definida em [prohibited-items.md](prohibited-items.md) (DEC-031) |
| Email transacional | — | Resend como provedor inicial |

## Capacidades explicitamente adiáveis

Fora do núcleo inicial do MVP:

- Login social (fora do núcleo inicial de autenticação).
- Web Push (PWA faz parte do direcionamento mobile, mas Web Push não bloqueia o MVP).
- Coleta ou exposição de localização precisa (não deve ocorrer no MVP sem necessidade posteriormente documentada).
- Microserviços ou API Node separada (não criar sem necessidade futura comprovada).

## Dependências a resolver antes das respectivas implementações

| Implementação | Dependência prévia |
| --- | --- |
| Pagamentos | Spike que prove cobrança de exatamente R$ 0,99, confirmação, webhook, idempotência e tarifas; escolha do gateway (Mercado Pago é apenas primeiro candidato) |
| Limite de 3 solicitações pagas | Design de pagamentos detalhando reserva atômica de vaga antes da cobrança, com expiração |
| Encerramento da negociação | Mecanismo definido em [negotiation-lifecycle.md](negotiation-lifecycle.md) (DEC-029); sem dependência aberta |
| Avaliações | Regras definidas em [ratings.md](ratings.md) (DEC-030); sem dependência aberta |
| Moderação | Política definida em [prohibited-items.md](prohibited-items.md) (DEC-031); sem dependência aberta |
| Upload de imagens | Regras definidas em [image-policy.md](image-policy.md) (DEC-028); sem dependência aberta |
| Tratamento de dados pessoais | Política definida em [data-retention-policy.md](data-retention-policy.md) (DEC-033); sem dependência aberta |
| Cadastro | Elegibilidade etária definida em [age-eligibility.md](age-eligibility.md) (DEC-034); sem dependência aberta |
| Escolha e reseleção | Regras definidas em [reselection-policy.md](reselection-policy.md) (DEC-032); sem dependência aberta |
| Demonstração de interesse | Natureza definida em [interest-flow.md](interest-flow.md) (DEC-035); sem dependência aberta |
