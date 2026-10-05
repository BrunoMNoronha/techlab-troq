import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { listOwnContactReleases } from '@/modules/contact';
import { loginRedirectPath, validateSession } from '@/modules/identity';
import { getOwnContactRequest, type OwnContactRequestView } from '@/modules/request';
import {
  CHOSEN_LABEL,
  DATE_TIME,
  loginPathWithReturn,
  PHASE_LABELS,
  TIME,
} from '../_components/phase';
import { StatusRefresher } from '../_components/status-refresher';
import { PixPanel } from './pix-panel';

// Acompanhamento da solicitacao pelo proprio solicitante (F3-012, #102):
// prazo e Pix, confirmacao do pagamento, espera pela escolha e acesso ao
// contato quando escolhido. So o solicitante ve; qualquer outra pessoa recebe o
// mesmo 404 de uma solicitacao inexistente (PD-11.3).
//
// Dinamica e sem cache: dados privados por requisicao. Sem `loading.tsx` de
// proposito: com streaming, o 404 e o redirecionamento de login sairiam com
// HTTP 200 (achado de F2-006). O carregamento do Pix tem estado proprio.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Sua solicitação — TROQ',
  robots: { index: false, follow: false },
};

export default async function SolicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    redirect(loginPathWithReturn(loginRedirectPath(session.reason), `/solicitacoes/${id}`));
  }

  const request = await getOwnContactRequest(id);
  if (!request) {
    notFound();
  }

  // A liberacao e do escolhido (CR-5.3): a lista vem do proprio ator e nunca
  // traz o numero, que so sai em /contatos por gesto explicito (CR-6.2).
  const chosen =
    request.phase === 'paid'
      ? ((await listOwnContactReleases())?.some((r) => r.listingId === request.listingId) ?? false)
      : false;

  const phase = chosen ? CHOSEN_LABEL : PHASE_LABELS[request.phase];
  const title = request.listingTitle ?? 'Anúncio indisponível';

  return (
    <main
      style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'sans-serif',
      }}
    >
      <Link
        href="/solicitacoes"
        style={{ color: '#1d4ed8', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}
      >
        ← Minhas solicitações
      </Link>

      <h1 style={{ fontSize: '24px', margin: '16px 0 4px', overflowWrap: 'anywhere' }}>
        Solicitação de contato
      </h1>
      <p style={{ margin: '0 0 12px', color: '#374151', overflowWrap: 'anywhere' }}>
        Anúncio:{' '}
        {request.listingStatus === 'published' && request.listingTitle ? (
          <Link href={`/explorar/${request.listingId}`} style={{ color: '#1d4ed8' }}>
            {title}
          </Link>
        ) : (
          title
        )}
      </p>
      <p style={{ margin: '0 0 20px' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: 600,
            backgroundColor: phase.bg,
            color: phase.color,
          }}
        >
          {phase.label}
        </span>
      </p>

      <Steps phase={request.phase} chosen={chosen} />

      <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <PhaseBody request={request} chosen={chosen} />
      </div>
    </main>
  );
}

