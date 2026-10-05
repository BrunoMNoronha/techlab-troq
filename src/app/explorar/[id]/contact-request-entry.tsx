import Link from 'next/link';
import type { ContactRequestEntryState } from '@/modules/request';
import { InterestFlow } from './interest-flow';

// Bloco "Solicitar desbloqueio do contato" do detalhe publico (#59). O estado
// vem do servidor (getContactRequestEntryView). Renderizar nao cria
// solicitacao, reserva nem cobranca: so a confirmacao explicita do
// `InterestFlow` chama o servidor (F3-012, #102), que revalida tudo.
export function ContactRequestEntry({
  listingId,
  state,
  ownRequestId = null,
}: {
  listingId: string;
  state: Exclude<ContactRequestEntryState, 'listing_unavailable'>;
  ownRequestId?: string | null;
}) {
  const loginHref = `/login?motivo=solicitar&next=${encodeURIComponent(`/explorar/${listingId}`)}`;

  return (
    <section
      aria-labelledby="solicitar-contato"
      style={{
        padding: '20px',
        backgroundColor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        color: '#1e3a8a',
        fontSize: '15px',
        lineHeight: 1.5,
      }}
    >
      <h2 id="solicitar-contato" style={{ fontSize: '18px', margin: '0 0 8px' }}>
        Contato do anunciante
      </h2>
      <p style={{ margin: '0 0 12px' }}>
        O WhatsApp/telefone do anunciante é protegido pela plataforma e não aparece nesta página.
      </p>
      <EntryMessage
        state={state}
        loginHref={loginHref}
        listingId={listingId}
        ownRequestId={ownRequestId}
      />
    </section>
  );
}

function EntryMessage({
  state,
  loginHref,
  listingId,
  ownRequestId,
}: {
  state: Exclude<ContactRequestEntryState, 'listing_unavailable'>;
  loginHref: string;
  listingId: string;
  ownRequestId: string | null;
}) {
  switch (state) {
    case 'login_required':
      return (
        <>
          <p style={{ margin: '0 0 12px' }}>
            Para solicitar o desbloqueio do contato, entre na sua conta. Entrar não gera cobrança
            nem solicitação.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <Link href={loginHref} style={primaryLink}>
              Entrar para solicitar
            </Link>
            <Link href="/cadastro" style={secondaryLink}>
              Criar conta
            </Link>
          </div>
        </>
      );
    case 'email_unverified':
      return (
        <p role="status" style={{ margin: 0 }}>
          Confirme seu e-mail para poder solicitar o desbloqueio do contato. Confira sua caixa de
          entrada.
        </p>
      );
    case 'account_restricted':
      return (
        <p role="status" style={{ margin: 0 }}>
          Sua conta está suspensa ou em exclusão e não pode solicitar o desbloqueio do contato.
        </p>
      );
    case 'own_listing':
      return (
        <p role="status" style={{ margin: 0 }}>
          Este anúncio é seu. Você não pode solicitar o próprio contato.
        </p>
      );
    case 'not_accepting':
      // Anunciante sem contato cadastrado (DEC-040): o motivo nao e exposto.
      return (
        <p role="status" style={{ margin: 0 }}>
          Este anúncio não está aceitando solicitações no momento. Nenhuma solicitação foi criada e
          nada foi cobrado.
        </p>
      );
    case 'own_request':
      return (
        <>
          <p role="status" style={{ margin: '0 0 12px' }}>
            Você já tem uma solicitação neste anúncio. Acompanhe o pagamento e a escolha do
            anunciante por lá; não é preciso solicitar de novo.
          </p>
          {ownRequestId && (
            <Link href={`/solicitacoes/${ownRequestId}`} style={primaryLink}>
              Acompanhar minha solicitação
            </Link>
          )}
        </>
      );
    case 'request_available':
      return <InterestFlow listingId={listingId} />;
    case 'no_slots':
      return (
        <p role="status" style={{ margin: 0 }}>
          As vagas de solicitação deste anúncio estão ocupadas no momento. Nenhuma solicitação foi
          criada e nada foi cobrado.
        </p>
      );
  }
}

const primaryLink = {
  display: 'inline-block',
  padding: '10px 18px',
  backgroundColor: '#1d4ed8',
  color: 'white',
  borderRadius: '6px',
  fontWeight: 600,
  textDecoration: 'none',
} as const;

const secondaryLink = {
  display: 'inline-block',
  padding: '10px 18px',
  backgroundColor: 'white',
  color: '#1d4ed8',
  border: '1px solid #bfdbfe',
  borderRadius: '6px',
  fontWeight: 600,
  textDecoration: 'none',
} as const;
