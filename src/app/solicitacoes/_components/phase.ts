import type { Tone } from '@/components/ui';
import type { OwnRequestPhase } from '@/modules/request';

// Rotulos das fases da solicitacao vistas pelo proprio solicitante (F3-012, #102).
// O texto carrega o significado; o tom do `Badge` so reforca.

export interface PhaseLabel {
  label: string;
  tone: Tone;
}

export const PHASE_LABELS: Record<OwnRequestPhase, PhaseLabel> = {
  awaiting_payment: { label: 'Aguardando pagamento', tone: 'warning' },
  window_closed: { label: 'Prazo de pagamento encerrado', tone: 'neutral' },
  paid: { label: 'Paga — aguardando escolha', tone: 'success' },
  expired: { label: 'Expirada', tone: 'neutral' },
  failed: { label: 'Encerrada sem pagamento', tone: 'neutral' },
};

/** Paga e escolhida: a liberacao existe para o proprio ator (CR-5.3). */
export const CHOSEN_LABEL: PhaseLabel = {
  label: 'Escolhida — contato liberado',
  tone: 'primary',
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
