import { redirect } from 'next/navigation';
import { Alert } from '@/components/feedback';
import { PageContainer, PageHeader, Stack } from '@/components/layout';
import { BackLink } from '@/components/navigation';
import { loginRedirectPath, validateSession } from '@/modules/identity';
import { ListingForm } from '../_components/listing-form';

export const dynamic = 'force-dynamic';

export default async function NovoAnuncioPage() {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    redirect(loginRedirectPath(sessionResult.reason));
  }

  return (
    <PageContainer width="content">
      <PageHeader
        navigation={<BackLink href="/anuncios">Meus anúncios</BackLink>}
        title="Novo anúncio"
        description={
          <>
            Seu anúncio será salvo como <strong>rascunho</strong>, visível só para você. Informe
            apenas a cidade e a UF como localização.
          </>
        }
      />

      <Stack gap={8}>
        <ListingForm mode="create" />

        {/* Espaco reservado para imagens: upload e processamento pertencem a F2-008 (#46). */}
        <Alert tone="neutral">
          <p>
            <strong>Imagens do produto:</strong> para ser publicado, o anúncio precisará de 1 a 6
            fotos. O envio de fotos ainda não está disponível.
          </p>
        </Alert>
      </Stack>
    </PageContainer>
  );
}
