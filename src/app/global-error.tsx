'use client';

import '@/styles/globals.css';

// Fronteira de erro global do App Router (F1-010).
//
// O React trata erro de renderizacao nao tratado sem propaga-lo ao `window`,
// de modo que, sem este arquivo, uma falha de render do layout raiz nao viraria
// evento nenhum. Ele captura e reporta; a tela devolvida e deliberadamente
// generica, porque mensagem de erro nao e canal lateral de informacao
// (docs/engineering/conventions.md, secao 3.7).

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { ErrorState } from '@/components/feedback';
import { PageContainer } from '@/components/layout';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <PageContainer width="narrow">
          <ErrorState
            title="Algo deu errado"
            titleAs="h1"
            description="Nao foi possivel carregar esta pagina. Tente novamente em instantes."
          />
        </PageContainer>
      </body>
    </html>
  );
}
