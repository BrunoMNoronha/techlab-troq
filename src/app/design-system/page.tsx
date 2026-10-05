import { DescriptionList, List, ListItem, MediaFrame, StatCard } from '@/components/data-display';
import { Alert, EmptyState, ErrorState, Progress, Skeleton, Spinner } from '@/components/feedback';
import {
  Checkbox,
  DateInput,
  Field,
  FieldRow,
  Input,
  Radio,
  SearchInput,
  Select,
  Switch,
  Textarea,
} from '@/components/forms';
import { Cluster, Grid, PageContainer, PageHeader, Section, Stack } from '@/components/layout';
import { Breadcrumb, Pagination, Stepper } from '@/components/navigation';
import {
  Accordion,
  Badge,
  Button,
  ButtonLink,
  Card,
  Divider,
  Heading,
  Icon,
  IconButton,
  Text,
  TextLink,
  Tooltip,
  type IconName,
} from '@/components/ui';
import { OverlayDemo } from './_components/demos';
import { TokenSwatch } from './_components/token-swatch';

const TEMPLATES = [
  {
    href: '/design-system/painel',
    title: 'Painel',
    description: 'Indicadores, atividade e atalhos',
    icon: 'bar-chart',
  },
  {
    href: '/design-system/lista',
    title: 'Listagem',
    description: 'Filtros, tabela responsiva, paginação e estados',
    icon: 'filter',
  },
  {
    href: '/design-system/formulario',
    title: 'Formulário',
    description: 'Cadastro e edição com validação',
    icon: 'edit',
  },
  {
    href: '/design-system/detalhes',
    title: 'Detalhes',
    description: 'Registro, metadados, histórico e ações',
    icon: 'eye',
  },
  {
    href: '/design-system/configuracoes',
    title: 'Configurações',
    description: 'Categorias em abas e preferências',
    icon: 'settings',
  },
] as const satisfies ReadonlyArray<{
  href: string;
  title: string;
  description: string;
  icon: IconName;
}>;

const COLOR_TOKENS = [
  '--color-primary',
  '--color-primary-soft',
  '--color-secondary',
  '--color-accent',
  '--color-background',
  '--color-surface',
  '--color-surface-muted',
  '--color-text',
  '--color-text-muted',
  '--color-border',
  '--color-border-control',
  '--color-success',
  '--color-warning',
  '--color-error',
  '--color-info',
] as const;

const SPACE_TOKENS = [
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-6',
  '--space-8',
  '--space-10',
  '--space-12',
  '--space-16',
] as const;

const ICONS: readonly IconName[] = [
  'home',
  'search',
  'tag',
  'inbox',
  'user',
  'phone',
  'plus',
  'check',
  'x',
  'edit',
  'trash',
  'copy',
  'clock',
  'map-pin',
  'image',
  'upload',
  'lock',
  'shield',
  'swap',
  'mail',
  'filter',
  'settings',
  'refresh',
  'info',
  'alert-triangle',
];

