'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, ErrorState } from '@/components/feedback';
import { Field, Form, FormActions, Select } from '@/components/forms';
import { Cluster, Section, Stack } from '@/components/layout';
import { Button, ButtonLink, Card, Text } from '@/components/ui';
import type { OwnNegotiationView } from '@/modules/negotiation';
import { closeNegotiation } from '@/modules/negotiation/actions';
import type { OwnRatingView } from '@/modules/reputation';
import { submitRating } from '@/modules/reputation/actions';

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export interface NegotiationPanelProps {
  negotiation: OwnNegotiationView;
  rating: OwnRatingView | null;
}

export function NegotiationPanel({ negotiation, rating }: NegotiationPanelProps) {
  const router = useRouter();
  const here = `/negociacoes/${negotiation.negotiationId}`;
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [score, setScore] = useState(rating?.ownRating ? String(rating.ownRating.score) : '');
  const [isPending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const feedbackRef = useRef<HTMLElement>(null);
  const closed = negotiation.status === 'closed' || closedAt !== null;
  const closingDate = negotiation.closedAt ?? closedAt;
  const busy = submitting || isPending;

  useEffect(() => {
    if (confirming) headingRef.current?.focus();
  }, [confirming]);
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  function expiredSession() {
    router.push(`/login?motivo=sessao&next=${encodeURIComponent(here)}`);
  }

  function beginOperation(operation: 'close' | 'rate') {
    if (inFlight.current || uncertain) return;
    inFlight.current = true;
    setSubmitting(true);
    setFeedback(null);
    startTransition(async () => {
      try {
        if (operation === 'close') {
          const result = await closeNegotiation({
            negotiationId: negotiation.negotiationId,
            confirmed: true,
          });
          if (!result.success && result.reason === 'login_required') {
            expiredSession();
            return;
          }
          startTransition(() => {
            setConfirming(false);
            if (result.success) {
              setClosedAt(result.closedAt);
              setFeedback({
                error: false,
                message: result.changed
                  ? 'Negociação encerrada. O contato já liberado continua disponível.'
                  : 'Esta negociação já está encerrada.',
              });
            } else setFeedback({ error: true, message: result.error });
            router.refresh();
          });
        } else {
          const result = await submitRating({
            negotiationId: negotiation.negotiationId,
            score: Number(score),
          });
          if (!result.success && result.reason === 'login_required') {
            expiredSession();
            return;
          }
          startTransition(() => {
            setFeedback(
              result.success
                ? {
                    error: false,
                    message: result.published
                      ? 'Avaliação registrada e publicada. A nota não pode mais ser alterada.'
                      : 'Avaliação registrada. A nota permanece protegida até a publicação.',
                  }
                : { error: true, message: result.error },
            );
            router.refresh();
          });
        }
      } catch {
        // Sem resposta, o commit pode ter ocorrido: primeiro reconciliar pela
        // leitura do servidor, sem prometer que nada foi alterado nem repetir.
        setUncertain(true);
        setFeedback({
          error: true,
          message:
            'Não foi possível confirmar o resultado. Verifique sua conexão e atualize esta página antes de tentar novamente.',
        });
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    });
  }

  function sendRating(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!score || !(rating?.canSubmit || rating?.canEdit)) return;
    beginOperation('rate');
  }

  return (
    <Stack gap={6}>
      {feedback ? (
        <Alert
          ref={feedbackRef}
          tabIndex={-1}
          role={feedback.error ? 'alert' : 'status'}
          tone={feedback.error ? 'error' : 'success'}
        >
          {feedback.message}
          {uncertain ? (
            <p>
              <ButtonLink href={here} reload variant="outline">
                Atualizar negociação
              </ButtonLink>
            </p>
          ) : null}
        </Alert>
      ) : null}

      <Card>
        <Stack gap={4}>
          <Text weight="semibold" wrapAnywhere>
            Negociação com {negotiation.counterpartDisplayName}
          </Text>
          {closed ? (
            <Text>
              Negociação encerrada
              {closingDate ? ` em ${DATE_TIME.format(new Date(closingDate))}` : ''}. O encerramento
              é definitivo.
            </Text>
          ) : (
            <>
              <Text>
                Qualquer uma das duas partes pode encerrar esta negociação. A outra pessoa não
                precisa confirmar.
              </Text>
              {!confirming ? (
                <Button
                  ref={closeButtonRef}
                  variant="dangerOutline"
                  disabled={busy || uncertain}
                  onClick={() => {
                    setFeedback(null);
                    setConfirming(true);
                  }}
                >
                  Encerrar negociação
                </Button>
              ) : (
                <Alert tone="warning" role="group" aria-labelledby="confirmar-encerramento">
                  <h2 id="confirmar-encerramento" ref={headingRef} tabIndex={-1}>
                    Confirmar o encerramento?
                  </h2>
                  <Stack gap={3}>
                    <Text>
                      A negociação será encerrada e não poderá ser reaberta. Depois do encerramento,
                      as partes poderão avaliar dentro do prazo de 14 dias.
                    </Text>
                    <Text>
                      O anúncio, o pagamento, as vagas e o contato já liberado continuam como estão.
                      Encerrar não registra se a troca aconteceu.
                    </Text>
                    <Cluster gap={3}>
                      <Button
                        variant="danger"
                        loading={busy}
                        disabled={uncertain}
                        onClick={() => beginOperation('close')}
                      >
                        Confirmar encerramento
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setConfirming(false);
                          requestAnimationFrame(() => closeButtonRef.current?.focus());
                        }}
                      >
                        Cancelar
                      </Button>
                    </Cluster>
                  </Stack>
                </Alert>
              )}
            </>
          )}
        </Stack>
      </Card>

      <Section title="Sua avaliação">
        {!closed ? (
          <Text tone="muted">
            Você poderá avaliar a outra pessoa depois que esta negociação for encerrada.
          </Text>
        ) : !rating ? (
          <ErrorState
            title="Atualize a negociação para consultar sua avaliação."
            action={
              <ButtonLink href={here} reload variant="outline">
                Atualizar negociação
              </ButtonLink>
            }
          />
        ) : (
          <Stack gap={4}>
            <Text size="small" tone="muted">
              As notas são publicadas quando as duas partes avaliam ou quando terminam os 14 dias.
              Antes disso, uma pessoa não vê a nota da outra.
            </Text>
            {rating.deadline ? (
              <Text size="small">
                Prazo para avaliar: {DATE_TIME.format(new Date(rating.deadline))}.
              </Text>
            ) : null}
            {rating.ownRating ? (
              <Alert tone={rating.ownRating.validity === 'invalidated' ? 'warning' : 'info'}>
                <Text>Sua nota: {rating.ownRating.score} de 5 estrelas.</Text>
                <Text>
                  {rating.ownRating.validity === 'invalidated'
                    ? 'Esta avaliação foi invalidada e não pode ser substituída.'
                    : rating.ownRating.published
                      ? 'Sua avaliação está publicada e não pode mais ser alterada.'
                      : 'Sua avaliação ainda não foi publicada.'}
                </Text>
              </Alert>
            ) : null}
            {rating.canSubmit || rating.canEdit ? (
              <Form onSubmit={sendRating} aria-label="Avaliar a negociação">
                <Field
                  label={`Sua nota sobre ${negotiation.counterpartDisplayName}`}
                  htmlFor="nota-negociacao"
                  hint="Escolha uma nota inteira de 1 a 5 estrelas."
                  required
                >
                  <Select
                    id="nota-negociacao"
                    value={score}
                    onChange={(event) => setScore(event.target.value)}
                    required
                    disabled={busy || uncertain}
                    aria-describedby="nota-negociacao-hint"
                  >
                    <option value="">Selecione uma nota</option>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value} {value === 1 ? 'estrela' : 'estrelas'}
                      </option>
                    ))}
                  </Select>
                </Field>
                {rating.canEdit ? (
                  <Text size="small" tone="muted">
                    Você pode substituir sua nota enquanto ela não for publicada e o prazo estiver
                    aberto.
                  </Text>
                ) : null}
                <FormActions>
                  <Button type="submit" loading={busy} disabled={!score || uncertain}>
                    {rating.canEdit ? 'Salvar nova nota' : 'Enviar avaliação'}
                  </Button>
                </FormActions>
              </Form>
            ) : !rating.ownRating ? (
              <Text>O prazo de avaliação terminou. Nenhuma nota foi registrada por você.</Text>
            ) : null}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}
