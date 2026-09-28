'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { getListingForEdit, updateListing } from '@/modules/listing/actions';

export default function EditarAnuncioPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const listingId = resolvedParams.id;

  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [status, setStatus] = useState<string>('draft');

  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getListingForEdit(listingId).then((res) => {
      if (!active) return;
      setInitialLoading(false);

      if (!res.success || !res.listing) {
        setErrorMessage(res.error || 'Não foi possível carregar o anúncio.');
      } else {
        setTitle(res.listing.title);
        setDescription(res.listing.description);
        setCity(res.listing.city);
        setState(res.listing.state);
        setStatus(res.listing.status);
      }
    });

    return () => {
      active = false;
    };
  }, [listingId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const res = await updateListing(listingId, {
      title,
      description,
      city,
      state,
    });

    setLoading(false);

    if (!res.success) {
      setErrorMessage(res.error || 'Erro ao atualizar anúncio.');
    } else {
      router.push('/anuncios');
    }
  }

  if (initialLoading) {
    return (
      <main
        style={{
          maxWidth: '540px',
          margin: '40px auto',
          padding: '24px',
          fontFamily: 'sans-serif',
        }}
      >
        <p style={{ color: '#6b7280' }}>Carregando dados do anúncio...</p>
      </main>
    );
  }

  const isTerminal = status === 'closed' || status === 'removed';

  return (
    <main
      style={{ maxWidth: '540px', margin: '40px auto', padding: '24px', fontFamily: 'sans-serif' }}
    >
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Editar Anúncio</h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
        Status atual: <strong style={{ textTransform: 'capitalize' }}>{status}</strong>
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

      {isTerminal ? (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#f3f4f6',
            borderRadius: '6px',
            color: '#374151',
            fontSize: '14px',
          }}
        >
          Este anúncio está <strong>{status}</strong> e não pode mais ser editado.
        </div>
      ) : (
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
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '12px' }}>
            <div>
              <label
                htmlFor="city"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '4px',
                }}
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
              />
            </div>

            <div>
              <label
                htmlFor="state"
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '600',
                  marginBottom: '4px',
                }}
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
              />
            </div>
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
              {loading ? 'Salvando...' : 'Salvar Alterações'}
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
      )}
    </main>
  );
}
