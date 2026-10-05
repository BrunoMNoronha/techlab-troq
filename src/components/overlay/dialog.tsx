'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from '../ui/button';
import { cx } from '../ui/cx';
import styles from './overlay.module.css';

export interface DialogProps {
  open: boolean;
  /** Chamado por Esc, pelo botão de fechar e pelo clique fora. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Ações: a primária primeiro. No celular empilham em largura total. */
  footer?: ReactNode;
  /**
   * Apresentação a partir de 768px: `modal` centralizado, `drawer` na lateral
   * direita ou `sheet` na base. No celular todas são folha inferior.
   */
  variant?: 'modal' | 'drawer' | 'sheet';
  /** Confirmação destrutiva ou obrigatória: clique fora não fecha. */
  dismissOnBackdrop?: boolean;
  children?: ReactNode;
}

/**
 * Diálogo modal sobre `<dialog>` nativo: foco preso, Esc para fechar e retorno
 * do foco ao gatilho ficam por conta do navegador. `Modal`, `Drawer` e `Sheet`
 * são as três apresentações do mesmo componente.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  variant = 'modal',
  dismissOnBackdrop = true,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Ambientes sem suporte a showModal (testes) caem no atributo `open`.
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cx(styles.dialog, variant !== 'sheet' && styles[variant])}
      onCancel={(event) => {
        // O estado pertence ao chamador: o fechamento nativo vira `onClose`.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (dismissOnBackdrop && event.target === ref.current) onClose();
      }}
    >
      <div className={styles.dialogHeader}>
        <div>
          <h2 id={titleId} className={styles.dialogTitle}>
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className={styles.dialogDescription}>
              {description}
            </p>
          )}
        </div>
        <IconButton icon="x" label="Fechar" size="sm" onClick={onClose} />
      </div>
      {children && <div className={styles.dialogBody}>{children}</div>}
      {footer && <div className={styles.dialogFooter}>{footer}</div>}
    </dialog>
  );
}

export function Modal(props: Omit<DialogProps, 'variant'>) {
  return <Dialog variant="modal" {...props} />;
}

export function Drawer(props: Omit<DialogProps, 'variant'>) {
  return <Dialog variant="drawer" {...props} />;
}

export function Sheet(props: Omit<DialogProps, 'variant'>) {
  return <Dialog variant="sheet" {...props} />;
}
