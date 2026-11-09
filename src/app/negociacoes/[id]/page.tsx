import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ErrorState } from '@/components/feedback';
import { PageContainer, PageHeader } from '@/components/layout';
import { BackLink } from '@/components/navigation';
import { Badge, ButtonLink } from '@/components/ui';
import { loginRedirectPath, validateSession } from '@/modules/identity';
import { getListingTitles } from '@/modules/listing';
import { getOwnNegotiation } from '@/modules/negotiation';
import { getOwnRating } from '@/modules/reputation';
import { NegotiationPanel } from './negotiation-panel';

// Leituras privadas das partes, sem cache nem segmento loading que transforme
// a negativa uniforme em uma resposta HTTP 200. O DTO nunca inclui contato
// nem a nota da contraparte, e cada action revalida sessao e participacao.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Negociação — TROQ',
  robots: { index: false, follow: false },
};

export default async function NegociacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const here = `/negociacoes/${id}`;
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    redirect(`${loginRedirectPath(session.reason)}&next=${encodeURIComponent(here)}`);
  }

  const result = await getOwnNegotiation(id);
  if (!result.success) {
    if (result.reason === 'not_found') notFound();
    if (result.reason !== 'error') {
      redirect(`${loginRedirectPath('no_session')}&next=${encodeURIComponent(here)}`);
    }
    return (
      <PageContainer width="content">
        <PageHeader title="Negociação" />
        <ErrorState
          title="Não foi possível carregar a negociação agora."
          action={
            <ButtonLink href={here} reload variant="outline">
              Tentar novamente
            </ButtonLink>
          }
        />
      </PageContainer>
    );
  }

  const negotiation = result.negotiation;
  const [titles, rating] = await Promise.all([
    getListingTitles([negotiation.listingId]),
    negotiation.status === 'closed' ? getOwnRating(id) : Promise.resolve(null),
  ]);
  if (rating && !rating.success) {
    if (rating.reason === 'not_found') notFound();
    if (
      rating.reason === 'login_required' ||
      rating.reason === 'email_unverified' ||
      rating.reason === 'account_restricted'
    ) {
      redirect(`${loginRedirectPath('no_session')}&next=${encodeURIComponent(here)}`);
    }
  }

  return (
    <PageContainer width="content">
      <PageHeader
        navigation={
          <BackLink
            href={
              negotiation.role === 'owner'
                ? `/anuncios/${negotiation.listingId}/solicitacoes`
                : '/contatos'
            }
          >
            {negotiation.role === 'owner' ? 'Solicitações do anúncio' : 'Contatos liberados'}
          </BackLink>
        }
        title="Sua negociação"
        description={titles.get(negotiation.listingId) ?? 'Anúncio indisponível'}
        meta={
          <Badge tone={negotiation.status === 'closed' ? 'neutral' : 'success'}>
            {negotiation.status === 'closed' ? 'Encerrada' : 'Em andamento'}
          </Badge>
        }
      />
      <NegotiationPanel negotiation={negotiation} rating={rating?.success ? rating.view : null} />
    </PageContainer>
  );
}
