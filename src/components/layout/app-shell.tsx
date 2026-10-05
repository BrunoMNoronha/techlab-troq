import Link from 'next/link';
import type { ReactNode } from 'react';
import { ButtonLink } from '../ui/button';
import { cx } from '../ui/cx';
import { Icon } from '../ui/icon';
import { BottomNav, DesktopNav, type NavItem } from './nav-links';
import styles from './app-shell.module.css';

export interface AppShellProps {
  /** Nome do produto no cabeçalho. */
  brand: string;
  /** Destino da marca: a tela de entrada do produto. */
  homeHref?: string;
  /** Destinos do cabeçalho em telas largas. */
  desktopNav: readonly NavItem[];
  /** Destinos da barra inferior no celular: no máximo cinco. */
  mobileNav: readonly NavItem[];
  /** Ação principal do produto, sempre visível no cabeçalho. */
  primaryAction?: { href: string; label: string };
  /** Atalho de conta à direita do cabeçalho (telas largas). */
  accountLink?: { href: string; label: string };
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Moldura da aplicação: cabeçalho fixo, navegação principal (no cabeçalho em
 * telas largas, em barra inferior no celular) e rodapé. Não lê sessão nem
 * dado de negócio: recebe os destinos prontos do layout raiz. Cada página
 * renderiza o próprio `<main>` com `PageContainer`.
 */
export function AppShell({
  brand,
  homeHref = '/',
  desktopNav,
  mobileNav,
  primaryAction,
  accountLink,
  footer,
  children,
}: AppShellProps) {
  return (
    <div className={styles.shell}>
      <a href="#conteudo" className={styles.skipLink}>
        Pular para o conteúdo
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href={homeHref} className={styles.brand} aria-label={`${brand} — página inicial`}>
            <span className={styles.brandMark}>
              <Icon name="swap" size={20} />
            </span>
            {brand}
          </Link>

          <DesktopNav items={desktopNav} />

          <div className={styles.headerActions}>
            {primaryAction && (
              <ButtonLink href={primaryAction.href} size="sm" iconStart="plus">
                {primaryAction.label}
              </ButtonLink>
            )}
            {accountLink && (
              <ButtonLink
                href={accountLink.href}
                variant="outline"
                size="sm"
                iconStart="user"
                className={styles.desktopOnly}
              >
                {accountLink.label}
              </ButtonLink>
            )}
          </div>
        </div>
      </header>

      <div id="conteudo" tabIndex={-1} className={styles.body}>
        {children}
      </div>

      {footer && (
        <footer className={cx(styles.footer)}>
          <div className={styles.footerInner}>{footer}</div>
        </footer>
      )}

      <BottomNav items={mobileNav} />
    </div>
  );
}
