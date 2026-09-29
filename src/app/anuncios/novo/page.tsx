import { redirect } from 'next/navigation';
import { loginRedirectPath, validateSession } from '@/modules/identity';
import { ListingForm } from '../_components/listing-form';

export const dynamic = 'force-dynamic';

export default async function NovoAnuncioPage() {
  const sessionResult = await validateSession();

  if (!sessionResult.isValid || !sessionResult.user) {
    redirect(loginRedirectPath(sessionResult.reason));
  }

  return (
    <main
      style={{ maxWidth: '540px', margin: '24px auto', padding: '16px', fontFamily: 'sans-serif' }}
    >
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Novo anúncio</h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
        Seu anúncio será salvo como <strong>rascunho</strong>, visível só para você. Informe apenas
        a cidade e a UF como localização.
      </p>

      <ListingForm mode="create" />

      {/* Espaco reservado para imagens: upload e processamento pertencem a F2-008 (#46). */}
      <p
        style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: '6px',
          fontSize: '14px',
          color: '#6b7280',
        }}
      >
        📷 <strong>Imagens do produto:</strong> para ser publicado, o anúncio precisará de 1 a 6
        fotos. O envio de fotos ainda não está disponível.
      </p>
    </main>
  );
}
