import { List, ListItem, StatCard } from '@/components/data-display';
import { Grid, PageContainer, PageHeader, Section, Stack } from '@/components/layout';
import { BackLink } from '@/components/navigation';
import { ButtonLink, TextLink } from '@/components/ui';
import { ACTIVITY } from '../_components/sample-data';

// Modelo de painel: cabeçalho, indicadores, atividade recente e atalhos.
export default function TemplateDashboardPage() {
  return (
    <PageContainer width="wide">
      <PageHeader
        navigation={<BackLink href="/design-system">Design System</BackLink>}
        title="Painel"
        description="Resumo do que precisa de atenção hoje."
        actions={
          <ButtonLink href="/design-system/formulario" iconStart="plus">
            Novo registro
          </ButtonLink>
        }
      />

      <Stack gap={8}>
        <Section title="Indicadores" titleId="indicadores">
          <Grid columns="sm">
            <StatCard label="Registros ativos" value="128" hint="+12 neste mês" icon="package" />
            <StatCard label="Pendentes" value="7" hint="3 vencem hoje" icon="clock" />
            <StatCard label="Concluídos" value="342" hint="No ano" icon="check-circle" />
            <StatCard label="Valor total" value="R$ 48,2 mil" hint="Em aberto" icon="bar-chart" />
          </Grid>
        </Section>

        <Grid columns="split" gap={6}>
          <Section
            title="Atividade recente"
            titleId="atividade"
            actions={<TextLink href="/design-system/lista">Ver tudo</TextLink>}
          >
            <List>
              {ACTIVITY.map((item) => (
                <ListItem
                  key={item.id}
                  icon="clock"
                  title={item.title}
                  description={item.description}
                  href="/design-system/detalhes"
                />
              ))}
            </List>
          </Section>

          <Section title="Atalhos" titleId="atalhos">
            <List>
              <ListItem icon="plus" title="Criar registro" href="/design-system/formulario" />
              <ListItem icon="search" title="Buscar registros" href="/design-system/lista" />
              <ListItem icon="settings" title="Configurações" href="/design-system/configuracoes" />
            </List>
          </Section>
        </Grid>
      </Stack>
    </PageContainer>
  );
}
