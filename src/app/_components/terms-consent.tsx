// Texto do aceite no cadastro (senha e Google), com links para as paginas
// publicas da versao aceita. Abrem em nova aba para nao perder o formulario.
const linkStyle = { color: '#1d4ed8', fontWeight: 700 } as const;

export function TermsConsentText() {
  return (
    <>
      Li e aceito os{' '}
      <a href="/termos" target="_blank" rel="noopener noreferrer" style={linkStyle}>
        Termos de Uso
      </a>{' '}
      e a{' '}
      <a href="/privacidade" target="_blank" rel="noopener noreferrer" style={linkStyle}>
        Política de Privacidade
      </a>
      .
    </>
  );
}
