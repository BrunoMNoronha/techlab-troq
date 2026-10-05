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
import { Alert } from '@/components/feedback';
import { PageContainer, PageHeader, Stack } from '@/components/layout';
import { Text, TextLink } from '@/components/ui';
import { GoogleSignupForm } from './signup-form';

export const metadata: Metadata = { title: 'Concluir cadastro com Google — TROQS' };
export const dynamic = 'force-dynamic';

// Conclusao do cadastro com Google (#81; identity-contract.md, IC-15.3). Chega
// aqui quem passou pelo Google com identidade ainda sem conta TROQS: o callback
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
    <PageContainer width="narrow">
      <PageHeader title="Concluir cadastro com Google" />

      {pending ? (
        <GoogleSignupForm email={pending.email} returnTo={returnTo} />
      ) : (
        <Stack gap={6}>
          <Alert tone="info" role="status">
            Este cadastro com Google expirou, foi cancelado ou já foi concluído. Nenhuma conta foi
            criada sem a sua confirmação.
          </Alert>
          <Text size="small">
            <TextLink href="/cadastro" reload>
              Recomeçar o cadastro
            </TextLink>{' '}
            ou{' '}
            <TextLink href="/login" reload>
              entrar na sua conta
            </TextLink>
            .
          </Text>
        </Stack>
      )}
    </PageContainer>
  );
}
