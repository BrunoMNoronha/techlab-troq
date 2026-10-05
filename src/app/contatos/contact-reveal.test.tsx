import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactReveal, formatBrazilianPhone } from './contact-reveal';

// C-11, camada de componente (contact-release.md, CR-6.2 e CR-6.4; F3-010,
// #100): antes do gesto, o componente nao tem o numero em nenhuma propriedade
// nem no DOM; depois, ele vem SO da resposta da Server Action. Simuladas so as
// fronteiras: a action (a regra e do servidor, provada em
// contact-delivery.integration.test.ts) e o roteador. A prova de que o payload
// da pagina nao carrega o numero e HTTP (contact-delivery.http.integration.test.ts).

const revealContact = vi.fn();
vi.mock('./actions', () => ({ revealContact: (...a: unknown[]) => revealContact(...a) }));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const RELEASE = '22222222-2222-4222-8222-222222222222';
const PHONE = '+5511912345678';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ContactReveal', () => {
  it('antes do gesto: so o botao, nenhum digito e nenhuma chamada ao servidor', () => {
    const { container } = render(<ContactReveal contactReleaseId={RELEASE} />);
    expect(screen.getByRole('button', { name: 'Ver contato' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d{4}/);
    expect(container.querySelector('a')).toBeNull();
    expect(revealContact).not.toHaveBeenCalled();
  });

  it('a propriedade e so o id da autorizacao', () => {
    const element = <ContactReveal contactReleaseId={RELEASE} />;
    expect(Object.keys(element.props)).toEqual(['contactReleaseId']);
    expect(JSON.stringify(element.props)).not.toContain('91234');
  });

  it('depois do gesto: pede pelo id e mostra o numero e os atalhos montados no cliente', async () => {
    revealContact.mockResolvedValue({ success: true, phone: PHONE });
    render(<ContactReveal contactReleaseId={RELEASE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver contato' }));

    expect(await screen.findByText('(11) 91234-5678')).toBeInTheDocument();
    expect(revealContact).toHaveBeenCalledWith(RELEASE);
    expect(screen.getByRole('link', { name: 'Abrir no WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/5511912345678',
    );
    expect(screen.getByRole('link', { name: 'Ligar' })).toHaveAttribute('href', `tel:${PHONE}`);
  });

  it('negativa: a mensagem do servidor, sem numero', async () => {
    revealContact.mockResolvedValue({
      success: false,
      reason: 'unavailable',
      error: 'Contato indisponível.',
    });
    const { container } = render(<ContactReveal contactReleaseId={RELEASE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver contato' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Contato indisponível.');
    expect(container.querySelector('a')).toBeNull();
  });

  it('sem sessao: leva ao login', async () => {
    revealContact.mockResolvedValue({
      success: false,
      reason: 'login_required',
      error: 'Entre na sua conta para ver o contato.',
    });
    render(<ContactReveal contactReleaseId={RELEASE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver contato' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?motivo=sessao'));
  });

  it('formata celular e fixo', () => {
    expect(formatBrazilianPhone('+5511912345678')).toBe('(11) 91234-5678');
    expect(formatBrazilianPhone('+551132345678')).toBe('(11) 3234-5678');
  });
});
