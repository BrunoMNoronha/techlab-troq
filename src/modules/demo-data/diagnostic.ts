type FailureDetails = {
  code?: unknown;
  meta?: Record<string, unknown> & {
    driverAdapterError?: { cause?: { kind?: unknown; constraint?: { index?: unknown } } };
  };
  $metadata?: { httpStatusCode?: unknown };
};

/** Rotulo tecnico de falha para o CLI (#205): local do throw e codigos
 * estruturados. Nunca inclui mensagens de provedor, conexoes, chaves ou URLs. */
export function diagnoseFailure(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  const parts = [/^\w{1,60}$/.test(error.name) ? error.name : 'Error'];
  const details = error as FailureDetails;
  if (typeof details.code === 'string' && /^\w{1,40}$/.test(details.code)) {
    parts.push(details.code);
  }
  for (const key of ['modelName', 'field_name', 'constraint']) {
    const value = details.meta?.[key];
    if (typeof value === 'string' && /^[\w.() -]{1,80}$/.test(value)) {
      parts.push(`${key}=${value}`);
    }
  }
  // Prisma 7 com driver adapter: tipo do erro e nome da constraint, sem valores.
  const cause = details.meta?.driverAdapterError?.cause;
  if (typeof cause?.kind === 'string' && /^\w{1,60}$/.test(cause.kind)) {
    parts.push(`kind=${cause.kind}`);
  }
  const index = cause?.constraint?.index;
  if (typeof index === 'string' && /^\w{1,80}$/.test(index)) {
    parts.push(`index=${index}`);
  }
  const status = details.$metadata?.httpStatusCode;
  if (typeof status === 'number') parts.push(`http=${status}`);
  // Somente os codigos internos do provisionador; mensagens livres ficam fora.
  if (/^demo_[a-z_]{1,40}$/.test(error.message)) parts.push(error.message);
  const frame = error.stack
    ?.split('\n')
    .find((line) => /src[\\/]modules[\\/]/.test(line))
    ?.match(/([\w-]+\.ts):(\d+)/);
  if (frame) parts.push(`${frame[1]}:${frame[2]}`);
  return parts.join(' ');
}
