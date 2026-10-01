'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerOwnContact } from '@/modules/contact/actions';

// Cadastro e substituicao do proprio contato (contact-release.md, CR-2.5;
// F3-002, #92). A tela so sabe SE ha contato (`hasContact`), nunca o numero:
// nao ha valor inicial no campo e nenhum digito e exibido. O servidor normaliza
// e valida; a resposta e confirmacao ou erro de campo sem eco da entrada. O
// texto digitado so existe no estado deste navegador e e limpo ao salvar.

const FIELD_ID = 'contato-telefone';
const HINT_ID = 'contato-telefone-dica';
const ERROR_ID = 'contato-telefone-erro';

export function ContactForm({ hasContact }: { hasContact: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (attempt === 0) return;
    if (fieldError) inputRef.current?.focus();
    else if (formError) formErrorRef.current?.focus();
  }, [attempt, fieldError, formError]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;

    inFlight.current = true;
    setSubmitting(true);
    setFieldError(null);
    setFormError(null);
    setSaved(false);

    try {
      const res = await registerOwnContact({ phone });
      if (res.success) {
        setPhone('');
        setSaved(true);
        router.refresh();
      } else if (res.reason === 'login_required') {
        router.push('/login?motivo=sessao');
        return;
      } else if (res.fieldErrors) {
        setFieldError(res.fieldErrors.phone);
      } else {
        setFormError(res.error);
      }
    } catch {
      setFormError('Não foi possível salvar. Verifique sua conexão e tente novamente.');
    }

    inFlight.current = false;
    setSubmitting(false);
    setAttempt((n) => n + 1);
  }

  const registered = hasContact || saved;

  return (
    <section
      aria-labelledby="contato-titulo"
      style={{
        padding: '24px',
        backgroundColor: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        marginBottom: '24px',
      }}
    >
      <h2 id="contato-titulo" style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 8px' }}>
        Telefone ou WhatsApp
      </h2>
      <p style={{ color: '#4b5563', fontSize: '14px', margin: '0 0 16px' }}>
        Seu contato é protegido: ele não aparece nos seus anúncios e só é entregue a quem você
        escolher depois do pagamento aprovado. Sem contato cadastrado, seus anúncios não aceitam
        solicitações.
      </p>

      <p
        role="status"
        style={{
          margin: '0 0 16px',
          fontSize: '14px',
          fontWeight: '600',
          color: registered ? '#166534' : '#92400e',
        }}
      >
        {saved
          ? 'Contato salvo. Por segurança, o número não é exibido.'
          : registered
            ? 'Você tem um contato cadastrado. Por segurança, o número não é exibido.'
            : 'Você ainda não cadastrou um contato.'}
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <label
          htmlFor={FIELD_ID}
          style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}
        >
          {registered ? 'Novo telefone ou WhatsApp' : 'Telefone ou WhatsApp'}
        </label>
        <p id={HINT_ID} style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 6px' }}>
          Número brasileiro com DDD. Celular ou fixo.
        </p>
        <input
          ref={inputRef}
          id={FIELD_ID}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? `${HINT_ID} ${ERROR_ID}` : HINT_ID}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            border: `1px solid ${fieldError ? '#dc2626' : '#d1d5db'}`,
            borderRadius: '6px',
            fontSize: '16px',
            fontFamily: 'inherit',
          }}
        />
        {fieldError && (
          <p id={ERROR_ID} style={{ color: '#b91c1c', fontSize: '13px', margin: '4px 0 0' }}>
            {fieldError}
          </p>
        )}
        {formError && (
          <p
            ref={formErrorRef}
            role="alert"
            tabIndex={-1}
            style={{ color: '#b91c1c', fontSize: '14px', margin: '12px 0 0' }}
          >
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          style={{
            marginTop: '16px',
            padding: '10px 16px',
            backgroundColor: submitting ? '#93c5fd' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            fontSize: '14px',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Salvando...' : registered ? 'Substituir contato' : 'Cadastrar contato'}
        </button>
      </form>
    </section>
  );
}
