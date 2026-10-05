import { redirect } from 'next/navigation';
import { Alert, EmptyState, ErrorState } from '@/components/feedback';
import { CardList } from '@/components/data-display';
import { Cluster, Grow, PageContainer, PageHeader, Stack } from '@/components/layout';
import { Badge, ButtonLink, Card, Heading, Text, TextLink } from '@/components/ui';
import { getOwnContactStatus } from '@/modules/contact';
import { validateSession, loginRedirectPath } from '@/modules/identity';
import { getOwnerListings } from '@/modules/listing';
import { isEditableStatus, LISTING_STATUS_LABELS } from './_components/listing-status';

export const dynamic = 'force-dynamic';

export default async function MeusAnunciosPage() {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    redirect(loginRedirectPath(sessionResult.reason));
  }

  const result = await getOwnerListings();

  if (result.reason === 'unauthenticated') {
    redirect(loginRedirectPath('no_session'));
  }

  // DEC-040: anuncio publicado de dono sem contato continua visivel, mas nao
  // aceita solicitacao. O painel orienta o cadastro; so o booleano e lido.
  const contactStatus = await getOwnContactStatus();
  const missingContact =
    contactStatus?.hasContact === false &&
    (result.listings ?? []).some((item) => item.status === 'published');

  return (
    <PageContainer width="content">
      <PageHeader
        title="Meus anúncios"
        description="Rascunhos, anúncios ativos e histórico. Só você vê esta página."
        actions={
          <ButtonLink href="/anuncios/novo" reload iconStart="plus">
            Novo anúncio
          </ButtonLink>
        }
      />

      <Stack gap={6}>
        {missingContact && (
          <Alert
            tone="warning"
            role="status"
            title="Seus anúncios publicados não estão aceitando solicitações."
          >
            <p>
              Cadastre seu telefone ou WhatsApp para receber solicitações. Ele fica protegido e só é
              entregue a quem você escolher.
            </p>
            <TextLink href="/conta" reload>
              Cadastrar contato
            </TextLink>
          </Alert>
        )}

        {!result.success || !result.listings ? (
          <ErrorState
            title="Não foi possível carregar seus anúncios"
            description="Seus anúncios não foram perdidos. Tente novamente em instantes."
            action={
              <ButtonLink href="/anuncios" reload iconStart="refresh">
                Tentar novamente
              </ButtonLink>
            }
          />
        ) : result.listings.length === 0 ? (
          <EmptyState
            icon="package"
            title="Você ainda não tem anúncios"
            description="Comece por um rascunho: ele fica visível só para você até ser publicado."
            action={
              <ButtonLink href="/anuncios/novo" reload iconStart="plus">
                Criar meu primeiro anúncio
              </ButtonLink>
            }
          />
        ) : (
          <CardList>
            {result.listings.map((item) => {
              const statusInfo = LISTING_STATUS_LABELS[item.status];
              const editable = isEditableStatus(item.status);

              return (
                <Card as="li" key={item.id}>
                  <Stack gap={3}>
                    <Cluster align="start" justify="between" nowrap>
                      <Grow>
                        <Heading level={2} size="h3" wrapAnywhere>
                          {item.title}
                        </Heading>
                      </Grow>
                      <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                    </Cluster>

                    <Text size="small" tone="muted" clamp={2} wrapAnywhere>
                      {item.description}
                    </Text>

                    <Cluster justify="between">
                      <Text as="span" size="small" tone="muted" icon="map-pin" wrapAnywhere>
                        {item.city} - {item.state}
                      </Text>
                      <Cluster gap={4}>
                        {/* F3-012 (#102): solicitacoes pagas e escolha. Rascunho nunca
                            recebeu solicitacao; removido nao admite escolha (P5). */}
                        {item.status !== 'draft' && item.status !== 'removed' && (
                          <TextLink
                            href={`/anuncios/${item.id}/solicitacoes`}
                            reload
                            touch
                            aria-label={`Solicitações pagas de ${item.title}`}
                          >
                            Solicitações
                          </TextLink>
                        )}
                        <TextLink
                          href={`/anuncios/${item.id}/editar`}
                          reload
                          touch
                          aria-label={`${editable ? 'Editar' : 'Ver histórico de'} ${item.title}`}
                        >
                          {editable ? 'Editar' : 'Ver'}
                        </TextLink>
                      </Cluster>
                    </Cluster>
                  </Stack>
                </Card>
              );
            })}
          </CardList>
        )}
      </Stack>
    </PageContainer>
  );
}
