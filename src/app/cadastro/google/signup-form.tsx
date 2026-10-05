'use client';

import { useEffect, useRef, useState } from 'react';
import { useGoogleRedirect } from '@/app/_components/google-sign-in';
import { TermsConsentText } from '@/app/_components/terms-consent';
import { cancelGoogleSignup, completeGoogleSignup } from '@/modules/identity/google-actions';

// Formulario da conclusao do cadastro com Google (IC-15.3). As caixas de 18+ e
// de aceite dos termos comecam desmarcadas: o ato afirmativo e da pessoa, e o
// servidor valida os dois de novo. A idade nunca e inferida pelo perfil Google.

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '10px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '16px',
};

const checkboxLabelStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  fontSize: '14px',
  cursor: 'pointer',
};

export function GoogleSignupForm({ email, returnTo }: { email: string; returnTo?: string }) {
  const [displayName, setDisplayName] = useState('');
  const [over18, setOver18] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const complete = useGoogleRedirect(() =>
    completeGoogleSignup({ displayName, over18, termsAccepted, returnTo }),
  );
  const cancel = useGoogleRedirect(() => cancelGoogleSignup());
  const busy = complete.pending || cancel.pending;
  const error = complete.error ?? cancel.error;

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void complete.run();
  }

  return (
    <>
      <p style={{ color: '#4b5563', fontSize: '14px', marginBottom: '16px' }}>
        O Google confirmou o e-mail <strong>{email}</strong>. Para criar sua conta no TROQ, escolha
        como quer ser chamado(a) e confirme as declarações abaixo. Nenhuma conta é criada antes
        disso. Ao concluir, você passa pelo Google mais uma vez para entrar.
      </p>

      {error && (
        <div
          id="google-signup-error"
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#991b1b',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        aria-describedby={error ? 'google-signup-error' : undefined}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <div>
          <label
            htmlFor="displayName"
            style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}
          >
            Nome de exibição
          </label>
          <input
            id="displayName"
            type="text"
            autoComplete="nickname"
            required
            minLength={2}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={inputStyle}
            placeholder="Como quer ser chamado(a)"
          />
        </div>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            required
            checked={over18}
            onChange={(e) => setOver18(e.target.checked)}
            style={{ marginTop: '2px' }}
          />
          <span>
            Declaro ter <strong>18 anos de idade ou mais</strong>.
          </span>
        </label>

        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            required
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            style={{ marginTop: '2px' }}
          />
          <span>
            <TermsConsentText />
          </span>
        </label>

        <button
          type="submit"
          disabled={busy}
          aria-busy={complete.pending}
          style={{
            marginTop: '8px',
            width: '100%',
            padding: '12px',
            backgroundColor: busy ? '#9ca3af' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {complete.pending ? 'Concluindo...' : 'Concluir cadastro'}
        </button>

        <button
          type="button"
          onClick={() => void cancel.run()}
          disabled={busy}
          aria-busy={cancel.pending}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: 'white',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {cancel.pending ? 'Cancelando...' : 'Cancelar e não criar conta'}
        </button>
      </form>
    </>
  );
}
