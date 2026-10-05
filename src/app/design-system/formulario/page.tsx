import { PageContainer, PageHeader } from '@/components/layout';
import { BackLink } from '@/components/navigation';
import { TemplateForm } from '../_components/demos';

// Modelo de cadastro/edição: retorno, campos agrupados em seções, validação
// por campo e ações fixas no celular.
export default function TemplateFormPage() {
  return (
    <PageContainer width="content">
      <PageHeader
        navigation={<BackLink href="/design-system/lista">Registros</BackLink>}
        title="Novo registro"
        description="Os campos com * são obrigatórios."
      />
      <TemplateForm />
    </PageContainer>
  );
}
