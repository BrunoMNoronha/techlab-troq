'use client';

import { useEffect, useRef } from 'react';
import { useGoogleRedirect } from '@/app/_components/google-sign-in';
import { linkGoogleAccount } from '@/modules/identity/google-actions';

// Vinculacao explicita da Conta Google (IC-15.4): so a partir desta area
// privada, com sessao valida, e so se o Google confirmar o mesmo e-mail.

export function GoogleLinkButton() {
  const { pending, error, run } = useGoogleRedirect(() => linkGoogleAccount());
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={pending}
        aria-busy={pending}
        aria-describedby={error ? 'google-link-error' : undefined}
        style={{
          padding: '10px 20px',
          backgroundColor: pending ? '#f3f4f6' : 'white',
          color: '#111827',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          fontWeight: '600',
          cursor: pending ? 'not-allowed' : 'pointer',
        }}
      >
        {pending ? 'Abrindo o Google...' : 'Vincular Conta Google'}
      </button>
      {error && (
        <p
          id="google-link-error"
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          style={{ margin: 0, color: '#991b1b', fontSize: '14px' }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
