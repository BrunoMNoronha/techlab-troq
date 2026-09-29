import { Resend } from 'resend';

// Envio do email de verificacao via Resend (DEC-015; identity-contract.md,
// IC-9.1). O resultado e PROPAGADO: so ha sucesso quando o provedor aceita a
// mensagem. Configuracao ausente, placeholder, erro da API ou excecao sao
// falha, em qualquer ambiente — nao existe sucesso simulado nem "envio" para o
// console. Nenhum log carrega destinatario, token, link, HTML, chave ou o
// objeto devolvido pelo provedor: so a categoria e o codigo de erro.

export type EmailDeliveryResult =
  { ok: true } | { ok: false; reason: 'not_configured' | 'provider_error' | 'exception' };

export interface VerificationEmail {
  to: string;
  verificationUrl: string;
  /**
   * Chave de idempotencia do Resend, unica por emissao de token: um mesmo
   * envio nunca vira dois emails. Nao ha retry automatico.
   */
  idempotencyKey: string;
}

const PLACEHOLDER_PREFIX = 'SUBSTITUIR_';

function isConfigured(value: string | undefined): value is string {
  return Boolean(value) && !value!.startsWith(PLACEHOLDER_PREFIX);
}

// O placeholder de EMAIL_FROM em .env.example usa o dominio reservado
// `example.invalid`, que nunca resolve (RFC 2606).
function isConfiguredSender(value: string | undefined): value is string {
  return isConfigured(value) && !/@[^>]*\.invalid>?\s*$/i.test(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export async function sendVerificationEmail({
  to,
  verificationUrl,
  idempotencyKey,
}: VerificationEmail): Promise<EmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!isConfigured(apiKey) || !isConfiguredSender(from)) {
    console.error('[email] envio de verificacao nao configurado (RESEND_API_KEY/EMAIL_FROM).');
    return { ok: false, reason: 'not_configured' };
  }

  const safeUrl = escapeHtml(verificationUrl);

  try {
    const { error } = await new Resend(apiKey).emails.send(
      {
        from,
        to: [to],
        subject: 'Confirme seu e-mail no TROQ',
        text:
          'Para concluir seu cadastro no TROQ, confirme seu e-mail abrindo o link abaixo.\n\n' +
          `${verificationUrl}\n\n` +
          'O link vale por 24 horas e pode ser usado uma unica vez. ' +
          'Se voce nao se cadastrou no TROQ, ignore esta mensagem.',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Confirme seu e-mail no TROQ</h2>
            <p>Para concluir seu cadastro no TROQ, clique no botao abaixo:</p>
            <p style="margin: 24px 0;">
              <a href="${safeUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Confirmar e-mail</a>
            </p>
            <p style="color: #6b7280; font-size: 14px;">O link vale por 24 horas e pode ser usado uma unica vez. Se voce nao se cadastrou no TROQ, ignore esta mensagem.</p>
          </div>
        `,
      },
      { idempotencyKey },
    );

    if (error) {
      console.error(
        '[email] Resend recusou o envio:',
        `${error.statusCode ?? 'sem-status'}/${error.name}`,
      );
      return { ok: false, reason: 'provider_error' };
    }

    return { ok: true };
  } catch (err) {
    console.error('[email] falha ao chamar o Resend:', err instanceof Error ? err.name : 'erro');
    return { ok: false, reason: 'exception' };
  }
}
