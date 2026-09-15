// SUPERFICIE DIAGNOSTICA TEMPORARIA DE F1-010 — REMOVER ANTES DO MERGE.
//
// Existe apenas para provar, em `development` e `preview`, que a instrumentacao
// emite: log estruturado, span de requisicao e erro nao tratado de servidor.
// Nenhum efeito de negocio, nenhum dado real.

import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

let hooksInstalled = false;

function installProbeHooks(): void {
  if (hooksInstalled) {
    return;
  }
  const client = Sentry.getClient();
  if (client === undefined) {
    return;
  }
  hooksInstalled = true;
  client.on('afterSendEvent', (event, response) => {
    console.log(
      `[F1-010-SENT] type=${String(event.type ?? 'error')} env=${String(
        event.environment,
      )} status=${String((response as { statusCode?: number } | undefined)?.statusCode)}`,
    );
  });
  client.on('beforeEnvelope', (envelope) => {
    const itemTypes = envelope[1].map((item) => String(item[0].type));
    console.log(`[F1-010-ENVELOPE] items=${itemTypes.join(',')}`);
  });
}

export async function GET(): Promise<Response> {
  installProbeHooks();

  Sentry.logger.info('f1-010 probe: log estruturado de prova', {
    probe: 'f1-010',
    appEnv: process.env.APP_ENV ?? 'unknown',
    listingId: 'lst_ficticio_0001',
  });

  await Sentry.startSpan({ name: 'f1-010 probe span', op: 'probe.f1_010' }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  await Sentry.flush(3000);

  throw new Error('f1-010 probe: erro nao tratado de servidor');
}
