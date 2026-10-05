import type { OwnRequestPhase } from '@/modules/request';

// Rotulos das fases da solicitacao vistas pelo proprio solicitante (F3-012, #102).

export const PHASE_LABELS: Record<OwnRequestPhase, { label: string; bg: string; color: string }> = {
  awaiting_payment: { label: 'Aguardando pagamento', bg: '#fef3c7', color: '#92400e' },
  window_closed: { label: 'Prazo de pagamento encerrado', bg: '#f3f4f6', color: '#374151' },
  paid: { label: 'Paga — aguardando escolha', bg: '#dcfce7', color: '#166534' },
  expired: { label: 'Expirada', bg: '#f3f4f6', color: '#374151' },
  failed: { label: 'Encerrada sem pagamento', bg: '#f3f4f6', color: '#374151' },
};

/** Paga e escolhida: a liberacao existe para o proprio ator (CR-5.3). */
export const CHOSEN_LABEL = {
  label: 'Escolhida — contato liberado',
  bg: '#dbeafe',
  color: '#1e3a8a',
};

export const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export const TIME = new Intl.DateTimeFormat('pt-BR', {
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

/** Destino de login que volta para `next` depois de entrar (validado no servidor). */
export function loginPathWithReturn(loginPath: string, next: string): string {
  return `${loginPath}&next=${encodeURIComponent(next)}`;
}
