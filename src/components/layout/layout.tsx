import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../ui/cx';
import styles from './layout.module.css';

/** Passos da escala de espaçamento disponíveis como `gap` (em unidades de 4px). */
export type Gap = 1 | 2 | 3 | 4 | 6 | 8 | 12;

const GAP: Record<Gap, string> = {
  1: styles.gap1,
  2: styles.gap2,
  3: styles.gap3,
  4: styles.gap4,
  6: styles.gap6,
  8: styles.gap8,
  12: styles.gap12,
};

const ALIGN = {
  start: styles.alignStart,
  center: undefined,
  end: styles.alignEnd,
  stretch: styles.alignStretch,
  baseline: styles.alignBaseline,
};

const JUSTIFY = {
  start: undefined,
  center: styles.justifyCenter,
  end: styles.justifyEnd,
  between: styles.justifyBetween,
};

interface BoxProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  gap?: Gap;
}

/** Empilha filhos na vertical com espaçamento da escala. */
export function Stack({ as: Tag = 'div', gap = 4, className, ...rest }: BoxProps) {
  return <Tag className={cx(styles.stack, GAP[gap], className)} {...rest} />;
}

export interface ClusterProps extends BoxProps {
  align?: keyof typeof ALIGN;
  justify?: keyof typeof JUSTIFY;
  /** Impede a quebra de linha (o conteúdo precisa caber em 320px). */
  nowrap?: boolean;
}

/** Agrupa filhos em linha, quebrando para a linha seguinte quando não cabem. */
export function Cluster({
  as: Tag = 'div',
  gap = 3,
  align = 'center',
  justify = 'start',
  nowrap,
  className,
  ...rest
}: ClusterProps) {
  return (
    <Tag
      className={cx(
        styles.cluster,
        GAP[gap],
        ALIGN[align],
        JUSTIFY[justify],
        nowrap && styles.nowrap,
        className,
      )}
      {...rest}
    />
  );
}

/** Filho de `Cluster` que ocupa o espaço restante e pode encolher. */
export function Grow({ as: Tag = 'div', className, ...rest }: Omit<BoxProps, 'gap'>) {
  return <Tag className={cx(styles.grow, className)} {...rest} />;
}

const COLUMNS = {
  sm: styles.colsSm,
  md: styles.colsMd,
  lg: styles.colsLg,
  /** Conteúdo + lateral: empilha até `lg`. */
  split: styles.split,
};

export interface GridProps extends BoxProps {
  /** Largura mínima das colunas automáticas, ou `split` para conteúdo + lateral. */
  columns?: keyof typeof COLUMNS;
}

/** Grade responsiva sem media query por tela: as colunas cabem conforme a largura. */
export function Grid({ as: Tag = 'div', gap = 4, columns = 'md', className, ...rest }: GridProps) {
  return <Tag className={cx(styles.grid, GAP[gap], COLUMNS[columns], className)} {...rest} />;
}

/** Filho de `Grid`. Com `full`, ocupa a linha inteira (destaque, capa de galeria). */
export function GridItem({
  as: Tag = 'div',
  full,
  className,
  ...rest
}: Omit<BoxProps, 'gap'> & { full?: boolean }) {
  return <Tag className={cx(full && styles.gridFull, className)} {...rest} />;
}

export interface PageContainerProps extends HTMLAttributes<HTMLElement> {
  /**
   * Largura máxima do conteúdo: `narrow` (30rem) para autenticação e mensagens,
   * `content` (40rem) para formulários, listas e detalhes, `wide` (65rem) para
   * vitrines e painéis.
   */
  width?: 'narrow' | 'content' | 'wide';
  as?: ElementType;
}

/** Contêiner de página: renderiza o `<main>` com largura, respiro e calha padrão. */
export function PageContainer({
  width = 'content',
  as: Tag = 'main',
  className,
  ...rest
}: PageContainerProps) {
  return <Tag className={cx(styles.container, styles[width], className)} {...rest} />;
}

export interface PageHeaderProps {
  title: ReactNode;
  /** `id` do `<h1>`, quando alguma região precisa referenciá-lo. */
  titleId?: string;
  description?: ReactNode;
  /** Navegação de retorno ou trilha (`BackLink` / `Breadcrumb`), acima do título. */
  navigation?: ReactNode;
  /** Estado do registro e metadados curtos (`Badge`), abaixo do título. */
  meta?: ReactNode;
  /** Ações da página (`Button` / `ButtonLink`). A primária vem primeiro. */
  actions?: ReactNode;
  className?: string;
}

/** Cabeçalho de página: retorno, título (`h1` único), descrição, estado e ações. */
export function PageHeader({
  title,
  titleId,
  description,
  navigation,
  meta,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cx(styles.pageHeader, className)}>
      {navigation}
      <div className={styles.pageHeaderMain}>
        <div className={styles.pageHeaderText}>
          <h1 id={titleId} className={styles.pageTitle}>
            {title}
          </h1>
          {description && <p className={styles.pageDescription}>{description}</p>}
          {meta && <div className={styles.pageMeta}>{meta}</div>}
        </div>
        {actions && <div className={styles.pageActions}>{actions}</div>}
      </div>
    </header>
  );
}

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  /** `id` do título; com ele a seção vira região nomeada (`aria-labelledby`). */
  titleId?: string;
  headingLevel?: 2 | 3;
  description?: ReactNode;
  actions?: ReactNode;
  gap?: Gap;
}

/** Seção de conteúdo com título, descrição e ações opcionais. */
export function Section({
  title,
  titleId,
  headingLevel = 2,
  description,
  actions,
  gap = 4,
  className,
  children,
  ...rest
}: SectionProps) {
  const Title = `h${headingLevel}` as const;
  return (
    <section
      aria-labelledby={title && titleId ? titleId : undefined}
      className={cx(styles.section, GAP[gap], className)}
      {...rest}
    >
      {(title || actions) && (
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderText}>
            {title && <Title id={titleId}>{title}</Title>}
            {description && <p className={styles.sectionDescription}>{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
