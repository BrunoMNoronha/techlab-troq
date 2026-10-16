// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { diagnoseFailure } from './diagnostic';

const withStack = (error: Error, frame: string) => {
  error.stack = `${error.name}: ${error.message}\n    at reserve (${frame})\n    at node:internal`;
  return error;
};

describe('diagnóstico de falha do provisionador', () => {
  it('aponta o local do throw sem repetir a mensagem', () => {
    const error = withStack(
      new Error('O lote foi alterado'),
      'file:///w/src/modules/demo-data/service.ts:394:15',
    );
    expect(diagnoseFailure(error)).toBe('Error service.ts:394');
  });

  it('inclui códigos estruturados do Prisma e do driver adapter', () => {
    const error = Object.assign(new Error('Foreign key constraint violated'), {
      name: 'PrismaClientKnownRequestError',
      stack: 'PrismaClientKnownRequestError',
      code: 'P2003',
      meta: {
        modelName: 'Listing',
        driverAdapterError: {
          cause: { kind: 'ForeignKeyConstraintViolation', constraint: { index: 'x_fkey' } },
        },
      },
    });
    expect(diagnoseFailure(error)).toBe(
      'PrismaClientKnownRequestError P2003 modelName=Listing kind=ForeignKeyConstraintViolation index=x_fkey',
    );
  });

  it('mantém códigos internos e status HTTP, nunca mensagens de provedor', () => {
    expect(diagnoseFailure(new Error('demo_seed_deadline'))).toContain('demo_seed_deadline');
    const provider = Object.assign(
      new Error('Access denied for key AKIASECRET at https://bucket.example.invalid'),
      { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } },
    );
    const label = diagnoseFailure(provider);
    expect(label).toContain('AccessDenied');
    expect(label).toContain('http=403');
    expect(label).not.toMatch(/AKIA|example|denied for/);
  });

  it('descarta valores fora do formato esperado', () => {
    const error = Object.assign(new Error('x'), {
      stack: 'Error: x',
      code: 'postgres://user:pw@host/db',
      meta: { field_name: 'senha=segredo; DROP' },
    });
    expect(diagnoseFailure(error)).toBe('Error');
    expect(diagnoseFailure('texto')).toBe('unknown');
  });
});
