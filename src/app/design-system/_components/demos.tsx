'use client';

import { useState } from 'react';
import { Alert, useToast } from '@/components/feedback';
import {
  Checkbox,
  describedBy,
  Field,
  FieldRow,
  Fieldset,
  FileUpload,
  Form,
  FormActions,
  Input,
  Radio,
  Select,
  Switch,
  Textarea,
} from '@/components/forms';
import { Cluster, Section, Stack } from '@/components/layout';
import { Dialog, Dropdown, Popover } from '@/components/overlay';
import { Button, ButtonLink, Card, Text } from '@/components/ui';

type DialogVariant = 'modal' | 'drawer' | 'sheet';

/** Diálogo nas três apresentações, menu de ações, popover e toast. */
export function OverlayDemo() {
  const [variant, setVariant] = useState<DialogVariant | null>(null);
  const toast = useToast();

  return (
    <Cluster>
      <Button variant="outline" onClick={() => setVariant('modal')}>
        Abrir modal
      </Button>
      <Button variant="outline" onClick={() => setVariant('drawer')}>
        Abrir drawer
      </Button>
      <Button variant="outline" onClick={() => setVariant('sheet')}>
        Abrir sheet
      </Button>
      <Button variant="outline" onClick={() => toast.show('Alterações salvas.')}>
        Mostrar toast
      </Button>
      <Dropdown
        label="Mais ações"
        items={[
          { label: 'Editar', icon: 'edit', onSelect: () => toast.show('Editar selecionado.') },
          { label: 'Duplicar', icon: 'copy', onSelect: () => toast.show('Duplicar selecionado.') },
          {
            label: 'Excluir',
            icon: 'trash',
            danger: true,
            onSelect: () => toast.show('Excluir selecionado.', { tone: 'error' }),
          },
        ]}
      />
      <Popover label="Ajuda sobre este bloco">
        <Text size="small">Conteúdo livre ancorado ao botão. Fecha com Esc ou clique fora.</Text>
      </Popover>

      <Dialog
        open={variant !== null}
        variant={variant ?? 'modal'}
        onClose={() => setVariant(null)}
        title="Excluir registro?"
        description="Esta ação não pode ser desfeita."
        footer={
          <>
            <Button variant="danger" onClick={() => setVariant(null)}>
              Excluir
            </Button>
            <Button variant="outline" onClick={() => setVariant(null)}>
              Cancelar
            </Button>
          </>
        }
      >
        <Text tone="muted">
          No celular, todo diálogo aparece como folha inferior; em telas largas ele segue a
          apresentação escolhida.
        </Text>
      </Dialog>
    </Cluster>
  );
}

interface FormValues {
  name: string;
  email: string;
  category: string;
  notes: string;
}

type FormErrors = Partial<Record<keyof FormValues, string>>;

const EMPTY: FormValues = { name: '', email: '', category: '', notes: '' };

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (values.name.trim() === '') errors.name = 'Informe o nome.';
  if (!/^\S+@\S+\.\S+$/.test(values.email)) errors.email = 'Informe um e-mail válido.';
  if (values.category === '') errors.category = 'Selecione uma categoria.';
  return errors;
}

/**
 * Formulário-modelo: agrupamento, validação por campo, erro geral, estado de
 * salvamento e ações fixas no celular. O envio é simulado, sem servidor.
 */
export function TemplateForm() {
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const hasErrors = Object.keys(errors).length > 0;

  function set<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next = validate(values);
    setErrors(next);
    setSaved(false);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      setSaved(true);
    }, 900);
  }

  return (
    <Form noValidate onSubmit={handleSubmit}>
      {hasErrors && (
        <Alert tone="error" role="alert">
          Revise os campos destacados.
        </Alert>
      )}
      {saved && (
        <Alert tone="success" role="status">
          Registro salvo.
        </Alert>
      )}

      <Section title="Identificação" description="Dados principais do registro.">
        <Card padding="lg">
          <Stack>
            <Field label="Nome" htmlFor="tpl-name" required error={errors.name}>
              <Input
                id="tpl-name"
                name="name"
                required
                autoComplete="off"
                value={values.name}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={describedBy(errors.name && 'tpl-name-error')}
                onChange={(e) => set('name', e.target.value)}
              />
            </Field>
            <FieldRow>
              <Field
                label="E-mail"
                htmlFor="tpl-email"
                required
                hint="Usado só para avisos deste registro."
                error={errors.email}
              >
                <Input
                  id="tpl-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="nome@exemplo.com"
                  value={values.email}
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={describedBy(
                    'tpl-email-hint',
                    errors.email && 'tpl-email-error',
                  )}
                  onChange={(e) => set('email', e.target.value)}
                />
              </Field>
              <Field label="Categoria" htmlFor="tpl-category" required error={errors.category}>
                <Select
                  id="tpl-category"
                  name="category"
                  required
                  value={values.category}
                  aria-invalid={errors.category ? true : undefined}
                  aria-describedby={describedBy(errors.category && 'tpl-category-error')}
                  onChange={(e) => set('category', e.target.value)}
                >
                  <option value="">Selecione</option>
                  <option value="a">Categoria A</option>
                  <option value="b">Categoria B</option>
                </Select>
              </Field>
            </FieldRow>
            <Field label="Código" htmlFor="tpl-code" hint="Gerado pelo sistema.">
              <Input id="tpl-code" readOnly value="REG-0042" aria-describedby="tpl-code-hint" />
            </Field>
          </Stack>
        </Card>
      </Section>

      <Section title="Detalhes" description="Informações complementares.">
        <Card padding="lg">
          <Stack>
            <Field label="Observações" htmlFor="tpl-notes" optional>
              <Textarea
                id="tpl-notes"
                name="notes"
                value={values.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>
            <Fieldset legend="Visibilidade" hint="Quem pode ver este registro.">
              <Radio name="tpl-visibility" value="all" defaultChecked label="Todos" />
              <Radio
                name="tpl-visibility"
                value="team"
                label="Só a equipe"
                description="Pessoas de fora não encontram o registro."
              />
            </Fieldset>
            <FileUpload
              title="Adicionar anexos"
              description="PDF ou imagem, até 5 MB cada."
              accept="application/pdf,image/*"
              multiple
            />
            <Checkbox name="tpl-notify" label="Avisar os responsáveis ao salvar" />
            <Switch name="tpl-active" defaultChecked label="Registro ativo" />
          </Stack>
        </Card>
      </Section>

      <FormActions sticky>
        <Button type="submit" loading={saving} fullWidth>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        <ButtonLink href="/design-system/lista" variant="outline" fullWidth>
          Cancelar
        </ButtonLink>
      </FormActions>
    </Form>
  );
}

/** Preferência com efeito imediato e estado de salvamento por item. */
export function SettingSwitch({
  label,
  description,
  defaultChecked = false,
}: {
  label: string;
  description: string;
  defaultChecked?: boolean;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  return (
    <Switch
      label={label}
      description={saving ? 'Salvando...' : description}
      checked={checked}
      disabled={saving}
      onChange={(event) => {
        setChecked(event.target.checked);
        setSaving(true);
        window.setTimeout(() => {
          setSaving(false);
          toast.show('Preferência salva.');
        }, 600);
      }}
    />
  );
}
