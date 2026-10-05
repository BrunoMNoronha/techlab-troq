import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOwnContactStatus } from '@/modules/contact';
import { validateSession, logoutUser, loginRedirectPath } from '@/modules/identity';
import { hasLinkedGoogleAccount, isGoogleSignInAvailable } from '@/modules/identity/google';
import { ContactForm } from './contact-form';
import { GoogleLinkButton } from './google-link';

// Resultado da vinculacao da Conta Google, repassado por /login/google (IC-15.4).
const GOOGLE_LINK_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  vinculada: { text: 'Conta Google vinculada. Voce ja pode entrar com ela.', ok: true },
  cancelado: { text: 'A vinculacao com o Google foi cancelada.', ok: false },
  email_diferente: {
    text: 'A Conta Google escolhida tem outro e-mail. So e possivel vincular uma Conta Google com o mesmo e-mail desta conta, verificado pelo Google.',
    ok: false,
  },
  ja_vinculada: {
    text: 'Esta Conta Google ja esta vinculada a outra conta TROQ e nao pode ser transferida.',
    ok: false,
  },
  falha: {
    text: 'Nao foi possivel vincular a Conta Google. Confira se o e-mail esta verificado no Google e tente novamente.',
    ok: false,
  },
};

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

  const { erro, google } = await searchParams;
  const logoutFailed = erro === 'logout';
  const googleMessage = typeof google === 'string' ? GOOGLE_LINK_MESSAGES[google] : undefined;

  const user = sessionResult.user;
  // So o booleano do proprio dono; o numero nunca chega a esta pagina (CR-2.5).
  const contactStatus = await getOwnContactStatus();
  if (!contactStatus) {
    redirect(loginRedirectPath('no_session'));
  }
  const googleLinked = await hasLinkedGoogleAccount(user.id);
  const googleAvailable = isGoogleSignInAvailable();

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

      <section aria-labelledby="conta-google" style={{ marginBottom: '24px' }}>
        <h2 id="conta-google" style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
          Conta Google
        </h2>
        {googleMessage && (
          <p
            role={googleMessage.ok ? 'status' : 'alert'}
            style={{
              padding: '12px 16px',
              backgroundColor: googleMessage.ok ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${googleMessage.ok ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: '6px',
              color: googleMessage.ok ? '#166534' : '#991b1b',
              fontSize: '14px',
            }}
          >
            {googleMessage.text}
          </p>
        )}
        {googleLinked ? (
          <p style={{ color: '#374151', fontSize: '14px' }}>
            Sua Conta Google está vinculada e pode ser usada para entrar no TROQ.
          </p>
        ) : googleAvailable ? (
          <>
            <p style={{ color: '#4b5563', fontSize: '14px' }}>
              Vincule a Conta Google que usa o mesmo e-mail desta conta para entrar com ela.
            </p>
            <GoogleLinkButton />
          </>
        ) : (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            A entrada com Google não está disponível no momento.
          </p>
        )}
      </section>

      <p style={{ margin: '0 0 24px', fontSize: '15px' }}>
        <Link href="/contatos">Contatos liberados para você</Link>
      </p>

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
