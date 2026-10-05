import { useId, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';
import styles from './surface.module.css';

const PADDING = { none: styles.padNone, sm: styles.padSm, md: styles.padMd, lg: styles.padLg };

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Elemento renderizado: `li` em listas, `section`/`article` quando houver título. */
  as?: ElementType;
  variant?: 'default' | 'muted' | 'dashed';
  padding?: keyof typeof PADDING;
  elevated?: boolean;
  /** Realce de hover para cartão inteiro clicável (use com `as={Link}`). */
  interactive?: boolean;
  /**
   * Cartão com mídia no topo: sem respiro próprio, altura total da célula e
   * cantos recortando a imagem. O texto vai em `CardBody`.
   */
  media?: boolean;
  /** Repassado ao elemento quando `as` é um link. */
  href?: string;
}

/** Superfície básica de agrupamento. `Panel` é o mesmo componente com `variant="muted"`. */
export function Card({
  as: Tag = 'div',
  variant = 'default',
  media,
  padding = media ? 'none' : 'md',
  elevated,
  interactive,
  className,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cx(
        styles.card,
        variant !== 'default' && styles[variant],
        PADDING[padding],
        elevated && styles.elevated,
        media && styles.media,
        interactive && styles.interactive,
        className,
      )}
      {...rest}
    />
  );
}

/** Corpo de um `Card media`: coluna com respiro padrão. */
export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.cardBody, className)} {...rest} />;
}

/** Último bloco de um `CardBody`, empurrado para a base do cartão. */
export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.cardFooter, className)} {...rest} />;
}

export function Panel(props: CardProps) {
  return <Card variant="muted" {...props} />;
}

/** Separador. Com `children`, vira um divisor rotulado ("ou"). */
export function Divider({ children, className }: { children?: ReactNode; className?: string }) {
  if (children === undefined) {
    return <hr className={cx(styles.divider, styles.dividerPlain, className)} />;
  }
  return (
    <div role="separator" className={cx(styles.divider, className)}>
      {children}
    </div>
  );
}

export type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  icon?: IconName;
}

/** Rótulo curto de estado. O texto carrega o significado; a cor só reforça. */
export function Badge({ tone = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], className)} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </span>
  );
}

export interface AccordionProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Mesmo `name` em vários itens faz com que só um fique aberto por vez. */
  name?: string;
}

/** Conteúdo recolhível sobre `<details>` nativo: funciona sem JavaScript. */
export function Accordion({ title, children, defaultOpen, name }: AccordionProps) {
  return (
    <details className={styles.accordion} open={defaultOpen} name={name}>
      <summary className={styles.accordionSummary}>
        <span>{title}</span>
        <Icon name="chevron-down" />
      </summary>
      <div className={styles.accordionBody}>{children}</div>
    </details>
  );
}

/**
 * Dica curta exibida em hover e foco. O conteúdo fica ligado ao gatilho por
 * `aria-describedby`; não use para informação essencial à tarefa.
 */
export function Tooltip({
  text,
  children,
}: {
  text: string;
  children: (describedBy: string) => ReactNode;
}) {
  const id = useId();
  return (
    <span className={styles.tooltipHost}>
      {children(id)}
      <span id={id} role="tooltip" className={styles.tooltip}>
        {text}
      </span>
    </span>
  );
}
