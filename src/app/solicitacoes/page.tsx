import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listOwnContactReleases } from '@/modules/contact';
import { loginRedirectPath, validateSession } from '@/modules/identity';
import { listOwnContactRequests } from '@/modules/request';
import { CHOSEN_LABEL, DATE_TIME, loginPathWithReturn, PHASE_LABELS } from './_components/phase';

// Solicitacoes de contato da propria pessoa (F3-012, #102). So o ator ve as
// dele; nada de vagas, de outros solicitantes nem de dado de pagamento.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Minhas solicitações — TROQ',
  robots: { index: false, follow: false },
};

export default async function MinhasSolicitacoesPage() {
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    redirect(loginPathWithReturn(loginRedirectPath(session.reason), '/solicitacoes'));
  }

  const requests = await listOwnContactRequests();
  if (!requests) {
    redirect(loginPathWithReturn(loginRedirectPath('no_session'), '/solicitacoes'));
  }
  // Liberacoes do proprio ator, sem o numero (CR-1.2): so marcam a solicitacao escolhida.
  const chosenListings = requests.some((r) => r.phase === 'paid')
    ? new Set(((await listOwnContactReleases()) ?? []).map((r) => r.listingId))
    : new Set<string>();

  return (
    <main
      style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'sans-serif',
      }}
    >
      <h1 style={{ fontSize: '24px', margin: '0 0 8px' }}>Minhas solicitações</h1>
      <p style={{ color: '#4b5563', fontSize: '14px', margin: '0 0 24px' }}>
        Solicitações pagas de contato que você fez. Só você vê esta página.{' '}
        <Link href="/contatos" style={{ color: '#1d4ed8', fontWeight: 600 }}>
          Contatos liberados para você
        </Link>
      </p>

      {requests.length === 0 ? (
        <div
          style={{
            padding: '24px',
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            color: '#374151',
          }}
        >
          <p style={{ margin: '0 0 12px' }}>Você ainda não fez nenhuma solicitação.</p>
          <Link href="/explorar" style={{ color: '#1d4ed8', fontWeight: 600 }}>
            Explorar ofertas
          </Link>
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {requests.map((item) => {
            const phase =
              item.phase === 'paid' && chosenListings.has(item.listingId)
                ? CHOSEN_LABEL
                : PHASE_LABELS[item.phase];
            const title = item.listingTitle ?? 'Anúncio indisponível';
            return (
              <li
                key={item.contactRequestId}
                style={{
                  padding: '16px',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  minWidth: 0,
                }}
              >
                <h2 style={{ fontSize: '17px', margin: 0, overflowWrap: 'anywhere' }}>{title}</h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#4b5563' }}>
                  Feita em {DATE_TIME.format(new Date(item.createdAt))}
                </p>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: phase.bg,
                      color: phase.color,
                    }}
                  >
                    {phase.label}
                  </span>
                  <Link
                    href={`/solicitacoes/${item.contactRequestId}`}
                    aria-label={`Acompanhar a solicitação de ${title}`}
                    style={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' }}
                  >
                    Acompanhar
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
