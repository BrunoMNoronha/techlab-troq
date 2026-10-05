import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTROLLER,
  PRIVACY_POLICY_VERSION,
} from '../_legal/legal-info';
import PrivacidadePage from './page';

describe('PrivacidadePage', () => {
  it('identifica o controlador, a versão e o canal de contato', () => {
    render(<PrivacidadePage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Política de Privacidade');
    expect(screen.getAllByText(new RegExp(LEGAL_CONTROLLER)).length).toBeGreaterThan(0);
    expect(screen.getByText(`Versão ${PRIVACY_POLICY_VERSION}`)).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: LEGAL_CONTACT_EMAIL })) {
      expect(link).toHaveAttribute('href', `mailto:${LEGAL_CONTACT_EMAIL}`);
    }
  });

  it('declara o uso limitado dos dados recebidos do Google', () => {
    render(<PrivacidadePage />);

    const google = screen.getByRole('region', { name: /Entrar com o Google/ });
    expect(google).toHaveTextContent(/Uso Limitado/);
    expect(
      within(google).getByRole('link', {
        name: /Política de Dados do Usuário dos Serviços de API do Google/,
      }),
    ).toHaveAttribute('href', 'https://developers.google.com/terms/api-services-user-data-policy');
    expect(google).toHaveTextContent(/não são usados para publicidade/);
  });

  it('cobre direitos do titular, cookies essenciais e prazos de retenção', () => {
    render(<PrivacidadePage />);

    expect(screen.getByRole('region', { name: /Seus direitos/ })).toHaveTextContent(/art\. 18/);
    expect(screen.getByRole('region', { name: /Cookies/ })).toHaveTextContent(
      /Não usamos cookies de publicidade/,
    );
    const retention = screen.getByRole('region', { name: /Por quanto tempo guardamos/ });
    expect(retention).toHaveTextContent(/Até 24 horas/);
    expect(retention).toHaveTextContent(/5 anos/);
  });

  it('tem sumário com âncora para cada seção', () => {
    render(<PrivacidadePage />);

    const toc = screen.getByRole('navigation', { name: 'Nesta página' });
    for (const link of within(toc).getAllByRole('link')) {
      const id = link.getAttribute('href')!.slice(1);
      expect(document.getElementById(id)).not.toBeNull();
    }
  });
});
