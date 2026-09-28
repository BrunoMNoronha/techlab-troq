'use client';

import { useEffect, useState, use } from 'react';
import { confirmEmailToken, resendVerificationToken } from '@/modules/identity/actions';

export default function VerificarEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const resolvedParams = use(searchParams);
  const token = resolvedParams.token;

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [resendEmail, setResendEmail] = useState('');
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);

  useEffect(() => {
    let active = true;

    if (!token) {
      Promise.resolve().then(() => {
        if (active) {
          setStatus('error');
          setErrorMessage('Nenhum código de verificação foi informado.');
        }
      });
      return;
    }

    confirmEmailToken(token).then((res) => {
      if (!active) return;
      if (res.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMessage(res.error || 'Falha ao verificar e-mail.');
      }
    });

    return () => {
      active = false;
    };
  }, [token]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResendStatus(null);
    setResendLoading(true);

    const res = await resendVerificationToken(resendEmail);
    setResendLoading(false);

    if (res.success) {
      setResendStatus('Novo link de verificação enviado! Confira seu e-mail.');
    } else {
      setResendStatus(res.error || 'Erro ao reenviar e-mail.');
    }
  }

  return (
    <main
      style={{ maxWidth: '480px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif' }}
    >
      {status === 'verifying' && (
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
            Verificando e-mail...
          </h1>
          <p style={{ color: '#6b7280' }}>Aguarde enquanto confirmamos seu link de verificação.</p>
        </div>
      )}

      {status === 'success' && (
        <div>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px' }}>
            E-mail verificado com sucesso!
          </h1>
          <p style={{ color: '#4b5563', marginBottom: '24px' }}>
            Sua conta está ativa. Agora você pode entrar e publicar ou consultar anúncios no TROQ.
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

      {status === 'error' && (
        <div>
          <h1
            style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px', color: '#dc2626' }}
          >
            Não foi possível verificar seu e-mail
          </h1>
          <p style={{ color: '#4b5563', marginBottom: '24px' }}>{errorMessage}</p>

          <div
            style={{
              padding: '20px',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
          >
            <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
              Solicitar novo link de verificação
            </h2>
            <form
              onSubmit={handleResend}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <input
                type="email"
                required
                placeholder="seu@email.com"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '16px',
                }}
              />
              <button
                type="submit"
                disabled={resendLoading}
                style={{
                  padding: '10px',
                  backgroundColor: resendLoading ? '#9ca3af' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: resendLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {resendLoading ? 'Enviando...' : 'Reenviar e-mail'}
              </button>
            </form>
            {resendStatus && (
              <p
                style={{
                  marginTop: '12px',
                  fontSize: '14px',
                  color: resendStatus.includes('enviado') ? '#16a34a' : '#dc2626',
                }}
              >
                {resendStatus}
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
