import type { ElementType, HTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from '../ui/cx';
import { Icon, type IconName } from '../ui/icon';
import styles from './feedback.module.css';

export type AlertTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const ALERT_ICON: Record<AlertTone, IconName> = {
  neutral: 'info',
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  error: 'alert-circle',
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  tone?: AlertTone;
  title?: ReactNode;
  /** Elemento do título: `p` por padrão; use `h2`/`h3` quando o aviso abre uma seção. */
  titleAs?: 'p' | 'h2' | 'h3';
  /** Elemento raiz: `div` por padrão; `section` quando o aviso é uma região nomeada. */
  as?: 'div' | 'section';
  ref?: Ref<HTMLElement>;
}

/**
 * Mensagem em linha. O ícone acompanha o tom para que o significado não
 * dependa só da cor. `role` é decisão do chamador: `alert` para erro que
 * interrompe, `status` para aviso que não interrompe.
 */
export function Alert({
  tone = 'neutral',
  title,
  titleAs: Title = 'p',
  as: Tag = 'div',
  className,
  children,
  ref,
  ...rest
}: AlertProps) {
  const Root = Tag as ElementType;
  return (
    <Root
      ref={ref}
      className={cx(styles.alert, tone !== 'neutral' && styles[tone], className)}
      {...rest}
    >
      <Icon name={ALERT_ICON[tone]} />
      <div className={styles.alertBody}>
        {title && <Title className={styles.alertTitle}>{title}</Title>}
        {children}
      </div>
    </Root>
  );
}

interface StateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: IconName;
  title: ReactNode;
  /** `h1` só quando o estado é a página inteira (fronteira de erro de rota). */
  titleAs?: 'h1' | 'h2' | 'h3' | 'p';
  description?: ReactNode;
  /** Ação de saída do estado: criar o primeiro item, limpar o filtro, tentar de novo. */
  action?: ReactNode;
}

/** Lista ou busca sem itens. Sempre diz o que aconteceu e oferece o próximo passo. */
export function EmptyState({
  icon = 'inbox',
  title,
  titleAs: Title = 'h2',
  description,
  action,
  className,
  children,
  ...rest
}: StateProps) {
  return (
    <div className={cx(styles.state, className)} {...rest}>
      <span className={styles.stateIcon}>
        <Icon name={icon} size={24} />
      </span>
      <Title className={styles.stateTitle}>{title}</Title>
      {description && <p className={styles.stateDescription}>{description}</p>}
      {children}
      {action && <div className={styles.stateAction}>{action}</div>}
    </div>
  );
}

/** Falha ao carregar. Anunciada como alerta; a ação costuma ser "Tentar novamente". */
export function ErrorState({
  icon = 'alert-triangle',
  title,
  titleAs: Title = 'h2',
  description,
  action,
  className,
  children,
  role = 'alert',
  ...rest
}: StateProps) {
  return (
    <div role={role} className={cx(styles.state, styles.stateError, className)} {...rest}>
      <span className={styles.stateIcon}>
        <Icon name={icon} size={24} />
      </span>
      <Title className={styles.stateTitle}>{title}</Title>
      {description && <p className={styles.stateDescription}>{description}</p>}
      {children}
      {action && <div className={styles.stateAction}>{action}</div>}
    </div>
  );
}

/** Indicador de espera curta. `label` é lido por leitores de tela e pode ficar visível. */
export function Spinner({
  label = 'Carregando...',
  showLabel = false,
  size = 'md',
}: {
  label?: string;
  showLabel?: boolean;
  size?: 'md' | 'lg';
}) {
  return (
    <span role="status" className={styles.spinner}>
      <span
        className={cx(styles.spinnerCircle, size === 'lg' && styles.spinnerLg)}
        aria-hidden="true"
      />
      {showLabel ? label : <span className="sr-only">{label}</span>}
    </span>
  );
}

const SKELETON = {
  text: styles.skeletonText,
  title: styles.skeletonTitle,
  block: styles.skeletonBlock,
  media: styles.skeletonMedia,
};

/**
 * Marcador de conteúdo em carregamento, com a forma aproximada do que virá,
 * para a tela não saltar. É decorativo: anuncie o carregamento no contêiner
 * (`role="status"` + texto) e não em cada bloco.
 */
export function Skeleton({
  variant = 'text',
  lines = 1,
  className,
}: {
  variant?: keyof typeof SKELETON;
  lines?: number;
  className?: string;
}) {
  if (variant === 'text' && lines > 1) {
    return (
      <span className={cx(styles.skeletonGroup, className)} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={cx(styles.skeleton, styles.skeletonText)} />
        ))}
      </span>
    );
  }
  return <span className={cx(styles.skeleton, SKELETON[variant], className)} aria-hidden="true" />;
}

/** Progresso determinado de uma operação (upload, etapas concluídas). */
export function Progress({
  value,
  max = 100,
  label,
  valueText,
}: {
  value: number;
  max?: number;
  label: string;
  /** Texto do valor, quando a porcentagem não for a melhor leitura ("2 de 5"). */
  valueText?: string;
}) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const text = valueText ?? `${Math.round(ratio * 100)}%`;
  return (
    <div className={styles.progress}>
      <div className={styles.progressHeader}>
        <span>{label}</span>
        <span>{text}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        className={styles.progressTrack}
      >
        {/* Largura dinâmica: único caso em que o valor não cabe em classe. */}
        <div className={styles.progressBar} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
