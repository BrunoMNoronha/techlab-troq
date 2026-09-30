'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  closeListing,
  discardDraft,
  pauseListing,
  publishListing,
  reactivateListing,
} from '@/modules/listing/actions';
import {
  LISTING_COMPLIANCE_DECLARATION,
  PROHIBITED_ITEMS_POLICY_PATH,
} from '@/modules/listing/compliance';
import type { LifecycleResult } from '@/modules/listing/lifecycle';

// Situacao do anuncio na edicao privada (F2-010, #48): publicar, pausar,
// reativar, encerrar e descartar. Toda regra e decidida no servidor
// (lifecycle.ts); aqui so ha a confirmacao explicita das transicoes
// irreversiveis (T2, T5, T6; listing-lifecycle.md, secao 4) e o aceite da
// declaracao de conformidade (prohibited-items.md, secao 5).

type OwnerActionable = 'draft' | 'published' | 'paused';
type Action = 'publish' | 'discard' | 'pause' | 'reactivate' | 'close';
type Confirmable = 'discard' | 'close';

const FIELD_LABELS: Record<string, string> = {
  title: 'título',
  description: 'descrição',
  city: 'cidade',
  state: 'UF',
};

const DONE: Record<Action, string> = {
  publish: 'Anúncio publicado. Ele já aparece na oferta pública.',
  discard: 'Rascunho descartado.',
  pause: 'Anúncio pausado. Ele saiu da oferta pública.',
  reactivate: 'Anúncio reativado. Ele voltou à oferta pública.',
  close: 'Anúncio encerrado.',
};

const CONFIRM_TEXT: Record<Confirmable, { title: string; body: string; button: string }> = {
  discard: {
    title: 'Descartar este rascunho?',
    body: 'O rascunho vai para o histórico como encerrado e não poderá ser publicado nem editado. Esta ação não pode ser desfeita.',
    button: 'Sim, descartar rascunho',
  },
  close: {
    title: 'Encerrar este anúncio?',
    body: 'O anúncio sai da oferta pública e vai para o histórico como encerrado. Não será possível reativá-lo nem editá-lo. Esta ação não pode ser desfeita.',
    button: 'Sim, encerrar anúncio',
  },
};

const buttonBase: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: '6px',
  fontSize: '15px',
  fontWeight: '600',
  cursor: 'pointer',
  border: '1px solid transparent',
  minHeight: '44px',
};
const primaryButton: React.CSSProperties = {
  ...buttonBase,
  backgroundColor: '#1d4ed8',
  color: 'white',
};
const secondaryButton: React.CSSProperties = {
  ...buttonBase,
  backgroundColor: 'white',
  color: '#1f2937',
  borderColor: '#9ca3af',
};
const dangerButton: React.CSSProperties = {
  ...buttonBase,
  backgroundColor: 'white',
  color: '#991b1b',
  borderColor: '#991b1b',
};
const dangerSolidButton: React.CSSProperties = {
  ...buttonBase,
  backgroundColor: '#991b1b',
  color: 'white',
};

function errorMessage(res: Extract<LifecycleResult, { success: false }>): string {
  if (res.reason === 'validation' && res.fieldErrors) {
    const fields = Object.keys(res.fieldErrors)
      .map((f) => FIELD_LABELS[f] ?? f)
      .join(', ');
    return `${res.error} Campos a corrigir: ${fields}.`;
  }
  return res.error;
}