// Vitrine do design system: tokens e componentes com seus estados. Referência
// viva de docs/engineering/design-system.md.
export default function DesignSystemPage() {
  return (
    <PageContainer width="wide">
      <PageHeader
        title="Design System"
        description="Tokens, componentes e páginas-modelo do TROQ. Toda tela nova se monta com o que está aqui."
      />

      <Stack gap={12}>
        <Section title="Páginas-modelo" titleId="modelos">
          <List>
            {TEMPLATES.map((template) => (
              <ListItem key={template.href} {...template} />
            ))}
          </List>
        </Section>

        <Section title="Cores" titleId="cores">
          <Grid columns="sm" gap={3}>
            {COLOR_TOKENS.map((token) => (
              <TokenSwatch key={token} token={token} kind="color" />
            ))}
          </Grid>
        </Section>

        <Section title="Tipografia" titleId="tipografia">
          <Card padding="lg">
            <Stack gap={3}>
              <Heading level={3} size="display">
                Display — chamada principal
              </Heading>
              <Heading level={3} size="h1">
                H1 — título de página
              </Heading>
              <Heading level={3} size="h2">
                H2 — título de seção
              </Heading>
              <Heading level={3}>H3 — título de bloco</Heading>
              <Heading level={4}>H4 — título de item</Heading>
              <Text>Body — texto corrido de 16px, com altura de linha 1,5.</Text>
              <Text size="small" tone="muted">
                Body small — descrições e textos de apoio.
              </Text>
              <Text size="caption" tone="subtle">
                Caption — metadados e legendas.
              </Text>
              <TextLink href="/design-system">TextLink — link em destaque</TextLink>
            </Stack>
          </Card>
        </Section>

        <Section title="Espaçamento, raio e sombra" titleId="medidas">
          <Card padding="lg">
            <Stack gap={6}>
              <Stack gap={2}>
                {SPACE_TOKENS.map((token) => (
                  <TokenSwatch key={token} token={token} kind="space" />
                ))}
              </Stack>
              <Cluster gap={6} align="end">
                <TokenSwatch token="--radius-sm" kind="radius" />
                <TokenSwatch token="--radius-md" kind="radius" />
                <TokenSwatch token="--radius-lg" kind="radius" />
                <TokenSwatch token="--radius-full" kind="radius" />
              </Cluster>
              <Cluster gap={8} align="end">
                <TokenSwatch token="--shadow-sm" kind="shadow" />
                <TokenSwatch token="--shadow-md" kind="shadow" />
                <TokenSwatch token="--shadow-lg" kind="shadow" />
              </Cluster>
            </Stack>
          </Card>
        </Section>

        <Section title="Ícones" titleId="icones">
          <Card padding="lg">
            <Cluster gap={4}>
              {ICONS.map((name) => (
                <Icon key={name} name={name} size={24} label={name} />
              ))}
            </Cluster>
          </Card>
        </Section>

        <Section title="Botões" titleId="botoes">
          <Card padding="lg">
            <Stack>
              <Cluster>
                <Button>Primário</Button>
                <Button variant="secondary">Secundário</Button>
                <Button variant="outline">Contorno</Button>
                <Button variant="ghost">Fantasma</Button>
                <Button variant="danger">Perigo</Button>
                <Button variant="dangerOutline">Perigo (contorno)</Button>
              </Cluster>
              <Cluster>
                <Button size="sm">Pequeno</Button>
                <Button>Médio</Button>
                <Button size="lg">Grande</Button>
                <Button iconStart="plus">Com ícone</Button>
                <Button loading>Salvando...</Button>
                <Button disabled>Desabilitado</Button>
                <ButtonLink href="/design-system" variant="outline" iconEnd="arrow-right">
                  Link
                </ButtonLink>
                <IconButton icon="edit" label="Editar" variant="outline" />
                <Tooltip text="Dica exibida em hover e foco">
                  {(describedBy) => (
                    <IconButton
                      icon="info"
                      label="Mais informações"
                      aria-describedby={describedBy}
                    />
                  )}
                </Tooltip>
              </Cluster>
            </Stack>
          </Card>
        </Section>

        <Section title="Campos de formulário" titleId="campos">
          <Card padding="lg">
            <Stack>
              <FieldRow>
                <Field label="Texto" htmlFor="ds-text" hint="Descrição do campo." required>
                  <Input
                    id="ds-text"
                    placeholder="Exemplo"
                    aria-describedby="ds-text-hint"
                    required
                  />
                </Field>
                <Field label="Com erro" htmlFor="ds-error" error="Informe um valor válido.">
                  <Input
                    id="ds-error"
                    defaultValue="valor inválido"
                    aria-invalid
                    aria-describedby="ds-error-error"
                  />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Desabilitado" htmlFor="ds-disabled">
                  <Input id="ds-disabled" defaultValue="Não editável" disabled />
                </Field>
                <Field label="Somente leitura" htmlFor="ds-readonly">
                  <Input id="ds-readonly" defaultValue="REG-0042" readOnly />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Seleção" htmlFor="ds-select">
                  <Select id="ds-select" defaultValue="">
                    <option value="">Selecione</option>
                    <option value="1">Opção 1</option>
                    <option value="2">Opção 2</option>
                  </Select>
                </Field>
                <Field label="Data" htmlFor="ds-date">
                  <DateInput id="ds-date" />
                </Field>
              </FieldRow>
              <Field label="Busca" htmlFor="ds-search">
                <SearchInput id="ds-search" placeholder="Buscar" />
              </Field>
              <Field label="Texto longo" htmlFor="ds-textarea" optional>
                <Textarea id="ds-textarea" rows={3} />
              </Field>
              <Stack gap={1}>
                <Checkbox label="Caixa de seleção" description="Com descrição de apoio." />
                <Radio name="ds-radio" label="Opção A" defaultChecked />
                <Radio name="ds-radio" label="Opção B" />
                <Switch label="Interruptor" description="Efeito imediato." defaultChecked />
              </Stack>
            </Stack>
          </Card>
        </Section>

        <Section title="Feedback" titleId="feedback">
          <Stack>
            <Alert tone="info" title="Informação">
              Aviso neutro que orienta a próxima ação.
            </Alert>
            <Alert tone="success">Operação concluída.</Alert>
            <Alert tone="warning" title="Atenção">
              Algo precisa de você antes de continuar.
            </Alert>
            <Alert tone="error">Não foi possível salvar. Tente novamente.</Alert>
            <Cluster>
              <Badge>Neutro</Badge>
              <Badge tone="primary">Primário</Badge>
              <Badge tone="accent">Destaque</Badge>
              <Badge tone="success" icon="check">
                Sucesso
              </Badge>
              <Badge tone="warning">Atenção</Badge>
              <Badge tone="error">Erro</Badge>
              <Badge tone="info">Informação</Badge>
            </Cluster>
            <Card padding="lg">
              <Stack>
                <Spinner showLabel />
                <Progress label="Enviando arquivos" value={2} max={5} valueText="2 de 5" />
                <Skeleton variant="title" />
                <Skeleton lines={3} />
              </Stack>
            </Card>
            <Grid columns="lg">
              <EmptyState
                title="Nada por aqui ainda"
                description="Explique o que aparece nesta área e ofereça o primeiro passo."
                action={<Button iconStart="plus">Criar o primeiro</Button>}
              />
              <ErrorState
                role="group"
                title="Não foi possível carregar"
                description="Diga que nada foi perdido e ofereça nova tentativa."
                action={
                  <Button variant="outline" iconStart="refresh">
                    Tentar novamente
                  </Button>
                }
              />
            </Grid>
          </Stack>
        </Section>

        <Section title="Dados" titleId="dados">
          <Grid columns="lg">
            <Card padding="lg">
              <DescriptionList
                layout="inline"
                items={[
                  { term: 'Responsável', detail: 'Ana Lima' },
                  { term: 'Atualizado em', detail: '02/10/2026' },
                ]}
              />
            </Card>
            <StatCard label="Registros ativos" value="128" hint="+12 neste mês" icon="package" />
            <MediaFrame ratio="wide" rounded />
          </Grid>
        </Section>

        <Section title="Navegação" titleId="navegacao">
          <Card padding="lg">
            <Stack>
              <Breadcrumb
                items={[
                  { label: 'Início', href: '/design-system' },
                  { label: 'Registros', href: '/design-system/lista' },
                  { label: 'REG-0042' },
                ]}
              />
              <Stepper
                label="Etapas de exemplo"
                steps={['Dados', 'Revisão', 'Conclusão']}
                current={2}
              />
              <Divider>ou</Divider>
              <Pagination
                label="Paginação de exemplo"
                previous={{ href: '/design-system' }}
                next={{ href: '/design-system' }}
                status="Página 2 de 5"
              />
            </Stack>
          </Card>
        </Section>

        <Section title="Overlays e recolhíveis" titleId="overlays">
          <Stack>
            <OverlayDemo />
            <div>
              <Accordion title="Conteúdo recolhível" name="ds-accordion">
                Usa details nativo: funciona sem JavaScript e com teclado.
              </Accordion>
              <Accordion title="Outro item" name="ds-accordion">
                Com o mesmo nome, só um item fica aberto por vez.
              </Accordion>
            </div>
          </Stack>
        </Section>
      </Stack>
    </PageContainer>
  );
}
