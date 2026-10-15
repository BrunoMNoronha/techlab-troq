import type { ReactNode } from 'react';
import { Alert } from '@/components/feedback';
import { Cluster, Stack } from '@/components/layout';
import { ButtonLink, Text } from '@/components/ui';
import type { ContactRequestEntryState } from '@/modules/request';

// Mensagem de cada estado da entrada da solicitacao de desbloqueio (#59),
// compartilhada pelo bloco do detalhe e pelo dialogo do card (DEC-056). O
// estado vem do servidor (getContactRequestEntryView); nenhum estado aqui cria
// solicitacao, reserva ou cobranca.
export function ContactRequestEntryMessage({
  state,
  listingId,
  ownRequestId,
  available,
}: {
  state: Exclude<ContactRequestEntryState, 'listing_unavailable'>;
  listingId: string;
  ownRequestId: string | null;
  /** O que mostrar em `request_available`: o `InterestFlow` ou a confirmacao. */
  available: ReactNode;
}) {
  const loginHref = `/login?motivo=solicitar&next=${encodeURIComponent(`/explorar/${listingId}`)}`;

  switch (state) {
    case 'login_required':
      return (
        <Stack gap={3}>
          <Text>
            Para solicitar o desbloqueio do contato, entre na sua conta. Entrar não gera cobrança
            nem solicitação.
          </Text>
          <Cluster gap={3}>
            <ButtonLink href={loginHref}>Entrar para solicitar</ButtonLink>
            <ButtonLink href="/cadastro" variant="outline">
              Criar conta
            </ButtonLink>
          </Cluster>
        </Stack>
      );
    case 'email_unverified':
      return (
        <Alert tone="warning" role="status">
          <p>
            Confirme seu e-mail para poder solicitar o desbloqueio do contato. Confira sua caixa de
            entrada.
          </p>
        </Alert>
      );
    case 'account_restricted':
      return (
        <Alert tone="warning" role="status">
          <p>
            Sua conta está suspensa ou em exclusão e não pode solicitar o desbloqueio do contato.
          </p>
        </Alert>
      );
    case 'own_listing':
      return (
        <Alert tone="info" role="status">
          <p>Este anúncio é seu. Você não pode solicitar o próprio contato.</p>
        </Alert>
      );
    case 'not_accepting':
      // Anunciante sem contato cadastrado (DEC-040): o motivo nao e exposto.
      return (
        <Alert role="status">
          <p>
            Este anúncio não está aceitando solicitações no momento. Nenhuma solicitação foi criada
            e nada foi cobrado.
          </p>
        </Alert>
      );
    case 'own_request':
      return (
        <Stack gap={3}>
          <Alert tone="info" role="status">
            <p>
              Você já tem uma solicitação neste anúncio. Acompanhe o pagamento e a escolha do
              anunciante por lá; não é preciso solicitar de novo.
            </p>
          </Alert>
          {ownRequestId && (
            <Cluster>
              <ButtonLink href={`/solicitacoes/${ownRequestId}`} iconEnd="arrow-right">
                Acompanhar minha solicitação
              </ButtonLink>
            </Cluster>
          )}
        </Stack>
      );
    case 'request_available':
      return available;
    case 'no_slots':
      return (
        <Alert role="status">
          <p>
            As vagas de solicitação deste anúncio estão ocupadas no momento. Nenhuma solicitação foi
            criada e nada foi cobrado.
          </p>
        </Alert>
      );
  }
}
