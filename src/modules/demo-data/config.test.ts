// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  databaseFingerprint,
  DemoTargetError,
  inspectDemoTarget,
  mediaFingerprint,
  requireDemoTarget,
} from './config';

const base = {
  APP_ENV: 'development',
  DATABASE_URL: 'postgresql://test:synthetic@localhost:55499/demo_test',
  R2_S3_ENDPOINT: 'http://localhost:55498',
  R2_BUCKET: 'demo-only',
  R2_REGION: 'auto',
  R2_ACCESS_KEY_ID: 'synthetic',
  R2_SECRET_ACCESS_KEY: 'synthetic',
};
const valid = () => ({
  ...base,
  DEMO_DATA_TARGET: 'development',
  DEMO_DATABASE_FINGERPRINT: databaseFingerprint(base.DATABASE_URL),
  DEMO_MEDIA_FINGERPRINT: mediaFingerprint(base.R2_S3_ENDPOINT, base.R2_BUCKET),
});

describe('destinos exclusivos de dados demonstrativos', () => {
  it('exige declaração explícita para os dois recursos', () => {
    expect(requireDemoTarget(valid()).environment).toBe('development');
    for (const key of ['DEMO_DATA_TARGET', 'DEMO_DATABASE_FINGERPRINT', 'DEMO_MEDIA_FINGERPRINT']) {
      const env: Record<string, string | undefined> = valid();
      delete env[key];
      expect(() => requireDemoTarget(env)).toThrow(DemoTargetError);
    }
  });
  it.each(['production', '', 'unknown', undefined])('recusa APP_ENV=%s', (APP_ENV) => {
    expect(() => requireDemoTarget({ ...valid(), APP_ENV })).toThrow(DemoTargetError);
  });
  it('recusa banco, endpoint e bucket divergentes do alvo declarado', () => {
    for (const patch of [
      { DATABASE_URL: 'postgresql://test:test@localhost:55499/other' },
      { R2_BUCKET: 'another-bucket' },
      { R2_S3_ENDPOINT: 'http://localhost:55497' },
      { DEMO_DATA_TARGET: 'preview' },
    ]) {
      expect(() => requireDemoTarget({ ...valid(), ...patch })).toThrow(DemoTargetError);
    }
  });
  it.each(['host=other.invalid', 'port=55497', '%68ost=%2Ftmp%2Fpg-socket'])(
    'recusa sobrescrita do destino PostgreSQL pela query: %s',
    (query) => {
      expect(() =>
        requireDemoTarget({ ...valid(), DATABASE_URL: `${base.DATABASE_URL}?${query}` }),
      ).toThrow(DemoTargetError);
    },
  );
  it('distingue nomes de banco com caracteres reservados como o driver PostgreSQL', () => {
    expect(databaseFingerprint('postgresql://test:synthetic@localhost/db%2Fname')).not.toBe(
      databaseFingerprint('postgresql://test:synthetic@localhost/db/name'),
    );
    expect(databaseFingerprint('postgresql://test:synthetic@localhost/demo%5Ftest')).toBe(
      databaseFingerprint('postgresql://test:synthetic@localhost/demo_test'),
    );
  });
  it('preserva caixa em caminhos de socket Unix aceitos pelo driver', () => {
    expect(databaseFingerprint('postgresql://test:synthetic@%2Ftmp%2FPG/demo')).not.toBe(
      databaseFingerprint('postgresql://test:synthetic@%2Ftmp%2Fpg/demo'),
    );
    expect(databaseFingerprint('postgresql://test:synthetic@%2Ftmp%2FPG/demo')).toBe(
      databaseFingerprint('postgresql://test:synthetic@%2ftmp%2fPG/demo'),
    );
  });
  it('identifica a porta efetiva de PGPORT somente quando ausente na URL', () => {
    const databaseUrl = 'postgresql://test:synthetic@localhost/demo_test';
    const env = {
      ...base,
      DATABASE_URL: databaseUrl,
      PGPORT: '6551',
      DEMO_DATA_TARGET: 'development',
      DEMO_DATABASE_FINGERPRINT: databaseFingerprint(databaseUrl, { PGPORT: '6551' }),
      DEMO_MEDIA_FINGERPRINT: mediaFingerprint(base.R2_S3_ENDPOINT, base.R2_BUCKET),
    };
    expect(requireDemoTarget(env).databaseFingerprint).toBe(
      databaseFingerprint('postgresql://test:synthetic@localhost:6551/demo_test', {}),
    );
    expect(() => requireDemoTarget({ ...env, PGPORT: '5432' })).toThrow(DemoTargetError);
    expect(
      databaseFingerprint('postgresql://test:synthetic@localhost:6551/demo_test', {
        PGPORT: '5432',
      }),
    ).toBe(env.DEMO_DATABASE_FINGERPRINT);
  });
  it.each(['0', '-1', '65536', '6551invalid', '6e3', '0x1997'])(
    'recusa PGPORT inválida sem aceitar outra porta: %s',
    (PGPORT) => {
      expect(() =>
        databaseFingerprint('postgresql://test:synthetic@localhost/demo', { PGPORT }),
      ).toThrow(DemoTargetError);
    },
  );
  it('usa o target efetivo da hospedagem, sem confundir build production com ambiente', () => {
    const preview = {
      ...valid(),
      APP_ENV: 'preview',
      DEMO_DATA_TARGET: 'preview',
      R2_S3_ENDPOINT: 'https://synthetic.r2.cloudflarestorage.com',
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      NODE_ENV: 'production',
    };
    preview.DEMO_MEDIA_FINGERPRINT = mediaFingerprint(preview.R2_S3_ENDPOINT, preview.R2_BUCKET);
    expect(requireDemoTarget(preview).environment).toBe('preview');
    expect(() => requireDemoTarget({ ...preview, VERCEL_ENV: 'production' })).toThrow(
      DemoTargetError,
    );
    expect(() => requireDemoTarget({ ...preview, VERCEL_ENV: undefined })).toThrow(DemoTargetError);
    expect(() => requireDemoTarget({ ...valid(), VERCEL_ENV: 'production' })).toThrow(
      DemoTargetError,
    );
  });
  it('não permite HTTP externo nem HTTP em Preview', () => {
    expect(() =>
      inspectDemoTarget({ ...base, R2_S3_ENDPOINT: 'http://external.invalid' }),
    ).toThrow();
    expect(() => inspectDemoTarget({ ...base, APP_ENV: 'preview' })).toThrow();
  });
  it('recusa configuração inválida sem revelar credenciais', () => {
    for (const patch of [
      { DATABASE_URL: 'https://secret:password@invalid' },
      { DATABASE_URL: 'postgresql://secret:password@localhost/' },
      { R2_ACCESS_KEY_ID: '' },
      { R2_S3_ENDPOINT: 'https://secret:password@invalid' },
      { R2_BUCKET: 'bad/bucket' },
    ]) {
      try {
        requireDemoTarget({ ...valid(), ...patch });
        throw new Error('deveria recusar');
      } catch (error) {
        expect(error).toBeInstanceOf(DemoTargetError);
        expect(String(error)).not.toMatch(/secret|password/);
      }
    }
  });
  it('credencial não participa da identidade; endpoints Neon pooled e direto são equivalentes', () => {
    expect(
      databaseFingerprint(
        'postgresql://a:a@ep-demo-pooler.us-east-2.aws.neon.tech/db?sslmode=require',
      ),
    ).toBe(databaseFingerprint('postgresql://b:b@ep-demo.us-east-2.aws.neon.tech/db'));
    expect(databaseFingerprint(base.DATABASE_URL)).not.toContain('synthetic');
  });
  it('preserva hosts distintos fora do Neon, mesmo com sufixo pooler', () => {
    for (const hostname of ['db.example', 'ep-demo.example', 'ep-demo.neon.tech.example']) {
      const pooled = hostname.replace('.', '-pooler.');
      expect(databaseFingerprint(`postgresql://test:synthetic@${pooled}/db`)).not.toBe(
        databaseFingerprint(`postgresql://test:synthetic@${hostname}/db`),
      );
    }
  });
});
