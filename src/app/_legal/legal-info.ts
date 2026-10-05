import { TERMS_VERSION } from '@/modules/identity/terms';

// Identificacao publica do controlador e canal de contato, informados pelo
// Bruno em 2026-10-05 (antes TBD em docs/PROJECT.md). Aparecem na Politica de
// Privacidade, nos Termos de Uso, no rodape e na tela de consentimento do Google.
export const LEGAL_CONTROLLER = 'Bruno M. Noronha';
export const LEGAL_CONTACT_EMAIL = 'contato@troqs.app';

// Os Termos publicados em /termos sao a versao aceita no cadastro
// (`TermsAcceptance.termsVersion`). Mudou o texto? Suba TERMS_VERSION junto.
export const TERMS_PAGE_VERSION = TERMS_VERSION;
export const PRIVACY_POLICY_VERSION = '1.0';
export const LEGAL_UPDATED_AT = '5 de outubro de 2026';
