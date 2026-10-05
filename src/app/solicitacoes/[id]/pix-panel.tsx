'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MediaFrame } from '@/components/data-display';
import { Alert, Skeleton } from '@/components/feedback';
import { Field, Textarea } from '@/components/forms';
import { Cluster, Stack } from '@/components/layout';
import { Button, Card, Heading, Text, TextLink } from '@/components/ui';
import { getPixPayment } from '@/modules/request/actions';
import type { PixPaymentDetails } from '@/modules/payments';
import { TIME } from '../_components/phase';

// Tela do Pix da reserva viva do proprio solicitante (F3-012, #102; PD-4.1).
//
// As instrucoes (QR, copia e cola, link) NAO estao no payload da pagina: vem da
// Server Action `getPixPayment`, que autoriza sob a trava do anuncio (dono da
// reserva, `reserved`, dentro da janela, anuncio `published`; PD-6.11) e retoma
// a cobranca com a MESMA chave se ela ainda nao foi registrada (PD-4.2). Elas
// vivem so no estado deste navegador; nunca vao para URL, log ou telemetria.
//
// O prazo exibido e o `reservedUntil` do TROQ (PD-3.1), pelo relogio do banco:
// o deslocamento entre o `now()` do servidor e o relogio local corrige a
// contagem. No fim do prazo, a pagina e relida no servidor.

type PanelState =
  | { kind: 'loading' }
  | { kind: 'ready'; pix: PixPaymentDetails }
  | { kind: 'retry'; message: string }
  | { kind: 'unavailable'; message: string };

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function PixPanel({
  contactRequestId,
  reservedUntil,
  serverNow,
}: {
  contactRequestId: string;
  reservedUntil: string;
  serverNow: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<PanelState>({ kind: 'loading' });
  const [copied, setCopied] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ kind: 'loading' });
    try {
      const res = await getPixPayment(contactRequestId);
      if (res.success && res.pix) {
        setState({ kind: 'ready', pix: res.pix });
      } else if (res.success || res.reason === 'charge_unavailable') {
        setState({
          kind: 'retry',
          message:
            'Não foi possível gerar o Pix agora. Sua vaga continua reservada até o fim do prazo; tente novamente.',
        });
      } else if (res.reason === 'login_required') {
        router.push(
          `/login?motivo=sessao&next=${encodeURIComponent(`/solicitacoes/${contactRequestId}`)}`,
        );
        return;
      } else {
        // Prazo encerrado, anuncio pausado ou encerrado: a pagina relida no
        // servidor mostra o estado certo.
        setState({ kind: 'unavailable', message: 'O Pix desta solicitação não está disponível.' });
        router.refresh();
      }
    } catch {
      setState({
        kind: 'retry',
        message: 'Não foi possível carregar o Pix. Verifique sua conexão e tente novamente.',
      });
    } finally {
      inFlight.current = false;
    }
  }, [contactRequestId, router]);

  useEffect(() => {
    // Busca inicial das instrucoes, uma vez por montagem (mutating-data.md, useEffect).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied('Código Pix copiado.');
    } catch {
      setCopied('Não foi possível copiar. Selecione o código e copie manualmente.');
    }
  }

  return (
    <Card as="section" aria-labelledby="pix-titulo" padding="lg">
      <Stack gap={4}>
        <Stack gap={2}>
          <Heading level={2} size="h3" id="pix-titulo">
            Pague R$ 0,99 via Pix
          </Heading>
          <Deadline reservedUntil={reservedUntil} serverNow={serverNow} />
        </Stack>

        {state.kind === 'loading' && (
          <Stack role="status" aria-live="polite" gap={3}>
            <Skeleton variant="block" />
            <Text tone="muted">Gerando o Pix…</Text>
          </Stack>
        )}

        {state.kind === 'retry' && (
          <Alert tone="error" role="alert">
            <p>{state.message}</p>
            <div>
              <Button iconStart="refresh" onClick={() => void load()}>
                Tentar novamente
              </Button>
            </div>
          </Alert>
        )}

        {state.kind === 'unavailable' && (
          <Text role="status" tone="muted">
            {state.message}
          </Text>
        )}

        {state.kind === 'ready' && (
          <Stack gap={4}>
            {state.pix.qrCodeBase64 && BASE64.test(state.pix.qrCodeBase64) && (
              <MediaFrame fit="contain" ratio="square" rounded size="sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${state.pix.qrCodeBase64}`}
                  alt="QR Code do Pix de R$ 0,99. Leia com o aplicativo do seu banco."
                  width={220}
                  height={220}
                />
              </MediaFrame>
            )}
            <Stack gap={2}>
              <Field label="Pix copia e cola" htmlFor="pix-copia-e-cola">
                <Textarea
                  id="pix-copia-e-cola"
                  readOnly
                  rows={4}
                  value={state.pix.copyPaste}
                  onFocus={(e) => e.currentTarget.select()}
                  mono
                />
              </Field>
              <Cluster gap={3}>
                <Button iconStart="copy" onClick={() => void copy(state.pix.copyPaste)}>
                  Copiar código Pix
                </Button>
                <Text as="span" size="small" tone="success" aria-live="polite">
                  {copied}
                </Text>
              </Cluster>
            </Stack>
            {state.pix.ticketUrl?.startsWith('https://') && (
              <div>
                <TextLink
                  reload
                  href={state.pix.ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  iconEnd="arrow-right"
                >
                  Abrir o Pix no Mercado Pago (nova aba)
                </TextLink>
              </div>
            )}
            <Text size="small" tone="muted">
              Depois de pagar, a confirmação pode levar alguns instantes. Esta página mostra quando
              o pagamento for confirmado.
            </Text>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/** Prazo da reserva, com contagem corrigida pelo relogio do servidor. */
function Deadline({ reservedUntil, serverNow }: { reservedUntil: string; serverNow: string }) {
  const router = useRouter();
  const deadline = new Date(reservedUntil).getTime();
  const [remainingMs, setRemainingMs] = useState(() => deadline - new Date(serverNow).getTime());
  const expiredOnce = useRef(false);

  useEffect(() => {
    const offset = new Date(serverNow).getTime() - Date.now();
    const tick = () => {
      const left = deadline - (Date.now() + offset);
      setRemainingMs(left);
      if (left <= 0 && !expiredOnce.current) {
        expiredOnce.current = true;
        router.refresh();
      }
    };
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, [deadline, serverNow, router]);

  const minutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  return (
    <Text>
      Pague até <strong>{TIME.format(new Date(reservedUntil))}</strong> (horário de Brasília).{' '}
      {minutes > 0
        ? `Faltam cerca de ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`
        : 'O prazo terminou.'}
    </Text>
  );
}
