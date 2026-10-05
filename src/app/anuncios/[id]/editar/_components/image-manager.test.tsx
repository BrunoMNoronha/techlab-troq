import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnerImageView } from '@/modules/media';
import { ImageManager } from './image-manager';

// Gestao de imagens na edicao (F2-008, #46). Simuladas so as fronteiras: as
// Server Actions (a regra e do servidor, provada nas suites de integracao) e o
// PUT ao R2.
const actions = {
  requestImageUpload: vi.fn(),
  requestImageReupload: vi.fn(),
  confirmImageUpload: vi.fn(),
  deleteListingImage: vi.fn(),
  reorderListingImages: vi.fn(),
  getOwnerListingImages: vi.fn(),
};
vi.mock('@/modules/media/actions', () => ({
  requestImageUpload: (...a: unknown[]) => actions.requestImageUpload(...a),
  requestImageReupload: (...a: unknown[]) => actions.requestImageReupload(...a),
  confirmImageUpload: (...a: unknown[]) => actions.confirmImageUpload(...a),
  deleteListingImage: (...a: unknown[]) => actions.deleteListingImage(...a),
  reorderListingImages: (...a: unknown[]) => actions.reorderListingImages(...a),
  getOwnerListingImages: (...a: unknown[]) => actions.getOwnerListingImages(...a),
}));

const putFile = vi.fn();
vi.mock('./upload-transport', () => ({
  putFile: (...a: unknown[]) => putFile(...a),
}));

const LISTING = '11111111-1111-4111-8111-111111111111';

function img(
  id: string,
  position: number,
  state: OwnerImageView['state'],
  failureMessage: string | null = null,
): OwnerImageView {
  return { id, position, state, width: null, height: null, failureMessage };
}

function file(name: string, type: string, size = 2048): File {
  return new File([new Uint8Array(size)], name, { type });
}

function selectFiles(files: File[]) {
  const input = screen.getByLabelText('Adicionar fotos');
  fireEvent.change(input, { target: { files } });
}

