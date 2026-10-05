import type { Metadata } from 'next';
import { CardList } from '@/components/data-display';
import { notFound, redirect } from 'next/navigation';
import { Alert, ErrorState } from '@/components/feedback';
import { PageContainer, PageHeader, Section, Stack } from '@/components/layout';
import { BackLink } from '@/components/navigation';
import { Badge, ButtonLink, Card, Text } from '@/components/ui';
import { loginRedirectPath, validateSession } from '@/modules/identity';
import { getListingTitles } from '@/modules/listing';
import { getSelectionOptions, listOwnedListingNegotiations } from '@/modules/negotiation';
import { LISTING_STATUS_LABELS } from '../../_components/listing-status';
import { SelectionPanel } from './selection-panel';

// Solicitacoes pagas elegiveis do anuncio e escolha, so para o dono (F3-012,
// #102; PD-11.3; RF-013). Os dados vem de `getSelectionOptions`, lido aqui no
// Server Component, e nao viram endpoint de consulta. Anuncio alheio,
// inexistente ou com ID malformado: o mesmo 404. Interesse gratuito e reserva
// nao paga nunca aparecem (interest-flow.md, secao 6; CR-4.2).
//
// Sem `loading.tsx` de proposito: o 404 e o redirecionamento de login
// precisam do status HTTP real (achado de F2-006).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Solicitações do anúncio — TROQ',
  robots: { index: false, follow: false },
};

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export default async function SolicitacoesDoAnuncioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const here = `/anuncios/${id}/solicitacoes`;
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    redirect(`${loginRedirectPath(session.reason)}&next=${encodeURIComponent(here)}`);
  }

  const result = await getSelectionOptions(id);
  if (!result.success) {
    if (result.reason === 'not_found') notFound();
    if (result.reason !== 'error') {
      redirect(`${loginRedirectPath('no_session')}&next=${encodeURIComponent(here)}`);
    }
  }

  const options = result.success ? result.options : null;
  const [titles, history] = options
    ? await Promise.all([getListingTitles([id]), listOwnedListingNegotiations(id)])
    : [null, null];
  if (history && !history.success && history.reason === 'not_found') notFound();
  const title = titles?.get(id) ?? null;

  return (
    <PageContainer width="content">
      <PageHeader
        navigation={<BackLink href="/anuncios">Meus anúncios</BackLink>}
        title="Solicitações pagas"
        description={options ? (title ?? 'Anúncio removido') : undefined}
        meta={
          options ? (
            <Badge tone={LISTING_STATUS_LABELS[options.listingStatus].tone}>
              {LISTING_STATUS_LABELS[options.listingStatus].label}
            </Badge>
          ) : undefined
        }
      />

      {!options ? (
        <ErrorState
          title="Não foi possível carregar as solicitações agora. Nada foi alterado."
          action={
            <ButtonLink href={here} variant="outline" iconStart="refresh">
              Tentar novamente
            </ButtonLink>
          }
        />
      ) : (
        <Stack gap={6}>
          <Text size="small" tone="muted">
            Aqui aparecem só as solicitações com pagamento confirmado, no máximo três por anúncio.
            Você escolhe uma pessoa, e só ela recebe o seu WhatsApp/telefone. Interesses gratuitos e
            reservas ainda não pagas não aparecem.
          </Text>

          {options.activeNegotiation && (
            <Alert
              as="section"
              role="status"
              aria-label="Negociação em andamento"
              tone="success"
              titleAs="h2"
              title={`Você escolheu ${options.activeNegotiation.chosenDisplayName}`}
            >
              <p>
                O seu contato foi liberado só para essa pessoa. Enquanto esta negociação estiver em
                andamento, não é possível escolher outra pessoa.
              </p>
              <ButtonLink
                href={`/negociacoes/${options.activeNegotiation.negotiationId}`}
                variant="outline"
              >
                Acompanhar negociação
              </ButtonLink>
            </Alert>
          )}

          {options.blockedBy === 'listing_removed' && (
            <Alert role="status">Este anúncio foi removido e não admite escolha.</Alert>
          )}
          {options.blockedBy === 'listing_not_published' && (
            <Alert role="status">
              Para escolher outra pessoa, o anúncio precisa estar publicado.
            </Alert>
          )}

          <Section
            title={options.activeNegotiation ? 'Outras solicitações pagas' : 'Escolha uma pessoa'}
          >
            <SelectionPanel
              listingId={id}
              blocked={options.blockedBy !== null}
              reselection={options.mode === 'reselection'}
              candidates={options.candidates.map((c) => ({
                contactRequestId: c.contactRequestId,
                requesterDisplayName: c.requesterDisplayName,
                paidAtLabel: DATE_TIME.format(new Date(c.paidAt)),
              }))}
            />
          </Section>

          {history?.success && history.negotiations.length > 0 ? (
            <Section title="Histórico de negociações">
              <CardList>
                {history.negotiations.map((negotiation) => (
                  <Card as="li" key={negotiation.negotiationId}>
                    <Stack gap={3}>
                      <Text weight="semibold" wrapAnywhere>
                        {negotiation.counterpartDisplayName}
                      </Text>
                      <Text size="small" tone="muted">
                        {negotiation.status === 'closed'
                          ? `Encerrada${negotiation.closedAt ? ` em ${DATE_TIME.format(new Date(negotiation.closedAt))}` : ''}`
                          : 'Em andamento'}
                      </Text>
                      <ButtonLink
                        href={`/negociacoes/${negotiation.negotiationId}`}
                        variant="outline"
                      >
                        Ver negociação
                      </ButtonLink>
                    </Stack>
                  </Card>
                ))}
              </CardList>
            </Section>
          ) : history && !history.success ? (
            <ErrorState
              title="Não foi possível carregar o histórico de negociações."
              action={
                <ButtonLink href={here} reload variant="outline">
                  Tentar novamente
                </ButtonLink>
              }
            />
          ) : null}
        </Stack>
      )}
    </PageContainer>
  );
}
