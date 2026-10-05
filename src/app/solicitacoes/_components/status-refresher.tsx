'use client';

import { startTransition, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Cluster } from '@/components/layout';
import { Button, Text } from '@/components/ui';

// Acompanhamento do estado da solicitacao (F3-012, #102). A confirmacao do Pix
// chega ao TROQS pelo webhook ou pela reconciliacao (F3-006, F3-008), nunca por
// este navegador: aqui so se rele a pagina, que relê o estado no servidor.
//
// O `router.refresh()` vai na `startTransition` (correcao de V7, PR #88). Com
// a aba oculta nao ha releitura automatica; ao voltar, ela acontece na hora.
// A releitura automatica usa uma transicao propria, para o botao nao piscar
// "Atualizando…" a cada intervalo; so o gesto manual mostra o estado pendente.

export const AUTO_REFRESH_MS = 10_000;

export function StatusRefresher({
  auto = true,
  label = 'Atualizar situação',
}: {
  auto?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startManualTransition] = useTransition();

  useEffect(() => {
    if (!auto) return;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      startTransition(() => router.refresh());
    };
    const timer = setInterval(refresh, AUTO_REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [auto, router]);

  return (
    <Cluster gap={3}>
      <Button
        variant="outline"
        iconStart="refresh"
        onClick={() => startManualTransition(() => router.refresh())}
        loading={pending}
      >
        {pending ? 'Atualizando…' : label}
      </Button>
      {auto && (
        <Text as="span" size="small" tone="muted">
          Esta página se atualiza sozinha a cada 10 segundos.
        </Text>
      )}
    </Cluster>
  );
}
