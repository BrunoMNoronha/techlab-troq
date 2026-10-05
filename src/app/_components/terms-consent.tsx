import { TextLink } from '@/components/ui';

// Texto do aceite no cadastro (senha e Google), com links para as paginas
// publicas da versao aceita. Abrem em nova aba para nao perder o formulario.
export function TermsConsentText() {
  return (
    <>
      Li e aceito os{' '}
      <TextLink href="/termos" reload target="_blank" rel="noopener noreferrer">
        Termos de Uso
      </TextLink>{' '}
      e a{' '}
      <TextLink href="/privacidade" reload target="_blank" rel="noopener noreferrer">
        Política de Privacidade
      </TextLink>
      .
    </>
  );
}
