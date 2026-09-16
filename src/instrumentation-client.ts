// Inicializacao da SDK de observabilidade no navegador (F1-010).
//
// O Next.js executa este arquivo no bootstrap do cliente, antes do React, de
// modo que erro nao tratado de browser ja e capturado na primeira interacao.
// `onRouterTransitionStart` instrumenta a navegacao do App Router, fechando o
// trace de navegacao que de outro modo ficaria incompleto.
//
// A DSN e publica por natureza e vive em `NEXT_PUBLIC_SENTRY_DSN`; o rotulo do
// ambiente e `APP_ENV` (ADR-0007, decisoes 11 e 12). Nenhuma integracao de
// Session Replay e registrada, aqui ou em qualquer outro lugar (decisao 9).
import * as Sentry from '@sentry/nextjs';
import { createTelemetryOptions } from '@/modules/platform';

Sentry.init(createTelemetryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
