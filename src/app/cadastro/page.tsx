'use client';

import { useState } from 'react';
import { registerUser } from '@/modules/identity/actions';

export default function CadastroPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [over18, setOver18] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const res = await registerUser({
      displayName,
      email,
      password,
      over18,
      termsAccepted,
    });

    setLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Erro ao realizar cadastro.');
    } else if (res.emailPending) {
      setEmailPending(res.emailPending);
    }
  }

  if (emailPending) {
    return (
      <main
        style={{
          maxWidth: '480px',
          margin: '40px auto',
          padding: '24px',
          fontFamily: 'sans-serif',
        }}
      >
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
          Confirme seu e-mail
        </h1>
        <p style={{ color: '#4b5563', marginBottom: '16px' }}>
          Enviamos um link de confirmação para <strong>{emailPending}</strong>. Por favor, acesse
          sua caixa de entrada e clique no link para ativar sua conta.
        </p>
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#eff6ff',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#1e40af',
          }}
        >
          💡 Não encontrou? Verifique sua caixa de spam ou lixo eletrônico.
        </div>
      </main>
    );
  }

  return (
    <main
      style={{ maxWidth: '480px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif' }}
    >
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
        Criar conta no TROQ
      </h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
        Plataforma direta de anúncios entre pessoas.
      </p>

      {errorMessage && (
        <div
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
          {errorMessage}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <div>
          <label
            htmlFor="displayName"
            style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}
          >
            Nome de exibição
          </label>
          <input
            id="displayName"
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '16px',
            }}
            placeholder="Como quer ser chamado(a)"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}
          >
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '16px',
            }}
            placeholder="seu@email.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}
          >
            Senha
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '16px',
            }}
            placeholder="Mínimo de 8 caracteres"
          />
        </div>

        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              required
              checked={over18}
              onChange={(e) => setOver18(e.target.checked)}
              style={{ marginTop: '2px' }}
            />
            <span>
              Declaro ter <strong>18 anos de idade ou mais</strong>.
            </span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              required
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              style={{ marginTop: '2px' }}
            />
            <span>
              Li e aceito os <strong>Termos de Uso e Política da Plataforma</strong>.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: '16px',
            width: '100%',
            padding: '12px',
            backgroundColor: loading ? '#9ca3af' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Cadastrando...' : 'Criar minha conta'}
        </button>
      </form>
    </main>
  );
}
