'use client';

import { useRef, useState } from 'react';
import { Alert, Skeleton } from '@/components/feedback';
import { Modal } from '@/components/overlay';
import { Button } from '@/components/ui';
import type { ContactRequestEntryView } from '@/modules/request';
import { getContactRequestCardState } from '@/modules/request/actions';
import { CONFIRMATION_TITLE, ContactRequestConfirmation } from './contact-request-confirmation';
import { ContactRequestEntryMessage } from './contact-request-entry-message';

// Solicitacao de contato direto do card da vitrine (DEC-056). Abrir o dialogo e
// a mesma acao gratuita de "Tenho interesse" (interest-flow.md, IF-5 a IF-8):
// so le o estado da pessoa no servidor, sem reservar, cobrar ou gravar nada. A
// cobranca so comeca em "Confirmar e gerar Pix", que revalida tudo sob a trava.
//
// O estado e lido ao abrir, e nao ao montar o card: a vitrine nao faz uma
// consulta por anuncio para cada visitante.

type Phase =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'ready'; view: ContactRequestEntryView }
  | { kind: 'error' };

export function ContactRequestCardAction({
  listingId,
  listingTitle,
  freeSlots,
}: {
  listingId: string;
  listingTitle: string;
  /** Vagas livres agora; `undefined` quando a contagem nao veio. */
  freeSlots?: number;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' });
  // Descarta resposta de uma abertura anterior (fechar e abrir de novo rapido).
  const attempt = useRef(0);

  const full = freeSlots === 0;

  async function open() {
    const current = ++attempt.current;
    setPhase({ kind: 'loading' });
    try {
      const view = await getContactRequestCardState(listingId);
      if (attempt.current === current) setPhase({ kind: 'ready', view });
    } catch {
      if (attempt.current === current) setPhase({ kind: 'error' });
    }
  }

  function close() {
    attempt.current++;
    setPhase({ kind: 'closed' });
  }

  const available = phase.kind === 'ready' && phase.view.state === 'request_available';

  return (
    <>
      <Button fullWidth disabled={full} onClick={open} aria-haspopup="dialog">
        {full ? 'Sem vagas no momento' : 'Solicitar contato · R$ 0,99'}{' '}
        {/* Varios cards na mesma tela: o nome acessivel diz de qual anuncio. */}
        <span className="sr-only">— {listingTitle}</span>
      </Button>

      <Modal
        open={phase.kind !== 'closed'}
        onClose={close}
        title={available ? CONFIRMATION_TITLE : 'Contato do anunciante'}
        description="O WhatsApp/telefone do anunciante é protegido pela plataforma e não aparece no anúncio."
      >
        {phase.kind === 'loading' && (
          <div role="status" aria-live="polite">
            <span className="sr-only">Carregando…</span>
            <Skeleton lines={3} />
          </div>
        )}
        {phase.kind === 'error' && (
          <Alert tone="error" role="alert">
            <p>
              Não foi possível carregar agora. Verifique sua conexão e tente novamente. Nada foi
              cobrado.
            </p>
          </Alert>
        )}
        {phase.kind === 'ready' &&
          (phase.view.state === 'listing_unavailable' ? (
            <Alert role="status">
              <p>Este anúncio não está mais disponível. Nada foi cobrado.</p>
            </Alert>
          ) : (
            <ContactRequestEntryMessage
              state={phase.view.state}
              listingId={listingId}
              ownRequestId={phase.view.ownRequestId}
              available={<ContactRequestConfirmation listingId={listingId} onCancel={close} />}
            />
          ))}
      </Modal>
    </>
  );
}
