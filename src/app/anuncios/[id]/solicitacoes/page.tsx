import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { loginRedirectPath, validateSession } from '@/modules/identity';
import { getListingTitles } from '@/modules/listing';
import { getSelectionOptions } from '@/modules/negotiation';
import { LISTING_STATUS_LABELS } from '../../_components/listing-status';
import { SelectionPanel } from './selection-panel';

// Solicitacoes pagas elegiveis do anuncio e escolha, so para o dono (F3-012,
// #102; PD-11.3; RF-013). Os dados vem de `getSelectionOptions`, lido aqui no
// Server Component, e nao viram endpoint de consulta. Anuncio alheio,
// inexistente ou com ID malformado: o mesmo 404. Interesse gratuito e reserva
// nao paga nunca aparecem (interest-flow.md, secao 6; CR-4.2).
//
// Sem `loading.tsx` de proposito: o 404 e o redirecionamento de login
// precisam do status HTTP real (achado de F2-006).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Solicitações do anúncio — TROQ',
  robots: { index: false, follow: false },
};

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export default async function SolicitacoesDoAnuncioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const here = `/anuncios/${id}/solicitacoes`;
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    redirect(`${loginRedirectPath(session.reason)}&next=${encodeURIComponent(here)}`);
  }

  const result = await getSelectionOptions(id);
  if (!result.success) {
    if (result.reason === 'not_found') notFound();
    if (result.reason !== 'error') {
      redirect(`${loginRedirectPath('no_session')}&next=${encodeURIComponent(here)}`);
    }
  }

  const options = result.success ? result.options : null;
  const title = options ? ((await getListingTitles([id])).get(id) ?? null) : null;

  return (
    <main
      style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'sans-serif',
      }}
    >
      <Link
        href="/anuncios"
        style={{ color: '#1d4ed8', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}
      >
        ← Meus anúncios
      </Link>
      <h1 style={{ fontSize: '24px', margin: '16px 0 4px' }}>Solicitações pagas</h1>

      {!options ? (
        <div
          role="alert"
          style={{
            marginTop: '16px',
            padding: '16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
          }}
        >
          <p style={{ margin: '0 0 8px' }}>
            Não foi possível carregar as solicitações agora. Nada foi alterado.
          </p>
          <Link href={here} style={{ color: '#991b1b', fontWeight: 600 }}>
            Tentar novamente
          </Link>
        </div>
      ) : (
        <>
          <p style={{ margin: '0 0 8px', color: '#374151', overflowWrap: 'anywhere' }}>
            {title ?? 'Anúncio removido'}{' '}
            <span
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor: LISTING_STATUS_LABELS[options.listingStatus].bg,
                color: LISTING_STATUS_LABELS[options.listingStatus].color,
              }}
            >
              {LISTING_STATUS_LABELS[options.listingStatus].label}
            </span>
          </p>
          <p style={{ margin: '0 0 20px', color: '#4b5563', fontSize: '14px', lineHeight: 1.5 }}>
            Aqui aparecem só as solicitações com pagamento confirmado, no máximo três por anúncio.
            Você escolhe uma pessoa, e só ela recebe o seu WhatsApp/telefone. Interesses gratuitos e
            reservas ainda não pagas não aparecem.
          </p>

          {options.activeNegotiation && (
            <section
              role="status"
              aria-label="Negociação em andamento"
              style={{
                padding: '16px',
                marginBottom: '20px',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                color: '#14532d',
              }}
            >
              <h2 style={{ fontSize: '17px', margin: '0 0 8px', overflowWrap: 'anywhere' }}>
                Você escolheu {options.activeNegotiation.chosenDisplayName}
              </h2>
              <p style={{ margin: 0 }}>
                O seu contato foi liberado só para essa pessoa. Enquanto esta negociação estiver em
                andamento, não é possível escolher outra pessoa.
              </p>
            </section>
          )}

          {options.blockedBy === 'listing_removed' && (
            <p role="status" style={blockedNote}>
              Este anúncio foi removido e não admite escolha.
            </p>
          )}
          {options.blockedBy === 'listing_not_published' && (
            <p role="status" style={blockedNote}>
              Para escolher outra pessoa, o anúncio precisa estar publicado.
            </p>
          )}

          <h2 style={{ fontSize: '18px', margin: '0 0 12px' }}>
            {options.activeNegotiation ? 'Outras solicitações pagas' : 'Escolha uma pessoa'}
          </h2>
          <SelectionPanel
            listingId={id}
            blocked={options.blockedBy !== null}
            reselection={options.mode === 'reselection'}
            candidates={options.candidates.map((c) => ({
              contactRequestId: c.contactRequestId,
              requesterDisplayName: c.requesterDisplayName,
              paidAtLabel: DATE_TIME.format(new Date(c.paidAt)),
            }))}
          />
        </>
      )}
    </main>
  );
}

const blockedNote = {
  padding: '12px',
  margin: '0 0 20px',
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  color: '#374151',
  fontSize: '14px',
} as const;
