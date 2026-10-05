import { redirect } from 'next/navigation';

// A entrada do site e a vitrine publica de anuncios: `/` so encaminha para
// `/explorar`, que abre sem login. Nao ha conteudo proprio nesta rota.
export const dynamic = 'force-dynamic';

export default function HomePage(): never {
  redirect('/explorar');
}
