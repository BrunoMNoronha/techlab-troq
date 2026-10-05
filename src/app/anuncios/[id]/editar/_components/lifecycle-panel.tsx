'use client';

import { startTransition, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { closeListing } from '@/app/anuncios/actions';
import {
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
import { Alert } from '@/components/feedback';
import { Checkbox } from '@/components/forms';
import { Cluster, Section, Stack } from '@/components/layout';
import { Button, Card, Text, TextLink } from '@/components/ui';

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
  category: 'categoria do produto',
  city: 'cidade',
  state: 'UF',
  tradeOption1: 'alternativa de troca 1',
  tradeOption2: 'alternativa de troca 2',
  tradeOption3: 'alternativa de troca 3',
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
    let res: LifecycleResult;
    try {
      res =
        action === 'publish'
          ? await publishListing(listingId, complianceAccepted)
          : action === 'discard'
            ? await discardDraft(listingId)
            : action === 'pause'
              ? await pauseListing(listingId)
              : action === 'reactivate'
                ? await reactivateListing(listingId)
                : await closeListing(listingId);
    } catch {
      setError('Não foi possível concluir a operação. Verifique a conexão e tente novamente.');
      setPending(null);
      return;
    }
    if (res.success) {
      // O novo estado (cabecalho, `status` e botoes) so chega com o
      // `router.refresh()`, uma segunda ida ao servidor. A mensagem e o fim do
      // "em andamento" entram na MESMA transicao do refresh: o React so os
      // mostra junto com a pagina nova, e o botao do estado anterior nao volta
      // a ficar clicavel no meio (V7 de phase-3-transition.md).
      startTransition(() => {
        setPending(null);
        setConfirming(null);
        setDone(DONE[action]);
        router.refresh();
      });
    } else {
      setPending(null);
      setError(errorMessage(res));
      if (res.reason === 'invalid_transition') router.refresh();
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
    <Card variant="muted">
      <Section titleId={`${ids}-title`} title="Situação do anúncio" gap={3}>
        <div role="status" aria-live="polite">
          {done ? <Alert tone="success">{done}</Alert> : null}
        </div>

        {error ? (
          <Alert ref={errorRef} tabIndex={-1} role="alert" tone="error">
            {error}
          </Alert>
        ) : null}

        {confirming ? (
          <Alert
            tone="error"
            role="group"
            aria-labelledby={confirmTitleId}
            aria-describedby={confirmBodyId}
          >
            <h3 id={confirmTitleId} ref={confirmRef} tabIndex={-1}>
              {CONFIRM_TEXT[confirming].title}
            </h3>
            <p id={confirmBodyId}>{CONFIRM_TEXT[confirming].body}</p>
            <Cluster gap={2}>
              <Button variant="danger" loading={busy} onClick={() => run(confirming)}>
                {busy ? 'Aguarde…' : CONFIRM_TEXT[confirming].button}
              </Button>
              <Button variant="outline" disabled={busy} onClick={cancelConfirm}>
                Cancelar
              </Button>
            </Cluster>
          </Alert>
        ) : status === 'draft' ? (
          <Stack gap={4}>
            <Text size="small" tone="muted">
              Rascunho: só você vê este anúncio. Para publicar, ele precisa das três alternativas de
              troca e de pelo menos uma imagem pronta.
              {readyImageCount === 0 ? ' Nenhuma imagem está pronta ainda.' : null}
            </Text>
            <Stack gap={2}>
              <Checkbox
                id={complianceId}
                label={LISTING_COMPLIANCE_DECLARATION}
                checked={complianceAccepted}
                onChange={(e) => setComplianceAccepted(e.target.checked)}
              />
              <Text size="small">
                <TextLink href={PROHIBITED_ITEMS_POLICY_PATH} reload target="_blank" rel="noopener">
                  Ler a Política de itens proibidos (abre em nova aba)
                </TextLink>
              </Text>
            </Stack>
            <Cluster gap={2}>
              <Button
                disabled={busy}
                loading={pending === 'publish'}
                onClick={() => run('publish')}
              >
                {pending === 'publish' ? 'Publicando…' : 'Publicar anúncio'}
              </Button>
              <Button
                ref={discardRef}
                variant="dangerOutline"
                disabled={busy}
                onClick={() => openConfirm('discard')}
              >
                Descartar rascunho
              </Button>
            </Cluster>
          </Stack>
        ) : (
          <Stack gap={4}>
            <Text size="small" tone="muted">
              {status === 'published'
                ? 'Publicado: o anúncio aparece na oferta pública. Pausar retira da oferta até você reativar.'
                : 'Pausado: o anúncio não aparece na oferta pública. Reativar exige as três alternativas de troca e pelo menos uma imagem pronta.'}
            </Text>
            <Cluster gap={2}>
              {status === 'published' ? (
                <Button
                  variant="outline"
                  iconStart="pause"
                  disabled={busy}
                  loading={pending === 'pause'}
                  onClick={() => run('pause')}
                >
                  {pending === 'pause' ? 'Pausando…' : 'Pausar anúncio'}
                </Button>
              ) : (
                <Button
                  iconStart="play"
                  disabled={busy}
                  loading={pending === 'reactivate'}
                  onClick={() => run('reactivate')}
                >
                  {pending === 'reactivate' ? 'Reativando…' : 'Reativar anúncio'}
                </Button>
              )}
              <Button
                ref={closeRef}
                variant="dangerOutline"
                disabled={busy}
                onClick={() => openConfirm('close')}
              >
                Encerrar anúncio
              </Button>
            </Cluster>
          </Stack>
        )}
      </Section>
    </Card>
  );
}
