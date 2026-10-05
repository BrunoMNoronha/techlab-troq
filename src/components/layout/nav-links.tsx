'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '../ui/icon';
import styles from './app-shell.module.css';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Rótulo curto para a navegação inferior, quando o completo não cabe em 320px. */
  shortLabel?: string;
}

function isCurrent(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegação principal em telas largas (cabeçalho). */
export function DesktopNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className={styles.desktopNav}>
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={styles.navLink}
              aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Navegação principal no celular: barra inferior fixa, ao alcance do polegar. */
export function BottomNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal (celular)" className={styles.bottomNav}>
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={styles.bottomLink}
              aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
            >
              <Icon name={item.icon} size={24} />
              <span>{item.shortLabel ?? item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
