// Hook de instrumentacao do Next.js (App Router), materializado por F1-010.
//
// Mora em `src/` porque a aplicacao usa diretorio `src`: essa e a posicao que o
// framework procura nesse layout. Na raiz do repositorio o arquivo e ignorado
// pelo build de producao da plataforma de deploy, e o SDK nunca inicializa no
// servidor — falha silenciosa, comprovada em preview durante F1-010.
//
// `register` roda uma vez por processo de servidor, antes de qualquer
// requisicao; `onRequestError` entrega ao Sentry os erros nao tratados de
// Server Components, Route Handlers, Server Actions e middleware, que de outro
// modo nao virariam evento (ADR-0007, decisao 3).
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
