import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Cluster, PageContainer, Section, Stack } from '@/components/layout';
import { ButtonLink, Card, Heading, Text, TextLink } from '@/components/ui';
import { HowItWorks } from './_components/how-it-works';
import { LatestOffers, OffersLoading } from './_components/latest-offers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'TROQ — anúncios entre pessoas com contato protegido',
  description:
    'Veja ofertas publicadas sem precisar de login. O contato do anunciante só é liberado à pessoa escolhida, após solicitação paga de R$ 0,99.',
};

export default function HomePage() {
  return (
    <PageContainer width="wide">
      <Stack gap={12}>
        <Stack as="section" gap={6}>
          <Stack gap={3}>
            <Heading level={1} size="display">
              Anúncios entre pessoas, com contato protegido
            </Heading>
            <Text size="lead" tone="muted" measure>
              No TROQ você vê as ofertas e os detalhes de cada anúncio sem precisar de login. O
              WhatsApp/telefone do anunciante só é liberado à pessoa que ele escolher.
            </Text>
          </Stack>
          <Cluster gap={3}>
            <ButtonLink href="/explorar" iconEnd="arrow-right">
              Explorar ofertas
            </ButtonLink>
            <ButtonLink href="/cadastro" variant="outline">
              Criar conta
            </ButtonLink>
            <TextLink href="/login" touch>
              Entrar
            </TextLink>
          </Cluster>
        </Stack>

        <Section title="Ofertas recentes" titleId="ofertas-recentes">
          <Suspense fallback={<OffersLoading />}>
            <LatestOffers />
          </Suspense>
        </Section>

        <Card variant="muted" padding="lg">
          <HowItWorks />
        </Card>

        <Section
          title="Quer anunciar?"
          titleId="para-anunciantes"
          description="Crie uma conta, confirme seu e-mail e cadastre seu anúncio. Ele só aparece para o público depois de publicado, e o seu contato nunca é exibido na página do anúncio."
        >
          <Cluster gap={3}>
            <ButtonLink href="/cadastro" variant="outline">
              Criar conta
            </ButtonLink>
            <ButtonLink href="/anuncios" variant="outline">
              Meus anúncios
            </ButtonLink>
          </Cluster>
        </Section>
      </Stack>
    </PageContainer>
  );
}
