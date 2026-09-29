'use client';

import { useEffect, useRef, useState, use } from 'react';
import { confirmEmailToken } from '@/modules/identity/actions';
import { ResendVerificationForm } from './resend-form';

type Status = 'verifying' | 'success' | 'invalid' | 'expired' | 'error';

const FAILURE_TITLE: Record<Exclude<Status, 'verifying' | 'success'>, string> = {
  invalid: 'Link inválido ou já utilizado',
  expired: 'Este link expirou',
  error: 'Não foi possível confirmar agora',
};

export default function VerificarEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = use(searchParams);

  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'invalid');
  const [message, setMessage] = useState<string | null>(
    token ? null : 'Nenhum código de verificação foi informado.',
  );
  // O token e de uso unico: a confirmacao roda uma vez por montagem, mesmo que
  // o efeito seja reexecutado (modo estrito do React em desenvolvimento).
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    confirmEmailToken(token).then((res) => {
      if (res.success) {
        setStatus('success');
        return;
      }
      setStatus(res.reason ?? 'error');
      setMessage(res.error ?? null);
    });
  }, [token]);

  return (
    <main
      style={{ maxWidth: '480px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif' }}
    >
      {status === 'verifying' && (
        <div role="status">
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
            Verificando e-mail...
          </h1>
          <p style={{ color: '#6b7280' }}>Aguarde enquanto confirmamos seu link de verificação.</p>
        </div>
      )}

      {status === 'success' && (
        <div role="status">
          <div style={{ fontSize: '48px', marginBottom: '16px' }} aria-hidden="true">
            ✅
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px' }}>
            E-mail verificado com sucesso!
          </h1>
          <p style={{ color: '#4b5563', marginBottom: '24px' }}>
            Sua conta está confirmada. Entre com seu e-mail e senha para continuar.
          </p>
          <a
            href="/login"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              backgroundColor: '#2563eb',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: '600',
            }}
          >
            Ir para o Login
          </a>
        </div>
      )}

      {status !== 'verifying' && status !== 'success' && (
        <div>
          <h1
            role="alert"
            style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px', color: '#dc2626' }}
          >
            {FAILURE_TITLE[status]}
          </h1>
          <p style={{ color: '#4b5563', marginBottom: '24px' }}>{message}</p>
          {status === 'error' ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginBottom: '24px',
                padding: '10px 16px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Tentar novamente
            </button>
          ) : null}
          <ResendVerificationForm />
        </div>
      )}
    </main>
  );
}
