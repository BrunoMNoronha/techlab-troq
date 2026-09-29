import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ListingForm } from './listing-form';

// Formulario de anuncio (#44, D-9): erro por campo associado e anunciado, foco
// no primeiro erro, valores preservados e sem envio duplicado.
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const createDraftListing = vi.fn();
const updateListing = vi.fn();
vi.mock('@/modules/listing/actions', () => ({
  createDraftListing: (...args: unknown[]) => createDraftListing(...args),
  updateListing: (...args: unknown[]) => updateListing(...args),
}));

function fill(values: Partial<Record<'title' | 'description' | 'city' | 'state', string>>) {
  const labels = {
    title: 'Título do anúncio',
    description: 'Descrição do item',
    city: 'Cidade',
    state: 'UF',
  } as const;
  for (const [field, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(labels[field as keyof typeof labels]), {
      target: { value },
    });
  }
}

async function submit() {
  await act(async () => {
    fireEvent.submit(screen.getByLabelText('Cidade').closest('form')!);
  });
}

const valid = {
  title: 'Bicicleta aro 29',
  description: 'Em bom estado.',
  city: 'Recife',
  state: 'pe',
};

describe('ListingForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('todos os campos tem rotulo associado', () => {
    render(<ListingForm mode="create" />);
    for (const label of ['Título do anúncio', 'Descrição do item', 'Cidade', 'UF']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('erro local marca o campo, associa a mensagem, foca o primeiro e nao envia', async () => {
    render(<ListingForm mode="create" />);
    fill({ ...valid, title: 'Bike', city: '   ' });

    await submit();

    const title = screen.getByLabelText('Título do anúncio');
    const city = screen.getByLabelText('Cidade');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAttribute('aria-describedby', 'title-error');
    expect(document.getElementById('title-error')).toHaveTextContent('entre 5 e 60');
    expect(city).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Descrição do item')).not.toHaveAttribute('aria-invalid');
    expect(document.activeElement).toBe(title);
    expect(screen.getByRole('alert')).toHaveTextContent('Revise os campos destacados.');
    expect(createDraftListing).not.toHaveBeenCalled();
    // Nada do que foi digitado se perde.
    expect(title).toHaveValue('Bike');
    expect(screen.getByLabelText('Descrição do item')).toHaveValue('Em bom estado.');
  });

  it('erro de campo devolvido pelo servidor e exibido no campo, com valores preservados', async () => {
    createDraftListing.mockResolvedValueOnce({
      success: false,
      reason: 'validation',
      error: 'Revise os campos destacados.',
      fieldErrors: { state: 'Use duas letras, como SP.' },
    });
    render(<ListingForm mode="create" />);
    fill(valid);

    await submit();

    const uf = screen.getByLabelText('UF');
    expect(uf).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById('state-error')).toHaveTextContent('duas letras');
    expect(document.activeElement).toBe(uf);
    expect(uf).toHaveValue('PE');
    expect(push).not.toHaveBeenCalled();
  });

  it('erro sem campo vai para o aviso geral, que recebe o foco', async () => {
    updateListing.mockResolvedValueOnce({
      success: false,
      reason: 'not_editable',
      error: 'Anúncios encerrados ou removidos não podem ser editados.',
    });
    render(
      <ListingForm
        mode="edit"
        listingId="22222222-2222-4222-8222-222222222222"
        initialValues={{ ...valid, state: 'PE' }}
      />,
    );
    fill({ title: 'Bicicleta aro 29 revisada' });

    await submit();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('não podem ser editados');
    expect(document.activeElement).toBe(alert);
    expect(screen.getByLabelText('Título do anúncio')).toHaveValue('Bicicleta aro 29 revisada');
  });

  it('falha de rede nao apaga o formulario', async () => {
    createDraftListing.mockRejectedValueOnce(new Error('offline'));
    render(<ListingForm mode="create" />);
    fill(valid);

    await submit();

    expect(screen.getByRole('alert')).toHaveTextContent('Verifique sua conexão');
    expect(screen.getByLabelText('Título do anúncio')).toHaveValue(valid.title);
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeEnabled();
  });

  it('bloqueia envio duplicado enquanto a operacao esta em andamento', async () => {
    let resolve: (v: unknown) => void = () => {};
    createDraftListing.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<ListingForm mode="create" />);
    fill(valid);

    await submit();
    await submit();

    expect(createDraftListing).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled();

    await act(async () => resolve({ success: true, listingId: 'x' }));
    expect(push).toHaveBeenCalledWith('/anuncios');
  });

  it('edicao envia os quatro campos para o anuncio indicado', async () => {
    updateListing.mockResolvedValueOnce({ success: true });
    const id = '22222222-2222-4222-8222-222222222222';
    render(<ListingForm mode="edit" listingId={id} initialValues={{ ...valid, state: 'PE' }} />);

    await submit();

    expect(updateListing).toHaveBeenCalledWith(id, { ...valid, state: 'PE' });
    expect(push).toHaveBeenCalledWith('/anuncios');
  });
});
