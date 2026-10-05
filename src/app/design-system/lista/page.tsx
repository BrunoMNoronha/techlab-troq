import { DataTable, type DataTableColumn } from '@/components/data-display';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { Field, Filters, SearchInput, Select } from '@/components/forms';
import { Cluster, PageContainer, PageHeader, Stack } from '@/components/layout';
import { BackLink, Pagination } from '@/components/navigation';
import { Badge, Button, ButtonLink, Text, TextLink } from '@/components/ui';
import { RECORDS, STATUS, type SampleRecord } from '../_components/sample-data';

const COLUMNS: readonly DataTableColumn<SampleRecord>[] = [
  {
    key: 'name',
    header: 'Registro',
    role: 'primary',
    cell: (row) => <TextLink href="/design-system/detalhes">{row.name}</TextLink>,
  },
  {
    key: 'status',
    header: 'Situação',
    cell: (row) => <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>,
  },
  { key: 'owner', header: 'Responsável', cell: (row) => row.owner },
  { key: 'updatedAt', header: 'Atualizado em', role: 'secondary', cell: (row) => row.updatedAt },
  { key: 'amount', header: 'Valor', align: 'end', cell: (row) => row.amount },
  {
    key: 'actions',
    header: 'Ações',
    role: 'actions',
    cell: (row) => (
      <ButtonLink
        href="/design-system/formulario"
        variant="outline"
        size="sm"
        aria-label={`Editar ${row.name}`}
      >
        Editar
      </ButtonLink>
    ),
  },
];

const STATES = [
  { value: '', label: 'Com dados' },
  { value: 'vazio', label: 'Vazio' },
  { value: 'carregando', label: 'Carregando' },
  { value: 'erro', label: 'Erro' },
] as const;

// Modelo de listagem: cabeçalho com ação, busca e filtros por GET, tabela que
// vira cartões no celular, paginação e os estados vazio, carregando e erro
// (alternados aqui por `?estado=`, só para demonstração).
export default async function TemplateListPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado = '' } = await searchParams;

  return (
    <PageContainer width="wide">
      <PageHeader
        navigation={<BackLink href="/design-system">Design System</BackLink>}
        title="Registros"
        description="Todos os registros da sua equipe."
        actions={
          <ButtonLink href="/design-system/formulario" iconStart="plus">
            Novo registro
          </ButtonLink>
        }
      />

      <Stack gap={6}>
        <Filters
          method="get"
          action="/design-system/lista"
          role="search"
          aria-label="Filtrar registros"
        >
          <Field label="Buscar" htmlFor="filtro-busca">
            <SearchInput id="filtro-busca" name="q" placeholder="Nome ou código" />
          </Field>
          <Field label="Situação" htmlFor="filtro-situacao">
            <Select id="filtro-situacao" name="situacao" defaultValue="">
              <option value="">Todas</option>
              <option value="active">Ativo</option>
              <option value="pending">Pendente</option>
              <option value="archived">Arquivado</option>
            </Select>
          </Field>
          <Button type="submit" variant="outline" iconStart="filter">
            Filtrar
          </Button>
        </Filters>

        <Cluster gap={2} aria-label="Estado demonstrado" role="group">
          <Text as="span" size="small" tone="muted">
            Estado:
          </Text>
          {STATES.map((state) => (
            <ButtonLink
              key={state.value}
              href={
                state.value ? `/design-system/lista?estado=${state.value}` : '/design-system/lista'
              }
              variant={estado === state.value ? 'secondary' : 'outline'}
              size="sm"
              aria-current={estado === state.value ? 'true' : undefined}
            >
              {state.label}
            </ButtonLink>
          ))}
        </Cluster>

        {estado === 'carregando' ? (
          <div role="status">
            <span className="sr-only">Carregando registros...</span>
            <Stack gap={3}>
              <Skeleton variant="block" />
              <Skeleton variant="block" />
              <Skeleton variant="block" />
            </Stack>
          </div>
        ) : estado === 'erro' ? (
          <ErrorState
            title="Não foi possível carregar os registros"
            description="Seus dados não foram perdidos. Tente novamente em instantes."
            action={
              <ButtonLink href="/design-system/lista" iconStart="refresh">
                Tentar novamente
              </ButtonLink>
            }
          />
        ) : estado === 'vazio' ? (
          <EmptyState
            icon="search"
            title="Nenhum registro encontrado"
            description="Ajuste a busca ou limpe os filtros para ver todos os registros."
            action={
              <ButtonLink href="/design-system/lista" variant="outline">
                Limpar filtros
              </ButtonLink>
            }
          />
        ) : (
          <>
            <DataTable
              caption="Registros da equipe"
              columns={COLUMNS}
              rows={RECORDS}
              rowKey={(row) => row.id}
            />
            <Pagination next={{ href: '/design-system/lista' }} status="Página 1 de 3" />
          </>
        )}
      </Stack>
    </PageContainer>
  );
}
