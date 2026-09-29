import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'TROQ',
  description:
    'Anúncios entre pessoas. O contato do anunciante só é liberado à pessoa escolhida, após solicitação paga de R$ 0,99.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      {/* Fundo e texto explicitos: as telas usam cores claras fixas, e sem isso o
          tema escuro do navegador deixaria texto escuro sobre fundo escuro. */}
      <body
        style={{ margin: 0, backgroundColor: '#ffffff', color: '#111827', colorScheme: 'light' }}
      >
        {children}
      </body>
    </html>
  );
}
