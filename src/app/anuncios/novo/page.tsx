'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createDraftListing } from '@/modules/listing/actions';

export default function NovoAnuncioPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const res = await createDraftListing({
      title,
      description,
      city,
      state,
    });

    setLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Erro ao criar rascunho.');
    } else {
      router.push('/anuncios');
    }
  }

  return (
    <main
      style={{ maxWidth: '540px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif' }}
    >
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Novo Anúncio</h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
        Seu anúncio será salvo inicialmente como <strong>Rascunho</strong>.
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
            htmlFor="title"
            style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}
          >
            Título do anúncio
          </label>
          <input
            id="title"
            type="text"
            required
            minLength={5}
            maxLength={60}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '16px',
            }}
            placeholder="Ex: Bicicleta Caloi Aro 29 em ótimo estado"
          />
        </div>

        <div>
          <label
            htmlFor="description"
            style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}
          >
            Descrição do item
          </label>
          <textarea
            id="description"
            required
            maxLength={1000}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '16px',
              resize: 'vertical',
            }}
            placeholder="Descreva o estado de conservação, detalhes técnicos e condições do produto."
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '12px' }}>
          <div>
            <label
              htmlFor="city"
              style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}
            >
              Cidade
            </label>
            <input
              id="city"
              type="text"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '16px',
              }}
              placeholder="Ex: São Paulo"
            />
          </div>

          <div>
            <label
              htmlFor="state"
              style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}
            >
              UF
            </label>
            <input
              id="state"
              type="text"
              required
              maxLength={2}
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '16px',
                textTransform: 'uppercase',
              }}
              placeholder="SP"
            />
          </div>
        </div>

        {/* Slot para imagens (F2-008) */}
        <div
          style={{
            padding: '16px',
            backgroundColor: '#f9fafb',
            border: '1px dashed #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            color: '#6b7280',
          }}
        >
          📷 <strong>Imagens do produto:</strong> Você poderá fazer o upload de até 6 fotos após
          salvar este rascunho.
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
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
            {loading ? 'Salbrando...' : 'Salvar Rascunho'}
          </button>
          <a
            href="/anuncios"
            style={{
              padding: '12px 20px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '16px',
              fontWeight: '600',
              textAlign: 'center',
            }}
          >
            Cancelar
          </a>
        </div>
      </form>
    </main>
  );
}
