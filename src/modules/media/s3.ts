import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { TransientFailureCode } from './failure-codes';

// Fronteira do Cloudflare R2 pela API S3-compatible (ADR-0003). Le exatamente
// as variaveis normativas de docs/engineering/environments.md, secao 5.3, a
// cada chamada e FALHA FECHADA se faltar alguma: nao existe credencial
// substituta. O bucket e privado; nada aqui produz URL publica.
//
// A exclusao de objetos NAO mora aqui: ela e a fila de deletions.ts, consumida
// pelo job de F2-009 (#47).
//
// Nunca registrar em log a URL presignada, a query string assinada nem as
// credenciais (media-pipeline-contract.md, secao 14).

export interface R2Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class R2ConfigError extends Error {
  constructor(missing: string[]) {
    super(`Configuracao do R2 ausente: ${missing.join(', ')}`);
    this.name = 'R2ConfigError';
  }
}

const ENV = {
  endpoint: 'R2_S3_ENDPOINT',
  region: 'R2_REGION',
  bucket: 'R2_BUCKET',
  accessKeyId: 'R2_ACCESS_KEY_ID',
  secretAccessKey: 'R2_SECRET_ACCESS_KEY',
} as const;

export function getR2Config(): R2Config {
  const missing: string[] = [];
  const read = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) missing.push(name);
    return value ?? '';
  };
  const config = {
    endpoint: read(ENV.endpoint),
    region: read(ENV.region),
    bucket: read(ENV.bucket),
    accessKeyId: read(ENV.accessKeyId),
    secretAccessKey: read(ENV.secretAccessKey),
  };
  if (missing.length > 0) throw new R2ConfigError(missing);
  return config;
}

/** Validade da presigned URL de upload (media-pipeline-contract.md, 5.2). */
export const UPLOAD_URL_TTL_SECONDS = 900;

const REQUEST_TIMEOUT_MS = 60_000;
const CONNECTION_TIMEOUT_MS = 5_000;

let cached: { signature: string; client: S3Client } | null = null;

function r2(): { client: S3Client; bucket: string } {
  const config = getR2Config();
  const signature = [config.endpoint, config.region, config.accessKeyId].join('|');
  if (!cached || cached.signature !== signature) {
    cached = {
      signature,
      client: new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        // Sem isto o SDK 3.x assina na presigned PUT um x-amz-checksum-crc32 do
        // corpo VAZIO (o binario so existe no navegador). O R2 hoje o ignora, mas
        // a URL ficaria dependente dessa tolerancia; o checksum so entra quando a
        // operacao o exige.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        requestHandler: {
          requestTimeout: REQUEST_TIMEOUT_MS,
          connectionTimeout: CONNECTION_TIMEOUT_MS,
        },
      }),
    };
  }
  return { client: cached.client, bucket: config.bucket };
}

export interface PresignedUpload {
  url: string;
  /** Cabecalhos que o navegador DEVE enviar no PUT; fazem parte da assinatura. */
  headers: Record<string, string>;
}

/**
 * Presigned PUT single-part, somente para `key`, valida por 900 s.
 *
 * Tres cabecalhos ASSINADOS, comprovado contra o R2 real em 2026-09-29
 * (media-r2.integration.test.ts):
 * - `Content-Type`: sem `signableHeaders` o presigner do SDK NAO o assina
 *   (X-Amz-SignedHeaders=host) e o R2 aceita qualquer tipo; com ele, tipo
 *   diferente responde 403;
 * - `Content-Length`: o tamanho declarado vira parte da assinatura; corpo de
 *   outro tamanho responde 403. O navegador envia esse cabecalho sozinho;
 * - `If-None-Match: *`: a URL so cria o objeto; reutiliza-la para
 *   sobrescrever responde 412.
 * Nenhum deles substitui o `HeadObject` da confirmacao nem o `If-Match` do
 * processamento: sao endurecimento, nao a autoridade.
 */
export async function presignOriginalUpload(
  key: string,
  contentType: string,
  contentLength: number,
): Promise<PresignedUpload> {
  const { client, bucket } = r2();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
      IfNoneMatch: '*',
    }),
    {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(['content-type', 'content-length', 'if-none-match']),
    },
  );
  return { url, headers: { 'Content-Type': contentType, 'If-None-Match': '*' } };
}

export type HeadResult = { exists: false } | { exists: true; size: number; etag: string };

/** Estado real do objeto: tamanho e ETag vindos do R2, nunca do cliente. */
export async function headObject(key: string): Promise<HeadResult> {
  const { client, bucket } = r2();
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (typeof res.ContentLength !== 'number' || !res.ETag) {
      throw new Error('HeadObject sem ContentLength ou ETag');
    }
    return { exists: true, size: res.ContentLength, etag: res.ETag };
  } catch (err) {
    if (httpStatus(err) === 404) return { exists: false };
    throw err;
  }
}

/**
 * Le o original SOMENTE se ainda for o objeto confirmado (`If-Match` com o
 * ETag devolvido ao servidor na confirmacao). Objeto sobrescrito responde 412.
 */
export async function getObjectIfMatch(
  key: string,
  etag: string,
): Promise<{ data: Buffer; contentLength: number }> {
  const { client, bucket } = r2();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, IfMatch: etag }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error('GetObject sem corpo');
  return { data: Buffer.from(bytes), contentLength: res.ContentLength ?? bytes.length };
}

export async function putDerivative(key: string, data: Buffer): Promise<void> {
  const { client, bucket } = r2();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: 'image/webp',
      ContentLength: data.length,
    }),
  );
}

function httpStatus(err: unknown): number | undefined {
  if (err instanceof S3ServiceException) return err.$metadata?.httpStatusCode;
  if (typeof err === 'object' && err !== null && '$metadata' in err) {
    const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
    return meta?.httpStatusCode;
  }
  return undefined;
}

export type R2ReadFailure = 'source_replaced' | 'source_missing' | TransientFailureCode;

/**
 * Traduz erro do R2/SDK para o codigo do contrato (8.4). 412 e 404 do
 * original confirmado sao permanentes; o resto e transitorio.
 */
export function classifyR2Error(err: unknown): R2ReadFailure {
  const status = httpStatus(err);
  if (status === 412) return 'source_replaced';
  if (status === 404) return 'source_missing';
  if (status === 429) return 'r2_throttled';
  if (status !== undefined && status >= 500) return 'r2_unavailable';

  const name = err instanceof Error ? err.name : '';
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  if (name === 'TimeoutError' || name === 'RequestTimeout' || code === 'ETIMEDOUT') {
    return 'timeout';
  }
  if (['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE'].includes(code)) {
    return 'network';
  }
  // Configuracao, credencial recusada ou erro nao mapeado: tratado como
  // transitorio; esgota o orcamento de tentativas e termina em `failed`.
  return 'r2_unavailable';
}
