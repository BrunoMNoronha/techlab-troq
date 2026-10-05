import { redirect } from 'next/navigation';
import { getOwnContactStatus } from '@/modules/contact';
import { validateSession, logoutUser, loginRedirectPath } from '@/modules/identity';
import { hasLinkedGoogleAccount, isGoogleSignInAvailable } from '@/modules/identity/google';
import { DescriptionList, List, ListItem } from '@/components/data-display';
import { Alert } from '@/components/feedback';
import { Form, FormActions } from '@/components/forms';
import { PageContainer, PageHeader, Section, Stack } from '@/components/layout';
import { Badge, Button, Card, Text } from '@/components/ui';
import { ContactForm } from './contact-form';
import { GoogleLinkButton } from './google-link';

// Resultado da vinculacao da Conta Google, repassado por /login/google (IC-15.4).
const GOOGLE_LINK_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  vinculada: { text: 'Conta Google vinculada. Voce ja pode entrar com ela.', ok: true },
  cancelado: { text: 'A vinculacao com o Google foi cancelada.', ok: false },
  email_diferente: {
    text: 'A Conta Google escolhida tem outro e-mail. So e possivel vincular uma Conta Google com o mesmo e-mail desta conta, verificado pelo Google.',
    ok: false,
  },
  ja_vinculada: {
    text: 'Esta Conta Google ja esta vinculada a outra conta TROQS e nao pode ser transferida.',
    ok: false,
  },
  falha: {
    text: 'Nao foi possivel vincular a Conta Google. Confira se o e-mail esta verificado no Google e tente novamente.',
    ok: false,
  },
};

export const dynamic = 'force-dynamic';

export default async function ContaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    redirect(loginRedirectPath(sessionResult.reason));
  }

  const { erro, google } = await searchParams;
  const logoutFailed = erro === 'logout';
  const googleMessage = typeof google === 'string' ? GOOGLE_LINK_MESSAGES[google] : undefined;

  const user = sessionResult.user;
  // So o booleano do proprio dono; o numero nunca chega a esta pagina (CR-2.5).
  const contactStatus = await getOwnContactStatus();
  if (!contactStatus) {
    redirect(loginRedirectPath('no_session'));
  }
  const googleLinked = await hasLinkedGoogleAccount(user.id);
  const googleAvailable = isGoogleSignInAvailable();

  async function handleLogout() {
    'use server';
    const result = await logoutUser();
    redirect(result.success ? '/login?motivo=encerrada' : '/conta?erro=logout');
  }

  return (
    <PageContainer width="content">
      <PageHeader
        title="Minha Conta"
        description="Área privada de gerenciamento do seu perfil no TROQS."
      />

      <Stack gap={6}>
        <Card>
          <Section title="Dados da conta" titleId="conta-dados">
            {/* Dados exibidos, nao campos de formulario: lista de definicao em vez de <label>. */}
            <DescriptionList
              items={[
                {
                  term: 'Nome de exibição',
                  detail: (
                    <Text as="span" weight="semibold" wrapAnywhere>
                      {user.displayName}
                    </Text>
                  ),
                },
                {
                  term: 'E-mail',
                  detail: (
                    <Text as="span" wrapAnywhere>
                      {user.email}
                    </Text>
                  ),
                },
                {
                  term: 'Status da conta',
                  detail: (
                    <Badge tone="success" icon="check-circle">
                      Verificada e Ativa
                    </Badge>
                  ),
                },
              ]}
            />
          </Section>
        </Card>

        <ContactForm hasContact={contactStatus.hasContact} />

        <Card>
          <Section title="Conta Google" titleId="conta-google" gap={3}>
            {googleMessage && (
              <Alert
                role={googleMessage.ok ? 'status' : 'alert'}
                tone={googleMessage.ok ? 'success' : 'error'}
              >
                {googleMessage.text}
              </Alert>
            )}
            {googleLinked ? (
              <Text size="small" icon="check-circle">
                Sua Conta Google está vinculada e pode ser usada para entrar no TROQS.
              </Text>
            ) : googleAvailable ? (
              <>
                <Text size="small" tone="muted">
                  Vincule a Conta Google que usa o mesmo e-mail desta conta para entrar com ela.
                </Text>
                <GoogleLinkButton />
              </>
            ) : (
              <Text size="small" tone="muted">
                A entrada com Google não está disponível no momento.
              </Text>
            )}
          </Section>
        </Card>

        <Section title="Atalhos" titleId="conta-atalhos" gap={3}>
          <List>
            <ListItem href="/solicitacoes" icon="inbox" title="Minhas solicitações" />
            <ListItem href="/contatos" icon="phone" title="Contatos liberados para você" />
          </List>
        </Section>

        <Stack gap={4}>
          {logoutFailed && (
            <Alert role="alert" tone="error">
              Nao foi possivel encerrar a sessao. Tente novamente.
            </Alert>
          )}

          <Form action={handleLogout}>
            <FormActions>
              <Button type="submit" variant="dangerOutline" iconStart="log-out" fullWidth>
                Sair da Conta
              </Button>
            </FormActions>
          </Form>
        </Stack>
      </Stack>
    </PageContainer>
  );
}
