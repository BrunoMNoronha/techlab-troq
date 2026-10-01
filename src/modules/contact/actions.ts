'use server';

import { validateSession, type SessionValidationResult } from '@/modules/identity';
import { saveContact } from './contact';
import { normalizeBrazilianPhone } from './phone';

// Operacao "registrar ou alterar o proprio contato" (contact-release.md, CR-2.2
// e CR-2.5; F3-002, #92). O titular vem SO da sessao; a entrada e normalizada
// e validada no servidor (DM-4.5); a resposta e confirmacao, nunca o numero,
// nem inteiro nem mascarado; o erro de campo nao ecoa a entrada. Nada daqui
// grava o numero em log, telemetria, auditoria ou mensagem de erro (CR-6.1).
//
// Sem auditoria: data-model.md, DM-11.1 nao lista registro nem alteracao de
// contato entre os eventos auditados do MVP.

export interface RegisterContactInput {
  phone: string;
}

export type RegisterContactFailureReason =
  'login_required' | 'email_unverified' | 'account_restricted' | 'validation' | 'error';

export type RegisterContactResult =
  | { success: true; hasContact: true }
  | {
      success: false;
      reason: RegisterContactFailureReason;
      error: string;
      fieldErrors?: { phone: string };
    };

const MESSAGES: Record<RegisterContactFailureReason, string> = {
  login_required: 'Entre na sua conta para cadastrar seu contato.',
  email_unverified: 'Confirme seu e-mail para cadastrar seu contato.',
  account_restricted: 'Sua conta não pode cadastrar contato.',
  validation: 'Revise o campo destacado.',
  error: 'Não foi possível salvar seu contato. Tente novamente.',
};

const FIELD_MESSAGES = {
  empty: 'Informe seu telefone ou WhatsApp.',
  invalid: 'Informe um telefone brasileiro com DDD, por exemplo (11) 91234-5678.',
} as const;

function failure(reason: RegisterContactFailureReason): RegisterContactResult {
  return { success: false, reason, error: MESSAGES[reason] };
}

function sessionFailure(reason: SessionValidationResult['reason']): RegisterContactResult {
  if (reason === 'unverified') return failure('email_unverified');
  if (reason === 'blocked' || reason === 'deletion_requested') {
    return failure('account_restricted');
  }
  return failure('login_required');
}

/** Registra ou substitui o contato do ator da sessao. Devolve so a confirmacao. */
export async function registerOwnContact(
  input: RegisterContactInput,
): Promise<RegisterContactResult> {
  const session = await validateSession();
  if (!session.isValid || !session.user) return sessionFailure(session.reason);
  // `isValid` ja implica conta ativa e e-mail verificado; a checagem repetida
  // mantem a regra local e explicita (CR-2.5 item 1).
  if (session.user.status !== 'active') return failure('account_restricted');
  if (!session.user.emailVerified) return failure('email_unverified');

  const phone = normalizeBrazilianPhone((input as Partial<RegisterContactInput> | null)?.phone);
  if (!phone.ok) {
    return {
      success: false,
      reason: 'validation',
      error: MESSAGES.validation,
      fieldErrors: { phone: phone.empty ? FIELD_MESSAGES.empty : FIELD_MESSAGES.invalid },
    };
  }

  try {
    await saveContact(session.user.id, phone.e164);
  } catch (err) {
    // Sem a mensagem do erro: um erro do driver pode citar o valor da linha.
    console.error('[contact] falha ao salvar o contato', {
      error: err instanceof Error ? err.name : 'unknown',
    });
    return failure('error');
  }

  return { success: true, hasContact: true };
}
