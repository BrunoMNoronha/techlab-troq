'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser } from '@/modules/identity/actions';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const res = await loginUser(email);
    setLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Erro ao efetuar login.');
    } else if (res.redirectTo) {
      window.location.href = res.redirectTo;
    }
  }

  return (
    <main
      style={{ maxWidth: '440px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif' }}
    >
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Entrar no TROQ</h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
        Informe suas credenciais para acessar sua conta.
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '16px',
            }}
            placeholder="Sua senha"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: '8px',
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
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <p style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px', color: '#4b5563' }}>
          Não tem uma conta?{' '}
          <a
            href="/cadastro"
            style={{ color: '#2563eb', textDecoration: 'none', fontWeight: '600' }}
          >
            Cadastre-se
          </a>
        </p>
      </form>
    </main>
  );
}
