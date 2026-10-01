import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as contactModule from '@/modules/contact';
import * as contactActions from '@/modules/contact/actions';
import * as identityModule from '@/modules/identity';
import { ContactForm } from './contact-form';
import ContaPage from './page';

// /conta (F3-002, #92): a area privada informa SE ha contato e permite
// cadastrar ou substituir, sem nunca exibir digitos (contact-release.md, CR-2.5).
const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  useRouter: () => ({ push, refresh }),
}));

vi.mock('@/modules/identity', () => ({
  validateSession: vi.fn(),
  logoutUser: vi.fn(),
  loginRedirectPath: (reason?: string) => `/login?motivo=${reason ?? 'sessao'}`,
}));
vi.mock('@/modules/contact', () => ({ getOwnContactStatus: vi.fn() }));
vi.mock('@/modules/contact/actions', () => ({ registerOwnContact: vi.fn() }));

const validateSession = vi.mocked(identityModule.validateSession);
const getOwnContactStatus = vi.mocked(contactModule.getOwnContactStatus);
const registerOwnContact = vi.mocked(contactActions.registerOwnContact);

const RAW = '(11) 91234-5678';

function page() {
  return ContaPage({ searchParams: Promise.resolve({}) });
}

beforeEach(() => {
  vi.clearAllMocks();
  validateSession.mockResolvedValue({
    user: {
      id: 'u',
      email: 'u@example.test',
      displayName: 'U',
      emailVerified: true,
      status: 'active',
    },
    isValid: true,
  });
});

describe('/conta — contato do anunciante', () => {
  it('sem sessao valida redireciona e nao consulta o contato', async () => {
    validateSession.mockResolvedValueOnce({ user: null, isValid: false, reason: 'no_session' });
    await expect(page()).rejects.toThrow('REDIRECT /login');
    expect(getOwnContactStatus).not.toHaveBeenCalled();
  });

  it('sem contato: orienta o cadastro', async () => {
    getOwnContactStatus.mockResolvedValueOnce({ hasContact: false });

    render(await page());

    expect(screen.getByText('Você ainda não cadastrou um contato.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cadastrar contato' })).toBeTruthy();
  });

  it('com contato: informa que existe e oferece substituir, sem valor no campo', async () => {
    getOwnContactStatus.mockResolvedValueOnce({ hasContact: true });

    const { container } = render(await page());

    expect(screen.getByText(/Você tem um contato cadastrado/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Substituir contato' })).toBeTruthy();
    expect(screen.getByLabelText('Novo telefone ou WhatsApp', { selector: 'input' })).toHaveValue(
      '',
    );
    // Nenhum digito de telefone na pagina (o e-mail e o nome sinteticos nao tem digitos).
    expect(container.textContent).not.toMatch(/\d{4}/);
  });
});

describe('ContactForm — cadastro e substituicao', () => {
  it('erro de campo: anunciado, associado ao campo e com foco no campo', async () => {
    registerOwnContact.mockResolvedValueOnce({
      success: false,
      reason: 'validation',
      error: 'Revise o campo destacado.',
      fieldErrors: {
        phone: 'Informe um telefone brasileiro com DDD, por exemplo (11) 91234-5678.',
      },
    });
    render(<ContactForm hasContact={false} />);
    const input = screen.getByLabelText('Telefone ou WhatsApp', { selector: 'input' });

    fireEvent.change(input, { target: { value: 'abc' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cadastrar contato' }));
    });

    expect(registerOwnContact).toHaveBeenCalledWith({ phone: 'abc' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain('contato-telefone-erro');
    expect(document.getElementById('contato-telefone-erro')).toHaveTextContent(/DDD/);
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('sucesso: limpa o campo, confirma sem o numero e atualiza a pagina', async () => {
    registerOwnContact.mockResolvedValueOnce({ success: true, hasContact: true });
    const { container } = render(<ContactForm hasContact={false} />);
    const input = screen.getByLabelText('Telefone ou WhatsApp', { selector: 'input' });

    fireEvent.change(input, { target: { value: RAW } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cadastrar contato' }));
    });

    expect(input).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent(/Contato salvo/);
    expect(container.textContent).not.toMatch(/\d{4}/);
    expect(refresh).toHaveBeenCalled();
  });

  it('sessao perdida leva ao login', async () => {
    registerOwnContact.mockResolvedValueOnce({
      success: false,
      reason: 'login_required',
      error: 'Entre na sua conta para cadastrar seu contato.',
    });
    render(<ContactForm hasContact />);

    fireEvent.change(screen.getByLabelText('Novo telefone ou WhatsApp', { selector: 'input' }), {
      target: { value: RAW },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Substituir contato' }));
    });

    expect(push).toHaveBeenCalledWith('/login?motivo=sessao');
  });
});
