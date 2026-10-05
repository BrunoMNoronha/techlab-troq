'use client';

import Link from 'next/link';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Button, IconButton, type ButtonVariant } from '../ui/button';
import { cx } from '../ui/cx';
import { Icon, type IconName } from '../ui/icon';
import styles from './overlay.module.css';

/** Abre/fecha com clique fora e Esc; devolve o foco ao gatilho ao fechar por Esc. */
function useDisclosure() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return { open, setOpen, rootRef, triggerRef };
}

export interface DropdownItem {
  label: string;
  icon?: IconName;
  /** Com `href` o item é um link; sem ele, um botão que chama `onSelect`. */
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
}

export interface DropdownProps {
  /** Texto do gatilho. Com `icon` e sem `showLabel`, vira só o nome acessível. */
  label: string;
  icon?: IconName;
  showLabel?: boolean;
  variant?: ButtonVariant;
  items: readonly DropdownItem[];
  /** Lado em que o menu se alinha ao gatilho. */
  align?: 'start' | 'end';
}

/** Menu de ações secundárias de um registro ("mais opções"). Setas navegam entre itens. */
export function Dropdown({
  label,
  icon = 'more',
  showLabel = false,
  variant = 'outline',
  items,
  align = 'end',
}: DropdownProps) {
  const { open, setOpen, rootRef, triggerRef } = useDisclosure();
  const menuId = useId();
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLUListElement>) {
    const entries = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const index = entries.indexOf(document.activeElement as HTMLElement);
    const target =
      event.key === 'ArrowDown'
        ? entries[(index + 1) % entries.length]
        : event.key === 'ArrowUp'
          ? entries[(index - 1 + entries.length) % entries.length]
          : event.key === 'Home'
            ? entries[0]
            : event.key === 'End'
              ? entries[entries.length - 1]
              : undefined;
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  const triggerProps = {
    ref: triggerRef,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => setOpen((value) => !value),
  };

  return (
    <div ref={rootRef} className={styles.dropdown}>
      {showLabel ? (
        <Button variant={variant} iconEnd="chevron-down" {...triggerProps}>
          {label}
        </Button>
      ) : (
        <IconButton icon={icon} label={label} variant={variant} {...triggerProps} />
      )}
      {open && (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={cx(styles.menu, align === 'start' && styles.menuStart)}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => {
            const className = cx(styles.menuItem, item.danger && styles.menuItemDanger);
            const inner = (
              <>
                {item.icon && <Icon name={item.icon} size={16} />}
                {item.label}
              </>
            );
            return (
              <li key={item.label} role="none">
                {item.href ? (
                  <Link
                    href={item.href}
                    role="menuitem"
                    className={className}
                    onClick={() => setOpen(false)}
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className={className}
                    onClick={() => {
                      setOpen(false);
                      triggerRef.current?.focus();
                      item.onSelect?.();
                    }}
                  >
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export interface PopoverProps {
  label: string;
  icon?: IconName;
  variant?: ButtonVariant;
  align?: 'start' | 'end';
  children: ReactNode;
}

/** Conteúdo livre ancorado a um botão (ajuda contextual, filtros extras). */
export function Popover({
  label,
  icon = 'info',
  variant = 'ghost',
  align = 'end',
  children,
}: PopoverProps) {
  const { open, setOpen, rootRef, triggerRef } = useDisclosure();
  const panelId = useId();
  return (
    <div ref={rootRef} className={styles.dropdown}>
      <IconButton
        ref={triggerRef}
        icon={icon}
        label={label}
        variant={variant}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className={cx(styles.menu, styles.popover, align === 'start' && styles.menuStart)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
