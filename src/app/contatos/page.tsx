import { redirect } from 'next/navigation';
import { listOwnContactReleases } from '@/modules/contact';
import { loginRedirectPath, validateSession } from '@/modules/identity';
import { getListingTitles } from '@/modules/listing';
import { ContactReveal } from './contact-reveal';

// Tela do escolhido: os contatos liberados para ele (F3-010, #100;
// contact-release.md, CR-6 e CR-7). A pagina lista as autorizacoes DO ATOR
// (CR-5.3) e nunca contem o numero: ele so sai pela Server Action, sob gesto
// explicito, reverificado a cada chamada (CR-6.2 item 2).
//
// Dinamica e sem cache (CR-7.4): `force-dynamic`, `nodejs`, sem `revalidate`,
// e nenhuma leitura passa por cache de dados.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export default async function ContatosPage() {
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    redirect(loginRedirectPath(session.reason));
  }

  const releases = await listOwnContactReleases();
  if (!releases) {
    redirect(loginRedirectPath('no_session'));
  }
  const titles = await getListingTitles(releases.map((r) => r.listingId));

  return (
    <main
      style={{ maxWidth: '600px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif' }}
    >
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
        Contatos liberados para você
      </h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
        Quando um anunciante escolhe a sua solicitação paga, o contato dele fica disponível aqui.
        Cada consulta é registrada.
      </p>

      {releases.length === 0 ? (
        <p style={{ color: '#374151', fontSize: '15px' }}>
          Nenhum contato foi liberado para você ainda.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {releases.map((release) => (
            <li
              key={release.contactReleaseId}
              style={{
                padding: '20px',
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ fontSize: '17px', fontWeight: 600, margin: '0 0 4px' }}>
                {titles.get(release.listingId) ?? 'Anúncio indisponível'}
              </h2>
              <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>
                Liberado em {DATE_FORMAT.format(new Date(release.authorizedAt))}
              </p>
              <ContactReveal contactReleaseId={release.contactReleaseId} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
