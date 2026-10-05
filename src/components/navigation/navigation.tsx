import Link from 'next/link';
import type { ReactNode } from 'react';
import { ButtonLink } from '../ui/button';
import { cx } from '../ui/cx';
import { Icon } from '../ui/icon';
import styles from './navigation.module.css';

/** Retorno ao nível anterior, acima do título da página. */
export function BackLink({
  href,
  reload = false,
  children,
}: {
  href: string;
  /** `<a>` nativo, com recarga completa, em vez de transição do roteador. */
  reload?: boolean;
  children: ReactNode;
}) {
  const inner = (
    <>
      <Icon name="arrow-left" size={16} />
      {children}
    </>
  );
  return reload ? (
    <a href={href} className={styles.backLink}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={styles.backLink}>
      {inner}
    </Link>
  );
}

export interface BreadcrumbItem {
  label: string;
  /** Ausente no último item, que é a página atual. */
  href?: string;
}

/** Trilha de navegação para hierarquias de três níveis ou mais; abaixo disso, `BackLink`. */
export function Breadcrumb({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <nav aria-label="Trilha de navegação" className={styles.breadcrumb}>
      <ol>
        {items.map((item, index) => (
          <li key={item.label}>
            {index > 0 && <Icon name="chevron-right" size={16} />}
            {item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface StepperProps {
  /** Nome acessível da lista ("Etapas da solicitação"). */
  label: string;
  steps: readonly string[];
  /** Etapa atual, a partir de 1. As anteriores aparecem como concluídas. */
  current: number;
  /** Marca também a etapa atual como concluída (fluxo terminado). */
  completed?: boolean;
}

/** Progresso em etapas de um fluxo linear. Estado por texto e marcador, não só por cor. */
export function Stepper({ label, steps, current, completed = false }: StepperProps) {
  return (
    <ol aria-label={label} className={styles.stepper}>
      {steps.map((step, index) => {
        const n = index + 1;
        const done = n < current || (completed && n === current);
        const active = n === current;
        return (
          <li
            key={step}
            aria-current={active ? 'step' : undefined}
            className={cx(
              styles.step,
              done && styles.stepDone,
              active && !done && styles.stepCurrent,
            )}
          >
            <span className={styles.stepMarker} aria-hidden="true">
              {done ? <Icon name="check" size={16} /> : n}
            </span>
            <span>
              {step}
              {done && <span className="sr-only"> (concluída)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export interface PaginationProps {
  /** Nome acessível do `<nav>`. */
  label?: string;
  previous?: { href: string; label?: string };
  next?: { href: string; label?: string };
  /** Posição atual ("Página 2 de 5"). */
  status?: ReactNode;
}

/**
 * Paginação por links (a URL é a fonte de verdade). Sem página anterior nem
 * seguinte, nada é renderizado.
 */
export function Pagination({ label = 'Paginação', previous, next, status }: PaginationProps) {
  if (!previous && !next) return null;
  return (
    <nav aria-label={label} className={styles.pagination}>
      {previous ? (
        <ButtonLink href={previous.href} variant="outline" iconStart="arrow-left" rel="prev">
          {previous.label ?? 'Anterior'}
        </ButtonLink>
      ) : (
        <span />
      )}
      {status && <span className={styles.paginationStatus}>{status}</span>}
      {next ? (
        <ButtonLink href={next.href} variant="outline" iconEnd="arrow-right" rel="next">
          {next.label ?? 'Próxima'}
        </ButtonLink>
      ) : (
        <span />
      )}
    </nav>
  );
}
