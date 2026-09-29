import { redirect } from 'next/navigation';
import { validateSession, logoutUser } from '@/modules/identity';

export const dynamic = 'force-dynamic';

const LOGIN_REASON = {
  no_session: 'sessao',
  blocked: 'bloqueada',
  deletion_requested: 'excluida',
  unverified: 'nao_verificada',
} as const;

export default async function ContaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    redirect(`/login?motivo=${LOGIN_REASON[sessionResult.reason ?? 'no_session']}`);
  }

  const { erro } = await searchParams;
  const logoutFailed = erro === 'logout';

  const user = sessionResult.user;

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

      <div
        style={{
          padding: '24px',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          marginBottom: '24px',
        }}
      >
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              fontSize: '12px',
              color: '#6b7280',
              textTransform: 'uppercase',
              fontWeight: 'bold',
            }}
          >
            Nome de exibição
          </label>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827' }}>
            {user.displayName}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              fontSize: '12px',
              color: '#6b7280',
              textTransform: 'uppercase',
              fontWeight: 'bold',
            }}
          >
            E-mail
          </label>
          <div style={{ fontSize: '16px', color: '#374151' }}>{user.email}</div>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label
            style={{
              fontSize: '12px',
              color: '#6b7280',
              textTransform: 'uppercase',
              fontWeight: 'bold',
            }}
          >
            Status da conta
          </label>
          <div>
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
          </div>
        </div>
      </div>

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
