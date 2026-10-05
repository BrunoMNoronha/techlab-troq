import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Alert, type AlertTone } from '@/components/feedback';
import { PageContainer, PageHeader, Stack } from '@/components/layout';
import { BackLink, Stepper } from '@/components/navigation';
import { Badge, ButtonLink, Text, TextLink } from '@/components/ui';
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
  title: 'Sua solicitação — TROQS',
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
    <PageContainer width="content">
      <PageHeader
        navigation={<BackLink href="/solicitacoes">Minhas solicitações</BackLink>}
        title="Solicitação de contato"
        description={
          <Text as="span" size="small" tone="muted" wrapAnywhere>
            Anúncio:{' '}
            {request.listingStatus === 'published' && request.listingTitle ? (
              <TextLink href={`/explorar/${request.listingId}`}>{title}</TextLink>
            ) : (
              title
            )}
          </Text>
        }
        meta={<Badge tone={phase.tone}>{phase.label}</Badge>}
      />

      <Stack gap={6}>
        <Steps phase={request.phase} chosen={chosen} />

        <Stack gap={4}>
          <PhaseBody request={request} chosen={chosen} />
        </Stack>
      </Stack>
    </PageContainer>
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
              <p>
                Enquanto o anúncio estiver pausado, o Pix não é exibido nem gerado de novo. Sua vaga
                continua reservada até {TIME.format(new Date(request.reservedUntil))} (horário de
                Brasília).
              </p>
              <p>Se você já pagou dentro do prazo, o pagamento será reconhecido normalmente.</p>
            </Notice>
            <StatusRefresher />
          </>
        );
      }
      return (
        <>
          <Notice tone="neutral" title="Anúncio indisponível">
            <p>
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
            <p>
              O prazo terminou às {TIME.format(new Date(request.reservedUntil))} (horário de
              Brasília). Se você pagou dentro do prazo, a confirmação ainda pode aparecer aqui.
            </p>
            <p>
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
            <p>
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
            <p>O contato do anunciante foi liberado para você. Cada consulta é registrada.</p>
            <div>
              <ButtonLink href="/contatos" iconStart="phone">
                Ver contato liberado
              </ButtonLink>
            </div>
          </Notice>
        );
      }
      return (
        <>
          <Notice tone="success" title="Pagamento confirmado">
            <p>
              {request.paidAt
                ? `Pagamento confirmado em ${DATE_TIME.format(new Date(request.paidAt))}. `
                : null}
              Agora o anunciante escolhe uma das solicitações pagas deste anúncio.
            </p>
            <p>
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
    <div>
      <TextLink href={`/explorar/${request.listingId}`} iconStart="arrow-left">
        Voltar ao anúncio
      </TextLink>
    </div>
  );
}

const STEPS = ['Vaga reservada', 'Pagamento confirmado', 'Escolha do anunciante'] as const;

function Steps({ phase, chosen }: { phase: OwnContactRequestView['phase']; chosen: boolean }) {
  if (phase !== 'awaiting_payment' && phase !== 'paid') return null;
  const current = phase === 'awaiting_payment' ? 1 : chosen ? 3 : 2;
  return (
    <Stepper label="Etapas da solicitação" steps={STEPS} current={current} completed={chosen} />
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: Extract<AlertTone, 'success' | 'warning' | 'neutral'>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Alert as="section" role="status" aria-label={title} title={title} titleAs="h2" tone={tone}>
      {children}
    </Alert>
  );
}
