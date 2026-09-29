// @vitest-environment node
import { S3ServiceException } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fronteira de entrega de midia (F2-009, #47), com banco e R2 simulados. A
// matriz de autorizacao com PostgreSQL e R2 reais esta em
// media-delivery-r2.integration.test.ts; aqui ficam as recusas que nem chegam
// ao banco, a falha fechada e o endereco publico.
const queryRaw = vi.fn();
vi.mock('@/persistence/prisma', () => ({
  getPrismaClient: () => ({ $queryRaw: (...args: unknown[]) => queryRaw(...args) }),
}));
const validateSession = vi.fn();
vi.mock('@/modules/identity', () => ({
  validateSession: () => validateSession(),
}));
const getDerivativeStream = vi.fn();
vi.mock('./s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./s3')>()),
  getDerivativeStream: (key: string) => getDerivativeStream(key),
}));

import { mediaNotFound, serveMedia } from './delivery';
import { isMediaKind, mediaPath, MEDIA_KINDS } from './media-path';
import { classifyR2DeleteError } from './s3';

const ID = '3f2a9c1e-5b7d-4e8f-9a01-23456789abcd';
const OWNER = '11111111-2222-4333-8444-555555555555';

function target(listing: string, owner = 'active') {
  return [
    {
      object_key: `derivatives/${ID}/1/v1/thumb.webp`,
      listing_status: listing,
      owner_id: OWNER,
      owner_status: owner,
    },
  ];
}

async function snapshot(res: Response) {
  return {
    status: res.status,
    body: await res.text(),
    headers: [...res.headers.entries()].sort(),
  };
}

describe('serveMedia', () => {
  let reference: Awaited<ReturnType<typeof snapshot>>;

  beforeEach(async () => {
    queryRaw.mockReset();
    validateSession.mockReset();
    getDerivativeStream.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reference = await snapshot(mediaNotFound());
  });

  it('404 nao cacheavel e sem conteudo revelador', () => {
    expect(reference.status).toBe(404);
    expect(reference.body).toBe('Not Found');
    expect(Object.fromEntries(reference.headers)).toMatchObject({
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
  });

  it.each([
    ['nao-uuid', 'thumb'],
    [`${ID}'; DROP TABLE users;--`, 'thumb'],
    [ID, 'original'],
    [ID, 'Thumb'],
    [ID, ''],
  ])('entrada invalida (%s, %s) recusa sem consultar banco nem R2', async (id, kind) => {
    expect(await snapshot(await serveMedia(id, kind))).toEqual(reference);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(getDerivativeStream).not.toHaveBeenCalled();
  });

  it('anuncio nao publico sem sessao do dono: 404, sem ler o R2', async () => {
    queryRaw.mockResolvedValue(target('paused'));
    validateSession.mockResolvedValue({ isValid: true, user: { id: 'outro-usuario' } });
    expect(await snapshot(await serveMedia(ID, 'thumb'))).toEqual(reference);
    expect(getDerivativeStream).not.toHaveBeenCalled();
  });

  it('publico nao consulta a sessao', async () => {
    queryRaw.mockResolvedValue(target('published'));
    getDerivativeStream.mockResolvedValue({
      body: new Blob([new Uint8Array([1, 2, 3])]).stream(),
      contentLength: 3,
    });
    const res = await serveMedia(ID, 'thumb');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-length')).toBe('3');
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('falha do banco ou do R2 fecha em 404, sem mensagem crua', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connection refused 10.0.0.1'));
    expect(await snapshot(await serveMedia(ID, 'thumb'))).toEqual(reference);

    queryRaw.mockResolvedValue(target('published'));
    getDerivativeStream.mockRejectedValueOnce(
      new S3ServiceException({
        name: 'InternalError',
        $fault: 'server',
        $metadata: { httpStatusCode: 500 },
      }),
    );
    expect(await snapshot(await serveMedia(ID, 'thumb'))).toEqual(reference);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toMatch(/10\.0\.0\.1|derivatives\/|InternalError.*message/);
  });
});

describe('endereco publico de midia', () => {
  it('e relativo, pela rota autorizada, sem chave de objeto', () => {
    for (const kind of MEDIA_KINDS) {
      expect(mediaPath(ID, kind)).toBe(`/media/${ID}/${kind}`);
    }
    expect(isMediaKind('large')).toBe(true);
    expect(isMediaKind('original')).toBe(false);
    expect(isMediaKind(undefined)).toBe(false);
  });
});

describe('classifyR2DeleteError', () => {
  const err = (status: number) =>
    new S3ServiceException({ name: 'E', $fault: 'client', $metadata: { httpStatusCode: status } });

  it.each([
    [429, 'r2_throttled'],
    [500, 'r2_unavailable'],
    [503, 'r2_unavailable'],
    [401, 'r2_denied'],
    [403, 'r2_denied'],
    [400, 'r2_rejected'],
  ])('%i -> %s', (status, code) => {
    expect(classifyR2DeleteError(err(status))).toBe(code);
  });

  it('timeout e rede sao transitorios', () => {
    const timeout = Object.assign(new Error('x'), { name: 'TimeoutError' });
    const reset = Object.assign(new Error('x'), { code: 'ECONNRESET' });
    expect(classifyR2DeleteError(timeout)).toBe('timeout');
    expect(classifyR2DeleteError(reset)).toBe('network');
  });
});
