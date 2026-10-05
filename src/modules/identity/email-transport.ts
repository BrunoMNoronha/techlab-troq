import { Resend } from 'resend';
import { isConfigured, isConfiguredSender } from './email-config';

// Transporte dos emails transacionais da Fase 3 via Resend (DEC-015; RF-021;
// docs/product/transactional-emails.md). Mesmo contrato do email de
// verificacao (./email.ts): o resultado e propagado, configuracao ausente e
// falha, e nenhum log carrega destinatario, assunto, corpo, chave ou o objeto
// devolvido pelo provedor.
//
// Destinatario em dominio RESERVADO (RFC 2606 e RFC 6761: `.test`, `.invalid`,
// `.example`, `.localhost` e `example.com/net/org`) nunca chega ao provedor.
// Os dados sinteticos dos testes usam esses dominios; um servidor real de
// teste com chave de desenvolvimento nao manda email a endereco que nao existe.

export type TransportResult =
  | { ok: true }
  | { ok: false; reason: 'reserved_recipient' | 'not_configured' | 'provider_error' | 'exception' };

export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Chave de idempotencia do Resend: a mesma transicao nunca vira dois emails. */
  idempotencyKey: string;
}

const RESERVED_DOMAIN =
  /@(?:[^@]+\.)?(?:test|invalid|example|localhost)$|@(?:[^@]+\.)?example\.(?:com|net|org)$/i;

export function isReservedRecipient(address: string): boolean {
  return RESERVED_DOMAIN.test(address.trim());
}

export async function sendTransactionalEmail(email: TransactionalEmail): Promise<TransportResult> {
  if (isReservedRecipient(email.to)) return { ok: false, reason: 'reserved_recipient' };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!isConfigured(apiKey) || !isConfiguredSender(from)) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { error } = await new Resend(apiKey).emails.send(
      { from, to: [email.to], subject: email.subject, text: email.text, html: email.html },
      { idempotencyKey: email.idempotencyKey },
    );
    if (error) {
      console.error(
        '[email] Resend recusou o envio transacional:',
        `${error.statusCode ?? 'sem-status'}/${error.name}`,
      );
      return { ok: false, reason: 'provider_error' };
    }
    return { ok: true };
  } catch (err) {
    console.error(
      '[email] falha ao chamar o Resend (transacional):',
      err instanceof Error ? err.name : 'erro',
    );
    return { ok: false, reason: 'exception' };
  }
}
