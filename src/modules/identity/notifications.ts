import { reportSignal } from '@/modules/platform';
import { getPrismaClient } from '@/persistence/prisma';
import { resolveAppOrigin } from './auth';
import { escapeHtml } from './email-config';
import { sendTransactionalEmail } from './email-transport';

// Catalogo dos emails transacionais da Fase 3 (F3-013, #103; RF-021; DEC-048;
// docs/product/transactional-emails.md, TE-1 a TE-3 e TE-6).
//
// `identity` e dono do endereco de email (AR-3.3): os outros modulos pedem um
// aviso por TIPO, para um destinatario identificado por id interno, e nunca
// veem o endereco.
//
// Regras estruturais (TE-4):
// - nenhum template recebe texto escrito por pessoa usuaria — titulo, descricao,
//   nome de exibicao, alternativas de troca —, porque esse texto pode conter
//   telefone/WhatsApp (CR-6.1, RF-021; DEC-049 filtra o anuncio, nao o nome). O
//   aviso so carrega ids internos, usados nos links;
// - o contato liberado NUNCA vai por email: TE-3 so manda a pessoa ao lugar
//   autorizado (`/contatos`), onde a entrega passa por A1 a A6 (CR-5);
// - o envio e chamado DEPOIS do commit da transicao, e so por quem a efetuou.
//   Reprocessar a mesma transicao nao a efetua de novo, entao nao chama de
//   novo. A chave de idempotencia do Resend, derivada da transicao, e a
//   segunda camada contra corrida e retentativa HTTP;
// - envio e melhor esforco: nunca lanca, nunca desfaz a transicao e nao tem
//   retentativa. A falha vira sinal (`email.delivery_failed`), sem endereco.

export type UserNotice =
  /** TE-1: o pagamento da solicitacao foi confirmado; vai a quem pagou. */
  | {
      kind: 'request_paid_requester';
      recipientId: string;
      contactRequestId: string;
      listingId: string;
    }
  /** TE-2: chegou uma solicitacao paga num anuncio; vai ao anunciante. */
  | { kind: 'request_paid_owner'; recipientId: string; contactRequestId: string }
  /** TE-3: a pessoa foi escolhida e o contato foi liberado a ela. */
  | { kind: 'contact_released'; recipientId: string; contactReleaseId: string }
  /** TE-6: um pagamento foi devolvido por reembolso tecnico; vai a quem pagou. */
  | { kind: 'refund_concluded'; recipientId: string; technicalRefundId: string; listingId: string };

export type NoticeKind = UserNotice['kind'];

export type NoticeDeliveryResult =
  | { sent: true }
  | {
      sent: false;
      reason:
        | 'recipient_unavailable'
        | 'reserved_recipient'
        | 'not_configured'
        | 'provider_error'
        | 'exception';
    };

