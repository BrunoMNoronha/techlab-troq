'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerOwnContact } from '@/modules/contact/actions';
import { Alert } from '@/components/feedback';
import { Field, Form, FormActions, Input } from '@/components/forms';
import { Section } from '@/components/layout';
import { Button, Card } from '@/components/ui';

// Cadastro e substituicao do proprio contato (contact-release.md, CR-2.5;
// F3-002, #92). A tela so sabe SE ha contato (`hasContact`), nunca o numero:
// nao ha valor inicial no campo e nenhum digito e exibido. O servidor normaliza
// e valida; a resposta e confirmacao ou erro de campo sem eco da entrada. O
// texto digitado so existe no estado deste navegador e e limpo ao salvar.

const FIELD_ID = 'contato-telefone';
const HINT_ID = 'contato-telefone-dica';
const ERROR_ID = 'contato-telefone-erro';

export function ContactForm({ hasContact }: { hasContact: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (attempt === 0) return;
    if (fieldError) inputRef.current?.focus();
    else if (formError) formErrorRef.current?.focus();
  }, [attempt, fieldError, formError]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;

    inFlight.current = true;
    setSubmitting(true);
    setFieldError(null);
    setFormError(null);
    setSaved(false);

    try {
      const res = await registerOwnContact({ phone });
      if (res.success) {
        setPhone('');
        setSaved(true);
        router.refresh();
      } else if (res.reason === 'login_required') {
        router.push('/login?motivo=sessao');
        return;
      } else if (res.fieldErrors) {
        setFieldError(res.fieldErrors.phone);
      } else {
        setFormError(res.error);
      }
    } catch {
      setFormError('Não foi possível salvar. Verifique sua conexão e tente novamente.');
    }

    inFlight.current = false;
    setSubmitting(false);
    setAttempt((n) => n + 1);
  }

  const registered = hasContact || saved;

  return (
    <Card>
      <Section
        title="Telefone ou WhatsApp"
        titleId="contato-titulo"
        description="Seu contato é protegido: ele não aparece nos seus anúncios e só é entregue a quem você escolher depois do pagamento aprovado. Sem contato cadastrado, seus anúncios não aceitam solicitações."
      >
        <Alert role="status" tone={registered ? 'success' : 'warning'}>
          {saved
            ? 'Contato salvo. Por segurança, o número não é exibido.'
            : registered
              ? 'Você tem um contato cadastrado. Por segurança, o número não é exibido.'
              : 'Você ainda não cadastrou um contato.'}
        </Alert>

        <Form onSubmit={handleSubmit} noValidate>
          <Field
            label={registered ? 'Novo telefone ou WhatsApp' : 'Telefone ou WhatsApp'}
            htmlFor={FIELD_ID}
            hint="Número brasileiro com DDD. Celular ou fixo."
            hintId={HINT_ID}
            error={fieldError}
            errorId={ERROR_ID}
          >
            <Input
              ref={inputRef}
              id={FIELD_ID}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${HINT_ID} ${ERROR_ID}` : HINT_ID}
            />
          </Field>
          {formError && (
            <Alert ref={formErrorRef} role="alert" tabIndex={-1} tone="error">
              {formError}
            </Alert>
          )}
          <FormActions>
            <Button type="submit" loading={submitting} fullWidth>
              {submitting ? 'Salvando...' : registered ? 'Substituir contato' : 'Cadastrar contato'}
            </Button>
          </FormActions>
        </Form>
      </Section>
    </Card>
  );
}
