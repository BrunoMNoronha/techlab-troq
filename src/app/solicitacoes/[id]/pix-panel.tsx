'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
    <section
      aria-labelledby="pix-titulo"
      style={{
        padding: '20px',
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
      }}
    >
      <h2 id="pix-titulo" style={{ fontSize: '18px', margin: '0 0 8px' }}>
        Pague R$ 0,99 via Pix
      </h2>
      <Deadline reservedUntil={reservedUntil} serverNow={serverNow} />

      {state.kind === 'loading' && (
        <p role="status" aria-live="polite" style={{ margin: '16px 0 0', color: '#374151' }}>
          Gerando o Pix…
        </p>
      )}

      {state.kind === 'retry' && (
        <div role="alert" style={alertBox}>
          <p style={{ margin: '0 0 12px' }}>{state.message}</p>
          <button type="button" onClick={() => void load()} style={primaryButton}>
            Tentar novamente
          </button>
        </div>
      )}

      {state.kind === 'unavailable' && (
        <p role="status" style={{ margin: '16px 0 0', color: '#374151' }}>
          {state.message}
        </p>
      )}

      {state.kind === 'ready' && (
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {state.pix.qrCodeBase64 && BASE64.test(state.pix.qrCodeBase64) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${state.pix.qrCodeBase64}`}
              alt="QR Code do Pix de R$ 0,99. Leia com o aplicativo do seu banco."
              width={220}
              height={220}
              style={{
                display: 'block',
                width: '220px',
                maxWidth: '100%',
                height: 'auto',
                alignSelf: 'center',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            />
          )}
          <div>
            <label
              htmlFor="pix-copia-e-cola"
              style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}
            >
              Pix copia e cola
            </label>
            <textarea
              id="pix-copia-e-cola"
              readOnly
              rows={4}
              value={state.pix.copyPaste}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px',
                fontFamily: 'monospace',
                fontSize: '13px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                resize: 'vertical',
                wordBreak: 'break-all',
              }}
            />
            <div
              style={{
                marginTop: '8px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <button
                type="button"
                onClick={() => void copy(state.pix.copyPaste)}
                style={primaryButton}
              >
                Copiar código Pix
              </button>
              <span aria-live="polite" style={{ fontSize: '14px', color: '#166534' }}>
                {copied}
              </span>
            </div>
          </div>
          {state.pix.ticketUrl?.startsWith('https://') && (
            <a
              href={state.pix.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#1d4ed8', fontWeight: 600 }}
            >
              Abrir o Pix no Mercado Pago (nova aba)
            </a>
          )}
          <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.5 }}>
            Depois de pagar, a confirmação pode levar alguns instantes. Esta página mostra quando o
            pagamento for confirmado.
          </p>
        </div>
      )}
    </section>
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
    <p style={{ margin: 0, color: '#374151', lineHeight: 1.5 }}>
      Pague até <strong>{TIME.format(new Date(reservedUntil))}</strong> (horário de Brasília).{' '}
      {minutes > 0
        ? `Faltam cerca de ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`
        : 'O prazo terminou.'}
    </p>
  );
}

const alertBox = {
  marginTop: '16px',
  padding: '12px',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  color: '#991b1b',
  fontSize: '14px',
} as const;

const primaryButton = {
  padding: '10px 16px',
  backgroundColor: '#1d4ed8',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
} as const;
