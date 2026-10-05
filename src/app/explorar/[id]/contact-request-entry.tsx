import { Alert } from '@/components/feedback';
import { Cluster, Stack } from '@/components/layout';
import { ButtonLink, Card, Heading, Text } from '@/components/ui';
import type { ContactRequestEntryState } from '@/modules/request';
import { InterestFlow } from './interest-flow';

// Bloco "Solicitar desbloqueio do contato" do detalhe publico (#59). O estado
// vem do servidor (getContactRequestEntryView). Renderizar nao cria
// solicitacao, reserva nem cobranca: so a confirmacao explicita do
// `InterestFlow` chama o servidor (F3-012, #102), que revalida tudo.
export function ContactRequestEntry({
  listingId,
  state,
  ownRequestId = null,
}: {
  listingId: string;
  state: Exclude<ContactRequestEntryState, 'listing_unavailable'>;
  ownRequestId?: string | null;
}) {
  const loginHref = `/login?motivo=solicitar&next=${encodeURIComponent(`/explorar/${listingId}`)}`;

  return (
    <Card as="section" aria-labelledby="solicitar-contato" padding="lg">
      <Stack gap={4}>
        <Stack gap={2}>
          <Heading level={2} size="h3" id="solicitar-contato">
            Contato do anunciante
          </Heading>
          <Text tone="muted">
            O WhatsApp/telefone do anunciante é protegido pela plataforma e não aparece nesta
            página.
          </Text>
        </Stack>
        <EntryMessage
          state={state}
          loginHref={loginHref}
          listingId={listingId}
          ownRequestId={ownRequestId}
        />
      </Stack>
    </Card>
  );
}

function EntryMessage({
  state,
  loginHref,
  listingId,
  ownRequestId,
}: {
  state: Exclude<ContactRequestEntryState, 'listing_unavailable'>;
  loginHref: string;
  listingId: string;
  ownRequestId: string | null;
}) {
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
      return <InterestFlow listingId={listingId} />;
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
