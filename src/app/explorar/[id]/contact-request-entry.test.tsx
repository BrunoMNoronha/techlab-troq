import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContactRequestEntry } from './contact-request-entry';

const LISTING_ID = '0b6f2d9e-3c4a-4e8b-9f1a-2d3c4b5a6e7f';

describe('ContactRequestEntry (#59)', () => {
  it('visitante e orientado a entrar, com retorno ao anuncio de origem', () => {
    render(<ContactRequestEntry listingId={LISTING_ID} state="login_required" />);

    expect(screen.getByRole('link', { name: 'Entrar para solicitar' })).toHaveAttribute(
      'href',
      `/login?motivo=solicitar&next=%2Fexplorar%2F${LISTING_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/cadastro');
    expect(screen.getByText(/não gera cobrança nem solicitação/i)).toBeInTheDocument();
  });

  it('usuario elegivel ve indisponibilidade, sem botao que simule solicitacao ou cobranca', () => {
    render(<ContactRequestEntry listingId={LISTING_ID} state="request_unavailable" />);

    expect(screen.getByRole('status')).toHaveTextContent(/ainda não está disponível/i);
    expect(screen.getByRole('status')).toHaveTextContent(/nada foi cobrado/i);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it.each([
    ['email_unverified', /confirme seu e-mail/i],
    ['account_restricted', /suspensa ou em exclusão/i],
    ['own_listing', /este anúncio é seu/i],
  ] as const)('estado %s informa o motivo sem acao de solicitacao', (state, message) => {
    render(<ContactRequestEntry listingId={LISTING_ID} state={state} />);

    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('nunca exibe telefone ou WhatsApp do anunciante', () => {
    const { container } = render(
      <ContactRequestEntry listingId={LISTING_ID} state="request_unavailable" />,
    );

    expect(container.textContent).not.toMatch(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/);
    expect(container.innerHTML).not.toMatch(/wa\.me|tel:/);
  });
});
