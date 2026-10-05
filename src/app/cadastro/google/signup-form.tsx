'use client';

import { useEffect, useRef, useState } from 'react';
import { useGoogleRedirect } from '@/app/_components/google-sign-in';
import { cancelGoogleSignup, completeGoogleSignup } from '@/modules/identity/google-actions';
import { Alert } from '@/components/feedback';
import { Checkbox, Field, Form, FormActions, Input } from '@/components/forms';
import { Stack } from '@/components/layout';
import { Button, Text } from '@/components/ui';

// Formulario da conclusao do cadastro com Google (IC-15.3). As caixas de 18+ e
// de aceite dos termos comecam desmarcadas: o ato afirmativo e da pessoa, e o
// servidor valida os dois de novo. A idade nunca e inferida pelo perfil Google.

export function GoogleSignupForm({ email, returnTo }: { email: string; returnTo?: string }) {
  const [displayName, setDisplayName] = useState('');
  const [over18, setOver18] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const complete = useGoogleRedirect(() =>
    completeGoogleSignup({ displayName, over18, termsAccepted, returnTo }),
  );
  const cancel = useGoogleRedirect(() => cancelGoogleSignup());
  const busy = complete.pending || cancel.pending;
  const error = complete.error ?? cancel.error;

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void complete.run();
  }

  return (
    <Stack gap={6}>
      <Text tone="muted" size="small">
        O Google confirmou o e-mail <strong>{email}</strong>. Para criar sua conta no TROQ, escolha
        como quer ser chamado(a) e confirme as declarações abaixo. Nenhuma conta é criada antes
        disso. Ao concluir, você passa pelo Google mais uma vez para entrar.
      </Text>

      {error && (
        <Alert id="google-signup-error" ref={errorRef} tabIndex={-1} role="alert" tone="error">
          {error}
        </Alert>
      )}

      <Form onSubmit={handleSubmit} aria-describedby={error ? 'google-signup-error' : undefined}>
        <Field label="Nome de exibição" htmlFor="displayName">
          <Input
            id="displayName"
            type="text"
            autoComplete="nickname"
            required
            minLength={2}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Como quer ser chamado(a)"
          />
        </Field>

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
          label={
            <>
              Li e aceito os <strong>Termos de Uso e Política da Plataforma</strong>.
            </>
          }
        />

        <FormActions>
          <Button type="submit" disabled={busy} loading={complete.pending} fullWidth>
            {complete.pending ? 'Concluindo...' : 'Concluir cadastro'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => void cancel.run()}
            disabled={busy}
            loading={cancel.pending}
            fullWidth
          >
            {cancel.pending ? 'Cancelando...' : 'Cancelar e não criar conta'}
          </Button>
        </FormActions>
      </Form>
    </Stack>
  );
}
