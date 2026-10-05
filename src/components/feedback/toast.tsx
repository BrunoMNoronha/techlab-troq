'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from '../ui/icon';
import styles from './feedback.module.css';

type ToastTone = 'success' | 'error' | 'info';

interface ToastEntry {
  id: number;
  message: string;
  tone: ToastTone;
}

const TONE_ICON: Record<ToastTone, IconName> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'info',
};

const DEFAULT_DURATION_MS = 5000;

interface ToastApi {
  /** Mostra uma confirmação breve. Erros que exigem ação ficam em `Alert`, na tela. */
  show: (message: string, options?: { tone?: ToastTone; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Região de avisos temporários. Fica acima da navegação inferior no celular e
 * no canto inferior direito em telas largas; some sozinha e pode ser dispensada.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show(message, options) {
        const id = nextId.current++;
        setToasts((current) => [...current, { id, message, tone: options?.tone ?? 'success' }]);
        window.setTimeout(() => dismiss(id), options?.durationMs ?? DEFAULT_DURATION_MS);
      },
    }),
    [dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.toastRegion} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={styles.toast}>
            <Icon name={TONE_ICON[toast.tone]} />
            <span>{toast.message}</span>
            <button
              type="button"
              className={styles.toastClose}
              aria-label="Dispensar aviso"
              onClick={() => dismiss(toast.id)}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast precisa de <ToastProvider> acima na árvore.');
  return api;
}
