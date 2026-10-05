import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

// Vitrine do design system e páginas-modelo (docs/engineering/design-system.md,
// seção 6). É material de desenvolvimento: não existe em produção e não é
// indexada. Não lê sessão, banco nem módulo de domínio.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Design System — TROQ',
  robots: { index: false, follow: false },
};

export default function DesignSystemLayout({ children }: { children: ReactNode }) {
  if (process.env.APP_ENV === 'production') {
    notFound();
  }
  return children;
}
