'use client';

// SUPERFICIE DIAGNOSTICA TEMPORARIA DE F1-010 — REMOVER ANTES DO MERGE.
//
// Dispara um erro nao tratado no navegador para provar a captura client-side.
// Nenhum efeito de negocio, nenhum dado real.

import { useEffect } from 'react';

export default function F1010ProbeClientPage() {
  useEffect(() => {
    setTimeout(() => {
      throw new Error('f1-010 probe: erro nao tratado de browser');
    }, 300);
  }, []);

  return (
    <main>
      <h1>F1-010 probe (cliente)</h1>
      <p>Disparando erro nao tratado de browser.</p>
    </main>
  );
}
