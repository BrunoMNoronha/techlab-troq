'use client';

import { use, useEffect, useRef, useState } from 'react';
import { loginUser } from '@/modules/identity/actions';
import { GoogleDivider, GoogleSignInButton } from '@/app/_components/google-sign-in';
import { Alert } from '@/components/feedback';
import { Field, Form, FormActions, Input } from '@/components/forms';
import { PageContainer, PageHeader, Stack } from '@/components/layout';
import { Button, Text, TextLink } from '@/components/ui';

// Motivos repassados por redirecionamentos server-side (area da conta, logout
// e retorno do Google pela rota /login/google, que so emite motivos desta lista).
const REASON_MESSAGES: Record<string, string> = {
  sessao: 'Entre com seu e-mail e senha para acessar sua conta.',
  bloqueada: 'Sua conta esta suspensa ou inativa. Entre em contato com a plataforma.',
  excluida: 'Esta conta esta em processo de exclusao e nao pode mais ser acessada.',
  nao_verificada: 'Seu e-mail ainda nao foi verificado. Confira sua caixa de entrada.',
  encerrada: 'Voce saiu da sua conta.',
  solicitar: 'Entre na sua conta para solicitar o desbloqueio do contato deste anuncio.',
  google_cancelado:
    'A entrada com Google foi cancelada e nenhuma conta foi criada. Tente de novo ou use seu e-mail e senha.',
  google_conta_existente:
    'Ja existe uma conta TROQ com o e-mail desta Conta Google. Entre com e-mail e senha e vincule a Conta Google em Minha conta.',
  google_email_nao_verificado:
    'O Google nao confirmou o e-mail desta conta. Verifique o e-mail no Google ou cadastre-se com e-mail e senha.',
  google_falha: 'Nao foi possivel entrar com Google. Tente novamente.',
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { motivo, next } = use(searchParams);
  // Repassado ao servidor, que valida o destino interno antes de usa-lo.
  const returnTo = typeof next === 'string' ? next : undefined;
  const reasonMessage = typeof motivo === 'string' ? REASON_MESSAGES[motivo] : undefined;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // O botao fica desabilitado durante o envio e perde o foco; apos um erro
  // (credencial invalida, limite de tentativas), o foco vai para a mensagem.
  useEffect(() => {
    if (errorMessage) errorRef.current?.focus();
  }, [errorMessage]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const res = await loginUser(email, password, returnTo);
    setLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Erro ao efetuar login.');
    } else if (res.redirectTo) {
      window.location.href = res.redirectTo;
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Entrar no TROQ"
        description="Informe suas credenciais para acessar sua conta."
      />

      <Stack gap={6}>
        {reasonMessage && !errorMessage && (
          <Alert tone="info" role="status">
            {reasonMessage}
          </Alert>
        )}

        {errorMessage && (
          <Alert id="login-error" ref={errorRef} tabIndex={-1} role="alert" tone="error">
            {errorMessage}
          </Alert>
        )}

        <Form onSubmit={handleSubmit}>
          <Field label="E-mail" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              aria-describedby={errorMessage ? 'login-error' : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </Field>

          <Field label="Senha" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              aria-describedby={errorMessage ? 'login-error' : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
            />
          </Field>

          <FormActions>
            <Button type="submit" loading={loading} fullWidth>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </FormActions>
        </Form>

        <GoogleDivider />
        <GoogleSignInButton returnTo={returnTo} />

        <Text tone="muted" size="small" align="center">
          Não tem uma conta?{' '}
          <TextLink href="/cadastro" reload>
            Cadastre-se
          </TextLink>
        </Text>
      </Stack>
    </PageContainer>
  );
}
