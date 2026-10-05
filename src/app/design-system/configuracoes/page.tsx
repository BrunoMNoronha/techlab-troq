import { Field, Form, FormActions, Input } from '@/components/forms';
import { PageContainer, PageHeader, Section, Stack } from '@/components/layout';
import { BackLink, Tabs } from '@/components/navigation';
import { Button, Card, Divider } from '@/components/ui';
import { SettingSwitch } from '../_components/demos';

// Modelo de configurações: categorias em abas, preferências de efeito
// imediato em `Switch` e dados editáveis em formulário com ação própria.
export default function TemplateSettingsPage() {
  return (
    <PageContainer width="content">
      <PageHeader
        navigation={<BackLink href="/design-system">Design System</BackLink>}
        title="Configurações"
        description="Preferências da sua conta e da sua equipe."
      />

      <Tabs
        label="Categorias de configuração"
        tabs={[
          {
            id: 'perfil',
            label: 'Perfil',
            content: (
              <Section title="Dados do perfil" description="Como você aparece para a equipe.">
                <Card padding="lg">
                  <Form>
                    <Field label="Nome de exibição" htmlFor="cfg-name">
                      <Input
                        id="cfg-name"
                        name="name"
                        defaultValue="Ana Lima"
                        autoComplete="name"
                      />
                    </Field>
                    <Field
                      label="E-mail"
                      htmlFor="cfg-email"
                      hint="Para trocar o e-mail, fale com o suporte."
                    >
                      <Input
                        id="cfg-email"
                        type="email"
                        defaultValue="ana@exemplo.com"
                        disabled
                        aria-describedby="cfg-email-hint"
                      />
                    </Field>
                    <FormActions>
                      <Button type="submit">Salvar alterações</Button>
                    </FormActions>
                  </Form>
                </Card>
              </Section>
            ),
          },
          {
            id: 'avisos',
            label: 'Avisos',
            content: (
              <Section
                title="Avisos por e-mail"
                description="Cada preferência é salva assim que você altera."
              >
                <Card padding="lg">
                  <Stack gap={2}>
                    <SettingSwitch
                      label="Novos registros"
                      description="Quando alguém cria um registro na equipe."
                      defaultChecked
                    />
                    <Divider />
                    <SettingSwitch
                      label="Comentários"
                      description="Quando comentam em um registro seu."
                      defaultChecked
                    />
                    <Divider />
                    <SettingSwitch
                      label="Resumo semanal"
                      description="Um e-mail às segundas com o que mudou."
                    />
                  </Stack>
                </Card>
              </Section>
            ),
          },
          {
            id: 'seguranca',
            label: 'Segurança',
            content: (
              <Section title="Sessões" description="Encerre o acesso em outros aparelhos.">
                <Card padding="lg">
                  <FormActions>
                    <Button variant="dangerOutline" iconStart="log-out">
                      Sair de todos os aparelhos
                    </Button>
                  </FormActions>
                </Card>
              </Section>
            ),
          },
        ]}
      />
    </PageContainer>
  );
}
