'use client';

import { useEffect, useRef } from 'react';
import { useGoogleRedirect } from '@/app/_components/google-sign-in';
import { linkGoogleAccount } from '@/modules/identity/google-actions';
import { Alert } from '@/components/feedback';
import { Cluster, Stack } from '@/components/layout';
import { Button } from '@/components/ui';

// Vinculacao explicita da Conta Google (IC-15.4): so a partir desta area
// privada, com sessao valida, e so se o Google confirmar o mesmo e-mail.

export function GoogleLinkButton() {
  const { pending, error, run } = useGoogleRedirect(() => linkGoogleAccount());
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <Stack gap={2}>
      <Cluster>
        <Button
          type="button"
          variant="outline"
          onClick={() => void run()}
          loading={pending}
          aria-describedby={error ? 'google-link-error' : undefined}
        >
          {pending ? 'Abrindo o Google...' : 'Vincular Conta Google'}
        </Button>
      </Cluster>
      {error && (
        <Alert id="google-link-error" ref={errorRef} tabIndex={-1} role="alert" tone="error">
          {error}
        </Alert>
      )}
    </Stack>
  );
}