function PhaseBody({ request, chosen }: { request: OwnContactRequestView; chosen: boolean }) {
  switch (request.phase) {
    case 'awaiting_payment':
      if (request.listingStatus === 'published') {
        return (
          <>
            <PixPanel
              contactRequestId={request.contactRequestId}
              reservedUntil={request.reservedUntil}
              serverNow={request.now}
            />
            <StatusRefresher label="Já paguei — atualizar situação" />
          </>
        );
      }
      if (request.listingStatus === 'paused') {
        // PD-6.11: pausado nao gera cobranca nem reapresenta o QR; um pagamento
        // ja acreditado dentro da janela continua sendo reconhecido.
        return (
          <>
            <Notice tone="warning" title="Anúncio pausado pelo anunciante">
              <p style={{ margin: '0 0 8px' }}>
                Enquanto o anúncio estiver pausado, o Pix não é exibido nem gerado de novo. Sua vaga
                continua reservada até {TIME.format(new Date(request.reservedUntil))} (horário de
                Brasília).
              </p>
              <p style={{ margin: 0 }}>
                Se você já pagou dentro do prazo, o pagamento será reconhecido normalmente.
              </p>
            </Notice>
            <StatusRefresher />
          </>
        );
      }
      return (
        <>
          <Notice tone="neutral" title="Anúncio indisponível">
            <p style={{ margin: 0 }}>
              Este anúncio não aceita mais pagamentos. Se você já pagou dentro do prazo, o pagamento
              será reconhecido ou devolvido automaticamente.
            </p>
          </Notice>
          <StatusRefresher />
        </>
      );

    case 'window_closed':
      return (
        <>
          <Notice tone="neutral" title="O prazo para pagar terminou">
            <p style={{ margin: '0 0 8px' }}>
              O prazo terminou às {TIME.format(new Date(request.reservedUntil))} (horário de
              Brasília). Se você pagou dentro do prazo, a confirmação ainda pode aparecer aqui.
            </p>
            <p style={{ margin: 0 }}>
              Pagamento feito depois do prazo não vale como solicitação e é devolvido
              automaticamente; você recebe um aviso por e-mail quando a devolução for concluída.
            </p>
          </Notice>
          <StatusRefresher auto={false} />
          <AgainLink request={request} />
        </>
      );

    case 'expired':
    case 'failed':
      return (
        <>
          <Notice tone="neutral" title="Solicitação encerrada sem pagamento confirmado">
            <p style={{ margin: 0 }}>
              A vaga foi liberada. Se algum pagamento chegou depois do prazo, ele é devolvido
              automaticamente e você recebe um aviso por e-mail quando a devolução for concluída.
            </p>
          </Notice>
          <AgainLink request={request} />
        </>
      );

    case 'paid':
      if (chosen) {
        return (
          <Notice tone="success" title="Você foi escolhido pelo anunciante">
            <p style={{ margin: '0 0 12px' }}>
              O contato do anunciante foi liberado para você. Cada consulta é registrada.
            </p>
            <Link href="/contatos" style={linkButton}>
              Ver contato liberado
            </Link>
          </Notice>
        );
      }
      return (
        <>
          <Notice tone="success" title="Pagamento confirmado">
            <p style={{ margin: '0 0 8px' }}>
              {request.paidAt
                ? `Pagamento confirmado em ${DATE_TIME.format(new Date(request.paidAt))}. `
                : null}
              Agora o anunciante escolhe uma das solicitações pagas deste anúncio.
            </p>
            <p style={{ margin: 0 }}>
              Pagar não garante ser escolhido, e não há reembolso por não ser escolhido. Se você for
              escolhido, avisamos por e-mail e o contato aparece em “Contatos liberados”.
            </p>
          </Notice>
          <StatusRefresher auto={false} />
        </>
      );
  }
}

function AgainLink({ request }: { request: OwnContactRequestView }) {
  if (request.listingStatus !== 'published') return null;
  return (
    <p style={{ margin: 0 }}>
      <Link href={`/explorar/${request.listingId}`} style={{ color: '#1d4ed8', fontWeight: 600 }}>
        Voltar ao anúncio
      </Link>
    </p>
  );
}

const STEPS = ['Vaga reservada', 'Pagamento confirmado', 'Escolha do anunciante'] as const;

function Steps({ phase, chosen }: { phase: OwnContactRequestView['phase']; chosen: boolean }) {
  if (phase !== 'awaiting_payment' && phase !== 'paid') return null;
  const current = phase === 'awaiting_payment' ? 1 : chosen ? 3 : 2;
  return (
    <ol
      aria-label="Etapas da solicitação"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        fontSize: '13px',
      }}
    >
      {STEPS.map((step, index) => {
        const n = index + 1;
        const done = n < current || (n === 3 && chosen);
        const active = n === current;
        return (
          <li
            key={step}
            aria-current={active ? 'step' : undefined}
            style={{
              padding: '6px 10px',
              borderRadius: '999px',
              border: `1px solid ${active ? '#1d4ed8' : '#d1d5db'}`,
              backgroundColor: done ? '#eff6ff' : 'white',
              color: active ? '#1e3a8a' : '#374151',
              fontWeight: active ? 600 : 400,
            }}
          >
            {n}. {step}
            {done && n !== current ? ' ✓' : ''}
          </li>
        );
      })}
    </ol>
  );
}

const TONES = {
  success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#14532d' },
  warning: { bg: '#fffbeb', border: '#fde68a', color: '#78350f' },
  neutral: { bg: '#f9fafb', border: '#e5e7eb', color: '#1f2937' },
} as const;

function Notice({
  tone,
  title,
  children,
}: {
  tone: keyof typeof TONES;
  title: string;
  children: React.ReactNode;
}) {
  const colors = TONES[tone];
  return (
    <section
      role="status"
      aria-label={title}
      style={{
        padding: '16px',
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        color: colors.color,
        fontSize: '15px',
        lineHeight: 1.5,
      }}
    >
      <h2 style={{ fontSize: '17px', margin: '0 0 8px' }}>{title}</h2>
      {children}
    </section>
  );
}

const linkButton = {
  display: 'inline-block',
  padding: '10px 16px',
  backgroundColor: '#1d4ed8',
  color: 'white',
  borderRadius: '6px',
  fontWeight: 600,
  textDecoration: 'none',
} as const;
