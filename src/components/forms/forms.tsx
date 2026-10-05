import type {
  FieldsetHTMLAttributes,
  FormHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cx } from '../ui/cx';
import { Icon } from '../ui/icon';
import styles from './forms.module.css';

/** Junta ids para `aria-describedby`, ignorando os ausentes. */
export function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  return ids.filter(Boolean).join(' ') || undefined;
}

/** Formulário em coluna única com o espaçamento padrão entre campos. */
export function Form({
  className,
  ref,
  ...rest
}: FormHTMLAttributes<HTMLFormElement> & { ref?: Ref<HTMLFormElement> }) {
  return <form ref={ref} className={cx(styles.form, className)} {...rest} />;
}

export interface FieldProps {
  label: ReactNode;
  /** `id` do controle. O chamador liga `aria-describedby` a `hintId`/`errorId`. */
  htmlFor: string;
  hint?: ReactNode;
  hintId?: string;
  error?: ReactNode;
  errorId?: string;
  /** Asterisco visual (via CSS, fora do texto do rótulo); `required` continua no controle. */
  required?: boolean;
  /** Marca visual de opcional, quando a maioria dos campos é obrigatória. */
  optional?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Moldura de um campo: rótulo, controle, descrição e erro, nesta ordem. O erro
 * leva ícone além da cor. Ids padrão: `<htmlFor>-hint` e `<htmlFor>-error`.
 */
export function Field({
  label,
  htmlFor,
  hint,
  hintId = `${htmlFor}-hint`,
  error,
  errorId = `${htmlFor}-error`,
  required,
  optional,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={htmlFor} className={cx(styles.label, required && styles.required)}>
        {label}
        {optional && <span className={styles.labelNote}>(opcional)</span>}
      </label>
      {children}
      {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

export function FieldHint({
  tone,
  className,
  ...rest
}: HTMLAttributes<HTMLParagraphElement> & { tone?: 'warning' }) {
  return (
    <p className={cx(styles.hint, tone === 'warning' && styles.hintWarning, className)} {...rest} />
  );
}

export function FieldError({ className, children, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cx(styles.error, className)} {...rest}>
      <Icon name="alert-circle" size={16} />
      <span>{children}</span>
    </p>
  );
}

type WithRef<P, E> = P & { ref?: Ref<E> };

/** Campo de texto. Estado de erro vem de `aria-invalid`, não de prop própria. */
export function Input({
  className,
  type = 'text',
  ...rest
}: WithRef<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>) {
  return <input type={type} className={cx(styles.control, className)} {...rest} />;
}

export function Textarea({
  className,
  rows = 5,
  mono,
  ...rest
}: WithRef<TextareaHTMLAttributes<HTMLTextAreaElement>, HTMLTextAreaElement> & {
  /** Fonte monoespaçada com quebra em qualquer ponto (códigos para copiar). */
  mono?: boolean;
}) {
  return (
    <textarea
      rows={rows}
      className={cx(styles.control, styles.textarea, mono && styles.mono, className)}
      {...rest}
    />
  );
}

export function Select({
  className,
  ...rest
}: WithRef<SelectHTMLAttributes<HTMLSelectElement>, HTMLSelectElement>) {
  return <select className={cx(styles.control, styles.select, className)} {...rest} />;
}

/** Data com o seletor nativo do sistema, que é o melhor no celular. */
export function DateInput(
  props: WithRef<Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>, HTMLInputElement>,
) {
  return <Input type="date" {...props} />;
}

/** Busca: `type="search"` com ícone. Envolva em `<form role="search">`. */
export function SearchInput({
  className,
  ...rest
}: WithRef<Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>, HTMLInputElement>) {
  return (
    <div className={styles.searchWrap}>
      <Icon name="search" />
      <input type="search" className={cx(styles.control, styles.search, className)} {...rest} />
    </div>
  );
}

interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

function Choice({
  type,
  label,
  description,
  className,
  ...rest
}: ChoiceProps & { type: 'checkbox' | 'radio' }) {
  return (
    <label className={cx(styles.choice, className)}>
      <input type={type} className={styles.choiceInput} {...rest} />
      <span className={styles.choiceText}>
        <span>{label}</span>
        {description && <span className={styles.choiceDescription}>{description}</span>}
      </span>
    </label>
  );
}

export function Checkbox(props: ChoiceProps) {
  return <Choice type="checkbox" {...props} />;
}

/** Agrupe rádios em `Fieldset` com `legend` e o mesmo `name`. */
export function Radio(props: ChoiceProps) {
  return <Choice type="radio" {...props} />;
}

/** Liga/desliga de efeito imediato (preferência). Para confirmação em formulário, use `Checkbox`. */
export function Switch({ label, description, className, ...rest }: ChoiceProps) {
  return (
    <label className={cx(styles.choice, styles.switchRow, className)}>
      <span className={styles.choiceText}>
        <span>{label}</span>
        {description && <span className={styles.choiceDescription}>{description}</span>}
      </span>
      <input type="checkbox" role="switch" className={styles.switch} {...rest} />
    </label>
  );
}

export interface FileUploadProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'title'
> {
  /** Chamada principal ("Adicionar fotos"). É o nome acessível do campo. */
  title: ReactNode;
  /** Restrições visíveis antes da escolha: formatos, tamanho, quantidade. */
  description?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/** Área de seleção de arquivo. O `<input type="file">` nativo continua focável. */
export function FileUpload({ title, description, className, ...rest }: FileUploadProps) {
  return (
    <label className={cx(styles.fileUpload, className)}>
      <Icon name="upload" size={24} />
      <span className={styles.fileUploadTitle}>{title}</span>
      {description && <span>{description}</span>}
      <input type="file" className="sr-only" {...rest} />
    </label>
  );
}

export interface FieldsetProps extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  legend: ReactNode;
  hint?: ReactNode;
  hintId?: string;
  error?: ReactNode;
  errorId?: string;
}

/** Grupo lógico de campos com legenda, descrição e erro do grupo. */
export function Fieldset({
  legend,
  hint,
  hintId,
  error,
  errorId,
  className,
  children,
  ...rest
}: FieldsetProps) {
  return (
    <fieldset className={cx(styles.fieldset, className)} {...rest}>
      <legend className={styles.label}>{legend}</legend>
      {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
      {error && <FieldError id={errorId}>{error}</FieldError>}
      <div className={styles.fieldsetBody}>{children}</div>
    </fieldset>
  );
}

/** Campos curtos lado a lado quando cabem; empilhados no celular. */
export function FieldRow({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.row, className)} {...rest} />;
}

export interface FormActionsProps extends HTMLAttributes<HTMLDivElement> {
  /** Fixa as ações acima da navegação inferior no celular (formulários longos). */
  sticky?: boolean;
  align?: 'start' | 'end';
}

/**
 * Ações do formulário: primária primeiro, secundária depois. No celular
 * empilham em largura total (use `fullWidth` nos botões); a partir de 480px
 * ficam em linha.
 */
export function FormActions({ sticky, align = 'start', className, ...rest }: FormActionsProps) {
  return (
    <div
      className={cx(
        styles.actions,
        sticky && styles.actionsSticky,
        align === 'end' && styles.actionsEnd,
        className,
      )}
      {...rest}
    />
  );
}

/** Barra de filtros de uma listagem. Envolva em `<form method="get" role="search">`. */
export function Filters({
  className,
  ref,
  ...rest
}: FormHTMLAttributes<HTMLFormElement> & { ref?: Ref<HTMLFormElement> }) {
  return <form ref={ref} className={cx(styles.filters, className)} {...rest} />;
}
