import { timingSafeEqual } from 'node:crypto';

// Autorizacao dos endpoints de trabalho periodico (ADR-0006, decisao 9;
// environments.md, secao 5.7). O agendador envia
// `Authorization: Bearer <CRON_SECRET>`; nenhuma sessao de usuario substitui o
// segredo. Falha fechada: sem segredo configurado, nada executa. Comparacao em
// tempo constante; a resposta de recusa nao revela se o segredo existe.

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization');
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function cronUnauthorized(): Response {
  return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}
