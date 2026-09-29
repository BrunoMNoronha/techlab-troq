'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { resendVerificationToken } from '@/modules/identity/actions';

// Reenvio do e-mail de verificacao (identity-contract.md, IC-9.3). A mensagem
// de sucesso e generica e nao revela se o e-mail tem cadastro.
export function ResendVerificationForm({ initialEmail = '' }: { initialEmail?: string }) {
  const inputId = useId();
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Leva o foco a mensagem de resultado, para leitores de tela e teclado.
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setLoading(true);

    const res = await resendVerificationToken(email);
    setLoading(false);
    setFeedback(
      res.success
        ? { ok: true, text: res.message ?? '' }
        : { ok: false, text: res.error ?? 'Nao foi possivel enviar o e-mail agora.' },
    );
  }

  return (
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
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        aria-busy={loading}
      >
        <label htmlFor={inputId} style={{ fontSize: '14px', fontWeight: '600' }}>
          E-mail cadastrado
        </label>
        <input
          id={inputId}
          type="email"
          required
          autoComplete="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '16px',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px',
            backgroundColor: loading ? '#9ca3af' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Enviando...' : 'Reenviar e-mail'}
        </button>
      </form>
      {feedback && (
        <p
          ref={feedbackRef}
          tabIndex={-1}
          role={feedback.ok ? 'status' : 'alert'}
          style={{
            marginTop: '12px',
            fontSize: '14px',
            color: feedback.ok ? '#166534' : '#b91c1c',
          }}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}
