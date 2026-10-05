import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as requestActions from '@/modules/request/actions';
import { PixPanel } from './pix-panel';

// Tela do Pix (F3-012, #102). As instrucoes chegam so pela Server Action, que
// autoriza no servidor; aqui se prova o que a tela faz com cada resposta.

const push = vi.fn();
const refresh = vi.fn();
// Estavel entre renderizacoes, como o `useRouter` real.
const router = { push, refresh };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/modules/request/actions', () => ({ getPixPayment: vi.fn() }));

const getPixPayment = vi.mocked(requestActions.getPixPayment);
const REQUEST_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const NOW = '2026-10-05T15:00:00.000Z';
const UNTIL = '2026-10-05T15:30:00.000Z'; // 12:30 em Brasilia

const pix = {
  copyPaste: '00020101021226SIMULADO5204000053039865406099',
  qrCodeBase64: 'iVBORw0KGgo=',
  ticketUrl: 'https://example.test/ticket/1',
  expiresAt: UNTIL,
};

function renderPanel() {
  return render(<PixPanel contactRequestId={REQUEST_ID} reservedUntil={UNTIL} serverNow={NOW} />);
}

describe('PixPanel (F3-012)', () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    getPixPayment.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('carrega o Pix: QR, copia e cola, link do provedor e prazo da reserva', async () => {
    getPixPayment.mockResolvedValue({
      success: true,
      contactRequestId: REQUEST_ID,
      reservedUntil: UNTIL,
      pix,
    });
    renderPanel();

    expect(screen.getByRole('status')).toHaveTextContent('Gerando o Pix…');
    const qr = await screen.findByRole('img', { name: /QR Code do Pix de R\$ 0,99/ });
    expect(qr).toHaveAttribute('src', `data:image/png;base64,${pix.qrCodeBase64}`);
    expect(screen.getByLabelText('Pix copia e cola')).toHaveValue(pix.copyPaste);
    expect(screen.getByRole('link', { name: /Abrir o Pix no Mercado Pago/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(screen.getByText(/Pague até/)).toHaveTextContent('12:30');
    expect(screen.getByText(/Pague até/)).toHaveTextContent('Faltam cerca de 30 minutos');
    expect(getPixPayment).toHaveBeenCalledWith(REQUEST_ID);
  });

  it('copia o codigo e anuncia o resultado', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    getPixPayment.mockResolvedValue({
      success: true,
      contactRequestId: REQUEST_ID,
      reservedUntil: UNTIL,
      pix,
    });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Copiar código Pix' }));
    expect(await screen.findByText('Código Pix copiado.')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(pix.copyPaste);
  });

  it('QR que nao e base64 nao vira imagem (so o copia e cola)', async () => {
    getPixPayment.mockResolvedValue({
      success: true,
      contactRequestId: REQUEST_ID,
      reservedUntil: UNTIL,
      pix: { ...pix, qrCodeBase64: '"><script>', ticketUrl: 'javascript:alert(1)' },
    });
    renderPanel();

    expect(await screen.findByLabelText('Pix copia e cola')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('cobranca indisponivel: avisa que a vaga continua e permite tentar de novo', async () => {
    getPixPayment
      .mockResolvedValueOnce({
        success: false,
        reason: 'charge_unavailable',
        error: 'Não foi possível gerar o Pix agora.',
      })
      .mockResolvedValueOnce({
        success: true,
        contactRequestId: REQUEST_ID,
        reservedUntil: UNTIL,
        pix,
      });
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent('Sua vaga continua reservada');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByLabelText('Pix copia e cola')).toBeInTheDocument();
    expect(getPixPayment).toHaveBeenCalledTimes(2);
  });

  it('recusa do servidor (prazo, pausa, outra pessoa) nao mostra Pix e rele a pagina', async () => {
    getPixPayment.mockResolvedValue({
      success: false,
      reason: 'unavailable',
      error: 'Esta solicitação não está disponível.',
    });
    renderPanel();

    expect(await screen.findByText('O Pix desta solicitação não está disponível.')).toBeVisible();
    expect(screen.queryByLabelText('Pix copia e cola')).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it('sessao expirada vai ao login e volta para esta solicitacao', async () => {
    getPixPayment.mockResolvedValue({
      success: false,
      reason: 'login_required',
      error: 'Entre na sua conta.',
    });
    renderPanel();

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/login?motivo=sessao&next=${encodeURIComponent(`/solicitacoes/${REQUEST_ID}`)}`,
      ),
    );
  });

  it('no fim do prazo, informa e rele a pagina no servidor', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'Date'] });
    vi.setSystemTime(new Date(NOW));
    getPixPayment.mockResolvedValue({
      success: true,
      contactRequestId: REQUEST_ID,
      reservedUntil: UNTIL,
      pix,
    });
    renderPanel();
    await act(async () => {});

    await act(async () => {
      vi.setSystemTime(new Date('2026-10-05T15:31:00.000Z'));
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByText(/Pague até/)).toHaveTextContent('O prazo terminou.');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
