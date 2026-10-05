import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as requestActions from '@/modules/request/actions';
import { ContactRequestEntry } from './contact-request-entry';

vi.mock('@/modules/request/actions', () => ({ requestContactUnlock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

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

  it('usuario elegivel ve "Tenho interesse"; renderizar nao chama o servidor (F3-012)', () => {
    render(<ContactRequestEntry listingId={LISTING_ID} state="request_available" />);

    expect(screen.getByRole('button', { name: 'Tenho interesse' })).toBeInTheDocument();
    expect(screen.getByText(/gratuito e não gera cobrança/i)).toBeInTheDocument();
    expect(requestActions.requestContactUnlock).not.toHaveBeenCalled();
  });

  it('solicitacao aberta do proprio ator leva ao acompanhamento, sem nova solicitacao', () => {
    const own = '7c6b5a49-3827-4615-8a9b-0c1d2e3f4a5b';
    render(<ContactRequestEntry listingId={LISTING_ID} state="own_request" ownRequestId={own} />);

    expect(screen.getByRole('status')).toHaveTextContent(/já tem uma solicitação/i);
    expect(screen.getByRole('link', { name: 'Acompanhar minha solicitação' })).toHaveAttribute(
      'href',
      `/solicitacoes/${own}`,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    ['email_unverified', /confirme seu e-mail/i],
    ['account_restricted', /suspensa ou em exclusão/i],
    ['own_listing', /este anúncio é seu/i],
    ['no_slots', /vagas de solicitação deste anúncio estão ocupadas/i],
    ['not_accepting', /não está aceitando solicitações no momento/i],
  ] as const)('estado %s informa o motivo sem acao de solicitacao', (state, message) => {
    render(<ContactRequestEntry listingId={LISTING_ID} state={state} />);

    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('nunca exibe telefone ou WhatsApp do anunciante', () => {
    const { container } = render(
      <ContactRequestEntry listingId={LISTING_ID} state="request_available" />,
    );

    expect(container.textContent).not.toMatch(/\(?\d{2}\)?\s?9?\d{4}-?\d{4}/);
    expect(container.innerHTML).not.toMatch(/wa\.me|tel:/);
  });
});
