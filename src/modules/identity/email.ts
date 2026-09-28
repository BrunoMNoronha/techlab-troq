import { Resend } from 'resend';

/**
 * Dispara e-mail de verificacao transacional via Resend.
 * Se RESEND_API_KEY nao estiver configurada ou for mock, faz log seguro e retorna sucesso.
 */
export async function sendVerificationEmail(
  toEmail: string,
  verificationUrl: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || apiKey.startsWith('SUBSTITUIR_')) {
    console.log(`[DEV EMAIL] Link de verificacao para ${toEmail}: ${verificationUrl}`);
    return true;
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM || 'TROQ <nao-responda@dev.troqs.app>';

  try {
    const { error } = await resend.emails.send({
      from,
      to: [toEmail],
      subject: 'Verifique seu e-mail no TROQ',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Confirme seu e-mail no TROQ</h2>
          <p>Para concluir seu cadastro no TROQ e ativar sua conta, clique no botao abaixo:</p>
          <p style="margin: 24px 0;">
            <a href="${verificationUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Verificar e-mail</a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">Se voce nao solicitou este cadastro no TROQ, ignore esta mensagem.</p>
        </div>
      `,
    });

    if (error) {
      console.error('[Resend Error]', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Resend Exception]', err);
    return false;
  }
}
