import { ACCOUNT_NOT_ACTIVE_CODE } from '@/modules/identity/auth';
import { GOOGLE_EMAIL_NOT_VERIFIED, GOOGLE_SIGNUP_REQUIRED } from '@/modules/identity/google';
import { sanitizeReturnPath } from '@/modules/identity/return-path';

// Destino de erro de todo fluxo Google (IC-15.6). O Better Auth redireciona
// para ca com `?error=<codigo>` — inclusive cancelamento no Google
// (`access_denied`), state ausente, adulterado ou repetido e falha na troca do
// codigo. A rota so traduz o codigo para um motivo de uma lista fechada; o
// codigo cru e `error_description` (texto do provedor) nunca chegam a pagina.
//
// `google_signup_required` nao e falha: e a identidade Google nova, cuja
// pendencia de cadastro o gate acabou de gravar. Segue para a conclusao.

const SIGN_IN_REASONS: Record<string, string> = {
  access_denied: 'google_cancelado',
  account_not_linked: 'google_conta_existente',
  [GOOGLE_EMAIL_NOT_VERIFIED]: 'google_email_nao_verificado',
  [ACCOUNT_NOT_ACTIVE_CODE]: 'bloqueada',
};

const LINK_REASONS: Record<string, string> = {
  access_denied: 'cancelado',
  email_does_not_match: 'email_diferente',
  account_already_linked_to_different_user: 'ja_vinculada',
};

function redirectTo(location: string): Response {
  // Location relativo: nao depende do Host da requisicao.
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'no-store' },
  });
}

export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const error = params.get('error') ?? '';

  if (params.get('fluxo') === 'vincular') {
    return redirectTo(`/conta?google=${LINK_REASONS[error] ?? 'falha'}`);
  }

  const next = sanitizeReturnPath(params.get('next'));
  const nextQuery = next ? `next=${encodeURIComponent(next)}` : '';

  if (error === GOOGLE_SIGNUP_REQUIRED) {
    return redirectTo(nextQuery ? `/cadastro/google?${nextQuery}` : '/cadastro/google');
  }

  const reason = SIGN_IN_REASONS[error] ?? 'google_falha';
  return redirectTo(`/login?motivo=${reason}${nextQuery ? `&${nextQuery}` : ''}`);
}
