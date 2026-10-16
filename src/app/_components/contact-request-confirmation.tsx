'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/feedback';
import { FormActions } from '@/components/forms';
import { Stack } from '@/components/layout';
import { Button, Prose, TextLink } from '@/components/ui';
import { requestContactUnlock } from '@/modules/request/actions';
import type { PixChargeFailureReason } from '@/modules/request';

// Confirmacao da solicitacao paga de R$ 0,99 (F3-012, #102), compartilhada pelo
// detalhe (`InterestFlow`) e pelo dialogo do card da vitrine (DEC-056).
//
// So o botao de confirmacao chama `requestContactUnlock`, que revalida sessao,
// anuncio, vaga e reserva no servidor, sob a trava (reservation.ts,
// charge-flow.ts). Desistir nao deixa rastro (interest-flow.md, secao 5). O
// titulo ("Confirmar a solicitacao paga de R$ 0,99") e de quem envolve este
// bloco: o painel do detalhe ou o dialogo do card.

export const CONFIRMATION_TITLE = 'Confirmar a solicitação paga de R$ 0,99';

const FINAL_REASONS: ReadonlySet<PixChargeFailureReason> = new Set([
  'unavailable',
  'own_listing',
  'not_accepting',
  'no_slots',
  'account_restricted',
  'email_unverified',
  'active_reservation',
  'already_paid',
]);

export function ContactRequestConfirmation({
  listingId,
  onCancel,
}: {
  listingId: string;
  /** "Agora não" ou "Fechar": quem envolve decide como recolher o bloco. */
  onCancel: () => void;
}) {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; reason: string } | null>(null);

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

  const blocked = error !== null && FINAL_REASONS.has(error.reason as PixChargeFailureReason);

  return (
    <Stack gap={4}>
      <Prose>
        <ul>
          <li>
            Ao confirmar, uma das três vagas deste anúncio fica reservada para você por 30 minutos.
          </li>
          <li>Você paga R$ 0,99 via Pix dentro desse prazo. Sem pagamento, a vaga é liberada.</li>
          <li>
            O anunciante escolhe uma das solicitações pagas. Só a pessoa escolhida recebe o
            WhatsApp/telefone; pagar não garante ser escolhido.
          </li>
          <li>
            A cobrança é definitiva: não há reembolso por não ser escolhido. Só há reembolso técnico
            nas exceções previstas, como um pagamento feito depois do prazo.
          </li>
        </ul>
      </Prose>

      {error && (
        <Alert ref={errorRef} tabIndex={-1} role="alert" tone="error">
          <p>{error.message}</p>
          {(error.reason === 'active_reservation' || error.reason === 'already_paid') && (
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
            setError(null);
            onCancel();
          }}
          disabled={submitting}
        >
          {blocked ? 'Fechar' : 'Agora não'}
        </Button>
      </FormActions>
    </Stack>
  );
}
