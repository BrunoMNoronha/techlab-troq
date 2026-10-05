import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ListingForm } from './listing-form';

// Seletor de UF do formulario de anuncio (#90).
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

const createDraftListing = vi.fn();
const updateListing = vi.fn();
vi.mock('@/modules/listing/actions', () => ({
  createDraftListing: (...args: unknown[]) => createDraftListing(...args),
  updateListing: (...args: unknown[]) => updateListing(...args),
}));

const LISTING_ID = '22222222-2222-4222-8222-222222222222';
const content = { title: 'Bicicleta aro 29', description: 'Em bom estado.', city: 'Recife' };
const options: [string, string, string] = ['Um notebook', 'Um videogame', 'Uma câmera'];

function ufSelect() {
  return screen.getByRole('combobox', { name: 'UF' }) as HTMLSelectElement;
}

function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function submit() {
  await act(async () => {
    fireEvent.submit(screen.getByLabelText('Cidade').closest('form')!);
  });
}

function renderEdit(state: string) {
  render(
    <ListingForm
      mode="edit"
      listingId={LISTING_ID}
      requireTradeOptions
      initialValues={{ ...content, state, tradeOptions: options }}
    />,
  );
}

describe('ListingForm — UF por lista (#90)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cadastro lista as 27 UFs por nome e sigla e comeca sem UF escolhida', () => {
    render(<ListingForm mode="create" />);
    const select = ufSelect();
    const opts = within(select).getAllByRole('option') as HTMLOptionElement[];

    expect(opts[0]).toHaveTextContent('Selecione o estado');
    expect(opts[0].value).toBe('');
    expect(opts.slice(1)).toHaveLength(27);
    expect(new Set(opts.slice(1).map((o) => o.value)).size).toBe(27);
    expect(within(select).getByRole('option', { name: 'Distrito Federal (DF)' })).toHaveValue('DF');
    expect(select).toHaveValue('');
  });

  it('sem UF escolhida, o erro fica no seletor e nada e enviado', async () => {
    render(<ListingForm mode="create" />);
    change('Título do anúncio', content.title);
    change('Descrição do item', content.description);
    change('Cidade', content.city);

    await submit();

    const select = ufSelect();
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Selecione o estado.');
    expect(document.activeElement).toBe(select);
    expect(createDraftListing).not.toHaveBeenCalled();
  });

  it('envia a sigla escolhida e preserva a escolha quando outro campo falha', async () => {
    createDraftListing.mockResolvedValueOnce({ success: true, listingId: 'x' });
    render(<ListingForm mode="create" />);
    change('Título do anúncio', 'Bike');
    change('Descrição do item', content.description);
    change('Cidade', content.city);
    fireEvent.change(ufSelect(), { target: { value: 'SP' } });

    await submit();

    expect(createDraftListing).not.toHaveBeenCalled();
    expect(ufSelect()).toHaveValue('SP');
    expect(ufSelect()).not.toHaveAttribute('aria-invalid');

    change('Título do anúncio', content.title);
    await submit();

    expect(createDraftListing).toHaveBeenCalledWith({
      ...content,
      state: 'SP',
      tradeOptions: ['', '', ''],
    });
  });

  it('edicao abre com a UF gravada selecionada e a reenvia', async () => {
    updateListing.mockResolvedValueOnce({ success: true });
    renderEdit('PE');

    expect(ufSelect()).toHaveValue('PE');
    await submit();

    expect(updateListing).toHaveBeenCalledWith(LISTING_ID, {
      ...content,
      state: 'PE',
      tradeOptions: options,
    });
  });

  it('UF legada invalida: nenhuma UF aparece escolhida, ha aviso e salvar exige escolha', async () => {
    updateListing.mockResolvedValueOnce({ success: true });
    renderEdit('ZZ');

    const select = ufSelect();
    expect(select).toHaveValue('');
    expect(select.selectedOptions[0]).toHaveTextContent('Selecione o estado');
    expect(select).toHaveAccessibleDescription(/“ZZ”.*Selecione o estado para salvar/);

    await submit();

    expect(updateListing).not.toHaveBeenCalled();
    expect(ufSelect()).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(ufSelect());

    fireEvent.change(ufSelect(), { target: { value: 'RN' } });
    expect(screen.queryByText(/“ZZ”/)).toBeNull();
    await submit();

    expect(updateListing).toHaveBeenCalledWith(LISTING_ID, {
      ...content,
      state: 'RN',
      tradeOptions: options,
    });
  });
});
