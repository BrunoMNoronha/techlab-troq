'use client';

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert } from '@/components/feedback';
import { FieldHint } from '@/components/forms';
import { Stack } from '@/components/layout';
import { Button, Divider } from '@/components/ui';
import type { GoogleRedirectResult } from '@/modules/identity/google-actions';
import { startGoogleSignIn } from '@/modules/identity/google-actions';

// Botao "Continuar com Google" (#81; identity-contract.md, IC-15). Os layouts
// de /login e /cadastro decidem no servidor se o Google esta configurado; sem
// configuracao valida o botao nao aparece e o login por senha segue igual.

const GoogleAvailabilityContext = createContext(false);

export function GoogleAvailability({
  available,
  children,
}: {
  available: boolean;
  children: ReactNode;
}) {
  return (
    <GoogleAvailabilityContext.Provider value={available}>
      {children}
    </GoogleAvailabilityContext.Provider>
  );
}

export function useGoogleAvailable(): boolean {
  return useContext(GoogleAvailabilityContext);
}

/**
 * Executa uma action que devolve a URL do Google e leva o navegador ate ela.
 * Enquanto redireciona, o botao fica ocupado; se a pessoa voltar pelo
 * historico (pagina restaurada do bfcache), o estado e liberado de novo.
 */
export function useGoogleRedirect(action: () => Promise<GoogleRedirectResult>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        inFlight.current = false;
        setPending(false);
      }
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  async function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setPending(true);
    let res: GoogleRedirectResult;
    try {
      res = await action();
    } catch {
      res = { success: false, error: 'Nao foi possivel falar com o servidor. Tente novamente.' };
    }
    if (res.success && res.redirectTo) {
      window.location.assign(res.redirectTo);
      return;
    }
    inFlight.current = false;
    setPending(false);
    setError(res.error ?? 'Nao foi possivel continuar com Google. Tente novamente.');
  }

  return { pending, error, run };
}

export function GoogleSignInButton({ returnTo, hint }: { returnTo?: string; hint?: string }) {
  const available = useGoogleAvailable();
  const errorId = useId();
  const hintId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const { pending, error, run } = useGoogleRedirect(() => startGoogleSignIn(returnTo));

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  if (!available) {
    return null;
  }

  return (
    <Stack gap={2}>
      <Button
        variant="outline"
        fullWidth
        onClick={run}
        loading={pending}
        disabled={pending}
        aria-busy={pending}
        aria-describedby={[hint ? hintId : '', error ? errorId : ''].join(' ').trim() || undefined}
      >
        {pending ? 'Abrindo o Google...' : 'Continuar com Google'}
      </Button>
      {hint && <FieldHint id={hintId}>{hint}</FieldHint>}
      {error && (
        <Alert id={errorId} ref={errorRef} tabIndex={-1} role="alert" tone="error">
          {error}
        </Alert>
      )}
    </Stack>
  );
}

/** Separador "ou" entre o formulario de senha e o botao do Google. */
export function GoogleDivider() {
  if (!useGoogleAvailable()) {
    return null;
  }
  return (
    <div aria-hidden="true">
      <Divider>ou</Divider>
    </div>
  );
}
