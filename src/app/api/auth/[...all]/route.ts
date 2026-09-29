import { getAuth } from '@/modules/identity/auth';

// Cadastro, login e logout do TROQ sao Server Actions (src/modules/identity/
// actions.ts), que aplicam 18+, aceite de termos, status da conta e revogacao de
// sessao. Os endpoints de escrita do Better Auth contornariam essas regras, entao
// a rota expoe apenas leituras sem efeito colateral; o resto responde 404.
const ALLOWED_GET_PATHS = new Set(['/api/auth/ok', '/api/auth/get-session']);

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
