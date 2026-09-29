import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { HowItWorks } from './_components/how-it-works';
import { LatestOffers, OffersLoading } from './_components/latest-offers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'TROQ — anúncios entre pessoas com contato protegido',
  description:
    'Veja ofertas publicadas sem precisar de login. O contato do anunciante só é liberado à pessoa escolhida, após solicitação paga de R$ 0,99.',
};

const primaryLink = {
  display: 'inline-block',
  padding: '12px 20px',
  backgroundColor: '#2563eb',
  color: 'white',
  borderRadius: '6px',
  fontWeight: 600,
  textDecoration: 'none',
} as const;

const secondaryLink = {
  display: 'inline-block',
  padding: '12px 20px',
  backgroundColor: 'white',
  color: '#1d4ed8',
  border: '1px solid #bfdbfe',
  borderRadius: '6px',
  fontWeight: 600,
  textDecoration: 'none',
} as const;

const navLink = { color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' } as const;

export default function HomePage() {
  return (
    <div style={{ fontFamily: 'sans-serif', color: '#111827' }}>
      <header
        style={{
          maxWidth: '1040px',
          margin: '0 auto',
          padding: '16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <Link href="/" style={{ ...navLink, color: '#111827', fontSize: '20px' }}>
          TROQ
        </Link>
        <nav aria-label="Principal">
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <li>
              <Link href="/explorar" style={navLink}>
                Explorar ofertas
              </Link>
            </li>
            <li>
              <Link href="/login" style={navLink}>
                Entrar
              </Link>
            </li>
            <li>
              <Link href="/cadastro" style={navLink}>
                Criar conta
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '0 16px 48px' }}>
        <section style={{ padding: '24px 0 32px' }}>
          <h1 style={{ fontSize: 'clamp(26px, 6vw, 38px)', lineHeight: 1.2, margin: '0 0 12px' }}>
            Anúncios entre pessoas, com contato protegido
          </h1>
          <p
            style={{
              fontSize: '17px',
              lineHeight: 1.5,
              color: '#374151',
              maxWidth: '640px',
              margin: '0 0 20px',
            }}
          >
            No TROQ você vê as ofertas e os detalhes de cada anúncio sem precisar de login. O
            WhatsApp/telefone do anunciante só é liberado à pessoa que ele escolher.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <Link href="/explorar" style={primaryLink}>
              Explorar ofertas
            </Link>
            <Link href="/cadastro" style={secondaryLink}>
              Criar conta
            </Link>
          </div>
        </section>

        <section aria-labelledby="ofertas-recentes" style={{ padding: '8px 0 32px' }}>
          <h2 id="ofertas-recentes" style={{ fontSize: '22px', margin: '0 0 16px' }}>
            Ofertas recentes
          </h2>
          <Suspense fallback={<OffersLoading />}>
            <LatestOffers />
          </Suspense>
        </section>

        <div
          style={{
            padding: '24px',
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            marginBottom: '32px',
          }}
        >
          <HowItWorks />
        </div>

        <section aria-labelledby="para-anunciantes">
          <h2 id="para-anunciantes" style={{ fontSize: '22px', margin: '0 0 12px' }}>
            Quer anunciar?
          </h2>
          <p style={{ color: '#374151', fontSize: '15px', lineHeight: 1.5, margin: '0 0 16px' }}>
            Crie uma conta, confirme seu e-mail e cadastre seu anúncio. Ele só aparece para o
            público depois de publicado, e o seu contato nunca é exibido na página do anúncio.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <Link href="/cadastro" style={secondaryLink}>
              Criar conta
            </Link>
            <Link href="/anuncios" style={secondaryLink}>
              Meus anúncios
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
