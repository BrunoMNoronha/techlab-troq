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

**Distinção obrigatória sobre idade:** o intervalo "18 a 50 anos" descreve o público-alvo, não uma regra técnica de cadastro. Idade mínima formal, forma de declaração de idade, eventual verificação e critérios jurídicos e operacionais de elegibilidade continuam abertos em [OD-11](../decisions/open-decisions.md) e não devem ser inferidos deste perfil.

### Papéis no produto

- **Anunciantes:** pessoas que publicam anúncios e escolhem com quem negociar.
- **Interessados (solicitantes):** pessoas que consultam anúncios e pagam R$ 0,99 para solicitar o desbloqueio de contato.

Critérios formais de elegibilidade (incluindo elegibilidade etária) ainda não foram definidos ([OD-11](../decisions/open-decisions.md)).

## Fluxo central

1. Usuário cria conta.
2. Publica ou consulta anúncios.
3. Interessado demonstra interesse.
4. Solicita desbloqueio de contato.
5. Paga R$ 0,99.
6. Cada anúncio aceita no máximo 3 solicitações pagas.
7. Anunciante escolhe uma solicitação.
8. Apenas o escolhido recebe WhatsApp/telefone.
9. Negociação pode ser encerrada.
10. Após o encerramento, avaliações são permitidas.
11. Anúncios podem ser denunciados e moderados.

O modo como o encerramento (passo 9) é tecnicamente confirmado **não está definido**. Ver [../decisions/open-decisions.md](../decisions/open-decisions.md).

As regras de negócio que governam este fluxo estão em [business-rules.md](business-rules.md).

## Capacidades obrigatórias

| Capacidade | Regras relacionadas | Observação |
| --- | --- | --- |
| Cadastro e login por email/senha com verificação de email | — | Better Auth como solução inicial |
| Publicação e consulta de anúncios com imagens | RB-005, RB-006 | Localização pública limitada a cidade/UF; ciclo de vida do anúncio definido em [listing-lifecycle.md](listing-lifecycle.md); quantidade e regras de imagens em aberto |
| Demonstração de interesse e solicitação de desbloqueio de contato | RB-003, RB-004 | Máximo de 3 solicitações pagas por anúncio; cobrança definitiva |
| Cobrança de R$ 0,99 via Pix | RB-004 | Gateway não decidido; depende de spike |
| Escolha de solicitante pelo anunciante | RB-001 | — |
| Liberação de contato somente ao escolhido, com pagamento aprovado | RB-001 | Autorização server-side e auditoria obrigatórias |
| Encerramento da negociação | RB-002 | Mecanismo de confirmação em aberto |
| Avaliação após encerramento | RB-002 | Regras detalhadas em aberto |
| Denúncia e moderação de anúncios | RB-006 | Catálogo de itens proibidos em aberto |
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
| Encerramento da negociação | Definição do mecanismo de encerramento |
| Avaliações | Definição das regras detalhadas de avaliação |
| Moderação | Catálogo/política de itens proibidos |
| Upload de imagens | Definição de quantidade e regras das imagens |
| Tratamento de dados pessoais | Política de retenção/exclusão de dados (LGPD) |
| Cadastro | Definição formal de elegibilidade etária (OD-11) |
