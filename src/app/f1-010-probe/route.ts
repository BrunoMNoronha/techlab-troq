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

export async function GET(request: Request): Promise<Response> {
  installProbeHooks();

  if (new URL(request.url).searchParams.get('report') === '1') {
    const client = Sentry.getClient();

    Sentry.captureMessage('f1-010 probe: mensagem de prova (report mode)');
    const flushed = await Sentry.flush(5000);

    let rawIngestStatus: number | string = 'skipped';
    const dsn = client?.getDsn();
    if (dsn !== undefined) {
      const url = `https://${dsn.host}/api/${dsn.projectId}/envelope/?sentry_key=${dsn.publicKey}&sentry_version=7`;
      const body =
        JSON.stringify({ event_id: '00000000000000000000000000000010' }) +
        String.fromCharCode(10) +
        JSON.stringify({ type: 'event' }) +
        String.fromCharCode(10) +
        JSON.stringify({
          message: 'f1-010 probe: envelope bruto de prova',
          level: 'info',
          environment: process.env.APP_ENV,
        }) +
        String.fromCharCode(10);
      try {
        const response = await fetch(url, { method: 'POST', body });
        rawIngestStatus = response.status;
      } catch (error) {
        rawIngestStatus = String(error).slice(0, 200);
      }
    }

    return Response.json({
      flushed,
      rawIngestStatus,
      hasClient: client !== undefined,
      hasDsn: client?.getDsn() !== undefined,
      environment: client?.getOptions().environment ?? null,
      enableLogs: client?.getOptions().enableLogs ?? null,
      tracesSampleRate: client?.getOptions().tracesSampleRate ?? null,
      appEnvPresent: typeof process.env.APP_ENV === 'string',
      dsnEnvPresent: typeof process.env.NEXT_PUBLIC_SENTRY_DSN === 'string',
      nextRuntime: process.env.NEXT_RUNTIME ?? null,
    });
  }

  Sentry.logger.info('f1-010 probe: log estruturado de prova', {
    probe: 'f1-010',
    appEnv: process.env.APP_ENV ?? 'unknown',
    listingId: 'lst_ficticio_0001',
  });

  await Sentry.startSpan({ name: 'f1-010 probe span', op: 'probe.f1_010' }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  throw new Error('f1-010 probe: erro nao tratado de servidor');
}