function authorization(imageId: string, position: number) {
  return {
    success: true,
    data: {
      imageId,
      position,
      uploadUrl: `https://r2.invalid/${imageId}`,
      uploadHeaders: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' },
      expiresInSeconds: 900,
    },
  };
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  putFile.mockReset();
  actions.getOwnerListingImages.mockResolvedValue({ success: true, data: { images: [] } });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ImageManager', () => {
  it('seleção válida: reserva com tipo e tamanho, PUT com progresso, confirmação e processamento', async () => {
    let progress: (f: number) => void = () => {};
    let finishPut: (r: { status: number }) => void = () => {};
    actions.requestImageUpload.mockResolvedValue(authorization('img-1', 1));
    putFile.mockImplementation((_url, _file, _headers, onProgress) => {
      progress = onProgress;
      return new Promise((r) => (finishPut = r));
    });
    actions.confirmImageUpload.mockResolvedValue({ success: true, data: { outcome: 'queued' } });
    actions.getOwnerListingImages.mockResolvedValue({
      success: true,
      data: { images: [img('img-1', 1, 'processing')] },
    });
    render(<ImageManager listingId={LISTING} initialImages={[]} />);

    await act(async () => selectFiles([file('foto.jpg', 'image/jpeg', 4096)]));
    expect(actions.requestImageUpload).toHaveBeenCalledWith(LISTING, 'image/jpeg', 4096);
    expect(putFile).toHaveBeenCalledWith(
      'https://r2.invalid/img-1',
      expect.any(File),
      { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' },
      expect.any(Function),
    );

    await act(async () => progress(0.5));
    const item = screen.getByRole('listitem', { name: 'Imagem 1 (capa)' });
    expect(within(item).getByText('Estado: Enviando: 50%')).toBeInTheDocument();
    expect(
      within(item).getByRole('progressbar', { name: 'Envio da Imagem 1 (capa)' }),
    ).toHaveAttribute('aria-valuenow', '50');

    await act(async () => finishPut({ status: 200 }));
    await waitFor(() => expect(actions.confirmImageUpload).toHaveBeenCalledWith('img-1'));
    await waitFor(() => expect(within(item).getByText('Estado: Processando')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Imagem 1 enviada. Processando.');
  });

  it('acompanha o processamento até a imagem ficar pronta', async () => {
    vi.useFakeTimers();
    actions.getOwnerListingImages.mockResolvedValue({
      success: true,
      data: { images: [img('img-1', 1, 'ready')] },
    });
    render(<ImageManager listingId={LISTING} initialImages={[img('img-1', 1, 'processing')]} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(actions.getOwnerListingImages).toHaveBeenCalledWith(LISTING);
    expect(screen.getByText('Estado: Pronta')).toBeInTheDocument();
  });

  it('formato não aceito: erro anunciado e focado, nada é reservado', async () => {
    render(<ImageManager listingId={LISTING} initialImages={[]} />);

    await act(async () => selectFiles([file('anim.gif', 'image/gif')]));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('formato não suportado');
    expect(document.activeElement).toBe(alert);
    expect(actions.requestImageUpload).not.toHaveBeenCalled();
  });

  it('arquivo acima de 10 MB é recusado antes de reservar', async () => {
    render(<ImageManager listingId={LISTING} initialImages={[]} />);
    await act(async () => selectFiles([file('grande.jpg', 'image/jpeg', 10 * 1024 * 1024 + 1)]));
    expect(screen.getByRole('alert')).toHaveTextContent('passa de 10 MB');
    expect(actions.requestImageUpload).not.toHaveBeenCalled();
  });

  it('sétima imagem: com seis o seletor fica desabilitado', () => {
    const six = Array.from({ length: 6 }, (_, i) => img(`img-${i}`, i + 1, 'ready'));
    render(<ImageManager listingId={LISTING} initialImages={six} />);
    expect(screen.getByLabelText('Adicionar fotos')).toBeDisabled();
    expect(screen.getByText('Limite de 6 imagens atingido.')).toBeInTheDocument();
  });

  it('sétima imagem na mesma seleção: para no limite, sem pedir a sétima', async () => {
    const five = Array.from({ length: 5 }, (_, i) => img(`img-${i}`, i + 1, 'ready'));
    actions.requestImageUpload.mockResolvedValue(authorization('img-6', 6));
    putFile.mockResolvedValue({ status: 200 });
    actions.confirmImageUpload.mockResolvedValue({ success: true, data: { outcome: 'queued' } });
    render(<ImageManager listingId={LISTING} initialImages={five} />);

    await act(async () => selectFiles([file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')]));

    expect(actions.requestImageUpload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('máximo de 6 imagens');
  });

  it('recusa do servidor (limite) é mostrada com a mensagem do servidor', async () => {
    actions.requestImageUpload.mockResolvedValue({
      success: false,
      reason: 'limit_reached',
      error: 'O anúncio já tem o máximo de 6 imagens.',
    });
    render(<ImageManager listingId={LISTING} initialImages={[]} />);
    await act(async () => selectFiles([file('a.jpg', 'image/jpeg')]));
    expect(screen.getByRole('alert')).toHaveTextContent('O anúncio já tem o máximo de 6 imagens.');
    expect(putFile).not.toHaveBeenCalled();
  });

  it('erro no PUT: estado de falha, alerta e nova tentativa com a mesma autorização', async () => {
    actions.requestImageUpload.mockResolvedValue(authorization('img-1', 1));
    putFile.mockResolvedValueOnce({ status: 0 }).mockResolvedValueOnce({ status: 200 });
    actions.confirmImageUpload.mockResolvedValue({ success: true, data: { outcome: 'queued' } });
    render(<ImageManager listingId={LISTING} initialImages={[]} />);

    await act(async () => selectFiles([file('a.jpg', 'image/jpeg')]));

    const item = screen.getByRole('listitem', { name: 'Imagem 1 (capa)' });
    expect(within(item).getByText('Estado: Envio falhou')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('O envio da imagem 1 falhou.');
    expect(actions.confirmImageUpload).not.toHaveBeenCalled();

    await act(async () =>
      fireEvent.click(within(item).getByRole('button', { name: 'Tentar de novo' })),
    );
    expect(putFile).toHaveBeenCalledTimes(2);
    expect(actions.confirmImageUpload).toHaveBeenCalledWith('img-1');
    expect(actions.requestImageUpload).toHaveBeenCalledTimes(1);
  });

  it('PUT repetido que já tinha criado o objeto (412) segue para a confirmação', async () => {
    actions.requestImageUpload.mockResolvedValue(authorization('img-1', 1));
    putFile.mockResolvedValue({ status: 412 });
    actions.confirmImageUpload.mockResolvedValue({ success: true, data: { outcome: 'queued' } });
    render(<ImageManager listingId={LISTING} initialImages={[]} />);
    await act(async () => selectFiles([file('a.jpg', 'image/jpeg')]));
    expect(actions.confirmImageUpload).toHaveBeenCalledWith('img-1');
  });

  it('confirmação falha: mensagem do servidor, sem perder a imagem da lista', async () => {
    actions.requestImageUpload.mockResolvedValue(authorization('img-1', 1));
    putFile.mockResolvedValue({ status: 200 });
    actions.confirmImageUpload.mockResolvedValue({
      success: false,
      reason: 'upload_not_found',
      error: 'O arquivo ainda não chegou. Envie novamente.',
    });
    render(<ImageManager listingId={LISTING} initialImages={[]} />);
    await act(async () => selectFiles([file('a.jpg', 'image/jpeg')]));
    expect(screen.getByRole('alert')).toHaveTextContent('O arquivo ainda não chegou.');
    expect(screen.getByRole('listitem', { name: 'Imagem 1 (capa)' })).toBeInTheDocument();
  });

  it('falha permanente mostra a mensagem do código e permite reenviar', async () => {
    const failed = img('img-1', 1, 'failed', 'A imagem precisa ter pelo menos 320 × 320 pixels.');
    actions.requestImageReupload.mockResolvedValue(authorization('img-1', 1));
    putFile.mockResolvedValue({ status: 200 });
    actions.confirmImageUpload.mockResolvedValue({ success: true, data: { outcome: 'queued' } });
    render(<ImageManager listingId={LISTING} initialImages={[failed]} />);

    const item = screen.getByRole('listitem', { name: 'Imagem 1 (capa)' });
    expect(within(item).getByText('Estado: Falhou')).toBeInTheDocument();
    expect(
      within(item).getByText('A imagem precisa ter pelo menos 320 × 320 pixels.'),
    ).toBeInTheDocument();

    fireEvent.click(within(item).getByRole('button', { name: 'Reenviar Imagem 1 (capa)' }));
    await act(async () =>
      fireEvent.change(screen.getByLabelText('Escolher arquivo para reenviar'), {
        target: { files: [file('nova.png', 'image/png', 5000)] },
      }),
    );

    expect(actions.requestImageReupload).toHaveBeenCalledWith('img-1', 'image/png', 5000);
    expect(actions.confirmImageUpload).toHaveBeenCalledWith('img-1');
    expect(actions.requestImageUpload).not.toHaveBeenCalled();
  });

  it('remover pede confirmação e só então chama o servidor', async () => {
    actions.deleteListingImage.mockResolvedValue({ success: true });
    render(
      <ImageManager
        listingId={LISTING}
        initialImages={[img('img-1', 1, 'ready'), img('img-2', 2, 'ready')]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remover Imagem 2' }));
    expect(actions.deleteListingImage).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' })),
    );

    expect(actions.deleteListingImage).toHaveBeenCalledWith('img-2');
    expect(screen.getByRole('status')).toHaveTextContent('Imagem removida.');
  });

  it('remoção recusada (última pronta de anúncio publicado) é anunciada', async () => {
    actions.deleteListingImage.mockResolvedValue({
      success: false,
      reason: 'last_ready_image',
      error: 'Um anúncio publicado precisa manter pelo menos uma imagem pronta.',
    });
    render(<ImageManager listingId={LISTING} initialImages={[img('img-1', 1, 'ready')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Imagem 1 (capa)' }));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' })),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('pelo menos uma imagem pronta');
  });

  it('reordenar por teclado envia a lista completa com a troca; a capa é a primeira', async () => {
    actions.reorderListingImages.mockResolvedValue({ success: true });
    render(
      <ImageManager
        listingId={LISTING}
        initialImages={[
          img('img-1', 1, 'ready'),
          img('img-2', 2, 'ready'),
          img('img-3', 3, 'processing'),
        ]}
      />,
    );
    expect(screen.getAllByRole('listitem')[0]).toHaveAccessibleName('Imagem 1 (capa)');
    expect(screen.getByRole('button', { name: 'Mover Imagem 1 (capa) para cima' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mover Imagem 3 para baixo' })).toBeDisabled();

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Mover Imagem 1 (capa) para baixo' })),
    );

    expect(actions.reorderListingImages).toHaveBeenCalledWith(LISTING, ['img-2', 'img-1', 'img-3']);
    expect(screen.getByRole('status')).toHaveTextContent('Imagem movida para a posição 2.');
  });
});
