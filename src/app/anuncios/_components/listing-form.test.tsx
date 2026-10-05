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

const options: [string, string, string] = ['Um notebook', 'Um videogame', 'Uma câmera'];

describe('ListingForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Contato e endereco no texto livre (#86; listing-contract.md, 10.1 e 10.2).
  describe('contato e endereco no titulo e na descricao (#86)', () => {
    const CONTACT = 'Não inclua telefone, WhatsApp, e-mail ou endereço neste campo.';

    it('titulo e descricao orientam a nao incluir contato, pela descricao acessivel', () => {
      render(<ListingForm mode="create" />);
      for (const label of ['Título do anúncio', 'Descrição do item']) {
        expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
          /Não inclua telefone, WhatsApp, e-mail ou endereço/,
        );
      }
    });

    it('antecipa o erro nos dois campos, foca o titulo, preserva o texto e nao envia', async () => {
      render(<ListingForm mode="create" />);
      fill({ ...valid, title: 'Bike 11 98765-4321', description: 'Rua Augusta, 500' });

      await submit();

      const title = screen.getByLabelText('Título do anúncio');
      const description = screen.getByLabelText('Descrição do item');
      expect(title).toHaveAttribute('aria-invalid', 'true');
      expect(description).toHaveAttribute('aria-invalid', 'true');
      expect(title).toHaveAccessibleDescription(expect.stringContaining(CONTACT));
      expect(description).toHaveAccessibleDescription(expect.stringContaining(CONTACT));
      expect(document.activeElement).toBe(title);
      expect(createDraftListing).not.toHaveBeenCalled();
      expect(title).toHaveValue('Bike 11 98765-4321');
      expect(description).toHaveValue('Rua Augusta, 500');
    });

    it('a recusa do servidor aparece no campo, com o texto preservado para correcao', async () => {
      createDraftListing.mockResolvedValueOnce({
        success: false,
        reason: 'validation',
        error: 'Revise os campos destacados.',
        fieldErrors: { description: CONTACT },
      });
      render(<ListingForm mode="create" />);
      fill(valid);

      await submit();

      const description = screen.getByLabelText('Descrição do item');
      expect(description).toHaveAttribute('aria-invalid', 'true');
      expect(description).toHaveAccessibleDescription(expect.stringContaining(CONTACT));
      expect(document.activeElement).toBe(description);
      expect(description).toHaveValue('Em bom estado.');
    });

    it('edicao de conteudo gravado antes da regra abre com o campo marcado e o texto intacto', () => {
      render(
        <ListingForm
          mode="edit"
          listingId="22222222-2222-4222-8222-222222222222"
          requireTradeOptions
          initialValues={{
            title: 'Bicicleta aro 29',
            description: 'Chama no wa.me/5511987654321',
            city: 'Recife',
            state: 'PE',
            tradeOptions: options,
          }}
        />,
      );

      const description = screen.getByLabelText('Descrição do item');
      expect(description).toHaveAttribute('aria-invalid', 'true');
      expect(description).toHaveAccessibleDescription(expect.stringContaining(CONTACT));
      expect(description).toHaveValue('Chama no wa.me/5511987654321');
      expect(screen.getByLabelText('Título do anúncio')).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('alternativas de troca (#76)', () => {
    function fillOptions(values: string[]) {
      values.forEach((value, i) => {
        fireEvent.change(screen.getByLabelText(`Alternativa ${i + 1}`), { target: { value } });
      });
    }

    it('tres campos rotulados, agrupados e com a instrucao de que sao alternativas', () => {
      render(<ListingForm mode="create" />);
      const group = screen.getByRole('group', { name: 'O que você aceita em troca' });
      expect(group).toHaveAccessibleDescription(/três alternativas.*não precisa oferecer as três/);
      expect(group).toHaveAccessibleDescription(
        /Não inclua telefone, WhatsApp, e-mail ou endereço/,
      );
      for (const n of [1, 2, 3]) {
        const input = screen.getByLabelText(`Alternativa ${n}`);
        expect(input).toHaveAttribute('maxLength', '60');
        expect(input).not.toBeRequired();
      }
      expect(screen.queryByLabelText('Alternativa 4')).toBeNull();
    });

    it('rascunho salva com alternativas incompletas, na ordem dos campos', async () => {
      createDraftListing.mockResolvedValueOnce({ success: true, listingId: 'x' });
      render(<ListingForm mode="create" />);
      fill(valid);
      fillOptions(['', 'Um videogame', '']);

      await submit();

      expect(createDraftListing).toHaveBeenCalledWith({
        ...valid,
        state: 'PE',
        tradeOptions: ['', 'Um videogame', ''],
      });
    });

    it('anuncio publicado ou pausado exige as tres: foca a primeira vazia e nao envia', async () => {
      render(
        <ListingForm
          mode="edit"
          listingId="22222222-2222-4222-8222-222222222222"
          requireTradeOptions
          initialValues={{ ...valid, state: 'PE', tradeOptions: options }}
        />,
      );
      fillOptions(['Um notebook', '   ', '']);

      await submit();

      const second = screen.getByLabelText('Alternativa 2');
      expect(second).toHaveAttribute('aria-invalid', 'true');
      expect(second).toHaveAttribute('aria-describedby', 'tradeOption2-error');
      expect(screen.getByLabelText('Alternativa 3')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText('Alternativa 1')).not.toHaveAttribute('aria-invalid');
      expect(document.activeElement).toBe(second);
      expect(updateListing).not.toHaveBeenCalled();
      expect(screen.getByRole('group')).toHaveAccessibleDescription(/obrigatórias enquanto/);
    });

    it('erro do servidor numa alternativa aparece no campo, com valores preservados', async () => {
      updateListing.mockResolvedValueOnce({
        success: false,
        reason: 'validation',
        error: 'Revise os campos destacados.',
        fieldErrors: { tradeOption3: 'Informe esta alternativa de troca, com até 60 caracteres.' },
      });
      render(
        <ListingForm
          mode="edit"
          listingId="22222222-2222-4222-8222-222222222222"
          requireTradeOptions={false}
          initialValues={{ ...valid, state: 'PE', tradeOptions: options }}
        />,
      );

      await submit();

      const third = screen.getByLabelText('Alternativa 3');
      expect(third).toHaveAttribute('aria-invalid', 'true');
      expect(document.getElementById('tradeOption3-error')).toHaveTextContent('60 caracteres');
      expect(document.activeElement).toBe(third);
      expect(third).toHaveValue('Uma câmera');
    });
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
    expect(title).toHaveAttribute('aria-describedby', 'title-hint title-error');
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
        requireTradeOptions
        initialValues={{ ...valid, state: 'PE', tradeOptions: options }}
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

  it('edicao envia os quatro campos e as tres alternativas para o anuncio indicado', async () => {
    updateListing.mockResolvedValueOnce({ success: true });
    const id = '22222222-2222-4222-8222-222222222222';
    render(
      <ListingForm
        mode="edit"
        listingId={id}
        requireTradeOptions
        initialValues={{ ...valid, state: 'PE', tradeOptions: options }}
      />,
    );

    await submit();

    expect(updateListing).toHaveBeenCalledWith(id, {
      ...valid,
      state: 'PE',
      tradeOptions: options,
    });
    expect(push).toHaveBeenCalledWith('/anuncios');
  });
});
