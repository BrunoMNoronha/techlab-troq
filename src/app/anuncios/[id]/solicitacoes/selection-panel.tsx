'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { chooseRequester } from '@/modules/negotiation/actions';
import { CardList } from '@/components/data-display';
import { Alert, EmptyState } from '@/components/feedback';
import { Cluster, Grow, Stack } from '@/components/layout';
import { Button, Card, Prose, Text } from '@/components/ui';

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
    <Stack gap={4}>
      {(error || done) && (
        <Alert
          ref={feedbackRef}
          tabIndex={-1}
          role={error ? 'alert' : 'status'}
          tone={error ? 'error' : 'success'}
        >
          {error ?? done}
        </Alert>
      )}

      {candidates.length === 0 ? (
        <EmptyState
          titleAs="p"
          title="Nenhuma solicitação paga disponível para escolha no momento."
        />
      ) : (
        <CardList>
          {candidates.map((candidate) => (
            <Card as="li" key={candidate.contactRequestId}>
              <Stack gap={3}>
                <Cluster justify="between">
                  <Grow>
                    <Text weight="semibold" wrapAnywhere>
                      {candidate.requesterDisplayName}
                    </Text>
                    <Text size="small" tone="muted">
                      Pagamento confirmado em {candidate.paidAtLabel}
                    </Text>
                  </Grow>
                  {!blocked && confirming?.contactRequestId !== candidate.contactRequestId && (
                    <Button
                      onClick={() => {
                        setError(null);
                        setDone(null);
                        setConfirming(candidate);
                      }}
                      disabled={submitting}
                      aria-label={`Escolher ${candidate.requesterDisplayName}`}
                    >
                      Escolher
                    </Button>
                  )}
                </Cluster>

                {confirming?.contactRequestId === candidate.contactRequestId && (
                  <Alert
                    tone="info"
                    role="group"
                    aria-labelledby={`confirmar-${candidate.contactRequestId}`}
                  >
                    <h3
                      id={`confirmar-${candidate.contactRequestId}`}
                      ref={headingRef}
                      tabIndex={-1}
                    >
                      Confirmar a escolha de {candidate.requesterDisplayName}?
                    </h3>
                    <Prose>
                      <ul>
                        <li>
                          O seu WhatsApp/telefone será liberado somente para esta pessoa. As outras
                          solicitações pagas não recebem o seu contato.
                        </li>
                        <li>A escolha fica registrada e não pode ser desfeita.</li>
                        {reselection && (
                          <li>
                            Esta é uma nova escolha (reseleção) depois de uma escolha anterior.
                          </li>
                        )}
                      </ul>
                    </Prose>
                    <Cluster gap={3}>
                      <Button loading={submitting} onClick={() => void confirm(candidate)}>
                        {submitting ? 'Registrando…' : 'Confirmar escolha'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setConfirming(null)}
                        disabled={submitting}
                      >
                        Cancelar
                      </Button>
                    </Cluster>
                  </Alert>
                )}
              </Stack>
            </Card>
          ))}
        </CardList>
      )}
    </Stack>
  );
}
