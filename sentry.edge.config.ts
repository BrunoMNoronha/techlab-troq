// Inicializacao da SDK de observabilidade no runtime Edge (F1-010).
//
// Carregado por `instrumentation.ts` quando `NEXT_RUNTIME === 'edge'`. Hoje a
// aplicacao nao tem middleware nem rota Edge; o arquivo existe porque e a
// posicao oficial da integracao e porque, sem ele, o primeiro middleware que
// existir perderia telemetria em silencio. Nao amplia coleta de dado nenhum:
// usa exatamente as mesmas opcoes dos outros dois runtimes.
import * as Sentry from '@sentry/nextjs';
import { createTelemetryOptions } from '@/modules/platform';

Sentry.init(createTelemetryOptions());
