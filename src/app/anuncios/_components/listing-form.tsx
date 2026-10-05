'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createDraftListing, updateListing } from '@/modules/listing/actions';
import {
  DESCRIPTION_MAX_LENGTH,
  EMPTY_TRADE_OPTIONS,
  TITLE_MAX_LENGTH,
  TRADE_OPTION_FIELDS,
  TRADE_OPTION_MAX_LENGTH,
  contactFieldErrors,
  validateListingContent,
  validateTradeOptions,
  type ListingField,
  type ListingFieldErrors,
  type TradeOptionField,
  type TradeOptionSlots,
} from '@/modules/listing/validation';
import { PRODUCT_CATEGORIES } from '@/modules/listing/categories';
import { BRAZILIAN_UFS, isBrazilianUf, ufOptionLabel } from '@/modules/listing/uf';

export interface ListingFormValues {
  category?: string | null;
  title: string;
  description: string;
  city: string;
  state: string;
  tradeOptions: TradeOptionSlots;
}

const EMPTY_VALUES: ListingFormValues = {
  category: '',
  title: '',
  description: '',
  city: '',
  state: '',
  tradeOptions: EMPTY_TRADE_OPTIONS,
};

type FocusableField = ListingField | TradeOptionField | 'category';

/** Ordem visual do formulario, usada para focar o primeiro campo invalido. */
const FIELD_ORDER: readonly FocusableField[] = [
  'title',
  'description',
  'category',
  ...TRADE_OPTION_FIELDS,
  'city',
  'state',
];

const TRADE_OPTION_EXAMPLES: TradeOptionSlots = [
  'Ex.: um notebook',
  'Ex.: um videogame',
  'Ex.: uma câmera',
];

const LABELS: Record<ListingField, string> = {
  title: 'Título do anúncio',
  description: 'Descrição do item',
  city: 'Cidade',
  state: 'UF',
};

