import { DescriptionList, List, ListItem } from '@/components/data-display';
import { Alert } from '@/components/feedback';
import { Grid, PageContainer, PageHeader, Section, Stack } from '@/components/layout';
import { Breadcrumb, Stepper } from '@/components/navigation';
import { Badge, Button, ButtonLink, Card, Text } from '@/components/ui';
import { ACTIVITY, RECORDS, STATUS } from '../_components/sample-data';

// Modelo de detalhes: informações principais, metadados, histórico e ações
// contextuais. Em telas largas, os metadados vão para a coluna lateral.
export default function TemplateDetailsPage() {
  const record = RECORDS[0];

  return (
    <PageContainer width="wide">
      <PageHeader
        navigation={
          <Breadcrumb
            items={[
              { label: 'Design System', href: '/design-system' },
              { label: 'Registros', href: '/design-system/lista' },
              { label: record.id },
            ]}
          />
        }
        title={record.name}
        meta={
          <>
            <Badge tone={STATUS[record.status].tone}>{STATUS[record.status].label}</Badge>
            <Text as="span" size="small" tone="muted">
              {record.id}
            </Text>
          </>
        }
        actions={
          <>
            <ButtonLink href="/design-system/formulario" iconStart="edit">
              Editar
            </ButtonLink>
            <Button variant="dangerOutline" iconStart="trash">
              Arquivar
            </Button>
          </>
        }
      />

      <Grid columns="split" gap={6}>
        <Stack gap={6}>
          <Alert tone="info" title="Aguardando aprovação">
            Este registro será revisado pela equipe responsável em até dois dias úteis.
          </Alert>

          <Section title="Andamento" titleId="andamento">
            <Stepper
              label="Etapas do registro"
              steps={['Criado', 'Em revisão', 'Aprovado']}
              current={2}
            />
          </Section>

          <Section title="Descrição" titleId="descricao">
            <Card padding="lg">
              <Text tone="muted">
                Texto descritivo do registro. A coluna principal traz o conteúdo que a pessoa veio
                ler; dados de apoio ficam ao lado em telas largas e abaixo no celular.
              </Text>
            </Card>
          </Section>

          <Section title="Histórico" titleId="historico">
            <List>
              {ACTIVITY.map((item) => (
                <ListItem
                  key={item.id}
                  icon="clock"
                  title={item.title}
                  description={item.description}
                />
              ))}
            </List>
          </Section>
        </Stack>

        <Section title="Informações" titleId="informacoes" headingLevel={2}>
          <Card padding="lg">
            <DescriptionList
              layout="inline"
              items={[
                { term: 'Responsável', detail: record.owner },
                { term: 'Valor', detail: record.amount },
                { term: 'Atualizado em', detail: record.updatedAt },
                { term: 'Criado em', detail: '12/08/2026' },
              ]}
            />
          </Card>
        </Section>
      </Grid>
    </PageContainer>
  );
}
