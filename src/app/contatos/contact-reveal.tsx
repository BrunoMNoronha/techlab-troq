'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { revealContact } from './actions';

// Botao "Ver contato" de UMA autorizacao (contact-release.md, CR-6.2 item 2;
// F3-010, #100). As propriedades sao so o id da autorizacao e o rotulo: o
// numero NAO esta no payload da pagina (C-11). Ele so chega aqui como resposta
// da Server Action, depois do gesto, e vive no estado deste navegador.
//
// O atalho para o WhatsApp e a ligacao sao montados AQUI, a partir do valor ja
// entregue (CR-6.4): nenhuma rota do TROQ recebe o numero nem redireciona.

/** `+55DD9XXXXXXXX` -> `(DD) 9XXXX-XXXX`; fixo -> `(DD) XXXX-XXXX`. */
export function formatBrazilianPhone(e164: string): string {
  const national = e164.replace(/^\+55/, '');
  const ddd = national.slice(0, 2);
  const subscriber = national.slice(2);
  const split = subscriber.length - 4;
  return `(${ddd}) ${subscriber.slice(0, split)}-${subscriber.slice(split)}`;
}

export function ContactReveal({ contactReleaseId }: { contactReleaseId: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function handleReveal() {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await revealContact(contactReleaseId);
      if (res.success) {
        setPhone(res.phone);
      } else if (res.reason === 'login_required') {
        router.push('/login?motivo=sessao');
        return;
      } else {
        setError(res.error);
      }
    } catch {
      setError('Não foi possível obter o contato. Verifique sua conexão e tente novamente.');
    }
    inFlight.current = false;
    setLoading(false);
  }

  if (phone) {
    const digits = phone.replace(/\D/g, '');
    return (
      <div role="status" style={{ marginTop: '12px' }}>
        <p style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: '#111827' }}>
          {formatBrazilianPhone(phone)}
        </p>
        <p style={{ margin: 0, display: 'flex', gap: '16px', fontSize: '14px' }}>
          <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer">
            Abrir no WhatsApp
          </a>
          <a href={`tel:${phone}`}>Ligar</a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '12px' }}>
      <button
        type="button"
        onClick={handleReveal}
        disabled={loading}
        style={{
          padding: '10px 16px',
          backgroundColor: loading ? '#93c5fd' : '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 600,
          fontSize: '14px',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Carregando...' : 'Ver contato'}
      </button>
      {error && (
        <p role="alert" style={{ color: '#b91c1c', fontSize: '14px', margin: '8px 0 0' }}>
          {error}
        </p>
      )}
    </div>
  );
}
