import Link from 'next/link';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';
import styles from './button.module.css';

export type ButtonVariant =
  'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dangerOutline';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ocupa toda a largura do contêiner (padrão de ação principal no celular). */
  fullWidth?: boolean;
  iconStart?: IconName;
  iconEnd?: IconName;
}

function buttonClass(
  { variant = 'primary', size = 'md', fullWidth }: ButtonStyleProps,
  className?: string,
) {
  return cx(
    styles.button,
    styles[variant],
    size !== 'md' && styles[size],
    fullWidth && styles.fullWidth,
    className,
  );
}

function content(children: ReactNode, iconStart?: IconName, iconEnd?: IconName, busy?: boolean) {
  const iconSize = 20;
  return (
    <>
      {busy ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        iconStart && <Icon name={iconStart} size={iconSize} />
      )}
      {children}
      {iconEnd && <Icon name={iconEnd} size={iconSize} />}
    </>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {
  /**
   * Operação em andamento: mostra o indicador, marca `aria-busy` e desabilita.
   * O texto continua sendo o do chamador (por exemplo, "Salvando...").
   */
  loading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({
  variant,
  size,
  fullWidth,
  iconStart,
  iconEnd,
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, fullWidth }, className)}
      {...rest}
    >
      {content(children, iconStart, iconEnd, loading)}
    </button>
  );
}

export interface ButtonLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>, ButtonStyleProps {
  href: string;
  /**
   * Navegação com recarga completa (`<a>` nativo) em vez de transição do
   * roteador. Use quando o destino precisa de requisição nova ao servidor.
   */
  reload?: boolean;
}

/** Link com aparência de botão. Navegação é link; ação é `Button`. */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  iconStart,
  iconEnd,
  reload = false,
  href,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const props = {
    className: buttonClass({ variant, size, fullWidth }, className),
    ...rest,
  };
  const inner = content(children, iconStart, iconEnd);
  return reload ? (
    <a href={href} {...props}>
      {inner}
    </a>
  ) : (
    <Link href={href} {...props}>
      {inner}
    </Link>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Nome acessível obrigatório: o botão não tem texto visível. */
  label: string;
  variant?: ButtonVariant;
  size?: Exclude<ButtonSize, 'lg'>;
  ref?: React.Ref<HTMLButtonElement>;
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(buttonClass({ variant, size }), styles.icon, className)}
      {...rest}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}
