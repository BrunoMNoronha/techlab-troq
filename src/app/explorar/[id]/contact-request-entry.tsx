import { Stack } from '@/components/layout';
import { Card, Heading, Text } from '@/components/ui';
import type { ContactRequestEntryState } from '@/modules/request';
import { ContactRequestEntryMessage } from '../../_components/contact-request-entry-message';
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
        <ContactRequestEntryMessage
          state={state}
          listingId={listingId}
          ownRequestId={ownRequestId}
          available={<InterestFlow listingId={listingId} />}
        />
      </Stack>
    </Card>
  );
}
