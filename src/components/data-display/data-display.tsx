import Link from 'next/link';
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../ui/cx';
import { Icon, type IconName } from '../ui/icon';
import styles from './data-display.module.css';

export interface DataTableColumn<Row> {
  /** Identificador estável da coluna. */
  key: string;
  /** Cabeçalho no desktop e rótulo da célula no cartão do celular. */
  header: string;
  cell: (row: Row) => ReactNode;
  /**
   * Papel da coluna no cartão do celular: `primary` vira o título (uma por
   * tabela), `actions` vai para o rodapé, `secondary` some no celular e só
   * aparece na tabela. Sem papel, a célula aparece como "rótulo: valor".
   */
  role?: 'primary' | 'actions' | 'secondary';
  align?: 'start' | 'end';
}

export interface DataTableProps<Row> {
  /** Descreve a tabela para leitores de tela. */
  caption: string;
  /** Mostra a legenda também visualmente. */
  showCaption?: boolean;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
}

const CELL_ROLE = {
  primary: styles.cellPrimary,
  actions: styles.cellActions,
  secondary: styles.cellSecondary,
};

/**
 * Tabela de dados responsiva: tabela tradicional a partir de 768px e um cartão
 * por linha abaixo disso, sem rolagem horizontal. Os papéis ARIA explícitos
 * preservam a semântica de tabela quando o CSS troca o `display`. Para vazio, carregamento e
 * erro, renderize `EmptyState`, `Skeleton` ou `ErrorState` no lugar da tabela.
 */
export function DataTable<Row>({
  caption,
  showCaption = false,
  columns,
  rows,
  rowKey,
}: DataTableProps<Row>) {
  return (
    <div className={styles.tableWrap}>
      <table role="table" className={styles.table}>
        <caption className={showCaption ? undefined : 'sr-only'}>{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column) => (
              <th
                key={column.key}
                role="columnheader"
                scope="col"
                className={cx(column.align === 'end' && styles.alignEnd)}
              >
                {column.role === 'actions' ? (
                  <span className="sr-only">{column.header}</span>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr key={rowKey(row)} role="row">
              {columns.map((column) => {
                const className = cx(
                  column.role && CELL_ROLE[column.role],
                  column.align === 'end' && styles.alignEnd,
                );
                return column.role === 'primary' ? (
                  <th key={column.key} role="rowheader" scope="row" className={className}>
                    {column.cell(row)}
                  </th>
                ) : (
                  <td key={column.key} role="cell" data-label={column.header} className={className}>
                    {column.cell(row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lista compacta com divisórias, para itens de uma linha ou duas. */
export function List({ className, ...rest }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cx(styles.list, className)} {...rest} />;
}

export interface ListItemProps {
  title: ReactNode;
  description?: ReactNode;
  /** Ícone à esquerda, em círculo. */
  icon?: IconName;
  /** Conteúdo à direita: `Badge`, valor, ação. */
  trailing?: ReactNode;
  /** Com `href`, o item inteiro é um link e ganha a seta de navegação. */
  href?: string;
}

export function ListItem({ title, description, icon, trailing, href }: ListItemProps) {
  const inner = (
    <>
      {icon && (
        <span className={styles.listLeading}>
          <Icon name={icon} />
        </span>
      )}
      <span className={styles.listText}>
        <span className={styles.listTitle}>{title}</span>
        {description && <span className={styles.listDescription}>{description}</span>}
      </span>
      {(trailing || href) && (
        <span className={styles.listTrailing}>
          {trailing}
          {href && <Icon name="chevron-right" />}
        </span>
      )}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className={styles.listItem}>
          {inner}
        </Link>
      ) : (
        <div className={styles.listItem}>{inner}</div>
      )}
    </li>
  );
}

/** Lista de cartões (`Card as="li"`): o padrão de listagem no celular. */
export function CardList({ className, ...rest }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cx(styles.cardList, className)} {...rest} />;
}

export interface DescriptionListProps {
  items: ReadonlyArray<{ term: string; detail: ReactNode }>;
  /**
   * `stacked`: termo sobre o valor. `columns`: duas colunas a partir de 480px.
   * `inline`: termo à esquerda e valor à direita, com divisórias.
   */
  layout?: 'stacked' | 'columns' | 'inline';
}

/** Metadados de um registro como pares termo/valor (`<dl>`). */
export function DescriptionList({ items, layout = 'stacked' }: DescriptionListProps) {
  return (
    <dl
      className={cx(
        styles.dl,
        layout === 'columns' && styles.dlColumns,
        layout === 'inline' && styles.dlInline,
      )}
    >
      {items.map((item) => (
        <div key={item.term} className={styles.dlItem}>
          <dt>{item.term}</dt>
          <dd>{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Indicador numérico de painel (KPI): rótulo, valor e contexto opcional. */
export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>
        {icon && <Icon name={icon} size={16} />}
        {label}
      </span>
      <span className={styles.statValue}>{value}</span>
      {hint && <span className={styles.statHint}>{hint}</span>}
    </div>
  );
}

const RATIO = {
  wide: styles.ratioWide,
  photo: styles.ratioPhoto,
  square: styles.ratioSquare,
};

export interface MediaFrameProps extends HTMLAttributes<HTMLDivElement> {
  ratio?: keyof typeof RATIO;
  /** `cover` recorta para preencher; `contain` mostra a imagem inteira. */
  fit?: 'cover' | 'contain';
  rounded?: boolean;
  /**
   * Largura fixa em vez de ocupar o contêiner: `thumb` (64px, miniatura ao
   * lado de texto) ou `sm` (até 224px, centralizada — QR code).
   */
  size?: 'thumb' | 'sm';
}

/**
 * Moldura de imagem com proporção fixa: reserva o espaço antes do carregamento
 * (sem salto de layout). Sem `<img>` filho, mostra o marcador de "sem imagem".
 */
export function MediaFrame({
  ratio = 'photo',
  fit = 'cover',
  rounded,
  size,
  className,
  children,
  ...rest
}: MediaFrameProps) {
  return (
    <div
      className={cx(
        styles.media,
        RATIO[ratio],
        fit === 'contain' && styles.mediaContain,
        rounded && styles.mediaRounded,
        size === 'sm' && styles.mediaSm,
        size === 'thumb' && styles.mediaThumb,
        className,
      )}
      {...rest}
    >
      {children ?? <Icon name="image" size={32} />}
    </div>
  );
}
