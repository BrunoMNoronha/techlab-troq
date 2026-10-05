'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { ErrorState } from '@/components/feedback';
import { PageContainer } from '@/components/layout';
import { Button } from '@/components/ui';

// Falha inesperada ao carregar a solicitacao (F3-012, #102). Mensagem generica:
// erro nao e canal lateral de informacao (conventions.md, secao 3.7).
export default function SolicitacoesError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <PageContainer width="content">
      <ErrorState
        title="Não foi possível carregar"
        titleAs="h1"
        description="Sua solicitação não foi alterada. Tente novamente em instantes."
        action={
          <Button iconStart="refresh" onClick={() => retry()}>
            Tentar novamente
          </Button>
        }
      />
    </PageContainer>
  );
}
