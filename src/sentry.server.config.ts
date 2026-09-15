// Inicializacao da SDK de observabilidade no runtime Node (F1-010).
//
// Carregado por `instrumentation.ts` quando `NEXT_RUNTIME === 'nodejs'`, que e
// a posicao documentada pelo provedor para o App Router. Toda a configuracao —
// DSN, ambiente, tracing, logs e a fronteira de privacidade — vem do modulo
// transversal `platform`, para que cliente, servidor e Edge nao divirjam.
import * as Sentry from '@sentry/nextjs';
import { createTelemetryOptions } from '@/modules/platform';

Sentry.init(createTelemetryOptions());