// A mesma orientacao que o servidor aplica (listing-contract.md, secao 10.1).
const HINTS: Partial<Record<ListingField, string>> = {
  title: 'Diga o que é o item. Não inclua telefone, WhatsApp, e-mail ou endereço.',
  description:
    'Descreva o item. Não inclua telefone, WhatsApp, e-mail ou endereço: o contato só é liberado pelo TROQ.',
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
  | {
      mode: 'create';
      initialValues?: undefined;
      listingId?: undefined;
      requireTradeOptions?: undefined;
    }
  | {
      mode: 'edit';
      initialValues: ListingFormValues;
      listingId: string;
      /** Anuncio `published`/`paused`: as tres alternativas sao obrigatorias. */
      requireTradeOptions: boolean;
    };

/**
 * Formulario de criacao e edicao (listing-contract.md, secoes 3, 3.1 e 11).
 * A validacao local so antecipa a mensagem; o servidor e a autoridade e suas
 * mensagens por campo sao exibidas da mesma forma. Os valores digitados nunca
 * sao descartados em erro.
 */
export function ListingForm({
  mode,
  initialValues,
  listingId,
  requireTradeOptions = false,
}: ListingFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<ListingFormValues>(initialValues ?? EMPTY_VALUES);
  // Conteudo gravado antes da regra de contato ja abre com o campo marcado,
  // para o dono corrigir antes de salvar; o texto fica no campo, intacto.
  const [fieldErrors, setFieldErrors] = useState<ListingFieldErrors>(() =>
    initialValues ? contactFieldErrors(initialValues) : {},
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Contador de tentativas: cada submissao com erro dispara o foco de novo.
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<
    Partial<Record<FocusableField, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>>
  >({});
  // UF gravada fora da lista (registro anterior a #90): nao e corrigida nem
  // trocada por outra; o seletor fica sem escolha e o dono precisa escolher.
  const [legacyState] = useState(() => {
    const stored = initialValues?.state.trim() ?? '';
    return stored !== '' && !isBrazilianUf(stored.toUpperCase()) ? stored : null;
  });

  // Foco previsivel: primeiro campo invalido, na ordem do formulario; sem erro
  // de campo, a mensagem geral. Erro da lista inteira de alternativas leva a
  // primeira delas.
  useEffect(() => {
    if (attempt === 0) return;
    const firstInvalid = fieldErrors.tradeOptions
      ? FIELD_ORDER.find((field) => field === 'tradeOption1' || fieldErrors[field])
      : FIELD_ORDER.find((field) => fieldErrors[field]);
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus();
    } else if (formError) {
      formErrorRef.current?.focus();
    }
  }, [attempt, fieldErrors, formError]);

  function update(field: ListingField | 'category', value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function updateTradeOption(index: number, value: string) {
    setValues((current) => {
      const tradeOptions: TradeOptionSlots = [...current.tradeOptions];
      tradeOptions[index] = value;
      return { ...current, tradeOptions };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;

    const local = validateListingContent(values, requireTradeOptions);
    const localOptions = validateTradeOptions(values.tradeOptions, requireTradeOptions);
    if (!local.ok || !localOptions.ok) {
      setFieldErrors({
        ...(local.ok ? {} : local.fieldErrors),
        ...(localOptions.ok ? {} : localOptions.fieldErrors),
      });
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
        {field === 'state' ? (
          renderStateSelect(common, error)
        ) : field === 'description' ? (
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
            autoComplete={field === 'city' ? 'address-level2' : 'off'}
            maxLength={field === 'title' ? TITLE_MAX_LENGTH : undefined}
            onChange={(e) => update(field, e.target.value)}
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

  // UF por lista (#90; listing-contract.md, secao 3): as 27 UFs por nome, sem
  // escolha inicial. Valor fora da lista nunca aparece como outra UF selecionada.
  function renderStateSelect(
    common: { 'aria-describedby'?: string; style: React.CSSProperties },
    error: string | undefined,
  ) {
    const normalized = values.state.trim().toUpperCase();
    const selected = isBrazilianUf(normalized) ? normalized : '';
    const legacyId = 'state-legacy';
    const showLegacy = legacyState !== null && selected === '';
    const describedBy = [showLegacy ? legacyId : null, common['aria-describedby']]
      .filter(Boolean)
      .join(' ');

    return (
      <>
        <select
          id="state"
          name="state"
          ref={(el) => {
            fieldRefs.current.state = el ?? undefined;
          }}
          value={selected}
          autoComplete="address-level1"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(e) => update('state', e.target.value)}
          style={{ ...common.style, backgroundColor: 'white', minHeight: '44px' }}
        >
          <option value="">Selecione o estado</option>
          {BRAZILIAN_UFS.map((uf) => (
            <option key={uf.code} value={uf.code}>
              {ufOptionLabel(uf)}
            </option>
          ))}
        </select>
        {showLegacy && (
          <p id={legacyId} style={{ color: '#92400e', fontSize: '13px', margin: '4px 0 0' }}>
            A UF gravada (“{legacyState}”) não é uma UF válida. Selecione o estado para salvar.
          </p>
        )}
      </>
    );
  }

  // Alternativas de troca (listing-contract.md, secao 3.1): grupo com legenda,
  // uma instrucao comum a todos os campos e erro por campo.
  function renderTradeOptions() {
    const listError = fieldErrors.tradeOptions;
    const hintId = 'tradeOptions-hint';
    const listErrorId = 'tradeOptions-error';

    return (
      <fieldset
        aria-describedby={listError ? `${hintId} ${listErrorId}` : hintId}
        style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}
      >
        <legend style={{ ...labelStyle, padding: 0 }}>O que você aceita em troca</legend>
        <p id={hintId} style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 8px' }}>
          Informe três alternativas que você aceita receber por este item. Quem se interessar não
          precisa oferecer as três juntas. Não inclua telefone, WhatsApp, e-mail ou endereço.{' '}
          {requireTradeOptions
            ? 'As três são obrigatórias enquanto o anúncio estiver publicado ou pausado.'
            : 'As três são obrigatórias para publicar; no rascunho, você pode completar depois.'}
        </p>
        {listError && (
          <p id={listErrorId} style={{ ...fieldErrorStyle, margin: '0 0 8px' }}>
            {listError}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {TRADE_OPTION_FIELDS.map((field, index) => {
            const error = fieldErrors[field];
            const errorId = `${field}-error`;
            return (
              <div key={field} style={{ minWidth: 0 }}>
                <label htmlFor={field} style={labelStyle}>
                  Alternativa {index + 1}
                </label>
                <input
                  ref={(el) => {
                    fieldRefs.current[field] = el ?? undefined;
                  }}
                  id={field}
                  name={field}
                  type="text"
                  autoComplete="off"
                  value={values.tradeOptions[index]}
                  placeholder={TRADE_OPTION_EXAMPLES[index]}
                  maxLength={TRADE_OPTION_MAX_LENGTH}
                  required={requireTradeOptions}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(e) => updateTradeOption(index, e.target.value)}
                  style={inputStyle(Boolean(error))}
                />
                {error && (
                  <p id={errorId} style={fieldErrorStyle}>
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
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
      <div style={{ minWidth: 0 }}>
        <label htmlFor="category" style={labelStyle}>
          Categoria do produto
        </label>
        <select
          id="category"
          name="category"
          ref={(el) => {
            fieldRefs.current.category = el ?? undefined;
          }}
          value={values.category ?? ''}
          onChange={(e) => update('category', e.target.value)}
          aria-invalid={fieldErrors.category ? true : undefined}
          aria-describedby={fieldErrors.category ? 'category-hint category-error' : 'category-hint'}
          style={{
            ...inputStyle(Boolean(fieldErrors.category)),
            backgroundColor: 'white',
            minHeight: '44px',
          }}
        >
          <option value="">Selecione a categoria</option>
          {PRODUCT_CATEGORIES.map((category) => (
            <option key={category.code} value={category.code}>
              {category.label}
            </option>
          ))}
        </select>
        <p id="category-hint" style={{ color: '#4b5563', fontSize: '13px', margin: '4px 0 0' }}>
          {requireTradeOptions
            ? 'Selecione uma categoria para salvar este anúncio.'
            : 'Você pode escolher depois; a categoria é obrigatória para publicar.'}
        </p>
        {fieldErrors.category && (
          <p id="category-error" style={fieldErrorStyle}>
            {fieldErrors.category}
          </p>
        )}
      </div>
      {renderTradeOptions()}

      {/* Cidade e UF lado a lado quando cabem; empilhadas no celular. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          gap: '12px',
        }}
      >
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
