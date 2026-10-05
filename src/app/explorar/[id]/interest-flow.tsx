'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/feedback';
import { FormActions } from '@/components/forms';
import { Cluster, Stack } from '@/components/layout';
import { Button, Card, Prose, Text, TextLink } from '@/components/ui';
import { requestContactUnlock } from '@/modules/request/actions';
import type { PixChargeFailureReason } from '@/modules/request';

// "Tenho interesse" e a confirmacao da solicitacao paga (F3-012, #102).
//
// "Tenho interesse" e uma acao GRATUITA DE INTERFACE (RF-008; interest-flow.md,
// DEC-035): abre a explicacao e a confirmacao neste navegador e nao chama o
// servidor, nao grava nada e nao e visivel ao anunciante (IF-6 a IF-8). So o
// botao de confirmacao chama `requestContactUnlock`, que revalida sessao,
// anuncio, vaga e reserva no servidor, sob a trava (reservation.ts,
// charge-flow.ts). Abandonar a confirmacao nao deixa rastro (secao 5).

const FINAL_REASONS: ReadonlySet<PixChargeFailureReason> = new Set([
  'unavailable',
  'own_listing',
  'not_accepting',
  'no_slots',
  'account_restricted',
  'email_unverified',
  'active_reservation',
]);

export function InterestFlow({ listingId }: { listingId: string }) {
  const router = useRouter();
  const panelId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; reason: string } | null>(null);

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await requestContactUnlock(listingId);
      if (res.success) {
        // A tela do Pix busca as instrucoes de novo, do provedor, sob a trava:
        // nada de pagamento trafega pela URL.
        router.push(`/solicitacoes/${res.contactRequestId}`);
        return;
      }
      if (res.reason === 'login_required') {
        router.push(`/login?motivo=solicitar&next=${encodeURIComponent(`/explorar/${listingId}`)}`);
        return;
      }
      setError({ message: res.error, reason: res.reason });
    } catch {
      setError({
        message:
          'Não foi possível enviar a solicitação. Verifique sua conexão e tente novamente. Nada foi cobrado.',
        reason: 'network',
      });
    }
    inFlight.current = false;
    setSubmitting(false);
  }

  if (!open) {
    return (
      <Stack gap={3}>
        <Text>
          Demonstrar interesse é gratuito e não gera cobrança. Na etapa seguinte você confirma, ou
          não, a solicitação paga.
        </Text>
        <Cluster>
          <Button onClick={() => setOpen(true)} aria-expanded={false} aria-controls={panelId}>
            Tenho interesse
          </Button>
        </Cluster>
      </Stack>
    );
  }

  const blocked = error !== null && FINAL_REASONS.has(error.reason as PixChargeFailureReason);

  return (
    <Card
      variant="muted"
      id={panelId}
      role="group"
      aria-labelledby={`${panelId}-titulo`}
      padding="md"
    >
      <Stack gap={4}>
        <h3 id={`${panelId}-titulo`} ref={headingRef} tabIndex={-1}>
          Confirmar a solicitação paga de R$ 0,99
        </h3>
        <Prose>
          <ul>
            <li>
              Ao confirmar, uma das três vagas deste anúncio fica reservada para você por 30
              minutos.
            </li>
            <li>Você paga R$ 0,99 via Pix dentro desse prazo. Sem pagamento, a vaga é liberada.</li>
            <li>
              O anunciante escolhe uma das solicitações pagas. Só a pessoa escolhida recebe o
              WhatsApp/telefone; pagar não garante ser escolhido.
            </li>
            <li>
              A cobrança é definitiva: não há reembolso por não ser escolhido. Só há reembolso
              técnico nas exceções previstas, como um pagamento feito depois do prazo.
            </li>
          </ul>
        </Prose>

        {error && (
          <Alert ref={errorRef} tabIndex={-1} role="alert" tone="error">
            <p>{error.message}</p>
            {error.reason === 'active_reservation' && (
              <p>
                <TextLink href="/solicitacoes">Ver minhas solicitações</TextLink>
              </p>
            )}
          </Alert>
        )}

        <FormActions>
          {!blocked && (
            <Button onClick={confirm} loading={submitting} aria-busy={submitting}>
              {submitting ? 'Reservando vaga…' : 'Confirmar e gerar Pix'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            disabled={submitting}
          >
            {blocked ? 'Fechar' : 'Agora não'}
          </Button>
        </FormActions>
      </Stack>
    </Card>
  );
}
