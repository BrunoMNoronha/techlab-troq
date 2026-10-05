import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CardList } from '@/components/data-display';
import { EmptyState } from '@/components/feedback';
import { Cluster, PageContainer, PageHeader, Stack } from '@/components/layout';
import { Badge, ButtonLink, Card, Heading, Text, TextLink } from '@/components/ui';
import { listOwnContactReleases } from '@/modules/contact';
import { loginRedirectPath, validateSession } from '@/modules/identity';
import { listOwnContactRequests } from '@/modules/request';
import { CHOSEN_LABEL, DATE_TIME, loginPathWithReturn, PHASE_LABELS } from './_components/phase';

// Solicitacoes de contato da propria pessoa (F3-012, #102). So o ator ve as
// dele; nada de vagas, de outros solicitantes nem de dado de pagamento.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Minhas solicitações — TROQS',
  robots: { index: false, follow: false },
};

export default async function MinhasSolicitacoesPage() {
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    redirect(loginPathWithReturn(loginRedirectPath(session.reason), '/solicitacoes'));
  }

  const requests = await listOwnContactRequests();
  if (!requests) {
    redirect(loginPathWithReturn(loginRedirectPath('no_session'), '/solicitacoes'));
  }
  // Liberacoes do proprio ator, sem o numero (CR-1.2): so marcam a solicitacao escolhida.
  const chosenListings = requests.some((r) => r.phase === 'paid')
    ? new Set(((await listOwnContactReleases()) ?? []).map((r) => r.listingId))
    : new Set<string>();

  return (
    <PageContainer width="content">
      <PageHeader
        title="Minhas solicitações"
        description={
          <>
            Solicitações pagas de contato que você fez. Só você vê esta página.{' '}
            <TextLink href="/contatos">Contatos liberados para você</TextLink>
          </>
        }
      />

      {requests.length === 0 ? (
        <EmptyState
          titleAs="p"
          title="Você ainda não fez nenhuma solicitação."
          action={
            <ButtonLink href="/explorar" iconStart="search">
              Explorar ofertas
            </ButtonLink>
          }
        />
      ) : (
        <CardList>
          {requests.map((item) => {
            const phase =
              item.phase === 'paid' && chosenListings.has(item.listingId)
                ? CHOSEN_LABEL
                : PHASE_LABELS[item.phase];
            const title = item.listingTitle ?? 'Anúncio indisponível';
            return (
              <Card as="li" key={item.contactRequestId}>
                <Stack gap={2}>
                  <Heading level={2} size="h3" wrapAnywhere>
                    {title}
                  </Heading>
                  <Text size="small" tone="muted">
                    Feita em {DATE_TIME.format(new Date(item.createdAt))}
                  </Text>
                  <Cluster justify="between" gap={2}>
                    <Badge tone={phase.tone}>{phase.label}</Badge>
                    <TextLink
                      href={`/solicitacoes/${item.contactRequestId}`}
                      aria-label={`Acompanhar a solicitação de ${title}`}
                      iconEnd="chevron-right"
                    >
                      Acompanhar
                    </TextLink>
                  </Cluster>
                </Stack>
              </Card>
            );
          })}
        </CardList>
      )}
    </PageContainer>
  );
}
