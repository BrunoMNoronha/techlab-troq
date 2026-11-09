import { redirect } from 'next/navigation';
import { CardList } from '@/components/data-display';
import { EmptyState } from '@/components/feedback';
import { PageContainer, PageHeader, Stack } from '@/components/layout';
import { ButtonLink, Card, Heading, Text } from '@/components/ui';
import { listOwnContactReleases } from '@/modules/contact';
import { loginRedirectPath, validateSession } from '@/modules/identity';
import { getListingTitles } from '@/modules/listing';
import { ContactReveal } from './contact-reveal';

// Tela do escolhido: os contatos liberados para ele (F3-010, #100;
// contact-release.md, CR-6 e CR-7). A pagina lista as autorizacoes DO ATOR
// (CR-5.3) e nunca contem o numero: ele so sai pela Server Action, sob gesto
// explicito, reverificado a cada chamada (CR-6.2 item 2).
//
// Dinamica e sem cache (CR-7.4): `force-dynamic`, `nodejs`, sem `revalidate`,
// e nenhuma leitura passa por cache de dados.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export default async function ContatosPage() {
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    redirect(loginRedirectPath(session.reason));
  }

  const releases = await listOwnContactReleases();
  if (!releases) {
    redirect(loginRedirectPath('no_session'));
  }
  const titles = await getListingTitles(releases.map((r) => r.listingId));

  return (
    <PageContainer width="content">
      <PageHeader
        title="Contatos liberados para você"
        description="Quando um anunciante escolhe a sua solicitação paga, o contato dele fica disponível aqui. Cada consulta é registrada."
      />

      {releases.length === 0 ? (
        <EmptyState icon="phone" titleAs="p" title="Nenhum contato foi liberado para você ainda." />
      ) : (
        <CardList>
          {releases.map((release) => (
            <Card as="li" key={release.contactReleaseId}>
              <Stack gap={3}>
                <Stack gap={1}>
                  <Heading level={2} size="h3" wrapAnywhere>
                    {titles.get(release.listingId) ?? 'Anúncio indisponível'}
                  </Heading>
                  <Text size="small" tone="muted">
                    Liberado em {DATE_FORMAT.format(new Date(release.authorizedAt))}
                  </Text>
                </Stack>
                <ContactReveal contactReleaseId={release.contactReleaseId} />
                <ButtonLink href={`/negociacoes/${release.negotiationId}`} variant="outline">
                  Acompanhar negociação e avaliar
                </ButtonLink>
              </Stack>
            </Card>
          ))}
        </CardList>
      )}
    </PageContainer>
  );
}