export function LifecyclePanel({
  listingId,
  status,
  readyImageCount,
}: {
  listingId: string;
  status: OwnerActionable;
  readyImageCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirmable | null>(null);
  const [complianceAccepted, setComplianceAccepted] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  // Os botoes que abrem a confirmacao sao desmontados enquanto ela esta aberta;
  // ao cancelar, o foco volta ao botao novo pelo ref estavel.
  const discardRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<Confirmable | null>(null);
  const ids = useId();
  const complianceId = `${ids}-compliance`;
  const confirmTitleId = `${ids}-confirm-title`;
  const confirmBodyId = `${ids}-confirm-body`;

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    const target = returnFocusRef.current;
    if (confirming || !target) return;
    returnFocusRef.current = null;
    (target === 'discard' ? discardRef : closeRef).current?.focus();
  }, [confirming]);

  async function run(action: Action) {
    if (pending) return;
    setPending(action);
    setError(null);
    setDone(null);
    try {
      const res =
        action === 'publish'
          ? await publishListing(listingId, complianceAccepted)
          : action === 'discard'
            ? await discardDraft(listingId)
            : action === 'pause'
              ? await pauseListing(listingId)
              : action === 'reactivate'
                ? await reactivateListing(listingId)
                : await closeListing(listingId);
      if (res.success) {
        setConfirming(null);
        setDone(DONE[action]);
        router.refresh();
      } else {
        setError(errorMessage(res));
        if (res.reason === 'invalid_transition') router.refresh();
      }
    } catch {
      setError('Não foi possível concluir a operação. Verifique a conexão e tente novamente.');
    } finally {
      setPending(null);
    }
  }

  function openConfirm(which: Confirmable) {
    setError(null);
    setConfirming(which);
  }

  function cancelConfirm() {
    returnFocusRef.current = confirming;
    setConfirming(null);
  }

  const busy = pending !== null;

  return (
    <section
      aria-labelledby={`${ids}-title`}
      style={{
        marginTop: '32px',
        padding: '16px',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        backgroundColor: '#f9fafb',
      }}
    >
      <h2 id={`${ids}-title`} style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 8px' }}>
        Situação do anúncio
      </h2>

      <div role="status" aria-live="polite">
        {done ? (
          <p style={{ color: '#166534', fontSize: '14px', margin: '0 0 12px' }}>{done}</p>
        ) : null}
      </div>

      {error ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          style={{
            padding: '12px',
            margin: '0 0 12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#991b1b',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      ) : null}

      {confirming ? (
        <div
          role="group"
          aria-labelledby={confirmTitleId}
          aria-describedby={confirmBodyId}
          style={{
            padding: '16px',
            backgroundColor: 'white',
            border: '2px solid #991b1b',
            borderRadius: '8px',
          }}
        >
          <h3
            id={confirmTitleId}
            ref={confirmRef}
            tabIndex={-1}
            style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 8px', color: '#991b1b' }}
          >
            {CONFIRM_TEXT[confirming].title}
          </h3>
          <p id={confirmBodyId} style={{ fontSize: '14px', color: '#374151', margin: '0 0 16px' }}>
            {CONFIRM_TEXT[confirming].body}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              style={dangerSolidButton}
              disabled={busy}
              aria-busy={busy}
              onClick={() => run(confirming)}
            >
              {busy ? 'Aguarde…' : CONFIRM_TEXT[confirming].button}
            </button>
            <button type="button" style={secondaryButton} disabled={busy} onClick={cancelConfirm}>
              Cancelar
            </button>
          </div>
        </div>
      ) : status === 'draft' ? (
        <div>
          <p style={{ fontSize: '14px', color: '#374151', margin: '0 0 12px' }}>
            Rascunho: só você vê este anúncio. Para publicar, ele precisa de pelo menos uma imagem
            pronta.
            {readyImageCount === 0 ? ' Nenhuma imagem está pronta ainda.' : null}
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', margin: '0 0 8px' }}>
            <input
              id={complianceId}
              type="checkbox"
              checked={complianceAccepted}
              onChange={(e) => setComplianceAccepted(e.target.checked)}
              style={{ width: '20px', height: '20px', marginTop: '2px', flexShrink: 0 }}
            />
            <label htmlFor={complianceId} style={{ fontSize: '14px', color: '#111827' }}>
              {LISTING_COMPLIANCE_DECLARATION}
            </label>
          </div>
          <p style={{ fontSize: '14px', margin: '0 0 16px 28px' }}>
            <a
              href={PROHIBITED_ITEMS_POLICY_PATH}
              target="_blank"
              rel="noopener"
              style={{ color: '#1d4ed8', fontWeight: '600' }}
            >
              Ler a Política de itens proibidos (abre em nova aba)
            </a>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              style={primaryButton}
              disabled={busy}
              aria-busy={pending === 'publish'}
              onClick={() => run('publish')}
            >
              {pending === 'publish' ? 'Publicando…' : 'Publicar anúncio'}
            </button>
            <button
              ref={discardRef}
              type="button"
              style={dangerButton}
              disabled={busy}
              onClick={() => openConfirm('discard')}
            >
              Descartar rascunho
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: '14px', color: '#374151', margin: '0 0 16px' }}>
            {status === 'published'
              ? 'Publicado: o anúncio aparece na oferta pública. Pausar retira da oferta até você reativar.'
              : 'Pausado: o anúncio não aparece na oferta pública. Reativar exige pelo menos uma imagem pronta.'}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {status === 'published' ? (
              <button
                type="button"
                style={secondaryButton}
                disabled={busy}
                aria-busy={pending === 'pause'}
                onClick={() => run('pause')}
              >
                {pending === 'pause' ? 'Pausando…' : 'Pausar anúncio'}
              </button>
            ) : (
              <button
                type="button"
                style={primaryButton}
                disabled={busy}
                aria-busy={pending === 'reactivate'}
                onClick={() => run('reactivate')}
              >
                {pending === 'reactivate' ? 'Reativando…' : 'Reativar anúncio'}
              </button>
            )}
            <button
              ref={closeRef}
              type="button"
              style={dangerButton}
              disabled={busy}
              onClick={() => openConfirm('close')}
            >
              Encerrar anúncio
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
