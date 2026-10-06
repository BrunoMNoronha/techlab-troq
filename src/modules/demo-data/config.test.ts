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
  it('credencial não participa da identidade; endpoint pooled e direto são equivalentes', () => {
    expect(databaseFingerprint('postgresql://a:a@ep-demo-pooler.test/db?sslmode=require')).toBe(
      databaseFingerprint('postgresql://b:b@ep-demo.test/db'),
    );
    expect(databaseFingerprint(base.DATABASE_URL)).not.toContain('synthetic');
  });
});