export interface RenderedNotice {
  subject: string;
  text: string;
  html: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function subjectIdOf(notice: UserNotice): string {
  switch (notice.kind) {
    case 'request_paid_requester':
    case 'request_paid_owner':
      return notice.contactRequestId;
    case 'contact_released':
      return notice.contactReleaseId;
    case 'refund_concluded':
      return notice.technicalRefundId;
  }
}

/**
 * Chave de idempotencia do Resend: uma por transicao e por tipo de aviso. O
 * destinatario e determinado pelo tipo e pela transicao, entao nao entra.
 */
export function noticeIdempotencyKey(notice: UserNotice): string {
  return `troq-notice/${notice.kind}/${subjectIdOf(notice)}`;
}

function layout(title: string, paragraphs: string[], cta: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n            ');
  return `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>${escapeHtml(title)}</h2>
            ${body}
            <p style="margin: 24px 0;">
              <a href="${escapeHtml(cta.url)}" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">${escapeHtml(cta.label)}</a>
            </p>
            <p style="color: #6b7280; font-size: 14px;">Este é um aviso automático do TROQS. Não responda a este e-mail.</p>
          </div>
        `;
}

function textOf(paragraphs: string[], url: string): string {
  return `${paragraphs.join('\n\n')}\n\n${url}\n\nEste é um aviso automático do TROQS. Não responda a este e-mail.`;
}

/**
 * Monta o email do aviso. Funcao pura: so texto fixo, a origem publica do TROQS
 * e ids internos validados. Nenhum dado de pessoa entra.
 */
export function renderNotice(notice: UserNotice, baseURL: string): RenderedNotice {
  switch (notice.kind) {
    case 'request_paid_requester': {
      const url = `${baseURL}/explorar/${encodeURIComponent(notice.listingId)}`;
      const title = 'Pagamento confirmado';
      const paragraphs = [
        'Recebemos o pagamento da sua solicitação de contato no TROQS.',
        'Agora o anunciante pode escolher você. Se você for a pessoa escolhida, avisaremos por e-mail e o contato ficará disponível na sua conta.',
      ];
      return {
        subject: 'TROQS: pagamento da sua solicitação confirmado',
        text: textOf(paragraphs, url),
        html: layout(title, paragraphs, { label: 'Ver o anúncio', url }),
      };
    }
    case 'request_paid_owner': {
      const url = `${baseURL}/anuncios`;
      const title = 'Nova solicitação paga';
      const paragraphs = [
        'Uma pessoa pagou para solicitar o seu contato em um dos seus anúncios no TROQS.',
        'Acesse os seus anúncios para ver as solicitações e escolher com quem negociar.',
      ];
      return {
        subject: 'TROQS: nova solicitação paga em um anúncio seu',
        text: textOf(paragraphs, url),
        html: layout(title, paragraphs, { label: 'Ver meus anúncios', url }),
      };
    }
    case 'contact_released': {
      const url = `${baseURL}/contatos`;
      const title = 'Contato liberado para você';
      const paragraphs = [
        'O anunciante escolheu você para negociar no TROQS.',
        'Por segurança, o contato não vai por e-mail: ele está disponível apenas na sua conta.',
      ];
      return {
        subject: 'TROQS: o anunciante escolheu você e liberou o contato',
        text: textOf(paragraphs, url),
        html: layout(title, paragraphs, { label: 'Ver o contato', url }),
      };
    }
    case 'refund_concluded': {
      // TE-6: sem a causa tecnica (duplicidade, fora da janela, sem vaga) e sem
      // valor: o texto vale para RT-1 a RT-4 e nao depende de dado do pagamento.
      const url = `${baseURL}/explorar/${encodeURIComponent(notice.listingId)}`;
      const title = 'Pagamento devolvido';
      const paragraphs = [
        'Um pagamento Pix que você fez no TROQS não pôde ser usado e foi devolvido integralmente à conta de origem.',
        'A devolução pode levar alguns instantes para aparecer no seu extrato. Ela não altera nenhuma solicitação que já esteja confirmada na sua conta.',
      ];
      return {
        subject: 'TROQS: devolvemos um pagamento seu',
        text: textOf(paragraphs, url),
        html: layout(title, paragraphs, { label: 'Ver o anúncio', url }),
      };
    }
  }
}

function hasValidIds(notice: UserNotice): boolean {
  const ids = [notice.recipientId, subjectIdOf(notice)];
  if (notice.kind === 'request_paid_requester' || notice.kind === 'refund_concluded') {
    ids.push(notice.listingId);
  }
  return ids.every((id) => typeof id === 'string' && UUID_PATTERN.test(id));
}

function fail(
  notice: UserNotice,
  reason: Extract<NoticeDeliveryResult, { sent: false }>['reason'],
): NoticeDeliveryResult {
  // Destinatario indisponivel ou reservado nao e falha operacional: so log.
  const alert = reason !== 'recipient_unavailable' && reason !== 'reserved_recipient';
  reportSignal('email.delivery_failed', { kind: notice.kind, reason }, { alert });
  return { sent: false, reason };
}

/**
 * Envia o aviso ao destinatario. Chamar SOMENTE depois do commit da transicao
 * que o justifica, e somente quando a chamada efetuou a transicao. Nunca lanca.
 *
 * Conta que nao esta `active` com email verificado nao recebe aviso.
 */
export async function notifyUser(notice: UserNotice): Promise<NoticeDeliveryResult> {
  try {
    if (!hasValidIds(notice)) return fail(notice, 'recipient_unavailable');

    const recipient = await getPrismaClient().user.findUnique({
      where: { id: notice.recipientId },
      select: { email: true, emailVerified: true, status: true },
    });
    if (!recipient || recipient.status !== 'active' || !recipient.emailVerified) {
      return fail(notice, 'recipient_unavailable');
    }

    let baseURL: string;
    try {
      baseURL = resolveAppOrigin().baseURL;
    } catch {
      return fail(notice, 'not_configured');
    }

    const rendered = renderNotice(notice, baseURL);
    const result = await sendTransactionalEmail({
      to: recipient.email,
      ...rendered,
      idempotencyKey: noticeIdempotencyKey(notice),
    });
    if (!result.ok) return fail(notice, result.reason);
    return { sent: true };
  } catch (err) {
    console.error('[email] falha ao preparar aviso transacional', {
      kind: notice.kind,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return fail(notice, 'exception');
  }
}
