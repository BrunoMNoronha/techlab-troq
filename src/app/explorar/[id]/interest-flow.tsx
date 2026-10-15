'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Cluster, Stack } from '@/components/layout';
import { Button, Card, Text } from '@/components/ui';
import {
  CONFIRMATION_TITLE,
  ContactRequestConfirmation,
} from '../../_components/contact-request-confirmation';

// "Tenho interesse" e a confirmacao da solicitacao paga (F3-012, #102).
//
// "Tenho interesse" e uma acao GRATUITA DE INTERFACE (RF-008; interest-flow.md,
// DEC-035): abre a explicacao e a confirmacao neste navegador e nao chama o
// servidor, nao grava nada e nao e visivel ao anunciante (IF-6 a IF-8). A
// confirmacao, compartilhada com o card da vitrine (DEC-056), e que chama
// `requestContactUnlock`.

export function InterestFlow({ listingId }: { listingId: string }) {
  const panelId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

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
          {CONFIRMATION_TITLE}
        </h3>
        <ContactRequestConfirmation listingId={listingId} onCancel={() => setOpen(false)} />
      </Stack>
    </Card>
  );
}
