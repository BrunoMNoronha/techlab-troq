// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GET } from './route';

// Traducao do retorno de erro do Google (IC-15.6): so motivos de lista fechada,
// destino interno validado e nunca o texto do provedor.
function follow(query: string): string | null {
  const res = GET(new Request(`http://localhost:3000/login/google?${query}`));
  expect(res.status).toBe(303);
  expect(res.headers.get('cache-control')).toBe('no-store');
  return res.headers.get('location');
}

describe('rota /login/google', () => {
  it('identidade nova segue para a conclusao do cadastro com o destino interno', () => {
    expect(follow('error=google_signup_required&next=%2Fanuncios%2Fnovo')).toBe(
      '/cadastro/google?next=%2Fanuncios%2Fnovo',
    );
    expect(follow('error=google_signup_required')).toBe('/cadastro/google');
  });

  it.each([
    ['access_denied', 'google_cancelado'],
    ['account_not_linked', 'google_conta_existente'],
    ['google_email_not_verified', 'google_email_nao_verificado'],
    ['ACCOUNT_NOT_ACTIVE', 'bloqueada'],
    ['state_mismatch', 'google_falha'],
    ['invalid_code', 'google_falha'],
    ['codigo_desconhecido<script>', 'google_falha'],
  ])('erro %s vira o motivo %s', (error, reason) => {
    expect(follow(`error=${encodeURIComponent(error)}`)).toBe(`/login?motivo=${reason}`);
  });

  it('descarta destino externo e nunca repassa error_description', () => {
    const location = follow(
      'error=access_denied&error_description=texto%20do%20provedor&next=https%3A%2F%2Fevil.example',
    );
    expect(location).toBe('/login?motivo=google_cancelado');
    expect(follow('error=access_denied&next=%2F%2Fevil.example')).toBe(
      '/login?motivo=google_cancelado',
    );
  });

  it.each([
    ['access_denied', 'cancelado'],
    ['email_does_not_match', 'email_diferente'],
    ['account_already_linked_to_different_user', 'ja_vinculada'],
    ['unable_to_link_account', 'falha'],
    ['', 'falha'],
  ])('vinculacao: erro "%s" volta a /conta com %s', (error, reason) => {
    expect(follow(`fluxo=vincular&error=${error}`)).toBe(`/conta?google=${reason}`);
  });
});
