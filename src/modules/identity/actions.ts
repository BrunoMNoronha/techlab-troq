'use server';

import { getPrismaClient } from '@/persistence/prisma';
import { sendVerificationEmail } from './email';
import crypto from 'crypto';

export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  over18: boolean;
  termsAccepted: boolean;
}

export interface RegisterResult {
  success: boolean;
  error?: string;
  emailPending?: string;
}

const TERMS_VERSION = '1.0';

/**
 * Server Action de cadastro de usuario.
 * Registra a autodeclaracao de maioridade (18+) e o aceite dos termos em banco,
 * criando o usuario nao-verificado e disparando o e-mail de verificacao via Resend.
 */
export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const { displayName, email, password, over18, termsAccepted } = input;

  if (!displayName || displayName.trim().length < 2) {
    return { success: false, error: 'O nome exibido deve ter pelo menos 2 caracteres.' };
  }

  const cleanEmail = email ? email.trim().toLowerCase() : '';
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Informe um e-mail valido.' };
  }

  if (!password || password.length < 8) {
    return { success: false, error: 'A senha deve ter no minimo 8 caracteres.' };
  }

  if (!over18) {
    return {
      success: false,
      error: 'E necessario confirmar ter 18 anos ou mais para se cadastrar.',
    };
  }

  if (!termsAccepted) {
    return { success: false, error: 'Voce precisa aceitar os Termos de Uso.' };
  }

  const prisma = getPrismaClient();

  // Verificar se e-mail ja existe em conta ativa
  const existingUser = await prisma.user.findFirst({
    where: {
      email: cleanEmail,
      status: { not: 'deletion_requested' },
    },
  });

  if (existingUser) {
    return { success: false, error: 'Este e-mail ja esta cadastrado na plataforma.' };
  }

  try {
    // 1. Criar usuario e aceite de termos em transacao
    await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          displayName: displayName.trim(),
          email: cleanEmail,
          emailVerified: false,
          status: 'active',
        },
      });

      // Gravar registro formal de aceite de maioridade/termos
      await tx.termsAcceptance.create({
        data: {
          userId: newUser.id,
          type: 'age_eligibility',
          termsVersion: TERMS_VERSION,
        },
      });

      return newUser;
    });

    // 2. Gerar token de verificacao de e-mail (validade de 24 horas)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.verification.create({
      data: {
        identifier: cleanEmail,
        value: token,
        expiresAt,
      },
    });

    // 3. Disparar e-mail de verificacao
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';
    const verifyUrl = `${baseUrl}/verificar-email?token=${encodeURIComponent(token)}`;

    await sendVerificationEmail(cleanEmail, verifyUrl);

    return {
      success: true,
      emailPending: cleanEmail,
    };
  } catch (err) {
    console.error('[Register Action Error]', err);
    return {
      success: false,
      error: 'Ocorreu um erro interno ao processar seu cadastro. Tente novamente.',
    };
  }
}

/**
 * Server Action para confirmar o token de verificacao de e-mail.
 */
export async function confirmEmailToken(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  if (!token) {
    return { success: false, error: 'Token invalido ou ausente.' };
  }

  const prisma = getPrismaClient();

  const verification = await prisma.verification.findFirst({
    where: { value: token },
  });

  if (!verification) {
    return { success: false, error: 'Link de verificacao invalido ou ja utilizado.' };
  }

  if (verification.expiresAt < new Date()) {
    // Remover token expirado
    await prisma.verification.delete({ where: { id: verification.id } });
    return { success: false, error: 'Este link de verificacao expirou. Solicite um novo link.' };
  }

  // Marcar e-mail do usuario como verificado
  const user = await prisma.user.findFirst({
    where: { email: verification.identifier },
  });

  if (!user) {
    return { success: false, error: 'Usuario associado ao token nao foi encontrado.' };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.verification.delete({
      where: { id: verification.id },
    }),
  ]);

  return { success: true };
}

/**
 * Server Action para solicitar reenvio de e-mail de verificacao.
 */
export async function resendVerificationToken(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email ? email.trim().toLowerCase() : '';
  if (!cleanEmail) {
    return { success: false, error: 'Informe o e-mail cadastrado.' };
  }

  const prisma = getPrismaClient();

  const user = await prisma.user.findFirst({
    where: { email: cleanEmail, status: 'active' },
  });

  if (!user) {
    return { success: false, error: 'E-mail nao encontrado.' };
  }

  if (user.emailVerified) {
    return {
      success: false,
      error: 'Este e-mail ja foi verificado. Voce pode fazer login normalmente.',
    };
  }

  // Deletar tokens anteriores para o mesmo e-mail
  await prisma.verification.deleteMany({
    where: { identifier: cleanEmail },
  });

  // Criar novo token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.verification.create({
    data: {
      identifier: cleanEmail,
      value: token,
      expiresAt,
    },
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/verificar-email?token=${encodeURIComponent(token)}`;

  await sendVerificationEmail(cleanEmail, verifyUrl);

  return { success: true };
}

/**
 * Server Action para autenticacao (Login).
 * Valida existencia da conta, se o e-mail foi verificado e se o status e ativo.
 */
export async function loginUser(
  email: string,
): Promise<{ success: boolean; error?: string; redirectTo?: string }> {
  const cleanEmail = email ? email.trim().toLowerCase() : '';
  if (!cleanEmail) {
    return { success: false, error: 'Informe seu e-mail.' };
  }

  const prisma = getPrismaClient();

  const user = await prisma.user.findFirst({
    where: { email: cleanEmail },
  });

  if (!user) {
    return { success: false, error: 'E-mail ou credenciais invalidas.' };
  }

  if (user.status !== 'active') {
    return {
      success: false,
      error: 'Sua conta esta suspensa ou inativa. Entre em contato com a plataforma.',
    };
  }

  if (!user.emailVerified) {
    return {
      success: false,
      error: 'Seu e-mail ainda nao foi verificado. Confira sua caixa de entrada.',
    };
  }

  return { success: true, redirectTo: '/conta' };
}

/**
 * Server Action para encerramento de sessao (Logout).
 */
export async function logoutUser(): Promise<{ success: boolean }> {
  return { success: true };
}
