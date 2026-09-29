'use client';

import { useEffect, useRef, useState } from 'react';
import { confirmEmailToken } from '@/modules/identity/actions';
import { ResendVerificationForm } from './resend-form';

type Status = 'verifying' | 'success' | 'invalid' | 'expired' | 'error';

const FAILURE_TITLE: Record<Exclude<Status, 'verifying' | 'success'>, string> = {
  invalid: 'Link inválido ou já utilizado',
  expired: 'Este link expirou',
  error: 'Não foi possível confirmar agora',
};

/**
 * Le o token do FRAGMENTO do link (`#token=`) e o apaga da barra de endereco.
 * O fragmento nunca e enviado ao servidor nem entra no `Referer`, entao o
 * token nao chega aos logs de requisicao da plataforma (IC-9.1, IC-11.2); a
 * confirmacao leva o token no corpo da Server Action.
 */
function takeTokenFromFragment(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  return token;
}

export default function VerificarEmailPage() {
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  // O token e de uso unico: a confirmacao roda uma vez por montagem, mesmo que
  // o efeito seja reexecutado (modo estrito do React em desenvolvimento).
  const started = useRef(false);

  function confirm() {
    const current = token.current;
    if (!current) {
      setStatus('invalid');
      setMessage('Nenhum código de verificação foi informado.');
      return;
    }
    setStatus('verifying');
    confirmEmailToken(current).then((res) => {
      if (res.success) {
        setStatus('success');
        return;
      }
      setStatus(res.reason ?? 'error');
      setMessage(res.error ?? null);
    });
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    token.current = takeTokenFromFragment();
    // Fora do corpo sincrono do efeito, como as demais atualizacoes de estado.
    Promise.resolve().then(confirm);
  }, []);

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
              onClick={confirm}
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
