'use client';

import { useState } from 'react';
import { registerUser } from '@/modules/identity/actions';
import { ResendVerificationForm } from '../verificar-email/resend-form';
import { GoogleDivider, GoogleSignInButton } from '@/app/_components/google-sign-in';
import { TermsConsentText } from '@/app/_components/terms-consent';
import { Alert } from '@/components/feedback';
import { Checkbox, Field, Form, FormActions, Input } from '@/components/forms';
import { PageContainer, PageHeader, Stack } from '@/components/layout';
import { Button, Text } from '@/components/ui';

export default function CadastroPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [over18, setOver18] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState<string | null>(null);
  const [deliveryFailed, setDeliveryFailed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const res = await registerUser({
      displayName,
      email,
      password,
      over18,
      termsAccepted,
    });

    setLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Erro ao realizar cadastro.');
    } else if (res.emailPending) {
      setDeliveryFailed(res.emailDelivery === 'failed');
      setEmailPending(res.emailPending);
    }
  }

  if (emailPending && deliveryFailed) {
    return (
      <PageContainer width="narrow">
        <PageHeader title="Conta criada — falta confirmar o e-mail" />
        <Stack gap={6}>
          <Alert tone="warning" role="alert">
            Sua conta foi criada, mas não conseguimos enviar agora o e-mail de confirmação para{' '}
            <strong>{emailPending}</strong>. Não é preciso se cadastrar de novo: peça um novo link
            abaixo. A conta só pode ser usada depois que o e-mail for confirmado.
          </Alert>
          <ResendVerificationForm initialEmail={emailPending} />
        </Stack>
      </PageContainer>
    );
  }

  if (emailPending) {
    return (
      <PageContainer width="narrow">
        <PageHeader title="Confirme seu e-mail" />
        <Stack gap={6}>
          <Alert tone="success" role="status">
            Enviamos um link de confirmação para <strong>{emailPending}</strong>. Por favor, acesse
            sua caixa de entrada e clique no link para ativar sua conta. O link vale por 24 horas.
          </Alert>
          <Text tone="muted" size="small" icon="info">
            Não encontrou? Verifique sua caixa de spam ou lixo eletrônico.
          </Text>
          <ResendVerificationForm initialEmail={emailPending} />
        </Stack>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Criar conta no TROQS"
        description="Plataforma direta de anúncios entre pessoas."
      />

      <Stack gap={6}>
        {errorMessage && (
          <Alert tone="error" role="alert">
            {errorMessage}
          </Alert>
        )}

        <Form onSubmit={handleSubmit}>
          <Field label="Nome de exibição" htmlFor="displayName">
            <Input
              id="displayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como quer ser chamado(a)"
            />
          </Field>

          <Field label="E-mail" htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </Field>

          <Field label="Senha" htmlFor="password">
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="De 8 a 128 caracteres"
            />
          </Field>

          <Stack gap={3}>
            <Checkbox
              required
              checked={over18}
              onChange={(e) => setOver18(e.target.checked)}
              label={
                <>
                  Declaro ter <strong>18 anos de idade ou mais</strong>.
                </>
              }
            />
            <Checkbox
              required
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              label={<TermsConsentText />}
            />
          </Stack>

          <FormActions>
            <Button type="submit" loading={loading} fullWidth>
              {loading ? 'Cadastrando...' : 'Criar minha conta'}
            </Button>
          </FormActions>
        </Form>

        <GoogleDivider />
        <GoogleSignInButton hint="Com o Google, você ainda declara ter 18 anos ou mais e aceita os Termos de Uso antes de a conta ser criada." />
      </Stack>
    </PageContainer>
  );
}
