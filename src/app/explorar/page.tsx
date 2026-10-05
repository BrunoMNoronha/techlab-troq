import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { BRAZILIAN_UFS, isBrazilianUf, ufOptionLabel } from '@/modules/listing/uf';
import { ExplorarLoading, ExplorarResults } from './explorar-results';
import {
  explorarHref,
  hasFilter,
  readExplorarQuery,
  type ExplorarSearchParams,
} from './explorar-query';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ofertas — TROQ',
  description: 'Ofertas publicadas no TROQ, abertas sem login.',
};

const fieldStyle = {
  display: 'block',
  width: '100%',
  minHeight: '44px',
  padding: '8px 12px',
  border: '1px solid #9ca3af',
  borderRadius: '6px',
  fontSize: '16px',
  boxSizing: 'border-box',
} as const;

const labelStyle = { display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '4px' };

export default async function ExplorarPage({
  searchParams,
}: {
  searchParams: Promise<ExplorarSearchParams>;
}) {
  const query = readExplorarQuery(await searchParams);
  const filtered = hasFilter(query);

  return (
    <main
      style={{
        maxWidth: '1040px',
        margin: '0 auto',
        padding: '24px 16px',
        fontFamily: 'sans-serif',
        color: '#111827',
      }}
    >
      <Link
        href="/"
        style={{ color: '#1d4ed8', textDecoration: 'none', fontSize: '14px', fontWeight: '600' }}
      >
        ← Início
      </Link>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: '12px 0 16px' }}>
        Anúncios no TROQ
      </h1>

      {/* Filtro por GET: a URL e a fonte de verdade, e a pagina volta a 1. */}
      <form
        method="get"
        action="/explorar"
        role="search"
        aria-label="Filtrar por localização"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <div style={{ flex: '1 1 200px' }}>
          <label htmlFor="filtro-cidade" style={labelStyle}>
            Cidade
          </label>
          <input
            id="filtro-cidade"
            name="city"
            type="text"
            defaultValue={query.city}
            autoComplete="address-level2"
            maxLength={120}
            style={fieldStyle}
          />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label htmlFor="filtro-uf" style={labelStyle}>
            UF
          </label>
          {/* A chave remonta o seletor quando a URL muda, para o valor acompanhar. */}
          <select
            key={query.state}
            id="filtro-uf"
            name="state"
            defaultValue={query.state}
            autoComplete="address-level1"
            style={{ ...fieldStyle, backgroundColor: 'white' }}
          >
            <option value="">Todos os estados</option>
            {/* Sigla inexistente vinda da URL continua filtrando (resultado vazio) e
                aparece como tal, em vez de "Todos os estados" ou outra UF. */}
            {query.state !== '' && !isBrazilianUf(query.state) && (
              <option value={query.state}>UF inválida ({query.state})</option>
            )}
            {BRAZILIAN_UFS.map((uf) => (
              <option key={uf.code} value={uf.code}>
                {ufOptionLabel(uf)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          style={{
            minHeight: '44px',
            padding: '0 20px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          Filtrar
        </button>
        {filtered && (
          <Link
            href={explorarHref({ page: 1, city: '', state: '' })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: '44px',
              color: '#1d4ed8',
              fontWeight: 600,
            }}
          >
            Limpar filtro
          </Link>
        )}
      </form>

      <section aria-label="Resultados">
        {/* A chave refaz o fallback a cada navegacao entre paginas/filtros. */}
        <Suspense key={explorarHref(query)} fallback={<ExplorarLoading />}>
          <ExplorarResults query={query} />
        </Suspense>
      </section>
    </main>
  );
}
