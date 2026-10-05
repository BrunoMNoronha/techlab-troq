'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

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
    <main
      style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        role="alert"
        style={{
          padding: '16px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#991b1b',
        }}
      >
        <h1 style={{ fontSize: '20px', margin: '0 0 8px' }}>Não foi possível carregar</h1>
        <p style={{ margin: '0 0 12px' }}>
          Sua solicitação não foi alterada. Tente novamente em instantes.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            padding: '10px 16px',
            backgroundColor: '#991b1b',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
