import { redirect } from 'next/navigation';
import { getOwnContactStatus } from '@/modules/contact';
import { validateSession, logoutUser, loginRedirectPath } from '@/modules/identity';
import { ContactForm } from './contact-form';

export const dynamic = 'force-dynamic';

export default async function ContaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    redirect(loginRedirectPath(sessionResult.reason));
  }

  const { erro } = await searchParams;
  const logoutFailed = erro === 'logout';

  const user = sessionResult.user;
  // So o booleano do proprio dono; o numero nunca chega a esta pagina (CR-2.5).
  const contactStatus = await getOwnContactStatus();
  if (!contactStatus) {
    redirect(loginRedirectPath('no_session'));
  }

  async function handleLogout() {
    'use server';
    const result = await logoutUser();
    redirect(result.success ? '/login?motivo=encerrada' : '/conta?erro=logout');
  }

  return (
    <main
      style={{ maxWidth: '600px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif' }}
    >
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Minha Conta</h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
        Área privada de gerenciamento do seu perfil no TROQ.
      </p>

      {/* Dados exibidos, nao campos de formulario: lista de definicao em vez de <label>. */}
      <dl
        style={{
          padding: '24px',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          marginTop: 0,
          marginBottom: '24px',
        }}
      >
        <div style={{ marginBottom: '16px' }}>
          <dt
            style={{
              fontSize: '12px',
              color: '#6b7280',
              textTransform: 'uppercase',
              fontWeight: 'bold',
            }}
          >
            Nome de exibição
          </dt>
          <dd style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
            {user.displayName}
          </dd>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <dt
            style={{
              fontSize: '12px',
              color: '#6b7280',
              textTransform: 'uppercase',
              fontWeight: 'bold',
            }}
          >
            E-mail
          </dt>
          <dd style={{ margin: 0, fontSize: '16px', color: '#374151' }}>{user.email}</dd>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <dt
            style={{
              fontSize: '12px',
              color: '#6b7280',
              textTransform: 'uppercase',
              fontWeight: 'bold',
            }}
          >
            Status da conta
          </dt>
          <dd style={{ margin: 0 }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 8px',
                backgroundColor: '#dcfce7',
                color: '#166534',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '4px',
              }}
            >
              Verificada e Ativa
            </span>
          </dd>
        </div>
      </dl>

      <ContactForm hasContact={contactStatus.hasContact} />

      {logoutFailed && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#991b1b',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          Nao foi possivel encerrar a sessao. Tente novamente.
        </div>
      )}

      <form action={handleLogout}>
        <button
          type="submit"
          style={{
            padding: '10px 20px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Sair da Conta
        </button>
      </form>
    </main>
  );
}
