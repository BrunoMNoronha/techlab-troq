'use client';

import { useEffect, useRef, useState } from 'react';
import { confirmEmailToken } from '@/modules/identity/actions';
import { PageContainer, PageHeader, Stack } from '@/components/layout';
import { Button, ButtonLink, Icon, Text } from '@/components/ui';
import { ResendVerificationForm } from './resend-form';

type Status = 'verifying' | 'success' | 'invalid' | 'expired' | 'error';

const FAILURE_TITLE: Record<Exclude<Status, 'verifying' | 'success'>, string> = {
  invalid: 'Link inválido ou já utilizado',
  expired: 'Este link expirou',
  error: 'Não foi possível confirmar agora',
};

/**
 * Le o token do FRAGMENTO do link (`#token=`) e o apaga da barra de endereco.
 * O fragmento nunca e enviado ao servidor nem entra no `Referer`, entao o
 * token nao chega aos logs de requisicao da plataforma (IC-9.1, IC-11.2); a
 * confirmacao leva o token no corpo da Server Action.
 */
function takeTokenFromFragment(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  return token;
}

export default function VerificarEmailPage() {
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  // O token e de uso unico: a confirmacao roda uma vez por montagem, mesmo que
  // o efeito seja reexecutado (modo estrito do React em desenvolvimento).
  const started = useRef(false);

  function confirm() {
    const current = token.current;
    if (!current) {
      setStatus('invalid');
      setMessage('Nenhum código de verificação foi informado.');
      return;
    }
    setStatus('verifying');
    confirmEmailToken(current).then((res) => {
      if (res.success) {
        setStatus('success');
        return;
      }
      setStatus(res.reason ?? 'error');
      setMessage(res.error ?? null);
    });
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    token.current = takeTokenFromFragment();
    // Fora do corpo sincrono do efeito, como as demais atualizacoes de estado.
    Promise.resolve().then(confirm);
  }, []);

  return (
    <PageContainer width="narrow">
      {status === 'verifying' && (
        <div role="status">
          <PageHeader
            title="Verificando e-mail..."
            description="Aguarde enquanto confirmamos seu link de verificação."
          />
        </div>
      )}

      {status === 'success' && (
        <Stack gap={6} role="status">
          <Text as="span" tone="success">
            <Icon name="check-circle" size={40} />
          </Text>
          <PageHeader
            title="E-mail verificado com sucesso!"
            description="Sua conta está confirmada. Entre com seu e-mail e senha para continuar."
          />
          <ButtonLink href="/login" reload fullWidth>
            Ir para o Login
          </ButtonLink>
        </Stack>
      )}

      {status !== 'verifying' && status !== 'success' && (
        <Stack gap={6}>
          <PageHeader
            title={<span role="alert">{FAILURE_TITLE[status]}</span>}
            description={message}
          />
          {status === 'error' ? (
            <Button type="button" onClick={confirm} iconStart="refresh" fullWidth>
              Tentar novamente
            </Button>
          ) : null}
          <ResendVerificationForm />
        </Stack>
      )}
    </PageContainer>
  );
}
