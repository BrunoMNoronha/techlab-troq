'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createDraftListing, updateListing } from '@/modules/listing/actions';
import {
  DESCRIPTION_MAX_LENGTH,
  LISTING_FIELDS,
  TITLE_MAX_LENGTH,
  validateListingContent,
  type ListingField,
  type ListingFieldErrors,
} from '@/modules/listing/validation';

export interface ListingFormValues {
  title: string;
  description: string;
  city: string;
  state: string;
}

const EMPTY_VALUES: ListingFormValues = { title: '', description: '', city: '', state: '' };

const LABELS: Record<ListingField, string> = {
  title: 'Título do anúncio',
  description: 'Descrição do item',
  city: 'Cidade',
  state: 'UF',
};

const HINTS: Partial<Record<ListingField, string>> = {
  description: 'Descreva o item. Não inclua telefone, WhatsApp, e-mail ou endereço.',
};

const inputStyle = (invalid: boolean): React.CSSProperties => ({
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  border: `1px solid ${invalid ? '#dc2626' : '#d1d5db'}`,
  borderRadius: '6px',
  fontSize: '16px',
  fontFamily: 'inherit',
});

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: '600',
  marginBottom: '4px',
};

const fieldErrorStyle: React.CSSProperties = {
  color: '#b91c1c',
  fontSize: '13px',
  margin: '4px 0 0',
};

type ListingFormProps =
  | { mode: 'create'; initialValues?: undefined; listingId?: undefined }
  | { mode: 'edit'; initialValues: ListingFormValues; listingId: string };

/**
 * Formulario de criacao e edicao (listing-contract.md, secoes 3 e 11).
 * A validacao local so antecipa a mensagem; o servidor e a autoridade e suas
 * mensagens por campo sao exibidas da mesma forma. Os valores digitados nunca
 * sao descartados em erro.
 */
export function ListingForm({ mode, initialValues, listingId }: ListingFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<ListingFormValues>(initialValues ?? EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = useState<ListingFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Contador de tentativas: cada submissao com erro dispara o foco de novo.
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Partial<Record<ListingField, HTMLInputElement | HTMLTextAreaElement>>>(
    {},
  );

  // Foco previsivel: primeiro campo invalido, na ordem do formulario; sem erro
  // de campo, a mensagem geral.
  useEffect(() => {
    if (attempt === 0) return;
    const firstInvalid = LISTING_FIELDS.find((field) => fieldErrors[field]);
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus();
    } else if (formError) {
      formErrorRef.current?.focus();
    }
  }, [attempt, fieldErrors, formError]);

  function update(field: ListingField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;

    const local = validateListingContent(values);
    if (!local.ok) {
      setFieldErrors(local.fieldErrors);
      setFormError(null);
      setAttempt((n) => n + 1);
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const res =
        mode === 'create'
          ? await createDraftListing(values)
          : await updateListing(listingId, values);

      if (res.success) {
        router.push('/anuncios');
        router.refresh();
        return;
      }

      if (res.reason === 'unauthenticated') {
        router.push('/login?motivo=sessao');
        return;
      }

      setFieldErrors(res.fieldErrors ?? {});
      setFormError(res.fieldErrors ? null : (res.error ?? 'Não foi possível salvar.'));
    } catch {
      setFormError('Não foi possível salvar. Verifique sua conexão e tente novamente.');
    }

    inFlight.current = false;
    setSubmitting(false);
    setAttempt((n) => n + 1);
  }

  function renderField(field: ListingField) {
    const error = fieldErrors[field];
    const hint = HINTS[field];
    const errorId = `${field}-error`;
    const hintId = `${field}-hint`;
    const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
    const common = {
      id: field,
      name: field,
      value: values[field],
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy || undefined,
      style: inputStyle(Boolean(error)),
    };

    return (
      <div key={field} style={{ minWidth: 0 }}>
        <label htmlFor={field} style={labelStyle}>
          {LABELS[field]}
        </label>
        {field === 'description' ? (
          <textarea
            {...common}
            ref={(el) => {
              fieldRefs.current.description = el ?? undefined;
            }}
            rows={5}
            maxLength={DESCRIPTION_MAX_LENGTH}
            onChange={(e) => update('description', e.target.value)}
            style={{ ...common.style, resize: 'vertical' }}
          />
        ) : (
          <input
            {...common}
            ref={(el) => {
              fieldRefs.current[field] = el ?? undefined;
            }}
            type="text"
            autoComplete={
              field === 'city' ? 'address-level2' : field === 'state' ? 'address-level1' : 'off'
            }
            maxLength={field === 'title' ? TITLE_MAX_LENGTH : field === 'state' ? 2 : undefined}
            onChange={(e) =>
              update(field, field === 'state' ? e.target.value.toUpperCase() : e.target.value)
            }
          />
        )}
        {hint && (
          <p id={hintId} style={{ color: '#6b7280', fontSize: '13px', margin: '4px 0 0' }}>
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} style={fieldErrorStyle}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
    >
      {(formError || hasFieldErrors) && (
        <div
          ref={formErrorRef}
          tabIndex={-1}
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#991b1b',
            fontSize: '14px',
          }}
        >
          {formError ?? 'Revise os campos destacados.'}
        </div>
      )}

      {renderField('title')}
      {renderField('description')}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 88px', gap: '12px' }}>
        {renderField('city')}
        {renderField('state')}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px' }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            flex: '1 1 180px',
            padding: '12px',
            backgroundColor: submitting ? '#9ca3af' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Salvando...' : mode === 'create' ? 'Salvar rascunho' : 'Salvar alterações'}
        </button>
        <a
          href="/anuncios"
          style={{
            flex: '0 1 auto',
            padding: '12px 20px',
            backgroundColor: '#f3f4f6',
            color: '#374151',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '600',
            textAlign: 'center',
          }}
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
