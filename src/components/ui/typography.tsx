import Link from 'next/link';
import type { AnchorHTMLAttributes, ElementType, HTMLAttributes } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';
import styles from './typography.module.css';

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Nível semântico (`h1`–`h4`): segue a estrutura do documento. */
  level: 1 | 2 | 3 | 4;
  /** Tamanho visual, quando precisa diferir do nível. `display` é só para a chamada da home. */
  size?: 'display' | 'h1' | 'h2' | 'h3' | 'h4';
  wrapAnywhere?: boolean;
}

export function Heading({ level, size, wrapAnywhere, className, ...rest }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      className={cx(styles[size ?? Tag], wrapAnywhere && styles.wrapAnywhere, className)}
      {...rest}
    />
  );
}

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  size?: 'lead' | 'body' | 'small' | 'caption';
  tone?: 'default' | 'muted' | 'subtle' | 'error' | 'success' | 'warning';
  weight?: 'regular' | 'medium' | 'semibold';
  align?: 'start' | 'center';
  /** Limita a 2 ou 3 linhas com reticências (resumos em cartões e listas). */
  clamp?: 2 | 3;
  /** Quebra palavras longas sem espaço (títulos e textos digitados por pessoas). */
  wrapAnywhere?: boolean;
  /** Limita a largura de leitura (~70 caracteres). */
  measure?: boolean;
  /** Ícone decorativo à esquerda do texto. */
  icon?: IconName;
  mono?: boolean;
  /** Mantém as quebras de linha digitadas (descrições de várias linhas). */
  preserveLines?: boolean;
}

/** Texto corrido com as variações tipográficas do sistema. Renderiza `<p>` por padrão. */
export function Text({
  as: Tag = 'p',
  size = 'body',
  tone = 'default',
  weight = 'regular',
  align = 'start',
  clamp,
  wrapAnywhere,
  measure,
  icon,
  mono,
  preserveLines,
  className,
  children,
  ...rest
}: TextProps) {
  return (
    <Tag
      className={cx(
        styles[size],
        tone !== 'default' && styles[tone],
        weight !== 'regular' && styles[weight],
        align === 'center' && styles.center,
        clamp === 2 && styles.clamp2,
        clamp === 3 && styles.clamp3,
        wrapAnywhere && styles.wrapAnywhere,
        measure && styles.measure,
        icon && styles.withIcon,
        mono && styles.mono,
        preserveLines && styles.preserveLines,
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Tag>
  );
}

export interface TextLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  /** `<a>` nativo, com recarga completa, em vez de transição do roteador. */
  reload?: boolean;
  /** Garante 44px de altura para toque quando o link está sozinho na linha. */
  touch?: boolean;
  iconStart?: IconName;
  iconEnd?: IconName;
}

/** Link de texto em destaque (ações secundárias, "ver mais", navegação em linha). */
export function TextLink({
  href,
  reload,
  touch,
  iconStart,
  iconEnd,
  className,
  children,
  ...rest
}: TextLinkProps) {
  const props = {
    className: cx(styles.link, (touch || iconStart || iconEnd) && styles.linkTouch, className),
    ...rest,
  };
  const inner = (
    <>
      {iconStart && <Icon name={iconStart} size={16} />}
      {children}
      {iconEnd && <Icon name={iconEnd} size={16} />}
    </>
  );
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

/** Bloco de texto longo (políticas, explicações): espaça parágrafos, listas e subtítulos. */
export function Prose({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.prose, className)} {...rest} />;
}
