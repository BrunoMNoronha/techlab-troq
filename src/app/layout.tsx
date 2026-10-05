import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/feedback';
import { AppShell, type NavItem } from '@/components/layout';
import { TextLink } from '@/components/ui';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'TROQ',
  description:
    'Anúncios entre pessoas. O contato do anunciante só é liberado à pessoa escolhida, após solicitação paga de R$ 0,99.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

// A moldura não lê sessão: os destinos são os mesmos para todos, e as rotas
// privadas continuam redirecionando para o login no servidor (IC-8.1).
const DESKTOP_NAV: readonly NavItem[] = [
  { href: '/explorar', label: 'Explorar', icon: 'search' },
  { href: '/anuncios', label: 'Meus anúncios', icon: 'tag' },
  { href: '/solicitacoes', label: 'Solicitações', icon: 'inbox' },
  { href: '/contatos', label: 'Contatos', icon: 'phone' },
];

const MOBILE_NAV: readonly NavItem[] = [
  { href: '/explorar', label: 'Explorar', icon: 'search' },
  { href: '/anuncios', label: 'Meus anúncios', shortLabel: 'Anúncios', icon: 'tag' },
  { href: '/solicitacoes', label: 'Solicitações', shortLabel: 'Pedidos', icon: 'inbox' },
  { href: '/contatos', label: 'Contatos', icon: 'phone' },
  { href: '/conta', label: 'Minha conta', shortLabel: 'Conta', icon: 'user' },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ToastProvider>
          <AppShell
            brand="TROQ"
            homeHref="/explorar"
            desktopNav={DESKTOP_NAV}
            mobileNav={MOBILE_NAV}
            primaryAction={{ href: '/anuncios/novo', label: 'Anunciar' }}
            accountLink={{ href: '/conta', label: 'Conta' }}
            footer={
              <>
                <span>TROQ — anúncios entre pessoas, com contato protegido.</span>
                <TextLink href="/politica/itens-proibidos">Itens proibidos</TextLink>
              </>
            }
          >
            {children}
          </AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
