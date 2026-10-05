import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { GoogleAvailability } from '@/app/_components/google-sign-in';
import { isGoogleSignInAvailable } from '@/modules/identity/google';

// A pagina e Client Component e nao exporta metadata; o titulo vem deste layout.
export const metadata: Metadata = { title: 'Criar conta — TROQ' };

export default async function Layout({ children }: { children: ReactNode }) {
  // A disponibilidade do Google e lida a cada requisicao, nunca congelada no build.
  await connection();
  return <GoogleAvailability available={isGoogleSignInAvailable()}>{children}</GoogleAvailability>;
}
