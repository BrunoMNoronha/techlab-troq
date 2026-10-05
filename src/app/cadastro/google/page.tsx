import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { authErrorLabel, resolveAppOrigin } from '@/modules/identity/auth';
import {
  googleSignupCookieFor,
  isGoogleSignInAvailable,
  peekPendingGoogleSignup,
  type PendingGoogleSignup,
} from '@/modules/identity/google';
import { sanitizeReturnPath } from '@/modules/identity/return-path';
import { GoogleSignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Concluir cadastro com Google — TROQ' };
export const dynamic = 'force-dynamic';

// Conclusao do cadastro com Google (#81; identity-contract.md, IC-15.3). Chega
// aqui quem passou pelo Google com identidade ainda sem conta TROQ: o callback
// so gravou uma pendencia de 15 minutos, referenciada por cookie httpOnly.
// Nenhuma conta existe ate a pessoa declarar 18+ e aceitar os termos abaixo.

async function readPending(): Promise<PendingGoogleSignup | null> {
  try {
    const cookie = googleSignupCookieFor(resolveAppOrigin().baseURL);
    const handle = (await cookies()).get(cookie.name)?.value;
    return await peekPendingGoogleSignup(handle);
  } catch (err) {
    console.error('[Google Signup Page]', authErrorLabel(err));
    return null;
  }
}

export default async function GoogleSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next } = await searchParams;
  const returnTo = sanitizeReturnPath(next) ?? undefined;
  const pending = isGoogleSignInAvailable() ? await readPending() : null;

  return (
    <main
      style={{ maxWidth: '480px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif' }}
    >
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
        Concluir cadastro com Google
      </h1>

      {pending ? (
        <GoogleSignupForm email={pending.email} returnTo={returnTo} />
      ) : (
        <>
          <p role="status" style={{ color: '#4b5563', marginBottom: '16px' }}>
            Este cadastro com Google expirou, foi cancelado ou já foi concluído. Nenhuma conta foi
            criada sem a sua confirmação.
          </p>
          <p style={{ fontSize: '14px' }}>
            <a href="/cadastro" style={{ color: '#2563eb', fontWeight: '600' }}>
              Recomeçar o cadastro
            </a>{' '}
            ou{' '}
            <a href="/login" style={{ color: '#2563eb', fontWeight: '600' }}>
              entrar na sua conta
            </a>
            .
          </p>
        </>
      )}
    </main>
  );
}
