import { createHash } from 'node:crypto';

export interface DemoTarget {
  environment: 'development' | 'preview';
  databaseFingerprint: string;
  mediaFingerprint: string;
}

export class DemoTargetError extends Error {
  constructor() {
    super('Os dados demonstrativos estão indisponíveis neste ambiente.');
    this.name = 'DemoTargetError';
  }
}

type Environment = Record<string, string | undefined>;
const fingerprint = (parts: string[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const invalid = (): never => {
  throw new DemoTargetError();
};

/** Identidade do destino, sem senha, usuário, query string ou URL em logs. */
export function databaseFingerprint(
  value: string | undefined,
  env: Environment = process.env,
): string {
  try {
    const url = new URL(value ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2 ||
      url.hash ||
      // pg permite substituir host/porta pela query; a identidade abaixo
      // precisa representar o destino que o driver realmente vai abrir.
      url.searchParams.has('host') ||
      url.searchParams.has('port')
    )
      return invalid();
    const decodedHost = decodeURIComponent(url.hostname);
    // DNS ignora caixa; caminho de socket Unix nao. pg aceita o caminho
    // percent-encoded no hostname, sem passar por sobrescrita na query.
    const hostname = decodedHost.startsWith('/') ? decodedHost : decodedHost.toLowerCase();
    // Somente o sufixo de pool documentado pelo Neon identifica o mesmo
    // compute. Em outros provedores, estes hosts podem ser bancos distintos.
    const databaseHost = /^ep-[a-z0-9-]+\..+\.neon\.tech$/.test(hostname)
      ? hostname.replace(/-pooler(?=\.)/, '')
      : hostname;
    // pg recorre a PGPORT quando a URL nao fixa a porta. Canonicalizar evita
    // colisao com o padrao 5432 e mantem equivalentes portas explicitas/PGPORT.
    const configuredPort = (url.port || env.PGPORT || '5432').trim();
    // Number aceita expoente/hexadecimal que parseInt(..., 10) do pg nao usa.
    if (!/^\d+$/.test(configuredPort)) return invalid();
    const port = Number(configuredPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return invalid();
    return fingerprint([
      databaseHost,
      String(port),
      // pg-connection-string usa decodeURI: caracteres reservados escapados
      // fazem parte do nome do banco e nao equivalem ao caractere literal.
      decodeURI(url.pathname.slice(1)),
    ]);
  } catch {
    return invalid();
  }
}

export function mediaFingerprint(endpoint: string | undefined, bucket: string | undefined): string {
  try {
    const url = new URL(endpoint ?? '');
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !bucket?.trim() ||
      bucket !== bucket.trim() ||
      bucket.includes('/')
    ) {
      return invalid();
    }
    return fingerprint([url.origin.toLowerCase(), url.pathname.replace(/\/+$/, ''), bucket]);
  } catch {
    return invalid();
  }
}

/** Resolve o alvo somente no servidor; não há fallback para ambiente ausente. */
export function inspectDemoTarget(env: Environment = process.env): DemoTarget {
  const environment = env.APP_ENV;
  if (environment !== 'development' && environment !== 'preview') return invalid();
  if (env.VERCEL === '1' && env.VERCEL_ENV !== 'preview') return invalid();
  if (env.VERCEL_ENV !== undefined && env.VERCEL_ENV !== environment) return invalid();
  if (![env.R2_REGION, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY].every((v) => v?.trim())) {
    return invalid();
  }
  try {
    const endpoint = new URL(env.R2_S3_ENDPOINT ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if (endpoint.protocol !== 'https:' && !(environment === 'development' && local))
      return invalid();
  } catch {
    return invalid();
  }
  return {
    environment,
    databaseFingerprint: databaseFingerprint(env.DATABASE_URL, env),
    mediaFingerprint: mediaFingerprint(env.R2_S3_ENDPOINT, env.R2_BUCKET),
  };
}

/** Operações precisam de uma declaração explícita, presa aos dois destinos. */
export function requireDemoTarget(env: Environment = process.env): DemoTarget {
  const target = inspectDemoTarget(env);
  if (
    env.DEMO_DATA_TARGET !== target.environment ||
    env.DEMO_DATABASE_FINGERPRINT !== target.databaseFingerprint ||
    env.DEMO_MEDIA_FINGERPRINT !== target.mediaFingerprint
  )
    return invalid();
  return target;
}
