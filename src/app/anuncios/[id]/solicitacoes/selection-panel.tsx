'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { chooseRequester } from '@/modules/negotiation/actions';

// Escolha do solicitante pelo anunciante, com confirmacao explicita (F3-012,
// #102; DEC-032, secao 2; RF-013). A lista veio do servidor so com o nome de
// exibicao e a data do pagamento (PD-11.3). A escolha e decidida no servidor,
// sob as travas (selection.ts): este componente so envia `confirmed: true`
// depois do segundo gesto.

export interface CandidateView {
  contactRequestId: string;
  requesterDisplayName: string;
  /** Data do pagamento ja formatada no servidor. */
  paidAtLabel: string;
}

export function SelectionPanel({
  listingId,
  candidates,
  blocked,
  reselection,
}: {
  listingId: string;
  candidates: CandidateView[];
  blocked: boolean;
  reselection: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<CandidateView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (confirming) headingRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (error || done) feedbackRef.current?.focus();
  }, [error, done]);

  async function confirm(candidate: CandidateView) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await chooseRequester({
        listingId,
        contactRequestId: candidate.contactRequestId,
        confirmed: true,
      });
      if (res.success) {
        // Mensagem, fim da confirmacao e releitura na MESMA transicao (V7, PR #88).
        startTransition(() => {
          setConfirming(null);
          setDone(
            `Escolha registrada. ${candidate.requesterDisplayName} já pode ver o seu contato.`,
          );
          router.refresh();
        });
      } else if (res.reason === 'login_required') {
        router.push(
          `/login?motivo=sessao&next=${encodeURIComponent(`/anuncios/${listingId}/solicitacoes`)}`,
        );
        return;
      } else {
        startTransition(() => {
          setConfirming(null);
          setError(res.error);
          router.refresh();
        });
      }
    } catch {
      setError('Não foi possível registrar a escolha. Verifique sua conexão e tente novamente.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div>
      {(error || done) && (
        <div
          ref={feedbackRef}
          tabIndex={-1}
          role={error ? 'alert' : 'status'}
          style={{
            padding: '12px',
            marginBottom: '16px',
            borderRadius: '6px',
            fontSize: '14px',
            backgroundColor: error ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${error ? '#fecaca' : '#bbf7d0'}`,
            color: error ? '#991b1b' : '#14532d',
          }}
        >
          {error ?? done}
        </div>
      )}

      {candidates.length === 0 ? (
        <p style={{ margin: 0, color: '#374151' }}>
          Nenhuma solicitação paga disponível para escolha no momento.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {candidates.map((candidate) => (
            <li
              key={candidate.contactRequestId}
              style={{
                padding: '16px',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {candidate.requesterDisplayName}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#4b5563' }}>
                    Pagamento confirmado em {candidate.paidAtLabel}
                  </p>
                </div>
                {!blocked && confirming?.contactRequestId !== candidate.contactRequestId && (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setDone(null);
                      setConfirming(candidate);
                    }}
                    disabled={submitting}
                    aria-label={`Escolher ${candidate.requesterDisplayName}`}
                    style={primaryButton(submitting)}
                  >
                    Escolher
                  </button>
                )}
              </div>

              {confirming?.contactRequestId === candidate.contactRequestId && (
                <div
                  role="group"
                  aria-labelledby={`confirmar-${candidate.contactRequestId}`}
                  style={{
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '6px',
                    color: '#1e3a8a',
                  }}
                >
                  <h3
                    id={`confirmar-${candidate.contactRequestId}`}
                    ref={headingRef}
                    tabIndex={-1}
                    style={{ fontSize: '16px', margin: '0 0 8px', overflowWrap: 'anywhere' }}
                  >
                    Confirmar a escolha de {candidate.requesterDisplayName}?
                  </h3>
                  <ul style={{ margin: '0 0 12px', paddingLeft: '20px', lineHeight: 1.5 }}>
                    <li>
                      O seu WhatsApp/telefone será liberado somente para esta pessoa. As outras
                      solicitações pagas não recebem o seu contato.
                    </li>
                    <li>A escolha fica registrada e não pode ser desfeita.</li>
                    {reselection && (
                      <li>Esta é uma nova escolha (reseleção) depois de uma escolha anterior.</li>
                    )}
                  </ul>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={() => void confirm(candidate)}
                      disabled={submitting}
                      aria-busy={submitting}
                      style={primaryButton(submitting)}
                    >
                      {submitting ? 'Registrando…' : 'Confirmar escolha'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      disabled={submitting}
                      style={secondaryButton}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function primaryButton(busy: boolean) {
  return {
    padding: '10px 16px',
    backgroundColor: busy ? '#93c5fd' : '#1d4ed8',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 600,
    fontSize: '14px',
    cursor: busy ? 'not-allowed' : 'pointer',
  } as const;
}

const secondaryButton = {
  padding: '10px 16px',
  backgroundColor: 'white',
  color: '#1d4ed8',
  border: '1px solid #bfdbfe',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
} as const;
