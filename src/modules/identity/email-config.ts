// Regras comuns de configuracao do envio por Resend (DEC-015), usadas pelo
// email de verificacao (./email.ts) e pelos emails transacionais
// (./notifications.ts). Ficam num arquivo proprio para que os testes que
// simulam um dos dois transportes nao apaguem as regras do outro.

const PLACEHOLDER_PREFIX = 'SUBSTITUIR_';

export function isConfigured(value: string | undefined): value is string {
  return Boolean(value) && !value!.startsWith(PLACEHOLDER_PREFIX);
}

// O placeholder de EMAIL_FROM em .env.example usa o dominio reservado
// `example.invalid`, que nunca resolve (RFC 2606).
export function isConfiguredSender(value: string | undefined): value is string {
  return isConfigured(value) && !/@[^>]*\.invalid>?\s*$/i.test(value);
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
