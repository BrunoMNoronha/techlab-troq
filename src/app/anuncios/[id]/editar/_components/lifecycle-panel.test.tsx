import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LISTING_COMPLIANCE_DECLARATION } from '@/modules/listing/compliance';
import { LifecyclePanel } from './lifecycle-panel';

// Situacao do anuncio na edicao (F2-010, #48). Simuladas so as fronteiras: as
// Server Actions (a regra e do servidor, provada em
// listing-lifecycle.integration.test.ts) e o roteador.
const actions = {
  publishListing: vi.fn(),
  discardDraft: vi.fn(),
  pauseListing: vi.fn(),
  reactivateListing: vi.fn(),
  closeListing: vi.fn(),
};
vi.mock('@/modules/listing/actions', () => ({
  publishListing: (...a: unknown[]) => actions.publishListing(...a),
  discardDraft: (...a: unknown[]) => actions.discardDraft(...a),
  pauseListing: (...a: unknown[]) => actions.pauseListing(...a),
  reactivateListing: (...a: unknown[]) => actions.reactivateListing(...a),
  closeListing: (...a: unknown[]) => actions.closeListing(...a),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const LISTING = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LifecyclePanel', () => {
  it('rascunho: aceite com o texto versionado e link para a politica', () => {
    render(<LifecyclePanel listingId={LISTING} status="draft" readyImageCount={1} />);
    const checkbox = screen.getByLabelText(LISTING_COMPLIANCE_DECLARATION);
    expect(checkbox).not.toBeChecked();
    const link = screen.getByRole('link', { name: /Política de itens proibidos/ });
    expect(link).toHaveAttribute('href', '/politica/itens-proibidos');
  });

  it('publica enviando o aceite marcado e atualiza a pagina', async () => {
    actions.publishListing.mockResolvedValue({ success: true, status: 'published', changed: true });
    render(<LifecyclePanel listingId={LISTING} status="draft" readyImageCount={1} />);
    fireEvent.click(screen.getByLabelText(LISTING_COMPLIANCE_DECLARATION));
    fireEvent.click(screen.getByRole('button', { name: 'Publicar anúncio' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(actions.publishListing).toHaveBeenCalledWith(LISTING, true);
    expect(screen.getByRole('status')).toHaveTextContent('Anúncio publicado');
  });

  it('recusa do servidor vira alerta focado, com os campos a corrigir', async () => {
    actions.publishListing.mockResolvedValue({
      success: false,
      reason: 'validation',
      error: 'Revise os campos do anúncio antes de publicar.',
      fieldErrors: { state: 'UF inválida.' },
    });
    render(<LifecyclePanel listingId={LISTING} status="draft" readyImageCount={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publicar anúncio' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Campos a corrigir: UF.');
    expect(alert).toHaveFocus();
    expect(actions.publishListing).toHaveBeenCalledWith(LISTING, false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('descartar exige confirmacao explicita; cancelar nao chama o servidor e devolve o foco', () => {
    render(<LifecyclePanel listingId={LISTING} status="draft" readyImageCount={0} />);
    const opener = screen.getByRole('button', { name: 'Descartar rascunho' });
    fireEvent.click(opener);
    const dialog = screen.getByRole('group', { name: 'Descartar este rascunho?' });
    expect(dialog).toHaveAccessibleDescription(/não pode ser desfeita/);
    expect(screen.getByRole('heading', { name: 'Descartar este rascunho?' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(actions.discardDraft).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Descartar rascunho' })).toHaveFocus();
  });

  it('confirmar o descarte chama o servidor', async () => {
    actions.discardDraft.mockResolvedValue({ success: true, status: 'closed', changed: true });
    render(<LifecyclePanel listingId={LISTING} status="draft" readyImageCount={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar rascunho' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, descartar rascunho' }));
    await waitFor(() => expect(actions.discardDraft).toHaveBeenCalledWith(LISTING));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('publicado: pausar direto; encerrar so depois da confirmacao', async () => {
    actions.pauseListing.mockResolvedValue({ success: true, status: 'paused', changed: true });
    actions.closeListing.mockResolvedValue({ success: true, status: 'closed', changed: true });
    render(<LifecyclePanel listingId={LISTING} status="published" readyImageCount={1} />);
    expect(screen.queryByRole('button', { name: /Reativar/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar anúncio' }));
    expect(actions.closeListing).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, encerrar anúncio' }));
    await waitFor(() => expect(actions.closeListing).toHaveBeenCalledWith(LISTING));
  });

  it('pausado: oferece reativar e encerrar, nao pausar', async () => {
    actions.reactivateListing.mockResolvedValue({
      success: false,
      reason: 'no_ready_image',
      error: 'O anúncio precisa de pelo menos uma imagem pronta para ficar público.',
    });
    render(<LifecyclePanel listingId={LISTING} status="paused" readyImageCount={0} />);
    expect(screen.queryByRole('button', { name: /Pausar/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reativar anúncio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('imagem pronta');
  });

  it('bloqueia envio duplicado enquanto a acao esta em andamento', async () => {
    let resolve!: (v: unknown) => void;
    actions.pauseListing.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<LifecyclePanel listingId={LISTING} status="published" readyImageCount={1} />);
    const button = screen.getByRole('button', { name: 'Pausar anúncio' });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Pausando…' }));
    expect(actions.pauseListing).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Encerrar anúncio' })).toBeDisabled();
    resolve({ success: true, status: 'paused', changed: true });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('estado mudou em outra aba: mostra o erro e atualiza a pagina', async () => {
    actions.pauseListing.mockResolvedValue({
      success: false,
      reason: 'invalid_transition',
      error: 'Esta ação não é possível no estado atual do anúncio. Atualize a página.',
      status: 'closed',
    });
    render(<LifecyclePanel listingId={LISTING} status="published" readyImageCount={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar anúncio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('estado atual');
    expect(refresh).toHaveBeenCalled();
  });
});
