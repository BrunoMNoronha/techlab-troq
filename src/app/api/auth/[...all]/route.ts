import { getAuth } from '@/modules/identity/auth';

// Cadastro, login e logout do TROQ sao Server Actions (src/modules/identity/
// actions.ts e google-actions.ts), que aplicam 18+, aceite de termos, status da
// conta e revogacao de sessao. Os endpoints de escrita do Better Auth
// contornariam essas regras, entao a rota expoe apenas leituras sem efeito
// colateral e o retorno do Google; o resto responde 404 (IC-13.1).
//
// `/callback/google` e o unico endpoint OAuth aberto: o Google redireciona o
// navegador para ele com `code` e `state`. O state e de uso unico e ligado ao
// navegador por cookie assinado; identidade nova vira pendencia de cadastro, e
// nunca conta, pelo gate `validateUserInfo` (IC-15). O POST do callback
// (`response_mode=form_post`) nao e usado e continua negado.
const ALLOWED_GET_PATHS = new Set([
  '/api/auth/ok',
  '/api/auth/get-session',
  '/api/auth/callback/google',
]);

function notFound() {
  return new Response(null, { status: 404 });
}

export async function GET(request: Request) {
  if (!ALLOWED_GET_PATHS.has(new URL(request.url).pathname)) {
    return notFound();
  }
  return getAuth().handler(request);
}

export async function POST() {
  return notFound();
}
