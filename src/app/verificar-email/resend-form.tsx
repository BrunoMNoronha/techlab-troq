'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { resendVerificationToken } from '@/modules/identity/actions';
import { Alert } from '@/components/feedback';
import { Field, Form, FormActions, Input } from '@/components/forms';
import { Section } from '@/components/layout';
import { Button, Card } from '@/components/ui';

// Reenvio do e-mail de verificacao (identity-contract.md, IC-9.3). A mensagem
// de sucesso e generica e nao revela se o e-mail tem cadastro.
export function ResendVerificationForm({ initialEmail = '' }: { initialEmail?: string }) {
  const inputId = useId();
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Leva o foco a mensagem de resultado, para leitores de tela e teclado.
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setLoading(true);

    const res = await resendVerificationToken(email);
    setLoading(false);
    setFeedback(
      res.success
        ? { ok: true, text: res.message ?? '' }
        : { ok: false, text: res.error ?? 'Nao foi possivel enviar o e-mail agora.' },
    );
  }

  return (
    <Card variant="muted">
      <Section title="Solicitar novo link de verificação" gap={4}>
        <Form onSubmit={handleSubmit} aria-busy={loading}>
          <Field label="E-mail cadastrado" htmlFor={inputId}>
            <Input
              id={inputId}
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <FormActions>
            <Button type="submit" loading={loading} fullWidth>
              {loading ? 'Enviando...' : 'Reenviar e-mail'}
            </Button>
          </FormActions>
        </Form>
        {feedback && (
          <Alert
            ref={feedbackRef}
            tabIndex={-1}
            role={feedback.ok ? 'status' : 'alert'}
            tone={feedback.ok ? 'success' : 'error'}
          >
            {feedback.text}
          </Alert>
        )}
      </Section>
    </Card>
  );
}
