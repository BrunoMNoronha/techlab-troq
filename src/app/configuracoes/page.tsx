import { notFound, redirect } from 'next/navigation';
import { getDemoDataSummary, requireDemoTarget, type DemoSummary } from '@/modules/demo-data';
import { loginRedirectPath, validateSession } from '@/modules/identity';
import { ErrorState } from '@/components/feedback';
import { PageContainer, PageHeader } from '@/components/layout';
import { BackLink } from '@/components/navigation';
import { DemoProducts } from './demo-products';

export const dynamic = 'force-dynamic';

export default async function ConfiguracoesPage() {
  const session = await validateSession();
  if (!session.isValid || !session.user) {
    redirect(loginRedirectPath(session.reason));
  }

  try {
    requireDemoTarget();
  } catch {
    notFound();
  }

  let summary: DemoSummary | null = null;
  try {
    summary = await getDemoDataSummary();
  } catch {
    // Nunca renderiza mensagens do banco ou da configuração para o navegador.
  }

  return (
    <PageContainer width="content">
      <PageHeader
        navigation={<BackLink href="/conta">Minha Conta</BackLink>}
        title="Configurações"
        description="Gerencie os produtos exemplares deste ambiente de testes."
      />
      {summary ? (
        <DemoProducts summary={summary} />
      ) : (
        <ErrorState
          title="Produtos exemplares indisponíveis"
          description="Não foi possível consultar o lote. Atualize a página para tentar novamente."
        />
      )}
    </PageContainer>
  );
}
