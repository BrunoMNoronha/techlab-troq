'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DemoSummary } from '@/modules/demo-data';
import { DescriptionList } from '@/components/data-display';
import { Alert } from '@/components/feedback';
import { Form, FormActions } from '@/components/forms';
import { Section, Stack } from '@/components/layout';
import { Dialog } from '@/components/overlay';
import { Badge, Button, Card, Text } from '@/components/ui';
import { removeDemoProducts } from './actions';

type Confirmation = { batchId: string; version: string; products: number };
type RemovedBatch = { batchId: string; removed: number; pendingMedia: number };

function batchLabel(batchId: string): string {
  return `${batchId.slice(0, 8)}…${batchId.slice(-4)}`;
}

export function DemoProducts({ summary }: { summary: DemoSummary }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [removedBatch, setRemovedBatch] = useState<RemovedBatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const errorRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmation) cancelRef.current?.focus();
  }, [confirmation]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const removedCurrentBatch = removedBatch?.batchId === summary.batchId;
  const products = removedCurrentBatch ? 0 : summary.products;
  const pendingMedia =
    removedCurrentBatch && removedBatch ? removedBatch.pendingMedia : summary.pendingMedia;
  const environment = summary.environment === 'preview' ? 'Preview' : 'Desenvolvimento';
  const canRemove = !!summary.batchId && products > 0;
  const showRemovalResult =
    !!removedBatch && (!summary.batchId || summary.batchId === removedBatch.batchId);

  useEffect(() => {
    if (showRemovalResult) resultRef.current?.focus();
  }, [removedBatch, showRemovalResult]);

  function openConfirmation() {
    if (!summary.batchId || !canRemove || inFlight.current) return;
    setError(null);
    // Congela o lote e a contagem exibidos ao confirmar, inclusive após refresh.
    setConfirmation({ batchId: summary.batchId, version: summary.version, products });
  }

  function closeConfirmation() {
    if (!inFlight.current) setConfirmation(null);
  }

  function handleRemove(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmation || inFlight.current) return;
    const confirmedBatch = confirmation;
    inFlight.current = true;
    setError(null);

    startTransition(async () => {
      try {
        const result = await removeDemoProducts(confirmedBatch.batchId);
        if (result.success) {
          setRemovedBatch({
            batchId: confirmedBatch.batchId,
            removed: result.removed,
            pendingMedia: result.pendingMedia,
          });
          setConfirmation(null);
          router.refresh();
        } else if (result.reason === 'login_required') {
          router.push('/login?motivo=sessao');
        } else {
          setError(result.error);
          setConfirmation(null);
          if (result.reason === 'stale_batch') router.refresh();
        }
      } catch {
        setError('Não foi possível concluir a remoção. Verifique sua conexão e tente novamente.');
        setConfirmation(null);
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <Card>
      <Section
        title="Produtos exemplares"
        titleId="produtos-exemplares"
        description="Produtos fictícios para explorar e testar o TROQS. Qualquer usuário com conta ativa e e-mail verificado pode remover o lote deste ambiente."
      >
        <DescriptionList
          items={[
            { term: 'Ambiente', detail: <Badge tone="warning">{environment}</Badge> },
            { term: 'Versão do conjunto', detail: summary.version },
            {
              term: 'Lote atual',
              detail: summary.batchId ? batchLabel(summary.batchId) : 'Nenhum lote ativo',
            },
            { term: 'Produtos deste lote', detail: String(products) },
            { term: 'Arquivos de imagem com remoção pendente', detail: String(pendingMedia) },
          ]}
        />

        {showRemovalResult && removedBatch && (
          <Alert
            ref={resultRef}
            role="status"
            tabIndex={-1}
            tone={pendingMedia > 0 ? 'warning' : 'success'}
          >
            {removedBatch.removed > 0
              ? `${removedBatch.removed} produtos exemplares removidos.`
              : 'Nenhum produto exemplar precisou ser removido.'}{' '}
            {pendingMedia > 0
              ? `${pendingMedia} arquivos de imagem aguardam a limpeza automática. Atualize o status para acompanhar.`
              : 'A limpeza das imagens do lote foi concluída.'}
          </Alert>
        )}
        {error && (
          <Alert ref={errorRef} role="alert" tabIndex={-1} tone="error">
            {error}
          </Alert>
        )}

        <Text size="small" tone="muted">
          A remoção afeta apenas os produtos exemplares identificados neste lote e suas imagens.
          Outros cadastros e históricos são preservados. Se houver vínculos de negócio, a remoção
          será bloqueada.
        </Text>
        {!canRemove && (
          <Text size="small">
            {pendingMedia > 0
              ? 'Não há produtos exemplares para remover. A limpeza automática dos arquivos de imagem está pendente.'
              : 'Não há produtos exemplares ou arquivos de imagem pendentes para remover.'}
          </Text>
        )}
        <FormActions>
          <Button
            variant="dangerOutline"
            iconStart="trash"
            disabled={!canRemove || pending}
            fullWidth
            onClick={openConfirmation}
          >
            {products > 0
              ? `Remover ${products} produtos exemplares`
              : 'Remover produtos exemplares'}
          </Button>
          {pendingMedia > 0 && (
            <Button
              variant="outline"
              disabled={pending}
              fullWidth
              onClick={() => startTransition(() => router.refresh())}
            >
              Atualizar status da limpeza
            </Button>
          )}
        </FormActions>

        <Dialog
          open={!!confirmation}
          onClose={closeConfirmation}
          dismissOnBackdrop={false}
          title="Remover produtos exemplares?"
          description={`Ambiente: ${environment}. Esta ação não pode ser desfeita.`}
        >
          {confirmation && (
            <Form onSubmit={handleRemove}>
              <Stack gap={4}>
                <DescriptionList
                  items={[
                    { term: 'Lote confirmado', detail: batchLabel(confirmation.batchId) },
                    { term: 'Versão do conjunto', detail: confirmation.version },
                  ]}
                />
                <Text>
                  {`Você está prestes a remover ${confirmation.products} produtos exemplares. Os arquivos de imagem deste lote serão encaminhados à limpeza automática.`}
                </Text>
                <Text size="small" tone="muted">
                  Confirme somente se deseja limpar esses dados fictícios de {environment}. Outros
                  produtos e históricos serão preservados.
                </Text>
                <FormActions>
                  <Button type="submit" variant="danger" loading={pending} fullWidth>
                    {pending ? 'Removendo...' : 'Confirmar remoção'}
                  </Button>
                  <Button
                    ref={cancelRef}
                    variant="outline"
                    disabled={pending}
                    onClick={closeConfirmation}
                    fullWidth
                    autoFocus
                  >
                    Cancelar
                  </Button>
                </FormActions>
              </Stack>
            </Form>
          )}
        </Dialog>
      </Section>
    </Card>
  );
}
