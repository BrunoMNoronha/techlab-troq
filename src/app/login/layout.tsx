import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// A pagina e Client Component e nao exporta metadata; o titulo vem deste layout.
export const metadata: Metadata = { title: 'Entrar — TROQ' };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
